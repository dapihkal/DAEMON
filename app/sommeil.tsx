import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import { deleteSleepEntry, listSleepEntries, saveSleepEntry } from '../src/db/module-repositories';
import type { SleepEntry } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { MOOD_COLORS, getMoodColor } from '../src/theme/score-colors';

type SleepDraft = {
  id: string | null;
  date: string;
  bedtime: string;
  wakeTime: string;
  quality: number;
  notes: string;
  createdAt: number | null;
};

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function createEmptyDraft(): SleepDraft {
  return { id: null, date: localDay(), bedtime: '23:30', wakeTime: '07:30', quality: 3, notes: '', createdAt: null };
}

function toDraft(entry: SleepEntry): SleepDraft {
  return { id: entry.id, date: entry.date, bedtime: entry.bedtime, wakeTime: entry.wakeTime, quality: entry.quality, notes: entry.notes, createdAt: entry.createdAt };
}

function minutesFromTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function durationLabel(entry: Pick<SleepEntry, 'bedtime' | 'wakeTime'>) {
  const bedtime = minutesFromTime(entry.bedtime);
  const wakeTime = minutesFromTime(entry.wakeTime);
  if (bedtime === null || wakeTime === null) {
    return 'Durée inconnue';
  }

  const duration = wakeTime >= bedtime ? wakeTime - bedtime : wakeTime + 24 * 60 - bedtime;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return `${hours} h ${minutes.toString().padStart(2, '0')}`;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export default function SommeilScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [draft, setDraft] = useState<SleepDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const nextEntries = await listSleepEntries(db);
      if (active) {
        setEntries(nextEntries);
      }
    })();

    return () => {
      active = false;
    };
  }, [db]);

  useFocusEffect(refresh);

  const stats = useMemo(() => {
    const recent = entries.slice(0, 7);
    const durations = recent.flatMap((entry) => {
      const bedtime = minutesFromTime(entry.bedtime);
      const wakeTime = minutesFromTime(entry.wakeTime);
      if (bedtime === null || wakeTime === null) {
        return [];
      }
      const duration = wakeTime >= bedtime ? wakeTime - bedtime : wakeTime + 24 * 60 - bedtime;
      return [duration / 60];
    });

    return {
      nights: recent.length,
      averageHours: average(durations),
      averageQuality: average(recent.map((entry) => entry.quality)),
    };
  }, [entries]);

  const handleSave = async () => {
    if (!draft) {
      return;
    }

    await saveSleepEntry(db, {
      id: draft.id ?? undefined,
      date: draft.date,
      bedtime: draft.bedtime,
      wakeTime: draft.wakeTime,
      quality: draft.quality,
      notes: draft.notes,
      createdAt: draft.createdAt ?? undefined,
    });
    setDraft(null);
    setEntries(await listSleepEntries(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deleteSleepEntry(db, draft.id);
    setDraft(null);
    setEntries(await listSleepEntries(db));
  };

  if (draft) {
    return (
      <AppShell kicker="Repos" title={draft.id ? 'Modifier la nuit' : 'Nouvelle nuit'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}><Text style={styles.backLabel}>Retour au sommeil</Text></Pressable>
        <View style={styles.editorCard}>
          <DateField label="Date" onChange={(value) => setDraft((current) => (current ? { ...current, date: value } : current))} value={draft.date} />
          <View style={styles.timeRow}>
            <TextInput keyboardType="numbers-and-punctuation" onChangeText={(value) => setDraft((current) => (current ? { ...current, bedtime: value } : current))} placeholder="23:30" placeholderTextColor={colors.muted} style={styles.input} value={draft.bedtime} />
            <TextInput keyboardType="numbers-and-punctuation" onChangeText={(value) => setDraft((current) => (current ? { ...current, wakeTime: value } : current))} placeholder="07:30" placeholderTextColor={colors.muted} style={styles.input} value={draft.wakeTime} />
          </View>
          <Text style={styles.fieldLabel}>Qualité</Text>
          <View style={styles.chipWrap}>
            {[1, 2, 3, 4, 5].map((quality) => {
              const selected = draft.quality === quality;
              const color = MOOD_COLORS[quality as keyof typeof MOOD_COLORS];
              return (
                <Pressable
                  key={quality}
                  onPress={() => setDraft((current) => (current ? { ...current, quality } : current))}
                  style={[styles.chip, selected && [styles.chipActive, { backgroundColor: color, borderColor: color }]]}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>{quality}/5</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput multiline onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))} placeholder="Réveils, énergie, rêve, douleur, écran..." placeholderTextColor={colors.muted} style={styles.textarea} textAlignVertical="top" value={draft.notes} />
          <View style={styles.buttonRow}><Pressable onPress={handleSave} style={styles.primaryButton}><Text style={styles.primaryButtonLabel}>Enregistrer</Text></Pressable>{draft.id ? <Pressable onPress={handleDelete} style={styles.secondaryButton}><Text style={styles.secondaryButtonLabel}>Supprimer</Text></Pressable> : null}</View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell kicker="Repos" title="Sommeil">
      <SectionTitle eyebrow="Nuits" title="Journal du sommeil" subtitle="Horaires, durée estimée, qualité ressentie et notes utiles." />
      <View style={styles.metricsGrid}>
        <View style={styles.metricTile}><Text style={styles.metricValue}>{stats.nights}</Text><Text style={styles.metricLabel}>nuits récentes</Text></View>
        <View style={styles.metricTile}><Text style={styles.metricValue}>{stats.averageHours ? stats.averageHours.toFixed(1) : '-'}</Text><Text style={styles.metricLabel}>h moyenne</Text></View>
        <View style={styles.metricTile}><Text style={styles.metricValue}>{stats.averageQuality ? stats.averageQuality.toFixed(1) : '-'}</Text><Text style={styles.metricLabel}>qualité /5</Text></View>
      </View>
      <Pressable onPress={() => setDraft(createEmptyDraft())} style={({ pressed }) => [styles.addButton, pressed && styles.pressedCard]}><Text style={styles.addButtonLabel}>+ Ajouter une nuit</Text></Pressable>
      {entries.length ? entries.map((entry) => (
        <Pressable key={entry.id} onPress={() => setDraft(toDraft(entry))} style={({ pressed }) => [styles.itemCard, pressed && styles.pressedCard]}>
          <View style={styles.itemHeader}>
            <View style={styles.itemTitleGroup}>
              <Text style={styles.itemTitle}>{entry.date}</Text>
              <Text style={styles.itemMeta}>{entry.bedtime || '--:--'} à {entry.wakeTime || '--:--'} · {durationLabel(entry)}</Text>
            </View>
            <View style={[styles.qualityBadge, { backgroundColor: getMoodColor(entry.quality) }]}>
              <Text style={styles.qualityValue}>{entry.quality}</Text>
            </View>
          </View>
          {entry.notes ? <Text style={styles.itemNotes}>{entry.notes}</Text> : null}
        </Pressable>
      )) : <EmptyState title="Aucune nuit" message="Ajoute une première nuit pour commencer à voir les tendances de repos." />}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedCard: { borderColor: colors.accent, opacity: 0.9, transform: [{ scale: 0.985 }] },
  backButton: { alignSelf: 'flex-start' },
  backLabel: { color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  editorCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.xl, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  timeRow: { flexDirection: 'row', gap: spacing.sm },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, color: colors.text, flex: 1, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  textarea: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, color: colors.text, fontFamily: fonts.body, fontSize: 15, minHeight: 120, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  fieldLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { backgroundColor: colors.chip, borderColor: colors.chip, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 12 },
  chipLabelActive: { color: colors.white },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, flex: 1, paddingVertical: spacing.sm },
  primaryButtonLabel: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.chip, borderRadius: radii.pill, flex: 1, justifyContent: 'center', paddingVertical: spacing.sm },
  secondaryButtonLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  metricsGrid: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricTile: { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, flexBasis: 0, flexGrow: 1, minWidth: 104, gap: spacing.xs, padding: spacing.md },
  metricValue: { color: colors.text, fontFamily: fonts.title, fontSize: 24 },
  metricLabel: { color: colors.muted, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  addButton: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  addButtonLabel: { color: colors.muted, fontFamily: fonts.bodySemi, fontSize: 15 },
  itemCard: { alignSelf: 'stretch', backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderRadius: radii.xl, borderWidth: 1, gap: spacing.sm, minWidth: 0, padding: spacing.lg, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 18 },
  itemHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  itemTitleGroup: { flex: 1, gap: 2 },
  qualityBadge: { alignItems: 'center', borderRadius: radii.md, height: 32, justifyContent: 'center', width: 32 },
  qualityValue: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 16 },
  itemTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 21 },
  itemMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  itemNotes: { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});