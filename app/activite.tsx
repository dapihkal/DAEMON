import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { FlashList } from '@shopify/flash-list';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import { deletePhysicalActivity, listPhysicalActivities, savePhysicalActivity } from '../src/db/module-repositories';
import type { PhysicalActivity } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type ActivityDraft = {
  id: string | null;
  date: string;
  activityType: string;
  durationMinutes: string;
  intensity: number;
  notes: string;
  createdAt: number | null;
};

const activityTypes = ['Marche', 'Course', 'Renfo', 'Mobilité', 'Vélo', 'Autre'];

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function createEmptyDraft(): ActivityDraft {
  return { id: null, date: localDay(), activityType: 'Marche', durationMinutes: '30', intensity: 3, notes: '', createdAt: null };
}

function toDraft(activity: PhysicalActivity): ActivityDraft {
  return { id: activity.id, date: activity.date, activityType: activity.activityType, durationMinutes: `${activity.durationMinutes || ''}`, intensity: activity.intensity, notes: activity.notes, createdAt: activity.createdAt };
}

function parseDuration(value: string) {
  const duration = Number.parseInt(value.replace(/\D/g, ''), 10);
  return Number.isFinite(duration) ? duration : 0;
}

export default function ActiviteScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activities, setActivities] = useState<PhysicalActivity[]>([]);
  const [draft, setDraft] = useState<ActivityDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const nextActivities = await listPhysicalActivities(db);
      if (active) {
        setActivities(nextActivities);
      }
    })();

    return () => {
      active = false;
    };
  }, [db]);

  useFocusEffect(refresh);

  const stats = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const recent = activities.filter((activity) => new Date(`${activity.date}T12:00:00`).getTime() >= sevenDaysAgo.getTime());
    const totalMinutes = recent.reduce((sum, activity) => sum + activity.durationMinutes, 0);
    const averageIntensity = recent.length ? recent.reduce((sum, activity) => sum + activity.intensity, 0) / recent.length : 0;
    return { sessions: recent.length, totalMinutes, averageIntensity };
  }, [activities]);

  const handleSave = async () => {
    if (!draft) {
      return;
    }

    await savePhysicalActivity(db, {
      id: draft.id ?? undefined,
      date: draft.date,
      activityType: draft.activityType,
      durationMinutes: parseDuration(draft.durationMinutes),
      intensity: draft.intensity,
      notes: draft.notes,
      createdAt: draft.createdAt ?? undefined,
    });
    setDraft(null);
    setActivities(await listPhysicalActivities(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deletePhysicalActivity(db, draft.id);
    setDraft(null);
    setActivities(await listPhysicalActivities(db));
  };

  if (draft) {
    return (
      <AppShell kicker="Mouvement" title={draft.id ? 'Modifier la séance' : 'Nouvelle séance'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}><Text style={styles.backLabel}>Retour à l'activité</Text></Pressable>
        <View style={styles.editorCard}>
          <DateField label="Date" onChange={(value) => setDraft((current) => (current ? { ...current, date: value } : current))} value={draft.date} />
          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.chipWrap}>{activityTypes.map((activityType) => <Pressable key={activityType} onPress={() => setDraft((current) => (current ? { ...current, activityType } : current))} style={[styles.chip, draft.activityType === activityType && styles.chipActive]}><Text style={[styles.chipLabel, draft.activityType === activityType && styles.chipLabelActive]}>{activityType}</Text></Pressable>)}</View>
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, activityType: value } : current))} placeholder="Type libre" placeholderTextColor={colors.muted} style={styles.input} value={draft.activityType} />
          <TextInput keyboardType="number-pad" onChangeText={(value) => setDraft((current) => (current ? { ...current, durationMinutes: value } : current))} placeholder="Durée en minutes" placeholderTextColor={colors.muted} style={styles.input} value={draft.durationMinutes} />
          <Text style={styles.fieldLabel}>Intensité</Text>
          <View style={styles.chipWrap}>{[1, 2, 3, 4, 5].map((intensity) => <Pressable key={intensity} onPress={() => setDraft((current) => (current ? { ...current, intensity } : current))} style={[styles.chip, draft.intensity === intensity && styles.chipActive]}><Text style={[styles.chipLabel, draft.intensity === intensity && styles.chipLabelActive]}>{intensity}/5</Text></Pressable>)}</View>
          <TextInput multiline onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))} placeholder="Énergie, douleur, parcours, série, ressenti..." placeholderTextColor={colors.muted} style={styles.textarea} textAlignVertical="top" value={draft.notes} />
          <View style={styles.buttonRow}><Pressable onPress={handleSave} style={styles.primaryButton}><Text style={styles.primaryButtonLabel}>Enregistrer</Text></Pressable>{draft.id ? <Pressable onPress={handleDelete} style={styles.secondaryButton}><Text style={styles.secondaryButtonLabel}>Supprimer</Text></Pressable> : null}</View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell contentMode="view" kicker="Mouvement" title="Activité physique">
      <FlashList
        data={activities}
        keyExtractor={(activity) => activity.id}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        ListHeaderComponent={(
          <View style={{ gap: spacing.md, marginBottom: spacing.md, marginTop: spacing.md }}>
            <SectionTitle eyebrow="Séances" title="Suivi d'activité" subtitle="Durée, intensité, type de mouvement et notes après la séance." />
            <View style={styles.metricsGrid}>
              <View style={styles.metricTile}><Text style={styles.metricValue}>{stats.sessions}</Text><Text style={styles.metricLabel}>séances 7j</Text></View>
              <View style={styles.metricTile}><Text style={styles.metricValue}>{stats.totalMinutes}</Text><Text style={styles.metricLabel}>minutes 7j</Text></View>
              <View style={styles.metricTile}><Text style={styles.metricValue}>{stats.averageIntensity ? stats.averageIntensity.toFixed(1) : '-'}</Text><Text style={styles.metricLabel}>intensité /5</Text></View>
            </View>
            <Pressable onPress={() => setDraft(createEmptyDraft())} style={({ pressed }) => [styles.addButton, pressed && styles.pressedCard]}><Text style={styles.addButtonLabel}>+ Ajouter une séance</Text></Pressable>
          </View>
        )}
        renderItem={({ item: activity }) => (
          <Pressable onPress={() => setDraft(toDraft(activity))} style={({ pressed }) => [styles.itemCard, pressed && styles.pressedCard]}>
            <Text style={styles.itemTitle}>{activity.activityType}</Text>
            <Text style={styles.itemMeta}>{activity.date} · {activity.durationMinutes} min · intensité {activity.intensity}/5</Text>
            {activity.notes ? <Text style={styles.itemNotes}>{activity.notes}</Text> : null}
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title="Aucune séance" message="Ajoute une première activité pour suivre ton mouvement semaine après semaine." />}
      />
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedCard: { borderColor: colors.accent, opacity: 0.9, transform: [{ scale: 0.985 }] },
  backButton: { alignSelf: 'flex-start' },
  backLabel: { color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  editorCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.xl, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, color: colors.text, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
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
  itemTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 21 },
  itemMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  itemNotes: { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});