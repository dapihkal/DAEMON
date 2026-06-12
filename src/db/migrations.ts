import type { SQLiteDatabase } from 'expo-sqlite';

import { defaultPersonCategories } from '../lib/person-categories';
import { seedDatabaseIfNeeded } from './repositories';
import { initDbEncryptionKey } from '../lib/db-crypto';

const DATABASE_VERSION = 25;

async function getTableColumnNames(db: SQLiteDatabase, tableName: string) {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((row) => row.name));
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

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  try {
    await initDbEncryptionKey();
    
    await db.execAsync(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
    `);

    const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        scheduled_for TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled',
        notification_id TEXT,
        repeat_rule TEXT NOT NULL DEFAULT 'none',
        category TEXT NOT NULL DEFAULT 'rappel'
      );
      CREATE TABLE IF NOT EXISTS routines (
        routine_key TEXT PRIMARY KEY NOT NULL,
        label TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        time TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS list_items (
        id TEXT PRIMARY KEY NOT NULL,
        list_id TEXT NOT NULL,
        text TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        secondary_categories_json TEXT NOT NULL DEFAULT '[]',
        photo_uri TEXT NOT NULL DEFAULT '',
        favorite INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        birthday TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        last_contacted_at TEXT NOT NULL DEFAULT '',
        contact_frequency TEXT NOT NULL DEFAULT 'none',
        relationship_status TEXT NOT NULL DEFAULT 'stable',
        interests_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        role TEXT NOT NULL DEFAULT '',
        organization TEXT NOT NULL DEFAULT '',
        links_json TEXT NOT NULL DEFAULT '[]',
        profile_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        deadline TEXT NOT NULL DEFAULT '',
        people_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'explorer',
        people_json TEXT NOT NULL DEFAULT '[]',
        pinned INTEGER NOT NULL DEFAULT 0,
        subtasks_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        publish_date TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS substances (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'autre',
        first_tried TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS doses (
        id TEXT PRIMARY KEY NOT NULL,
        substance TEXT NOT NULL,
        dose TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT '',
        route TEXT NOT NULL DEFAULT '',
        datetime TEXT NOT NULL,
        cost TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        feel INTEGER NOT NULL DEFAULT 0,
        context_tags_json TEXT NOT NULL DEFAULT '[]',
        session_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'alire',
        rating INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS treatment_profile (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        name TEXT NOT NULL DEFAULT '',
        dose TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS treatment_log (
        day TEXT PRIMARY KEY NOT NULL
      );
      CREATE TABLE IF NOT EXISTS treatments (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        dose TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS treatment_logs (
        treatment_id TEXT NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (treatment_id, day),
        FOREIGN KEY (treatment_id) REFERENCES treatments(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS journal_entries (
        date TEXT PRIMARY KEY NOT NULL,
        mood INTEGER NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS objectives (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        scope TEXT NOT NULL,
        deadline TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        events_json TEXT NOT NULL DEFAULT '[]',
        progress INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS timeline_entries (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'aplayer',
        rating INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS countries (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        city TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT 'autre',
        rating INTEGER NOT NULL DEFAULT 0,
        year TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS concerts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        venue TEXT NOT NULL DEFAULT '',
        rating INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entity_links (
        id TEXT PRIMARY KEY NOT NULL,
        source_kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        UNIQUE(source_kind, source_id, target_kind, target_id)
      );
      CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(source_kind, source_id);
      CREATE INDEX IF NOT EXISTS idx_entity_links_target ON entity_links(target_kind, target_id);
      CREATE TABLE IF NOT EXISTS entity_tags (
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(entity_kind, entity_id, tag)
      );
      CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag);
      CREATE TABLE IF NOT EXISTS entity_attachments (
        id TEXT PRIMARY KEY NOT NULL,
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT '',
        file_uri TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entity_attachments_entity ON entity_attachments(entity_kind, entity_id);
      CREATE TABLE IF NOT EXISTS saved_views (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'all',
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY NOT NULL,
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_kind, entity_id);
      CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_title_nocase ON notes(title COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_people_name_nocase ON people(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_people_category ON people(category);
      CREATE INDEX IF NOT EXISTS idx_people_favorite ON people(favorite DESC, name COLLATE NOCASE);
    `);

    await seedDatabaseIfNeeded(db);
  currentVersion = 16;
  }

  if (currentVersion === 1) {
    const reminderColumns = await getTableColumnNames(db, 'reminders');

    if (!reminderColumns.has('repeat_rule')) {
      await db.execAsync(`
        ALTER TABLE reminders ADD COLUMN repeat_rule TEXT NOT NULL DEFAULT 'none';
      `);
    }

    if (!reminderColumns.has('category')) {
      await db.execAsync(`
        ALTER TABLE reminders ADD COLUMN category TEXT NOT NULL DEFAULT 'rappel';
      `);
    }

    currentVersion = 2;
  }

  if (currentVersion === 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS list_items (
        id TEXT PRIMARY KEY NOT NULL,
        list_id TEXT NOT NULL,
        text TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
      );
    `);

    currentVersion = 3;
  }

  if (currentVersion === 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        birthday TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        interests_json TEXT NOT NULL DEFAULT '[]',
        links_json TEXT NOT NULL DEFAULT '[]'
      );
    `);

    currentVersion = 4;
  }

  if (currentVersion === 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        deadline TEXT NOT NULL DEFAULT '',
        people_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );
    `);

    currentVersion = 5;
  }

  if (currentVersion === 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT ''
      );
    `);

    currentVersion = 6;
  }

  if (currentVersion === 6) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'alire',
        rating INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
    `);

    currentVersion = 7;
  }

  if (currentVersion === 7) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS treatment_profile (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        name TEXT NOT NULL DEFAULT '',
        dose TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS treatment_log (
        day TEXT PRIMARY KEY NOT NULL
      );
    `);

    currentVersion = 8;
  }

  if (currentVersion === 8) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        date TEXT PRIMARY KEY NOT NULL,
        mood INTEGER NOT NULL,
        text TEXT NOT NULL DEFAULT ''
      );
    `);

    currentVersion = 9;
  }

  if (currentVersion === 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS objectives (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        scope TEXT NOT NULL,
        deadline TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        events_json TEXT NOT NULL DEFAULT '[]',
        progress INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS timeline_entries (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT ''
      );
    `);

    currentVersion = 10;
  }

  if (currentVersion === 10) {
    const peopleColumns = await getTableColumnNames(db, 'people');

    if (!peopleColumns.has('secondary_categories_json')) {
      await db.execAsync(`
        ALTER TABLE people ADD COLUMN secondary_categories_json TEXT NOT NULL DEFAULT '[]';
      `);
    }

    currentVersion = 11;
  }

  if (currentVersion === 11) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY NOT NULL,
        text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'explorer',
        people_json TEXT NOT NULL DEFAULT '[]',
        pinned INTEGER NOT NULL DEFAULT 0,
        subtasks_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        publish_date TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS substances (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'autre',
        first_tried TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS doses (
        id TEXT PRIMARY KEY NOT NULL,
        substance TEXT NOT NULL,
        dose TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT '',
        route TEXT NOT NULL DEFAULT '',
        datetime TEXT NOT NULL,
        cost TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        feel INTEGER NOT NULL DEFAULT 0,
        context_tags_json TEXT NOT NULL DEFAULT '[]',
        session_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'aplayer',
        rating INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS countries (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        city TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT 'autre',
        rating INTEGER NOT NULL DEFAULT 0,
        year TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS concerts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        venue TEXT NOT NULL DEFAULT '',
        rating INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
    `);

    currentVersion = 12;
  }

  if (currentVersion === 12) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS entity_links (
        id TEXT PRIMARY KEY NOT NULL,
        source_kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        UNIQUE(source_kind, source_id, target_kind, target_id)
      );
      CREATE INDEX IF NOT EXISTS idx_entity_links_source ON entity_links(source_kind, source_id);
      CREATE INDEX IF NOT EXISTS idx_entity_links_target ON entity_links(target_kind, target_id);
      CREATE TABLE IF NOT EXISTS entity_tags (
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(entity_kind, entity_id, tag)
      );
      CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag);
      CREATE TABLE IF NOT EXISTS saved_views (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'all',
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY NOT NULL,
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_kind, entity_id);
    `);

    currentVersion = 13;
  }

  if (currentVersion === 13) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS treatments (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        dose TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS treatment_logs (
        treatment_id TEXT NOT NULL,
        day TEXT NOT NULL,
        PRIMARY KEY (treatment_id, day),
        FOREIGN KEY (treatment_id) REFERENCES treatments(id) ON DELETE CASCADE
      );
      INSERT OR IGNORE INTO treatments (id, name, dose, created_at)
      SELECT
        'treatment-legacy',
        COALESCE((SELECT name FROM treatment_profile WHERE id = 1), ''),
        COALESCE((SELECT dose FROM treatment_profile WHERE id = 1), ''),
        CAST(strftime('%s', 'now') AS INTEGER) * 1000
      WHERE
        EXISTS (SELECT 1 FROM treatment_profile WHERE id = 1 AND (name <> '' OR dose <> ''))
        OR EXISTS (SELECT 1 FROM treatment_log);
      INSERT OR IGNORE INTO treatment_logs (treatment_id, day)
      SELECT 'treatment-legacy', day FROM treatment_log
      WHERE EXISTS (SELECT 1 FROM treatments WHERE id = 'treatment-legacy');
    `);

    currentVersion = 14;
  }

  if (currentVersion === 14) {
    const objectiveColumns = await getTableColumnNames(db, 'objectives');

    if (!objectiveColumns.has('details')) {
      await db.execAsync(`
        ALTER TABLE objectives ADD COLUMN details TEXT NOT NULL DEFAULT '';
      `);
    }

    currentVersion = 15;
  }

  if (currentVersion === 15) {
    const objectiveColumns = await getTableColumnNames(db, 'objectives');

    if (!objectiveColumns.has('events_json')) {
      await db.execAsync(`
        ALTER TABLE objectives ADD COLUMN events_json TEXT NOT NULL DEFAULT '[]';
        UPDATE objectives
        SET events_json = '[{"id":"legacy-' || REPLACE(id, '"', '') || '","title":"Progression existante","percent":' ||
          CASE
            WHEN progress < 0 THEN 0
            WHEN progress > 100 THEN 100
            ELSE progress
          END || '}]'
        WHERE progress > 0;
      `);
    }

    currentVersion = 16;
  }

  if (currentVersion === 16) {
    const objectiveColumns = await getTableColumnNames(db, 'objectives');
    if (objectiveColumns.size > 0) {
      if (!objectiveColumns.has('details')) {
        await db.execAsync(`
          ALTER TABLE objectives ADD COLUMN details TEXT NOT NULL DEFAULT '';
        `);
      }
      if (!objectiveColumns.has('events_json')) {
        await db.execAsync(`
          ALTER TABLE objectives ADD COLUMN events_json TEXT NOT NULL DEFAULT '[]';
        `);
      }
    } else {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS objectives (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          scope TEXT NOT NULL,
          deadline TEXT NOT NULL DEFAULT '',
          details TEXT NOT NULL DEFAULT '',
          events_json TEXT NOT NULL DEFAULT '[]',
          progress INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
      `);
    }

    currentVersion = 17;
  }

  if (currentVersion === 17) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sleep_entries (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        bedtime TEXT NOT NULL DEFAULT '',
        wake_time TEXT NOT NULL DEFAULT '',
        quality INTEGER NOT NULL DEFAULT 3,
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sleep_entries_date ON sleep_entries(date);
      CREATE TABLE IF NOT EXISTS physical_activities (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        activity_type TEXT NOT NULL DEFAULT '',
        duration_minutes INTEGER NOT NULL DEFAULT 0,
        intensity INTEGER NOT NULL DEFAULT 3,
        notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_physical_activities_date ON physical_activities(date);
    `);

    currentVersion = 18;
  }

  if (currentVersion === 18) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS entity_attachments (
        id TEXT PRIMARY KEY NOT NULL,
        entity_kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT '',
        file_uri TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entity_attachments_entity ON entity_attachments(entity_kind, entity_id);
    `);

    currentVersion = 19;
  }

  if (currentVersion === 19) {
    const peopleColumns = await getTableColumnNames(db, 'people');

    if (!peopleColumns.has('photo_uri')) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN photo_uri TEXT NOT NULL DEFAULT '';`);
    }
    if (!peopleColumns.has('favorite')) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!peopleColumns.has('last_contacted_at')) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN last_contacted_at TEXT NOT NULL DEFAULT '';`);
    }
    if (!peopleColumns.has('contact_frequency')) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN contact_frequency TEXT NOT NULL DEFAULT 'none';`);
    }
    if (!peopleColumns.has('relationship_status')) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN relationship_status TEXT NOT NULL DEFAULT 'stable';`);
    }
    if (!peopleColumns.has('tags_json')) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';`);
    }
    if (!peopleColumns.has('profile_json')) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}';`);
    }

    currentVersion = 20;
  }

  if (currentVersion === 20) {
    await ensurePersonCategoriesTableAsync(db);

    currentVersion = 21;
  }

  if (currentVersion === 21) {
    const peopleColumns = await getTableColumnNames(db, 'people');

    if (!peopleColumns.has('role')) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN role TEXT NOT NULL DEFAULT '';`);
    }
    if (!peopleColumns.has('organization')) {
      await db.execAsync(`ALTER TABLE people ADD COLUMN organization TEXT NOT NULL DEFAULT '';`);
    }

    // Update categories: migrate old ones to new ones or 'autre'
    // amoureuse, amante, crush, amis, perdusvue, autre -> relation
    await db.execAsync(`
      UPDATE people SET category = 'relation' WHERE category IN ('amoureuse', 'amante', 'crush', 'amis', 'perdusvue', 'autre');
      DELETE FROM person_categories WHERE id IN ('amoureuse', 'amante', 'crush', 'amis', 'perdusvue', 'autre');
    `);

    // Ensure new default categories exist
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

    currentVersion = 22;
  }

  if (currentVersion === 22) {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_title_nocase ON notes(title COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_people_name_nocase ON people(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_people_category ON people(category);
      CREATE INDEX IF NOT EXISTS idx_people_favorite ON people(favorite DESC, name COLLATE NOCASE);
    `);

    currentVersion = 23;
  }

  if (currentVersion === 23) {
    const journalColumns = await getTableColumnNames(db, 'journal_entries');

    if (!journalColumns.has('tags_json')) {
      await db.execAsync(`
        ALTER TABLE journal_entries ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
      `);
    }

    currentVersion = 24;
  }

  if (currentVersion === 24) {
    const noteColumns = await getTableColumnNames(db, 'notes');

    if (!noteColumns.has('pinned')) {
      await db.execAsync(`
        ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
      `);
    }

    if (!noteColumns.has('archived')) {
      await db.execAsync(`
        ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
      `);
    }

    currentVersion = 25;
  }

  await db.execAsync(`PRAGMA user_version = ${currentVersion}`);
  } catch (error) {
    console.error("CRITICAL DATABASE MIGRATION ERROR:", error);
    throw error;
  }
}
