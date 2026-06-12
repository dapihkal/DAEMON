import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';
import { getDashboardData, searchAll } from '../../src/db/dashboard';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { AppShell } from '../../src/components/app-shell';
import { DateField } from '../../src/components/date-field';
import { EmptyState } from '../../src/components/empty-state';
import { PeoplePicker } from '../../src/components/people-picker';
import { listEntityLinks, listEntityTags, replaceEntityPersonLinks, sensitiveEntityKinds } from '../../src/db/cross-repositories';
import {
  ensureSubstance,
  listConcerts,
  listCountries,
  listDoses,
  listGames,
  listIdeas,
  listPhysicalActivities,
  listSleepEntries,
  listSubstances,
  saveDose,
  saveIdea,
} from '../../src/db/module-repositories';
import {
  createChecklist,
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
  markReminderDone,
  saveJournalEntry,
  saveNote,
  saveObjective,
  saveReminder,
  saveTimelineEntry,
} from '../../src/db/repositories';
import type {
  Book,
  ChecklistSummary,
  Concert,
  Country,
  Dose,
  EntityLink,
  EntityTag,
  Game,
  Idea,
  HomeModuleId,
  HomeWidgetId,
  JournalEntry,
  Note,
  Objective,
  Person,
  PhysicalActivity,
  Project,
  Reminder,
  Routine,
  SleepEntry,
  Substance,
  Template,
  Treatment,
  TimelineEntry,
} from '../../src/db/types';
import { buildReminderPresets } from '../../src/lib/date';
import { ideaStatusOptions, substanceCategoryOptions, doseRoutes, doseUnits } from '../../src/lib/module-options';
import { sensitiveHomeModuleIds } from '../../src/lib/personalization';
import { useTheme, useThemePreferences } from '../../src/theme/theme-provider';
import { fonts, radii, spacing } from '../../src/theme/tokens';
import { getInterpolatedMoodColor } from '../../src/theme/score-colors';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorderState } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { saveEntityAttachment } from '../../src/db/cross-repositories';

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  snippet?: string;
  href: Href;
  action?: {
    label: string;
    kind: 'doneReminder';
    id: string;
  };
};

type SearchScope = 'all' | 'notes' | 'people' | 'agenda' | 'health' | 'tags';

type QuickAction = {
  id: HomeModuleId;
  title: string;
  body: string;
  eyebrow: string;
  href: Href;
  variant: 'hero' | 'wide' | 'tall' | 'compact';
  tone: 'accent' | 'sun' | 'primary' | 'neutral';
  value: string;
};

type ContextWidget = {
  id: HomeWidgetId;
  icon: string;
  title: string;
  body: string;
  actionLabel: string;
  href: Href;
  visible: boolean;
};

type WeeklyReviewItem = {
  label: string;
  value: string;
  detail: string;
  href: Href;
  color?: string;
};

type QuickCaptureKind = 'note' | 'rappel' | 'idee' | 'liste' | 'journal' | 'objectif' | 'moment' | 'prise';

const reviewRangeOptions = [
  { label: '7j', value: 7 },
  { label: '15j', value: 15 },
  { label: '30j', value: 30 },
  { label: '90j', value: 90 },
  { label: '180j', value: 180 },
  { label: '360j', value: 360 },
] as const;

type ReviewRangeMode = (typeof reviewRangeOptions)[number]['value'] | 'custom';

const quickCaptureOptions: Array<{ id: QuickCaptureKind; label: string; sensitive?: boolean }> = [
  { id: 'note', label: 'Note' },
  { id: 'rappel', label: 'Rappel' },
  { id: 'idee', label: 'Idée' },
  { id: 'liste', label: 'Liste' },
  { id: 'journal', label: 'Journal' },
  { id: 'objectif', label: 'Objectif' },
  { id: 'moment', label: 'Moment' },
  { id: 'prise', label: 'Prise', sensitive: true },
];

const searchScopeOptions: Array<{ id: SearchScope; label: string }> = [
  { id: 'all', label: 'Tout' },
  { id: 'notes', label: 'Notes' },
  { id: 'people', label: 'Cercle' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'health', label: 'Santé' },
  { id: 'tags', label: 'Tags' },
];

const hitSlop = { top: 8, right: 8, bottom: 8, left: 8 } as const;

function buildQuickActionRows(actions: QuickAction[]) {
  const rows: QuickAction[][] = [];

  actions.forEach((action) => {
    const fullWidth = action.variant === 'hero' || action.variant === 'wide';
    const previousRow = rows[rows.length - 1];

    if (fullWidth || !previousRow || previousRow.length === 2 || previousRow.some((item) => item.variant === 'hero' || item.variant === 'wide')) {
      rows.push([action]);
      return;
    }

    previousRow.push(action);
  });

  return rows;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
}

function formatTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayLabel(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function buildDayRange(startKey: string, endKey: string) {
  const startDate = parseDay(startKey);
  const endDate = parseDay(endKey);

  if (!startDate || !endDate) {
    return [];
  }

  const firstDate = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
  const lastDate = startDate.getTime() <= endDate.getTime() ? endDate : startDate;
  const days: string[] = [];
  const cursor = new Date(firstDate);

  while (cursor.getTime() <= lastDate.getTime()) {
    days.push(localDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function getNextBirthday(person: Person) {
  if (!person.birthday) {
    return null;
  }

  const [year, month, day] = person.birthday.split('-').map(Number);
  if (!month || !day) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let nextBirthday = new Date(today.getFullYear(), month - 1, day, 12, 0, 0, 0);
  if (nextBirthday.getTime() < today.getTime()) {
    nextBirthday = new Date(today.getFullYear() + 1, month - 1, day, 12, 0, 0, 0);
  }

  return {
    person,
    date: nextBirthday,
    age: year && year > 1900 ? nextBirthday.getFullYear() - year : null,
  };
}

function getGreeting(now: Date) {
  const hour = now.getHours();

  if (hour < 6) {
    return 'Bonne nuit 🌙';
  }

  if (hour < 12) {
    return 'Bonjour ☀️';
  }

  if (hour < 18) {
    return 'Bon après-midi ✨';
  }

  return 'Bonsoir 🌌';
}

function includesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query);
}

function getFirstLine(value: string) {
  return value.split('\n')[0]?.trim() || value.trim();
}

const homeTabs = [
  { id: 'synthese' as const, label: 'Synthèse', icon: 'analytics' as const },
  { id: 'capture' as const, label: 'Capture', icon: 'flash' as const },
  { id: 'modules' as const, label: 'Modules', icon: 'grid' as const },
];

const quickCapturePlaceholders: Record<QuickCaptureKind, string> = {
  note: "Un mémo rapide, un compte-rendu, une pensée...",
  rappel: "Rappel urgent : appeler le médecin à 15h, etc...",
  idee: "Piste d'idée, projet, écriture, création...",
  liste: "Nom de la liste, ex: Courses, Valise, Idées cadeaux...",
  journal: "Raconte ton humeur, ton moral, ta journée...",
  objectif: "Formuler un objectif : ex. Apprendre 10 mots de japonais...",
  moment: "Événement marquant, date et note pour la frise...",
  prise: "Médicament, café, complément : ex. Caféine 100mg...",
};

export default function HomeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reviewRangeMode, setReviewRangeMode] = useState<ReviewRangeMode>(7);
  const [customReviewStart, setCustomReviewStart] = useState(localDay(addDays(new Date(), -6)));
  const [customReviewEnd, setCustomReviewEnd] = useState(localDay());
  const [activeTab, setActiveTab] = useState<'synthese' | 'capture' | 'modules'>('capture');
  const { data: dashboard, refetch: refreshDashboard } = useQuery({
    queryKey: ['dashboard', preferences.showSensitiveContent, reviewRangeMode === 'custom' ? 7 : reviewRangeMode],
    queryFn: () => getDashboardData(db, preferences.showSensitiveContent, reviewRangeMode === 'custom' ? 7 : (reviewRangeMode)),
  });
  const latestNotes = dashboard?.latestNotes || [];
  const checklists = dashboard?.checklists || [];
  const people = dashboard?.people || [];
  const reminders = dashboard?.reminders || [];
  const routines = dashboard?.routines || [];
  const treatments = dashboard?.treatments || [];
  const journalEntries = dashboard?.journalEntries || [];
  const sleepEntries = dashboard?.sleepEntries || [];
  const activities = dashboard?.activities || [];
  const objectives = dashboard?.objectives || [];
  const counts = dashboard?.metrics.counts || ({} as any);
  const totalTags = dashboard?.metrics.totalTags || 0;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [quickCaptureKind, setQuickCaptureKind] = useState<QuickCaptureKind>('note');
  const [quickCaptureText, setQuickCaptureText] = useState('');
  const [quickCaptureFeedback, setQuickCaptureFeedback] = useState<string | null>(null);
  const [quickCaptureBusy, setQuickCaptureBusy] = useState(false);
  
  const [qcIdeaStatus, setQcIdeaStatus] = useState<'explorer' | 'encours' | 'publie'>('explorer');
  const [qcMood, setQcMood] = useState(3);
  const [qcObjectiveScope, setQcObjectiveScope] = useState<'perso' | 'pro'>('perso');
  const [qcReminderPresetIndex, setQcReminderPresetIndex] = useState(2); // Demain matin defaults
  const [qcExtraTags, setQcExtraTags] = useState('');
  const [qcPeople, setQcPeople] = useState<string[]>([]);
  const [qcDate, setQcDate] = useState<string>(''); // For objective deadline or explicit reminder date
  const [qcTime, setQcTime] = useState<string>(''); // For explicit reminder time
  const [qcCustomDosage, setQcCustomDosage] = useState('');
  const [qcUnit, setQcUnit] = useState('');
  const [qcRoute, setQcRoute] = useState('');
  const [qcSubstanceCategory, setQcSubstanceCategory] = useState<string>('autre');
  const [qcReminderCategory, setQcReminderCategory] = useState<any>('rappel');
  const [qcRepeat, setQcRepeat] = useState<any>('none');
  
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingStatus = useAudioRecorderState(recorder);
  const audioRecordingNow = recordingStatus.isRecording;
  const audioDurationSec = Math.floor(recordingStatus.durationMillis / 1000);
  

  const quickCaptureInputRef = useRef<TextInput | null>(null);
  const friseHref = '/frise' as Href;
  const objectifsHref = '/objectifs' as Href;
  const treatmentHref = '/traitement' as Href;
  const journalHref = '/journal' as Href;

  useFocusEffect(
    useCallback(() => {
      refreshDashboard();
    }, [refreshDashboard])
  );
  const refresh = refreshDashboard;


  const handleQuickCapture = async () => {
    const text = quickCaptureText.trim();
    if (!text || quickCaptureBusy) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      return;
    }

    setQuickCaptureBusy(true);
    setQuickCaptureFeedback(null);

    try {
      if (quickCaptureKind === 'note') {
        const extraTagsArray = qcExtraTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const created = await saveNote(db, {
          title: getFirstLine(text) || 'Note rapide',
          body: text,
          tags: ['capture', ...extraTagsArray],
        });
        if (created) {
          await replaceEntityPersonLinks(db, {
            entityKind: 'note',
            entityId: created.id,
            personIds: qcPeople,
          });
        }
        setQuickCaptureFeedback('Note ajoutée.');
      } else if (quickCaptureKind === 'rappel') {
        let dateToUse = buildReminderPresets()[qcReminderPresetIndex].date.toISOString();
        if (qcDate || qcTime) {
          const defaultPreset = buildReminderPresets()[2].date;
          // Use local time when parsing qcDate, placing it safely at noon to avoid timezone shift to prev day
          const baseDate = qcDate ? new Date(qcDate.split('-').map(Number)[0], qcDate.split('-').map(Number)[1] - 1, qcDate.split('-').map(Number)[2], 12, 0, 0) : new Date(defaultPreset);
          if (qcTime && qcTime.includes(':')) {
            const [hours, minutes] = qcTime.split(':');
            const h = parseInt(hours, 10);
            const m = parseInt(minutes, 10);
            if (!isNaN(h) && !isNaN(m)) {
              baseDate.setHours(h, m, 0, 0);
            }
          }
          dateToUse = baseDate.toISOString();
        }

        const created = await saveReminder(db, {
          title: text,
          scheduledFor: dateToUse,
          notificationId: null,
          category: qcReminderCategory,
          repeatRule: qcRepeat,
        });
        if (created) {
          await replaceEntityPersonLinks(db, {
            entityKind: 'reminder',
            entityId: created.id,
            personIds: qcPeople,
          });
        }
        setQuickCaptureFeedback('Rappel créé.');
      } else if (quickCaptureKind === 'idee') {
        const extraTagsArray = qcExtraTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const created = await saveIdea(db, {
          text,
          status: qcIdeaStatus,
          tags: ['capture', ...extraTagsArray],
        });
        if (created) {
          await replaceEntityPersonLinks(db, {
            entityKind: 'idea',
            entityId: created.id,
            personIds: qcPeople,
          });
        }
        setQuickCaptureFeedback('Idée ajoutée au pipeline.');
      } else if (quickCaptureKind === 'liste') {
        const created = await createChecklist(db, { name: getFirstLine(text) });
        if (created) {
          router.push({ pathname: '/listes', params: { listId: created.id } });
        }
        setQuickCaptureFeedback('Liste créée.');
      } else if (quickCaptureKind === 'journal') {
        const extraTagsArray = qcExtraTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const entryDate = localDay();
        await saveJournalEntry(db, {
          date: entryDate,
          mood: qcMood,
          text,
          tags: extraTagsArray,
        });
        await replaceEntityPersonLinks(db, {
          entityKind: 'journal',
          entityId: entryDate,
          personIds: qcPeople,
        });
        setQuickCaptureFeedback('Entrée du jour enregistrée.');
      } else if (quickCaptureKind === 'objectif') {
        let deadlineToUse = '';
        if (qcDate) {
          deadlineToUse = localDay(new Date(qcDate));
        }
        const created = await saveObjective(db, {
          title: getFirstLine(text),
          scope: qcObjectiveScope,
          deadline: deadlineToUse,
          progress: 0,
        });
        if (created) {
          await replaceEntityPersonLinks(db, {
            entityKind: 'objective',
            entityId: created.id,
            personIds: qcPeople,
          });
        }
        setQuickCaptureFeedback('Objectif créé.');
      } else if (quickCaptureKind === 'moment') {
        const entryDate = localDay();
        const created = await saveTimelineEntry(db, {
          date: entryDate,
          title: getFirstLine(text),
          note: text.includes('\n') ? text.split('\n').slice(1).join('\n').trim() : '',
        });
        if (created) {
          await replaceEntityPersonLinks(db, {
            entityKind: 'timeline',
            entityId: created.id,
            personIds: qcPeople,
          });
        }
        setQuickCaptureFeedback('Moment ajouté à la frise.');
      } else if (quickCaptureKind === 'prise' && preferences.showSensitiveContent) {
        const extraTagsArray = qcExtraTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const substance = getFirstLine(text);
        
        // Find category ID from label or use it directly if it matches an ID
        let categoryId: any = 'autre';
        const found = substanceCategoryOptions.find(o => 
          o.label.toLowerCase() === qcSubstanceCategory.toLowerCase() || 
          o.id.toLowerCase() === qcSubstanceCategory.toLowerCase()
        );
        if (found) {
          categoryId = found.id;
        }

        await ensureSubstance(db, { name: substance, category: categoryId, firstTried: localDay() });
        const created = await saveDose(db, {
          substance,
          datetime: new Date().toISOString(),
          dose: qcCustomDosage,
          unit: qcUnit,
          route: qcRoute,
          feel: qcMood, // Reusing mood for feel
          notes: text.includes('\n') ? text.split('\n').slice(1).join('\n').trim() : '',
          contextTags: ['capture', ...extraTagsArray],
        });
        if (created) {
          await replaceEntityPersonLinks(db, {
            entityKind: 'dose',
            entityId: created.id,
            personIds: qcPeople,
          });
        }
        setQuickCaptureFeedback('Prise ajoutée au journal.');
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setQuickCaptureText('');
      setQcExtraTags('');
      setQcPeople([]);
      setQcDate('');
      setQcTime('');
      setQcCustomDosage('');
      setQcUnit('');
      setQcRoute('');
      setQcSubstanceCategory('autre');
      setQcReminderCategory('rappel');
      setQcRepeat('none');
      void refresh();
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setQuickCaptureFeedback(error instanceof Error ? error.message : 'Capture impossible pour le moment.');
    } finally {
      setQuickCaptureBusy(false);
    }
  };

  const handleQuickCaptureDictation = async () => {
    if (audioRecordingNow) {
      setQuickCaptureBusy(true);
      await recorder.stop();
      if (recorder.uri) {
        try {
          const attachmentsDirectory = new Directory(Paths.document, 'attachments');
          attachmentsDirectory.create({ idempotent: true, intermediates: true });
          const attachmentId = `att-${Date.now()}`;
          const targetFile = new File(attachmentsDirectory, `${attachmentId}-memo.m4a`);
          const sourceFile = new File(recorder.uri);
          await sourceFile.move(targetFile);

          const created = await saveNote(db, {
            title: `Mémo vocal du ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
            body: quickCaptureText || '',
            tags: ['vocal', 'capture'],
          });
          
          if (created) {
             await saveEntityAttachment(db, {
               id: attachmentId,
               entityKind: 'note',
               entityId: created.id,
               name: 'Memo vocal',
               mimeType: 'audio/mp4',
               fileUri: targetFile.uri,
               size: targetFile.size ?? 0,
             });
          }
          setQuickCaptureFeedback('Mémo vocal sauvegardé dans une note.');
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
          setQuickCaptureText('');
          void refresh();
        } catch (error) {
          setQuickCaptureFeedback('Erreur lors de la sauvegarde du mémo.');
          console.error(error);
        } finally {
          setQuickCaptureBusy(false);
        }
      }
    } else {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setQuickCaptureFeedback('Permission micro requise.');
        return;
      }
      
      try {
        await recorder.prepareToRecordAsync();
        recorder.record();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        setQuickCaptureFeedback('Enregistrement en cours... Touche à nouveau pour sauvegarder.');
      } catch {
        setQuickCaptureFeedback('Impossible de démarrer le micro.');
      }
    }
  };

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const oneWeekFromNow = new Date(endOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

  const dueReminders = reminders.filter(
    (reminder) =>
      reminder.status === 'scheduled' && new Date(reminder.scheduledFor).getTime() <= endOfToday.getTime(),
  );
  const upcomingReminders = reminders.filter((reminder) => {
    if (reminder.status !== 'scheduled') {
      return false;
    }

    const targetTime = new Date(reminder.scheduledFor).getTime();
    return targetTime > endOfToday.getTime() && targetTime <= oneWeekFromNow.getTime();
  });

  const enabledRoutines = routines.filter((routine) => routine.enabled);
  const openLists = checklists.filter((list) => list.itemCount > list.doneCount);
  const totalPendingItems = checklists.reduce(
    (sum, list) => sum + Math.max(0, list.itemCount - list.doneCount),
    0,
  );
  const visibleEntityTags = preferences.showSensitiveContent

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const { data: rawSearchResults = [] } = useQuery({
    queryKey: ['search', trimmedQuery, preferences.showSensitiveContent],
    queryFn: async () => {
      const res = await searchAll(db, trimmedQuery, preferences.showSensitiveContent);
      const buildSnippet = (meta: string, query: string) => {
        const flat = meta.replace(/\s+/g, ' ').trim();
        if (!flat) {
          return undefined;
        }

        const matchIndex = flat.toLowerCase().indexOf(query);
        if (matchIndex < 0) {
          return undefined;
        }

        const start = Math.max(0, matchIndex - 36);
        const end = Math.min(flat.length, matchIndex + query.length + 64);
        return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
      };
      return res.map(row => ({
        id: row.id,
        title: row.title,
        snippet: buildSnippet(row.meta ?? '', trimmedQuery),
        subtitle: row.source === 'notes' ? 'Note' : row.source === 'checklists' ? 'Liste' :
                  row.source === 'people' ? 'Cercle' : row.source === 'projects' ? 'Projet pro' :
                  row.source === 'reminders' ? 'Rappel' : row.source === 'routines' ? 'Routine quotidienne' :
                  row.source === 'templates' ? 'Modèle' : row.source === 'journal' ? 'Journal' :
                  row.source === 'objectives' ? 'Objectif' : row.source === 'timeline' ? 'Frise' :
                  row.source === 'books' ? 'Livre' : row.source === 'ideas' ? 'Idée' : row.source === 'links' ? 'Lien transversal' :
                  row.source === 'games' ? 'Jeu' : row.source === 'countries' ? 'Pays' : row.source === 'concerts' ? 'Concert' :
                  row.source === 'treatments' ? 'Traitement' : row.source === 'substances' ? 'Substance' : row.source === 'doses' ? 'Conso' : 'Résultat',
        href: (row.source === 'notes' ? { pathname: '/notes', params: { noteId: row.id } } :
               row.source === 'checklists' ? { pathname: '/listes', params: { listId: row.id } } :
               row.source === 'people' ? { pathname: '/cercle', params: { personId: row.id } } :
               row.source === 'projects' ? { pathname: '/pro', params: { projectId: row.id } } :
               row.source === 'reminders' ? { pathname: '/rappels', params: { reminderId: row.id } } :
               row.source === 'routines' ? '/rappels' :
               row.source === 'templates' ? { pathname: '/templates', params: { templateId: row.id } } :
               row.source === 'journal' ? '/journal' :
               row.source === 'objectives' ? { pathname: '/objectifs', params: { objectiveId: row.id } } :
               row.source === 'timeline' ? '/frise' :
               row.source === 'books' ? { pathname: '/livres', params: { bookId: row.id } } :
               row.source === 'ideas' ? { pathname: '/idees', params: { ideaId: row.id } } :
               row.source === 'links' ? '/liens' :
               row.source === 'games' ? { pathname: '/jeux', params: { gameId: row.id } } :
               row.source === 'countries' ? { pathname: '/pays', params: { countryId: row.id } } :
               row.source === 'concerts' ? { pathname: '/concerts', params: { concertId: row.id } } :
               row.source === 'treatments' ? '/traitement' :
               row.source === 'substances' ? { pathname: '/pharmaco', params: { substanceId: row.id } } :
               row.source === 'doses' ? { pathname: '/conso', params: { doseId: row.id } } : '/') as Href,
        action: row.source === 'reminders' && row.extra === 'scheduled' ? { label: 'Fait', kind: 'doneReminder', id: row.action_id } : undefined,
      })) as SearchResult[];
    },
    enabled: trimmedQuery.length > 0
  });
  const searchResults = rawSearchResults.filter((result) => {
    if (searchScope === 'all') {
      return true;
    }

    if (searchScope === 'notes') {
      return ['Note', 'Idée', 'Modèle', 'Livre'].includes(result.subtitle);
    }

    if (searchScope === 'people') {
      return result.subtitle === 'Cercle';
    }

    if (searchScope === 'agenda') {
      return ['Rappel', 'Routine quotidienne', 'Frise', 'Objectif', 'Concert'].includes(result.subtitle);
    }

    if (searchScope === 'health') {
      return ['Traitement', 'Substance', 'Conso'].includes(result.subtitle);
    }

    return ['Tag global', 'Lien transversal'].includes(result.subtitle);
  }).slice(0, 8);

  const scheduledReminderCount = reminders.filter((reminder) => reminder.status === 'scheduled').length;
  const openObjectives = objectives.filter((objective) => objective.progress < 100);
  const reviewRange = useMemo(() => {
    if (reviewRangeMode === 'custom') {
      const days = buildDayRange(customReviewStart, customReviewEnd);
      const first = days[0] ?? customReviewStart;
      const last = days[days.length - 1] ?? customReviewEnd;

      return {
        days,
        label: 'personnalisée',
        detail: `du ${formatDayLabel(first)} au ${formatDayLabel(last)}`,
      };
    }

    const end = localDay(now);
    const start = localDay(addDays(now, -(reviewRangeMode - 1)));

    return {
      days: buildDayRange(start, end),
      label: `${reviewRangeMode} jours`,
      detail: `sur ${reviewRangeMode} j`,
    };
  }, [customReviewEnd, customReviewStart, now, reviewRangeMode]);
  const reviewDaySet = useMemo(() => new Set(reviewRange.days), [reviewRange.days]);
  const recentJournalEntries = journalEntries.filter((entry) => reviewDaySet.has(entry.date));
  const recentSleepEntries = sleepEntries.filter((entry) => reviewDaySet.has(entry.date));
  const recentActivities = activities.filter((entry) => reviewDaySet.has(entry.date));
  const recentDoneReminders = reminders.filter((reminder) => reminder.status === 'done' && reviewDaySet.has(reminder.scheduledFor.slice(0, 10)));
  const recentScheduledReminders = reminders.filter((reminder) => reminder.status === 'scheduled' && reviewDaySet.has(reminder.scheduledFor.slice(0, 10)));
  const recentOpenObjectives = objectives.filter((objective) => objective.progress < 100 && reviewDaySet.has(objective.deadline));
  const recentCompletedObjectives = objectives.filter((objective) => objective.progress >= 100 && reviewDaySet.has(objective.deadline));
  const averageMood = recentJournalEntries.length
    ? recentJournalEntries.reduce((sum, entry) => sum + entry.mood, 0) / recentJournalEntries.length
    : null;
  const averageSleepQuality = recentSleepEntries.length
    ? recentSleepEntries.reduce((sum, entry) => sum + entry.quality, 0) / recentSleepEntries.length
    : null;
  const activityMinutes = recentActivities.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const weeklyReviewItems = useMemo<WeeklyReviewItem[]>(
    () => [
      {
        label: 'Humeur',
        value: averageMood === null ? '-' : `${averageMood.toFixed(1)}/5`,
        detail: `${recentJournalEntries.length} entrée${recentJournalEntries.length > 1 ? 's' : ''}, ${reviewRange.detail}`,
        href: journalHref,
        color: averageMood !== null ? getInterpolatedMoodColor(averageMood) : undefined,
      },
      {
        label: 'Sommeil',
        value: averageSleepQuality === null ? '-' : `${averageSleepQuality.toFixed(1)}/5`,
        detail: `${recentSleepEntries.length} nuit${recentSleepEntries.length > 1 ? 's' : ''}, ${reviewRange.detail}`,
        href: '/sommeil' as const,
        color: averageSleepQuality !== null ? getInterpolatedMoodColor(averageSleepQuality) : undefined,
      },
      {
        label: 'Activité',
        value: `${activityMinutes} min`,
        detail: `${recentActivities.length} séance${recentActivities.length > 1 ? 's' : ''}, ${reviewRange.detail}`,
        href: '/activite' as const,
      },
      {
        label: 'Rappels',
        value: `${recentDoneReminders.length}`,
        detail: `${recentScheduledReminders.length} planifié${recentScheduledReminders.length > 1 ? 's' : ''}, ${reviewRange.detail}`,
        href: '/rappels' as const,
      },
      {
        label: 'Objectifs',
        value: `${recentOpenObjectives.length}`,
        detail: `${recentCompletedObjectives.length} terminé${recentCompletedObjectives.length > 1 ? 's' : ''}, ${reviewRange.detail}`,
        href: objectifsHref,
      },
    ],
    [activityMinutes, averageMood, averageSleepQuality, journalHref, objectifsHref, recentActivities.length, recentCompletedObjectives.length, recentDoneReminders.length, recentJournalEntries.length, recentOpenObjectives.length, recentScheduledReminders.length, recentSleepEntries.length, reviewRange.detail],
  );

  const handleSearchAction = async (action: NonNullable<SearchResult['action']>) => {
    if (action.kind === 'doneReminder') {
      await markReminderDone(db, action.id);
      refresh();
    }
  };

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        id: 'notes',
        title: 'Notes',
        body: `${latestNotes.length} capture${latestNotes.length > 1 ? 's' : ''} récente${latestNotes.length > 1 ? 's' : ''}`,
        eyebrow: 'Capture',
        href: '/notes' as const,
        variant: 'hero',
        tone: 'accent',
        value: `${latestNotes.length}`,
      },
      {
        id: 'rappels',
        title: 'Rappels',
        body: `${scheduledReminderCount} échéance${scheduledReminderCount > 1 ? 's' : ''} actives`,
        eyebrow: 'Agenda',
        href: '/rappels' as const,
        variant: 'wide',
        tone: 'primary',
        value: `${scheduledReminderCount}`,
      },
      {
        id: 'listes',
        title: 'Listes',
        body: `${totalPendingItems} élément${totalPendingItems > 1 ? 's' : ''} à finir`,
        eyebrow: 'Terrain',
        href: '/listes' as const,
        variant: 'tall',
        tone: 'sun',
        value: `${totalPendingItems}`,
      },
      {
        id: 'liens',
        title: 'Liens',
        body: `${(counts?.links || 0)} lien${(counts?.links || 0) > 1 ? 's' : ''} et ${(counts?.tags || 0)} tag${(counts?.tags || 0) > 1 ? 's' : ''} globaux`,
        eyebrow: 'Graphe',
        href: '/liens' as const,
        variant: 'wide',
        tone: 'neutral',
        value: `${(counts?.links || 0)}`,
      },
      {
        id: 'idees',
        title: 'Idées',
        body: `${(counts?.ideas || 0)} piste${(counts?.ideas || 0) > 1 ? 's' : ''} dans le pipeline`,
        eyebrow: 'Création',
        href: '/idees' as const,
        variant: 'tall',
        tone: 'accent',
        value: `${(counts?.ideas || 0)}`,
      },
      {
        id: 'sante',
        title: 'Santé',
        body: 'Conso, traitement, sommeil et activité physique dans un hub commun.',
        eyebrow: 'Suivi',
        href: '/sante' as const,
        variant: 'wide',
        tone: 'primary',
        value: '4',
      },
      {
        id: 'conso',
        title: 'Conso',
        body: `${(counts?.doses || 0)} prise${(counts?.doses || 0) > 1 ? 's' : ''} historisée${(counts?.doses || 0) > 1 ? 's' : ''}`,
        eyebrow: 'Journal',
        href: '/conso' as const,
        variant: 'compact',
        tone: 'primary',
        value: `${(counts?.doses || 0)}`,
      },
      {
        id: 'pharmaco',
        title: 'Substances',
        body: `${(counts?.substances || 0)} entrée${(counts?.substances || 0) > 1 ? 's' : ''} dans le catalogue`,
        eyebrow: 'Catalogue',
        href: '/pharmaco' as const,
        variant: 'compact',
        tone: 'neutral',
        value: `${(counts?.substances || 0)}`,
      },
      {
        id: 'traitement',
        title: 'Traitement',
        body: 'Observance sur 30 jours et suivi quotidien.',
        eyebrow: 'Santé',
        href: treatmentHref,
        variant: 'wide',
        tone: 'primary',
        value: '30j',
      },
      {
        id: 'sommeil',
        title: 'Sommeil',
        body: `${(counts?.sleep || 0)} nuit${(counts?.sleep || 0) > 1 ? 's' : ''} historisée${(counts?.sleep || 0) > 1 ? 's' : ''}`,
        eyebrow: 'Repos',
        href: '/sommeil' as const,
        variant: 'compact',
        tone: 'neutral',
        value: `${(counts?.sleep || 0)}`,
      },
      {
        id: 'activite',
        title: 'Activité',
        body: `${(counts?.activities || 0)} séance${(counts?.activities || 0) > 1 ? 's' : ''} physique${(counts?.activities || 0) > 1 ? 's' : ''}`,
        eyebrow: 'Mouvement',
        href: '/activite' as const,
        variant: 'compact',
        tone: 'sun',
        value: `${(counts?.activities || 0)}`,
      },
      {
        id: 'journal',
        title: 'Journal',
        body: 'Humeur du jour et notes rapides sur 30 jours.',
        eyebrow: 'Humeur',
        href: journalHref,
        variant: 'compact',
        tone: 'neutral',
        value: '30j',
      },
      {
        id: 'objectifs',
        title: 'Objectifs',
        body: 'Objectifs personnels ou professionnels et progression simple.',
        eyebrow: 'Cap',
        href: objectifsHref,
        variant: 'compact',
        tone: 'accent',
        value: '10%',
      },
      {
        id: 'frise',
        title: 'Frise',
        body: 'Moments clés en chronologie locale.',
        eyebrow: 'Mémoire',
        href: friseHref,
        variant: 'compact',
        tone: 'sun',
        value: 'Vie',
      },
      {
        id: 'cercle',
        title: 'Cercle',
        body: `${(counts?.people || 0)} contact${(counts?.people || 0) > 1 ? 's' : ''} dans le réseau`,
        eyebrow: 'Relations',
        href: '/cercle' as const,
        variant: 'compact',
        tone: 'neutral',
        value: `${(counts?.people || 0)}`,
      },
      {
        id: 'pro',
        title: 'Pro',
        body: `${(counts?.projects || 0)} projet${(counts?.projects || 0) > 1 ? 's' : ''} dans le suivi`,
        eyebrow: 'Work',
        href: '/pro' as const,
        variant: 'compact',
        tone: 'primary',
        value: `${(counts?.projects || 0)}`,
      },
      {
        id: 'agenda',
        title: 'Agenda',
        body: 'Voir le mois et les événements reliés aux modules.',
        eyebrow: 'Vue',
        href: '/agenda' as const,
        variant: 'wide',
        tone: 'neutral',
        value: '7j',
      },
      {
        id: 'stats',
        title: 'Statistiques',
        body: 'Résumé chiffré des notes, listes, rappels, cercle et projets.',
        eyebrow: 'Chiffres',
        href: '/stats' as const,
        variant: 'compact',
        tone: 'accent',
        value: 'Data',
      },
      {
        id: 'tags',
        title: 'Tags',
        body: `${totalTags} thème${totalTags > 1 ? 's' : ''} reliés aux notes et projets`,
        eyebrow: 'Liens',
        href: '/tags' as const,
        variant: 'compact',
        tone: 'sun',
        value: `${totalTags}`,
      },
      {
        id: 'templates',
        title: 'Modèles',
        body: `${(counts?.templates || 0)} structure${(counts?.templates || 0) > 1 ? 's' : ''} réutilisable${(counts?.templates || 0) > 1 ? 's' : ''}`,
        eyebrow: 'Cadres',
        href: '/templates' as const,
        variant: 'compact',
        tone: 'neutral',
        value: `${(counts?.templates || 0)}`,
      },
      {
        id: 'livres',
        title: 'Livres',
        body: `${(counts?.books || 0)} lecture${(counts?.books || 0) > 1 ? 's' : ''} suivie${(counts?.books || 0) > 1 ? 's' : ''}`,
        eyebrow: 'Lecture',
        href: '/livres' as const,
        variant: 'compact',
        tone: 'primary',
        value: `${(counts?.books || 0)}`,
      },
      {
        id: 'jeux',
        title: 'Jeux',
        body: `${(counts?.games || 0)} jeu${(counts?.games || 0) > 1 ? 'x' : ''} dans la collection`,
        eyebrow: 'Loisirs',
        href: '/jeux' as const,
        variant: 'compact',
        tone: 'accent',
        value: `${(counts?.games || 0)}`,
      },
      {
        id: 'pays',
        title: 'Pays',
        body: `${(counts?.countries || 0)} pays visité${(counts?.countries || 0) > 1 ? 's' : ''} mémorisé${(counts?.countries || 0) > 1 ? 's' : ''}`,
        eyebrow: 'Voyage',
        href: '/pays' as const,
        variant: 'compact',
        tone: 'sun',
        value: `${(counts?.countries || 0)}`,
      },
      {
        id: 'concerts',
        title: 'Concerts',
        body: `${(counts?.concerts || 0)} live${(counts?.concerts || 0) > 1 ? 's' : ''} archivé${(counts?.concerts || 0) > 1 ? 's' : ''}`,
        eyebrow: 'Scène',
        href: '/concerts' as const,
        variant: 'compact',
        tone: 'neutral',
        value: `${(counts?.concerts || 0)}`,
      },
      {
        id: 'reglages',
        title: 'Réglages',
        body: 'Thème auto, accent, confort et accueil personnalisable.',
        eyebrow: 'Look',
        href: '/reglages' as const,
        variant: 'compact',
        tone: 'primary',
        value: 'UI',
      },
      {
        id: 'plus',
        title: 'Plus',
        body: 'Sauvegarde, PIN et outils avancés.',
        eyebrow: 'Système',
        href: '/plus' as const,
        variant: 'wide',
        tone: 'accent',
        value: 'Sync',
      },
    ],
    [
      (counts?.books || 0),
      (counts?.activities || 0),
      (counts?.concerts || 0),
      (counts?.countries || 0),
      (counts?.doses || 0),
      (counts?.links || 0),
      (counts?.tags || 0),
      friseHref,
      (counts?.games || 0),
      (counts?.ideas || 0),
      journalHref,
      latestNotes.length,
      objectifsHref,
      (counts?.people || 0),
      (counts?.projects || 0),
      scheduledReminderCount,
      (counts?.sleep || 0),
      (counts?.substances || 0),
      (counts?.templates || 0),
      totalPendingItems,
      totalTags,
      treatmentHref,
    ],
  );

  const personalizedQuickActions = useMemo(() => {
    const actionById = new Map(quickActions.map((action) => [action.id, action]));

    return preferences.homeModules.flatMap((moduleId) => {
      const action = actionById.get(moduleId);
      if (!action) {
        return [];
      }

      if (!preferences.showSensitiveContent && sensitiveHomeModuleIds.includes(moduleId)) {
        return [];
      }

      return [action];
    });
  }, [preferences.homeModules, preferences.showSensitiveContent, quickActions]);

  const todayKey = localDay();
  const todayJournalEntry = journalEntries.find((entry) => entry.date === todayKey) ?? null;
  const activeTreatments = treatments.filter((treatment) => treatment.name || treatment.dose || treatment.takenDays.length);
  const pendingTreatments = activeTreatments.filter((treatment) => !treatment.takenDays.includes(todayKey));
  const nextTreatment = pendingTreatments[0] ?? activeTreatments[0] ?? null;
  const hasTreatment = activeTreatments.length > 0;
  const backupAgeDays = preferences.lastBackupAt
    ? Math.floor((Date.now() - preferences.lastBackupAt) / (24 * 60 * 60 * 1000))
    : null;
  const backupNeedsAttention = backupAgeDays === null || backupAgeDays >= 7;
  const nextBirthday = people
    .flatMap((person) => {
      const birthday = getNextBirthday(person);
      return birthday ? [birthday] : [];
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime())[0] ?? null;
  const nextBirthdayInDays = nextBirthday
    ? Math.ceil((nextBirthday.date.getTime() - new Date().setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000))
    : null;
  const contextWidgets = useMemo<ContextWidget[]>(
    () => [
      {
        id: 'focus',
        icon: '◎',
        title: dueReminders.length ? `${dueReminders.length} chose${dueReminders.length > 1 ? 's' : ''} pour aujourd'hui` : 'Journée claire',
        body: dueReminders.length
          ? 'Rappels dus, listes actives et routines restent accessibles en un geste.'
          : openObjectives.length
            ? `${openObjectives.length} objectif${openObjectives.length > 1 ? 's' : ''} encore ouvert${openObjectives.length > 1 ? 's' : ''}.`
            : 'Aucun rappel urgent détecté pour le moment.',
        actionLabel: dueReminders.length ? 'Voir' : openObjectives.length ? 'Objectifs' : 'Agenda',
        href: dueReminders.length ? ('/rappels' as const) : openObjectives.length ? objectifsHref : ('/agenda' as const),
        visible: dueReminders.length > 0 || openObjectives.length > 0 || enabledRoutines.length > 0,
      },
      {
        id: 'treatment',
        icon: '✚',
        title: nextTreatment?.name || 'Traitement',
        body: pendingTreatments.length > 1
          ? `${pendingTreatments.length} traitements ne sont pas cochés aujourd'hui.`
          : nextTreatment?.dose
            ? `${nextTreatment.dose} n'est pas coché aujourd'hui.`
            : 'Le suivi traitement est actif et attend la coche du jour.',
        actionLabel: 'Ouvrir',
        href: treatmentHref,
        visible: preferences.showSensitiveContent && pendingTreatments.length > 0,
      },
      {
        id: 'journal',
        icon: '◐',
        title: 'Journal du jour',
        body: todayJournalEntry ? 'Une entrée existe déjà pour aujourd\'hui.' : 'Aucune humeur notée aujourd\'hui.',
        actionLabel: todayJournalEntry ? 'Relire' : 'Noter',
        href: journalHref,
        visible: !todayJournalEntry,
      },
      {
        id: 'birthdays',
        icon: '◇',
        title: nextBirthday ? nextBirthday.person.name : 'Cercle',
        body:
          nextBirthday && nextBirthdayInDays !== null
            ? `${nextBirthdayInDays === 0 ? 'Anniversaire aujourd\'hui' : `Anniversaire dans ${nextBirthdayInDays} j`}${nextBirthday.age ? ` · ${nextBirthday.age} ans` : ''}.`
            : 'Aucun anniversaire daté dans le cercle.',
        actionLabel: 'Cercle',
        href: nextBirthday ? ({ pathname: '/cercle' as const, params: { personId: nextBirthday.person.id } }) : ('/cercle' as const),
        visible: nextBirthdayInDays !== null && nextBirthdayInDays <= 30,
      },
      {
        id: 'backup',
        icon: '⇧',
        title: backupAgeDays === null ? 'Sauvegarde à créer' : `Sauvegarde ${backupAgeDays} j`,
        body: backupAgeDays === null
          ? 'Aucun export local récent détecté.'
          : backupNeedsAttention
            ? 'Un nouvel export chiffré garderait le carnet récupérable.'
            : 'Le dernier export chiffré est encore récent.',
        actionLabel: 'Exporter',
        href: '/plus' as const,
        visible: backupNeedsAttention,
      },
    ],
    [
      backupAgeDays,
      backupNeedsAttention,
      dueReminders.length,
      enabledRoutines.length,
      journalHref,
      nextBirthday,
      nextBirthdayInDays,
      objectifsHref,
      openObjectives.length,
      preferences.lastBackupAt,
      preferences.showSensitiveContent,
      pendingTreatments.length,
      todayJournalEntry,
      treatmentHref,
      nextTreatment?.dose,
      nextTreatment?.name,
    ],
  );

  const visibleContextWidgets = preferences.homeWidgets.flatMap((widgetId) => {
    const widget = contextWidgets.find((candidate) => candidate.id === widgetId);
    return widget?.visible ? [widget] : [];
  });
  const compactHome = preferences.density === 'compact';
  const smallText = preferences.textScale === 'small';
  const largeText = preferences.textScale === 'large';
  const visibleQuickCaptureOptions = quickCaptureOptions.filter(
    (option) => !option.sensitive || preferences.showSensitiveContent,
  );
  const quickActionRows = useMemo(() => buildQuickActionRows(personalizedQuickActions), [personalizedQuickActions]);

  return (
    <AppShell
      kicker={formatDateLabel(now)}
      title="DΔemon"
      headerContent={
        <View style={styles.homeHeaderContent}>
          <View style={styles.homeHeaderTitleRow}>
            <Text style={[styles.homeHeaderTitle, largeText && styles.homeHeaderTitleLarge, smallText && styles.homeHeaderTitleSmall]}>DΔemon</Text>
            <Text style={[styles.homeHeaderPhonetic, largeText && styles.homeHeaderPhoneticLarge, smallText && styles.homeHeaderPhoneticSmall]}>[ˈdeɪ.mən]</Text>
          </View>
          
          <View style={styles.homeHeaderDefinition}>
            <Text style={[styles.homeHeaderDefinitionText, largeText && styles.homeHeaderDefinitionTextLarge, smallText && styles.homeHeaderDefinitionTextSmall]}>
              <Text style={styles.homeHeaderDefinitionItalic}>Du grec ancien δαίμων (daímōn)</Text> — voix intérieure, guide invisible.
            </Text>
            <Text style={[styles.homeHeaderDefinitionText, largeText && styles.homeHeaderDefinitionTextLarge, smallText && styles.homeHeaderDefinitionTextSmall]}>
              Pour Socrate, le daimonion était une présence silencieuse qui lui soufflait ses résolutions — non pas ce qu'il devait faire, mais ce qu'il ne devait pas faire. Un empêchement mystérieux, une sorte de voix.
            </Text>
            <Text style={[styles.homeHeaderDefinitionText, largeText && styles.homeHeaderDefinitionTextLarge, smallText && styles.homeHeaderDefinitionTextSmall]}>
              En informatique, un <Text style={[styles.homeHeaderDefinitionMono, largeText && styles.homeHeaderDefinitionMonoLarge, smallText && styles.homeHeaderDefinitionMonoSmall]}>daemon</Text> est un processus qui tourne en arrière-plan, hors du contrôle direct de l'utilisateur — discret, permanent, toujours là.
            </Text>
          </View>

          <Text style={[styles.homeHeaderSlogan, largeText && styles.homeHeaderSloganLarge, smallText && styles.homeHeaderSloganSmall]}>
            DΔemon est votre deuxième cerveau : il s'exécute en silence, retient ce que vous oubliez, et vous souffle ce dont vous avez besoin.
          </Text>

          <View style={styles.homeGreetingRow}>
            <Text style={[styles.homeGreetingText, largeText && styles.homeGreetingTextLarge, smallText && styles.homeGreetingTextSmall]}>
              {getGreeting(now)} • Prêt pour consigner vos pensées.
            </Text>
          </View>
        </View>
      }
    >
      <View style={[styles.searchCard, compactHome && styles.searchCardCompact]}>
        <TextInput
          onChangeText={setSearchQuery}
          placeholder="Rechercher partout..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          value={searchQuery}
        />
        <Text style={styles.searchGlyph}>⌕</Text>
      </View>

      {!trimmedQuery ? (
        <View style={styles.tabContainer}>
          {homeTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                  setActiveTab(tab.id);
                }}
                style={[
                  styles.tabItem,
                  isActive && styles.tabItemActive,
                ]}
              >
                <Ionicons
                  name={isActive ? (tab.id === 'synthese' ? 'analytics' : tab.id === 'capture' ? 'flash' : 'grid') : (tab.id === 'synthese' ? 'analytics-outline' : tab.id === 'capture' ? 'flash-outline' : 'grid-outline')}
                  size={15}
                  color={isActive ? colors.white : colors.muted}
                />
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!trimmedQuery ? (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
            router.push('/bilan');
          }}
          style={({ pressed }) => [styles.bilanBannerCard, pressed && styles.pressCard]}
        >
          <View style={styles.bilanBannerContent}>
            <View style={styles.bilanBannerLeft}>
              <Text style={styles.bilanBannerTitle}>✨ Rituel : Bilan du jour</Text>
              <Text numberOfLines={2} style={styles.bilanBannerText}>
                Humeur, sommeil, activité, traitements... Enregistrez ou mettez à jour votre journée pas à pas.
              </Text>
            </View>
            <Ionicons color={colors.accent} name="arrow-forward-circle" size={32} />
          </View>
        </Pressable>
      ) : null}

      {trimmedQuery ? (
        <View style={styles.searchScopeRow}>
          {searchScopeOptions.map((option) => {
            const selected = searchScope === option.id;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                hitSlop={hitSlop}
                key={option.id}
                onPress={() => setSearchScope(option.id)}
                style={({ pressed }) => [styles.searchScopeChip, selected && styles.searchScopeChipSelected, pressed && styles.pressSoft]}
              >
                <Text style={[styles.searchScopeLabel, selected && styles.searchScopeLabelSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {trimmedQuery ? (
        searchResults.length ? (
          <View style={styles.panel}>
            {searchResults.map((result, index) => (
              <View
                key={`${result.subtitle}-${result.id}`}
                style={[styles.resultRow, compactHome && styles.resultRowCompact, index > 0 && styles.resultRowBorder]}
              >
                <Pressable accessibilityLabel={`Ouvrir ${result.title}`} accessibilityRole="button" hitSlop={hitSlop} onPress={() => router.push(result.href)} style={({ pressed }) => [styles.resultMain, pressed && styles.pressSoft]}>
                  <Text style={styles.resultTitle}>{result.title}</Text>
                  {result.snippet ? <Text numberOfLines={2} style={styles.resultSnippet}>{result.snippet}</Text> : null}
                  <Text style={styles.resultMeta}>{result.subtitle}</Text>
                </Pressable>
                {result.action ? (
                  <Pressable
                    accessibilityLabel={`${result.action.label} pour ${result.title}`}
                    accessibilityRole="button"
                    hitSlop={hitSlop}
                    onPress={() => handleSearchAction(result.action!)}
                    style={({ pressed }) => [styles.resultActionButton, pressed && styles.pressSoft]}
                  >
                    <Text style={styles.resultActionLabel}>{result.action.label}</Text>
                  </Pressable>
                ) : null}
                <Ionicons color={colors.muted} name="chevron-forward" size={18} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState title="Aucun résultat" message="Essaie un autre mot pour les notes, idées, collections ou rappels." />
        )
      ) : (
        <>
          {activeTab === 'synthese' && (
            <>
              <Text style={styles.sectionLabel}>Résumé</Text>
              <View style={[styles.metricsCard, compactHome && styles.metricsCardCompact]}>
                <View style={styles.metricCell}>
                  <Text style={styles.metricValue}>{counts?.notes ?? 0}</Text>
                  <Text style={styles.metricLabel}>Notes</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricCell}>
                  <Text style={styles.metricValue}>{counts?.checklists ?? 0}</Text>
                  <Text style={styles.metricLabel}>Listes</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricCell}>
                  <Text style={styles.metricValue}>{dueReminders.length}</Text>
                  <Text style={styles.metricLabel}>Du jour</Text>
                </View>
              </View>
            </>
          )}

          {activeTab === 'capture' && (
            <>
              <View style={[styles.quickCaptureCard, compactHome && styles.quickCaptureCardCompact]}>
                <View style={styles.quickCaptureHeader}>
                  <View style={styles.quickCaptureHeading}>
                    <Text style={styles.quickCaptureTitle}>Nouvelle capture</Text>
                    <Text style={styles.quickCaptureMeta}>Rédige ta pensée ci-dessous. Le carnet s'occupe de la classer.</Text>
                  </View>
              <Pressable
                accessibilityLabel="Ajouter la capture rapide"
                accessibilityRole="button"
                accessibilityState={{ disabled: quickCaptureBusy || !quickCaptureText.trim() }}
                disabled={quickCaptureBusy || !quickCaptureText.trim()}
                hitSlop={hitSlop}
                onPress={handleQuickCapture}
                style={({ pressed }) => [
                  styles.quickCaptureButton,
                  (quickCaptureBusy || !quickCaptureText.trim()) && styles.quickCaptureButtonDisabled,
                  pressed && styles.pressScale,
                ]}
              >
                {quickCaptureBusy ? (
                  <Text style={styles.quickCaptureButtonLabel}>...</Text>
                ) : (
                  <Ionicons color={colors.white} name="add" size={24} />
                )}
              </Pressable>
            </View>
            <View style={styles.quickCaptureKinds}>
              {visibleQuickCaptureOptions.map((option) => {
                const selected = quickCaptureKind === option.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Type de capture ${option.label}`}
                    hitSlop={hitSlop}
                    key={option.id}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                      setQuickCaptureKind(option.id);
                    }}
                    style={({ pressed }) => [styles.quickCaptureKind, selected && styles.quickCaptureKindSelected, pressed && styles.pressSoft]}
                  >
                    <Text style={[styles.quickCaptureKindLabel, selected && styles.quickCaptureKindLabelSelected]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              multiline
              ref={quickCaptureInputRef}
              onChangeText={setQuickCaptureText}
              placeholder={audioRecordingNow ? "L'audio capturera ta pensée..." : (quickCapturePlaceholders[quickCaptureKind] || "Écrire et ajouter...")}
              placeholderTextColor={audioRecordingNow ? colors.accent : colors.muted}
              style={[styles.quickCaptureInput, audioRecordingNow && { opacity: 0.5 }]}
              textAlignVertical="top"
              value={quickCaptureText}
              editable={!audioRecordingNow}
            />

            <View style={styles.quickCaptureOptionsContainer}>
              {(quickCaptureKind === 'note' || quickCaptureKind === 'idee' || quickCaptureKind === 'journal' || quickCaptureKind === 'prise') && (
                <TextInput
                  placeholder="Tags (séparés par des virgules)"
                  placeholderTextColor={colors.muted}
                  style={styles.quickCaptureExtraInput}
                  value={qcExtraTags}
                  onChangeText={setQcExtraTags}
                />
              )}
              {quickCaptureKind === 'rappel' && (
                <View style={{ gap: spacing.sm }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCaptureChips}>
                    {buildReminderPresets().map((preset, index) => (
                      <Pressable
                        key={preset.label}
                        onPress={() => setQcReminderPresetIndex(index)}
                        style={({ pressed }) => [styles.qcOptionChip, qcReminderPresetIndex === index && { backgroundColor: colors.accent, borderColor: colors.accent }, pressed && styles.pressScale]}
                      >
                        <Text style={[styles.qcOptionChipLabel, qcReminderPresetIndex === index && { color: colors.white }]}>{preset.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <View style={{ gap: spacing.xs }}>
                    <Text style={styles.qcSectionLabel}>Catégorie & Récurrence</Text>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCaptureChips} style={{ flex: 1 }}>
                        {['rappel', 'famille', 'amis', 'date', 'loyer', 'rdv', 'pro', 'medicament', 'autre'].map((cat) => (
                          <Pressable
                            key={cat}
                            onPress={() => setQcReminderCategory(cat)}
                            style={({ pressed }) => [styles.qcOptionChip, qcReminderCategory === cat && { backgroundColor: colors.accent, borderColor: colors.accent }, pressed && styles.pressScale]}
                          >
                            <Text style={[styles.qcOptionChipLabel, qcReminderCategory === cat && { color: colors.white }]}>{cat}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCaptureChips} style={{ flex: 1 }}>
                        {['none', 'daily', 'weekly', 'monthly', 'yearly'].map((rep) => (
                          <Pressable
                            key={rep}
                            onPress={() => setQcRepeat(rep)}
                            style={({ pressed }) => [styles.qcOptionChip, qcRepeat === rep && { backgroundColor: colors.accent, borderColor: colors.accent }, pressed && styles.pressScale]}
                          >
                            <Text style={[styles.qcOptionChipLabel, qcRepeat === rep && { color: colors.white }]}>
                              {rep === 'none' ? 'Une fois' : rep === 'daily' ? 'Quotidien' : rep === 'weekly' ? 'Hebdo' : rep === 'monthly' ? 'Mensuel' : 'Annuel'}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>

                  <DateField
                    value={qcDate}
                    onChange={setQcDate}
                    label="Date précise"
                    allowClear
                  />
                  <TextInput
                    placeholder="Heure exacte (ex: 18:30)"
                    placeholderTextColor={colors.muted}
                    style={styles.quickCaptureExtraInput}
                    value={qcTime}
                    onChangeText={setQcTime}
                  />
                </View>
              )}
              {quickCaptureKind === 'idee' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCaptureChips}>
                  {[
                    { id: 'explorer', label: 'Explorer' },
                    { id: 'encours', label: 'En cours' },
                    { id: 'publie', label: 'Terminé / Publié' },
                  ].map((status) => (
                    <Pressable
                      key={status.id}
                      onPress={() => setQcIdeaStatus(status.id as any)}
                      style={({ pressed }) => [styles.qcOptionChip, qcIdeaStatus === status.id && { backgroundColor: colors.accent, borderColor: colors.accent }, pressed && styles.pressScale]}
                    >
                      <Text style={[styles.qcOptionChipLabel, qcIdeaStatus === status.id && { color: colors.white }]}>{status.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {quickCaptureKind === 'journal' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCaptureChips}>
                  {[1, 2, 3, 4, 5].map((moodValue) => (
                    <Pressable
                      key={moodValue}
                      onPress={() => setQcMood(moodValue)}
                      style={({ pressed }) => [
                        styles.qcOptionChip, 
                        qcMood === moodValue && { backgroundColor: getInterpolatedMoodColor(moodValue), borderColor: getInterpolatedMoodColor(moodValue) },
                        pressed && styles.pressScale
                      ]}
                    >
                      <Text style={[styles.qcOptionChipLabel, qcMood === moodValue && { color: colors.white }]}>Score {moodValue}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {quickCaptureKind === 'objectif' && (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCaptureChips}>
                    {[
                      { id: 'perso', label: 'Personnel' },
                      { id: 'pro', label: 'Professionnel' },
                    ].map((scope) => (
                      <Pressable
                        key={scope.id}
                        onPress={() => setQcObjectiveScope(scope.id as any)}
                        style={({ pressed }) => [styles.qcOptionChip, qcObjectiveScope === scope.id && { backgroundColor: colors.accent, borderColor: colors.accent }, pressed && styles.pressScale]}
                      >
                        <Text style={[styles.qcOptionChipLabel, qcObjectiveScope === scope.id && { color: colors.white }]}>{scope.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <DateField
                    value={qcDate}
                    onChange={setQcDate}
                    label="Échéance"
                    allowClear
                  />
                </>
              )}
              {quickCaptureKind === 'prise' && (
                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <TextInput
                      placeholder="Dose"
                      placeholderTextColor={colors.muted}
                      style={[styles.quickCaptureExtraInput, { flex: 1 }]}
                      value={qcCustomDosage}
                      onChangeText={setQcCustomDosage}
                    />
                    <TextInput
                      placeholder="Unité"
                      placeholderTextColor={colors.muted}
                      style={[styles.quickCaptureExtraInput, { flex: 0.5 }]}
                      value={qcUnit}
                      onChangeText={setQcUnit}
                    />
                  </View>

                  <View>
                    <TextInput
                      placeholder="Catégorie (ex: Stim, Depr...)"
                      placeholderTextColor={colors.muted}
                      style={styles.quickCaptureExtraInput}
                      value={qcSubstanceCategory}
                      onChangeText={setQcSubstanceCategory}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCaptureChips} style={{ marginTop: 4 }}>
                      {substanceCategoryOptions.filter(o => !qcSubstanceCategory || o.label.toLowerCase().includes(qcSubstanceCategory.toLowerCase())).slice(0, 5).map((opt) => (
                        <Pressable
                          key={opt.id}
                          onPress={() => setQcSubstanceCategory(opt.label)}
                          style={({ pressed }) => [styles.qcOptionChip, pressed && styles.pressScale]}
                        >
                          <Text style={styles.qcOptionChipLabel}>{opt.label}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>

                  <View>
                    <TextInput
                      placeholder="Voie (ex: Orale, Nasale...)"
                      placeholderTextColor={colors.muted}
                      style={styles.quickCaptureExtraInput}
                      value={qcRoute}
                      onChangeText={setQcRoute}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCaptureChips} style={{ marginTop: 4 }}>
                      {doseRoutes.filter(r => !qcRoute || r.toLowerCase().includes(qcRoute.toLowerCase())).slice(0, 5).map((r) => (
                        <Pressable
                          key={r}
                          onPress={() => setQcRoute(r)}
                          style={({ pressed }) => [styles.qcOptionChip, pressed && styles.pressScale]}
                        >
                          <Text style={styles.qcOptionChipLabel}>{r}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              )}
              {quickCaptureKind !== 'liste' && (
                <PeoplePicker
                  entityKind="note" // Uses 'note' just to bypass required prop; we manage selectedIds directly
                  entityId="temp" // Dummy ID
                  selectedIds={qcPeople}
                  onChange={setQcPeople}
                />
              )}
            </View>

            <Pressable
              accessibilityLabel="Dicter un mémo vocal"
              accessibilityRole="button"
              hitSlop={hitSlop}
              onPress={handleQuickCaptureDictation}
              style={({ pressed }) => [styles.dictationButton, audioRecordingNow && { backgroundColor: colors.accentSoft }, pressed && styles.pressSoft]}
            >
              <Ionicons color={audioRecordingNow ? colors.accent : colors.muted} name={audioRecordingNow ? "stop-circle-outline" : "mic-outline"} size={17} />
              <Text style={[styles.dictationButtonLabel, audioRecordingNow && { color: colors.accent, fontFamily: fonts.bodyBold }]}>
                {audioRecordingNow ? `Stop (${audioDurationSec}s)` : 'Mémo vocal'}
              </Text>
            </Pressable>
            {quickCaptureFeedback ? <Text style={styles.quickCaptureFeedback}>{quickCaptureFeedback}</Text> : null}
          </View>

          <View style={styles.tipCard}>
            <Ionicons color={colors.accent} name="bulb-outline" size={20} />
            <View style={styles.tipBody}>
              <Text style={styles.tipTitle}>Astuce d'organisation</Text>
              <Text style={styles.tipText}>
                Le premier mot ou la première ligne sert de titre principal pour l'élément créé. Pratique et ultra rapide !
              </Text>
            </View>
          </View>
        </>
      )}

      {activeTab === 'synthese' && (
        <>
          {visibleContextWidgets.length ? (
            <>
              <Text style={styles.sectionLabel}>Signaux</Text>
              {visibleContextWidgets.map((widget) => {
                let highlightStyle = {};
                let iconColor = colors.accent;
                if (widget.id === 'treatment') {
                  highlightStyle = { borderColor: colors.accent };
                  iconColor = colors.accent;
                } else if (widget.id === 'backup') {
                  highlightStyle = { borderColor: colors.sun };
                  iconColor = colors.warning;
                } else if (widget.id === 'focus') {
                  highlightStyle = { borderColor: colors.lineStrong };
                  iconColor = colors.text;
                } else if (widget.id === 'birthdays') {
                  highlightStyle = { borderColor: colors.warning };
                  iconColor = colors.warning;
                }

                return (
                  <Pressable
                    accessibilityLabel={`Ouvrir ${widget.title}`}
                    accessibilityRole="button"
                    key={widget.id}
                    onPress={() => router.push(widget.href)}
                    style={({ pressed }) => [styles.panelRowCard, compactHome && styles.panelRowCardCompact, highlightStyle, pressed && styles.pressCard]}
                  >
                    <Text style={[styles.panelIcon, { color: iconColor }]}>{widget.icon}</Text>
                    <View style={styles.panelBody}>
                      <Text style={[styles.panelTitle, largeText && styles.panelTitleLarge, smallText && styles.panelTitleSmall]}>{widget.title}</Text>
                      <Text style={[styles.panelText, largeText && styles.panelTextLarge, smallText && styles.panelTextSmall]}>{widget.body}</Text>
                    </View>
                    <View style={styles.inlineChip}>
                      <Text style={styles.inlineChipLabel}>{widget.actionLabel}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Revue {reviewRange.label}</Text>
          <View style={styles.reviewRangePanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewRangeOptions}>
              {reviewRangeOptions.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reviewRangeMode === option.value }}
                  hitSlop={hitSlop}
                  onPress={() => setReviewRangeMode(option.value)}
                  style={({ pressed }) => [styles.reviewRangeChip, reviewRangeMode === option.value && styles.reviewRangeChipActive, pressed && styles.pressSoft]}
                >
                  <Text style={[styles.reviewRangeLabel, reviewRangeMode === option.value && styles.reviewRangeLabelActive]}>{option.label}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: reviewRangeMode === 'custom' }}
                hitSlop={hitSlop}
                onPress={() => setReviewRangeMode('custom')}
                style={({ pressed }) => [styles.reviewRangeChip, reviewRangeMode === 'custom' && styles.reviewRangeChipActive, pressed && styles.pressSoft]}
              >
                <Text style={[styles.reviewRangeLabel, reviewRangeMode === 'custom' && styles.reviewRangeLabelActive]}>Perso</Text>
              </Pressable>
            </ScrollView>
            {reviewRangeMode === 'custom' ? (
              <View style={styles.reviewCustomRangeFields}>
                <DateField label="Du" value={customReviewStart} onChange={setCustomReviewStart} />
                <DateField label="Au" value={customReviewEnd} onChange={setCustomReviewEnd} />
              </View>
            ) : null}
          </View>
          <View style={styles.weeklyReviewCard}>
            {weeklyReviewItems.map((item, index) => (
              <Pressable
                key={item.label}
                onPress={() => router.push(item.href)}
                style={({ pressed }) => [styles.weeklyReviewRow, compactHome && styles.weeklyReviewRowCompact, index > 0 && styles.weeklyReviewRowBorder, pressed && styles.pressSoft]}
              >
                <View style={styles.weeklyReviewMain}>
                  <Text style={styles.weeklyReviewLabel}>{item.label}</Text>
                  <Text style={styles.weeklyReviewDetail}>{item.detail}</Text>
                </View>
                <Text style={[styles.weeklyReviewValue, item.color ? { color: item.color } : null]}>{item.value}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Aujourd'hui</Text>
          {dueReminders.length ? (
            <View style={styles.panel}>
              {dueReminders.slice(0, 4).map((reminder, index) => (
                <Pressable
                  key={reminder.id}
                  onPress={() => router.push({ pathname: '/rappels', params: { reminderId: reminder.id } })}
                  style={({ pressed }) => [styles.resultRow, compactHome && styles.resultRowCompact, index > 0 && styles.resultRowBorder, pressed && styles.pressSoft]}
                >
                  <View style={styles.resultMain}>
                    <Text style={styles.resultTitle}>{reminder.title}</Text>
                    <Text style={styles.resultMeta}>
                      {formatTimeLabel(reminder.scheduledFor)}{reminder.repeatRule !== 'none' ? ' · récurrent' : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.emptyInline}>Rien de prévu aujourd'hui.</Text>
            </View>
          )}

          {upcomingReminders.length ? (
            <>
              <Text style={styles.sectionLabel}>Cette semaine</Text>
              <View style={styles.panel}>
                {upcomingReminders.slice(0, 4).map((reminder, index) => (
                  <Pressable
                    key={reminder.id}
                    onPress={() => router.push({ pathname: '/rappels', params: { reminderId: reminder.id } })}
                    style={({ pressed }) => [styles.resultRow, compactHome && styles.resultRowCompact, index > 0 && styles.resultRowBorder, pressed && styles.pressSoft]}
                  >
                    <View style={styles.resultMain}>
                      <Text style={styles.resultTitle}>{reminder.title}</Text>
                      <Text style={styles.resultMeta}>{formatDayLabel(reminder.scheduledFor)} · {formatTimeLabel(reminder.scheduledFor)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {openLists.length ? (
            <>
              <Text style={styles.sectionLabel}>Listes en cours</Text>
              <View style={styles.panel}>
                {openLists.slice(0, 3).map((list, index) => (
                  <Pressable
                    key={list.id}
                    onPress={() => router.push({ pathname: '/listes', params: { listId: list.id } })}
                    style={({ pressed }) => [styles.resultRow, compactHome && styles.resultRowCompact, index > 0 && styles.resultRowBorder, pressed && styles.pressSoft]}
                  >
                    <View style={styles.resultMain}>
                      <Text style={styles.resultTitle}>{list.name}</Text>
                      <Text style={styles.resultMeta}>
                        {Math.max(0, list.itemCount - list.doneCount)} element{Math.max(0, list.itemCount - list.doneCount) > 1 ? 's' : ''} restant{Math.max(0, list.itemCount - list.doneCount) > 1 ? 's' : ''}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {latestNotes.length ? (
            <>
              <Text style={styles.sectionLabel}>Dernieres notes</Text>
              {latestNotes.map((note) => (
                <Pressable
                  key={note.id}
                  onPress={() => router.push({ pathname: '/notes', params: { noteId: note.id } })}
                  style={({ pressed }) => [styles.noteCard, compactHome && styles.noteCardCompact, pressed && styles.pressCard]}
                >
                  <Text style={styles.noteTitle}>{note.title}</Text>
                  <Text numberOfLines={3} style={styles.noteBody}>
                    {note.body || 'Note vide pour le moment.'}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      )}

      {activeTab === 'modules' && (
        <>
          <Text style={styles.sectionLabel}>Mes Modules</Text>
          <View style={[styles.quickGrid, compactHome && styles.quickGridCompact]}>
            {quickActionRows.length ? quickActionRows.map((row) => (
              <View key={row.map((action) => action.id).join('-')} style={[styles.quickGridRow, compactHome && styles.quickGridRowCompact]}>
                {row.map((action) => {
                  const tileToneStyle =
                    action.tone === 'accent'
                      ? styles.quickTileAccent
                      : action.tone === 'sun'
                        ? styles.quickTileSun
                        : action.tone === 'primary'
                          ? styles.quickTilePrimary
                          : styles.quickTileNeutral;
                  const eyebrowToneStyle =
                    action.tone === 'accent'
                      ? styles.quickEyebrowAccent
                      : action.tone === 'sun'
                        ? styles.quickEyebrowSun
                        : action.tone === 'primary'
                          ? styles.quickEyebrowPrimary
                          : styles.quickEyebrowNeutral;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={action.id}
                      onPress={() => router.push(action.href)}
                      style={({ pressed }) => [
                        styles.quickTile,
                        compactHome && styles.quickTileDense,
                        tileToneStyle,
                        row.length === 1 && action.variant !== 'hero' && action.variant !== 'wide' && styles.quickTileSingle,
                        action.variant === 'hero' && styles.quickTileHero,
                        action.variant === 'wide' && styles.quickTileWide,
                        action.variant === 'tall' && styles.quickTileTall,
                        action.variant === 'compact' && styles.quickTileCompact,
                        pressed && styles.quickTilePressed,
                      ]}
                    >
                      {action.variant === 'hero' && !preferences.reduceMotion ? (
                        <LinearGradient
                          colors={[colors.accentSoft, 'transparent']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.quickGlow}
                        />
                      ) : null}
                      <View style={styles.quickTopRow}>
                        <Text numberOfLines={1} style={[styles.quickEyebrow, eyebrowToneStyle]}>{action.eyebrow}</Text>
                        <Text
                          adjustsFontSizeToFit
                          minimumFontScale={0.72}
                          numberOfLines={1}
                          style={[
                            styles.quickValue,
                            action.variant === 'hero' && styles.quickValueHero,
                            action.variant === 'wide' && styles.quickValueWide,
                            action.variant === 'compact' && styles.quickValueCompact,
                            action.value.length >= 4 && styles.quickValueLong,
                          ]}
                        >
                          {action.value}
                        </Text>
                      </View>
                      <View style={styles.quickBodyBlock}>
                        <Text style={[styles.quickTitle, largeText && styles.quickTitleLarge, smallText && styles.quickTitleSmall]}>{action.title}</Text>
                        <Text style={[styles.quickBody, largeText && styles.quickBodyLarge, smallText && styles.quickBodySmall]}>{action.body}</Text>
                      </View>
                      <View style={styles.quickFooter}>
                        <View style={styles.quickFooterRail} />
                        <View style={styles.quickArrowBubble}>
                          <Ionicons color={colors.accent} name="arrow-forward" size={15} />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )) : (
              <View style={styles.panel}>
                <Text style={styles.emptyInline}>Tous les raccourcis d\'accueil sont masqués dans les réglages.</Text>
              </View>
            )}
          </View>
        </>
      )}
        </>
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressSoft: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  pressScale: {
    opacity: 0.82,
    transform: [{ scale: 0.94 }],
  },
  pressCard: {
    borderColor: colors.accent,
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  bilanBannerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  bilanBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bilanBannerLeft: {
    flex: 1,
    gap: 4,
  },
  bilanBannerTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 16,
  },
  bilanBannerText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  searchCardCompact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  metricsCardCompact: {
    paddingVertical: spacing.md,
  },
  quickCaptureCardCompact: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelRowCardCompact: {
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: 74,
  },
  weeklyReviewRowCompact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  resultRowCompact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 50,
  },
  noteCardCompact: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  searchCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    minWidth: 0,
    padding: 0,
  },
  searchGlyph: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
  },
  searchScopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  searchScopeChip: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchScopeChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  searchScopeLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  searchScopeLabelSelected: {
    color: colors.white,
  },
  sectionLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1.4,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  qcSectionLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricsCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    flexDirection: 'row',
    paddingVertical: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
  },
  metricCell: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  metricDivider: {
    alignSelf: 'stretch',
    backgroundColor: colors.line,
    width: 1,
  },
  metricValue: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 28,
  },
  metricLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  primaryCta: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primaryCtaLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    textAlign: 'center',
  },
  quickCaptureCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
  },
  quickCaptureHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  quickCaptureHeading: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  quickCaptureTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
  },
  quickCaptureMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  quickCaptureButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 46,
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    width: 46,
  },
  quickCaptureButtonDisabled: {
    opacity: 0.45,
  },
  quickCaptureButtonLabel: {
    color: colors.white,
    fontFamily: fonts.title,
    fontSize: 24,
    lineHeight: 28,
  },
  quickCaptureKinds: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickCaptureKind: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickCaptureKindSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  quickCaptureKindLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  quickCaptureKindLabelSelected: {
    color: colors.white,
  },
  quickCaptureInput: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    maxWidth: '100%',
    minHeight: 72,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  quickCaptureOptionsContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  quickCaptureExtraInput: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickCaptureChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  qcOptionChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: 'transparent',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  qcOptionChipLabel: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  dictationButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dictationButtonLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  quickCaptureFeedback: {
    color: colors.accent,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  panelRowCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 92,
    minWidth: 0,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  panelIcon: {
    color: colors.accent,
    flexShrink: 0,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  panelBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  panelTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 18,
  },
  panelTitleLarge: {
    fontSize: 20,
    lineHeight: 24,
  },
  panelTitleSmall: {
    fontSize: 16,
    lineHeight: 20,
  },
  panelText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  panelTextLarge: {
    fontSize: 15,
    lineHeight: 22,
  },
  panelTextSmall: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  inlineChip: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    justifyContent: 'center',
    flexShrink: 0,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inlineChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  panel: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
  },
  reviewRangePanel: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  reviewRangeOptions: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  reviewRangeChip: {
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reviewRangeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  reviewRangeLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  reviewRangeLabelActive: {
    color: colors.white,
  },
  reviewCustomRangeFields: {
    gap: spacing.md,
  },
  weeklyReviewCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
  },
  weeklyReviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  weeklyReviewRowBorder: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  weeklyReviewMain: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  weeklyReviewLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  weeklyReviewDetail: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  weeklyReviewValue: {
    color: colors.accent,
    flexShrink: 0,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  resultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 62,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  resultRowBorder: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  resultMain: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 0,
  },
  resultTitle: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
  },
  resultMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  resultSnippet: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12.5,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  resultActionButton: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resultActionLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  resultArrow: {
    color: colors.muted,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  emptyInline: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    padding: spacing.lg,
  },
  noteCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  noteTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 21,
  },
  noteBody: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  quickGrid: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  quickGridCompact: {
    gap: spacing.sm,
  },
  quickGridRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickGridRowCompact: {
    gap: spacing.sm,
  },
  quickTile: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    flex: 1,
    flexBasis: 0,
    justifyContent: 'space-between',
    maxWidth: '100%',
    minHeight: 142,
    minWidth: 0,
    overflow: 'hidden',
    padding: spacing.lg,
    position: 'relative',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
  },
  quickTilePressed: {
    borderColor: colors.accent,
    opacity: 0.92,
    shadowOpacity: 0.04,
    transform: [{ scale: 0.982 }],
  },
  quickTileDense: {
    minHeight: 122,
    padding: spacing.md,
  },
  quickTileSingle: {
    flexBasis: 'auto',
    minHeight: 154,
  },
  quickTileHero: {
    minHeight: 196,
  },
  quickTileWide: {
    minHeight: 156,
  },
  quickTileTall: {
    minHeight: 188,
  },
  quickTileCompact: {},
  quickTileAccent: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accentSoft,
  },
  quickTileSun: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.sun,
  },
  quickTilePrimary: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
  },
  quickTileNeutral: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
  },
  quickGlow: {
    ...StyleSheet.absoluteFill,
    opacity: 0.9,
  },
  quickTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minWidth: 0,
    zIndex: 1,
  },
  quickEyebrow: {
    borderRadius: radii.pill,
    flexShrink: 1,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.3,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    textTransform: 'uppercase',
  },
  quickEyebrowAccent: {
    backgroundColor: colors.accentSoft,
    color: colors.accent,
  },
  quickEyebrowSun: {
    backgroundColor: 'rgba(255, 159, 28, 0.16)',
    color: colors.warning,
  },
  quickEyebrowPrimary: {
    backgroundColor: colors.accentSoft,
    color: colors.accent,
  },
  quickEyebrowNeutral: {
    backgroundColor: colors.chip,
    color: colors.muted,
  },
  quickValue: {
    color: colors.text,
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 26,
    textAlign: 'right',
  },
  quickValueHero: {
    fontSize: 30,
    lineHeight: 32,
  },
  quickValueWide: {
    fontSize: 26,
    lineHeight: 28,
  },
  quickValueCompact: {
    fontSize: 18,
    lineHeight: 20,
  },
  quickValueLong: {
    fontSize: 16,
    lineHeight: 18,
  },
  quickBodyBlock: {
    gap: spacing.xs,
    minWidth: 0,
    zIndex: 1,
  },
  quickTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  quickTitleLarge: {
    fontSize: 22,
    lineHeight: 26,
  },
  quickTitleSmall: {
    fontSize: 18,
    lineHeight: 22,
  },
  quickBody: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  quickBodyLarge: {
    fontSize: 14,
    lineHeight: 21,
  },
  quickBodySmall: {
    fontSize: 12,
    lineHeight: 17,
  },
  quickFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  quickFooterRail: {
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 4,
    width: 44,
  },
  quickArrowBubble: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  quickArrow: {
    color: colors.accent,
    fontFamily: fonts.title,
    fontSize: 18,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.chip,
    borderRadius: radii.lg,
    padding: spacing.xs,
    alignSelf: 'stretch',
    borderColor: colors.lineStrong,
    borderWidth: 1,
    gap: spacing.xs,
    marginVertical: spacing.md,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  tabItemActive: {
    backgroundColor: colors.accent,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  tabLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.muted,
  },
  tabLabelActive: {
    color: colors.white,
  },
  tipCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  tipBody: {
    flex: 1,
    gap: spacing.xs,
  },
  tipTitle: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  tipText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  homeHeaderContent: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  homeHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  homeHeaderTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 34,
  },
  homeHeaderTitleLarge: {
    fontSize: 40,
  },
  homeHeaderTitleSmall: {
    fontSize: 28,
  },
  homeHeaderPhonetic: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  homeHeaderPhoneticLarge: {
    fontSize: 14,
  },
  homeHeaderPhoneticSmall: {
    fontSize: 10,
  },
  homeHeaderDefinition: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderColor: colors.line,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  homeHeaderDefinitionText: {
    color: colors.muted,
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
    lineHeight: 16.5,
  },
  homeHeaderDefinitionTextLarge: {
    fontSize: 13,
    lineHeight: 18.5,
  },
  homeHeaderDefinitionTextSmall: {
    fontSize: 10,
    lineHeight: 14,
  },
  homeHeaderDefinitionItalic: {
    fontStyle: 'italic',
  },
  homeHeaderDefinitionMono: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.accent,
  },
  homeHeaderDefinitionMonoLarge: {
    fontSize: 11,
  },
  homeHeaderDefinitionMonoSmall: {
    fontSize: 8.5,
  },
  homeHeaderSlogan: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    lineHeight: 19.5,
  },
  homeHeaderSloganLarge: {
    fontSize: 16,
    lineHeight: 22.5,
  },
  homeHeaderSloganSmall: {
    fontSize: 12,
    lineHeight: 17,
  },
  homeGreetingRow: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  homeGreetingText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  homeGreetingTextLarge: {
    fontSize: 14,
  },
  homeGreetingTextSmall: {
    fontSize: 10.5,
  },
});
