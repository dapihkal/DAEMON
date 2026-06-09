import * as Crypto from 'expo-crypto';

// Polyfill global crypto for crypto-js or any library requiring synchronous secure random generator
const polyfillCrypto = () => {
  const getRandomValues = (array: any) => {
    if (!array) return array;
    const bytes = Crypto.getRandomBytes(array.byteLength);
    const uint8View = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    uint8View.set(bytes);
    return array;
  };

  const getCrypto = () => {
    if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto;
    const globalRef = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : null);
    if (globalRef && (globalRef as any).crypto) return (globalRef as any).crypto;
    return null;
  };

  const existingCrypto = getCrypto();
  if (existingCrypto) {
    if (typeof existingCrypto.getRandomValues !== 'function') {
      try {
        Object.defineProperty(existingCrypto, 'getRandomValues', {
          value: getRandomValues,
          configurable: true,
          writable: true,
        });
      } catch (e) {
        (existingCrypto as any).getRandomValues = getRandomValues;
      }
    }
  } else {
    const polyfilledCrypto = { getRandomValues };
    if (typeof globalThis !== 'undefined') (globalThis as any).crypto = polyfilledCrypto;
    if (typeof window !== 'undefined') (window as any).crypto = polyfilledCrypto;
  }
};

try {
  polyfillCrypto();
} catch (err) {
  console.warn('Failed to polyfill global crypto:', err);
}

import 'expo-router/entry';
