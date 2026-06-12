import type { SQLiteDatabase } from 'expo-sqlite';
import { Note, Person, Reminder, Routine, ChecklistSummary, SleepEntry, Treatment, JournalEntry, Objective, PhysicalActivity } from './types';
import { listPeople, listReminders, listRoutines, listChecklists, listTreatments, listJournalEntries, listObjectives } from './repositories';
import { listSleepEntries, listPhysicalActivities } from './module-repositories';

export interface DashboardMetrics {
  counts: {
    notes: number; checklists: number; pendingItems: number; reminders: number; routines: number; ideas: number; links: number; tags: number; doses: number; substances: number; sleep: number; activities: number; people: number; projects: number; templates: number; books: number; games: number; countries: number; concerts: number;
  };
  totalTags: number;
}

export interface DashboardData {
  metrics: DashboardMetrics; latestNotes: Note[]; people: Person[]; reminders: Reminder[]; routines: Routine[]; checklists: ChecklistSummary[]; treatments: Treatment[]; journalEntries: JournalEntry[]; sleepEntries: SleepEntry[]; activities: PhysicalActivity[]; objectives: Objective[];
}

export async function getDashboardData(db: SQLiteDatabase, showSensitive: boolean, reviewDays: number): Promise<DashboardData> {
  const metricsPromise = (async () => {
    const [notes, checklists, pendingItems, reminders, routines, ideas, links, doses, substances, sleep, activities, people, projects, templates, books, games, countries, concerts] = await Promise.all([
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM notes WHERE archived = 0').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM lists').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM (SELECT list_id FROM list_items WHERE done = 0)').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM reminders WHERE status = \"scheduled\"').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM routines WHERE enabled = 1').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM ideas').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM entity_links').then(r => r?.c ?? 0),
      showSensitive ? db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM doses').then(r => r?.c ?? 0) : 0,
      showSensitive ? db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM substances').then(r => r?.c ?? 0) : 0,
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM sleep_entries').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM physical_activities').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM people').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM projects').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM templates').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM books').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM games').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM countries').then(r => r?.c ?? 0),
      db.getFirstAsync<{c: number}>('SELECT count(*) as c FROM concerts').then(r => r?.c ?? 0),
    ]);

    const tagsQuery = 'SELECT tag FROM entity_tags ' + (!showSensitive ? 'WHERE entity_kind NOT IN (\"dose\", \"substance\", \"treatment\")' : '');
    const [noteTags, projectTags, ideaTags, entityTags] = await Promise.all([
      db.getAllAsync<{tags_json: string}>('SELECT tags_json FROM notes'),
      db.getAllAsync<{tags_json: string}>('SELECT tags_json FROM projects'),
      db.getAllAsync<{tags_json: string}>('SELECT tags_json FROM ideas'),
      db.getAllAsync<{tag: string}>(tagsQuery)
    ]);

    const tagSet = new Set<string>();
    const parse = (items: any[]) => items.forEach((i: any) => { try { JSON.parse(i.tags_json).forEach((t: any) => tagSet.add(t.trim().toLowerCase())); } catch{} });
    parse(noteTags); parse(projectTags); parse(ideaTags);
    entityTags.forEach(r => { if(r.tag) tagSet.add(r.tag.trim().toLowerCase()); });

    return { counts: { notes, checklists, pendingItems, reminders, routines, ideas, links, tags: entityTags.length, doses, substances, sleep, activities, people, projects, templates, books, games, countries, concerts }, totalTags: tagSet.size };
  })();

  const d = new Date(); d.setDate(d.getDate() - reviewDays);
  const recentLimitDate = d.toISOString().slice(0, 10);

  const [metrics, people, reminders, routines, checklists, treatments, journalEntries, sleepEntries, activities, objectives, rawNotes] = await Promise.all([
    metricsPromise, listPeople(db), listReminders(db), listRoutines(db), listChecklists(db), listTreatments(db),
    db.getAllAsync<any>('SELECT * FROM journal_entries WHERE date >= ? ORDER BY date DESC LIMIT 100', recentLimitDate),
    db.getAllAsync<any>('SELECT * FROM sleep_entries WHERE date >= ? ORDER BY date DESC LIMIT 100', recentLimitDate),
    db.getAllAsync<any>('SELECT * FROM physical_activities WHERE date >= ? ORDER BY date DESC LIMIT 100', recentLimitDate),
    listObjectives(db),
    db.getAllAsync<any>('SELECT * FROM notes WHERE archived = 0 ORDER BY pinned DESC, updated_at DESC LIMIT 2'),
  ]);

  return {
    metrics, people, reminders, routines, checklists, treatments, objectives,
    journalEntries: journalEntries.map((row) => ({ date: row.date, mood: row.mood, text: row.text })),
    sleepEntries: sleepEntries.map((row) => ({ id: row.id, date: row.date, start_time: row.start_time, end_time: row.end_time, durationMinutes: row.duration_minutes, quality: row.quality, notes: row.notes, createdAt: row.created_at } as any)),
    activities: activities.map((row) => ({ id: row.id, date: row.date, type: row.type, durationMinutes: row.duration_minutes, intensity: row.intensity, notes: row.notes, createdAt: row.created_at } as any)),
    latestNotes: rawNotes.map(row => ({ id: row.id, title: row.title, body: row.body, tags: JSON.parse(row.tags_json || '[]'), updatedAt: row.updated_at } as any)),
  };
}

export interface SearchResultItem { id: string; source: string; title: string; meta: string; extra?: string; action_id?: string; }

export async function searchAll(db: SQLiteDatabase, query: string, showSensitive: boolean): Promise<SearchResultItem[]> {
  const l = '%' + query + '%';
  const sql = "SELECT id, 'notes' as source, title, body as meta, '' as extra, '' as action_id FROM notes WHERE title LIKE ? OR body LIKE ? OR tags_json LIKE ? UNION ALL SELECT id, 'checklists' as source, name as title, '' as meta, '' as extra, '' as action_id FROM lists WHERE name LIKE ? UNION ALL SELECT id, 'people' as source, name as title, note as meta, phone || ' ' || address || ' ' || interests_json as extra, '' as action_id FROM people WHERE name LIKE ? OR note LIKE ? OR phone LIKE ? OR address LIKE ? OR interests_json LIKE ? UNION ALL SELECT id, 'projects' as source, name as title, notes as meta, tags_json as extra, '' as action_id FROM projects WHERE name LIKE ? OR notes LIKE ? OR tags_json LIKE ? UNION ALL SELECT id, 'reminders' as source, title, '' as meta, status as extra, id as action_id FROM reminders WHERE title LIKE ? UNION ALL SELECT routine_key as id, 'routines' as source, label as title, time as meta, cast(enabled as text) as extra, '' as action_id FROM routines WHERE enabled = 1 AND (label LIKE ? OR time LIKE ?) UNION ALL SELECT id, 'templates' as source, name as title, body as meta, '' as extra, '' as action_id FROM templates WHERE name LIKE ? OR body LIKE ? UNION ALL SELECT date as id, 'journal' as source, text as title, date as meta, '' as extra, '' as action_id FROM journal_entries WHERE date LIKE ? OR text LIKE ? UNION ALL SELECT id, 'objectives' as source, title, deadline as meta, scope as extra, '' as action_id FROM objectives WHERE title LIKE ? OR deadline LIKE ? OR scope LIKE ? UNION ALL SELECT id, 'timeline' as source, title, note as meta, date as extra, '' as action_id FROM timeline_entries WHERE title LIKE ? OR note LIKE ? OR date LIKE ? UNION ALL SELECT id, 'books' as source, name as title, author as meta, notes as extra, '' as action_id FROM books WHERE name LIKE ? OR author LIKE ? OR notes LIKE ? UNION ALL SELECT id, 'ideas' as source, text as title, tags_json as meta, '' as extra, '' as action_id FROM ideas WHERE text LIKE ? OR tags_json LIKE ? UNION ALL SELECT id, 'links' as source, note as title, '' as meta, '' as extra, '' as action_id FROM entity_links WHERE note LIKE ? UNION ALL SELECT id, 'games' as source, name as title, platform as meta, notes as extra, '' as action_id FROM games WHERE name LIKE ? OR platform LIKE ? OR notes LIKE ? UNION ALL SELECT id, 'countries' as source, name as title, city || ' ' || year as meta, notes as extra, '' as action_id FROM countries WHERE name LIKE ? OR city LIKE ? OR year LIKE ? OR notes LIKE ? UNION ALL SELECT id, 'concerts' as source, name as title, venue as meta, notes as extra, '' as action_id FROM concerts WHERE name LIKE ? OR venue LIKE ? OR notes LIKE ? " + (showSensitive ? "UNION ALL SELECT id, 'treatments' as source, name as title, dose as meta, '' as extra, '' as action_id FROM treatments WHERE name LIKE ? OR dose LIKE ? UNION ALL SELECT id, 'substances' as source, name as title, notes as meta, first_tried as extra, '' as action_id FROM substances WHERE name LIKE ? OR notes LIKE ? OR first_tried LIKE ? UNION ALL SELECT id, 'doses' as source, substance as title, notes as meta, context_tags_json as extra, '' as action_id FROM doses WHERE substance LIKE ? OR notes LIKE ? OR context_tags_json LIKE ? " : '') + ' LIMIT 30';

  let p = [l,l,l, l, l,l,l,l,l, l,l,l, l, l,l, l,l, l,l, l,l,l, l,l,l, l,l,l, l,l, l, l,l,l, l,l,l,l, l,l,l];
  if (showSensitive) { p.push(l,l, l,l,l, l,l,l); }
  return db.getAllAsync<SearchResultItem>(sql, p);
}
