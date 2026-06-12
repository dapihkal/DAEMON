import type { SQLiteDatabase } from 'expo-sqlite';
import { Directory, EncodingType, File, Paths } from 'expo-file-system';

import { createId } from '../lib/id';
import { mergePersonCategoryDefinitions, normalizePersonCategoryDefinition, sanitizePersonCategoryId } from '../lib/person-categories';
import { getStoredPreferencesAsync, sanitizeAppPreferences } from '../lib/preferences';
import { buildEncryptedExportPayload } from '../lib/backup-crypto';
import {
  listActivityLog,
  listEntityAttachments,
  listEntityLinks,
  listEntityTags,
  listSavedViews,
  replaceCrossData,
} from './cross-repositories';
import {
  listConcerts,
  listCountries,
  listDoses,
  listGames,
  listIdeas,
  listPhysicalActivities,
  listSleepEntries,
  listSubstances,
} from './module-repositories';
import {
  getChecklist,
  listBooks,
  listChecklists,
  listJournalEntries,
  listNotes,
  listObjectives,
  listPeople,
  listPersonCategories,
  listProjects,
  listReminders,
  listRoutines,
  listTemplates,
  listTreatments,
  listTimelineEntries,
} from './repositories';
import type {
  AppPreferences,
  ActivityLogEntry,
  BackupBook,
  BackupChecklist,
  BackupEntityAttachment,
  BackupImportResult,
  BackupJournalEntry,
  BackupObjective,
  BackupPerson,
  BackupPersonCategory,
  BackupConcert,
  BackupCountry,
  BackupDose,
  BackupGame,
  BackupIdea,
  BackupPhysicalActivity,
  BackupProject,
  BackupReminder,
  BackupSleepEntry,
  BackupTemplate,
  BackupTimelineEntry,
  BackupTreatment,
  ChecklistItem,
  JournalEntry,
  BackupSubstance,
  MobileBackup,
  Note,
  Objective,
  ObjectiveEvent,
  Concert,
  Country,
  Dose,
  EntityKind,
  EntityAttachment,
  EntityLink,
  EntityTag,
  Game,
  Idea,
  IdeaSubtask,
  PhysicalActivity,
  PersonContactFrequency,
  PersonLink,
  PersonLinkStrength,
  PersonProfile,
  PersonRelationshipStatus,
  PersonCategory,
  ProjectStatus,
  ReminderCategory,
  ReminderRepeatRule,
  Routine,
  SavedView,
  SleepEntry,
  Substance,
  Template,
  TimelineEntry,
} from './types';

type JsonRecord = Record<string, unknown>;

const ATTACHMENTS_DIRECTORY_NAME = 'attachments';

type LegacyBackup = {
  prefs?: {
    theme?: unknown;
    accent?: unknown;
    pin?: string;
    routines?: {
      treatment?: { on?: boolean; time?: string };
      mood?: { on?: boolean; time?: string };
    };
  };
  notes?: unknown[];
  reminders?: unknown[];
  lists?: unknown[];
  ideas?: unknown[];
  people?: unknown[];
  projects?: unknown[];
  templates?: unknown[];
  journal?: unknown[];
  goals?: unknown[];
  timeline?: unknown[];
  doses?: unknown[];
  substances?: unknown[];
  sleepEntries?: unknown[];
  physicalActivities?: unknown[];
  games?: unknown[];
  books?: unknown[];
  countries?: unknown[];
  concerts?: unknown[];
  treatment?: unknown;
};

type NormalizedBackup = {
  source: BackupImportResult['source'];
  personCategories: BackupPersonCategory[];
  notes: Note[];
  lists: BackupChecklist[];
  people: BackupPerson[];
  projects: BackupProject[];
  reminders: BackupReminder[];
  routines: Routine[];
  ideas: BackupIdea[];
  templates: BackupTemplate[];
  doses: BackupDose[];
  substances: BackupSubstance[];
  sleepEntries: BackupSleepEntry[];
  physicalActivities: BackupPhysicalActivity[];
  books: BackupBook[];
  games: BackupGame[];
  countries: BackupCountry[];
  concerts: BackupConcert[];
  treatments: BackupTreatment[];
  journal: BackupJournalEntry[];
  goals: BackupObjective[];
  timeline: BackupTimelineEntry[];
  links: EntityLink[];
  entityTags: EntityTag[];
  attachments: BackupEntityAttachment[];
  savedViews: SavedView[];
  activityLog: ActivityLogEntry[];
  importedPreferences: AppPreferences | null;
  importedPin: string | null;
  unsupportedSections: BackupImportResult['unsupportedSections'];
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeFileName(value: string) {
  return value.trim().replace(/[^a-z0-9._-]+/gi, '_') || 'piece-jointe';
}

function buildAttachmentFileName(input: { id: string; fileName?: string; name: string }) {
  const fileName = sanitizeFileName(input.fileName || input.name);
  return fileName.startsWith(`${input.id}-`) ? fileName : `${input.id}-${fileName}`;
}

async function exportAttachmentFile(attachment: EntityAttachment): Promise<BackupEntityAttachment | null> {
  try {
    const sourceFile = new File(attachment.fileUri);
    if (!sourceFile.exists) {
      return null;
    }

    return {
      id: attachment.id,
      entityKind: attachment.entityKind,
      entityId: attachment.entityId,
      name: attachment.name,
      mimeType: attachment.mimeType,
      fileName: buildAttachmentFileName({ id: attachment.id, name: attachment.name }),
      size: attachment.size || sourceFile.size || 0,
      createdAt: attachment.createdAt,
    } satisfies BackupEntityAttachment;
  } catch {
    return null;
  }
}

async function resetAttachmentsDirectoryAsync() {
  const attachmentsDirectory = new Directory(Paths.document, ATTACHMENTS_DIRECTORY_NAME);

  if (attachmentsDirectory.exists) {
    attachmentsDirectory.delete();
  }

  attachmentsDirectory.create({ idempotent: true, intermediates: true });
  return attachmentsDirectory;
}

async function restoreBackupAttachments(db: SQLiteDatabase, attachments: BackupEntityAttachment[]) {
  let restoredCount = 0;
  let failureCount = 0;
  let attachmentsDirectory: Directory;

  try {
    attachmentsDirectory = await resetAttachmentsDirectoryAsync();
  } catch {
    return { restoredCount, failureCount: attachments.length };
  }

  for (const attachment of attachments) {
    try {
      const targetFile = new File(attachmentsDirectory, buildAttachmentFileName(attachment));
      targetFile.create({ overwrite: true, intermediates: true });
      if (attachment.dataBase64) { targetFile.write(attachment.dataBase64, { encoding: EncodingType.Base64 }); }

      await db.runAsync(
        `INSERT OR REPLACE INTO entity_attachments (id, entity_kind, entity_id, name, mime_type, file_uri, size, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        attachment.id,
        attachment.entityKind,
        attachment.entityId,
        attachment.name,
        attachment.mimeType,
        targetFile.uri,
        attachment.size,
        attachment.createdAt,
      );

      restoredCount += 1;
    } catch {
      failureCount += 1;
    }
  }

  return { restoredCount, failureCount };
}

function sanitizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
}

function normalizeLegacyListItem(entry: unknown, index: number): ChecklistItem | null {
  if (!isRecord(entry)) {
    return null;
  }

  const text = asString(entry.text, '').trim();
  if (!text) {
    return null;
  }

  return {
    id: asString(entry.id, createId('item')),
    text,
    done: asBoolean(entry.done, false),
    position: index,
  };
}

function sanitizePersonCategory(value: unknown): PersonCategory {
  return sanitizePersonCategoryId(value);
}

function sanitizeProjectStatus(value: unknown): ProjectStatus {
  return value === 'encours' || value === 'termine' ? value : 'prospect';
}

function sanitizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return [...new Set(value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean))];
  }

  if (typeof value === 'string') {
    return [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
  }

  return [] as string[];
}

function sanitizePersonLinkStrength(value: unknown): PersonLinkStrength {
  return value === 3 ? 3 : value === 2 ? 2 : 1;
}

function sanitizePersonLinks(value: unknown): PersonLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const linksById = new Map<string, PersonLink>();

  value.forEach((entry) => {
    if (typeof entry === 'string') {
      const personId = entry.trim();
      if (!personId) {
        return;
      }

      linksById.set(personId, { personId, strength: 1 });
      return;
    }

    if (!isRecord(entry)) {
      return;
    }

    const personId = asString(entry.personId, '').trim();
    if (!personId) {
      return;
    }

    linksById.set(personId, {
      personId,
      strength: sanitizePersonLinkStrength(entry.strength),
    });
  });

  return [...linksById.values()];
}

function normalizePersonCategories(value: unknown, people: BackupPerson[]) {
  const explicitCategories = Array.isArray(value)
    ? value.flatMap((entry, index) => {
        const category = normalizePersonCategoryDefinition(entry, index);
        return category ? [category] : [];
      })
    : [];
  const usedCategoryIds = people.flatMap((person) => [person.category, ...person.secondaryCategories]);

  return mergePersonCategoryDefinitions(explicitCategories, usedCategoryIds);
}

function sanitizeContactFrequency(value: unknown): PersonContactFrequency {
  return value === 'weekly' || value === 'monthly' || value === 'quarterly' || value === 'yearly' ? value : 'none';
}

function sanitizeRelationshipStatus(value: unknown): PersonRelationshipStatus {
  return value === 'proche' || value === 'fragile' || value === 'distant' || value === 'complique' ? value : 'stable';
}

function sanitizePersonProfile(value: unknown): PersonProfile {
  const emptyProfile: PersonProfile = {
    nickname: '',
    pronouns: '',
    memories: '',
    places: '',
    giftIdeas: '',
    avoidTopics: '',
    preferences: '',
    ourStory: '',
    affinityScore: 0,
    preferredActivities: '',
    sharedValues: '',
    frequentTopics: '',
    mutualSupport: '',
  };

  if (!isRecord(value)) {
    return emptyProfile;
  }

  return {
    nickname: asString(value.nickname, '').trim(),
    pronouns: asString(value.pronouns, '').trim(),
    memories: asString(value.memories, '').trim(),
    places: asString(value.places, '').trim(),
    giftIdeas: asString(value.giftIdeas, '').trim(),
    avoidTopics: asString(value.avoidTopics, '').trim(),
    preferences: asString(value.preferences, '').trim(),
    ourStory: asString(value.ourStory, '').trim(),
    affinityScore: asNumber(value.affinityScore, 0),
    preferredActivities: asString(value.preferredActivities, '').trim(),
    sharedValues: asString(value.sharedValues, '').trim(),
    frequentTopics: asString(value.frequentTopics, '').trim(),
    mutualSupport: asString(value.mutualSupport, '').trim(),
  };
}

function sanitizeRepeatRule(value: unknown): ReminderRepeatRule {
  return value === 'daily' || value === 'weekly' || value === 'monthly' ? value : 'none';
}

function sanitizeCategory(value: unknown): ReminderCategory {
  return value === 'famille' || value === 'amis' || value === 'date' || value === 'autre'
    ? value
    : 'rappel';
}

function sanitizeBookStatus(value: unknown): 'alire' | 'encours' | 'lu' | 'abandon' {
  return value === 'encours' || value === 'lu' || value === 'abandon' ? value : 'alire';
}

function sanitizeIdeaStatus(value: unknown): 'explorer' | 'encours' | 'publie' {
  return value === 'encours' || value === 'publie' ? value : 'explorer';
}

function sanitizeSubstanceCategory(value: unknown) {
  return value === 'stim' ||
    value === 'empath' ||
    value === 'psy' ||
    value === 'disso' ||
    value === 'depr' ||
    value === 'opio' ||
    value === 'canna'
    ? value
    : 'autre';
}

function sanitizeGameStatus(value: unknown): 'aplayer' | 'encours' | 'fini' | 'abandon' {
  return value === 'encours' || value === 'fini' || value === 'abandon' ? value : 'aplayer';
}

function sanitizeCountryRegion(value: unknown): 'europe' | 'ameriques' | 'asie' | 'afrique' | 'oceanie' | 'autre' {
  return value === 'europe' ||
    value === 'ameriques' ||
    value === 'asie' ||
    value === 'afrique' ||
    value === 'oceanie'
    ? value
    : 'autre';
}

function clampRating(value: unknown) {
  return Math.max(0, Math.min(5, asNumber(value, 0)));
}

function clampFeel(value: unknown) {
  return Math.max(0, Math.min(5, asNumber(value, 0)));
}

function clampScale(value: unknown) {
  return Math.max(1, Math.min(5, Math.round(asNumber(value, 3))));
}

function sanitizeDay(value: unknown, fallback: string) {
  const day = asString(value, '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : fallback;
}

function sanitizeTime(value: unknown) {
  const time = asString(value, '').trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) ? time : '';
}

function sanitizeDuration(value: unknown) {
  const duration = asNumber(value, 0);
  return Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
}

function normalizeIdeaSubtasks(value: unknown): IdeaSubtask[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const text = asString(entry.text, '').trim();
    if (!text) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('subtask')),
        text,
        done: asBoolean(entry.done, false),
      } satisfies IdeaSubtask,
    ];
  });
}

function sumObjectiveEvents(events: ObjectiveEvent[]) {
  return Math.max(0, Math.min(100, Math.round(events.reduce((total, event) => total + event.percent, 0))));
}

function normalizeObjectiveEvents(value: unknown, fallbackProgress: number): ObjectiveEvent[] {
  const sourceEvents = Array.isArray(value) ? value : [];
  const normalizedEvents = sourceEvents.flatMap((entry, index): ObjectiveEvent[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const title = asString(entry.title, '').trim();
    const percent = Math.max(0, Math.min(100, asNumber(entry.percent, 0)));
    if (!title && percent <= 0) {
      return [];
    }

    return [
      {
        id: asString(entry.id, `objective-event-${index}`),
        title: title || 'Événement',
        percent,
      },
    ];
  });

  if (!normalizedEvents.length && fallbackProgress > 0) {
    return [{ id: createId('objective-event'), title: 'Progression existante', percent: fallbackProgress }];
  }

  let usedProgress = 0;
  return normalizedEvents.map((event) => {
    const remainingProgress = Math.max(0, 100 - usedProgress);
    const percent = Math.min(remainingProgress, event.percent);
    usedProgress += percent;
    return { ...event, percent };
  });
}

function normalizeIdeas(value: unknown): Idea[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const text = asString(entry.text, '').trim();
    if (!text) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('idea')),
        text,
        status: sanitizeIdeaStatus(entry.status),
        people: sanitizeStringList(entry.people),
        pinned: asBoolean(entry.pin ?? entry.pinned, false),
        subtasks: normalizeIdeaSubtasks(entry.subtasks),
        tags: sanitizeStringList(entry.tags),
        publishDate: asString(entry.publishDate, ''),
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies Idea,
    ];
  });
}

function normalizeSubstances(value: unknown): Substance[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('substance')),
        name,
        category: sanitizeSubstanceCategory(entry.category),
        firstTried: asString(entry.firstTried, ''),
        notes: asString(entry.notes, ''),
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies Substance,
    ];
  });
}

function normalizeDoses(value: unknown): Dose[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const substance = asString(entry.substance, '').trim();
    if (!substance) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('dose')),
        substance,
        dose: asString(entry.dose, ''),
        unit: asString(entry.unit, ''),
        route: asString(entry.route, ''),
        datetime: sanitizeIsoDate(entry.datetime, new Date().toISOString()),
        cost: asString(entry.cost, ''),
        notes: asString(entry.notes, ''),
        feel: clampFeel(entry.feel),
        contextTags: sanitizeStringList(entry.ctags ?? entry.contextTags),
        sessionId: asString(entry.sessionId, '').trim() || null,
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies Dose,
    ];
  });
}

function normalizeSleepEntries(value: unknown): SleepEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const fallbackDay = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('sleep')),
        date: sanitizeDay(entry.date, fallbackDay),
        bedtime: sanitizeTime(entry.bedtime),
        wakeTime: sanitizeTime(entry.wakeTime),
        quality: clampScale(entry.quality),
        notes: asString(entry.notes, ''),
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies SleepEntry,
    ];
  });
}

function normalizePhysicalActivities(value: unknown): PhysicalActivity[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const fallbackDay = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const activityType = asString(entry.activityType, '').trim() || asString(entry.type, '').trim() || 'Activite';

    return [
      {
        id: asString(entry.id, createId('activity')),
        date: sanitizeDay(entry.date, fallbackDay),
        activityType,
        durationMinutes: sanitizeDuration(entry.durationMinutes),
        intensity: clampScale(entry.intensity),
        notes: asString(entry.notes, ''),
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies PhysicalActivity,
    ];
  });
}

function normalizeGames(value: unknown): Game[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('game')),
        name,
        platform: asString(entry.sub, asString(entry.platform, '')),
        status: sanitizeGameStatus(entry.status),
        rating: clampRating(entry.rating),
        date: asString(entry.date, ''),
        notes: asString(entry.notes, ''),
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies Game,
    ];
  });
}

function normalizeCountries(value: unknown): Country[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('country')),
        name,
        city: asString(entry.sub, asString(entry.city, '')),
        region: sanitizeCountryRegion(entry.status ?? entry.region),
        rating: clampRating(entry.rating),
        year: asString(entry.year, ''),
        notes: asString(entry.notes, ''),
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies Country,
    ];
  });
}

function normalizeConcerts(value: unknown): Concert[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('concert')),
        name,
        venue: asString(entry.sub, asString(entry.venue, '')),
        rating: clampRating(entry.rating),
        date: asString(entry.date, ''),
        notes: asString(entry.notes, ''),
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies Concert,
    ];
  });
}

function normalizeTreatment(value: unknown, index = 0): BackupTreatment | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawTakenDays = Array.isArray(value.takenDays)
    ? value.takenDays.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const rawLog = isRecord(value.log) ? value.log : null;
  const logTakenDays = rawLog
    ? Object.entries(rawLog).flatMap(([day, taken]) => (asBoolean(taken, false) ? [day] : []))
    : [];
  const takenDays = sanitizeStringList([...rawTakenDays, ...logTakenDays]).filter((day) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day),
  );
  const name = asString(value.name, '').trim();
  const dose = asString(value.dose, '').trim();

  if (!name && !dose && takenDays.length === 0) {
    return null;
  }

  return {
    id: asString(value.id, createId('treatment')),
    name,
    dose,
    takenDays,
    createdAt: asNumber(value.createdAt, Date.now() - index),
  };
}

function normalizeTreatments(value: unknown): BackupTreatment[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      const treatment = normalizeTreatment(entry, index);
      return treatment ? [treatment] : [];
    });
  }

  const treatment = normalizeTreatment(value);
  return treatment ? [treatment] : [];
}

function normalizeJournalEntries(value: unknown): JournalEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const date = asString(entry.date, '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return [];
    }

    return [
      {
        date,
        mood: Math.max(1, Math.min(5, asNumber(entry.mood, 3))),
        text: asString(entry.text, ''),
        tags: sanitizeStringList(entry.tags),
      } satisfies JournalEntry,
    ];
  });
}

function normalizeObjectives(value: unknown): Objective[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const title = asString(entry.title, '').trim();
    if (!title) {
      return [];
    }

    const fallbackProgress = Math.max(0, Math.min(100, asNumber(entry.progress, 0)));
    const events = normalizeObjectiveEvents(entry.events, fallbackProgress);

    return [
      {
        id: asString(entry.id, createId('goal')),
        title,
        scope: asString(entry.scope, 'perso') === 'pro' ? 'pro' : 'perso',
        deadline: asString(entry.deadline, ''),
        details: asString(entry.details, asString(entry.note, '')),
        events,
        progress: events.length ? sumObjectiveEvents(events) : fallbackProgress,
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies Objective,
    ];
  });
}

function normalizeTimelineEntries(value: unknown): TimelineEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const date = asString(entry.date, '').trim();
    const title = asString(entry.title, '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('timeline')),
        date,
        title,
        note: asString(entry.note, ''),
      } satisfies TimelineEntry,
    ];
  });
}

function sanitizeIsoDate(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeLegacyBackup(payload: LegacyBackup): NormalizedBackup {
  const now = Date.now();
  const fallbackIso = new Date(now).toISOString();
  const notes = (payload.notes ?? []).flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const title = asString(entry.title, '').trim() || 'Sans titre';
    const body = asString(entry.body, '');
    const note: Note = {
      id: asString(entry.id, createId('note')),
      title,
      body,
      tags: sanitizeTags(entry.tags),
      updatedAt: asNumber(entry.updatedAt, now - index),
      pinned: asBoolean(entry.pinned, false),
      archived: asBoolean(entry.archived, false),
    };

    return [note];
  });

  const reminders = (payload.reminders ?? []).flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const title = asString(entry.title, '').trim();
    if (!title) {
      return [];
    }

    const reminder: BackupReminder = {
      id: asString(entry.id, createId('rem')),
      title,
      scheduledFor: sanitizeIsoDate(entry.datetime, fallbackIso),
      status: 'scheduled',
      repeatRule: sanitizeRepeatRule(entry.recur),
      category: sanitizeCategory(entry.etype),
    };

    return [reminder];
  });

  const lists = (payload.lists ?? []).flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    const rawItems = Array.isArray(entry.items) ? entry.items : [];
    const items = rawItems.flatMap((item, itemIndex) => {
      const normalized = normalizeLegacyListItem(item, itemIndex);
      return normalized ? [normalized] : [];
    });

    return [
      {
        id: asString(entry.id, createId('list')),
        name,
        position: index,
        items,
      } satisfies BackupChecklist,
    ];
  });

  const people = (payload.people ?? []).flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('person')),
        name,
        category: sanitizePersonCategory(entry.category),
        secondaryCategories: sanitizeStringList(entry.secondaryCategories).map(sanitizePersonCategory),
        photoUri: asString(entry.photoUri, ''),
        favorite: asBoolean(entry.favorite, false),
        note: asString(entry.note, ''),
        birthday: asString(entry.bday, ''),
        phone: asString(entry.phone, ''),
        address: asString(entry.address, ''),
        lastContactedAt: asString(entry.lastContactedAt, ''),
        contactFrequency: sanitizeContactFrequency(entry.contactFrequency),
        relationshipStatus: sanitizeRelationshipStatus(entry.relationshipStatus),
        interests: sanitizeStringList(entry.interests),
        tags: sanitizeStringList(entry.tags),
        links: sanitizePersonLinks(entry.links),
        profile: sanitizePersonProfile(entry.profile),
      } satisfies BackupPerson,
    ];
  });

  const projects = (payload.projects ?? []).flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('project')),
        name,
        status: sanitizeProjectStatus(entry.status),
        deadline: asString(entry.deadline, ''),
        people: sanitizeStringList(entry.people),
        notes: asString(entry.notes, ''),
        tags: sanitizeStringList(entry.tags),
        createdAt: asNumber(entry.createdAt, now - index),
      } satisfies BackupProject,
    ];
  });

  const routinesConfig = isRecord(payload.prefs?.routines) ? payload.prefs?.routines : undefined;
  const treatmentConfig = isRecord(routinesConfig?.treatment) ? routinesConfig.treatment : undefined;
  const moodConfig = isRecord(routinesConfig?.mood) ? routinesConfig.mood : undefined;

  const routines: Routine[] = [
    {
      key: 'treatment',
      label: 'Prendre le traitement',
      enabled: asBoolean(treatmentConfig?.on, false),
      time: asString(treatmentConfig?.time, '08:00') || '08:00',
    },
    {
      key: 'mood',
      label: 'Noter son humeur',
      enabled: asBoolean(moodConfig?.on, false),
      time: asString(moodConfig?.time, '21:30') || '21:30',
    },
  ];
  const ideas = normalizeIdeas(payload.ideas);
  const substances = normalizeSubstances(payload.substances);
  const doses = normalizeDoses(payload.doses);
  const sleepEntries = normalizeSleepEntries(payload.sleepEntries);
  const physicalActivities = normalizePhysicalActivities(payload.physicalActivities);
  const treatments = normalizeTreatments(payload.treatment);
  const journal = normalizeJournalEntries(payload.journal);
  const goals = normalizeObjectives(payload.goals);
  const timeline = normalizeTimelineEntries(payload.timeline);

  const templates = (payload.templates ?? []).flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    const body = asString(entry.body, '').trim();
    if (!name || !body) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('tpl')),
        name,
        body,
      } satisfies BackupTemplate,
    ];
  });

  const books = (payload.books ?? []).flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('book')),
        name,
        author: asString(entry.sub, ''),
        status: sanitizeBookStatus(entry.status),
        rating: Math.max(0, Math.min(5, asNumber(entry.rating, 0))),
        date: asString(entry.date, ''),
        notes: asString(entry.notes, ''),
        createdAt: asNumber(entry.createdAt, now - index),
      } satisfies BackupBook,
    ];
  });
  const games = normalizeGames(payload.games);
  const countries = normalizeCountries(payload.countries);
  const concerts = normalizeConcerts(payload.concerts);

  return {
    source: 'legacy-html',
    personCategories: normalizePersonCategories([], people),
    notes,
    lists,
    people,
    projects,
    reminders,
    routines,
    ideas,
    templates,
    doses,
    substances,
    sleepEntries,
    physicalActivities,
    books,
    games,
    countries,
    concerts,
    treatments,
    journal,
    goals,
    timeline,
    links: [],
    entityTags: [],
    attachments: [],
    savedViews: [],
    activityLog: [],
    importedPreferences: payload.prefs ? sanitizeAppPreferences(payload.prefs) : null,
    importedPin: asString(payload.prefs?.pin, '').trim() || null,
    unsupportedSections: [],
  };
}

function normalizeMobileBackup(payload: JsonRecord): NormalizedBackup {
  const exportedNotes = Array.isArray(payload.notes) ? payload.notes : [];
  const exportedLists = Array.isArray(payload.lists) ? payload.lists : [];
  const exportedPeople = Array.isArray(payload.people) ? payload.people : [];
  const exportedProjects = Array.isArray(payload.projects) ? payload.projects : [];
  const exportedReminders = Array.isArray(payload.reminders) ? payload.reminders : [];
  const exportedRoutines = Array.isArray(payload.routines) ? payload.routines : [];
  const exportedIdeas = Array.isArray(payload.ideas) ? payload.ideas : [];
  const exportedTemplates = Array.isArray(payload.templates) ? payload.templates : [];
  const exportedDoses = Array.isArray(payload.doses) ? payload.doses : [];
  const exportedSubstances = Array.isArray(payload.substances) ? payload.substances : [];
  const exportedSleepEntries = Array.isArray(payload.sleepEntries) ? payload.sleepEntries : [];
  const exportedPhysicalActivities = Array.isArray(payload.physicalActivities) ? payload.physicalActivities : [];
  const exportedBooks = Array.isArray(payload.books) ? payload.books : [];
  const exportedGames = Array.isArray(payload.games) ? payload.games : [];
  const exportedCountries = Array.isArray(payload.countries) ? payload.countries : [];
  const exportedConcerts = Array.isArray(payload.concerts) ? payload.concerts : [];
  const exportedTreatments = normalizeTreatments(payload.treatments);
  const legacyTreatments = normalizeTreatments(payload.treatment);
  const treatments = exportedTreatments.concat(
    legacyTreatments.filter((treatment) => !exportedTreatments.some((existing) => existing.id === treatment.id)),
  );
  const journal = normalizeJournalEntries(payload.journal);
  const goals = normalizeObjectives(payload.goals);
  const timeline = normalizeTimelineEntries(payload.timeline);
  const links = normalizeEntityLinks(payload.links);
  const entityTags = normalizeEntityTags(payload.entityTags);
  const attachments = normalizeEntityAttachments(payload.attachments);
  const savedViews = normalizeSavedViews(payload.savedViews);
  const activityLog = normalizeActivityLog(payload.activityLog);
  const fallbackIso = new Date().toISOString();

  const notes = exportedNotes.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('note')),
        title: asString(entry.title, '').trim() || 'Sans titre',
        body: asString(entry.body, ''),
        tags: sanitizeTags(entry.tags),
        updatedAt: asNumber(entry.updatedAt, Date.now() - index),
        pinned: asBoolean(entry.pinned, false),
        archived: asBoolean(entry.archived, false),
      },
    ];
  });

  const reminders = exportedReminders.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const title = asString(entry.title, '').trim();
    if (!title) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('rem')),
        title,
        scheduledFor: sanitizeIsoDate(entry.scheduledFor, fallbackIso),
        status: entry.status === 'done' ? 'done' : 'scheduled',
        repeatRule: sanitizeRepeatRule(entry.repeatRule),
        category: sanitizeCategory(entry.category),
      } satisfies BackupReminder,
    ];
  });

  const lists = exportedLists.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    const rawItems = Array.isArray(entry.items) ? entry.items : [];
    const items = rawItems.flatMap((item, itemIndex) => {
      const normalized = normalizeLegacyListItem(item, itemIndex);
      return normalized ? [normalized] : [];
    });

    return [
      {
        id: asString(entry.id, createId('list')),
        name,
        position: asNumber(entry.position, index),
        items,
      } satisfies BackupChecklist,
    ];
  });

  const people = exportedPeople.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('person')),
        name,
        category: sanitizePersonCategory(entry.category),
        secondaryCategories: sanitizeStringList(entry.secondaryCategories).map(sanitizePersonCategory),
        photoUri: asString(entry.photoUri, ''),
        favorite: asBoolean(entry.favorite, false),
        note: asString(entry.note, ''),
        birthday: asString(entry.birthday, ''),
        phone: asString(entry.phone, ''),
        address: asString(entry.address, ''),
        lastContactedAt: asString(entry.lastContactedAt, ''),
        contactFrequency: sanitizeContactFrequency(entry.contactFrequency),
        relationshipStatus: sanitizeRelationshipStatus(entry.relationshipStatus),
        interests: sanitizeStringList(entry.interests),
        tags: sanitizeStringList(entry.tags),
        links: sanitizePersonLinks(entry.links),
        profile: sanitizePersonProfile(entry.profile),
      } satisfies BackupPerson,
    ];
  });
  const personCategories = normalizePersonCategories(payload.personCategories, people);

  const projects = exportedProjects.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('project')),
        name,
        status: sanitizeProjectStatus(entry.status),
        deadline: asString(entry.deadline, ''),
        people: sanitizeStringList(entry.people),
        notes: asString(entry.notes, ''),
        tags: sanitizeStringList(entry.tags),
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies BackupProject,
    ];
  });

  const routines = exportedRoutines.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const key = entry.key === 'mood' ? 'mood' : entry.key === 'treatment' ? 'treatment' : null;
    if (!key) {
      return [];
    }

    return [
      {
        key,
        label: asString(entry.label, key === 'mood' ? 'Noter son humeur' : 'Prendre le traitement'),
        enabled: asBoolean(entry.enabled, false),
        time: asString(entry.time, key === 'mood' ? '21:30' : '08:00') || (key === 'mood' ? '21:30' : '08:00'),
      } satisfies Routine,
    ];
  });

  const templates = exportedTemplates.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    const body = asString(entry.body, '').trim();
    if (!name || !body) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('tpl')),
        name,
        body,
      } satisfies BackupTemplate,
    ];
  });

  const ideas = normalizeIdeas(exportedIdeas);
  const doses = normalizeDoses(exportedDoses);
  const substances = normalizeSubstances(exportedSubstances);
  const sleepEntries = normalizeSleepEntries(exportedSleepEntries);
  const physicalActivities = normalizePhysicalActivities(exportedPhysicalActivities);

  const books = exportedBooks.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [
      {
        id: asString(entry.id, createId('book')),
        name,
        author: asString(entry.author, ''),
        status: sanitizeBookStatus(entry.status),
        rating: Math.max(0, Math.min(5, asNumber(entry.rating, 0))),
        date: asString(entry.date, ''),
        notes: asString(entry.notes, ''),
        createdAt: asNumber(entry.createdAt, Date.now() - index),
      } satisfies BackupBook,
    ];
  });

  const games = normalizeGames(exportedGames);
  const countries = normalizeCountries(exportedCountries);
  const concerts = normalizeConcerts(exportedConcerts);

  return {
    source: 'mobile-backup',
    personCategories,
    notes,
    lists,
    people,
    projects,
    reminders,
    routines,
    ideas,
    templates,
    doses,
    substances,
    sleepEntries,
    physicalActivities,
    books,
    games,
    countries,
    concerts,
    treatments,
    journal,
    goals,
    timeline,
    links,
    entityTags,
    attachments,
    savedViews,
    activityLog,
    importedPreferences: isRecord(payload.prefs) ? sanitizeAppPreferences(payload.prefs) : null,
    importedPin: null,
    unsupportedSections: [],
  };
}

function parseBackup(rawJson: string): NormalizedBackup {
  const parsed = JSON.parse(rawJson) as unknown;

  if (!isRecord(parsed)) {
    throw new Error('Fichier JSON invalide.');
  }

  if (parsed.format === 'carnet-mobile-backup-v1') {
    return normalizeMobileBackup(parsed);
  }

  const payload = isRecord(parsed.data) ? parsed.data : parsed;
  return normalizeLegacyBackup(payload as LegacyBackup);
}

export async function exportMobileBackup(db: SQLiteDatabase): Promise<MobileBackup> {
  const preferences = await getStoredPreferencesAsync();
  const [notes, checklists, people, personCategories, projects, reminders, routines, ideas, templates, doses, substances, sleepEntries, physicalActivities, books, games, countries, concerts, treatments, journal, goals, timeline, links, entityTags, rawAttachments, savedViews, activityLog] = await Promise.all([
    listNotes(db),
    listChecklists(db),
    listPeople(db),
    listPersonCategories(db),
    listProjects(db),
    listReminders(db),
    listRoutines(db),
    listIdeas(db),
    listTemplates(db),
    listDoses(db),
    listSubstances(db),
    listSleepEntries(db),
    listPhysicalActivities(db),
    listBooks(db),
    listGames(db),
    listCountries(db),
    listConcerts(db),
    listTreatments(db),
    listJournalEntries(db),
    listObjectives(db),
    listTimelineEntries(db),
    listEntityLinks(db),
    listEntityTags(db),
    listEntityAttachments(db),
    listSavedViews(db),
    listActivityLog(db, 200),
  ]);

  const lists = (
    await Promise.all(checklists.map((checklist) => getChecklist(db, checklist.id)))
  ).flatMap((checklist) => (checklist ? [checklist] : []));
  const attachments = (
    await Promise.all(rawAttachments.map((attachment) => exportAttachmentFile(attachment)))
  ).flatMap((attachment) => (attachment ? [attachment] : []));

  return {
    format: 'carnet-mobile-backup-v1',
    exportedAt: new Date().toISOString(),
    prefs: preferences,
    personCategories,
    notes,
    lists,
    people,
    projects,
    reminders: reminders.map((reminder) => ({
      id: reminder.id,
      title: reminder.title,
      scheduledFor: reminder.scheduledFor,
      status: reminder.status,
      repeatRule: reminder.repeatRule,
      category: reminder.category,
    })),
    routines,
    ideas,
    templates,
    doses,
    substances,
    sleepEntries,
    physicalActivities,
    books,
    games,
    countries,
    concerts,
    treatment: treatments[0] ?? null,
    treatments,
    journal,
    goals,
    timeline,
    links,
    entityTags,
    attachments,
    savedViews,
    activityLog,
  };
}

export async function uploadBackupToCloud(db: SQLiteDatabase, url: string, password?: string) {
  const backup = await exportMobileBackup(db);
  const payload = password ? buildEncryptedExportPayload(backup, password) : backup;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Version': '1.0.0',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Échec de la sauvegarde cloud (${response.status}): ${errorText || 'Erreur inconnue'}`);
  }

  return await response.json();
}

export async function importBackup(db: SQLiteDatabase, rawJson: string): Promise<BackupImportResult> {
  const parsed = parseBackup(rawJson);

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM list_items');
    await db.runAsync('DELETE FROM lists');
    await db.runAsync('DELETE FROM treatment_log');
    await db.runAsync('DELETE FROM treatment_profile');
    await db.runAsync('DELETE FROM treatment_logs');
    await db.runAsync('DELETE FROM treatments');
    await db.runAsync('DELETE FROM journal_entries');
    await db.runAsync('DELETE FROM objectives');
    await db.runAsync('DELETE FROM timeline_entries');
    await db.runAsync('DELETE FROM ideas');
    await db.runAsync('DELETE FROM people');
    await db.runAsync('DELETE FROM person_categories');
    await db.runAsync('DELETE FROM projects');
    await db.runAsync('DELETE FROM templates');
    await db.runAsync('DELETE FROM doses');
    await db.runAsync('DELETE FROM substances');
    await db.runAsync('DELETE FROM sleep_entries');
    await db.runAsync('DELETE FROM physical_activities');
    await db.runAsync('DELETE FROM books');
    await db.runAsync('DELETE FROM games');
    await db.runAsync('DELETE FROM countries');
    await db.runAsync('DELETE FROM concerts');
    await db.runAsync('DELETE FROM entity_links');
    await db.runAsync('DELETE FROM entity_tags');
    await db.runAsync('DELETE FROM entity_attachments');
    await db.runAsync('DELETE FROM saved_views');
    await db.runAsync('DELETE FROM activity_log');
    await db.runAsync('DELETE FROM notes');
    await db.runAsync('DELETE FROM reminders');

    for (const note of parsed.notes) {
      await db.runAsync(
        'INSERT INTO notes (id, title, body, tags_json, updated_at, pinned, archived) VALUES (?, ?, ?, ?, ?, ?, ?)',
        note.id,
        note.title,
        note.body,
        JSON.stringify(note.tags),
        note.updatedAt,
        note.pinned ? 1 : 0,
        note.archived ? 1 : 0,
      );
    }

    for (const checklist of parsed.lists) {
      await db.runAsync(
        'INSERT INTO lists (id, name, position) VALUES (?, ?, ?)',
        checklist.id,
        checklist.name,
        checklist.position,
      );

      for (const item of checklist.items) {
        await db.runAsync(
          'INSERT INTO list_items (id, list_id, text, done, position) VALUES (?, ?, ?, ?, ?)',
          item.id,
          checklist.id,
          item.text,
          item.done ? 1 : 0,
          item.position,
        );
      }
    }

    for (const category of parsed.personCategories) {
      await db.runAsync(
        `INSERT OR REPLACE INTO person_categories (id, label, color, custom, position, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        category.id,
        category.label,
        category.color,
        category.custom ? 1 : 0,
        category.position,
        category.createdAt,
      );
    }

    for (const person of parsed.people) {
      await db.runAsync(
        `INSERT INTO people (
          id,
          name,
          category,
          secondary_categories_json,
          photo_uri,
          favorite,
          note,
          birthday,
          phone,
          address,
          last_contacted_at,
          contact_frequency,
          relationship_status,
          interests_json,
          tags_json,
          links_json,
          profile_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        person.id,
        person.name,
        person.category,
        JSON.stringify(person.secondaryCategories),
        person.photoUri ?? '',
        person.favorite ? 1 : 0,
        person.note,
        person.birthday,
        person.phone,
        person.address,
        person.lastContactedAt ?? '',
        sanitizeContactFrequency(person.contactFrequency),
        sanitizeRelationshipStatus(person.relationshipStatus),
        JSON.stringify(person.interests),
        JSON.stringify(person.tags ?? []),
        JSON.stringify(person.links),
        JSON.stringify(sanitizePersonProfile(person.profile)),
      );
    }

    for (const project of parsed.projects) {
      await db.runAsync(
        `INSERT INTO projects (
          id,
          name,
          status,
          deadline,
          people_json,
          notes,
          tags_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        project.id,
        project.name,
        project.status,
        project.deadline,
        JSON.stringify(project.people),
        project.notes,
        JSON.stringify(project.tags),
        project.createdAt,
      );
    }

    for (const reminder of parsed.reminders) {
      await db.runAsync(
        'INSERT INTO reminders (id, title, scheduled_for, status, notification_id, repeat_rule, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
        reminder.id,
        reminder.title,
        reminder.scheduledFor,
        reminder.status,
        null,
        reminder.repeatRule,
        reminder.category,
      );
    }

    for (const routine of parsed.routines) {
      await db.runAsync(
        'INSERT OR REPLACE INTO routines (routine_key, label, enabled, time) VALUES (?, ?, ?, ?)',
        routine.key,
        routine.label,
        routine.enabled ? 1 : 0,
        routine.time,
      );
    }

    for (const idea of parsed.ideas) {
      await db.runAsync(
        `INSERT INTO ideas (
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
    }

    for (const template of parsed.templates) {
      await db.runAsync(
        'INSERT INTO templates (id, name, body) VALUES (?, ?, ?)',
        template.id,
        template.name,
        template.body,
      );
    }

    for (const dose of parsed.doses) {
      await db.runAsync(
        `INSERT INTO doses (
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
    }

    for (const substance of parsed.substances) {
      await db.runAsync(
        `INSERT INTO substances (id, name, category, first_tried, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        substance.id,
        substance.name,
        substance.category,
        substance.firstTried,
        substance.notes,
        substance.createdAt,
      );
    }

    for (const entry of parsed.sleepEntries) {
      await db.runAsync(
        `INSERT INTO sleep_entries (id, date, bedtime, wake_time, quality, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        entry.id,
        entry.date,
        entry.bedtime,
        entry.wakeTime,
        entry.quality,
        entry.notes,
        entry.createdAt,
      );
    }

    for (const activity of parsed.physicalActivities) {
      await db.runAsync(
        `INSERT INTO physical_activities (id, date, activity_type, duration_minutes, intensity, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        activity.id,
        activity.date,
        activity.activityType,
        activity.durationMinutes,
        activity.intensity,
        activity.notes,
        activity.createdAt,
      );
    }

    for (const book of parsed.books) {
      await db.runAsync(
        'INSERT INTO books (id, name, author, status, rating, date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        book.id,
        book.name,
        book.author,
        book.status,
        book.rating,
        book.date,
        book.notes,
        book.createdAt,
      );
    }

    for (const game of parsed.games) {
      await db.runAsync(
        `INSERT INTO games (id, name, platform, status, rating, date, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        game.id,
        game.name,
        game.platform,
        game.status,
        game.rating,
        game.date,
        game.notes,
        game.createdAt,
      );
    }

    for (const country of parsed.countries) {
      await db.runAsync(
        `INSERT INTO countries (id, name, city, region, rating, year, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        country.id,
        country.name,
        country.city,
        country.region,
        country.rating,
        country.year,
        country.notes,
        country.createdAt,
      );
    }

    for (const concert of parsed.concerts) {
      await db.runAsync(
        `INSERT INTO concerts (id, name, venue, rating, date, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        concert.id,
        concert.name,
        concert.venue,
        concert.rating,
        concert.date,
        concert.notes,
        concert.createdAt,
      );
    }

    for (const treatment of parsed.treatments) {
      await db.runAsync(
        'INSERT OR REPLACE INTO treatments (id, name, dose, created_at) VALUES (?, ?, ?, ?)',
        treatment.id,
        treatment.name,
        treatment.dose,
        treatment.createdAt,
      );

      for (const day of treatment.takenDays) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          continue;
        }

        await db.runAsync('INSERT OR IGNORE INTO treatment_logs (treatment_id, day) VALUES (?, ?)', treatment.id, day);
      }
    }

    for (const entry of parsed.journal) {
      await db.runAsync(
        'INSERT INTO journal_entries (date, mood, text, tags_json) VALUES (?, ?, ?, ?)',
        entry.date,
        entry.mood,
        entry.text,
        JSON.stringify(entry.tags ?? []),
      );
    }

    for (const goal of parsed.goals) {
      await db.runAsync(
        'INSERT INTO objectives (id, title, scope, deadline, details, events_json, progress, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        goal.id,
        goal.title,
        goal.scope,
        goal.deadline,
        goal.details,
        JSON.stringify(goal.events),
        goal.progress,
        goal.createdAt,
      );
    }

    for (const entry of parsed.timeline) {
      await db.runAsync(
        'INSERT INTO timeline_entries (id, date, title, note) VALUES (?, ?, ?, ?)',
        entry.id,
        entry.date,
        entry.title,
        entry.note,
      );
    }

    await replaceCrossData(db, {
      links: parsed.links,
      entityTags: parsed.entityTags,
      savedViews: parsed.savedViews,
      activityLog: parsed.activityLog,
    });
  });

  const attachmentRestore = await restoreBackupAttachments(db, parsed.attachments);

  return {
    source: parsed.source,
    noteCount: parsed.notes.length,
    listCount: parsed.lists.length,
    personCount: parsed.people.length,
    projectCount: parsed.projects.length,
    reminderCount: parsed.reminders.length,
    routineCount: parsed.routines.length,
    templateCount: parsed.templates.length,
    bookCount: parsed.books.length,
    attachmentCount: attachmentRestore.restoredCount,
    attachmentFailureCount: attachmentRestore.failureCount,
    importedPin: parsed.importedPin,
    importedPreferences: parsed.importedPreferences,
    unsupportedSections: parsed.unsupportedSections,
  };
}

function sanitizeEntityKind(value: unknown): EntityKind | null {
  return value === 'note' ||
    value === 'list' ||
    value === 'person' ||
    value === 'project' ||
    value === 'reminder' ||
    value === 'routine' ||
    value === 'template' ||
    value === 'book' ||
    value === 'idea' ||
    value === 'substance' ||
    value === 'dose' ||
    value === 'sleep' ||
    value === 'physical_activity' ||
    value === 'game' ||
    value === 'country' ||
    value === 'concert' ||
    value === 'treatment' ||
    value === 'journal' ||
    value === 'objective' ||
    value === 'timeline'
    ? value
    : null;
}

function normalizeEntityLinks(value: unknown): EntityLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const sourceKind = sanitizeEntityKind(entry.sourceKind);
    const targetKind = sanitizeEntityKind(entry.targetKind);
    const sourceId = asString(entry.sourceId, '').trim();
    const targetId = asString(entry.targetId, '').trim();
    if (!sourceKind || !targetKind || !sourceId || !targetId) {
      return [];
    }

    return [{
      id: asString(entry.id, createId('link')),
      sourceKind,
      sourceId,
      targetKind,
      targetId,
      note: asString(entry.note, ''),
      createdAt: asNumber(entry.createdAt, Date.now() - index),
    } satisfies EntityLink];
  });
}

function normalizeEntityTags(value: unknown): EntityTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const entityKind = sanitizeEntityKind(entry.entityKind);
    const entityId = asString(entry.entityId, '').trim();
    const tag = asString(entry.tag, '').replace(/^#/, '').trim().toLowerCase();
    if (!entityKind || !entityId || !tag) {
      return [];
    }

    return [{
      entityKind,
      entityId,
      tag,
      createdAt: asNumber(entry.createdAt, Date.now() - index),
    } satisfies EntityTag];
  });
}

function normalizeEntityAttachments(value: unknown): BackupEntityAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const entityKind = sanitizeEntityKind(entry.entityKind);
    const entityId = asString(entry.entityId, '').trim();
    const name = asString(entry.name, '').trim() || 'Piece jointe';
    const dataBase64 = typeof entry.dataBase64 === 'string' ? entry.dataBase64 : null;
    if (!entityKind || !entityId || dataBase64 === null) {
      return [];
    }

    const id = asString(entry.id, createId('att'));

    return [{
      id,
      entityKind,
      entityId,
      name,
      mimeType: asString(entry.mimeType, ''),
      fileName: buildAttachmentFileName({
        id,
        fileName: asString(entry.fileName, ''),
        name,
      }),
      size: Math.max(0, Math.round(asNumber(entry.size, 0))),
      createdAt: asNumber(entry.createdAt, Date.now() - index),
      dataBase64,
    } satisfies BackupEntityAttachment];
  });
}

function normalizeSavedViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = asString(entry.name, '').trim();
    if (!name) {
      return [];
    }

    return [{
      id: asString(entry.id, createId('view')),
      name,
      scope: asString(entry.scope, 'all') || 'all',
      config: isRecord(entry.config) ? entry.config : {},
      createdAt: asNumber(entry.createdAt, Date.now() - index),
    } satisfies SavedView];
  });
}

function normalizeActivityLog(value: unknown): ActivityLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }

    const entityKind = sanitizeEntityKind(entry.entityKind);
    const entityId = asString(entry.entityId, '').trim();
    if (!entityKind || !entityId) {
      return [];
    }

    return [{
      id: asString(entry.id, createId('activity')),
      entityKind,
      entityId,
      action: asString(entry.action, 'update'),
      label: asString(entry.label, ''),
      createdAt: asNumber(entry.createdAt, Date.now() - index),
    } satisfies ActivityLogEntry];
  });
}