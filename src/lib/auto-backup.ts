import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { exportMobileBackup } from '../db/backup';

const AUTO_BACKUP_DIRECTORY = 'auto-backups';
const AUTO_BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_BACKUP_KEEP_COUNT = 4;
const FILE_PREFIX = 'carnet-auto-';

function listAutoBackupNames(directory: Directory) {
  return directory
    .list()
    .flatMap((entry) => (entry instanceof File && entry.name.startsWith(FILE_PREFIX) ? [entry.name] : []))
    .sort();
}

/**
 * Crée une copie de sécurité hebdomadaire silencieuse dans le stockage de l'app
 * (documents/auto-backups), en conservant les 4 dernières copies.
 */
export async function runAutoBackupIfDueAsync(db: SQLiteDatabase) {
  try {
    const directory = new Directory(Paths.document, AUTO_BACKUP_DIRECTORY);
    directory.create({ idempotent: true, intermediates: true });

    const existingNames = listAutoBackupNames(directory);
    const latestName = existingNames[existingNames.length - 1];

    if (latestName) {
      const latestDay = latestName.slice(FILE_PREFIX.length, FILE_PREFIX.length + 10);
      const elapsed = Date.now() - new Date(`${latestDay}T00:00:00`).getTime();

      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < AUTO_BACKUP_INTERVAL_MS) {
        return false;
      }
    }

    const backup = await exportMobileBackup(db);
    const todayKey = new Date().toISOString().slice(0, 10);
    const file = new File(directory, `${FILE_PREFIX}${todayKey}.json`);
    file.create({ overwrite: true, intermediates: true });
    file.write(JSON.stringify(backup));

    const namesAfterWrite = listAutoBackupNames(directory);
    const staleNames = namesAfterWrite.slice(0, Math.max(0, namesAfterWrite.length - AUTO_BACKUP_KEEP_COUNT));

    for (const staleName of staleNames) {
      try {
        new File(directory, staleName).delete();
      } catch {
        // Une copie obsolète non supprimable ne doit pas bloquer la sauvegarde.
      }
    }

    return true;
  } catch {
    return false;
  }
}
