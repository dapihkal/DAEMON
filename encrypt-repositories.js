const fs = require('fs');
let code = fs.readFileSync('src/db/repositories.ts', 'utf8');

if (!code.includes('import { encryptField, decryptField }')) {
  code = code.replace(
    /import \{ type SQLiteDatabase \} from 'expo-sqlite';/,
    `import { type SQLiteDatabase } from 'expo-sqlite';\nimport { encryptField, decryptField } from '../lib/db-crypto';`
  );
}

// Map Functions Decryptions

// NOTE
code = code.replace(/title: row\.title,/g, 'title: decryptField(row.title),');
code = code.replace(/body: row\.body,/g, 'body: decryptField(row.body),');
code = code.replace(/body: row\.body \?\? undefined,/g, 'body: row.body ? decryptField(row.body) : undefined,');

code = code.replace(/tags: parseTags\(row\.tags_json\),/g, "tags: parseTags(row.tags_json ? decryptField(row.tags_json) : '[]'),");

// JOURNAL
code = code.replace(/text: row\.text,/g, 'text: decryptField(row.text),');

// PERSON
// WARNING: Do not encrypt name in map Person.
code = code.replace(/note: row\.note \?\? undefined,/g, 'note: row.note ? decryptField(row.note) : undefined,');
code = code.replace(/phone: row\.phone \?\? undefined,/g, 'phone: row.phone ? decryptField(row.phone) : undefined,');
code = code.replace(/address: row\.address \?\? undefined,/g, 'address: row.address ? decryptField(row.address) : undefined,');
code = code.replace(/company: row\.organization \?\? undefined,/g, 'company: row.organization ? decryptField(row.organization) : undefined,');
code = code.replace(/role: row\.role \?\? undefined,/g, 'role: row.role ? decryptField(row.role) : undefined,');
code = code.replace(/photoUri: row\.photo_uri \?\? undefined,/g, 'photoUri: row.photo_uri ? decryptField(row.photo_uri) : undefined,');

code = code.replace(/secondaryCategories: JSON\.parse\(row\.secondary_categories_json\),/g, "secondaryCategories: JSON.parse(decryptField(row.secondary_categories_json) || '[]'),");
code = code.replace(/interests: JSON\.parse\(row\.interests_json\),/g, "interests: JSON.parse(decryptField(row.interests_json) || '[]'),");
code = code.replace(/links: JSON\.parse\(row\.links_json\),/g, "links: JSON.parse(decryptField(row.links_json) || '[]'),");
code = code.replace(/profile: JSON\.parse\(row\.profile_json\),/g, "profile: JSON.parse(decryptField(row.profile_json) || '{}'),");

// ROUTINE
code = code.replace(/label: row\.label,/g, 'label: decryptField(row.label),');

// TIMELINE ENTRY
code = code.replace(/note: row\.note \?\? undefined/g, 'note: row.note ? decryptField(row.note) : undefined');

// SAVED VIEW
code = code.replace(/function mapSavedView\(row: SavedViewRow\): SavedView \{\n  return \{\n    id: row\.id,\n    name: row\.name,/g, 'function mapSavedView(row: SavedViewRow): SavedView {\n  return {\n    id: row.id,\n    name: decryptField(row.name),');
code = code.replace(/config: JSON\.parse\(row\.config_json\)/g, "config: JSON.parse(decryptField(row.config_json) || '{}')");

// PROJECT
code = code.replace(/people: JSON\.parse\(row\.people_json\),/g, "people: JSON.parse(decryptField(row.people_json) || '[]'),");

// OBJECTIVE
code = code.replace(/details: row\.details \?\? undefined,/g, 'details: row.details ? decryptField(row.details) : undefined,');
code = code.replace(/events: JSON\.parse\(row\.events_json\),/g, "events: JSON.parse(decryptField(row.events_json) || '[]'),");

// TREATMENT
code = code.replace(/dose: row\.dose \?\? undefined,/g, 'dose: row.dose ? decryptField(row.dose) : undefined,');


// Write DB Inserts Encryptions

// Object replacements carefully
const encryptList = [
  'note.title', 'note.body', 'JSON.stringify(note.tags)',
  'entry.text', 'JSON.stringify(entry.tags)',
  'person.note', 'person.phone', 'person.address', 'person.company', 'person.role', 'person.photoUri',
  'JSON.stringify(person.secondaryCategories)', 'JSON.stringify(person.interests)', 
  'JSON.stringify(person.links)', 'JSON.stringify(person.profile)',
  'reminder.title', 'routine.label', 
  'entry.title', 'entry.note',
  'view.name', 'JSON.stringify(view.config)',
  'project.notes', 'JSON.stringify(project.people)', 'JSON.stringify(project.tags)',
  'objective.details', 'JSON.stringify(objective.events)',
  'book.author', 'book.notes', 'template.body', 'treatment.dose', 
  'item.text', 'link.note', 'log.label'
];

encryptList.forEach(field => {
  // Use exact string replacement to avoid regex issues on complex strings context
  // Only target the specific arguments array for db.runAsync and db.execAsync
  const searchString = field;
  const replacementString = `encryptField(${field})`;
  
  // We don't want to replace property access before assignment, e.g., 'note.title = ...'
  // So we only replace matching fields in arguments using simple logic or split joining 
  code = code.split(',\n      ' + searchString + ',').join(',\n      ' + replacementString + ',');
  code = code.split(',\n      ' + searchString + '\n').join(',\n      ' + replacementString + '\n');
  code = code.split(', ' + searchString + ',').join(', ' + replacementString + ',');
  code = code.split(', ' + searchString + ')').join(', ' + replacementString + ')');
});

fs.writeFileSync('src/db/repositories.ts', code);
console.log('Repositories updated successfully.');
