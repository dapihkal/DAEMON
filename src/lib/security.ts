import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  bytesToHex,
  createPinHashRecord,
  isLegacyPlainPin,
  isValidPinCode,
  parseStoredPinRecord,
  serializePinHashRecord,
  verifyPinAgainstRecord,
} from './pin-code';
import { getStoredPreferencesAsync, PREFERENCES_KEY } from './preferences';

const PIN_KEY = 'carnet.pin';
const PIN_ATTEMPTS_KEY = 'carnet.pin.failedAttempts';
const PIN_LOCK_UNTIL_KEY = 'carnet.pin.lockUntil';
const pinListeners = new Set<(pin: string | null) => void>();
const lockListeners = new Set<() => void>();

function emitPinChange(pin: string | null) {
  pinListeners.forEach((listener) => listener(pin));
}

export async function getStoredPinAsync() {
  const storedPin = await SecureStore.getItemAsync(PIN_KEY);
  return parseStoredPinRecord(storedPin) || isLegacyPlainPin(storedPin) ? storedPin : null;
}

async function getPinAttemptStateAsync() {
  const [rawAttempts, rawLockUntil] = await Promise.all([
    SecureStore.getItemAsync(PIN_ATTEMPTS_KEY),
    SecureStore.getItemAsync(PIN_LOCK_UNTIL_KEY),
  ]);
  const failedAttempts = rawAttempts ? Number.parseInt(rawAttempts, 10) : 0;
  const lockedUntil = rawLockUntil ? Number.parseInt(rawLockUntil, 10) : 0;

  return {
    failedAttempts: Number.isFinite(failedAttempts) ? Math.max(0, failedAttempts) : 0,
    lockedUntil: Number.isFinite(lockedUntil) ? Math.max(0, lockedUntil) : 0,
  };
}

async function clearPinAttemptStateAsync() {
  await Promise.all([
    SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(PIN_LOCK_UNTIL_KEY).catch(() => undefined),
  ]);
}

function getPinLockDelayMs(failedAttempts: number) {
  if (failedAttempts < 5) {
    return 0;
  }

  return Math.min(5 * 60_000, 15_000 * 2 ** Math.min(5, failedAttempts - 5));
}

async function recordPinFailureAsync() {
  const { failedAttempts } = await getPinAttemptStateAsync();
  const nextFailedAttempts = failedAttempts + 1;
  const lockDelayMs = getPinLockDelayMs(nextFailedAttempts);
  const lockedUntil = lockDelayMs ? Date.now() + lockDelayMs : 0;

  await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, String(nextFailedAttempts), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  if (lockedUntil) {
    await SecureStore.setItemAsync(PIN_LOCK_UNTIL_KEY, String(lockedUntil), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    await SecureStore.deleteItemAsync(PIN_LOCK_UNTIL_KEY).catch(() => undefined);
  }

  return {
    failedAttempts: nextFailedAttempts,
    lockedUntil,
  };
}

/**
 * Vérifie le code PIN.
 * NOTE : Seuls les échecs de code PIN manuel incrémentent le compteur d'auto-destruction.
 * Les échecs biométriques (FaceID/Empreinte) ne doivent JAMAIS appeler cette fonction
 * pour éviter d'effacer les données en cas de bug du capteur du téléphone.
 */
export async function verifyPinAsync(pin: string): Promise<{ ok: true } | { ok: false; lockedUntil: number; wiped?: boolean }> {
  const storedPin = await getStoredPinAsync();
  if (!storedPin) {
    return { ok: true };
  }

  const attemptState = await getPinAttemptStateAsync();
  if (attemptState.lockedUntil > Date.now()) {
    return { ok: false, lockedUntil: attemptState.lockedUntil };
  }

  const storedRecord = parseStoredPinRecord(storedPin);
  const verified = storedRecord
    ? verifyPinAgainstRecord(pin, storedRecord)
    : isLegacyPlainPin(storedPin) && pin === storedPin;

  if (verified) {
    await clearPinAttemptStateAsync();
    if (!storedRecord) {
      await savePinAsync(pin);
    }
    return { ok: true };
  }

  const nextAttemptState = await recordPinFailureAsync();
  const prefs = await getStoredPreferencesAsync();

  if (prefs.wipeDataAfterFailedAttempts && nextAttemptState.failedAttempts >= prefs.wipeDataAfterFailedAttempts) {
    // We don't have DB here, but we can signal back or handle it via a separate wipe trigger
    return { ok: false, lockedUntil: nextAttemptState.lockedUntil, wiped: true };
  }

  return { ok: false, lockedUntil: nextAttemptState.lockedUntil };
}

export function subscribeToPinChanges(listener: (pin: string | null) => void) {
  pinListeners.add(listener);

  return () => {
    pinListeners.delete(listener);
  };
}

export function subscribeToLockRequests(listener: () => void) {
  lockListeners.add(listener);

  return () => {
    lockListeners.delete(listener);
  };
}

export function requestAppLock() {
  lockListeners.forEach((listener) => listener());
}

export async function savePinAsync(pin: string) {
  if (!isValidPinCode(pin)) {
    throw new Error('PIN invalide.');
  }

  const saltHex = bytesToHex(Crypto.getRandomBytes(16));
  const record = createPinHashRecord(pin, saltHex);

  await SecureStore.setItemAsync(PIN_KEY, serializePinHashRecord(record), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  await clearPinAttemptStateAsync();

  emitPinChange(serializePinHashRecord(record));
}

export async function clearPinAsync() {
  await Promise.all([
    SecureStore.deleteItemAsync(PIN_KEY),
    clearPinAttemptStateAsync(),
  ]);
  emitPinChange(null);
}

export async function wipeAllDataAsync() {
  // 1. Delete PIN and attempts
  await clearPinAsync();

  // 2. Delete Preferences
  await SecureStore.deleteItemAsync(PREFERENCES_KEY).catch(() => undefined);

  // 3. Delete DB file (assuming default carnet.db)
  const dbFile = new File(Paths.document, 'SQLite/carnet.db');
  if (dbFile.exists) {
    await dbFile.delete();
  }

  // 4. Delete attachments directory
  const attachmentsDir = new Directory(Paths.document, 'attachments');
  if (attachmentsDir.exists) {
    await attachmentsDir.delete();
  }
}

export async function isBiometricsAvailableAsync() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

export async function authenticateWithBiometricsAsync(promptMessage = 'Authentification requise'): Promise<boolean> {
  const available = await isBiometricsAvailableAsync();
  if (!available) {
    return false;
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: 'Utiliser le code PIN',
    disableDeviceFallback: false,
    cancelLabel: 'Annuler',
  });

  return result.success;
}
