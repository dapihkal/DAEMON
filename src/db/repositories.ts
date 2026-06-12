import type { SQLiteDatabase } from 'expo-sqlite';

import { advanceReminderDate, isDue, toIsoString } from '../lib/date';
import { createId } from '../lib/id';
import { encryptField, decryptField } from '../lib/db-crypto';
import {
  createPersonCategoryId,
  defaultPersonCategories,
  getDefaultPersonCategory,
  isDefaultPersonCategory,
  mergePersonCategoryDefinitions,
  normalizePersonCategoryDefinition,
  sanitizeOptionalPersonCategoryId,
  sanitizePersonCategoryColor,
  sanitizePersonCategoryId,
  sanitizePersonCategoryLabel,
} from '../lib/person-categories';
import type {
  BasePersonCategory,
  Checklist,
  ChecklistItem,
  ChecklistSummary,
  Book,
  BookStatus,
  HomeSnapshot,
  JournalEntry,
  Note,
  Objective,
  ObjectiveEvent,
  ObjectiveScope,
  Person,
  PersonContactFrequency,
  PersonCategoryDefinition,
  PersonLink,
  PersonLinkStrength,
  PersonProfile,
  PersonRelationshipStatus,
  PersonCategory,
  Project,
  ProjectStatus,
  Reminder,
  ReminderCategory,
  ReminderRepeatRule,
  Routine,
  Treatment,
  Template,
  TimelineEntry,
} from './types';

type NoteRow = {
  id: string;
  title: string;
  body: string;
  tags_json: string;
  updated_at: number;
  pinned: number;
  archived: number;
};

type ChecklistRow = {
  id: string;
  name: string;
  position: number;
};

type ChecklistItemRow = {
  id: string;
  list_id: string;
  text: string;
  done: number;
  position: number;
};

type ChecklistSummaryRow = {
  id: string;
  name: string;
  position: number;
  item_count: number;
  done_count: number;
};

type PersonRow = {
  id: string;
  name: string;
  category: string;
  secondary_categories_json: string;
  photo_uri: string;
  favorite: number;
  note: string;
  birthday: string;
  phone: string;
  address: string;
  last_contacted_at: string;
  contact_frequency: PersonContactFrequency;
  relationship_status: PersonRelationshipStatus;
  interests_json: string;
  tags_json: string;
  role: string;
  organization: string;
  links_json: string;
  profile_json: string;
};

type PersonCategoryRow = {
  id: string;
  label: string;
  color: string;
  custom: number;
  position: number;
  created_at: number;
};

type ProjectRow = {
  id: string;
  name: string;
  status: ProjectStatus;
  deadline: string;
  people_json: string;
  notes: string;
  tags_json: string;
  created_at: number;
};

type ReminderRow = {
  id: string;
  title: string;
  scheduled_for: string;
  status: 'scheduled' | 'done';
  notification_id: string | null;
  repeat_rule: ReminderRepeatRule;
  category: ReminderCategory;
};

type RoutineRow = {
  routine_key: 'treatment' | 'mood';
  label: string;
  enabled: number;
  time: string;
};

type TemplateRow = {
  id: string;
  name: string;
  body: string;
};

type BookRow = {
  id: string;
  name: string;
  author: string;
  status: BookStatus;
  rating: number;
  date: string;
  notes: string;
  created_at: number;
};

type TreatmentRow = {
  id: string;
  name: string;
  dose: string;
  created_at: number;
};

type TreatmentLogRow = {
  treatment_id: string;
  day: string;
};

type JournalEntryRow = {
  date: string;
  mood: number;
  text: string;
  tags_json?: string;
};

type ObjectiveRow = {
  id: string;
  title: string;
  scope: ObjectiveScope;
  deadline: string;
  details: string;
  events_json: string;
  progress: number;
  created_at: number;
};

type TimelineEntryRow = {
  id: string;
  date: string;
  title: string;
  note: string;
};

function parseTags(tagsJson: string) {
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

function sanitizePersonLinkStrength(value: unknown): PersonLinkStrength {
  return value === 3 ? 3 : value === 2 ? 2 : 1;
}

function parsePersonLinks(value: string): PersonLink[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const linksById = new Map<string, PersonLink>();

    parsed.forEach((entry) => {
      if (typeof entry === 'string') {
        const personId = entry.trim();
        if (!personId) {
          return;
        }

        linksById.set(personId, { personId, strength: 1 });
        return;
      }

      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return;
      }

      const personId = typeof entry.personId === 'string' ? entry.personId.trim() : '';
      if (!personId) {
        return;
      }

      linksById.set(personId, {
        personId,
        strength: sanitizePersonLinkStrength(entry.strength),
      });
    });

    return [...linksById.values()];
  } catch {
    return [];
  }
}

function createEmptyPersonProfile(): PersonProfile {
  return {
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
}

function sanitizePersonProfile(value: Partial<PersonProfile> | null | undefined): PersonProfile {
  const emptyProfile = createEmptyPersonProfile();

  return {
    nickname: value?.nickname?.trim() ?? emptyProfile.nickname,
    pronouns: value?.pronouns?.trim() ?? emptyProfile.pronouns,
    memories: value?.memories?.trim() ?? emptyProfile.memories,
    places: value?.places?.trim() ?? emptyProfile.places,
    giftIdeas: value?.giftIdeas?.trim() ?? emptyProfile.giftIdeas,
    avoidTopics: value?.avoidTopics?.trim() ?? emptyProfile.avoidTopics,
    preferences: value?.preferences?.trim() ?? emptyProfile.preferences,
    ourStory: value?.ourStory?.trim() ?? emptyProfile.ourStory,
    affinityScore: value?.affinityScore ?? emptyProfile.affinityScore,
    preferredActivities: value?.preferredActivities?.trim() ?? emptyProfile.preferredActivities,
    sharedValues: value?.sharedValues?.trim() ?? emptyProfile.sharedValues,
    frequentTopics: value?.frequentTopics?.trim() ?? emptyProfile.frequentTopics,
    mutualSupport: value?.mutualSupport?.trim() ?? emptyProfile.mutualSupport,
  };
}

function parsePersonProfile(value: string): PersonProfile {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return createEmptyPersonProfile();
    }

    const profile = parsed as Partial<Record<keyof PersonProfile, unknown>>;

    return sanitizePersonProfile({
      nickname: typeof profile.nickname === 'string' ? profile.nickname : '',
      pronouns: typeof profile.pronouns === 'string' ? profile.pronouns : '',
      memories: typeof profile.memories === 'string' ? profile.memories : '',
      places: typeof profile.places === 'string' ? profile.places : '',
      giftIdeas: typeof profile.giftIdeas === 'string' ? profile.giftIdeas : '',
      avoidTopics: typeof profile.avoidTopics === 'string' ? profile.avoidTopics : '',
      preferences: typeof profile.preferences === 'string' ? profile.preferences : '',
      ourStory: typeof profile.ourStory === 'string' ? profile.ourStory : '',
      affinityScore: typeof profile.affinityScore === 'number' ? profile.affinityScore : 0,
      preferredActivities: typeof profile.preferredActivities === 'string' ? profile.preferredActivities : '',
      sharedValues: typeof profile.sharedValues === 'string' ? profile.sharedValues : '',
      frequentTopics: typeof profile.frequentTopics === 'string' ? profile.frequentTopics : '',
      mutualSupport: typeof profile.mutualSupport === 'string' ? profile.mutualSupport : '',
    });
  } catch {
    return createEmptyPersonProfile();
  }
}

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: decryptField(row.title),
    body: decryptField(row.body),
    tags: parseTags(decryptField(row.tags_json)),
    updatedAt: row.updated_at,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
  };
}

function mapChecklistItem(row: ChecklistItemRow): ChecklistItem {
  return {
    id: row.id,
    text: decryptField(row.text),
    done: row.done === 1,
    position: row.position,
  };
}

function mapChecklistSummary(row: ChecklistSummaryRow): ChecklistSummary {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    itemCount: row.item_count,
    doneCount: row.done_count,
  };
}

function mapPerson(row: PersonRow): Person {
  const category = sanitizePersonCategoryId(row.category);

  return {
    id: row.id,
    name: row.name,
    category,
    secondaryCategories: parseStringArray(decryptField(row.secondary_categories_json)).flatMap((categoryId) => {
      const secondaryCategory = sanitizeOptionalPersonCategoryId(categoryId);
      return secondaryCategory && secondaryCategory !== category ? [secondaryCategory] : [];
    }),
    photoUri: decryptField(row.photo_uri),
    favorite: row.favorite === 1,
    note: decryptField(row.note),
    birthday: row.birthday,
    phone: decryptField(row.phone),
    address: decryptField(row.address),
    lastContactedAt: row.last_contacted_at,
    contactFrequency: sanitizeContactFrequency(row.contact_frequency),
    relationshipStatus: sanitizeRelationshipStatus(row.relationship_status),
    interests: parseStringArray(decryptField(row.interests_json)),
    tags: parseStringArray(decryptField(row.tags_json)),
    role: decryptField(row.role) || '',
    organization: decryptField(row.organization) || '',
    links: parsePersonLinks(decryptField(row.links_json)),
    profile: parsePersonProfile(decryptField(row.profile_json)),
  };
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    deadline: row.deadline,
    people: parseStringArray(decryptField(row.people_json)),
    notes: decryptField(row.notes),
    tags: parseTags(decryptField(row.tags_json)),
    createdAt: row.created_at,
  };
}

function mapReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: decryptField(row.title),
    scheduledFor: row.scheduled_for,
    status: row.status,
    notificationId: row.notification_id,
    repeatRule: row.repeat_rule,
    category: row.category,
  };
}

function mapRoutine(row: RoutineRow): Routine {
  return {
    key: row.routine_key,
    label: decryptField(row.label),
    enabled: row.enabled === 1,
    time: row.time,
  };
}

function mapTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    body: decryptField(row.body),
  };
}

function mapBook(row: BookRow): Book {
  return {
    id: row.id,
    name: row.name,
    author: decryptField(row.author),
    status: row.status,
    rating: row.rating,
    date: row.date,
    notes: decryptField(row.notes),
    createdAt: row.created_at,
  };
}

const projectStatusOrder: ProjectStatus[] = ['prospect', 'encours', 'termine'];

const personCategoryOrder = defaultPersonCategories.map((category) => category.id as BasePersonCategory);

function getPersonCategoryRank(category: PersonCategory) {
  const index = personCategoryOrder.indexOf(category as BasePersonCategory);
  return index === -1 ? personCategoryOrder.length : index;
}

function comparePeople(left: Person, right: Person) {
  if (left.favorite !== right.favorite) {
    return left.favorite ? -1 : 1;
  }

  const categoryDelta = getPersonCategoryRank(left.category) - getPersonCategoryRank(right.category);

  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
}

function sanitizeStringList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sanitizeContactFrequency(value: unknown): PersonContactFrequency {
  return value === 'weekly' || value === 'monthly' || value === 'quarterly' || value === 'yearly' ? value : 'none';
}

function sanitizeRelationshipStatus(value: unknown): PersonRelationshipStatus {
  return value === 'proche' || value === 'fragile' || value === 'distant' || value === 'complique' ? value : 'stable';
}

function sanitizeSecondaryCategories(primaryCategory: PersonCategory, values: PersonCategory[]) {
  const sanitizedPrimaryCategory = sanitizePersonCategoryId(primaryCategory);

  return [...new Set(values.flatMap((value) => {
    const category = sanitizeOptionalPersonCategoryId(value);
    return category && category !== sanitizedPrimaryCategory ? [category] : [];
  }))];
}

function sanitizePersonLinks(personId: string, values: PersonLink[], knownIds: Set<string>) {
  const linksById = new Map<string, PersonLink>();

  values.forEach((link) => {
    const linkedPersonId = link.personId.trim();
    if (!linkedPersonId || linkedPersonId === personId || !knownIds.has(linkedPersonId)) {
      return;
    }

    linksById.set(linkedPersonId, {
      personId: linkedPersonId,
      strength: sanitizePersonLinkStrength(link.strength),
    });
  });

  return [...linksById.values()];
}

function sanitizeDayList(values: string[]) {
  return [...new Set(values.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort((left, right) =>
    right.localeCompare(left),
  );
}

function clampMood(value: number) {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sumObjectiveEvents(events: ObjectiveEvent[]) {
  return clampProgress(events.reduce((total, event) => total + event.percent, 0));
}

function sanitizeObjectiveEvents(events: ObjectiveEvent[]) {
  let usedProgress = 0;

  return events.flatMap((event, index): ObjectiveEvent[] => {
    const title = event.title.trim();
    const remainingProgress = Math.max(0, 100 - usedProgress);
    const percent = Math.min(remainingProgress, clampProgress(event.percent));

    if (!title && percent <= 0) {
      return [];
    }

    usedProgress += percent;

    return [
      {
        id: event.id.trim() || `objective-event-${index}`,
        title: title || 'Événement',
        percent,
      },
    ];
  });
}

function parseObjectiveEvents(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const events = parsed.flatMap((entry, index): ObjectiveEvent[] => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return [];
      }

      const rawEvent = entry as Record<string, unknown>;
      const title = typeof rawEvent.title === 'string' ? rawEvent.title : '';
      const rawPercent = typeof rawEvent.percent === 'number' ? rawEvent.percent : Number(rawEvent.percent ?? 0);
      const percent = Number.isFinite(rawPercent) ? rawPercent : 0;
      const id = typeof rawEvent.id === 'string' ? rawEvent.id : `objective-event-${index}`;

      return [{ id, title, percent }];
    });

    return sanitizeObjectiveEvents(events);
  } catch {
    return [];
  }
}

function sanitizeObjectiveScope(value: string): ObjectiveScope {
  return value === 'pro' ? 'pro' : 'perso';
}

async function writePersonAsync(db: SQLiteDatabase, person: Person) {
  await db.runAsync(
    `INSERT OR REPLACE INTO people (
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
      role,
      organization,
      links_json,
      profile_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    person.id,
    person.name,
    person.category,
    encryptField(JSON.stringify(person.secondaryCategories)),
    encryptField(person.photoUri),
    person.favorite ? 1 : 0,
    encryptField(person.note),
    person.birthday,
    encryptField(person.phone),
    encryptField(person.address),
    person.lastContactedAt,
    person.contactFrequency,
    person.relationshipStatus,
    encryptField(JSON.stringify(person.interests)),
    encryptField(JSON.stringify(person.tags)),
    encryptField(person.role),
    encryptField(person.organization),
    encryptField(JSON.stringify(person.links)),
    encryptField(JSON.stringify(person.profile)),
  );
}

async function ensurePersonCategoriesTableAsync(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS person_categories (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      color TEXT NOT NULL,
      custom INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  for (const category of defaultPersonCategories) {
    await db.runAsync(
      `INSERT OR IGNORE INTO person_categories (id, label, color, custom, position, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      category.id,
      category.label,
      category.color,
      0,
      category.position,
      category.createdAt,
    );
  }
}

function mapPersonCategory(row: PersonCategoryRow, index: number) {
  return normalizePersonCategoryDefinition(
    {
      id: row.id,
      label: decryptField(row.label),
      color: row.color,
      custom: row.custom === 1,
      position: row.position,
      createdAt: row.created_at,
    },
    index,
  );
}

function listUsedPersonCategoryIds(people: Person[]) {
  return people.flatMap((person) => [person.category, ...person.secondaryCategories]);
}

export async function listPersonCategories(db: SQLiteDatabase) {
  await ensurePersonCategoriesTableAsync(db);

  const [rows, people] = await Promise.all([
    db.getAllAsync<PersonCategoryRow>('SELECT * FROM person_categories ORDER BY position ASC, label COLLATE NOCASE ASC'),
    listPeople(db),
  ]);
  const categories = rows.flatMap((row, index) => {
    const category = mapPersonCategory(row, index);
    return category ? [category] : [];
  });

  return mergePersonCategoryDefinitions(categories, listUsedPersonCategoryIds(people));
}

export async function savePersonCategory(
  db: SQLiteDatabase,
  input: { id?: PersonCategory; label: string; color: string; position?: number },
) {
  const label = input.label.trim();
  if (!label && !input.id) {
    return null;
  }

  await ensurePersonCategoriesTableAsync(db);

  const categories = await listPersonCategories(db);
  const existingIds = new Set(categories.map((category) => category.id));
  const id = input.id ? sanitizePersonCategoryId(input.id) : createPersonCategoryId(label, existingIds);
  const defaultCategory = getDefaultPersonCategory(id);
  const existingCategory = categories.find((category) => category.id === id) ?? defaultCategory;
  const position = defaultCategory?.position ?? input.position ?? existingCategory?.position ?? categories.length;
  const category: PersonCategoryDefinition = {
    id,
    label: sanitizePersonCategoryLabel(label || existingCategory?.label, id),
    color: sanitizePersonCategoryColor(input.color, existingCategory?.color ?? defaultCategory?.color),
    custom: !defaultCategory,
    position,
    createdAt: existingCategory?.createdAt ?? Date.now(),
  };

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

  return category;
}

export async function deletePersonCategory(db: SQLiteDatabase, categoryId: PersonCategory) {
  const sanitizedCategoryId = sanitizeOptionalPersonCategoryId(categoryId);
  if (!sanitizedCategoryId || isDefaultPersonCategory(sanitizedCategoryId)) {
    return false;
  }

  await ensurePersonCategoriesTableAsync(db);

  const people = await listPeople(db);
  const isUsed = people.some(
    (person) => person.category === sanitizedCategoryId || person.secondaryCategories.includes(sanitizedCategoryId),
  );
  if (isUsed) {
    return false;
  }

  await db.runAsync('DELETE FROM person_categories WHERE id = ?', sanitizedCategoryId);
  return true;
}

export async function seedDatabaseIfNeeded(db: SQLiteDatabase) {
  const existingNotes = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM notes');
  const existingRoutines = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM routines');
  const existingLists = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM lists');
  const existingTemplates = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM templates');
  const existingBooks = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM books');

  if (
    (existingNotes?.count ?? 0) > 0 ||
    (existingRoutines?.count ?? 0) > 0 ||
    (existingLists?.count ?? 0) > 0 ||
    (existingTemplates?.count ?? 0) > 0 ||
    (existingBooks?.count ?? 0) > 0
  ) {
    return;
  }

  const now = Date.now();
  const laterToday = new Date();
  laterToday.setHours(20, 0, 0, 0);
  if (laterToday.getTime() <= Date.now()) {
    laterToday.setDate(laterToday.getDate() + 1);
  }

  const tomorrowMorning = new Date();
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  await db.runAsync(
    'INSERT INTO notes (id, title, body, tags_json, updated_at) VALUES (?, ?, ?, ?, ?)',
    createId('note'),
    encryptField('Bienvenue dans votre Carnet'),
    encryptField('Cette application vous permet de centraliser vos notes, listes, tâches et suivis au quotidien en toute sécurité. Vos données restent locales et chiffrées.'),
    encryptField(JSON.stringify(['accueil'])),
    now,
  );
  await db.runAsync(
    'INSERT INTO notes (id, title, body, tags_json, updated_at) VALUES (?, ?, ?, ?, ?)',
    createId('note'),
    encryptField('Conseils pour démarrer'),
    encryptField('Vous pouvez ajouter de nouveaux modules depuis le dock en bas de l\'écran, personnaliser votre thème dans les réglages et configurer un code PIN pour sécuriser l\'accès.'),
    encryptField(JSON.stringify(['guide'])),
    now - 1000,
  );

  await db.runAsync(
    'INSERT INTO reminders (id, title, scheduled_for, status, notification_id, repeat_rule, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
    createId('rem'),
    encryptField('Prendre un moment de pause'),
    toIsoString(laterToday),
    'scheduled',
    null,
    'none',
    'rappel',
  );
  await db.runAsync(
    'INSERT INTO reminders (id, title, scheduled_for, status, notification_id, repeat_rule, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
    createId('rem'),
    encryptField('Faire le bilan de la journée'),
    toIsoString(tomorrowMorning),
    'scheduled',
    null,
    'none',
    'rappel',
  );

  await db.runAsync(
    'INSERT INTO routines (routine_key, label, enabled, time) VALUES (?, ?, ?, ?)',
    'treatment',
    encryptField('Suivi de mon traitement'),
    0,
    '08:00',
  );
  await db.runAsync(
    'INSERT INTO routines (routine_key, label, enabled, time) VALUES (?, ?, ?, ?)',
    'mood',
    encryptField('Noter mon humeur du jour'),
    1,
    '21:30',
  );

  const starterListId = createId('list');
  await db.runAsync(
    'INSERT INTO lists (id, name, position) VALUES (?, ?, ?)',
    starterListId,
    'À faire',
    0,
  );
  await db.runAsync(
    'INSERT INTO list_items (id, list_id, text, done, position) VALUES (?, ?, ?, ?, ?)',
    createId('item'),
    starterListId,
    encryptField('Ajouter mes premiers contacts au Cercle'),
    0,
    0,
  );
  await db.runAsync(
    'INSERT INTO list_items (id, list_id, text, done, position) VALUES (?, ?, ?, ?, ?)',
    createId('item'),
    starterListId,
    encryptField('Organiser mes tâches de la semaine'),
    0,
    1,
  );

  await db.runAsync(
    'INSERT INTO templates (id, name, body) VALUES (?, ?, ?)',
    createId('tpl'),
    'Structure de réunion',
    '1. Objectif général de la réunion\n2. Points d\'avancement\n3. Décisions à prendre\n4. Actions futures attribuées',
  );

  await db.runAsync(
    'INSERT INTO books (id, name, author, status, rating, date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    createId('book'),
    'Dune',
    'Frank Herbert',
    'alire',
    0,
    '',
    'Un classique incontournable de la science-fiction.',
    now,
  );
}

export async function listNotes(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<NoteRow>('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC');
  return rows.map(mapNote);
}

export async function createNote(
  db: SQLiteDatabase,
  input: { title: string; body: string; tags?: string[] },
) {
  const title = input.title.trim() || 'Note rapide';
  const body = input.body.trim();
  const tags = input.tags ?? [];

  await db.runAsync(
    'INSERT INTO notes (id, title, body, tags_json, updated_at) VALUES (?, ?, ?, ?, ?)',
    createId('note'),
    encryptField(title),
    encryptField(body),
    encryptField(JSON.stringify(tags)),
    Date.now(),
  );
}

export async function saveNote(
  db: SQLiteDatabase,
  input: { id?: string; title: string; body: string; tags?: string[] },
) {
  const title = input.title.trim() || 'Sans titre';
  const body = input.body.trim();
  const tags = (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const updatedAt = Date.now();

  if (input.id) {
    await db.runAsync(
      'UPDATE notes SET title = ?, body = ?, tags_json = ?, updated_at = ? WHERE id = ?',
      title,
      body,
      JSON.stringify(tags),
      updatedAt,
      input.id,
    );

    const row = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ?', input.id);
    return row ? mapNote(row) : null;
  }

  const id = createId('note');
  await db.runAsync(
    'INSERT INTO notes (id, title, body, tags_json, updated_at) VALUES (?, ?, ?, ?, ?)',
    id,
    title,
    body,
    JSON.stringify(tags),
    updatedAt,
  );

  const row = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ?', id);
  return row ? mapNote(row) : null;
}

export async function restoreNote(db: SQLiteDatabase, note: Note) {
  await db.runAsync(
    'INSERT OR REPLACE INTO notes (id, title, body, tags_json, updated_at, pinned, archived) VALUES (?, ?, ?, ?, ?, ?, ?)',
    note.id,
    note.title,
    note.body,
    JSON.stringify(note.tags),
    note.updatedAt,
    note.pinned ? 1 : 0,
    note.archived ? 1 : 0,
  );
}

export async function setNotePinned(db: SQLiteDatabase, noteId: string, pinned: boolean) {
  await db.runAsync('UPDATE notes SET pinned = ? WHERE id = ?', pinned ? 1 : 0, noteId);
}

export async function setNoteArchived(db: SQLiteDatabase, noteId: string, archived: boolean) {
  await db.runAsync('UPDATE notes SET archived = ?, pinned = CASE WHEN ? THEN 0 ELSE pinned END WHERE id = ?', archived ? 1 : 0, archived ? 1 : 0, noteId);
}

export async function deleteNote(db: SQLiteDatabase, noteId: string) {
  await db.runAsync('DELETE FROM notes WHERE id = ?', noteId);
}

export async function listTemplates(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<TemplateRow>('SELECT * FROM templates ORDER BY name COLLATE NOCASE ASC');
  return rows.map(mapTemplate);
}

export async function saveTemplate(
  db: SQLiteDatabase,
  input: { id?: string; name: string; body: string },
) {
  const template: Template = {
    id: input.id ?? createId('tpl'),
    name: input.name.trim(),
    body: input.body.trim(),
  };

  if (input.id) {
    await db.runAsync(
      'UPDATE templates SET name = ?, body = ? WHERE id = ?',
      template.name,
      template.body,
      template.id,
    );

    return template;
  }

  await db.runAsync(
    'INSERT INTO templates (id, name, body) VALUES (?, ?, ?)',
    template.id,
    template.name,
    template.body,
  );

  return template;
}

export async function deleteTemplate(db: SQLiteDatabase, templateId: string) {
  await db.runAsync('DELETE FROM templates WHERE id = ?', templateId);
}

export async function listBooks(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<BookRow>('SELECT * FROM books ORDER BY created_at DESC, name COLLATE NOCASE ASC');
  return rows.map(mapBook);
}

export async function saveBook(
  db: SQLiteDatabase,
  input: {
    id?: string;
    name: string;
    author: string;
    status: BookStatus;
    rating: number;
    date: string;
    notes: string;
    createdAt?: number;
  },
) {
  const book: Book = {
    id: input.id ?? createId('book'),
    name: input.name.trim(),
    author: input.author.trim(),
    status: input.status,
    rating: Math.max(0, Math.min(5, Math.round(input.rating))),
    date: input.date,
    notes: input.notes.trim(),
    createdAt: input.createdAt ?? Date.now(),
  };

  if (input.id) {
    await db.runAsync(
      'UPDATE books SET name = ?, author = ?, status = ?, rating = ?, date = ?, notes = ? WHERE id = ?',
      book.name,
      book.author,
      book.status,
      book.rating,
      book.date,
      book.notes,
      book.id,
    );

    return book;
  }

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

  return book;
}

export async function deleteBook(db: SQLiteDatabase, bookId: string) {
  await db.runAsync('DELETE FROM books WHERE id = ?', bookId);
}

export async function listChecklists(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<ChecklistSummaryRow>(
    `SELECT
      lists.id,
      lists.name,
      lists.position,
      COUNT(list_items.id) AS item_count,
      COALESCE(SUM(CASE WHEN list_items.done = 1 THEN 1 ELSE 0 END), 0) AS done_count
    FROM lists
    LEFT JOIN list_items ON list_items.list_id = lists.id
    GROUP BY lists.id, lists.name, lists.position
    ORDER BY lists.position ASC, lists.name COLLATE NOCASE ASC`,
  );

  return rows.map(mapChecklistSummary);
}

export async function getChecklist(db: SQLiteDatabase, checklistId: string): Promise<Checklist | null> {
  const listRow = await db.getFirstAsync<ChecklistRow>(
    'SELECT * FROM lists WHERE id = ?',
    checklistId,
  );

  if (!listRow) {
    return null;
  }

  const itemRows = await db.getAllAsync<ChecklistItemRow>(
    'SELECT * FROM list_items WHERE list_id = ? ORDER BY position ASC, id ASC',
    checklistId,
  );

  return {
    id: listRow.id,
    name: listRow.name,
    position: listRow.position,
    items: itemRows.map(mapChecklistItem),
  };
}

export async function createChecklist(db: SQLiteDatabase, input: { name: string }) {
  const name = input.name.trim();
  if (!name) {
    return null;
  }

  const maxPosition = await db.getFirstAsync<{ max_position: number | null }>(
    'SELECT MAX(position) AS max_position FROM lists',
  );
  const checklist: Checklist = {
    id: createId('list'),
    name,
    position: (maxPosition?.max_position ?? -1) + 1,
    items: [],
  };

  await db.runAsync(
    'INSERT INTO lists (id, name, position) VALUES (?, ?, ?)',
    checklist.id,
    checklist.name,
    checklist.position,
  );

  return checklist;
}

export async function deleteChecklist(db: SQLiteDatabase, checklistId: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM list_items WHERE list_id = ?', checklistId);
    await db.runAsync('DELETE FROM lists WHERE id = ?', checklistId);
  });
}

export async function createChecklistItem(
  db: SQLiteDatabase,
  input: { checklistId: string; text: string },
) {
  const text = input.text.trim();
  if (!text) {
    return null;
  }

  const maxPosition = await db.getFirstAsync<{ max_position: number | null }>(
    'SELECT MAX(position) AS max_position FROM list_items WHERE list_id = ?',
    input.checklistId,
  );

  const item: ChecklistItem = {
    id: createId('item'),
    text,
    done: false,
    position: (maxPosition?.max_position ?? -1) + 1,
  };

  await db.runAsync(
    'INSERT INTO list_items (id, list_id, text, done, position) VALUES (?, ?, ?, ?, ?)',
    item.id,
    input.checklistId,
    item.text,
    0,
    item.position,
  );

  return item;
}

export async function toggleChecklistItem(db: SQLiteDatabase, itemId: string) {
  const row = await db.getFirstAsync<ChecklistItemRow>('SELECT * FROM list_items WHERE id = ?', itemId);
  if (!row) {
    return null;
  }

  const nextDone = row.done === 1 ? 0 : 1;
  await db.runAsync('UPDATE list_items SET done = ? WHERE id = ?', nextDone, itemId);

  return mapChecklistItem({
    ...row,
    done: nextDone,
  });
}

export async function deleteChecklistItem(db: SQLiteDatabase, itemId: string) {
  await db.runAsync('DELETE FROM list_items WHERE id = ?', itemId);
}

export async function restoreChecklistItem(
  db: SQLiteDatabase,
  checklistId: string,
  item: ChecklistItem,
) {
  await db.runAsync(
    'INSERT OR REPLACE INTO list_items (id, list_id, text, done, position) VALUES (?, ?, ?, ?, ?)',
    item.id,
    checklistId,
    item.text,
    item.done ? 1 : 0,
    item.position,
  );
}

export async function restoreChecklist(db: SQLiteDatabase, checklist: Checklist) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT OR REPLACE INTO lists (id, name, position) VALUES (?, ?, ?)',
      checklist.id,
      checklist.name,
      checklist.position,
    );

    for (const item of checklist.items) {
      await db.runAsync(
        'INSERT OR REPLACE INTO list_items (id, list_id, text, done, position) VALUES (?, ?, ?, ?, ?)',
        item.id,
        checklist.id,
        item.text,
        item.done ? 1 : 0,
        item.position,
      );
    }
  });
}

export async function listPeople(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<PersonRow>('SELECT * FROM people ORDER BY name COLLATE NOCASE ASC');
  return rows.map(mapPerson).sort(comparePeople);
}

export async function getPerson(db: SQLiteDatabase, personId: string) {
  const row = await db.getFirstAsync<PersonRow>('SELECT * FROM people WHERE id = ?', personId);
  return row ? mapPerson(row) : null;
}

export async function savePerson(
  db: SQLiteDatabase,
  input: {
    id?: string;
    name: string;
    category: PersonCategory;
    secondaryCategories?: PersonCategory[];
    photoUri?: string;
    favorite?: boolean;
    note?: string;
    birthday?: string;
    phone?: string;
    address?: string;
    lastContactedAt?: string;
    contactFrequency?: PersonContactFrequency;
    relationshipStatus?: PersonRelationshipStatus;
    interests?: string[];
    tags?: string[];
    role?: string;
    organization?: string;
    links?: PersonLink[];
    profile?: Partial<PersonProfile>;
  },
) {
  const name = input.name.trim();
  if (!name) {
    return null;
  }

  const existingPeople = await listPeople(db);
  const personId = input.id ?? createId('person');
  const category = sanitizePersonCategoryId(input.category);
  const knownIds = new Set(existingPeople.map((person) => person.id));
  knownIds.add(personId);

  const nextPerson: Person = {
    id: personId,
    name,
    category,
    secondaryCategories: sanitizeSecondaryCategories(category, input.secondaryCategories ?? []),
    photoUri: input.photoUri?.trim() ?? '',
    favorite: input.favorite ?? false,
    note: input.note?.trim() ?? '',
    birthday: input.birthday?.trim() ?? '',
    phone: input.phone?.trim() ?? '',
    address: input.address?.trim() ?? '',
    lastContactedAt: input.lastContactedAt?.trim() ?? '',
    contactFrequency: sanitizeContactFrequency(input.contactFrequency),
    relationshipStatus: sanitizeRelationshipStatus(input.relationshipStatus),
    interests: sanitizeStringList(input.interests ?? []),
    tags: sanitizeStringList(input.tags ?? []),
    role: input.role?.trim() ?? '',
    organization: input.organization?.trim() ?? '',
    links: sanitizePersonLinks(personId, input.links ?? [], knownIds),
    profile: sanitizePersonProfile(input.profile),
  };

  const relatedPeople = existingPeople
    .filter((person) => person.id !== personId)
    .map((person) => ({
      ...person,
      interests: [...person.interests],
      tags: [...person.tags],
      links: person.links.map((link) => ({ ...link })),
      profile: { ...person.profile },
    }));

  const nextLinkStrengthById = new Map(nextPerson.links.map((link) => [link.personId, link.strength]));
  const modifiedPeople: Person[] = [];

  for (const person of relatedPeople) {
    const strength = nextLinkStrengthById.get(person.id);
    let linkedChanged = false;

    if (strength) {
      const existingLink = person.links.find((link) => link.personId === personId);
      if (existingLink) {
        if (existingLink.strength !== strength) {
          existingLink.strength = strength;
          linkedChanged = true;
        }
      } else {
        person.links = [...person.links, { personId, strength }];
        linkedChanged = true;
      }
    }

    if (!strength && person.links.some((link) => link.personId === personId)) {
      person.links = person.links.filter((link) => link.personId !== personId);
      linkedChanged = true;
    }

    if (linkedChanged) {
      modifiedPeople.push(person);
    }
  }

  await db.withTransactionAsync(async () => {
    await writePersonAsync(db, nextPerson);

    for (const person of modifiedPeople) {
      await writePersonAsync(db, {
        ...person,
        secondaryCategories: sanitizeSecondaryCategories(person.category, person.secondaryCategories),
        interests: sanitizeStringList(person.interests),
        tags: sanitizeStringList(person.tags),
        links: sanitizePersonLinks(person.id, person.links, knownIds),
        profile: sanitizePersonProfile(person.profile),
      });
    }
  });

  return nextPerson;
}

export async function deletePerson(db: SQLiteDatabase, personId: string) {
  const existingPeople = await listPeople(db);
  const relatedPeople = existingPeople
    .filter((person) => person.id !== personId && person.links.some((link) => link.personId === personId))
    .map((person) => ({
      ...person,
      links: person.links.filter((link) => link.personId !== personId),
    }));

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM people WHERE id = ?', personId);

    for (const person of relatedPeople) {
      await writePersonAsync(db, person);
    }
  });
}

export async function listProjects(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<ProjectRow>(
    'SELECT * FROM projects ORDER BY created_at DESC, name COLLATE NOCASE ASC',
  );
  return rows.map(mapProject);
}

export async function getProject(db: SQLiteDatabase, projectId: string) {
  const row = await db.getFirstAsync<ProjectRow>('SELECT * FROM projects WHERE id = ?', projectId);
  return row ? mapProject(row) : null;
}

export async function saveProject(
  db: SQLiteDatabase,
  input: {
    id?: string;
    name: string;
    status: ProjectStatus;
    deadline?: string;
    people?: string[];
    notes?: string;
    tags?: string[];
    createdAt?: number;
  },
) {
  const name = input.name.trim();
  if (!name) {
    return null;
  }

  const project: Project = {
    id: input.id ?? createId('project'),
    name,
    status: input.status,
    deadline: input.deadline?.trim() ?? '',
    people: sanitizeStringList(input.people ?? []),
    notes: input.notes?.trim() ?? '',
    tags: sanitizeStringList(input.tags ?? []),
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO projects (
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

  return project;
}

export async function deleteProject(db: SQLiteDatabase, projectId: string) {
  await db.runAsync('DELETE FROM projects WHERE id = ?', projectId);
}

export async function cycleProjectStatus(db: SQLiteDatabase, projectId: string) {
  const row = await db.getFirstAsync<ProjectRow>('SELECT * FROM projects WHERE id = ?', projectId);
  if (!row) {
    return null;
  }

  const currentIndex = projectStatusOrder.findIndex((status) => status === row.status);
  const nextStatus = projectStatusOrder[(currentIndex + 1) % projectStatusOrder.length];

  await db.runAsync('UPDATE projects SET status = ? WHERE id = ?', nextStatus, projectId);

  return mapProject({
    ...row,
    status: nextStatus,
  });
}

export async function listReminders(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<ReminderRow>(
    'SELECT * FROM reminders ORDER BY status ASC, scheduled_for ASC',
  );
  return rows.map(mapReminder);
}

export async function createReminder(
  db: SQLiteDatabase,
  input: {
    title: string;
    scheduledFor: string;
    notificationId: string | null;
    repeatRule?: ReminderRepeatRule;
    category?: ReminderCategory;
  },
) {
  const reminder: Reminder = {
    id: createId('rem'),
    title: input.title.trim(),
    scheduledFor: input.scheduledFor,
    status: 'scheduled',
    notificationId: input.notificationId,
    repeatRule: input.repeatRule ?? 'none',
    category: input.category ?? 'rappel',
  };

  await db.runAsync(
    'INSERT INTO reminders (id, title, scheduled_for, status, notification_id, repeat_rule, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
    reminder.id,
    reminder.title,
    reminder.scheduledFor,
    reminder.status,
    reminder.notificationId,
    reminder.repeatRule,
    reminder.category,
  );

  return reminder;
}

export async function saveReminder(
  db: SQLiteDatabase,
  input: {
    id?: string;
    title: string;
    scheduledFor: string;
    notificationId: string | null;
    repeatRule?: ReminderRepeatRule;
    category?: ReminderCategory;
    status?: Reminder['status'];
  },
) {
  const reminder: Reminder = {
    id: input.id ?? createId('rem'),
    title: input.title.trim(),
    scheduledFor: input.scheduledFor,
    status: input.status ?? 'scheduled',
    notificationId: input.notificationId,
    repeatRule: input.repeatRule ?? 'none',
    category: input.category ?? 'rappel',
  };

  if (input.id) {
    await db.runAsync(
      `INSERT INTO reminders (id, title, scheduled_for, status, notification_id, repeat_rule, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         scheduled_for = excluded.scheduled_for,
         status = excluded.status,
         notification_id = excluded.notification_id,
         repeat_rule = excluded.repeat_rule,
         category = excluded.category`,
      reminder.id,
      reminder.title,
      reminder.scheduledFor,
      reminder.status,
      reminder.notificationId,
      reminder.repeatRule,
      reminder.category,
    );

    return reminder;
  }

  await db.runAsync(
    'INSERT INTO reminders (id, title, scheduled_for, status, notification_id, repeat_rule, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
    reminder.id,
    reminder.title,
    reminder.scheduledFor,
    reminder.status,
    reminder.notificationId,
    reminder.repeatRule,
    reminder.category,
  );

  return reminder;
}

export async function deleteReminder(db: SQLiteDatabase, reminderId: string) {
  await db.runAsync('DELETE FROM reminders WHERE id = ?', reminderId);
}

export async function restoreReminder(db: SQLiteDatabase, reminder: Reminder) {
  await db.runAsync(
    'INSERT OR REPLACE INTO reminders (id, title, scheduled_for, status, notification_id, repeat_rule, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
    reminder.id,
    reminder.title,
    reminder.scheduledFor,
    reminder.status,
    null,
    reminder.repeatRule,
    reminder.category,
  );
}

export async function postponeReminder(db: SQLiteDatabase, reminderId: string, hours: number) {
  const row = await db.getFirstAsync<ReminderRow>('SELECT * FROM reminders WHERE id = ?', reminderId);

  if (!row) {
    return null;
  }

  const newDate = new Date(row.scheduled_for);
  newDate.setHours(newDate.getHours() + hours);
  const scheduledFor = newDate.toISOString();

  await db.runAsync(
    'UPDATE reminders SET scheduled_for = ?, notification_id = ? WHERE id = ?',
    scheduledFor,
    null,
    reminderId,
  );

  return mapReminder({
    ...row,
    scheduled_for: scheduledFor,
    notification_id: null,
  });
}

export async function markReminderDone(db: SQLiteDatabase, reminderId: string) {
  const row = await db.getFirstAsync<ReminderRow>('SELECT * FROM reminders WHERE id = ?', reminderId);

  if (!row) {
    return null;
  }

  if (row.repeat_rule !== 'none') {
    const scheduledFor = advanceReminderDate(row.scheduled_for, row.repeat_rule);
    await db.runAsync(
      'UPDATE reminders SET scheduled_for = ?, status = ?, notification_id = ? WHERE id = ?',
      scheduledFor,
      'scheduled',
      null,
      reminderId,
    );

    return mapReminder({
      ...row,
      scheduled_for: scheduledFor,
      status: 'scheduled',
      notification_id: null,
    });
  }

  await db.runAsync('UPDATE reminders SET status = ? WHERE id = ?', 'done', reminderId);

  return mapReminder({
    ...row,
    status: 'done',
  });
}

export async function setReminderNotificationId(
  db: SQLiteDatabase,
  input: { reminderId: string; notificationId: string | null },
) {
  await db.runAsync(
    'UPDATE reminders SET notification_id = ? WHERE id = ?',
    input.notificationId,
    input.reminderId,
  );
}

export async function listRoutines(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<RoutineRow>('SELECT * FROM routines ORDER BY routine_key ASC');
  return rows.map(mapRoutine);
}

export async function setRoutineEnabled(
  db: SQLiteDatabase,
  input: { key: Routine['key']; enabled: boolean },
) {
  await db.runAsync(
    'UPDATE routines SET enabled = ? WHERE routine_key = ?',
    input.enabled ? 1 : 0,
    input.key,
  );
}

export async function setRoutineTime(
  db: SQLiteDatabase,
  input: { key: Routine['key']; time: string },
) {
  await db.runAsync(
    'UPDATE routines SET time = ? WHERE routine_key = ?',
    input.time,
    input.key,
  );
}

function createEmptyTreatment(): Treatment {
  return {
    id: '',
    name: '',
    dose: '',
    takenDays: [],
    createdAt: 0,
  };
}

async function getTreatmentById(db: SQLiteDatabase, treatmentId: string): Promise<Treatment | null> {
  const [row, logRows] = await Promise.all([
    db.getFirstAsync<TreatmentRow>('SELECT * FROM treatments WHERE id = ?', treatmentId),
    db.getAllAsync<TreatmentLogRow>('SELECT treatment_id, day FROM treatment_logs WHERE treatment_id = ? ORDER BY day DESC', treatmentId),
  ]);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    dose: decryptField(row.dose),
    takenDays: sanitizeDayList(logRows.map((logRow) => logRow.day)),
    createdAt: row.created_at,
  };
}

export async function listTreatments(db: SQLiteDatabase): Promise<Treatment[]> {
  const rows = await db.getAllAsync<TreatmentRow>(
    'SELECT * FROM treatments ORDER BY created_at DESC, name COLLATE NOCASE ASC',
  );

  const logRows = await db.getAllAsync<TreatmentLogRow>(
    'SELECT treatment_id, day FROM treatment_logs ORDER BY day DESC',
  );
  const daysByTreatment = new Map<string, string[]>();

  logRows.forEach((logRow) => {
    const days = daysByTreatment.get(logRow.treatment_id) ?? [];
    days.push(logRow.day);
    daysByTreatment.set(logRow.treatment_id, days);
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    dose: decryptField(row.dose),
    takenDays: sanitizeDayList(daysByTreatment.get(row.id) ?? []),
    createdAt: row.created_at,
  }));
}

export async function getTreatment(db: SQLiteDatabase): Promise<Treatment> {
  return (await listTreatments(db))[0] ?? createEmptyTreatment();
}

export async function saveTreatment(
  db: SQLiteDatabase,
  input: { id?: string; name: string; dose: string; createdAt?: number },
): Promise<Treatment | null> {
  const name = input.name.trim();
  const dose = input.dose.trim();

  if (!name && !dose) {
    return null;
  }

  const id = input.id?.trim() || createId('treatment');
  const existing = input.id ? await getTreatmentById(db, id) : null;
  const createdAt = input.createdAt ?? existing?.createdAt ?? Date.now();

  await db.runAsync(
    `INSERT INTO treatments (id, name, dose, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, dose = excluded.dose`,
    id,
    name,
    dose,
    createdAt,
  );

  return (await getTreatmentById(db, id)) ?? {
    id,
    name,
    dose,
    takenDays: [],
    createdAt,
  };
}

export async function toggleTreatmentDay(
  db: SQLiteDatabase,
  input: { treatmentId: string; day: string },
): Promise<Treatment | null> {
  if (!input.treatmentId || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) {
    return null;
  }

  const existingTreatment = await getTreatmentById(db, input.treatmentId);
  if (!existingTreatment) {
    return null;
  }

  const existingRow = await db.getFirstAsync<TreatmentLogRow>(
    'SELECT treatment_id, day FROM treatment_logs WHERE treatment_id = ? AND day = ?',
    input.treatmentId,
    input.day,
  );

  if (existingRow) {
    await db.runAsync('DELETE FROM treatment_logs WHERE treatment_id = ? AND day = ?', input.treatmentId, input.day);
  } else {
    await db.runAsync('INSERT INTO treatment_logs (treatment_id, day) VALUES (?, ?)', input.treatmentId, input.day);
  }

  return getTreatmentById(db, input.treatmentId);
}

export async function deleteTreatment(db: SQLiteDatabase, treatmentId: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM treatment_logs WHERE treatment_id = ?', treatmentId);
    await db.runAsync('DELETE FROM treatments WHERE id = ?', treatmentId);
  });
}

export async function clearTreatment(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM treatment_logs');
    await db.runAsync('DELETE FROM treatments');
    await db.runAsync('DELETE FROM treatment_log');
    await db.runAsync('DELETE FROM treatment_profile');
  });
}

export async function listJournalEntries(db: SQLiteDatabase): Promise<JournalEntry[]> {
  const rows = await db.getAllAsync<JournalEntryRow>(
    'SELECT * FROM journal_entries ORDER BY date DESC',
  );

  return rows.map((row) => ({
    date: row.date,
    mood: clampMood(row.mood),
    text: decryptField(row.text),
    tags: row.tags_json ? parseTags(decryptField(row.tags_json)) : [],
  }));
}

export async function getJournalEntry(db: SQLiteDatabase, date: string): Promise<JournalEntry | null> {
  const row = await db.getFirstAsync<JournalEntryRow>(
    'SELECT * FROM journal_entries WHERE date = ?',
    date,
  );

  if (!row) {
    return null;
  }

  return {
    date: row.date,
    mood: clampMood(row.mood),
    text: decryptField(row.text),
    tags: row.tags_json ? parseTags(decryptField(row.tags_json)) : [],
  };
}

export async function saveJournalEntry(
  db: SQLiteDatabase,
  input: { date: string; mood: number; text: string; tags?: string[] },
): Promise<JournalEntry> {
  const date = input.date.trim();
  const tags = input.tags ?? [];
  const entry: JournalEntry = {
    date,
    mood: clampMood(input.mood),
    text: input.text.trim(),
    tags,
  };

  await db.runAsync(
    `INSERT INTO journal_entries (date, mood, text, tags_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET mood = excluded.mood, text = excluded.text, tags_json = excluded.tags_json`,
    entry.date,
    entry.mood,
    entry.text,
    JSON.stringify(tags),
  );

  return entry;
}

export async function deleteJournalEntry(db: SQLiteDatabase, date: string) {
  await db.runAsync('DELETE FROM journal_entries WHERE date = ?', date);
}

export async function listObjectives(db: SQLiteDatabase): Promise<Objective[]> {
  const rows = await db.getAllAsync<ObjectiveRow>(
    'SELECT * FROM objectives ORDER BY created_at DESC, title COLLATE NOCASE ASC',
  );

  return rows.map((row) => {
    const events = parseObjectiveEvents(row.events_json);

    return {
      id: row.id,
      title: decryptField(row.title),
      scope: sanitizeObjectiveScope(row.scope),
      deadline: row.deadline,
      details: decryptField(row.details),
      events,
      progress: events.length ? sumObjectiveEvents(events) : clampProgress(row.progress),
      createdAt: row.created_at,
    };
  });
}

export async function saveObjective(
  db: SQLiteDatabase,
  input: {
    id?: string;
    title: string;
    scope: ObjectiveScope;
    deadline: string;
    details?: string;
    events?: ObjectiveEvent[];
    progress?: number;
    createdAt?: number;
  },
): Promise<Objective | null> {
  const title = input.title.trim();
  if (!title) {
    return null;
  }

  const events = sanitizeObjectiveEvents(input.events ?? []);

  const objective: Objective = {
    id: input.id ?? createId('goal'),
    title,
    scope: input.scope,
    deadline: input.deadline.trim(),
    details: input.details?.trim() ?? '',
    events,
    progress: events.length ? sumObjectiveEvents(events) : clampProgress(input.progress ?? 0),
    createdAt: input.createdAt ?? Date.now(),
  };

  await db.runAsync(
    `INSERT INTO objectives (id, title, scope, deadline, details, events_json, progress, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        scope = excluded.scope,
        deadline = excluded.deadline,
        details = excluded.details,
        events_json = excluded.events_json,
        progress = excluded.progress`,
    objective.id,
    objective.title,
    objective.scope,
    objective.deadline,
    objective.details,
    JSON.stringify(objective.events),
    objective.progress,
    objective.createdAt,
  );

  return objective;
}

export async function deleteObjective(db: SQLiteDatabase, objectiveId: string) {
  await db.runAsync('DELETE FROM objectives WHERE id = ?', objectiveId);
}

export async function setObjectiveProgress(
  db: SQLiteDatabase,
  input: { objectiveId: string; progress: number },
) {
  const progress = clampProgress(input.progress);
  const events: ObjectiveEvent[] = progress > 0 ? [{ id: createId('objective-event'), title: 'Progression', percent: progress }] : [];

  await db.runAsync(
    'UPDATE objectives SET progress = ?, events_json = ? WHERE id = ?',
    progress,
    JSON.stringify(events),
    input.objectiveId,
  );
}

export async function listTimelineEntries(db: SQLiteDatabase): Promise<TimelineEntry[]> {
  const rows = await db.getAllAsync<TimelineEntryRow>(
    'SELECT * FROM timeline_entries ORDER BY date DESC, id DESC',
  );

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    title: decryptField(row.title),
    note: decryptField(row.note),
  }));
}

export async function saveTimelineEntry(
  db: SQLiteDatabase,
  input: { id?: string; date: string; title: string; note: string },
): Promise<TimelineEntry | null> {
  const date = input.date.trim();
  const title = input.title.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) {
    return null;
  }

  const entry: TimelineEntry = {
    id: input.id ?? createId('timeline'),
    date,
    title,
    note: input.note.trim(),
  };

  await db.runAsync(
    `INSERT INTO timeline_entries (id, date, title, note)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date,
        title = excluded.title,
        note = excluded.note`,
    entry.id,
    entry.date,
    entry.title,
    entry.note,
  );

  return entry;
}

export async function deleteTimelineEntry(db: SQLiteDatabase, entryId: string) {
  await db.runAsync('DELETE FROM timeline_entries WHERE id = ?', entryId);
}

export async function getHomeSnapshot(db: SQLiteDatabase): Promise<HomeSnapshot> {
  const notes = await listNotes(db);
  const reminders = await listReminders(db);
  const routines = await listRoutines(db);

  const scheduledReminders = reminders.filter((reminder) => reminder.status === 'scheduled');

  return {
    noteCount: notes.length,
    dueCount: scheduledReminders.filter((reminder) => isDue(reminder.scheduledFor)).length,
    routineCount: routines.filter((routine) => routine.enabled).length,
    nextReminder: scheduledReminders[0] ?? null,
  };
}
