import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import { listEntityLinks, listEntityTags } from '../src/db/cross-repositories';
import {
  listConcerts,
  listCountries,
  listDoses,
  listGames,
  listIdeas,
  listPhysicalActivities,
  listSleepEntries,
  listSubstances,
} from '../src/db/module-repositories';
import {
  listBooks,
  listChecklists,
  listJournalEntries,
  listNotes,
  listPeople,
  listPersonCategories,
  listProjects,
  listReminders,
  listRoutines,
  listTreatments,
} from '../src/db/repositories';
import type {
  Book,
  BookStatus,
  ChecklistSummary,
  Concert,
  Country,
  Dose,
  EntityLink,
  EntityTag,
  Game,
  Idea,
  JournalEntry,
  Note,
  Person,
  PersonCategoryDefinition,
  PhysicalActivity,
  Project,
  ProjectStatus,
  Reminder,
  Routine,
  SleepEntry,
  Substance,
  Treatment,
} from '../src/db/types';
import { ideaStatusOptions, substanceCategoryOptions } from '../src/lib/module-options';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { getMoodColor, getInterpolatedMoodColor } from '../src/theme/score-colors';

const RANGE_OPTIONS = [
  { label: '7j', value: 7 },
  { label: '15j', value: 15 },
  { label: '30j', value: 30 },
  { label: '90j', value: 90 },
  { label: '180j', value: 180 },
  { label: '360j', value: 360 },
] as const;

type RangeMode = (typeof RANGE_OPTIONS)[number]['value'] | 'custom';

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function withinRange(value: string | number, start: number, end: number) {
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
  return timestamp >= start && timestamp <= end;
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

function formatShortDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getMonthlyDistribution(data: any[], months = 12) {
  const distribution: { label: string; value: number }[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    const count = data.filter((item) => {
      const dateStr = item.date || item.datetime || item.scheduledFor || item.publishDate;
      const ts = item.updatedAt || item.createdAt || (dateStr ? new Date(dateStr).getTime() : 0);
      return ts >= start && ts <= end;
    }).length;

    distribution.push({
      label: d.toLocaleDateString('fr-FR', { month: 'short' }),
      value: count,
    });
  }
  return distribution;
}

function buildRecentDays(count: number) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return buildDaysBetween(localDay(addDays(today, -(count - 1))), localDay(today));
}

function buildDaysBetween(startKey: string, endKey: string) {
  const startDate = parseDay(startKey);
  const endDate = parseDay(endKey);

  if (!startDate || !endDate) {
    return [];
  }

  const firstDate = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
  const lastDate = startDate.getTime() <= endDate.getTime() ? endDate : startDate;
  const days: Array<{ key: string; label: string }> = [];
  const cursor = new Date(firstDate);

  while (cursor.getTime() <= lastDate.getTime()) {
    const dayKey = localDay(cursor);
    days.push({
      key: dayKey,
      label: formatShortDay(dayKey),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

type TrendPoint = {
  key: string;
  label: string;
  value: number;
};

type TrendCardProps = {
  id: string;
  title: string;
  value: string;
  detail: string;
  points: TrendPoint[];
  color: string;
};

function getNextBirthdayTime(birthday: string) {
  if (!birthday) {
    return null;
  }

  const [year, month, day] = birthday.split('-').map(Number);
  if (!month || !day) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let next = new Date(today.getFullYear(), month - 1, day, 12, 0, 0, 0);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day, 12, 0, 0, 0);
  }

  return next.getTime();
}

function StatBar({ label, value, max, color, suffix }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const width = max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0;

  return (
    <View style={styles.barBlock}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>{`${value}${suffix ?? ''}`}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { backgroundColor: color, width: `${value ? width : 0}%` }]} />
      </View>
    </View>
  );
}

function TrendCard({ id, title, value, detail, points, color, onPress }: TrendCardProps & { onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const max = Math.max(1, ...points.map((point) => point.value));
  const barGap = points.length > 180 ? 0 : points.length > 60 ? 1 : 4;
  const barMaxWidth = points.length > 180 ? 4 : points.length > 60 ? 8 : 12;

  return (
    <Pressable style={styles.trendCard} onPress={onPress}>
      <View style={styles.trendHeader}>
        <View style={styles.trendTitleWrap}>
          <Text style={styles.trendTitle}>{title}</Text>
          <Text style={styles.trendDetail}>{detail}</Text>
        </View>
        <Text style={[styles.trendValue, (id === 'mood' || id === 'sleep') && { color }]}>{value}</Text>
      </View>
      <View style={[styles.trendBars, { gap: barGap }]}>
        {points.map((point) => {
          const height = point.value > 0 ? Math.max(8, Math.round((point.value / max) * 58)) : 4;
          const barColor = (id === 'mood' || id === 'sleep') && point.value > 0 ? getMoodColor(point.value) : (point.value ? color : colors.lineStrong);

          return (
            <View key={point.key} style={styles.trendBarSlot}>
              <View
                accessibilityLabel={`${title} ${point.label}: ${point.value}`}
                style={[styles.trendBar, { backgroundColor: barColor, height, maxWidth: barMaxWidth }]}
              />
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

type DetailItem = {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
};

type DetailModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: DetailItem[];
};

function DetailModal({ visible, onClose, title, subtitle, items }: DetailModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
          <Text style={styles.modalTitle}>{title}</Text>
          {subtitle ? <Text style={styles.modalSubtitle}>{subtitle}</Text> : null}
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {items.length > 0 ? (
              items.map((item, index) => (
                <StatBar
                  key={`${item.label}-${index}`}
                  color={item.color}
                  label={item.label}
                  max={item.max}
                  suffix={item.suffix}
                  value={item.value}
                />
              ))
            ) : (
              <Text style={styles.emptyInline}>Aucun detail disponible pour le moment.</Text>
            )}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <Text style={styles.modalCloseButtonText}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function StatsScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  const projectStatuses = useMemo(() => [
    { id: 'prospect', label: 'Prospect', color: '#a87bff' },
    { id: 'encours', label: 'En cours', color: '#ffb24a' },
    { id: 'termine', label: 'Terminé', color: colors.accent },
  ], [colors.accent]);

  const bookStatuses = useMemo(() => [
    { id: 'alire', label: 'À lire', color: '#a87bff' },
    { id: 'encours', label: 'En cours', color: '#ffb24a' },
    { id: 'lu', label: 'Lu', color: colors.accent },
    { id: 'abandon', label: 'Abandonné', color: '#8b95a9' },
  ], [colors.accent]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [lists, setLists] = useState<ChecklistSummary[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [personCategories, setPersonCategories] = useState<PersonCategoryDefinition[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [entityLinks, setEntityLinks] = useState<EntityLink[]>([]);
  const [entityTags, setEntityTags] = useState<EntityTag[]>([]);
  const [substances, setSubstances] = useState<Substance[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [sleepEntries, setSleepEntries] = useState<SleepEntry[]>([]);
  const [activities, setActivities] = useState<PhysicalActivity[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);

  const defaultRangeStart = useMemo(() => localDay(addDays(new Date(), -14)), []);
  const defaultRangeEnd = useMemo(() => localDay(), []);
  const [rangeMode, setRangeMode] = useState<RangeMode>(15);
  const [customRangeStart, setCustomRangeStart] = useState(defaultRangeStart);
  const [customRangeEnd, setCustomRangeEnd] = useState(defaultRangeEnd);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const [
        nextNotes,
        nextLists,
        nextPeople,
        nextPersonCategories,
        nextProjects,
        nextReminders,
        nextRoutines,
        nextBooks,
        nextIdeas,
        nextDoses,
        nextEntityLinks,
        nextEntityTags,
        nextSubstances,
        nextGames,
        nextCountries,
        nextConcerts,
        nextSleepEntries,
        nextActivities,
        nextJournalEntries,
        nextTreatments,
      ] = await Promise.all([
        listNotes(db),
        listChecklists(db),
        listPeople(db),
        listPersonCategories(db),
        listProjects(db),
        listReminders(db),
        listRoutines(db),
        listBooks(db),
        listIdeas(db),
        listDoses(db),
        listEntityLinks(db),
        listEntityTags(db),
        listSubstances(db),
        listGames(db),
        listCountries(db),
        listConcerts(db),
        listSleepEntries(db),
        listPhysicalActivities(db),
        listJournalEntries(db),
        listTreatments(db),
      ]);

      if (!active) {
        return;
      }

      setNotes(nextNotes);
      setLists(nextLists);
      setPeople(nextPeople);
      setPersonCategories(nextPersonCategories);
      setProjects(nextProjects);
      setReminders(nextReminders);
      setRoutines(nextRoutines);
      setBooks(nextBooks);
      setIdeas(nextIdeas);
      setDoses(nextDoses);
      setEntityLinks(nextEntityLinks);
      setEntityTags(nextEntityTags);
      setSubstances(nextSubstances);
      setGames(nextGames);
      setCountries(nextCountries);
      setConcerts(nextConcerts);
      setSleepEntries(nextSleepEntries);
      setActivities(nextActivities);
      setJournalEntries(nextJournalEntries);
      setTreatments(nextTreatments);
    })();

    return () => {
      active = false;
    };
  }, [db]);

  useFocusEffect(refresh);

  const metrics = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now).getTime();
    const monthEnd = endOfMonth(now).getTime();
    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).getTime();
    const thirtyDaysFromNow = now.getTime() + 30 * 24 * 60 * 60 * 1000;

    const notesThisMonth = notes.filter((note) => withinRange(note.updatedAt, monthStart, monthEnd)).length;
    const pendingListItems = lists.reduce((sum, list) => sum + Math.max(0, list.itemCount - list.doneCount), 0);
    const completedListItems = lists.reduce((sum, list) => sum + list.doneCount, 0);
    const scheduledReminders = reminders.filter((reminder) => reminder.status === 'scheduled').length;
    const remindersThisMonth = reminders.filter((reminder) => withinRange(reminder.scheduledFor, monthStart, monthEnd)).length;
    const projectsWithDeadlinesThisYear = projects.filter(
      (project) => project.deadline && withinRange(`${project.deadline}T12:00:00`, yearStart, yearEnd),
    ).length;
    const birthdaysSoon = people.filter((person) => {
      const nextBirthdayTime = getNextBirthdayTime(person.birthday);
      return nextBirthdayTime !== null && nextBirthdayTime <= thirtyDaysFromNow;
    }).length;
    const enabledRoutines = routines.filter((routine) => routine.enabled).length;
    const booksRead = books.filter((book) => book.status === 'lu').length;
    const booksThisYear = books.filter((book) => book.status === 'lu' && book.date && withinRange(`${book.date}T12:00:00`, yearStart, yearEnd)).length;
    const ideasCount = ideas.length;
    const pinnedIdeas = ideas.filter((idea) => idea.pinned).length;
    const dosesThisMonth = doses.filter((dose) => withinRange(dose.datetime, monthStart, monthEnd)).length;
    const spendThisMonth = doses
      .filter((dose) => withinRange(dose.datetime, monthStart, monthEnd))
      .reduce((sum, dose) => sum + (Number.parseFloat(dose.cost.replace(',', '.')) || 0), 0);
    const substancesCount = substances.length;
    const gamesCount = games.length;
    const countriesCount = countries.length;
    const concertsCount = concerts.length;
    const globalTagsCount = new Set(entityTags.map((tag) => tag.tag)).size;

    return {
      notesThisMonth,
      pendingListItems,
      completedListItems,
      scheduledReminders,
      remindersThisMonth,
      projectsWithDeadlinesThisYear,
      birthdaysSoon,
      enabledRoutines,
      booksRead,
      booksThisYear,
      ideasCount,
      pinnedIdeas,
      dosesThisMonth,
      spendThisMonth,
      substancesCount,
      gamesCount,
      countriesCount,
      concertsCount,
      entityLinksCount: entityLinks.length,
      globalTagsCount,
    };
  }, [books, concerts, countries, doses, entityLinks, entityTags, games, ideas, lists, notes, people, projects, reminders, routines, substances]);

  const projectBars = useMemo(
    () =>
      projectStatuses.map((status) => ({
        ...status,
        value: projects.filter((project) => project.status === status.id).length,
      })),
    [projects],
  );

  const projectBarMax = Math.max(1, ...projectBars.map((entry) => entry.value));

  const peopleBars = useMemo(
    () =>
      personCategories
        .map((category) => ({
          ...category,
          value: people.filter((person) => person.category === category.id).length,
        }))
        .filter((entry) => entry.value > 0),
    [people, personCategories],
  );

  const peopleBarMax = Math.max(1, ...peopleBars.map((entry) => entry.value));

  const listBars = useMemo(
    () =>
      [...lists]
        .sort((left, right) => Math.max(0, right.itemCount - right.doneCount) - Math.max(0, left.itemCount - left.doneCount))
        .slice(0, 5)
        .map((list) => ({
          id: list.id,
          label: list.name,
          value: Math.max(0, list.itemCount - list.doneCount),
        })),
    [lists],
  );

  const listBarMax = Math.max(1, ...listBars.map((entry) => entry.value));
  const bookBars = useMemo(
    () =>
      bookStatuses.map((status) => ({
        ...status,
        value: books.filter((book) => book.status === status.id).length,
      })),
    [books],
  );
  const bookBarMax = Math.max(1, ...bookBars.map((entry) => entry.value));
  const ideaBars = useMemo(
    () =>
      ideaStatusOptions.map((status) => ({
        ...status,
        value: ideas.filter((idea) => idea.status === status.id).length,
      })),
    [ideas],
  );
  const ideaBarMax = Math.max(1, ...ideaBars.map((entry) => entry.value));
  const consoBars = useMemo(
    () =>
      substanceCategoryOptions
        .map((category) => ({
          ...category,
          value: doses.filter((dose) => {
            const substanceCategory = substances.find((substance) => substance.name.toLowerCase() === dose.substance.toLowerCase())?.category ?? 'autre';
            return substanceCategory === category.id;
          }).length,
        }))
        .filter((entry) => entry.value > 0),
    [doses, substances],
  );
  const consoBarMax = Math.max(1, ...consoBars.map((entry) => entry.value));
  const healthRange = useMemo(() => {
    if (rangeMode === 'custom') {
      const days = buildDaysBetween(customRangeStart, customRangeEnd);
      const first = days[0]?.key ?? customRangeStart;
      const last = days[days.length - 1]?.key ?? customRangeEnd;

      return {
        days,
        title: 'plage personnalisée',
        detail: `du ${formatShortDay(first)} au ${formatShortDay(last)}`,
      };
    }

    return {
      days: buildRecentDays(rangeMode),
      title: `${rangeMode} derniers jours`,
      detail: `sur ${rangeMode} j`,
    };
  }, [customRangeEnd, customRangeStart, rangeMode]);

  const recentDays = healthRange.days;
  const healthTrends = useMemo(() => {
    const moodByDay = new Map(journalEntries.map((entry) => [entry.date, entry.mood]));
    const sleepByDay = new Map<string, number[]>();
    const activityByDay = new Map<string, number>();

    sleepEntries.forEach((entry) => {
      const values = sleepByDay.get(entry.date) ?? [];
      values.push(entry.quality);
      sleepByDay.set(entry.date, values);
    });

    activities.forEach((entry) => {
      activityByDay.set(entry.date, (activityByDay.get(entry.date) ?? 0) + entry.durationMinutes);
    });

    const moodPoints = recentDays.map((day) => ({ ...day, value: moodByDay.get(day.key) ?? 0 }));
    const sleepPoints = recentDays.map((day) => ({ ...day, value: Math.round(average(sleepByDay.get(day.key) ?? [])) }));
    const activityPoints = recentDays.map((day) => ({ ...day, value: activityByDay.get(day.key) ?? 0 }));
    const treatmentPoints = recentDays.map((day) => ({
      ...day,
      value: treatments.length
        ? Math.round((treatments.filter((treatment) => treatment.takenDays.includes(day.key)).length / treatments.length) * 100)
        : 0,
    }));

    const moodAverage = average(moodPoints.filter((point) => point.value > 0).map((point) => point.value));
    const sleepAverage = average(sleepPoints.filter((point) => point.value > 0).map((point) => point.value));
    const activityTotal = activityPoints.reduce((sum, point) => sum + point.value, 0);
    const treatmentAverage = average(treatmentPoints.filter((point) => point.value > 0).map((point) => point.value));

    return [
      {
        id: 'mood',
        title: 'Humeur',
        value: moodAverage ? `${moodAverage.toFixed(1)}/5` : '0/5',
        detail: `${journalEntries.filter((entry) => recentDays.some((day) => day.key === entry.date)).length} entrée(s), ${healthRange.detail}`,
        points: moodPoints,
        color: moodAverage ? getInterpolatedMoodColor(moodAverage) : colors.accent,
      },
      {
        id: 'sleep',
        title: 'Sommeil',
        value: sleepAverage ? `${sleepAverage.toFixed(1)}/5` : '0/5',
        detail: `${sleepEntries.filter((entry) => recentDays.some((day) => day.key === entry.date)).length} nuit(s), ${healthRange.detail}`,
        points: sleepPoints,
        color: sleepAverage ? getInterpolatedMoodColor(sleepAverage) : colors.sun,
      },
      {
        id: 'activity',
        title: 'Activité',
        value: `${activityTotal} min`,
        detail: `Minutes cumulées, ${healthRange.detail}`,
        points: activityPoints,
        color: colors.success,
      },
      {
        id: 'treatment',
        title: 'Traitement',
        value: treatments.length ? `${Math.round(treatmentAverage)}%` : '0%',
        detail: `Observance moyenne, ${healthRange.detail}`,
        points: treatmentPoints,
        color: colors.primary,
      },
    ];
  }, [activities, colors.accent, colors.primary, colors.success, colors.sun, healthRange.detail, journalEntries, recentDays, sleepEntries, treatments]);
  const hasHealthTrendData = sleepEntries.length > 0 || activities.length > 0 || journalEntries.length > 0 || treatments.length > 0;
  
  const crossInsights = useMemo(() => {
    if (!hasHealthTrendData || recentDays.length < 3) return null;

    const activeDays = new Set(activities.map((a) => a.date));
    const goodSleepDays = new Set(sleepEntries.filter((s) => s.quality >= 4).map((s) => s.date));
    const badSleepDays = new Set(sleepEntries.filter((s) => s.quality <= 2).map((s) => s.date));

    const moodWithActivity: number[] = [];
    const moodWithoutActivity: number[] = [];
    const moodGoodSleep: number[] = [];
    const moodBadSleep: number[] = [];

    recentDays.forEach((day) => {
      const entry = journalEntries.find((j) => j.date === day.key);
      const mood = entry ? entry.mood : null;

      if (mood !== null) {
        if (activeDays.has(day.key)) moodWithActivity.push(mood);
        else moodWithoutActivity.push(mood);

        if (goodSleepDays.has(day.key)) moodGoodSleep.push(mood);
        else if (badSleepDays.has(day.key)) moodBadSleep.push(mood);
      }
    });

    const insights = [];

    if (moodWithActivity.length >= 2 && moodWithoutActivity.length >= 2) {
      const avgWith = average(moodWithActivity);
      const avgWithout = average(moodWithoutActivity);
      const delta = avgWith - avgWithout;
      insights.push({
        label: 'Humeur (avec vs sans sport)',
        value: `${avgWith.toFixed(1)} vs ${avgWithout.toFixed(1)}`,
        delta,
        color: colors.success,
      });
    }

    if (moodGoodSleep.length >= 2 && moodBadSleep.length >= 2) {
      const avgGood = average(moodGoodSleep);
      const avgBad = average(moodBadSleep);
      const delta = avgGood - avgBad;
      insights.push({
        label: 'Humeur (bon vs mauvais sommeil)',
        value: `${avgGood.toFixed(1)} vs ${avgBad.toFixed(1)}`,
        delta,
        color: colors.sun,
      });
    }

    const sleepWithActivity: number[] = [];
    const sleepWithoutActivity: number[] = [];
    recentDays.forEach((day) => {
      const nights = sleepEntries.filter((s) => s.date === day.key).map((s) => s.quality);
      if (!nights.length) {
        return;
      }
      const quality = average(nights);
      if (activeDays.has(day.key)) sleepWithActivity.push(quality);
      else sleepWithoutActivity.push(quality);
    });

    if (sleepWithActivity.length >= 2 && sleepWithoutActivity.length >= 2) {
      const avgWith = average(sleepWithActivity);
      const avgWithout = average(sleepWithoutActivity);
      insights.push({
        label: 'Sommeil (soir de sport vs sans)',
        value: `${avgWith.toFixed(1)} vs ${avgWithout.toFixed(1)}`,
        delta: avgWith - avgWithout,
        color: colors.success,
      });
    }

    const moodAfterGoodNight: number[] = [];
    const moodAfterBadNight: number[] = [];
    recentDays.forEach((day) => {
      const entry = journalEntries.find((j) => j.date === day.key);
      if (!entry) {
        return;
      }
      const previousDate = parseDay(day.key);
      if (!previousDate) {
        return;
      }
      const previousDay = localDay(addDays(previousDate, -1));
      if (goodSleepDays.has(previousDay)) moodAfterGoodNight.push(entry.mood);
      else if (badSleepDays.has(previousDay)) moodAfterBadNight.push(entry.mood);
    });

    if (moodAfterGoodNight.length >= 2 && moodAfterBadNight.length >= 2) {
      const avgGood = average(moodAfterGoodNight);
      const avgBad = average(moodAfterBadNight);
      insights.push({
        label: 'Humeur du lendemain (selon la nuit)',
        value: `${avgGood.toFixed(1)} vs ${avgBad.toFixed(1)}`,
        delta: avgGood - avgBad,
        color: colors.accent,
      });
    }

    return insights.length > 0 ? insights : null;
  }, [activities, sleepEntries, journalEntries, recentDays, hasHealthTrendData, colors]);

  const hasData = notes.length || lists.length || people.length || projects.length || reminders.length || routines.length || books.length || ideas.length || doses.length || substances.length || games.length || countries.length || concerts.length || entityLinks.length || entityTags.length || hasHealthTrendData;

  const modalData = useMemo(() => {
    if (!selectedMetric) return null;

    const buildItems = (): { title: string; subtitle?: string; items: DetailItem[] } => {
      switch (selectedMetric) {
        case 'notes': {
          const distribution = getMonthlyDistribution(notes);
          return {
            title: 'Activité Notes',
            subtitle: 'Nombre de notes créées ou modifiées par mois',
            items: distribution.map((d) => ({
              label: d.label,
              value: d.value,
              max: Math.max(1, ...distribution.map((x) => x.value)),
              color: colors.accent,
            })),
          };
        }
        case 'lists': {
          const bars = lists
            .map((list) => ({ label: list.name, value: Math.max(0, list.itemCount - list.doneCount) }))
            .filter((b) => b.value > 0)
            .sort((a, b) => b.value - a.value);
          return {
            title: 'Éléments restants',
            subtitle: 'Par liste (top 15)',
            items: bars.slice(0, 15).map((b) => ({
              label: b.label,
              value: b.value,
              max: Math.max(1, ...bars.map((x) => x.value)),
              color: colors.accent,
            })),
          };
        }
        case 'reminders': {
          const sortedReminders = [...reminders.filter((r) => r.status === 'scheduled')].sort(
            (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
          );
          return {
            title: 'Rappels planifiés',
            subtitle: 'Les plus proches à venir',
            items: sortedReminders.slice(0, 15).map((r) => ({
              label: r.title,
              value: 1,
              max: 1,
              color: colors.accent,
            })),
          };
        }
        case 'people': {
          const sortedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name));
          return {
            title: 'Cercle social',
            subtitle: 'Noms et catégories (par ordre alpha)',
            items: sortedPeople.map((p) => {
              const mainCat = personCategories.find((c) => c.id === p.category)?.label || p.category;
              const subCats = p.secondaryCategories
                .map((sc) => personCategories.find((c) => c.id === sc)?.label || sc)
                .join(', ');
              return {
                label: `${p.name} (${mainCat}${subCats ? ` - ${subCats}` : ''})`,
                value: 1,
                max: 1,
                color: colors.accent,
              };
            }),
          };
        }
        case 'ideas': {
          return {
            title: 'Pipeline Idées',
            subtitle: 'Répartition par statut',
            items: ideaBars.map((b) => ({ ...b, max: ideaBarMax })),
          };
        }
        case 'conso': {
          const now = new Date();
          const monthStart = startOfMonth(now).getTime();
          const monthEnd = endOfMonth(now).getTime();
          const monthDoses = doses.filter((dose) => withinRange(dose.datetime, monthStart, monthEnd));

          const counts = monthDoses.reduce((acc, d) => {
            acc[d.substance] = (acc[d.substance] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const bars = Object.entries(counts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
          return {
            title: 'Prises ce mois',
            subtitle: `Total: ${monthDoses.length} prise(s) en ${new Date().toLocaleDateString('fr-FR', { month: 'long' })}`,
            items: bars.map((b) => ({
              label: b.label,
              value: b.value,
              max: Math.max(1, ...bars.map((x) => x.value)),
              color: colors.accent,
            })),
          };
        }
        case 'games': {
          const sortedGames = [...games].sort((a, b) => a.name.localeCompare(b.name));
          return {
            title: 'Collection Jeux',
            subtitle: 'Liste alphabétique complète',
            items: sortedGames.map((g) => ({
              label: `${g.name} (${g.platform})`,
              value: 1,
              max: 1,
              color: colors.accent,
            })),
          };
        }
        case 'countries': {
          const regionLabels: Record<string, string> = {
            europe: 'Europe',
            ameriques: 'Amériques',
            asie: 'Asie',
            afrique: 'Afrique',
            oceanie: 'Océanie',
            autre: 'Autre',
          };
          const sortedCountries = [...countries].sort((a, b) => a.name.localeCompare(b.name));
          return {
            title: 'Voyages',
            subtitle: 'Liste des pays visités par région',
            items: sortedCountries.map((c) => ({
              label: `${c.name} (${regionLabels[c.region] || c.region})`,
              value: 1,
              max: 1,
              color: colors.accent,
            })),
          };
        }
        case 'links': {
          const distribution = getMonthlyDistribution(entityLinks);
          return {
            title: 'Liens transversaux',
            subtitle: 'Création de connexions par mois',
            items: distribution.map((d) => ({
              label: d.label,
              value: d.value,
              max: Math.max(1, ...distribution.map((x) => x.value)),
              color: colors.accent,
            })),
          };
        }
        case 'tags': {
          const counts = entityTags.reduce((acc, t) => {
            acc[t.tag] = (acc[t.tag] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          const bars = Object.entries(counts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
          return {
            title: 'Écosphère Tags',
            subtitle: 'Les tags les plus utilisés (top 15)',
            items: bars.slice(0, 15).map((b) => ({
              label: b.label,
              value: b.value,
              max: Math.max(1, ...bars.map((x) => x.value)),
              color: colors.accent,
            })),
          };
        }
        case 'mood': {
          const counts = journalEntries.filter((e) => e.mood > 0).reduce((acc, e) => {
            acc[e.mood] = (acc[e.mood] || 0) + 1;
            return acc;
          }, {} as Record<number, number>);
          const bars = [1, 2, 3, 4, 5].map((m) => ({
            label: `${m}/5`,
            value: counts[m] || 0,
            color: getMoodColor(m),
          }));
          return {
            title: 'Distribution Humeur',
            subtitle: 'Fréquence des scores sur la période',
            items: bars.map((b) => ({ ...b, max: Math.max(1, ...bars.map((x) => x.value)) })),
          };
        }
        case 'sleep': {
          const counts = sleepEntries.filter((e) => e.quality > 0).reduce((acc, e) => {
            acc[e.quality] = (acc[e.quality] || 0) + 1;
            return acc;
          }, {} as Record<number, number>);
          const bars = [1, 2, 3, 4, 5].map((m) => ({
            label: `${m}/5`,
            value: counts[m] || 0,
            color: getMoodColor(m),
          }));
          return {
            title: 'Qualité Sommeil',
            subtitle: 'Distribution des évaluations de nuits',
            items: bars.map((b) => ({ ...b, max: Math.max(1, ...bars.map((x) => x.value)) })),
          };
        }
        case 'activity': {
          const counts = activities.reduce((acc, e) => {
            acc[e.activityType] = (acc[e.activityType] || 0) + e.durationMinutes;
            return acc;
          }, {} as Record<string, number>);
          const bars = Object.entries(counts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
          return {
            title: 'Activité physique',
            subtitle: 'Minutes cumulées par type',
            items: bars.map((b) => ({
              label: b.label,
              value: b.value,
              max: Math.max(1, ...bars.map((x) => x.value)),
              color: colors.success,
              suffix: ' min',
            })),
          };
        }
        case 'treatment': {
          const bars = treatments.map((t) => ({
            label: t.name,
            value: Math.round((t.takenDays.filter((day) => recentDays.some((d) => d.key === day)).length / Math.max(1, recentDays.length)) * 100),
          }));
          return {
            title: 'Observance Traitements',
            subtitle: `Taux de prise sur les ${recentDays.length} derniers jours`,
            items: bars.map((b) => ({
              label: b.label,
              value: b.value,
              max: 100,
              color: colors.primary,
              suffix: '%',
            })),
          };
        }
        default:
          return { title: 'Statistiques', items: [] };
      }
    };

    return buildItems();
  }, [
    activities,
    colors.accent,
    colors.primary,
    colors.success,
    countries,
    doses,
    entityLinks,
    entityTags,
    games,
    ideaBars,
    ideaBarMax,
    ideas,
    journalEntries,
    lists,
    notes,
    people,
    recentDays,
    reminders,
    selectedMetric,
    sleepEntries,
    treatments,
  ]);

  return (
    <AppShell kicker="Aperçu chiffré" title="Statistiques">
      <SectionTitle
        eyebrow="Synthèse"
        title="Modules reliés"
        subtitle="Les données locales sont regroupées pour donner une vue d'ensemble claire et actionnable."
      />

      {hasData ? (
        <>
          <View style={styles.metricsGrid}>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('notes')}>
              <Text style={styles.metricValue}>{metrics.notesThisMonth}</Text>
              <Text style={styles.metricLabel}>notes ce mois-ci</Text>
            </Pressable>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('lists')}>
              <Text style={styles.metricValue}>{metrics.pendingListItems}</Text>
              <Text style={styles.metricLabel}>éléments restants</Text>
            </Pressable>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('reminders')}>
              <Text style={styles.metricValue}>{metrics.scheduledReminders}</Text>
              <Text style={styles.metricLabel}>rappels planifiés</Text>
            </Pressable>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('people')}>
              <Text style={styles.metricValue}>{people.length}</Text>
              <Text style={styles.metricLabel}>contacts dans le cercle</Text>
            </Pressable>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('ideas')}>
              <Text style={styles.metricValue}>{metrics.ideasCount}</Text>
              <Text style={styles.metricLabel}>idées en pipeline</Text>
            </Pressable>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('conso')}>
              <Text style={styles.metricValue}>{metrics.dosesThisMonth}</Text>
              <Text style={styles.metricLabel}>prises ce mois</Text>
            </Pressable>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('games')}>
              <Text style={styles.metricValue}>{metrics.gamesCount}</Text>
              <Text style={styles.metricLabel}>jeux en collection</Text>
            </Pressable>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('countries')}>
              <Text style={styles.metricValue}>{metrics.countriesCount}</Text>
              <Text style={styles.metricLabel}>pays visités</Text>
            </Pressable>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('links')}>
              <Text style={styles.metricValue}>{metrics.entityLinksCount}</Text>
              <Text style={styles.metricLabel}>liens transversaux</Text>
            </Pressable>
            <Pressable style={styles.metricTile} onPress={() => setSelectedMetric('tags')}>
              <Text style={styles.metricValue}>{metrics.globalTagsCount}</Text>
              <Text style={styles.metricLabel}>tags globaux</Text>
            </Pressable>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Rappels ce mois-ci</Text>
              <Text style={styles.summaryValue}>{metrics.remindersThisMonth}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Anniversaires sous 30 jours</Text>
              <Text style={styles.summaryValue}>{metrics.birthdaysSoon}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Échéances projet cette année</Text>
              <Text style={styles.summaryValue}>{metrics.projectsWithDeadlinesThisYear}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Routines actives</Text>
              <Text style={styles.summaryValue}>{metrics.enabledRoutines}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Éléments listés terminés</Text>
              <Text style={styles.summaryValue}>{metrics.completedListItems}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Livres lus</Text>
              <Text style={styles.summaryValue}>{metrics.booksRead}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Livres lus cette année</Text>
              <Text style={styles.summaryValue}>{metrics.booksThisYear}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Idées épinglées</Text>
              <Text style={styles.summaryValue}>{metrics.pinnedIdeas}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Catalogue substances</Text>
              <Text style={styles.summaryValue}>{metrics.substancesCount}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Dépense conso ce mois</Text>
              <Text style={styles.summaryValue}>{metrics.spendThisMonth.toFixed(metrics.spendThisMonth % 1 ? 2 : 0)} €</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Concerts archivés</Text>
              <Text style={styles.summaryValue}>{metrics.concertsCount}</Text>
            </View>
          </View>

          <SectionTitle eyebrow="Santé" title={`Tendances ${healthRange.title}`} subtitle="Sommeil, humeur, activité et traitement sont lus depuis les modules locaux." />
          <View style={styles.rangePanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeOptions}>
              {RANGE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: rangeMode === option.value }}
                  onPress={() => setRangeMode(option.value)}
                  style={[styles.rangeChip, rangeMode === option.value && styles.rangeChipActive]}
                >
                  <Text style={[styles.rangeLabel, rangeMode === option.value && styles.rangeLabelActive]}>{option.label}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: rangeMode === 'custom' }}
                onPress={() => setRangeMode('custom')}
                style={[styles.rangeChip, rangeMode === 'custom' && styles.rangeChipActive]}
              >
                <Text style={[styles.rangeLabel, rangeMode === 'custom' && styles.rangeLabelActive]}>Perso</Text>
              </Pressable>
            </ScrollView>
            {rangeMode === 'custom' ? (
              <View style={styles.customRangeFields}>
                <DateField label="Du" value={customRangeStart} onChange={setCustomRangeStart} />
                <DateField label="Au" value={customRangeEnd} onChange={setCustomRangeEnd} />
              </View>
            ) : null}
          </View>
          {hasHealthTrendData ? (
            <>
              <View style={styles.trendGrid}>
                {healthTrends.map((trend) => (
                  <TrendCard
                    key={trend.id}
                    id={trend.id}
                    color={trend.color}
                    detail={trend.detail}
                    points={trend.points}
                    title={trend.title}
                    value={trend.value}
                    onPress={() => setSelectedMetric(trend.id)}
                  />
                ))}
              </View>
              {crossInsights ? (
                <>
                  <SectionTitle eyebrow="Corrélations" title="Insights croisés" subtitle="L'impact de ton activité ou de ton sommeil sur ton humeur." />
                  <View style={styles.card}>
                    {crossInsights.map((insight, index) => (
                      <View key={index} style={styles.summaryRow}>
                        <View style={{ flex: 1, paddingRight: spacing.md }}>
                          <Text style={styles.summaryLabel}>{insight.label}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: insight.delta >= 0 ? insight.color : colors.warning, marginRight: 6 }} />
                            <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted }}>
                              {insight.delta > 0 ? '+' : ''}{insight.delta.toFixed(1)} pt(s)
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.summaryValue, { color: insight.color }]}>{insight.value}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.emptyInline}>Aucune tendance santé disponible pour le moment.</Text>
            </View>
          )}

          <SectionTitle eyebrow="Idées" title="Pipeline par statut" />
          <View style={styles.card}>
            {ideaBars.map((entry) => (
              <StatBar key={entry.id} color={entry.color} label={entry.label} max={ideaBarMax} value={entry.value} />
            ))}
          </View>

          <SectionTitle eyebrow="Conso" title="Prises par catégorie" subtitle="Le classement se base sur la catégorie de la substance rattachée à chaque prise." />
          {consoBars.length ? (
            <View style={styles.card}>
              {consoBars.map((entry) => (
                <StatBar key={entry.id} color={entry.color} label={entry.label} max={consoBarMax} value={entry.value} />
              ))}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.emptyInline}>Aucune prise catégorisée pour le moment.</Text>
            </View>
          )}

          <SectionTitle eyebrow="Pro" title="Projets par statut" />
          <View style={styles.card}>
            {projectBars.map((entry) => (
              <StatBar key={entry.id} color={entry.color} label={entry.label} max={projectBarMax} value={entry.value} />
            ))}
          </View>

          <SectionTitle eyebrow="Cercle" title="Contacts par categorie" />
          {peopleBars.length ? (
            <View style={styles.card}>
              {peopleBars.map((entry) => (
                <StatBar key={entry.id} color={entry.color} label={entry.label} max={peopleBarMax} value={entry.value} />
              ))}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.emptyInline}>Aucune categorie peuplee pour le moment.</Text>
            </View>
          )}

          <SectionTitle eyebrow="Listes" title="Charges en cours" subtitle="Les listes les plus ouvertes remontent en premier, pour garder la vision terrain du mobile." />
          {listBars.length ? (
            <View style={styles.card}>
              {listBars.map((entry) => (
                <StatBar key={entry.id} color={colors.accent} label={entry.label} max={listBarMax} value={entry.value} />
              ))}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.emptyInline}>Aucune liste ouverte pour le moment.</Text>
            </View>
          )}

          <SectionTitle eyebrow="Livres" title="Lectures par statut" />
          <View style={styles.card}>
            {bookBars.map((entry) => (
              <StatBar key={entry.id} color={entry.color} label={entry.label} max={bookBarMax} value={entry.value} />
            ))}
          </View>

          {selectedMetric && modalData ? (
            <DetailModal
              items={modalData.items}
              subtitle={modalData.subtitle}
              title={modalData.title}
              visible={!!selectedMetric}
              onClose={() => setSelectedMetric(null)}
            />
          ) : null}
        </>
      ) : (
        <EmptyState
          title="Pas encore de chiffres"
          message="Ajoute des notes, idees, prises, collections ou rappels pour que cet ecran statistiques commence a raconter quelque chose."
        />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  metricsGrid: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricTile: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    flexBasis: 0,
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 136,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  metricValue: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 30,
  },
  metricLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: colors.muted,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingRight: spacing.md,
  },
  summaryValue: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  trendGrid: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  trendCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    flexBasis: 0,
    flexGrow: 1,
    gap: spacing.md,
    minWidth: 220,
    padding: spacing.lg,
  },
  trendHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  trendTitleWrap: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  trendTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: colors.backdrop,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.xl,
    gap: spacing.md,
    maxHeight: '80%',
    padding: spacing.xl,
  },
  modalTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalCloseButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  modalCloseButtonText: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  trendDetail: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  trendValue: {
    color: colors.accent,
    flexShrink: 0,
    fontFamily: fonts.display,
    fontSize: 22,
  },
  trendBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
    height: 64,
  },
  trendBarSlot: {
    alignItems: 'center',
    flex: 1,
    height: 64,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  trendBar: {
    borderRadius: radii.pill,
    maxWidth: 12,
    width: '100%',
  },
  barBlock: {
    gap: spacing.xs,
  },
  barHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    paddingRight: spacing.md,
  },
  barValue: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  barTrack: {
    backgroundColor: colors.line,
    borderRadius: radii.pill,
    height: 10,
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: radii.pill,
    height: 10,
    minWidth: 0,
  },
  emptyInline: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  rangePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  rangeOptions: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  rangeChip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rangeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rangeLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  rangeLabelActive: {
    color: colors.white,
  },
  customRangeFields: {
    gap: spacing.md,
  },
});