export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface Checklist {
  id: string;
  name: string;
  position: number;
  items: ChecklistItem[];
}

export interface ChecklistSummary {
  id: string;
  name: string;
  position: number;
  itemCount: number;
  doneCount: number;
}

export type BasePersonCategory =
  | 'famille'
  | 'pro'
  | 'relation'
  | 'autre';

export type PersonCategory = BasePersonCategory | (string & {});

export interface PersonCategoryDefinition {
  id: PersonCategory;
  label: string;
  color: string;
  custom: boolean;
  position: number;
  createdAt: number;
}

export type PersonLinkStrength = 1 | 2 | 3;

export type PersonContactFrequency = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type PersonRelationshipStatus = 'proche' | 'stable' | 'fragile' | 'distant' | 'complique';

export interface PersonProfile {
  nickname: string;
  pronouns: string;
  memories: string;
  places: string;
  giftIdeas: string;
  avoidTopics: string;
  preferences: string;
  ourStory: string;
  affinityScore: number;
  preferredActivities: string;
  sharedValues: string;
  frequentTopics: string;
  mutualSupport: string;
}

export interface PersonLink {
  personId: string;
  strength: PersonLinkStrength;
}

export interface Person {
  id: string;
  name: string;
  category: PersonCategory;
  secondaryCategories: PersonCategory[];
  photoUri: string;
  favorite: boolean;
  note: string;
  birthday: string;
  phone: string;
  address: string;
  lastContactedAt: string;
  contactFrequency: PersonContactFrequency;
  relationshipStatus: PersonRelationshipStatus;
  interests: string[];
  tags: string[];
  role: string;
  organization: string;
  links: PersonLink[];
  profile: PersonProfile;
}

export type ProjectStatus = 'prospect' | 'encours' | 'termine';

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  deadline: string;
  people: string[];
  notes: string;
  tags: string[];
  createdAt: number;
}

export type ReminderRepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export type ReminderCategory =
  | 'rappel'
  | 'famille'
  | 'amis'
  | 'date'
  | 'autre'
  | 'loyer'
  | 'rdv'
  | 'pro'
  | 'medicament';

export interface Reminder {
  id: string;
  title: string;
  scheduledFor: string;
  status: 'scheduled' | 'done';
  notificationId: string | null;
  repeatRule: ReminderRepeatRule;
  category: ReminderCategory;
}

export interface Routine {
  key: 'treatment' | 'mood';
  label: string;
  enabled: boolean;
  time: string;
}

export interface Treatment {
  id: string;
  name: string;
  dose: string;
  takenDays: string[];
  createdAt: number;
}

export interface JournalEntry {
  date: string;
  mood: number;
  text: string;
  tags?: string[];
}

export type ObjectiveScope = 'perso' | 'pro';

export interface ObjectiveEvent {
  id: string;
  title: string;
  percent: number;
}

export interface Objective {
  id: string;
  title: string;
  scope: ObjectiveScope;
  deadline: string;
  details: string;
  events: ObjectiveEvent[];
  progress: number;
  createdAt: number;
}

export interface TimelineEntry {
  id: string;
  date: string;
  title: string;
  note: string;
}

export interface Template {
  id: string;
  name: string;
  body: string;
}

export type IdeaStatus = 'explorer' | 'encours' | 'publie';

export interface IdeaSubtask {
  id: string;
  text: string;
  done: boolean;
}

export interface Idea {
  id: string;
  text: string;
  status: IdeaStatus;
  people: string[];
  pinned: boolean;
  subtasks: IdeaSubtask[];
  tags: string[];
  publishDate: string;
  createdAt: number;
}

export type SubstanceCategory =
  | 'stim'
  | 'stim_nps'
  | 'depr'
  | 'depr_nps'
  | 'opio'
  | 'opio_nps'
  | 'disso'
  | 'disso_nps'
  | 'canna'
  | 'canna_nps'
  | 'cathi'
  | 'cathi_nps'
  | 'psy'
  | 'psy_nps'
  | 'empath'
  | 'empath_nps'
  | 'autre';

export interface Substance {
  id: string;
  name: string;
  category: SubstanceCategory;
  firstTried: string;
  notes: string;
  createdAt: number;
}

export interface Dose {
  id: string;
  substance: string;
  dose: string;
  unit: string;
  route: string;
  datetime: string;
  cost: string;
  notes: string;
  feel: number;
  contextTags: string[];
  sessionId: string | null;
  createdAt: number;
}

export interface SleepEntry {
  id: string;
  date: string;
  bedtime: string;
  wakeTime: string;
  quality: number;
  notes: string;
  createdAt: number;
}

export interface PhysicalActivity {
  id: string;
  date: string;
  activityType: string;
  durationMinutes: number;
  intensity: number;
  notes: string;
  createdAt: number;
}

export type GameStatus = 'aplayer' | 'encours' | 'fini' | 'abandon';

export interface Game {
  id: string;
  name: string;
  platform: string;
  status: GameStatus;
  rating: number;
  date: string;
  notes: string;
  createdAt: number;
}

export type CountryRegion = 'europe' | 'ameriques' | 'asie' | 'afrique' | 'oceanie' | 'autre';

export interface Country {
  id: string;
  name: string;
  city: string;
  region: CountryRegion;
  rating: number;
  year: string;
  notes: string;
  createdAt: number;
}

export interface Concert {
  id: string;
  name: string;
  venue: string;
  rating: number;
  date: string;
  notes: string;
  createdAt: number;
}

export type AppThemeMode = 'auto' | 'light' | 'dark';

export type AppAccent = 'blue' | 'aqua' | 'magenta' | 'amber' | 'lime';

export type AppDensity = 'comfortable' | 'compact';

export type AppTextScale = 'small' | 'medium' | 'large';

export type HomeModuleId =
  | 'notes'
  | 'rappels'
  | 'listes'
  | 'liens'
  | 'sante'
  | 'idees'
  | 'conso'
  | 'pharmaco'
  | 'traitement'
  | 'sommeil'
  | 'activite'
  | 'journal'
  | 'objectifs'
  | 'frise'
  | 'cercle'
  | 'pro'
  | 'agenda'
  | 'stats'
  | 'tags'
  | 'templates'
  | 'livres'
  | 'jeux'
  | 'pays'
  | 'concerts'
  | 'reglages'
  | 'plus';

export type HomeWidgetId = 'focus' | 'treatment' | 'journal' | 'birthdays' | 'backup';

export type AppHomeProfile = 'custom' | 'focus' | 'soir' | 'sante' | 'voyage';

export type AppPinRelockDelay = 'immediate' | 'minute' | 'five' | 'never';

export interface AppPreferences {
  theme: AppThemeMode;
  accent: AppAccent;
  density: AppDensity;
  textScale: AppTextScale;
  reduceMotion: boolean;
  showSensitiveContent: boolean;
  homeProfile: AppHomeProfile;
  homeModules: HomeModuleId[];
  homeWidgets: HomeWidgetId[];
  pinRelockDelay: AppPinRelockDelay;
  lastBackupAt: number | null;
  backupMethod: 'local' | 'cloud';
  backupCloudUrl?: string;
  useBiometrics: boolean;
  wipeDataAfterFailedAttempts: number | null;
  agendaColors?: Record<string, string>;
}

export type EntityKind =
  | 'note'
  | 'list'
  | 'person'
  | 'project'
  | 'reminder'
  | 'routine'
  | 'template'
  | 'book'
  | 'idea'
  | 'substance'
  | 'dose'
  | 'sleep'
  | 'physical_activity'
  | 'game'
  | 'country'
  | 'concert'
  | 'treatment'
  | 'journal'
  | 'objective'
  | 'timeline';

export interface EntityRef {
  kind: EntityKind;
  id: string;
  label: string;
  detail: string;
  sensitive: boolean;
}

export interface EntityLink {
  id: string;
  sourceKind: EntityKind;
  sourceId: string;
  targetKind: EntityKind;
  targetId: string;
  note: string;
  createdAt: number;
}

export interface EntityTag {
  entityKind: EntityKind;
  entityId: string;
  tag: string;
  createdAt: number;
}

export interface EntityAttachment {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  name: string;
  mimeType: string;
  fileUri: string;
  size: number;
  createdAt: number;
}

export interface SavedView {
  id: string;
  name: string;
  scope: string;
  config: Record<string, unknown>;
  createdAt: number;
}

export interface ActivityLogEntry {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  action: string;
  label: string;
  createdAt: number;
}

export type BookStatus = 'alire' | 'encours' | 'lu' | 'abandon';

export interface Book {
  id: string;
  name: string;
  author: string;
  status: BookStatus;
  rating: number;
  date: string;
  notes: string;
  createdAt: number;
}

export interface HomeSnapshot {
  noteCount: number;
  dueCount: number;
  routineCount: number;
  nextReminder: Reminder | null;
}

export interface BackupChecklist {
  id: string;
  name: string;
  position: number;
  items: ChecklistItem[];
}

export interface BackupPerson {
  id: string;
  name: string;
  category: PersonCategory;
  secondaryCategories: PersonCategory[];
  photoUri?: string;
  favorite?: boolean;
  note: string;
  birthday: string;
  phone: string;
  address: string;
  lastContactedAt?: string;
  contactFrequency?: PersonContactFrequency;
  relationshipStatus?: PersonRelationshipStatus;
  interests: string[];
  tags?: string[];
  links: PersonLink[];
  profile?: PersonProfile;
}

export type BackupPersonCategory = PersonCategoryDefinition;

export interface BackupProject {
  id: string;
  name: string;
  status: ProjectStatus;
  deadline: string;
  people: string[];
  notes: string;
  tags: string[];
  createdAt: number;
}

export interface BackupReminder {
  id: string;
  title: string;
  scheduledFor: string;
  status: 'scheduled' | 'done';
  repeatRule: ReminderRepeatRule;
  category: ReminderCategory;
}

export interface BackupTemplate {
  id: string;
  name: string;
  body: string;
}

export interface BackupIdea {
  id: string;
  text: string;
  status: IdeaStatus;
  people: string[];
  pinned: boolean;
  subtasks: IdeaSubtask[];
  tags: string[];
  publishDate: string;
  createdAt: number;
}

export interface BackupSubstance {
  id: string;
  name: string;
  category: SubstanceCategory;
  firstTried: string;
  notes: string;
  createdAt: number;
}

export interface BackupDose {
  id: string;
  substance: string;
  dose: string;
  unit: string;
  route: string;
  datetime: string;
  cost: string;
  notes: string;
  feel: number;
  contextTags: string[];
  sessionId: string | null;
  createdAt: number;
}

export interface BackupSleepEntry {
  id: string;
  date: string;
  bedtime: string;
  wakeTime: string;
  quality: number;
  notes: string;
  createdAt: number;
}

export interface BackupPhysicalActivity {
  id: string;
  date: string;
  activityType: string;
  durationMinutes: number;
  intensity: number;
  notes: string;
  createdAt: number;
}

export interface BackupBook {
  id: string;
  name: string;
  author: string;
  status: BookStatus;
  rating: number;
  date: string;
  notes: string;
  createdAt: number;
}

export interface BackupTreatment {
  id: string;
  name: string;
  dose: string;
  takenDays: string[];
  createdAt: number;
}

export interface BackupJournalEntry {
  date: string;
  mood: number;
  text: string;
  tags?: string[];
}

export interface BackupObjective {
  id: string;
  title: string;
  scope: ObjectiveScope;
  deadline: string;
  details: string;
  events: ObjectiveEvent[];
  progress: number;
  createdAt: number;
}

export interface BackupTimelineEntry {
  id: string;
  date: string;
  title: string;
  note: string;
}

export interface BackupGame {
  id: string;
  name: string;
  platform: string;
  status: GameStatus;
  rating: number;
  date: string;
  notes: string;
  createdAt: number;
}

export interface BackupCountry {
  id: string;
  name: string;
  city: string;
  region: CountryRegion;
  rating: number;
  year: string;
  notes: string;
  createdAt: number;
}

export interface BackupConcert {
  id: string;
  name: string;
  venue: string;
  rating: number;
  date: string;
  notes: string;
  createdAt: number;
}

export interface BackupEntityAttachment {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  name: string;
  mimeType: string;
  fileName: string;
  size: number;
  createdAt: number;
  dataBase64?: string;
}

export interface MobileBackup {
  format: 'carnet-mobile-backup-v1';
  exportedAt: string;
  prefs?: AppPreferences;
  personCategories?: BackupPersonCategory[];
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
  sleepEntries?: BackupSleepEntry[];
  physicalActivities?: BackupPhysicalActivity[];
  books: BackupBook[];
  games: BackupGame[];
  countries: BackupCountry[];
  concerts: BackupConcert[];
  treatment?: BackupTreatment | null;
  treatments?: BackupTreatment[];
  journal?: BackupJournalEntry[];
  goals?: BackupObjective[];
  timeline?: BackupTimelineEntry[];
  links?: EntityLink[];
  entityTags?: EntityTag[];
  attachments?: BackupEntityAttachment[];
  savedViews?: SavedView[];
  activityLog?: ActivityLogEntry[];
}

export interface BackupImportUnsupportedSection {
  key: string;
  count: number;
}

export interface BackupImportResult {
  source: 'legacy-html' | 'mobile-backup';
  noteCount: number;
  listCount: number;
  personCount: number;
  projectCount: number;
  reminderCount: number;
  routineCount: number;
  templateCount: number;
  bookCount: number;
  attachmentCount: number;
  attachmentFailureCount: number;
  importedPin: string | null;
  importedPreferences: AppPreferences | null;
  unsupportedSections: BackupImportUnsupportedSection[];
}
