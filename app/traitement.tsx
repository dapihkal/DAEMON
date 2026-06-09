import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import {
  deleteTreatment,
  listRoutines,
  listTreatments,
  saveTreatment,
  setRoutineEnabled,
  setRoutineTime,
  toggleTreatmentDay,
} from '../src/db/repositories';
import type { Routine, Treatment } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type TreatmentDraft = {
  id: string | null;
  name: string;
  dose: string;
  createdAt: number | null;
  reminderEnabled: boolean;
  reminderTime: string;
};

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function buildDayRange(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (count - index - 1));
    return date;
  });
}

function createDraft(treatment: Treatment | null, routine: Routine | null): TreatmentDraft {
  return {
    id: treatment?.id ?? null,
    name: treatment?.name ?? '',
    dose: treatment?.dose ?? '',
    createdAt: treatment?.createdAt ?? null,
    reminderEnabled: routine?.enabled ?? false,
    reminderTime: routine?.time ?? '08:00',
  };
}

function formatDayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

export default function TraitementScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [draft, setDraft] = useState<TreatmentDraft | null>(null);

  const loadData = useCallback(async () => {
    const [nextTreatments, nextRoutines] = await Promise.all([
      listTreatments(db),
      listRoutines(db),
    ]);

    setTreatments(nextTreatments);
    setRoutines(nextRoutines);
  }, [db]);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const [nextTreatments, nextRoutines] = await Promise.all([
        listTreatments(db),
        listRoutines(db),
      ]);

      if (!active) {
        return;
      }

      setTreatments(nextTreatments);
      setRoutines(nextRoutines);
    })();

    return () => {
      active = false;
    };
  }, [db]);

  useFocusEffect(refresh);

  const treatmentRoutine = routines.find((routine) => routine.key === 'treatment') ?? null;
  const todayKey = localDay();
  const lastThirtyDays = useMemo(() => buildDayRange(30), []);
  const lastSevenDays = useMemo(() => lastThirtyDays.slice(-7), [lastThirtyDays]);
  const hasTreatments = treatments.length > 0;

  const handleSave = async () => {
    if (!draft || (!draft.name.trim() && !draft.dose.trim())) {
      return;
    }

    const saved = await saveTreatment(db, {
      id: draft.id ?? undefined,
      name: draft.name,
      dose: draft.dose,
      createdAt: draft.createdAt ?? undefined,
    });

    if (!saved) {
      return;
    }

    await setRoutineEnabled(db, {
      key: 'treatment',
      enabled: draft.reminderEnabled,
    });

    if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(draft.reminderTime)) {
      await setRoutineTime(db, {
        key: 'treatment',
        time: draft.reminderTime,
      });
    }

    setDraft(null);
    await loadData();
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deleteTreatment(db, draft.id);
    setDraft(null);
    await loadData();
  };

  const handleToggleDay = async (treatmentId: string, day: string) => {
    await toggleTreatmentDay(db, { treatmentId, day });
    setTreatments(await listTreatments(db));
  };

  if (draft) {
    return (
      <AppShell kicker="Observance" title={draft.id ? 'Modifier le traitement' : 'Ajouter un traitement'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour au suivi</Text>
        </Pressable>

        <View style={styles.editorCard}>
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))}
            placeholder="Nom du traitement"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.name}
          />
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, dose: value } : current))}
            placeholder="Dosage, ex. 75 ug ou 1 comprimé"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.dose}
          />

          <Text style={styles.fieldLabel}>Rappel quotidien</Text>
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => setDraft((current) => (current ? { ...current, reminderEnabled: true } : current))}
              style={[styles.chip, draft.reminderEnabled && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, draft.reminderEnabled && styles.chipLabelActive]}>Activé</Text>
            </Pressable>
            <Pressable
              onPress={() => setDraft((current) => (current ? { ...current, reminderEnabled: false } : current))}
              style={[styles.chip, !draft.reminderEnabled && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, !draft.reminderEnabled && styles.chipLabelActive]}>Désactivé</Text>
            </Pressable>
          </View>

          <TextInput
            keyboardType="numbers-and-punctuation"
            onChangeText={(value) => setDraft((current) => (current ? { ...current, reminderTime: value } : current))}
            placeholder="08:00"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.reminderTime}
          />

          <View style={styles.buttonRow}>
            <Pressable onPress={handleSave} style={styles.primaryButton}>
              <Text style={styles.primaryButtonLabel}>Enregistrer</Text>
            </Pressable>
            {draft.id ? (
              <Pressable onPress={handleDelete} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonLabel}>Supprimer</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell kicker="Observance" title="Traitements">
      <SectionTitle
        eyebrow="Suivi"
        title={hasTreatments ? `${treatments.length} traitement${treatments.length > 1 ? 's' : ''}` : 'Suivi quotidien'}
        subtitle="Plusieurs traitements, coche quotidienne séparée, observance sur 30 jours et rappel quotidien commun."
      />

      <Pressable onPress={() => setDraft(createDraft(null, treatmentRoutine))} style={styles.addButton}>
        <Text style={styles.addButtonLabel}>+ Ajouter un traitement</Text>
      </Pressable>

      {!hasTreatments ? (
        <EmptyState
          title="Aucun traitement"
          message="Ajoute un traitement pour enregistrer un nom, un dosage et une observance au jour le jour."
        />
      ) : (
        treatments.map((treatment) => {
          const takenDaysSet = new Set(treatment.takenDays);
          const takenToday = takenDaysSet.has(todayKey);
          const takenCount30 = lastThirtyDays.filter((date) => takenDaysSet.has(localDay(date))).length;
          const observance30 = Math.round((takenCount30 / Math.max(1, lastThirtyDays.length)) * 100);

          return (
            <View key={treatment.id} style={styles.treatmentCard}>
              <View style={styles.treatmentHeader}>
                <View style={styles.treatmentTitleBlock}>
                  <Text style={styles.treatmentTitle}>{treatment.name || 'Traitement'}</Text>
                  {treatment.dose ? <Text style={styles.treatmentDose}>{treatment.dose}</Text> : null}
                </View>
                <Pressable onPress={() => setDraft(createDraft(treatment, treatmentRoutine))} style={styles.editChip}>
                  <Text style={styles.editChipLabel}>Modifier</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => handleToggleDay(treatment.id, todayKey)}
                style={[styles.todayCard, takenToday && styles.todayCardActive]}
              >
                <View style={[styles.todayCheck, takenToday && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                  <Text style={styles.todayCheckLabel}>{takenToday ? 'OK' : ''}</Text>
                </View>
                <View style={styles.todayBody}>
                  <Text style={styles.todayTitle}>{takenToday ? 'Pris aujourd\'hui' : 'Marquer comme pris aujourd\'hui'}</Text>
                  <Text style={styles.todayMeta}>{takenCount30}/30 jours · {observance30}%</Text>
                </View>
              </Pressable>

              <View style={styles.progressCard}>
                <Text style={styles.progressLabel}>Observance sur 30 jours</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${observance30}%`, backgroundColor: colors.accent }]} />
                </View>
              </View>

              <View style={styles.weekRow}>
                {lastSevenDays.map((date) => {
                  const day = localDay(date);
                  const selected = takenDaysSet.has(day);

                  return (
                    <Pressable
                      key={day}
                      onPress={() => handleToggleDay(treatment.id, day)}
                      style={[styles.dayChip, selected && styles.dayChipActive]}
                    >
                      <Text style={[styles.dayChipWeekLabel, selected && styles.dayChipWeekLabelActive]}>
                        {date.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 1).toUpperCase()}
                      </Text>
                      <Text style={[styles.dayChipLabel, selected && styles.dayChipLabelActive]}>{date.getDate()}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Dernière prise</Text>
                <Text style={styles.summaryValue}>{treatment.takenDays[0] ? formatDayLabel(treatment.takenDays[0]) : 'Aucune'}</Text>
              </View>
            </View>
          );
        })
      )}

      {treatmentRoutine ? (
        <View style={styles.routineCard}>
          <Text style={styles.routineTitle}>Rappel quotidien</Text>
          <Text style={styles.routineBody}>{treatmentRoutine.enabled ? `Actif a ${treatmentRoutine.time}` : 'Desactive'}</Text>
        </View>
      ) : null}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    backButton: {
      alignSelf: 'flex-start',
    },
    backLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    editorCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg,
    },
    input: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 15,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    fieldLabel: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    chipRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    chip: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    chipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    chipLabelActive: {
      color: colors.white,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    addButton: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    addButtonLabel: {
      color: colors.muted,
      fontFamily: fonts.bodySemi,
      fontSize: 15,
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
    treatmentCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg,
    },
    treatmentHeader: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'space-between',
    },
    treatmentTitleBlock: {
      flex: 1,
      gap: 4,
    },
    treatmentTitle: {
      color: colors.text,
      fontFamily: fonts.title,
      fontSize: 22,
    },
    treatmentDose: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
    },
    editChip: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.pill,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    editChipLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    todayCard: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
    },
    todayCardActive: {
      borderColor: colors.accent,
    },
    todayCheck: {
      alignItems: 'center',
      borderColor: colors.lineStrong,
      borderRadius: radii.md,
      borderWidth: 2,
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    todayCheckActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    todayCheckLabel: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
    },
    todayBody: {
      flex: 1,
      gap: 4,
    },
    todayTitle: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 16,
    },
    todayMeta: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13,
    },
    progressCard: {
      gap: spacing.sm,
    },
    progressLabel: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    progressTrack: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.pill,
      height: 12,
      overflow: 'hidden',
    },
    progressFill: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      height: 12,
      minWidth: 6,
    },
    weekRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'space-between',
    },
    dayChip: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      flex: 1,
      gap: 2,
      paddingVertical: spacing.md,
    },
    dayChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    dayChipWeekLabel: {
      color: colors.muted,
      fontFamily: fonts.mono,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    dayChipWeekLabelActive: {
      color: colors.white,
    },
    dayChipLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 16,
    },
    dayChipLabelActive: {
      color: colors.white,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'space-between',
    },
    summaryLabel: {
      color: colors.muted,
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
    },
    summaryValue: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      textAlign: 'right',
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
      fontSize: 18,
    },
    routineBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
    },
  });