import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Extension du module traitements : horaires de prise multiples,
 * période de traitement (début / fin) et coche par prise (jour + horaire).
 *
 * Trois tables annexes, sans migration de la table `treatments` existante :
 * - treatment_times    : les créneaux horaires d'un traitement (08:00, 12:00, 20:00…)
 * - treatment_periods  : début / fin optionnels + activation des rappels
 * - treatment_intakes  : une ligne par prise effectuée (jour + horaire)
 *
 * À placer dans src/db/treatment-schedule.ts
 */

export type TreatmentExtras = {
  times: string[];
  startDate: string | null; // 'AAAA-MM-JJ'
  endDate: string | null; // 'AAAA-MM-JJ', null = durée indéterminée
  reminderEnabled: boolean;
  intakes: Set<string>; // clés intakeKey(day, time)
};

export const DEFAULT_TIME = '08:00';

export const intakeKey = (day: string, time: string) => `${day}|${time}`;

export function emptyExtras(): TreatmentExtras {
  return {
    times: [DEFAULT_TIME],
    startDate: null,
    endDate: null,
    reminderEnabled: false,
    intakes: new Set(),
  };
}

export async function ensureScheduleTables(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS treatment_times (
      treatment_id TEXT NOT NULL,
      time TEXT NOT NULL,
      PRIMARY KEY (treatment_id, time)
    );
    CREATE TABLE IF NOT EXISTS treatment_periods (
      treatment_id TEXT PRIMARY KEY,
      start_date TEXT,
      end_date TEXT,
      reminder_enabled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS treatment_intakes (
      treatment_id TEXT NOT NULL,
      day TEXT NOT NULL,
      time TEXT NOT NULL,
      PRIMARY KEY (treatment_id, day, time)
    );
  `);
}

/**
 * Migration douce des anciennes coches quotidiennes (Treatment.takenDays) :
 * chaque jour coché devient une prise sur le créneau par défaut.
 * Ne s'exécute qu'une fois par traitement (tant qu'aucune ligne de période n'existe).
 */
export async function migrateLegacyTreatment(
  db: SQLiteDatabase,
  params: { treatmentId: string; takenDays: string[] },
) {
  const existing = await db.getFirstAsync<{ treatment_id: string }>(
    'SELECT treatment_id FROM treatment_periods WHERE treatment_id = ?',
    params.treatmentId,
  );

  if (existing) {
    return;
  }

  await db.withTransactionAsync(async () => {
    for (const day of params.takenDays) {
      await db.runAsync(
        'INSERT OR IGNORE INTO treatment_intakes (treatment_id, day, time) VALUES (?, ?, ?)',
        params.treatmentId,
        day,
        DEFAULT_TIME,
      );
    }

    await db.runAsync(
      'INSERT OR IGNORE INTO treatment_periods (treatment_id, start_date, end_date, reminder_enabled) VALUES (?, NULL, NULL, 0)',
      params.treatmentId,
    );
  });
}

export async function getExtrasMap(db: SQLiteDatabase): Promise<Map<string, TreatmentExtras>> {
  const [timeRows, periodRows, intakeRows] = await Promise.all([
    db.getAllAsync<{ treatment_id: string; time: string }>(
      'SELECT treatment_id, time FROM treatment_times ORDER BY time ASC',
    ),
    db.getAllAsync<{
      treatment_id: string;
      start_date: string | null;
      end_date: string | null;
      reminder_enabled: number;
    }>('SELECT treatment_id, start_date, end_date, reminder_enabled FROM treatment_periods'),
    db.getAllAsync<{ treatment_id: string; day: string; time: string }>(
      'SELECT treatment_id, day, time FROM treatment_intakes',
    ),
  ]);

  const map = new Map<string, TreatmentExtras>();

  const ensure = (id: string) => {
    let extras = map.get(id);

    if (!extras) {
      extras = {
        times: [],
        startDate: null,
        endDate: null,
        reminderEnabled: false,
        intakes: new Set<string>(),
      };
      map.set(id, extras);
    }

    return extras;
  };

  for (const row of timeRows) {
    ensure(row.treatment_id).times.push(row.time);
  }

  for (const row of periodRows) {
    const extras = ensure(row.treatment_id);
    extras.startDate = row.start_date;
    extras.endDate = row.end_date;
    extras.reminderEnabled = row.reminder_enabled === 1;
  }

  for (const row of intakeRows) {
    ensure(row.treatment_id).intakes.add(intakeKey(row.day, row.time));
  }

  for (const extras of map.values()) {
    if (extras.times.length === 0) {
      extras.times = [DEFAULT_TIME];
    }
  }

  return map;
}

export async function saveSchedule(
  db: SQLiteDatabase,
  params: {
    treatmentId: string;
    times: string[];
    startDate: string | null;
    endDate: string | null;
    reminderEnabled: boolean;
  },
) {
  const times = [...new Set(params.times)].sort();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM treatment_times WHERE treatment_id = ?', params.treatmentId);

    for (const time of times) {
      await db.runAsync(
        'INSERT OR IGNORE INTO treatment_times (treatment_id, time) VALUES (?, ?)',
        params.treatmentId,
        time,
      );
    }

    await db.runAsync(
      `INSERT INTO treatment_periods (treatment_id, start_date, end_date, reminder_enabled)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(treatment_id) DO UPDATE SET
         start_date = excluded.start_date,
         end_date = excluded.end_date,
         reminder_enabled = excluded.reminder_enabled`,
      params.treatmentId,
      params.startDate,
      params.endDate,
      params.reminderEnabled ? 1 : 0,
    );

    if (times.length > 0) {
      const placeholders = times.map(() => '?').join(', ');

      await db.runAsync(
        `DELETE FROM treatment_intakes WHERE treatment_id = ? AND time NOT IN (${placeholders})`,
        params.treatmentId,
        ...times,
      );
    }
  });
}

export async function toggleIntake(
  db: SQLiteDatabase,
  params: { treatmentId: string; day: string; time: string },
) {
  const existing = await db.getFirstAsync<{ ok: number }>(
    'SELECT 1 AS ok FROM treatment_intakes WHERE treatment_id = ? AND day = ? AND time = ?',
    params.treatmentId,
    params.day,
    params.time,
  );

  if (existing) {
    await db.runAsync(
      'DELETE FROM treatment_intakes WHERE treatment_id = ? AND day = ? AND time = ?',
      params.treatmentId,
      params.day,
      params.time,
    );
  } else {
    await db.runAsync(
      'INSERT OR IGNORE INTO treatment_intakes (treatment_id, day, time) VALUES (?, ?, ?)',
      params.treatmentId,
      params.day,
      params.time,
    );
  }
}

/** Coche ou décoche toutes les prises d'une journée (utilisé par la rangée des 7 jours). */
export async function setDayIntakes(
  db: SQLiteDatabase,
  params: { treatmentId: string; day: string; times: string[]; taken: boolean },
) {
  await db.withTransactionAsync(async () => {
    if (params.taken) {
      for (const time of params.times) {
        await db.runAsync(
          'INSERT OR IGNORE INTO treatment_intakes (treatment_id, day, time) VALUES (?, ?, ?)',
          params.treatmentId,
          params.day,
          time,
        );
      }
    } else {
      await db.runAsync(
        'DELETE FROM treatment_intakes WHERE treatment_id = ? AND day = ?',
        params.treatmentId,
        params.day,
      );
    }
  });
}

export async function deleteSchedule(db: SQLiteDatabase, treatmentId: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM treatment_times WHERE treatment_id = ?', treatmentId);
    await db.runAsync('DELETE FROM treatment_periods WHERE treatment_id = ?', treatmentId);
    await db.runAsync('DELETE FROM treatment_intakes WHERE treatment_id = ?', treatmentId);
  });
}
