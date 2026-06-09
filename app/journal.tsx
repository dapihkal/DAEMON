import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { PeoplePicker } from '../src/components/people-picker';
import { SectionTitle } from '../src/components/section-title';
import { replaceEntityPersonLinks } from '../src/db/cross-repositories';
import {
  deleteJournalEntry,
  getJournalEntry,
  listJournalEntries,
  listRoutines,
  saveJournalEntry,
} from '../src/db/repositories';
import type { JournalEntry, Routine } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { selectionHaptic } from '../src/lib/haptics';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { MOOD_COLORS, getMoodColor } from '../src/theme/score-colors';

const MOODS = ['😕', '😐', '🙂', '😀', '🤩'] as const;

const CHART_RANGE_OPTIONS = [
  { label: '7j', value: 7 },
  { label: '15j', value: 15 },
  { label: '30j', value: 30 },
  { label: '90j', value: 90 },
  { label: '180j', value: 180 },
  { label: '360j', value: 360 },
] as const;

type ChartRangeMode = (typeof CHART_RANGE_OPTIONS)[number]['value'] | 'custom';

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

function formatShortDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatEntryDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function JournalScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const [editingDate, setEditingDate] = useState(localDay());

  const { data: entries = [] } = useQuery<JournalEntry[]>({
    queryKey: ['journalEntries'],
    queryFn: () => listJournalEntries(db),
  });

  const { data: routines = [] } = useQuery<Routine[]>({
    queryKey: ['routines'],
    queryFn: () => listRoutines(db),
  });

  const { data: editingEntryDb } = useQuery<JournalEntry | null>({
    queryKey: ['journalEntry', editingDate],
    queryFn: () => getJournalEntry(db, editingDate),
  });

  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [selectedMood, setSelectedMood] = useState(0);
  const [draftText, setDraftText] = useState('');
  const [draftPeople, setDraftPeople] = useState<string[]>([]);
  const [draftTags, setDraftTags] = useState('');

  useEffect(() => {
    setEditingEntry(editingEntryDb || null);
    setSelectedMood(editingEntryDb?.mood ?? 0);
    setDraftText(editingEntryDb?.text ?? '');
    setDraftTags(editingEntryDb?.tags?.join(', ') ?? '');
  }, [editingEntryDb]);

  const defaultChartStart = useMemo(() => localDay(addDays(new Date(), -29)), []);
  const defaultChartEnd = useMemo(() => localDay(), []);
  const [chartRangeMode, setChartRangeMode] = useState<ChartRangeMode>(30);
  const [customChartStart, setCustomChartStart] = useState(defaultChartStart);
  const [customChartEnd, setCustomChartEnd] = useState(defaultChartEnd);

  const handleSelectEntry = (date: string) => {
    setEditingDate(date);
    selectionHaptic();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
      void queryClient.invalidateQueries({ queryKey: ['journalEntry', editingDate] });
    }, [queryClient, editingDate])
  );

  const moodRoutine = routines.find((routine) => routine.key === 'mood') ?? null;
  const chartRange = useMemo(() => {
    if (chartRangeMode === 'custom') {
      const days = buildDayRange(customChartStart, customChartEnd);
      const first = days[0] ?? customChartStart;
      const last = days[days.length - 1] ?? customChartEnd;

      return {
        days,
        label: 'personnalisée',
        detail: `du ${formatShortDay(first)} au ${formatShortDay(last)}`,
      };
    }

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const start = localDay(addDays(today, -(chartRangeMode - 1)));
    const end = localDay(today);

    return {
      days: buildDayRange(start, end),
      label: `${chartRangeMode} jours`,
      detail: `sur ${chartRangeMode} j`,
    };
  }, [chartRangeMode, customChartEnd, customChartStart]);

  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);

  const tagStats = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((entry) => {
      entry.tags?.forEach((tag) => {
        const clean = tag.trim().toLowerCase();
        if (clean) {
          counts.set(clean, (counts.get(clean) ?? 0) + 1);
        }
      });
    });
    return counts;
  }, [entries]);

  const uniqueTags = useMemo(() => {
    return [...tagStats.keys()].sort((a, b) => a.localeCompare(b, 'fr-FR'));
  }, [tagStats]);

  const suggestedTags = useMemo(() => {
    return [...tagStats.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [tagStats]);

  const toggleTag = (tag: string) => {
    const currentTags = draftTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const normalizedTag = tag.toLowerCase();
    const index = currentTags.findIndex((t) => t.toLowerCase() === normalizedTag);

    if (index >= 0) {
      currentTags.splice(index, 1);
    } else {
      currentTags.push(tag);
    }

    setDraftTags(currentTags.join(', '));
    selectionHaptic();
  };

  const visibleEntries = useMemo(() => {
    if (!selectedTagFilter) {
      return entries;
    }
    return entries.filter((entry) =>
      entry.tags?.some((t) => t.trim().toLowerCase() === selectedTagFilter),
    );
  }, [entries, selectedTagFilter]);

  const entriesByDate = useMemo(() => new Map(entries.map((entry) => [entry.date, entry])), [entries]);

  const chartPoints = useMemo(
    () =>
      chartRange.days.map((date) => {
        const entry = entriesByDate.get(date);
        const hasTag = selectedTagFilter
          ? entry?.tags?.some((t) => t.trim().toLowerCase() === selectedTagFilter) ?? false
          : true;
        return {
          date,
          mood: entry?.mood ?? 0,
          hasTag,
        };
      }),
    [chartRange.days, entriesByDate, selectedTagFilter],
  );

  const chartEntryCount = chartPoints.filter((point) => point.mood > 0 && point.hasTag).length;
  const chartGap = chartPoints.length > 180 ? 0 : chartPoints.length > 60 ? 1 : 4;
  const chartColumnMaxWidth = chartPoints.length > 180 ? 4 : chartPoints.length > 60 ? 8 : 12;

  const handleSave = async () => {
    const mood = selectedMood || editingEntry?.mood || 3;
    const tags = draftTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const entry = await saveJournalEntry(db, {
      date: editingDate,
      mood,
      text: draftText,
      tags,
    });

    await replaceEntityPersonLinks(db, {
      entityKind: 'journal',
      entityId: entry.date,
      personIds: draftPeople,
    });

    await queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    await queryClient.invalidateQueries({ queryKey: ['journalEntry', editingDate] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleDelete = async (date: string) => {
    await replaceEntityPersonLinks(db, { entityKind: 'journal', entityId: date, personIds: [] });
    await deleteJournalEntry(db, date);

    await queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    await queryClient.invalidateQueries({ queryKey: ['journalEntry', date] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });

    if (date === editingDate) {
      setEditingEntry(null);
      setSelectedMood(0);
      setDraftText('');
      setDraftPeople([]);
      setDraftTags('');
    }
  };

  return (
    <AppShell ref={scrollRef} kicker="Humeur" title="Journal">
      <SectionTitle
        eyebrow="Quotidien"
        title="Humeur du jour"
        subtitle="Une entrée par jour, cinq niveaux d'humeur, note libre et historique local." 
      />

      <View style={styles.editorCard}>
        <DateField label="Date de l'entrée" value={editingDate} onChange={setEditingDate} />
        <Text style={styles.editorLabel}>Comment te sens-tu ?</Text>
        <View style={styles.moodRow}>
          {MOODS.map((moodLabel, index) => {
            const mood = index + 1;
            const selected = selectedMood === mood;

            return (
              <Pressable
                key={mood}
                onPress={() => setSelectedMood(mood)}
                style={[
                  styles.moodButton,
                  selected && [styles.moodButtonSelected, { backgroundColor: MOOD_COLORS[mood as keyof typeof MOOD_COLORS] }]
                ]}
              >
                <Text style={styles.moodEmoji}>{moodLabel}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          multiline
          onChangeText={setDraftText}
          placeholder="Quelques mots sur la journée..."
          placeholderTextColor={colors.muted}
          style={styles.textarea}
          textAlignVertical="top"
          value={draftText}
        />

        <TextInput
          multiline
          onChangeText={setDraftTags}
          placeholder="Tags personnalisés, à séparer par une virgule (ex. douleurs, règles)"
          placeholderTextColor={colors.muted}
          style={styles.tagsInput}
          textAlignVertical="top"
          value={draftTags}
        />

        {suggestedTags.length > 0 && (
          <View style={{ marginTop: -spacing.xs }}>
            <View style={styles.tagRow}>
              {suggestedTags.map((tag) => {
                const isActive = draftTags
                  .toLowerCase()
                  .split(',')
                  .map((t) => t.trim())
                  .includes(tag.toLowerCase());
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={[
                      styles.tagChip,
                      isActive && { backgroundColor: colors.accent + '20', borderColor: colors.accent, borderWidth: 1 }
                    ]}
                  >
                    <Text style={[styles.tagChipLabel, isActive && { color: colors.accent }]}>
                      {isActive ? '✓ ' : '+ '}{tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: spacing.xs, fontStyle: 'italic' }}>
              Utilise les mêmes mots pour regrouper tes suivis dans les graphiques.
            </Text>
          </View>
        )}

        <PeoplePicker
          entityKind="journal"
          entityId={editingDate}
          selectedIds={draftPeople}
          onChange={setDraftPeople}
        />

        <View style={styles.footerRow}>
          <Pressable onPress={handleSave} style={styles.primaryButton}>
            <Text style={styles.primaryButtonLabel}>Enregistrer</Text>
          </Pressable>
          {editingEntry ? (
            <Pressable onPress={() => handleDelete(editingEntry.date)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonLabel}>Supprimer</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {moodRoutine ? (
        <View style={styles.routineCard}>
          <Text style={styles.routineTitle}>Routine humeur</Text>
          <Text style={styles.routineBody}>
            {moodRoutine.enabled ? `Active à ${moodRoutine.time}` : 'Désactivée dans les rappels'}
          </Text>
        </View>
      ) : null}

      {entries.length ? (
        <>
          <SectionTitle eyebrow={chartRange.label} title="Courbe d'humeur" subtitle={`${chartEntryCount} entrée(s), ${chartRange.detail}`} />
          <View style={styles.rangePanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangeOptions}>
              {CHART_RANGE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: chartRangeMode === option.value }}
                  onPress={() => setChartRangeMode(option.value)}
                  style={[styles.rangeChip, chartRangeMode === option.value && styles.rangeChipActive]}
                >
                  <Text style={[styles.rangeLabel, chartRangeMode === option.value && styles.rangeLabelActive]}>{option.label}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: chartRangeMode === 'custom' }}
                onPress={() => setChartRangeMode('custom')}
                style={[styles.rangeChip, chartRangeMode === 'custom' && styles.rangeChipActive]}
              >
                <Text style={[styles.rangeLabel, chartRangeMode === 'custom' && styles.rangeLabelActive]}>Perso</Text>
              </Pressable>
            </ScrollView>
            {chartRangeMode === 'custom' ? (
              <View style={styles.customRangeFields}>
                <DateField label="Du" value={customChartStart} onChange={setCustomChartStart} />
                <DateField label="Au" value={customChartEnd} onChange={setCustomChartEnd} />
              </View>
            ) : null}
          </View>

          {uniqueTags.length > 0 ? (
            <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
              <Text style={{ color: colors.muted, fontFamily: fonts.bodyBold, fontSize: 12, paddingLeft: 4 }}>
                Visualiser / filtrer un suivi :
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: 8 }}
              >
                <Pressable
                  onPress={() => setSelectedTagFilter(null)}
                  style={[
                    styles.rangeChip,
                    selectedTagFilter === null && styles.rangeChipActive,
                  ]}
                >
                  <Text style={[styles.rangeLabel, selectedTagFilter === null && styles.rangeLabelActive]}>
                    Tous
                  </Text>
                </Pressable>
                {uniqueTags.map((tag) => {
                  const active = selectedTagFilter === tag;
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => setSelectedTagFilter(active ? null : tag)}
                      style={[
                        styles.rangeChip,
                        active && styles.rangeChipActive,
                      ]}
                    >
                      <Text style={[styles.rangeLabel, active && styles.rangeLabelActive]}>
                        #{tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.chartCard}>
            <View style={[styles.chartRow, { gap: chartGap }]}>
              {chartPoints.map((point) => (
                <Pressable
                  key={point.date}
                  onPress={() => handleSelectEntry(point.date)}
                  style={({ pressed }) => [
                    styles.chartColumnWrap,
                    pressed && { opacity: 0.6 }
                  ]}
                >
                  <View
                    accessibilityLabel={`${formatShortDay(point.date)}: ${point.mood ? `${point.mood}/5` : 'aucune humeur'}`}
                    style={[
                      styles.chartColumn,
                      {
                        backgroundColor: point.mood ? getMoodColor(point.mood) : colors.lineStrong,
                        height: point.mood ? (point.hasTag ? 14 + point.mood * 12 : 6) : 6,
                        maxWidth: chartColumnMaxWidth,
                        opacity: point.mood ? (point.hasTag ? 0.85 : 0.1) : 0.1,
                      },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        </>
      ) : null}

      <SectionTitle eyebrow="Historique" title={selectedTagFilter ? `Entrées (#${selectedTagFilter})` : 'Entrées'} />
      {visibleEntries.length ? (
        visibleEntries.map((entry) => (
          <Pressable
            key={entry.date}
            onPress={() => handleSelectEntry(entry.date)}
            style={({ pressed }) => [
              styles.entryCard,
              pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] }
            ]}
          >
            <View style={[styles.entryMoodContainer, { backgroundColor: getMoodColor(entry.mood) + '20' }]}>
              <Text style={styles.entryMood}>{MOODS[entry.mood - 1]}</Text>
            </View>
            <View style={styles.entryBody}>
              <Text style={styles.entryDate}>{formatEntryDate(entry.date)}</Text>
              {entry.text ? <Text style={styles.entryText}>{entry.text}</Text> : null}
              {entry.tags && entry.tags.length > 0 ? (
                <View style={styles.tagRow}>
                  {entry.tags.map((tag) => (
                    <Pressable
                      key={tag}
                      onPress={() => router.push({ pathname: '/tags' as const, params: { tag } })}
                      style={styles.tagChip}
                    >
                      <Text style={styles.tagChipLabel}>#{tag}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            <Pressable onPress={() => handleDelete(entry.date)} style={styles.deleteChip}>
              <Text style={styles.deleteChipLabel}>Suppr.</Text>
            </Pressable>
          </Pressable>
        ))
      ) : (
        <EmptyState title="Pas encore d'entrée" message="Note l'humeur du jour pour commencer l'historique." />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    editorCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg,
    },
    editorLabel: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
    },
    moodRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    moodButton: {
      alignItems: 'center',
      borderRadius: radii.lg,
      opacity: 0.45,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      transform: [{ scale: 1 }],
    },
    moodButtonSelected: {
      backgroundColor: colors.accentSoft,
      opacity: 1,
      transform: [{ scale: 1.08 }],
    },
    moodEmoji: {
      fontSize: 30,
    },
    textarea: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 15,
      minHeight: 96,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    footerRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      flex: 1,
      paddingVertical: spacing.sm,
    },
    primaryButtonLabel: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    secondaryButtonLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
    tagsInput: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 15,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    tagChip: {
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    tagChipLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      lineHeight: 14,
    },
    routineCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.lg,
    },
    routineTitle: {
      color: colors.text,
      fontFamily: fonts.title,
      fontSize: 20,
    },
    routineBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
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
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    rangeChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    rangeLabel: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    rangeLabelActive: {
      color: colors.white,
    },
    customRangeFields: {
      gap: spacing.md,
    },
    chartCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      padding: spacing.lg,
    },
    chartRow: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: 4,
      height: 84,
    },
    chartColumnWrap: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'flex-end',
      minWidth: 0,
    },
    chartColumn: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      minHeight: 10,
      opacity: 0.85,
      width: '100%',
    },
    entryCard: {
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.lg,
    },
    entryMoodContainer: {
      alignItems: 'center',
      borderRadius: radii.lg,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    entryMood: {
      fontSize: 24,
      lineHeight: 28,
    },
    entryBody: {
      flex: 1,
      gap: spacing.xs,
    },
    entryDate: {
      color: colors.muted,
      fontFamily: fonts.mono,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    entryText: {
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
    },
    deleteChip: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    deleteChipLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
  });