import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppShell } from '../src/components/app-shell';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import { listConcerts, listIdeas } from '../src/db/module-repositories';
import {
  listBooks,
  listJournalEntries,
  listObjectives,
  listPeople,
  listProjects,
  listReminders,
  listRoutines,
  listTreatments,
  listTimelineEntries,
  markReminderDone,
  toggleTreatmentDay,
} from '../src/db/repositories';
import type { Book, Concert, Idea, JournalEntry, Objective, Person, Project, Reminder, ReminderCategory, Routine, TimelineEntry, Treatment } from '../src/db/types';
import { useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type AgendaEvent = {
  id: string;
  origin: 'manual' | 'birthday' | 'project' | 'objective' | 'idea' | 'timeline' | 'concert' | 'routine' | 'treatment' | 'journal' | 'book';
  category?: ReminderCategory;
  title: string;
  datetime: string;
  subtitle: string;
  href: Href;
  treatmentId?: string;
};

const weekDays = [
  { id: 'mon', label: 'L' },
  { id: 'tue', label: 'M' },
  { id: 'wed', label: 'M' },
  { id: 'thu', label: 'J' },
  { id: 'fri', label: 'V' },
  { id: 'sat', label: 'S' },
  { id: 'sun', label: 'D' },
];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function getMonthLabel(date: Date) {
  return startOfMonth(date).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

function getDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getNextBirthdayIso(birthday: string) {
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

  const age = year && year > 1900 ? next.getFullYear() - year : null;

  return {
    date: next.toISOString(),
    age,
  };
}

function formatEventTime(value: string) {
  return new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatEventDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

function dateFromDay(value: string, hour = 12, minute = 0) {
  return new Date(`${value}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
}

function parseRoutineTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return {
    hour: Number.isFinite(hour) ? hour : 9,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function AgendaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [showAddModal, setShowAddModal] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [books, setBooks] = useState<Book[]>([]);

  const eventColors: Record<AgendaEvent['origin'], string> = useMemo(
    () => ({
      manual: colors.accent,
      birthday: '#ff7a59',
      project: '#ffb24a',
      objective: '#7f8cff',
      idea: '#bd70ff',
      timeline: '#20a4a2',
      concert: '#f05d8f',
      routine: '#7aa35a',
      treatment: '#d34f4f',
      journal: '#6f8fce',
      book: '#9b7b4f',
    }),
    [colors.accent],
  );

  const getEventColor = useCallback(
    (event: AgendaEvent) => {
      const customColors = preferences.agendaColors || {};

      // If it's a reminder (manual), check if there's a custom color for its category
      if (event.origin === 'manual' && event.category && customColors[event.category]) {
        return customColors[event.category];
      }

      // Check if there's a custom color for the origin
      if (customColors[event.origin]) {
        return customColors[event.origin];
      }

      return eventColors[event.origin];
    },
    [eventColors, preferences.agendaColors],
  );
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const [
        nextReminders,
        nextPeople,
        nextProjects,
        nextRoutines,
        nextObjectives,
        nextIdeas,
        nextTimelineEntries,
        nextConcerts,
        nextJournalEntries,
        nextTreatments,
        nextBooks,
      ] = await Promise.all([
        listReminders(db),
        listPeople(db),
        listProjects(db),
        listRoutines(db),
        listObjectives(db),
        listIdeas(db),
        listTimelineEntries(db),
        listConcerts(db),
        listJournalEntries(db),
        listTreatments(db),
        listBooks(db),
      ]);

      if (!active) {
        return;
      }

      setReminders(nextReminders);
      setPeople(nextPeople);
      setProjects(nextProjects);
      setRoutines(nextRoutines);
      setObjectives(nextObjectives);
      setIdeas(nextIdeas);
      setTimelineEntries(nextTimelineEntries);
      setConcerts(nextConcerts);
      setJournalEntries(nextJournalEntries);
      setTreatments(nextTreatments);
      setBooks(nextBooks);
    })();

    return () => {
      active = false;
    };
  }, [db]);

  useFocusEffect(refresh);

  const events = useMemo(() => {
    const reminderEvents: AgendaEvent[] = reminders
      .filter((reminder) => reminder.status === 'scheduled')
      .map((reminder) => ({
        id: reminder.id,
        origin: 'manual',
        category: reminder.category,
        title: reminder.title,
        datetime: reminder.scheduledFor,
        subtitle: `${formatEventTime(reminder.scheduledFor)}${reminder.repeatRule !== 'none' ? ' · récurrent' : ''}`,
        href: { pathname: '/rappels' as const, params: { reminderId: reminder.id } },
      }));

    const birthdayEvents: AgendaEvent[] = people.flatMap((person) => {
      const nextBirthday = getNextBirthdayIso(person.birthday);
      if (!nextBirthday) {
        return [];
      }

      return [
        {
          id: `bday-${person.id}`,
          origin: 'birthday',
          title: `Anniversaire de ${person.name}`,
          datetime: nextBirthday.date,
          subtitle: nextBirthday.age ? `${formatEventDate(nextBirthday.date)} · ${nextBirthday.age} ans` : formatEventDate(nextBirthday.date),
          href: { pathname: '/cercle' as const, params: { personId: person.id } },
        } satisfies AgendaEvent,
      ];
    });

    const projectEvents: AgendaEvent[] = projects.flatMap((project) => {
      if (!project.deadline) {
        return [];
      }

      return [
        {
          id: `project-${project.id}`,
          origin: 'project',
          title: project.name,
          datetime: new Date(`${project.deadline}T12:00:00`).toISOString(),
          subtitle: `${formatEventDate(new Date(`${project.deadline}T12:00:00`).toISOString())} · échéance projet`,
          href: { pathname: '/pro' as const, params: { projectId: project.id } },
        } satisfies AgendaEvent,
      ];
    });

    const objectiveEvents: AgendaEvent[] = objectives.flatMap((objective) => {
      if (!objective.deadline || objective.progress >= 100) {
        return [];
      }

      const datetime = dateFromDay(objective.deadline).toISOString();

      return [
        {
          id: `objective-${objective.id}`,
          origin: 'objective',
          title: objective.title,
          datetime,
          subtitle: `${formatEventDate(datetime)} · objectif ${objective.progress}%`,
          href: { pathname: '/objectifs' as const, params: { objectiveId: objective.id } },
        } satisfies AgendaEvent,
      ];
    });

    const ideaEvents: AgendaEvent[] = ideas.flatMap((idea) => {
      if (!idea.publishDate) {
        return [];
      }

      const datetime = dateFromDay(idea.publishDate).toISOString();

      return [
        {
          id: `idea-${idea.id}`,
          origin: 'idea',
          title: idea.text,
          datetime,
          subtitle: `${formatEventDate(datetime)} · idée planifiée`,
          href: { pathname: '/idees' as const, params: { ideaId: idea.id } },
        } satisfies AgendaEvent,
      ];
    });

    const timelineEvents: AgendaEvent[] = timelineEntries.map((entry) => {
      const datetime = dateFromDay(entry.date).toISOString();

      return {
        id: `timeline-${entry.id}`,
        origin: 'timeline',
        title: entry.title,
        datetime,
        subtitle: `${formatEventDate(datetime)} · frise`,
        href: '/frise' as const,
      } satisfies AgendaEvent;
    });

    const concertEvents: AgendaEvent[] = concerts.flatMap((concert) => {
      if (!concert.date) {
        return [];
      }

      const datetime = dateFromDay(concert.date).toISOString();

      return [
        {
          id: `concert-${concert.id}`,
          origin: 'concert',
          title: concert.name,
          datetime,
          subtitle: `${formatEventDate(datetime)}${concert.venue ? ` · ${concert.venue}` : ''}`,
          href: { pathname: '/concerts' as const, params: { concertId: concert.id } },
        } satisfies AgendaEvent,
      ];
    });

    const bookEvents: AgendaEvent[] = books.flatMap((book) => {
      if (!book.date || book.status === 'lu') {
        return [];
      }

      const datetime = dateFromDay(book.date).toISOString();

      return [
        {
          id: `book-${book.id}`,
          origin: 'book',
          title: book.name,
          datetime,
          subtitle: `${formatEventDate(datetime)} · lecture`,
          href: { pathname: '/livres' as const, params: { bookId: book.id } },
        } satisfies AgendaEvent,
      ];
    });

    const journalEvents: AgendaEvent[] = journalEntries.map((entry) => {
      const datetime = dateFromDay(entry.date).toISOString();

      return {
        id: `journal-${entry.date}`,
        origin: 'journal',
        title: entry.text || 'Journal',
        datetime,
        subtitle: `${formatEventDate(datetime)} · humeur ${entry.mood}/5`,
        href: '/journal' as const,
      } satisfies AgendaEvent;
    });

    const routineEvents: AgendaEvent[] = routines.filter((routine) => routine.enabled).flatMap((routine) => {
      const { hour, minute } = parseRoutineTime(routine.time);
      const firstDay = startOfMonth(visibleMonth);
      const dayCount = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();

      return Array.from({ length: dayCount }, (_, index) => {
        const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), index + 1, 12, 0, 0, 0);
        const dayKey = getDayKey(date);
        const datetime = dateFromDay(dayKey, hour, minute).toISOString();

        return {
          id: `routine-${routine.key}-${dayKey}`,
          origin: 'routine',
          title: routine.label,
          datetime,
          subtitle: `${formatEventTime(datetime)} · routine`,
          href: '/rappels' as const,
        } satisfies AgendaEvent;
      });
    });

    const treatmentEvents: AgendaEvent[] = preferences.showSensitiveContent
      ? treatments
          .filter((treatment) => treatment.name || treatment.dose)
          .map((treatment) => ({
            id: `treatment-${treatment.id}-${localDay()}`,
            origin: 'treatment',
            title: treatment.name || 'Traitement',
            datetime: dateFromDay(localDay(), 9, 0).toISOString(),
            subtitle: treatment.takenDays.includes(localDay()) ? 'Coché aujourd\'hui' : 'À cocher aujourd\'hui',
            href: '/traitement' as const,
            treatmentId: treatment.id,
          }) satisfies AgendaEvent)
      : [];

    return [
      ...reminderEvents,
      ...birthdayEvents,
      ...projectEvents,
      ...objectiveEvents,
      ...ideaEvents,
      ...timelineEvents,
      ...concertEvents,
      ...bookEvents,
      ...journalEvents,
      ...routineEvents,
      ...treatmentEvents,
    ].sort(
      (left, right) => new Date(left.datetime).getTime() - new Date(right.datetime).getTime(),
    );
  }, [books, concerts, ideas, journalEntries, objectives, people, preferences.showSensitiveContent, projects, reminders, routines, timelineEntries, treatments, visibleMonth]);

  const firstDay = startOfMonth(visibleMonth);
  const monthOffset = (firstDay.getDay() + 6) % 7;
  const dayCount = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();

    for (const event of events) {
      const key = getDayKey(new Date(event.datetime));
      const bucket = map.get(key) ?? [];
      bucket.push(event);
      map.set(key, bucket);
    }

    return map;
  }, [events]);

  const selectedEvents = selectedDayKey ? eventsByDay.get(selectedDayKey) ?? [] : [];

  const handleQuickEventAction = async (event: AgendaEvent) => {
    if (event.origin === 'manual') {
      await markReminderDone(db, event.id);
      setReminders(await listReminders(db));
      return;
    }

    if (event.origin === 'treatment' && event.treatmentId) {
      await toggleTreatmentDay(db, { treatmentId: event.treatmentId, day: localDay() });
      setTreatments(await listTreatments(db));
    }
  };

  const calendarDays = Array.from({ length: dayCount }, (_, index) => {
    const dayNumber = index + 1;
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), dayNumber, 12, 0, 0, 0);
    const dayKey = getDayKey(date);
    const dayEvents = eventsByDay.get(dayKey) ?? [];
    const isToday = getDayKey(new Date()) === dayKey;
    const isSelected = selectedDayKey === dayKey;

    return {
      dayNumber,
      dayKey,
      dayEvents,
      isToday,
      isSelected,
    };
  });

  return (
    <AppShell 
      kicker="Calendrier" 
      title="Agenda"
      floating={
        <>
          {/* Action Modal */}
          <Modal
            animationType="fade"
            transparent
            visible={showAddModal}
            onRequestClose={() => setShowAddModal(false)}
          >
            <Pressable 
              style={styles.modalBackdrop} 
              onPress={() => setShowAddModal(false)}
            >
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Ajouter un élément</Text>
                
                <Pressable 
                  onPress={() => {
                    setShowAddModal(false);
                    router.push({ 
                      pathname: '/rappels', 
                      params: { add: 'true', date: selectedDayKey ?? undefined } 
                    });
                  }}
                  style={({ pressed }) => [styles.modalOption, pressed && styles.pressedSoft]}
                >
                  <View style={[styles.modalIconBox, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="notifications-outline" size={20} color={colors.accent} />
                  </View>
                  <View style={styles.modalOptionText}>
                    <Text style={styles.modalOptionTitle}>Rappel</Text>
                    <Text style={styles.modalOptionSubtitle}>Notifications et récurrences</Text>
                  </View>
                </Pressable>

                <Pressable 
                  onPress={() => {
                    setShowAddModal(false);
                    router.push({ 
                      pathname: '/objectifs', 
                      params: { add: 'true', date: selectedDayKey ?? undefined } 
                    });
                  }}
                  style={({ pressed }) => [styles.modalOption, pressed && styles.pressedSoft]}
                >
                  <View style={[styles.modalIconBox, { backgroundColor: '#7f8cff29' }]}>
                    <Ionicons name="flag-outline" size={20} color="#7f8cff" />
                  </View>
                  <View style={styles.modalOptionText}>
                    <Text style={styles.modalOptionTitle}>Objectif</Text>
                    <Text style={styles.modalOptionSubtitle}>Projet long terme et étapes</Text>
                  </View>
                </Pressable>

                <Pressable 
                  onPress={() => setShowAddModal(false)}
                  style={styles.modalCancel}
                >
                  <Text style={styles.modalCancelLabel}>Annuler</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>

          {/* Floating Action Button */}
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={({ pressed }) => [
              styles.fab,
              pressed && styles.pressedSoft
            ]}
          >
            <Ionicons name="add" size={24} color={colors.white} />
          </Pressable>
        </>
      }
    >
      <SectionTitle
        eyebrow="Universel"
        title="Mois en cours"
        subtitle="Rappels, routines, anniversaires, projets, objectifs, idées datées, frise et collections dans une même vue."
      />

      <View style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <Pressable
            onPress={() => {
              setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12));
              setSelectedDayKey(null);
            }}
            style={styles.navButton}
          >
            <Text style={styles.navButtonLabel}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{getMonthLabel(visibleMonth)}</Text>
          <Pressable
            onPress={() => {
              setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12));
              setSelectedDayKey(null);
            }}
            style={styles.navButton}
          >
            <Text style={styles.navButtonLabel}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {weekDays.map((day) => (
            <Text key={day.id} style={styles.weekLabel}>{day.label}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {Array.from({ length: monthOffset }).map((_, index) => (
            <View key={`empty-${index}`} style={styles.emptyCell} />
          ))}
          {calendarDays.map((day) => (
            <Pressable
              key={day.dayKey}
              onPress={() => setSelectedDayKey(day.dayKey)}
              style={[
                styles.dayCell,
                day.isToday && styles.dayCellToday,
                day.isSelected && styles.dayCellSelected,
              ]}
            >
              <Text style={[styles.dayLabel, day.isSelected && styles.dayLabelSelected]}>{day.dayNumber}</Text>
              <View style={styles.dotsRow}>
                {[...new Set(day.dayEvents.map((event) => getEventColor(event)))].slice(0, 3).map((color, idx) => (
                  <View key={idx} style={[styles.dot, { backgroundColor: color }]} />
                ))}
              </View>
            </Pressable>
          ))}
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={`filler-${index}`} style={styles.emptyCell} />
          ))}
        </View>
      </View>

      {selectedDayKey ? (
        <>
          <Text style={styles.sectionLabel}>Le {new Date(`${selectedDayKey}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</Text>
          {selectedEvents.length ? (
            <View style={styles.eventsCard}>
              {selectedEvents.map((event, index) => (
                <View
                  key={event.id}
                  style={[styles.eventRow, index > 0 && styles.eventRowBorder]}
                >
                  <View style={[styles.eventMarker, { backgroundColor: getEventColor(event) }]} />
                  <Pressable onPress={() => router.push(event.href)} style={({ pressed }) => [styles.eventMain, pressed && styles.pressedSoft]}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventMeta}>{event.subtitle}</Text>
                  </Pressable>
                  {event.origin === 'manual' || event.origin === 'treatment' ? (
                    <Pressable onPress={() => handleQuickEventAction(event)} style={({ pressed }) => [styles.eventActionButton, pressed && styles.pressedSoft]}>
                      <Text style={styles.eventActionLabel}>{event.origin === 'manual' ? 'Fait' : 'Cocher'}</Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.eventArrow}>›</Text>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState title="Rien ce jour-là" message="Sélectionne un autre jour pour voir les rappels, anniversaires ou échéances." />
          )}
        </>
      ) : (
        <Text style={styles.helperText}>Touche un jour pour voir le détail.</Text>
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedSoft: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  calendarCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  navButtonLabel: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
  },
  monthTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
    textTransform: 'capitalize',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    textAlign: 'center',
    width: '14.28%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  emptyCell: {
    height: 0,
    width: '13.2%',
  },
  dayCell: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: 'transparent',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 4,
    minHeight: 54,
    paddingVertical: spacing.sm,
    width: '13.2%',
  },
  dayCellToday: {
    borderColor: colors.accent,
  },
  dayCellSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  dayLabelSelected: {
    color: colors.white,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 3,
    minHeight: 6,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  sectionLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  helperText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    textAlign: 'center',
  },
  eventsCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  eventRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 62,
    minWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  eventRowBorder: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  eventMarker: {
    borderRadius: 7,
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  eventMain: {
    flex: 1,
    gap: 2,
    minHeight: 44,
    minWidth: 0,
    justifyContent: 'center',
  },
  eventTitle: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
  },
  eventMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  eventActionButton: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  eventActionLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  eventArrow: {
    color: colors.muted,
    flexShrink: 0,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  fab: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    bottom: spacing.xxl + 50,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    width: 48,
    zIndex: 100,
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
    padding: spacing.xl,
  },
  modalTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 20,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  modalOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  modalIconBox: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  modalOptionText: {
    flex: 1,
    gap: 2,
  },
  modalOptionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  modalOptionSubtitle: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  modalCancel: {
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
  },
  modalCancelLabel: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
  },
});