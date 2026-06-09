import * as CryptoJS from 'crypto-js';

const ENCRYPTED_BACKUP_FORMAT_V1 = 'carnet-mobile-encrypted-backup-v1';
const ENCRYPTED_BACKUP_FORMAT_V2 = 'carnet-mobile-encrypted-backup-v2';
const BACKUP_KDF_ITERATIONS = 15_000;

type JsonRecord = Record<string, unknown>;

export type EncryptedBackupEnvelopeV1 = {
  format: typeof ENCRYPTED_BACKUP_FORMAT_V1;
  exportedAt: string;
  algorithm: 'crypto-js-aes';
  payload: string;
};

export type EncryptedBackupEnvelopeV2 = {
  format: typeof ENCRYPTED_BACKUP_FORMAT_V2;
  exportedAt: string;
  algorithm: 'pbkdf2-sha256-aes-cbc-hmac-sha256';
  kdf: {
    iterations: number;
    saltHex: string;
  };
  ivHex: string;
  payload: string;
  macHex: string;
};

export type EncryptedBackupEnvelope = EncryptedBackupEnvelopeV1 | EncryptedBackupEnvelopeV2;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function randomHex(bytes: number) {
  return CryptoJS.lib.WordArray.random(bytes).toString(CryptoJS.enc.Hex);
}

function deriveKey(password: string, saltHex: string, iterations: number, purpose: 'encrypt' | 'auth') {
  return CryptoJS.PBKDF2(`${purpose}:${password}`, CryptoJS.enc.Hex.parse(saltHex), {
    hasher: CryptoJS.algo.SHA256,
    iterations,
    keySize: 256 / 32,
  });
}

function macPayload(input: Pick<EncryptedBackupEnvelopeV2, 'format' | 'ivHex' | 'payload'> & { iterations: number; saltHex: string }) {
  return [input.format, String(input.iterations), input.saltHex, input.ivHex, input.payload].join('.');
}

function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function assertEncryptedBackupV2(value: JsonRecord): EncryptedBackupEnvelopeV2 {
  const kdf = isRecord(value.kdf) ? value.kdf : null;
  if (
    value.format !== ENCRYPTED_BACKUP_FORMAT_V2 ||
    value.algorithm !== 'pbkdf2-sha256-aes-cbc-hmac-sha256' ||
    !kdf ||
    typeof kdf.iterations !== 'number' ||
    !Number.isFinite(kdf.iterations) ||
    kdf.iterations < 10_000 ||
    typeof kdf.saltHex !== 'string' ||
    !/^[a-f0-9]{32,}$/i.test(kdf.saltHex) ||
    typeof value.ivHex !== 'string' ||
    !/^[a-f0-9]{32}$/i.test(value.ivHex) ||
    typeof value.payload !== 'string' ||
    typeof value.macHex !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(value.macHex)
  ) {
    throw new Error('Sauvegarde chiffree illisible.');
  }

  return {
    format: ENCRYPTED_BACKUP_FORMAT_V2,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    algorithm: 'pbkdf2-sha256-aes-cbc-hmac-sha256',
    kdf: {
      iterations: Math.round(kdf.iterations),
      saltHex: kdf.saltHex.toLowerCase(),
    },
    ivHex: value.ivHex.toLowerCase(),
    payload: value.payload,
    macHex: value.macHex.toLowerCase(),
  };
}

export function buildEncryptedExportPayload(payload: unknown, password: string): unknown | EncryptedBackupEnvelopeV2 {
  const trimmedPassword = password.trim();
  if (!trimmedPassword) {
    return payload;
  }

  const saltHex = randomHex(16);
  const ivHex = randomHex(16);
  const iterations = BACKUP_KDF_ITERATIONS;
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(payload), deriveKey(trimmedPassword, saltHex, iterations, 'encrypt'), {
    iv: CryptoJS.enc.Hex.parse(ivHex),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const envelopeWithoutMac = {
    format: ENCRYPTED_BACKUP_FORMAT_V2,
    exportedAt: new Date().toISOString(),
    algorithm: 'pbkdf2-sha256-aes-cbc-hmac-sha256',
    kdf: {
      iterations,
      saltHex,
    },
    ivHex,
    payload: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
  } satisfies Omit<EncryptedBackupEnvelopeV2, 'macHex'>;
  const macHex = CryptoJS.HmacSHA256(
    macPayload({
      format: envelopeWithoutMac.format,
      iterations,
      saltHex,
      ivHex,
      payload: envelopeWithoutMac.payload,
    }),
    deriveKey(trimmedPassword, saltHex, iterations, 'auth'),
  ).toString(CryptoJS.enc.Hex);

  return {
    ...envelopeWithoutMac,
    macHex,
  } satisfies EncryptedBackupEnvelopeV2;
}

export function unwrapEncryptedBackup(rawJson: string, password: string) {
  const parsed = JSON.parse(rawJson) as unknown;

  if (!isRecord(parsed)) {
    return { rawJson, encrypted: false };
  }

  if (parsed.format === ENCRYPTED_BACKUP_FORMAT_V1) {
    if (!password.trim()) {
      throw new Error('Entre le mot de passe de sauvegarde avant de previsualiser ce fichier chiffre.');
    }

    const payload = typeof parsed.payload === 'string' ? parsed.payload : '';
    const decrypted = CryptoJS.AES.decrypt(payload, password.trim()).toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      throw new Error('Mot de passe invalide ou sauvegarde chiffree illisible.');
    }

    JSON.parse(decrypted);
    return { rawJson: decrypted, encrypted: true };
  }

  if (parsed.format !== ENCRYPTED_BACKUP_FORMAT_V2) {
    return { rawJson, encrypted: false };
  }

  if (!password.trim()) {
    throw new Error('Entre le mot de passe de sauvegarde avant de previsualiser ce fichier chiffre.');
  }

  const envelope = assertEncryptedBackupV2(parsed);
  const expectedMacHex = CryptoJS.HmacSHA256(
    macPayload({
      format: envelope.format,
      iterations: envelope.kdf.iterations,
      saltHex: envelope.kdf.saltHex,
      ivHex: envelope.ivHex,
      payload: envelope.payload,
    }),
    deriveKey(password.trim(), envelope.kdf.saltHex, envelope.kdf.iterations, 'auth'),
  ).toString(CryptoJS.enc.Hex);

  if (!timingSafeEqual(expectedMacHex, envelope.macHex)) {
    throw new Error('Mot de passe invalide ou sauvegarde chiffree modifiee.');
  }

  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: CryptoJS.enc.Base64.parse(envelope.payload) } as CryptoJS.lib.CipherParams,
    deriveKey(password.trim(), envelope.kdf.saltHex, envelope.kdf.iterations, 'encrypt'),
    {
      iv: CryptoJS.enc.Hex.parse(envelope.ivHex),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  ).toString(CryptoJS.enc.Utf8);

  if (!decrypted) {
    throw new Error('Mot de passe invalide ou sauvegarde chiffree illisible.');
  }

  JSON.parse(decrypted);
  return { rawJson: decrypted, encrypted: true };
}
