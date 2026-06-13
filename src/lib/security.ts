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

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const pinListeners = new Set<(pin: string | null) => void>();
const lockListeners = new Set<() => void>();
const wipeListeners = new Set<() => void>();

/**
 * Connexion SQLite active, enregistrée par le provider de base de données.
 * Indispensable pour fermer proprement la DB avant de supprimer ses fichiers,
 * sinon la suppression échoue (handle ouvert) ou corrompt le stockage.
 */
let activeDatabase: SQLiteDatabase | null = null;

export function registerActiveDatabase(db: SQLiteDatabase | null) {
  activeDatabase = db;
}

function emitPinChange(pin: string | null) {
  pinListeners.forEach((listener) => listener(pin));
}

export async function getStoredPinAsync() {
  const storedPin = await SecureStore.getItemAsync(PIN_KEY);
  if (!storedPin) {
    return null;
  }
  return parseStoredPinRecord(storedPin) || isLegacyPlainPin(storedPin) ? storedPin : null;
}

/** Comparaison en temps constant pour le chemin legacy (PIN stocké en clair). */
function constantTimeEquals(a: string, b: string) {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
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

/**
 * État exposé à l'UI de l'écran de verrouillage : nombre d'échecs,
 * fin du blocage temporaire, et tentatives restantes avant auto-destruction.
 */
export async function getPinSecurityStateAsync() {
  const [attemptState, prefs] = await Promise.all([
    getPinAttemptStateAsync(),
    getStoredPreferencesAsync(),
  ]);

  const wipeThreshold = prefs.wipeDataAfterFailedAttempts ?? null;

  return {
    failedAttempts: attemptState.failedAttempts,
    lockedUntil: attemptState.lockedUntil,
    attemptsBeforeWipe:
      wipeThreshold === null ? null : Math.max(0, wipeThreshold - attemptState.failedAttempts),
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

  await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, String(nextFailedAttempts), SECURE_STORE_OPTIONS);

  if (lockedUntil) {
    await SecureStore.setItemAsync(PIN_LOCK_UNTIL_KEY, String(lockedUntil), SECURE_STORE_OPTIONS);
  } else {
    await SecureStore.deleteItemAsync(PIN_LOCK_UNTIL_KEY).catch(() => undefined);
  }

  return {
    failedAttempts: nextFailedAttempts,
    lockedUntil,
  };
}

export type VerifyPinResult =
  | { ok: true }
  | { ok: false; lockedUntil: number; attemptsBeforeWipe: number | null; wiped: boolean };

/**
 * Vérifie le code PIN.
 * NOTE : Seuls les échecs de code PIN manuel incrémentent le compteur d'auto-destruction.
 * Les échecs biométriques (FaceID/Empreinte) ne doivent JAMAIS appeler cette fonction
 * pour éviter d'effacer les données en cas de bug du capteur du téléphone.
 */
export async function verifyPinAsync(pin: string): Promise<VerifyPinResult> {
  const storedPin = await getStoredPinAsync();
  if (!storedPin) {
    return { ok: true };
  }

  const attemptState = await getPinAttemptStateAsync();
  if (attemptState.lockedUntil > Date.now()) {
    // Pendant un blocage temporaire, la saisie n'est pas évaluée :
    // elle ne compte ni comme succès ni comme échec (pas d'incrément du compteur).
    const prefs = await getStoredPreferencesAsync();
    const threshold = prefs.wipeDataAfterFailedAttempts ?? null;
    return {
      ok: false,
      lockedUntil: attemptState.lockedUntil,
      attemptsBeforeWipe: threshold === null ? null : Math.max(0, threshold - attemptState.failedAttempts),
      wiped: false,
    };
  }

  const storedRecord = parseStoredPinRecord(storedPin);
  const verified = storedRecord
    ? verifyPinAgainstRecord(pin, storedRecord)
    : isLegacyPlainPin(storedPin) && constantTimeEquals(pin, storedPin);

  if (verified) {
    await clearPinAttemptStateAsync();
    if (!storedRecord) {
      // Migration silencieuse de l'ancien format (PIN en clair) vers le format haché+salé.
      await savePinAsync(pin).catch(() => undefined);
    }
    return { ok: true };
  }

  const nextAttemptState = await recordPinFailureAsync();
  const prefs = await getStoredPreferencesAsync();
  const threshold = prefs.wipeDataAfterFailedAttempts ?? null;

  if (threshold !== null && nextAttemptState.failedAttempts >= threshold) {
    // Seuil atteint : l'effacement est déclenché ICI, pas délégué à l'appelant.
    // (L'ancienne version se contentait de renvoyer wiped: true sans rien effacer.)
    await wipeAllDataAsync();
    return { ok: false, lockedUntil: 0, attemptsBeforeWipe: 0, wiped: true };
  }

  return {
    ok: false,
    lockedUntil: nextAttemptState.lockedUntil,
    attemptsBeforeWipe: threshold === null ? null : Math.max(0, threshold - nextAttemptState.failedAttempts),
    wiped: false,
  };
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

/** Notifié après un effacement complet, pour que l'app se remette dans un état vierge (navigation, caches en mémoire…). */
export function subscribeToWipe(listener: () => void) {
  wipeListeners.add(listener);

  return () => {
    wipeListeners.delete(listener);
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
  const serialized = serializePinHashRecord(record);

  await SecureStore.setItemAsync(PIN_KEY, serialized, SECURE_STORE_OPTIONS);
  await clearPinAttemptStateAsync();

  emitPinChange(serialized);
}

export async function clearPinAsync() {
  await Promise.all([
    SecureStore.deleteItemAsync(PIN_KEY),
    clearPinAttemptStateAsync(),
  ]);
  emitPinChange(null);
}

async function deleteIfExists(entry: File | Directory) {
  try {
    if (entry.exists) {
      await entry.delete();
    }
    return true;
  } catch (error) {
    console.warn('[security] Suppression échouée :', error);
    return false;
  }
}

export async function wipeAllDataAsync() {
  // 1. PIN et compteur de tentatives
  await clearPinAsync();

  // 2. Préférences
  await SecureStore.deleteItemAsync(PREFERENCES_KEY).catch(() => undefined);

  // 3. Fermer la DB avant de toucher à ses fichiers (handle ouvert = suppression
  //    impossible ou base corrompue, surtout en mode WAL).
  if (activeDatabase) {
    try {
      await activeDatabase.closeAsync();
    } catch {
      // Déjà fermée ou invalide : on continue, l'objectif est la suppression.
    }
    activeDatabase = null;
  }

  // 4. Fichiers SQLite : la base ET ses journaux WAL/SHM, qui contiennent
  //    des données non encore fusionnées dans le fichier principal.
  const dbDeleted = await deleteIfExists(new File(Paths.document, 'SQLite/carnet.db'));
  await deleteIfExists(new File(Paths.document, 'SQLite/carnet.db-wal'));
  await deleteIfExists(new File(Paths.document, 'SQLite/carnet.db-shm'));
  await deleteIfExists(new File(Paths.document, 'SQLite/carnet.db-journal'));

  // 5. Pièces jointes
  const attachmentsDeleted = await deleteIfExists(new Directory(Paths.document, 'attachments'));

  wipeListeners.forEach((listener) => listener());

  if (!dbDeleted || !attachmentsDeleted) {
    throw new Error('Effacement incomplet : certains fichiers n\'ont pas pu être supprimés.');
  }
}

export async function isBiometricsAvailableAsync() {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometricsAsync(promptMessage = 'Authentification requise'): Promise<boolean> {
  const available = await isBiometricsAvailableAsync();
  if (!available) {
    return false;
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Utiliser le code PIN',
      disableDeviceFallback: false,
      cancelLabel: 'Annuler',
    });
    return result.success;
  } catch {
    // Un crash du module biométrique ne doit jamais déverrouiller ni bloquer :
    // on retombe simplement sur la saisie du PIN.
    return false;
  }
}
