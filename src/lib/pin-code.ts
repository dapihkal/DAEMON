import * as CryptoJS from 'crypto-js';

export const PIN_CODE_PATTERN = /^\d{4,8}$/;
export const PIN_HASH_FORMAT = 'carnet-pin-hash-v1';
export const PIN_HASH_ITERATIONS = 5_000;

type PinHashRecordInput = {
  format: typeof PIN_HASH_FORMAT;
  algorithm: 'pbkdf2-sha256';
  iterations: number;
  saltHex: string;
  hashHex: string;
};

export type PinHashRecord = PinHashRecordInput;

export function isValidPinCode(pin: string) {
  return PIN_CODE_PATTERN.test(pin);
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function derivePinHash(pin: string, saltHex: string, iterations: number) {
  return CryptoJS.PBKDF2(pin, CryptoJS.enc.Hex.parse(saltHex), {
    hasher: CryptoJS.algo.SHA256,
    iterations,
    keySize: 256 / 32,
  }).toString(CryptoJS.enc.Hex);
}

function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

export function createPinHashRecord(pin: string, saltHex: string): PinHashRecord {
  return {
    format: PIN_HASH_FORMAT,
    algorithm: 'pbkdf2-sha256',
    iterations: PIN_HASH_ITERATIONS,
    saltHex,
    hashHex: derivePinHash(pin, saltHex, PIN_HASH_ITERATIONS),
  };
}

export function serializePinHashRecord(record: PinHashRecord) {
  return JSON.stringify(record);
}

export function parseStoredPinRecord(value: string | null): PinHashRecord | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Partial<PinHashRecord>;
    if (
      record.format !== PIN_HASH_FORMAT ||
      record.algorithm !== 'pbkdf2-sha256' ||
      typeof record.iterations !== 'number' ||
      !Number.isFinite(record.iterations) ||
      record.iterations < 1_000 ||
      typeof record.saltHex !== 'string' ||
      !/^[a-f0-9]{32,}$/i.test(record.saltHex) ||
      typeof record.hashHex !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(record.hashHex)
    ) {
      return null;
    }

    return {
      format: PIN_HASH_FORMAT,
      algorithm: 'pbkdf2-sha256',
      iterations: Math.round(record.iterations),
      saltHex: record.saltHex.toLowerCase(),
      hashHex: record.hashHex.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function isLegacyPlainPin(value: string | null) {
  return typeof value === 'string' && isValidPinCode(value);
}

export function verifyPinAgainstRecord(pin: string, record: PinHashRecord) {
  const candidateHash = derivePinHash(pin, record.saltHex, record.iterations);
  return timingSafeEqual(candidateHash, record.hashHex);
}
