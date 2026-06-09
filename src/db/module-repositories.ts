import type { SQLiteDatabase } from 'expo-sqlite';

import { createId } from '../lib/id';
import type {
  Concert,
  Country,
  CountryRegion,
  Dose,
  Game,
  GameStatus,
  Idea,
  IdeaStatus,
  IdeaSubtask,
  PhysicalActivity,
  SleepEntry,
  Substance,
  SubstanceCategory,
} from './types';

type IdeaRow = {
  id: string;
  text: string;
  status: IdeaStatus;
  people_json: string;
  pinned: number;
  subtasks_json: string;
  tags_json: string;
  publish_date: string;
  created_at: number;
};

type SubstanceRow = {
  id: string;
  name: string;
  category: SubstanceCategory;
  first_tried: string;
  notes: string;
  created_at: number;
};

type DoseRow = {
  id: string;
  substance: string;
  dose: string;
  unit: string;
  route: string;
  datetime: string;
  cost: string;
  notes: string;
  feel: number;
  context_tags_json: string;
  session_id: string | null;
  created_at: number;
};

type SleepEntryRow = {
  id: string;
  date: string;
  bedtime: string;
  wake_time: string;
  quality: number;
  notes: string;
  created_at: number;
};

type PhysicalActivityRow = {
  id: string;
  date: string;
  activity_type: string;
  duration_minutes: number;
  intensity: number;
  notes: string;
  created_at: number;
};

type GameRow = {
  id: string;
  name: string;
  platform: string;
  status: GameStatus;
  rating: number;
  date: string;
  notes: string;
  created_at: number;
};

type CountryRow = {
  id: string;
  name: string;
  city: string;
  region: CountryRegion;
  rating: number;
  year: string;
  notes: string;
  created_at: number;
};

type ConcertRow = {
  id: string;
  name: string;
  venue: string;
  rating: number;
  date: string;
  notes: string;
  created_at: number;
};

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function parseIdeaSubtasks(value: string): IdeaSubtask[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return [];
      }

      const text = typeof entry.text === 'string' ? entry.text.trim() : '';
      if (!text) {
        return [];
      }

      return [
        {
          id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : createId('subtask'),
          text,
          done: entry.done === true,
        } satisfies IdeaSubtask,
      ];
    });
  } catch {
    return [];
  }
}

function sanitizeStringList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sanitizeIdeaStatus(value: string): IdeaStatus {
  return value === 'encours' || value === 'publie' ? value : 'explorer';
}

function sanitizeSubstanceCategory(value: string): SubstanceCategory {
  const validCategories: SubstanceCategory[] = [
    'stim',
    'stim_nps',
    'depr',
    'depr_nps',
    'opio',
    'opio_nps',
    'disso',
    'disso_nps',
    'canna',
    'canna_nps',
    'cathi',
    'cathi_nps',
    'psy',
    'psy_nps',
    'empath',
    'empath_nps',
  ];

  return (validCategories as string[]).includes(value) ? (value as SubstanceCategory) : 'autre';
}

function sanitizeGameStatus(value: string): GameStatus {
  return value === 'encours' || value === 'fini' || value === 'abandon' ? value : 'aplayer';
}

function sanitizeCountryRegion(value: string): CountryRegion {
  return value === 'europe' ||
    value === 'ameriques' ||
    value === 'asie' ||
    value === 'afrique' ||
    value === 'oceanie'
    ? value
    : 'autre';
}

function clampRating(value: number) {
  return Math.max(0, Math.min(5, Math.round(value)));
}

function clampFeel(value: number) {
  return Math.max(0, Math.min(5, Math.round(value)));
}

function clampScale(value: number) {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function sanitizeDay(value: string | undefined) {
  const fallback = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function sanitizeTime(value: string | undefined) {
  return value && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value) ? value : '';
}

function sanitizeDuration(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value ?? 0));
}

function sanitizeIdeaSubtasks(values: IdeaSubtask[]) {
  return values.flatMap((value) => {
    const text = value.text.trim();
    if (!text) {
      return [];
    }

    return [
      {
        id: value.id?.trim() || createId('subtask'),
        text,
        done: value.done,
      } satisfies IdeaSubtask,
    ];
  });
}

function mapIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    text: row.text,
    status: sanitizeIdeaStatus(row.status),
    people: parseStringArray(row.people_json),
    pinned: row.pinned === 1,
    subtasks: parseIdeaSubtasks(row.subtasks_json),
    tags: parseStringArray(row.tags_json),
    publishDate: row.publish_date,
    createdAt: row.created_at,
  };
}

function mapSubstance(row: SubstanceRow): Substance {
  return {
    id: row.id,
    name: row.name,
    category: sanitizeSubstanceCategory(row.category),
    firstTried: row.first_tried,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapDose(row: DoseRow): Dose {
  return {
    id: row.id,
    substance: row.substance,
    dose: row.dose,
    unit: row.unit,
    route: row.route,
    datetime: row.datetime,
    cost: row.cost,
    notes: row.notes,
    feel: clampFeel(row.feel),
    contextTags: parseStringArray(row.context_tags_json),
    sessionId: row.session_id,
    createdAt: row.created_at,
  };
}

function mapSleepEntry(row: SleepEntryRow): SleepEntry {
  return {
    id: row.id,
    date: sanitizeDay(row.date),
    bedtime: sanitizeTime(row.bedtime),
    wakeTime: sanitizeTime(row.wake_time),
    quality: clampScale(row.quality),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapPhysicalActivity(row: PhysicalActivityRow): PhysicalActivity {
  return {
    id: row.id,
    date: sanitizeDay(row.date),
    activityType: row.activity_type,
    durationMinutes: sanitizeDuration(row.duration_minutes),
    intensity: clampScale(row.intensity),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapGame(row: GameRow): Game {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    status: sanitizeGameStatus(row.status),
    rating: clampRating(row.rating),
    date: row.date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapCountry(row: CountryRow): Country {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    region: sanitizeCountryRegion(row.region),
    rating: clampRating(row.rating),
    year: row.year,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapConcert(row: ConcertRow): Concert {
  return {
    id: row.id,
    name: row.name,
    venue: row.venue,
    rating: clampRating(row.rating),
    date: row.date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function listIdeas(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<IdeaRow>(
    'SELECT * FROM ideas ORDER BY pinned DESC, created_at DESC, id DESC',
  );
  return rows.map(mapIdea);
}

export async function saveIdea(
  db: SQLiteDatabase,
  input: {
    id?: string;
    text: string;
    status: IdeaStatus;
    people?: string[];
    pinned?: boolean;
    subtasks?: IdeaSubtask[];
    tags?: string[];
    publishDate?: string;
    createdAt?: number;
  },
) {
  const text = input.text.trim();
  if (!text) {
    return null;
  }

  const idea: Idea = {
    id: input.id ?? createId('idea'),
    text,
    status: sanitizeIdeaStatus(input.status),
    people: sanitizeStringList(input.people ?? []),
    pinned: input.pinned === true,
    subtasks: sanitizeIdeaSubtasks(input.subtasks ?? []),
    tags: sanitizeStringList(input.tags ?? []),
    publishDate: input.publishDate?.trim() ?? '',
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO ideas (
      id,
      text,
      status,
      people_json,
      pinned,
      subtasks_json,
      tags_json,
      publish_date,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    idea.id,
    idea.text,
    idea.status,
    JSON.stringify(idea.people),
    idea.pinned ? 1 : 0,
    JSON.stringify(idea.subtasks),
    JSON.stringify(idea.tags),
    idea.publishDate,
    idea.createdAt,
  );

  return idea;
}

export async function deleteIdea(db: SQLiteDatabase, ideaId: string) {
  await db.runAsync('DELETE FROM ideas WHERE id = ?', ideaId);
}

const ideaStatusOrder: IdeaStatus[] = ['explorer', 'encours', 'publie'];

export async function cycleIdeaStatus(db: SQLiteDatabase, ideaId: string) {
  const row = await db.getFirstAsync<IdeaRow>('SELECT * FROM ideas WHERE id = ?', ideaId);
  if (!row) {
    return null;
  }

  const currentIndex = ideaStatusOrder.findIndex((status) => status === row.status);
  const nextStatus = ideaStatusOrder[(currentIndex + 1) % ideaStatusOrder.length];

  await db.runAsync('UPDATE ideas SET status = ? WHERE id = ?', nextStatus, ideaId);

  return mapIdea({
    ...row,
    status: nextStatus,
  });
}

export async function listSubstances(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<SubstanceRow>(
    'SELECT * FROM substances ORDER BY created_at DESC, name COLLATE NOCASE ASC',
  );
  return rows.map(mapSubstance);
}

export async function saveSubstance(
  db: SQLiteDatabase,
  input: {
    id?: string;
    name: string;
    category: SubstanceCategory;
    firstTried?: string;
    notes?: string;
    createdAt?: number;
  },
) {
  const name = input.name.trim();
  if (!name) {
    return null;
  }

  const substance: Substance = {
    id: input.id ?? createId('substance'),
    name,
    category: sanitizeSubstanceCategory(input.category),
    firstTried: input.firstTried?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO substances (
      id,
      name,
      category,
      first_tried,
      notes,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    substance.id,
    substance.name,
    substance.category,
    substance.firstTried,
    substance.notes,
    substance.createdAt,
  );

  return substance;
}

export async function ensureSubstance(
  db: SQLiteDatabase,
  input: { name: string; category: SubstanceCategory; firstTried?: string },
) {
  const name = input.name.trim();
  if (!name) {
    return null;
  }

  const substances = await listSubstances(db);
  const existing = substances.find((substance) => substance.name.toLowerCase() === name.toLowerCase());
  if (!existing) {
    return saveSubstance(db, {
      name,
      category: input.category,
      firstTried: input.firstTried,
    });
  }

  const nextCategory = existing.category === 'autre' ? input.category : existing.category;
  const nextFirstTried = existing.firstTried || input.firstTried?.trim() || '';

  return saveSubstance(db, {
    ...existing,
    category: nextCategory,
    firstTried: nextFirstTried,
  });
}

export async function deleteSubstance(db: SQLiteDatabase, substanceId: string) {
  await db.runAsync('DELETE FROM substances WHERE id = ?', substanceId);
}

export async function listDoses(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<DoseRow>(
    'SELECT * FROM doses ORDER BY datetime DESC, created_at DESC, id DESC',
  );
  return rows.map(mapDose);
}

export async function saveDose(
  db: SQLiteDatabase,
  input: {
    id?: string;
    substance: string;
    dose?: string;
    unit?: string;
    route?: string;
    datetime: string;
    cost?: string;
    notes?: string;
    feel?: number;
    contextTags?: string[];
    sessionId?: string | null;
    createdAt?: number;
  },
) {
  const substance = input.substance.trim();
  if (!substance) {
    return null;
  }

  const dose: Dose = {
    id: input.id ?? createId('dose'),
    substance,
    dose: input.dose?.trim() ?? '',
    unit: input.unit?.trim() ?? '',
    route: input.route?.trim() ?? '',
    datetime: input.datetime,
    cost: input.cost?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
    feel: clampFeel(input.feel ?? 0),
    contextTags: sanitizeStringList(input.contextTags ?? []),
    sessionId: input.sessionId ?? null,
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO doses (
      id,
      substance,
      dose,
      unit,
      route,
      datetime,
      cost,
      notes,
      feel,
      context_tags_json,
      session_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    dose.id,
    dose.substance,
    dose.dose,
    dose.unit,
    dose.route,
    dose.datetime,
    dose.cost,
    dose.notes,
    dose.feel,
    JSON.stringify(dose.contextTags),
    dose.sessionId,
    dose.createdAt,
  );

  return dose;
}

export async function deleteDose(db: SQLiteDatabase, doseId: string) {
  await db.runAsync('DELETE FROM doses WHERE id = ?', doseId);
}

export async function listSleepEntries(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<SleepEntryRow>(
    'SELECT * FROM sleep_entries ORDER BY date DESC, created_at DESC, id DESC',
  );
  return rows.map(mapSleepEntry);
}

export async function saveSleepEntry(
  db: SQLiteDatabase,
  input: {
    id?: string;
    date?: string;
    bedtime?: string;
    wakeTime?: string;
    quality?: number;
    notes?: string;
    createdAt?: number;
  },
) {
  const entry: SleepEntry = {
    id: input.id ?? createId('sleep'),
    date: sanitizeDay(input.date),
    bedtime: sanitizeTime(input.bedtime),
    wakeTime: sanitizeTime(input.wakeTime),
    quality: clampScale(input.quality ?? 3),
    notes: input.notes?.trim() ?? '',
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO sleep_entries (
      id,
      date,
      bedtime,
      wake_time,
      quality,
      notes,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.date,
    entry.bedtime,
    entry.wakeTime,
    entry.quality,
    entry.notes,
    entry.createdAt,
  );

  return entry;
}

export async function deleteSleepEntry(db: SQLiteDatabase, sleepEntryId: string) {
  await db.runAsync('DELETE FROM sleep_entries WHERE id = ?', sleepEntryId);
}

export async function listPhysicalActivities(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<PhysicalActivityRow>(
    'SELECT * FROM physical_activities ORDER BY date DESC, created_at DESC, id DESC',
  );
  return rows.map(mapPhysicalActivity);
}

export async function savePhysicalActivity(
  db: SQLiteDatabase,
  input: {
    id?: string;
    date?: string;
    activityType?: string;
    durationMinutes?: number;
    intensity?: number;
    notes?: string;
    createdAt?: number;
  },
) {
  const activityType = input.activityType?.trim() || 'Activite';
  const activity: PhysicalActivity = {
    id: input.id ?? createId('activity'),
    date: sanitizeDay(input.date),
    activityType,
    durationMinutes: sanitizeDuration(input.durationMinutes),
    intensity: clampScale(input.intensity ?? 3),
    notes: input.notes?.trim() ?? '',
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO physical_activities (
      id,
      date,
      activity_type,
      duration_minutes,
      intensity,
      notes,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    activity.id,
    activity.date,
    activity.activityType,
    activity.durationMinutes,
    activity.intensity,
    activity.notes,
    activity.createdAt,
  );

  return activity;
}

export async function deletePhysicalActivity(db: SQLiteDatabase, physicalActivityId: string) {
  await db.runAsync('DELETE FROM physical_activities WHERE id = ?', physicalActivityId);
}

export async function listGames(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<GameRow>(
    'SELECT * FROM games ORDER BY created_at DESC, name COLLATE NOCASE ASC',
  );
  return rows.map(mapGame);
}

export async function saveGame(
  db: SQLiteDatabase,
  input: {
    id?: string;
    name: string;
    platform?: string;
    status: GameStatus;
    rating?: number;
    date?: string;
    notes?: string;
    createdAt?: number;
  },
) {
  const name = input.name.trim();
  if (!name) {
    return null;
  }

  const game: Game = {
    id: input.id ?? createId('game'),
    name,
    platform: input.platform?.trim() ?? '',
    status: sanitizeGameStatus(input.status),
    rating: clampRating(input.rating ?? 0),
    date: input.date?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO games (
      id,
      name,
      platform,
      status,
      rating,
      date,
      notes,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    game.id,
    game.name,
    game.platform,
    game.status,
    game.rating,
    game.date,
    game.notes,
    game.createdAt,
  );

  return game;
}

export async function deleteGame(db: SQLiteDatabase, gameId: string) {
  await db.runAsync('DELETE FROM games WHERE id = ?', gameId);
}

export async function listCountries(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<CountryRow>(
    'SELECT * FROM countries ORDER BY created_at DESC, name COLLATE NOCASE ASC',
  );
  return rows.map(mapCountry);
}

export async function saveCountry(
  db: SQLiteDatabase,
  input: {
    id?: string;
    name: string;
    city?: string;
    region: CountryRegion;
    rating?: number;
    year?: string;
    notes?: string;
    createdAt?: number;
  },
) {
  const name = input.name.trim();
  if (!name) {
    return null;
  }

  const country: Country = {
    id: input.id ?? createId('country'),
    name,
    city: input.city?.trim() ?? '',
    region: sanitizeCountryRegion(input.region),
    rating: clampRating(input.rating ?? 0),
    year: input.year?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO countries (
      id,
      name,
      city,
      region,
      rating,
      year,
      notes,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    country.id,
    country.name,
    country.city,
    country.region,
    country.rating,
    country.year,
    country.notes,
    country.createdAt,
  );

  return country;
}

export async function deleteCountry(db: SQLiteDatabase, countryId: string) {
  await db.runAsync('DELETE FROM countries WHERE id = ?', countryId);
}

export async function listConcerts(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<ConcertRow>(
    'SELECT * FROM concerts ORDER BY created_at DESC, name COLLATE NOCASE ASC',
  );
  return rows.map(mapConcert);
}

export async function saveConcert(
  db: SQLiteDatabase,
  input: {
    id?: string;
    name: string;
    venue?: string;
    rating?: number;
    date?: string;
    notes?: string;
    createdAt?: number;
  },
) {
  const name = input.name.trim();
  if (!name) {
    return null;
  }

  const concert: Concert = {
    id: input.id ?? createId('concert'),
    name,
    venue: input.venue?.trim() ?? '',
    rating: clampRating(input.rating ?? 0),
    date: input.date?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO concerts (
      id,
      name,
      venue,
      rating,
      date,
      notes,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    concert.id,
    concert.name,
    concert.venue,
    concert.rating,
    concert.date,
    concert.notes,
    concert.createdAt,
  );

  return concert;
}

export async function deleteConcert(db: SQLiteDatabase, concertId: string) {
  await db.runAsync('DELETE FROM concerts WHERE id = ?', concertId);
}