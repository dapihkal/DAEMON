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
import { useThemedStyles } from '../src/theme/use-themed-styles';

type AgendaEvent = {
  id: string;
  origin: 'manual' | 'birthday' | 'project' | 'objective' | 'idea' | 'timeline' | 'concert' | 'routine' | 'treatment' | 'journal' | 'book';
  category?: ReminderCategory;
  title: string;
  datetime: string;
  subtitle: string;
  href: Href;
  treatmentId?: string;
  dayKey?: string;
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

const originLabels: Record<AgendaEvent['origin'], string> = {
  manual: 'Rappels',
  birthday: 'Anniversaires',
  project: 'Projets',
  objective: 'Objectifs',
  idea: 'Idées',
  timeline: 'Frise',
  concert: 'Concerts',
  routine: 'Routines',
  treatment: 'Traitement',
  journal: 'Journal',
  book: 'Lectures',
};

function getBirthdayInMonth(birthday: string, monthStart: Date) {
  if (!birthday) {
    return null;
  }

  const [year, month, day] = birthday.split('-').map(Number);
  if (!month || !day || month - 1 !== monthStart.getMonth()) {
    return null;
  }

  const date = new Date(monthStart.getFullYear(), month - 1, day, 12, 0, 0, 0);
  if (date.getMonth() !== month - 1) {
    return null;
  }

  const age = year && year > 1900 ? date.getFullYear() - year : null;

  return { date: date.toISOString(), age };
}

function expandReminderInMonth(scheduledFor: string, repeatRule: string, monthStart: Date) {
  const base = new Date(scheduledFor);
  const dayCount = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const occurrences: string[] = [];

  for (let index = 0; index < dayCount; index += 1) {
    const candidate = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      index + 1,
      base.getHours(),
      base.getMinutes(),
      0,
      0,
    );

    if (candidate.getTime() < base.getTime()) {
      continue;
    }

    const matches =
      (repeatRule === 'daily') ||
      (repeatRule === 'weekly' && candidate.getDay() === base.getDay()) ||
      (repeatRule === 'monthly' && candidate.getDate() === base.getDate()) ||
      (repeatRule === 'yearly' && candidate.getDate() === base.getDate() && candidate.getMonth() === base.getMonth());

    if (matches) {
      occurrences.push(candidate.toISOString());
    }
  }

  return occurrences;
}

export default function AgendaScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useThemedStyles(createStyles);
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
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() => getDayKey(new Date()));
  const [hiddenOrigins, setHiddenOrigins] = useState<AgendaEvent['origin'][]>([]);

  const toggleOrigin = useCallback((origin: AgendaEvent['origin']) => {
    setHiddenOrigins((current) =>
      current.includes(origin) ? current.filter((item) => item !== origin) : [...current, origin],
    );
  }, []);

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
      .flatMap((reminder) => {
        const occurrences =
          reminder.repeatRule !== 'none'
            ? expandReminderInMonth(reminder.scheduledFor, reminder.repeatRule, startOfMonth(visibleMonth))
            : [];

        if (!occurrences.length) {
          occurrences.push(reminder.scheduledFor);
        }

        return occurrences.map((datetime, index) => ({
          id: index === 0 ? reminder.id : `${reminder.id}-${getDayKey(new Date(datetime))}`,
          origin: 'manual' as const,
          category: reminder.category,
          title: reminder.title,
          datetime,
          subtitle: `${formatEventTime(datetime)}${reminder.repeatRule !== 'none' ? ' · récurrent' : ''}`,
          href: { pathname: '/rappels' as const, params: { reminderId: reminder.id } },
        } satisfies AgendaEvent));
      });

    const birthdayEvents: AgendaEvent[] = people.flatMap((person) => {
      const birthdayInMonth = getBirthdayInMonth(person.birthday, startOfMonth(visibleMonth));
      if (!birthdayInMonth) {
        return [];
      }

      return [
        {
          id: `bday-${person.id}-${getDayKey(new Date(birthdayInMonth.date))}`,
          origin: 'birthday',
          title: `Anniversaire de ${person.name}`,
          datetime: birthdayInMonth.date,
          subtitle: birthdayInMonth.age
            ? `${formatEventDate(birthdayInMonth.date)} · ${birthdayInMonth.age} ans`
            : formatEventDate(birthdayInMonth.date),
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
          .flatMap((treatment) => {
            const monthStart = startOfMonth(visibleMonth);
            const monthDayCount = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
            const todayKey = localDay();

            return Array.from({ length: monthDayCount }, (_, index) => {
              const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), index + 1, 12, 0, 0, 0);
              return getDayKey(date);
            })
              .filter((dayKey) => dayKey <= todayKey)
              .map((dayKey) => {
                const taken = treatment.takenDays.includes(dayKey);
                const subtitle = taken ? 'Pris' : dayKey === todayKey ? 'À cocher aujourd\'hui' : 'Manqué';

                return {
                  id: `treatment-${treatment.id}-${dayKey}`,
                  origin: 'treatment' as const,
                  title: treatment.name || 'Traitement',
                  datetime: dateFromDay(dayKey, 9, 0).toISOString(),
                  subtitle,
                  href: '/traitement' as const,
                  treatmentId: treatment.id,
                  dayKey,
                } satisfies AgendaEvent;
              });
          })
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

  const availableOrigins = useMemo(() => {
    const seen = new Set<AgendaEvent['origin']>();
    for (const event of events) {
      seen.add(event.origin);
    }
    return (Object.keys(originLabels) as AgendaEvent['origin'][]).filter((origin) => seen.has(origin));
  }, [events]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();

    for (const event of events) {
      if (hiddenOrigins.includes(event.origin)) {
        continue;
      }
      const key = getDayKey(new Date(event.datetime));
      const bucket = map.get(key) ?? [];
      bucket.push(event);
      map.set(key, bucket);
    }

    return map;
  }, [events, hiddenOrigins]);

  const selectedEvents = selectedDayKey ? eventsByDay.get(selectedDayKey) ?? [] : [];

  const handleQuickEventAction = async (event: AgendaEvent) => {
    if (event.origin === 'manual') {
      await markReminderDone(db, event.id.replace(/-\d{4}-\d{2}-\d{2}$/, ''));
      setReminders(await listReminders(db));
      return;
    }

    if (event.origin === 'treatment' && event.treatmentId && event.dayKey === localDay()) {
      await toggleTreatmentDay(db, { treatmentId: event.treatmentId, day: localDay() });
      setTreatments(await listTreatments(db));
    }
  };

  const todayKey = getDayKey(new Date());

  const calendarDays = useMemo(
    () =>
      Array.from({ length: dayCount }, (_, index) => {
        const dayNumber = index + 1;
        const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), dayNumber, 12, 0, 0, 0);
        const dayKey = getDayKey(date);
        const dayEvents = eventsByDay.get(dayKey) ?? [];

        return {
          dayNumber,
          dayKey,
          dayEvents,
          isToday: todayKey === dayKey,
          isSelected: selectedDayKey === dayKey,
        };
      }),
    [dayCount, eventsByDay, firstDay, selectedDayKey, todayKey],
  );

  const isCurrentMonth =
    visibleMonth.getFullYear() === new Date().getFullYear() && visibleMonth.getMonth() === new Date().getMonth();

  const goToToday = useCallback(() => {
    setVisibleMonth(startOfMonth(new Date()));
    setSelectedDayKey(getDayKey(new Date()));
  }, []);

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
            accessibilityRole="button"
            accessibilityLabel="Ajouter un élément"
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
            accessibilityRole="button"
            accessibilityLabel="Mois précédent"
            onPress={() => {
              setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12));
              setSelectedDayKey(null);
            }}
            style={({ pressed }) => [styles.navButton, pressed && styles.pressedSoft]}
          >
            <Text style={styles.navButtonLabel}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Revenir au mois courant"
            onPress={goToToday}
          >
            <Text style={styles.monthTitle}>{getMonthLabel(visibleMonth)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mois suivant"
            onPress={() => {
              setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12));
              setSelectedDayKey(null);
            }}
            style={({ pressed }) => [styles.navButton, pressed && styles.pressedSoft]}
          >
            <Text style={styles.navButtonLabel}>›</Text>
          </Pressable>
        </View>

        {!isCurrentMonth ? (
          <Pressable
            accessibilityRole="button"
            onPress={goToToday}
            style={({ pressed }) => [styles.todayButton, pressed && styles.pressedSoft]}
          >
            <Text style={styles.todayButtonLabel}>Revenir à aujourd'hui</Text>
          </Pressable>
        ) : null}

        <View style={styles.weekRow}>
          {weekDays.map((day) => (
            <Text key={day.id} style={styles.weekLabel}>{day.label}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {Array.from({ length: monthOffset }).map((_, index) => (
            <View key={`empty-${index}`} style={styles.emptyCell} />
          ))}
          {calendarDays.map((day) => {
            const dayColors = [...new Set(day.dayEvents.map((event) => getEventColor(event)))];

            return (
              <Pressable
                key={day.dayKey}
                accessibilityRole="button"
                accessibilityLabel={`${day.dayNumber}, ${day.dayEvents.length} événement${day.dayEvents.length > 1 ? 's' : ''}`}
                onPress={() => setSelectedDayKey(day.dayKey)}
                style={[
                  styles.dayCell,
                  day.isToday && styles.dayCellToday,
                  day.isSelected && styles.dayCellSelected,
                ]}
              >
                <Text style={[styles.dayLabel, day.isSelected && styles.dayLabelSelected]}>{day.dayNumber}</Text>
                <View style={styles.dotsRow}>
                  {dayColors.slice(0, 3).map((color, idx) => (
                    <View key={idx} style={[styles.dot, { backgroundColor: color }]} />
                  ))}
                  {dayColors.length > 3 ? (
                    <Text style={[styles.dotMore, day.isSelected && styles.dayLabelSelected]}>+</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={`filler-${index}`} style={styles.emptyCell} />
          ))}
        </View>
      </View>

      {availableOrigins.length > 1 ? (
        <View style={styles.filtersRow}>
          {availableOrigins.map((origin) => {
            const hidden = hiddenOrigins.includes(origin);

            return (
              <Pressable
                key={origin}
                accessibilityRole="button"
                accessibilityLabel={`${hidden ? 'Afficher' : 'Masquer'} ${originLabels[origin]}`}
                onPress={() => toggleOrigin(origin)}
                style={({ pressed }) => [styles.filterChip, hidden && styles.filterChipHidden, pressed && styles.pressedSoft]}
              >
                <View style={[styles.dot, { backgroundColor: hidden ? colors.muted : eventColors[origin] }]} />
                <Text style={[styles.filterChipLabel, hidden && styles.filterChipLabelHidden]}>{originLabels[origin]}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {selectedDayKey ? (
        <>
          <Text style={styles.sectionLabel}>
            Le {new Date(`${selectedDayKey}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            {selectedEvents.length ? ` · ${selectedEvents.length} événement${selectedEvents.length > 1 ? 's' : ''}` : ''}
          </Text>
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
                  {event.origin === 'manual' || (event.origin === 'treatment' && event.dayKey === todayKey) ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleQuickEventAction(event)}
                      style={({ pressed }) => [styles.eventActionButton, pressed && styles.pressedSoft]}
                    >
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
  dotMore: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    lineHeight: 9,
  },
  todayButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  todayButtonLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterChipHidden: {
    opacity: 0.45,
  },
  filterChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  filterChipLabelHidden: {
    color: colors.muted,
    textDecorationLine: 'line-through',
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