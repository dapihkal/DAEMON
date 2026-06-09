import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AppShell } from '../src/components/app-shell';
import { SectionTitle } from '../src/components/section-title';
import { listDoses, listPhysicalActivities, listSleepEntries } from '../src/db/module-repositories';
import { listJournalEntries, listTreatments } from '../src/db/repositories';
import type { Dose, JournalEntry, PhysicalActivity, SleepEntry, Treatment } from '../src/db/types';
import { useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { getMoodColor, getInterpolatedMoodColor } from '../src/theme/score-colors';

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0).getTime();
}

function minutesFromTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function sleepDurationHours(entry: SleepEntry) {
  const bedtime = minutesFromTime(entry.bedtime);
  const wakeTime = minutesFromTime(entry.wakeTime);
  if (bedtime === null || wakeTime === null) {
    return null;
  }

  const duration = wakeTime >= bedtime ? wakeTime - bedtime : wakeTime + 24 * 60 - bedtime;
  return Math.round((duration / 60) * 10) / 10;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildRecentDays(count: number) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days: Array<{ key: string; label: string }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayKey = localDay(d);
    days.push({
      key: dayKey,
      label: new Date(`${dayKey}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    });
  }
  return days;
}

function TrendCard({ id, title, value, detail, points, color }: { id: string; title: string; value: string; detail: string; points: any[]; color: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const max = Math.max(1, ...points.map((point) => point.value));

  return (
    <View style={styles.trendCard}>
      <View style={styles.trendHeader}>
        <View style={styles.trendTitleWrap}>
          <Text style={styles.trendTitle}>{title}</Text>
          <Text style={styles.trendDetail}>{detail}</Text>
        </View>
        <Text style={[styles.trendValue, (id === 'mood' || id === 'sleep') && { color }]}>{value}</Text>
      </View>
      <View style={styles.trendBars}>
        {points.map((point) => {
          const height = point.value > 0 ? Math.max(8, Math.round((point.value / max) * 40)) : 4;
          const barColor = (id === 'mood' || id === 'sleep') && point.value > 0 ? getMoodColor(point.value) : (point.value ? color : colors.lineStrong);

          return (
            <View key={point.key} style={styles.trendBarSlot}>
              <View style={[styles.trendBar, { backgroundColor: barColor, height }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function SanteScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { preferences } = useThemePreferences();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data: doses = [] } = useQuery<Dose[]>({
    queryKey: ['doses'],
    queryFn: () => listDoses(db),
  });

  const { data: treatments = [] } = useQuery<Treatment[]>({
    queryKey: ['treatments'],
    queryFn: () => listTreatments(db),
  });

  const { data: sleepEntries = [] } = useQuery<SleepEntry[]>({
    queryKey: ['sleepEntries'],
    queryFn: () => listSleepEntries(db),
  });

  const { data: activities = [] } = useQuery<PhysicalActivity[]>({
    queryKey: ['activities'],
    queryFn: () => listPhysicalActivities(db),
  });

  const { data: journalEntries = [] } = useQuery<JournalEntry[]>({
    queryKey: ['journalEntries'],
    queryFn: () => listJournalEntries(db),
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['doses'] });
      void queryClient.invalidateQueries({ queryKey: ['treatments'] });
      void queryClient.invalidateQueries({ queryKey: ['sleepEntries'] });
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      void queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    }, [queryClient])
  );

  const metrics = useMemo(() => {
    const todayKey = localDay();
    const now = new Date();
    const monthStart = startOfMonth(now);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const recentSleep = sleepEntries.filter((entry) => new Date(`${entry.date}T12:00:00`).getTime() >= sevenDaysAgo.getTime());
    const sleepHours = recentSleep.flatMap((entry) => {
      const duration = sleepDurationHours(entry);
      return duration === null ? [] : [duration];
    });
    const activitiesThisWeek = activities.filter((activity) => new Date(`${activity.date}T12:00:00`).getTime() >= sevenDaysAgo.getTime());
    const activeTreatments = treatments.filter((treatment) => treatment.name || treatment.dose || treatment.takenDays.length);
    const pendingTreatments = activeTreatments.filter((treatment) => !treatment.takenDays.includes(todayKey));
    const dosesThisMonth = doses.filter((dose) => new Date(dose.datetime).getTime() >= monthStart).length;

    return {
      averageSleep: average(sleepHours),
      activityMinutes: activitiesThisWeek.reduce((sum, activity) => sum + activity.durationMinutes, 0),
      pendingTreatments: pendingTreatments.length,
      dosesThisMonth,
    };
  }, [activities, doses, sleepEntries, treatments]);

  const trends = useMemo(() => {
    const recentDays = buildRecentDays(7);
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
        ? Math.round((treatments.filter((t) => t.takenDays.includes(day.key)).length / treatments.length) * 100)
        : 0,
    }));

    const moodAvg = average(moodPoints.filter((p) => p.value > 0).map((p) => p.value));
    const sleepAvg = average(sleepPoints.filter((p) => p.value > 0).map((p) => p.value));
    const activityTotal = activityPoints.reduce((sum, p) => sum + p.value, 0);
    const treatmentAvg = average(treatmentPoints.filter((p) => p.value > 0).map((p) => p.value));

    return [
      {
        id: 'mood',
        title: 'Humeur',
        value: moodAvg ? `${moodAvg.toFixed(1)}/5` : '-',
        detail: '7 derniers jours',
        points: moodPoints,
        color: moodAvg ? getInterpolatedMoodColor(moodAvg) : colors.accent,
      },
      {
        id: 'sleep',
        title: 'Qualité sommeil',
        value: sleepAvg ? `${sleepAvg.toFixed(1)}/5` : '-',
        detail: '7 derniers jours',
        points: sleepPoints,
        color: sleepAvg ? getInterpolatedMoodColor(sleepAvg) : colors.accent,
      },
      {
        id: 'activity',
        title: 'Activité',
        value: `${activityTotal} min`,
        detail: '7 derniers jours',
        points: activityPoints,
        color: colors.success ?? '#4caf50',
      },
      {
        id: 'treatment',
        title: 'Traitement',
        value: treatments.length ? `${Math.round(treatmentAvg)}%` : '-',
        detail: 'Observance 7j',
        points: treatmentPoints,
        color: colors.primary,
      },
    ];
  }, [journalEntries, sleepEntries, activities, treatments, colors]);

  const insights = useMemo(() => {
    const recentDays = buildRecentDays(14);
    const activeDays = new Set(activities.map((a) => a.date));
    const goodSleepDays = new Set(sleepEntries.filter((s) => s.quality >= 4).map((s) => s.date));
    const moodWithActivity: number[] = [];
    const moodWithoutActivity: number[] = [];
    const moodGoodSleep: number[] = [];

    journalEntries.forEach((entry) => {
      if (!recentDays.some(d => d.key === entry.date)) return;
      if (activeDays.has(entry.date)) moodWithActivity.push(entry.mood);
      else moodWithoutActivity.push(entry.mood);
      if (goodSleepDays.has(entry.date)) moodGoodSleep.push(entry.mood);
    });

    const results = [];
    if (moodWithActivity.length >= 2 && moodWithoutActivity.length >= 2) {
      const avgA = average(moodWithActivity);
      const avgB = average(moodWithoutActivity);
      if (Math.abs(avgA - avgB) > 0.2) {
        results.push({
          text: avgA > avgB ? "Le sport semble booster votre moral (+"+(avgA-avgB).toFixed(1)+")" : "Humeur stable malgré l'absence d'activité",
          icon: '🎯'
        });
      }
    }
    if (moodGoodSleep.length >= 2) {
      const avgH = average(moodGoodSleep);
      if (avgH >= 4) results.push({ text: "Vos nuits réparatrices se reflètent sur votre humeur", icon: '🌙' });
    }

    return results;
  }, [activities, journalEntries, sleepEntries]);

  return (
    <AppShell kicker="Santé" title="Santé">
      <SectionTitle
        eyebrow="Tableau de bord"
        title="Suivi général"
        subtitle="Conso, traitement, sommeil et activité physique sont regroupés ici pour garder une lecture simple."
      />

      <View style={styles.metricsGrid}>
        <View style={styles.metricTile}>
          <Text style={styles.metricValue}>{metrics.averageSleep ? metrics.averageSleep.toFixed(1) : '-'}</Text>
          <Text style={styles.metricLabel}>h sommeil moy.</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricValue}>{metrics.activityMinutes}</Text>
          <Text style={styles.metricLabel}>min activité 7j</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricValue}>{metrics.pendingTreatments}</Text>
          <Text style={styles.metricLabel}>traitements à cocher</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricValue}>{metrics.dosesThisMonth}</Text>
          <Text style={styles.metricLabel}>prises ce mois</Text>
        </View>
      </View>

      <SectionTitle
        eyebrow="Analyses"
        title="Tendances & Insights"
        subtitle="Visualisez l'évolution de vos indicateurs clés sur la semaine écoulée."
      />

      <View style={styles.trendsGrid}>
        {trends.map(trend => (
          <TrendCard key={trend.id} {...trend} />
        ))}
      </View>

      {insights.length > 0 && (
        <View style={styles.insightBox}>
          {insights.map((insight, idx) => (
            <View key={idx} style={styles.insightRow}>
              <Text style={styles.insightIcon}>{insight.icon}</Text>
              <Text style={styles.insightText}>{insight.text}</Text>
            </View>
          ))}
        </View>
      )}

      <SectionTitle
        eyebrow="Modules"
        title="Accès rapide"
      />

      <View style={styles.moduleGrid}>

        {preferences.showSensitiveContent ? (
          <>
            <Pressable onPress={() => router.push('/conso')} style={({ pressed }) => [styles.moduleCard, pressed && styles.pressedCard]}>
              <Text style={styles.moduleTitle}>Consos</Text>
              <Text style={styles.moduleBody}>Journal des prises, contexte, ressenti, coût et calendrier.</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/traitement')} style={({ pressed }) => [styles.moduleCard, pressed && styles.pressedCard]}>
              <Text style={styles.moduleTitle}>Traitement</Text>
              <Text style={styles.moduleBody}>Suivi quotidien, plusieurs traitements et observance sur 30 jours.</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => router.push('/reglages')} style={({ pressed }) => [styles.moduleCard, pressed && styles.pressedCard]}>
            <Text style={styles.moduleTitle}>Suivis sensibles masqués</Text>
            <Text style={styles.moduleBody}>Consos et traitement se réactivent dans Réglages.</Text>
          </Pressable>
        )}
        <Pressable onPress={() => router.push('/sommeil')} style={({ pressed }) => [styles.moduleCard, pressed && styles.pressedCard]}>
          <Text style={styles.moduleTitle}>Sommeil</Text>
          <Text style={styles.moduleBody}>Nuits, heures de coucher et réveil, qualité et notes.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/activite')} style={({ pressed }) => [styles.moduleCard, pressed && styles.pressedCard]}>
          <Text style={styles.moduleTitle}>Activité physique</Text>
          <Text style={styles.moduleBody}>Séances, durée, intensité et ressenti après effort.</Text>
        </Pressable>
      </View>
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedCard: { borderColor: colors.accent, opacity: 0.9, transform: [{ scale: 0.985 }] },
  metricsGrid: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  metricTile: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 136,
    gap: spacing.xs,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  metricValue: { color: colors.text, fontFamily: fonts.title, fontSize: 28 },
  metricLabel: { color: colors.muted, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  trendsGrid: { alignSelf: 'stretch', gap: spacing.md, marginBottom: spacing.lg },
  trendCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
  },
  trendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  trendTitleWrap: { flex: 1, gap: 2 },
  trendTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 18 },
  trendDetail: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  trendValue: { color: colors.text, fontFamily: fonts.title, fontSize: 20 },
  trendBars: { flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 4 },
  trendBarSlot: { flex: 1, alignItems: 'center' },
  trendBar: { width: '100%', borderRadius: 2, minHeight: 4 },
  insightBox: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  insightRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  insightIcon: { fontSize: 18 },
  insightText: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13, flex: 1 },
  moduleGrid: { alignSelf: 'stretch', gap: spacing.md },
  moduleCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.sm,
    minWidth: 0,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  moduleTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 22 },
  moduleBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});