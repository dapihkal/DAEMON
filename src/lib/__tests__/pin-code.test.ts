import { describe, expect, test } from 'vitest';

import {
  createPinHashRecord,
  isLegacyPlainPin,
  isValidPinCode,
  parseStoredPinRecord,
  serializePinHashRecord,
  verifyPinAgainstRecord,
} from '../pin-code';

describe('pin-code', () => {
  test('validates local PIN shape', () => {
    expect(isValidPinCode('1234')).toBe(true);
    expect(isValidPinCode('12345678')).toBe(true);
    expect(isValidPinCode('123')).toBe(false);
    expect(isValidPinCode('123456789')).toBe(false);
    expect(isValidPinCode('12a4')).toBe(false);
  });

  test('hashes and verifies a PIN without storing the plain value', () => {
    const record = createPinHashRecord('1234', '00112233445566778899aabbccddeeff');
    const serialized = serializePinHashRecord(record);
    const parsed = parseStoredPinRecord(serialized);

    expect(serialized).not.toContain('1234');
    expect(parsed).not.toBeNull();
    expect(parsed ? verifyPinAgainstRecord('1234', parsed) : false).toBe(true);
    expect(parsed ? verifyPinAgainstRecord('9999', parsed) : true).toBe(false);
  });

  test('recognizes legacy plain PINs for migration only', () => {
    expect(isLegacyPlainPin('1234')).toBe(true);
    expect(parseStoredPinRecord('1234')).toBeNull();
    expect(isLegacyPlainPin('{"format":"unknown"}')).toBe(false);
  });
});
