import { describe, expect, test } from 'vitest';

import { buildEncryptedExportPayload, unwrapEncryptedBackup } from '../backup-crypto';

describe('backup-crypto', () => {
  test('returns the payload unchanged without a password', () => {
    const payload = { format: 'carnet-mobile-backup-v1', notes: [{ id: 'note-1' }] };

    expect(buildEncryptedExportPayload(payload, '')).toBe(payload);
  });

  test('encrypts and decrypts a backup with authenticated v2 envelope', () => {
    const payload = {
      format: 'carnet-mobile-backup-v1',
      notes: [{ id: 'note-1', title: 'Note' }],
      attachments: [{ id: 'att-1', dataBase64: 'Zm9v' }],
    };
    const encrypted = buildEncryptedExportPayload(payload, 'secret');

    expect(encrypted).toMatchObject({
      format: 'carnet-mobile-encrypted-backup-v2',
      algorithm: 'pbkdf2-sha256-aes-cbc-hmac-sha256',
    });
    expect(JSON.stringify(encrypted)).not.toContain('note-1');

    const unwrapped = unwrapEncryptedBackup(JSON.stringify(encrypted), 'secret');
    expect(unwrapped.encrypted).toBe(true);
    expect(JSON.parse(unwrapped.rawJson)).toEqual(payload);
  }, 30_000);

  test('rejects wrong passwords and tampered encrypted payloads', () => {
    const encrypted = buildEncryptedExportPayload({ notes: [{ id: 'note-1' }] }, 'secret');

    expect(() => unwrapEncryptedBackup(JSON.stringify(encrypted), 'wrong')).toThrow(/Mot de passe/);

    const tampered = {
      ...(encrypted as Record<string, unknown>),
      payload: `${(encrypted as { payload: string }).payload.slice(0, -2)}aa`,
    };

    expect(() => unwrapEncryptedBackup(JSON.stringify(tampered), 'secret')).toThrow(/modifiee/);
  }, 30_000);
});
