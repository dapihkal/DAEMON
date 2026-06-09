import type { SQLiteDatabase } from 'expo-sqlite';

import { createId } from '../lib/id';
import { encryptField, decryptField } from '../lib/db-crypto';
import {
  listConcerts,
  listCountries,
  listDoses,
  listGames,
  listIdeas,
  listSubstances,
} from './module-repositories';
import {
  listBooks,
  listChecklists,
  listJournalEntries,
  listNotes,
  listObjectives,
  listPeople,
  listProjects,
  listReminders,
  listRoutines,
  listTemplates,
  listTreatments,
  listTimelineEntries,
  saveNote,
  saveProject,
  saveJournalEntry,
} from './repositories';
import { saveIdea } from './module-repositories';
import type {
  ActivityLogEntry,
  EntityAttachment,
  EntityKind,
  EntityLink,
  EntityRef,
  EntityTag,
  SavedView,
} from './types';

export type PersonRelationshipEvent = {
  id: string;
  date: string;
  title: string;
  note: string;
  relationKind: string;
  otherPersonId: string;
  otherPersonName: string;
};

type EntityLinkRow = {
  id: string;
  source_kind: string;
  source_id: string;
  target_kind: string;
  target_id: string;
  note: string;
  created_at: number;
};

type EntityTagRow = {
  entity_kind: string;
  entity_id: string;
  tag: string;
  created_at: number;
};

type EntityAttachmentRow = {
  id: string;
  entity_kind: string;
  entity_id: string;
  name: string;
  mime_type: string;
  file_uri: string;
  size: number;
  created_at: number;
};

type SavedViewRow = {
  id: string;
  name: string;
  scope: string;
  config_json: string;
  created_at: number;
};

type ActivityLogRow = {
  id: string;
  entity_kind: string;
  entity_id: string;
  action: string;
  label: string;
  created_at: number;
};

export const entityKindLabels: Record<EntityKind, string> = {
  note: 'Note',
  list: 'Liste',
  person: 'Contact',
  project: 'Projet',
  reminder: 'Rappel',
  routine: 'Routine',
  template: 'Modèle',
  book: 'Livre',
  idea: 'Idée',
  substance: 'Substance',
  dose: 'Prise',
  sleep: 'Sommeil',
  physical_activity: 'Activité physique',
  game: 'Jeu',
  country: 'Pays',
  concert: 'Concert',
  treatment: 'Traitement',
  journal: 'Journal',
  objective: 'Objectif',
  timeline: 'Frise',
};

export const sensitiveEntityKinds: EntityKind[] = ['dose', 'substance', 'treatment'];

const entityKinds = Object.keys(entityKindLabels) as EntityKind[];

function isEntityKind(value: string): value is EntityKind {
  return entityKinds.includes(value as EntityKind);
}

export function getEntityKey(input: Pick<EntityRef, 'kind' | 'id'>) {
  return `${input.kind}:${input.id}`;
}

export function getEntityLabel(entity: EntityRef | null | undefined) {
  if (!entity) {
    return 'Element introuvable';
  }

  return `${entityKindLabels[entity.kind]} · ${entity.label}`;
}

function compact(value: string, maxLength = 72) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function localDayLabel(value: string) {
  const date = value.includes('T') ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function mapLink(row: EntityLinkRow): EntityLink | null {
  if (!isEntityKind(row.source_kind) || !isEntityKind(row.target_kind)) {
    return null;
  }

  return {
    id: row.id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    note: decryptField(row.note),
    createdAt: row.created_at,
  };
}

function mapTag(row: EntityTagRow): EntityTag | null {
  if (!isEntityKind(row.entity_kind)) {
    return null;
  }

  return {
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    tag: row.tag,
    createdAt: row.created_at,
  };
}

function parseConfig(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function mapSavedView(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    name: decryptField(row.name),
    scope: row.scope,
    config: parseConfig(row.config_json),
    createdAt: row.created_at,
  };
}

function mapActivity(row: ActivityLogRow): ActivityLogEntry | null {
  if (!isEntityKind(row.entity_kind)) {
    return null;
  }

  return {
    id: row.id,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    action: row.action,
    label: decryptField(row.label),
    createdAt: row.created_at,
  };
}

function normalizeTag(value: string) {
  return value.trim().replace(/^#/, '').toLowerCase();
}

function replaceTagInList(tags: string[], oldTag: string, newTag: string | null) {
  const nextTags: string[] = [];

  tags.forEach((tag) => {
    const normalized = normalizeTag(tag);
    if (!normalized) {
      return;
    }

    const candidate = normalized === oldTag ? newTag : normalized;
    if (candidate && !nextTags.includes(candidate)) {
      nextTags.push(candidate);
    }
  });

  return nextTags;
}

function normalizePair(input: {
  sourceKind: EntityKind;
  sourceId: string;
  targetKind: EntityKind;
  targetId: string;
}) {
  const leftKey = `${input.sourceKind}:${input.sourceId}`;
  const rightKey = `${input.targetKind}:${input.targetId}`;

  if (leftKey <= rightKey) {
    return input;
  }

  return {
    sourceKind: input.targetKind,
    sourceId: input.targetId,
    targetKind: input.sourceKind,
    targetId: input.sourceId,
  };
}

export async function listAllEntityRefs(db: SQLiteDatabase, input: { showSensitive: boolean }) {
  const [
    notes,
    lists,
    people,
    projects,
    reminders,
    routines,
    templates,
    books,
    ideas,
    substances,
    doses,
    games,
    countries,
    concerts,
    treatments,
    journal,
    objectives,
    timeline,
  ] = await Promise.all([
    listNotes(db),
    listChecklists(db),
    listPeople(db),
    listProjects(db),
    listReminders(db),
    listRoutines(db),
    listTemplates(db),
    listBooks(db),
    listIdeas(db),
    input.showSensitive ? listSubstances(db) : Promise.resolve([]),
    input.showSensitive ? listDoses(db) : Promise.resolve([]),
    listGames(db),
    listCountries(db),
    listConcerts(db),
    input.showSensitive ? listTreatments(db) : Promise.resolve([]),
    listJournalEntries(db),
    listObjectives(db),
    listTimelineEntries(db),
  ]);

  const refs: EntityRef[] = [
    ...notes.map((note) => ({ kind: 'note' as const, id: note.id, label: note.title, detail: compact(note.body), sensitive: false })),
    ...lists.map((list) => ({ kind: 'list' as const, id: list.id, label: list.name, detail: `${list.doneCount}/${list.itemCount} termines`, sensitive: false })),
    ...people.map((person) => ({ kind: 'person' as const, id: person.id, label: person.name, detail: entityKindLabels.person, sensitive: false })),
    ...projects.map((project) => ({ kind: 'project' as const, id: project.id, label: project.name, detail: project.deadline ? `Echeance ${localDayLabel(project.deadline)}` : project.status, sensitive: false })),
    ...reminders.map((reminder) => ({ kind: 'reminder' as const, id: reminder.id, label: reminder.title, detail: localDayLabel(reminder.scheduledFor), sensitive: false })),
    ...routines.map((routine) => ({ kind: 'routine' as const, id: routine.key, label: routine.label, detail: routine.enabled ? `Chaque jour a ${routine.time}` : 'Desactivee', sensitive: false })),
    ...templates.map((template) => ({ kind: 'template' as const, id: template.id, label: template.name, detail: compact(template.body), sensitive: false })),
    ...books.map((book) => ({ kind: 'book' as const, id: book.id, label: book.name, detail: book.author || book.status, sensitive: false })),
    ...ideas.map((idea) => ({ kind: 'idea' as const, id: idea.id, label: compact(idea.text), detail: idea.status, sensitive: false })),
    ...substances.map((substance) => ({ kind: 'substance' as const, id: substance.id, label: substance.name, detail: substance.category, sensitive: true })),
    ...doses.map((dose) => ({ kind: 'dose' as const, id: dose.id, label: dose.substance, detail: localDayLabel(dose.datetime), sensitive: true })),
    ...games.map((game) => ({ kind: 'game' as const, id: game.id, label: game.name, detail: game.platform || game.status, sensitive: false })),
    ...countries.map((country) => ({ kind: 'country' as const, id: country.id, label: country.name, detail: [country.city, country.year].filter(Boolean).join(' · ') || country.region, sensitive: false })),
    ...concerts.map((concert) => ({ kind: 'concert' as const, id: concert.id, label: concert.name, detail: concert.venue || localDayLabel(concert.date), sensitive: false })),
    ...treatments.map((treatment) => ({ kind: 'treatment' as const, id: treatment.id, label: treatment.name || 'Traitement', detail: treatment.dose || `${treatment.takenDays.length} jours coches`, sensitive: true })),
    ...journal.map((entry) => ({ kind: 'journal' as const, id: entry.date, label: `Journal du ${localDayLabel(entry.date)}`, detail: entry.text || `Humeur ${entry.mood}/5`, sensitive: false })),
    ...objectives.map((objective) => ({ kind: 'objective' as const, id: objective.id, label: objective.title, detail: `${objective.progress}% · ${objective.scope}`, sensitive: false })),
    ...timeline.map((entry) => ({ kind: 'timeline' as const, id: entry.id, label: entry.title, detail: localDayLabel(entry.date), sensitive: false })),
  ];

  return refs.sort((left, right) => left.label.localeCompare(right.label, 'fr-FR'));
}

export async function listEntityLinks(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<EntityLinkRow>('SELECT * FROM entity_links ORDER BY created_at DESC');
  return rows.flatMap((row) => {
    const link = mapLink(row);
    return link ? [link] : [];
  });
}

export async function listPersonRelatedEntityRefsByPersonId(
  db: SQLiteDatabase,
  input: { showSensitive: boolean },
) {
  const [entities, links, projects, ideas, tags] = await Promise.all([
    listAllEntityRefs(db, input),
    listEntityLinks(db),
    listProjects(db),
    listIdeas(db),
    listEntityTags(db),
  ]);
  const refsByKey = new Map(entities.map((entity) => [getEntityKey(entity), entity]));
  const relationTimelineIds = new Set(
    tags.flatMap((tag) => (tag.entityKind === 'timeline' && tag.tag.startsWith('relation-') ? [tag.entityId] : [])),
  );
  const relatedByPersonId = new Map<string, Map<string, EntityRef>>();

  const addRelated = (personId: string, entityKind: EntityKind, entityId: string) => {
    if (entityKind === 'timeline' && relationTimelineIds.has(entityId)) {
      return;
    }

    const entity = refsByKey.get(getEntityKey({ kind: entityKind, id: entityId }));
    if (!entity || entity.kind === 'person') {
      return;
    }

    const current = relatedByPersonId.get(personId) ?? new Map<string, EntityRef>();
    current.set(getEntityKey(entity), entity);
    relatedByPersonId.set(personId, current);
  };

  links.forEach((link) => {
    if (link.sourceKind === 'person') {
      addRelated(link.sourceId, link.targetKind, link.targetId);
    }

    if (link.targetKind === 'person') {
      addRelated(link.targetId, link.sourceKind, link.sourceId);
    }
  });

  projects.forEach((project) => {
    project.people.forEach((personId) => addRelated(personId, 'project', project.id));
  });

  ideas.forEach((idea) => {
    idea.people.forEach((personId) => addRelated(personId, 'idea', idea.id));
  });

  return Object.fromEntries(
    [...relatedByPersonId.entries()].map(([personId, relatedRefs]) => [
      personId,
      [...relatedRefs.values()].sort((left, right) => {
        const kindDelta = entityKindLabels[left.kind].localeCompare(entityKindLabels[right.kind], 'fr-FR');
        return kindDelta || left.label.localeCompare(right.label, 'fr-FR');
      }),
    ]),
  );
}

export async function listPersonRelationshipEventsByPersonId(db: SQLiteDatabase) {
  const [people, timelineEntries, links, tags] = await Promise.all([
    listPeople(db),
    listTimelineEntries(db),
    listEntityLinks(db),
    listEntityTags(db),
  ]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const relationKindByTimelineId = new Map(
    tags.flatMap((tag) => {
      if (tag.entityKind !== 'timeline' || !tag.tag.startsWith('relation-')) {
        return [];
      }

      return [[tag.entityId, tag.tag.replace(/^relation-/, '')]];
    }),
  );
  const personIdsByTimelineId = new Map<string, Set<string>>();

  links.forEach((link) => {
    if (link.sourceKind === 'timeline' && link.targetKind === 'person') {
      const current = personIdsByTimelineId.get(link.sourceId) ?? new Set<string>();
      current.add(link.targetId);
      personIdsByTimelineId.set(link.sourceId, current);
    }

    if (link.targetKind === 'timeline' && link.sourceKind === 'person') {
      const current = personIdsByTimelineId.get(link.targetId) ?? new Set<string>();
      current.add(link.sourceId);
      personIdsByTimelineId.set(link.targetId, current);
    }
  });

  const eventsByPersonId = new Map<string, PersonRelationshipEvent[]>();

  timelineEntries.forEach((entry) => {
    const relationKind = relationKindByTimelineId.get(entry.id);
    if (!relationKind) {
      return;
    }

    const personIds = [...(personIdsByTimelineId.get(entry.id) ?? [])].filter((personId) => peopleById.has(personId));
    if (personIds.length < 2) {
      return;
    }

    personIds.forEach((personId) => {
      const otherPeople = personIds.flatMap((otherPersonId) => {
        if (otherPersonId === personId) {
          return [];
        }

        const otherPerson = peopleById.get(otherPersonId);
        return otherPerson ? [otherPerson] : [];
      });

      if (!otherPeople.length) {
        return;
      }

      const current = eventsByPersonId.get(personId) ?? [];
      current.push({
        id: entry.id,
        date: entry.date,
        title: entry.title,
        note: entry.note,
        relationKind,
        otherPersonId: otherPeople[0].id,
        otherPersonName: otherPeople.map((person) => person.name).join(' · '),
      });
      eventsByPersonId.set(personId, current);
    });
  });

  return Object.fromEntries(
    [...eventsByPersonId.entries()].map(([personId, events]) => [
      personId,
      events.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id)),
    ]),
  );
}

export async function saveEntityLink(db: SQLiteDatabase, input: {
  sourceKind: EntityKind;
  sourceId: string;
  targetKind: EntityKind;
  targetId: string;
  note?: string;
}) {
  if (input.sourceKind === input.targetKind && input.sourceId === input.targetId) {
    return null;
  }

  const pair = normalizePair(input);
  const note = input.note?.trim() ?? '';
  const createdAt = Date.now();

  await db.runAsync(
    `INSERT INTO entity_links (id, source_kind, source_id, target_kind, target_id, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_kind, source_id, target_kind, target_id)
      DO UPDATE SET note = excluded.note`,
    createId('link'),
    pair.sourceKind,
    pair.sourceId,
    pair.targetKind,
    pair.targetId,
    note,
    createdAt,
  );

  const row = await db.getFirstAsync<EntityLinkRow>(
    'SELECT * FROM entity_links WHERE source_kind = ? AND source_id = ? AND target_kind = ? AND target_id = ?',
    pair.sourceKind,
    pair.sourceId,
    pair.targetKind,
    pair.targetId,
  );

  await logActivity(db, {
    entityKind: pair.sourceKind,
    entityId: pair.sourceId,
    action: 'link',
    label: note || 'Lien transversal ajoute',
  });

  return row ? mapLink(row) : null;
}

export async function listEntityPersonIds(db: SQLiteDatabase, input: { entityKind: EntityKind; entityId: string }) {
  const rows = await db.getAllAsync<Pick<EntityLinkRow, 'source_kind' | 'source_id' | 'target_kind' | 'target_id'>>(
    `SELECT source_kind, source_id, target_kind, target_id FROM entity_links
      WHERE (source_kind = ? AND source_id = ? AND target_kind = 'person')
        OR (target_kind = ? AND target_id = ? AND source_kind = 'person')`,
    input.entityKind,
    input.entityId,
    input.entityKind,
    input.entityId,
  );

  return rows.flatMap((row) => {
    if (row.source_kind === 'person') {
      return [row.source_id];
    }

    if (row.target_kind === 'person') {
      return [row.target_id];
    }

    return [];
  });
}

export async function replaceEntityPersonLinks(
  db: SQLiteDatabase,
  input: { entityKind: EntityKind; entityId: string; personIds: string[] },
) {
  const personIds = [...new Set(input.personIds.map((personId) => personId.trim()).filter(Boolean))];

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM entity_links
        WHERE (source_kind = ? AND source_id = ? AND target_kind = 'person')
          OR (target_kind = ? AND target_id = ? AND source_kind = 'person')`,
      input.entityKind,
      input.entityId,
      input.entityKind,
      input.entityId,
    );

    for (const personId of personIds) {
      const pair = normalizePair({
        sourceKind: input.entityKind,
        sourceId: input.entityId,
        targetKind: 'person',
        targetId: personId,
      });

      await db.runAsync(
        `INSERT OR IGNORE INTO entity_links (id, source_kind, source_id, target_kind, target_id, note, created_at)
          VALUES (?, ?, ?, ?, ?, '', ?)`,
        createId('link'),
        pair.sourceKind,
        pair.sourceId,
        pair.targetKind,
        pair.targetId,
        Date.now(),
      );
    }
  });
}

export async function deleteEntityLink(db: SQLiteDatabase, linkId: string) {
  await db.runAsync('DELETE FROM entity_links WHERE id = ?', linkId);
}

export async function listEntityTags(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<EntityTagRow>('SELECT * FROM entity_tags ORDER BY tag COLLATE NOCASE ASC');
  return rows.flatMap((row) => {
    const tag = mapTag(row);
    return tag ? [tag] : [];
  });
}

export async function addEntityTag(db: SQLiteDatabase, input: { entityKind: EntityKind; entityId: string; tag: string }) {
  const tag = normalizeTag(input.tag);
  if (!tag) {
    return null;
  }

  const createdAt = Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO entity_tags (entity_kind, entity_id, tag, created_at)
      VALUES (?, ?, ?, ?)`,
    input.entityKind,
    input.entityId,
    tag,
    createdAt,
  );

  await logActivity(db, {
    entityKind: input.entityKind,
    entityId: input.entityId,
    action: 'tag',
    label: `#${tag}`,
  });

  return {
    entityKind: input.entityKind,
    entityId: input.entityId,
    tag,
    createdAt,
  } satisfies EntityTag;
}

export async function deleteEntityTag(db: SQLiteDatabase, input: { entityKind: EntityKind; entityId: string; tag: string }) {
  await db.runAsync(
    'DELETE FROM entity_tags WHERE entity_kind = ? AND entity_id = ? AND tag = ?',
    input.entityKind,
    input.entityId,
    normalizeTag(input.tag),
  );
}

export async function renameGlobalTag(db: SQLiteDatabase, input: { from: string; to: string }) {
  const from = normalizeTag(input.from);
  const to = normalizeTag(input.to);

  if (!from || !to || from === to) {
    return 0;
  }

  const [notes, projects, ideas, entityTags, journalEntries] = await Promise.all([
    listNotes(db),
    listProjects(db),
    listIdeas(db),
    listEntityTags(db),
    listJournalEntries(db),
  ]);

  let touched = 0;

  await db.withTransactionAsync(async () => {
    for (const note of notes) {
      if (!note.tags.some((tag) => normalizeTag(tag) === from)) {
        continue;
      }

      await saveNote(db, { ...note, tags: replaceTagInList(note.tags, from, to) });
      touched += 1;
    }

    for (const project of projects) {
      if (!project.tags.some((tag) => normalizeTag(tag) === from)) {
        continue;
      }

      await saveProject(db, { ...project, tags: replaceTagInList(project.tags, from, to) });
      touched += 1;
    }

    for (const idea of ideas) {
      if (!idea.tags.some((tag) => normalizeTag(tag) === from)) {
        continue;
      }

      await saveIdea(db, { ...idea, tags: replaceTagInList(idea.tags, from, to) });
      touched += 1;
    }

    for (const entry of journalEntries) {
      if (!entry.tags || !entry.tags.some((tag) => normalizeTag(tag) === from)) {
        continue;
      }

      await saveJournalEntry(db, { ...entry, tags: replaceTagInList(entry.tags, from, to) });
      touched += 1;
    }

    for (const tag of entityTags) {
      if (tag.tag !== from) {
        continue;
      }

      await db.runAsync(
        'INSERT OR REPLACE INTO entity_tags (entity_kind, entity_id, tag, created_at) VALUES (?, ?, ?, ?)',
        tag.entityKind,
        tag.entityId,
        to,
        tag.createdAt || Date.now(),
      );
      touched += 1;
    }

    await db.runAsync('DELETE FROM entity_tags WHERE tag = ?', from);
  });

  await logActivity(db, {
    entityKind: 'note',
    entityId: `tag-${to}`,
    action: 'tag-rename',
    label: `#${from} -> #${to}`,
  });

  return touched;
}

export async function deleteGlobalTag(db: SQLiteDatabase, input: { tag: string }) {
  const tag = normalizeTag(input.tag);
  if (!tag) {
    return 0;
  }

  const [notes, projects, ideas, entityTags, journalEntries] = await Promise.all([
    listNotes(db),
    listProjects(db),
    listIdeas(db),
    listEntityTags(db),
    listJournalEntries(db),
  ]);

  let touched = 0;

  await db.withTransactionAsync(async () => {
    for (const note of notes) {
      if (!note.tags.some((currentTag) => normalizeTag(currentTag) === tag)) {
        continue;
      }

      await saveNote(db, { ...note, tags: replaceTagInList(note.tags, tag, null) });
      touched += 1;
    }

    for (const project of projects) {
      if (!project.tags.some((currentTag) => normalizeTag(currentTag) === tag)) {
        continue;
      }

      await saveProject(db, { ...project, tags: replaceTagInList(project.tags, tag, null) });
      touched += 1;
    }

    for (const idea of ideas) {
      if (!idea.tags.some((currentTag) => normalizeTag(currentTag) === tag)) {
        continue;
      }

      await saveIdea(db, { ...idea, tags: replaceTagInList(idea.tags, tag, null) });
      touched += 1;
    }

    for (const entry of journalEntries) {
      if (!entry.tags || !entry.tags.some((currentTag) => normalizeTag(currentTag) === tag)) {
        continue;
      }

      await saveJournalEntry(db, { ...entry, tags: replaceTagInList(entry.tags, tag, null) });
      touched += 1;
    }

    await db.runAsync('DELETE FROM entity_tags WHERE tag = ?', tag);
    touched += entityTags.filter((entry) => entry.tag === tag).length;
  });

  await logActivity(db, {
    entityKind: 'note',
    entityId: `tag-${tag}`,
    action: 'tag-delete',
    label: `#${tag}`,
  });

  return touched;
}

export async function listSavedViews(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<SavedViewRow>('SELECT * FROM saved_views ORDER BY created_at DESC');
  return rows.map(mapSavedView);
}

export async function saveSavedView(db: SQLiteDatabase, input: { id?: string; name: string; scope: string; config?: Record<string, unknown> }) {
  const name = input.name.trim();
  if (!name) {
    return null;
  }

  const view: SavedView = {
    id: input.id ?? createId('view'),
    name,
    scope: input.scope.trim() || 'all',
    config: input.config ?? {},
    createdAt: Date.now(),
  };

  await db.runAsync(
    `INSERT INTO saved_views (id, name, scope, config_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, scope = excluded.scope, config_json = excluded.config_json`,
    view.id,
    view.name,
    view.scope,
    encryptField(JSON.stringify(view.config)),
    view.createdAt,
  );

  await logActivity(db, {
    entityKind: 'note',
    entityId: view.id,
    action: 'view',
    label: `Vue ${view.name}`,
  });

  return view;
}

export async function deleteSavedView(db: SQLiteDatabase, viewId: string) {
  await db.runAsync('DELETE FROM saved_views WHERE id = ?', viewId);
}

export async function listActivityLog(db: SQLiteDatabase, limit = 40) {
  const rows = await db.getAllAsync<ActivityLogRow>(
    'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?',
    limit,
  );
  return rows.flatMap((row) => {
    const entry = mapActivity(row);
    return entry ? [entry] : [];
  });
}

export async function logActivity(db: SQLiteDatabase, input: { entityKind: EntityKind; entityId: string; action: string; label: string }) {
  await db.runAsync(
    'INSERT INTO activity_log (id, entity_kind, entity_id, action, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    createId('activity'),
    input.entityKind,
    input.entityId,
    input.action.trim() || 'update',
    input.label.trim(),
    Date.now(),
  );

  await db.runAsync(
    `DELETE FROM activity_log WHERE id NOT IN (
      SELECT id FROM activity_log ORDER BY created_at DESC LIMIT 200
    )`,
  );
}

export async function replaceCrossData(db: SQLiteDatabase, input: {
  links?: EntityLink[];
  entityTags?: EntityTag[];
  savedViews?: SavedView[];
  activityLog?: ActivityLogEntry[];
}) {
  await db.runAsync('DELETE FROM entity_links');
  await db.runAsync('DELETE FROM entity_tags');
  await db.runAsync('DELETE FROM saved_views');
  await db.runAsync('DELETE FROM activity_log');

  for (const link of input.links ?? []) {
    const pair = normalizePair({
      sourceKind: link.sourceKind,
      sourceId: link.sourceId,
      targetKind: link.targetKind,
      targetId: link.targetId,
    });

    await db.runAsync(
      `INSERT OR REPLACE INTO entity_links (id, source_kind, source_id, target_kind, target_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      link.id || createId('link'),
      pair.sourceKind,
      pair.sourceId,
      pair.targetKind,
      pair.targetId,
      link.note ?? '',
      link.createdAt || Date.now(),
    );
  }

  for (const tag of input.entityTags ?? []) {
    const normalizedTag = normalizeTag(tag.tag);
    if (!normalizedTag) {
      continue;
    }

    await db.runAsync(
      'INSERT OR REPLACE INTO entity_tags (entity_kind, entity_id, tag, created_at) VALUES (?, ?, ?, ?)',
      tag.entityKind,
      tag.entityId,
      normalizedTag,
      tag.createdAt || Date.now(),
    );
  }

  for (const view of input.savedViews ?? []) {
    await db.runAsync(
      'INSERT OR REPLACE INTO saved_views (id, name, scope, config_json, created_at) VALUES (?, ?, ?, ?, ?)',
      view.id || createId('view'),
      view.name,
      view.scope || 'all',
      JSON.stringify(view.config ?? {}),
      view.createdAt || Date.now(),
    );
  }

  for (const entry of input.activityLog ?? []) {
    await db.runAsync(
      'INSERT OR REPLACE INTO activity_log (id, entity_kind, entity_id, action, label, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      entry.id || createId('activity'),
      entry.entityKind,
      entry.entityId,
      entry.action || 'update',
      entry.label || '',
      entry.createdAt || Date.now(),
    );
  }
}

function mapAttachment(row: EntityAttachmentRow): EntityAttachment | null {
  if (!isEntityKind(row.entity_kind)) {
    return null;
  }

  return {
    id: row.id,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    name: decryptField(row.name),
    mimeType: row.mime_type,
    fileUri: row.file_uri,
    size: row.size,
    createdAt: row.created_at,
  };
}

export async function listEntityAttachments(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<EntityAttachmentRow>('SELECT * FROM entity_attachments ORDER BY created_at DESC');
  return rows.flatMap((row) => {
    const attachment = mapAttachment(row);
    return attachment ? [attachment] : [];
  });
}

export async function saveEntityAttachment(db: SQLiteDatabase, input: {
  id?: string;
  entityKind: EntityKind;
  entityId: string;
  name: string;
  mimeType?: string;
  fileUri: string;
  size?: number;
}) {
  const name = input.name.trim() || 'Piece jointe';
  const fileUri = input.fileUri.trim();
  if (!fileUri) {
    return null;
  }

  const attachment: EntityAttachment = {
    id: input.id ?? createId('att'),
    entityKind: input.entityKind,
    entityId: input.entityId,
    name,
    mimeType: input.mimeType?.trim() ?? '',
    fileUri,
    size: input.size ?? 0,
    createdAt: Date.now(),
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO entity_attachments (id, entity_kind, entity_id, name, mime_type, file_uri, size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    attachment.id,
    attachment.entityKind,
    attachment.entityId,
    attachment.name,
    attachment.mimeType,
    attachment.fileUri,
    attachment.size,
    attachment.createdAt,
  );

  await logActivity(db, {
    entityKind: attachment.entityKind,
    entityId: attachment.entityId,
    action: 'attachment',
    label: attachment.name,
  });

  return attachment;
}

export async function deleteEntityAttachment(db: SQLiteDatabase, attachmentId: string) {
  await db.runAsync('DELETE FROM entity_attachments WHERE id = ?', attachmentId);
}