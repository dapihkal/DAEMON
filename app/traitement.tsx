import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import { deleteTreatment, listTreatments, saveTreatment } from '../src/db/repositories';
import {
  DEFAULT_TIME,
  deleteSchedule,
  emptyExtras,
  ensureScheduleTables,
  getExtrasMap,
  intakeKey,
  migrateLegacyTreatment,
  saveSchedule,
  setDayIntakes,
  toggleIntake,
  type TreatmentExtras,
} from '../src/db/treatment-schedule';
import type { Treatment } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type TreatmentDraft = {
  id: string | null;
  name: string;
  dose: string;
  createdAt: number | null;
  times: string[];
  timeInput: string;
  startDate: string;
  endDate: string; // '' = durée indéterminée
  reminderEnabled: boolean;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TIME_PRESETS = [
  { label: 'Matin', time: '08:00' },
  { label: 'Midi', time: '12:00' },
  { label: 'Soir', time: '20:00' },
  { label: 'Coucher', time: '22:00' },
];

const DURATION_PRESETS = [
  { label: '7 j', days: 7 },
  { label: '14 j', days: 14 },
  { label: '1 mois', days: 30 },
  { label: '3 mois', days: 90 },
];

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

function addDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + count);
  return localDay(date);
}

function diffDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86400000);
}

function formatDayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

function formatLongDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

function timeSlotLabel(time: string) {
  const hour = Number(time.slice(0, 2));

  if (hour < 11) {
    return 'Matin';
  }

  if (hour < 14) {
    return 'Midi';
  }

  if (hour < 18) {
    return 'Après-midi';
  }

  return 'Soir';
}

function isActiveOn(day: string, extras: TreatmentExtras) {
  if (extras.startDate && day < extras.startDate) {
    return false;
  }

  if (extras.endDate && day > extras.endDate) {
    return false;
  }

  return true;
}

function periodLabel(extras: TreatmentExtras, today: string) {
  const { startDate, endDate } = extras;

  if (startDate && endDate) {
    const total = diffDays(startDate, endDate) + 1;

    if (today < startDate) {
      return `Du ${formatLongDay(startDate)} au ${formatLongDay(endDate)} · débute dans ${diffDays(today, startDate)} j`;
    }

    if (today > endDate) {
      return `Terminé le ${formatLongDay(endDate)}`;
    }

    return `Du ${formatLongDay(startDate)} au ${formatLongDay(endDate)} · jour ${diffDays(startDate, today) + 1}/${total}`;
  }

  if (startDate) {
    return today < startDate
      ? `Débute le ${formatLongDay(startDate)}`
      : `Depuis le ${formatLongDay(startDate)} · durée indéterminée`;
  }

  return null;
}

function createDraft(treatment: Treatment | null, extras: TreatmentExtras | null): TreatmentDraft {
  return {
    id: treatment?.id ?? null,
    name: treatment?.name ?? '',
    dose: treatment?.dose ?? '',
    createdAt: treatment?.createdAt ?? null,
    times: extras?.times?.length ? [...extras.times] : [DEFAULT_TIME],
    timeInput: '',
    startDate: extras?.startDate ?? localDay(),
    endDate: extras?.endDate ?? '',
    reminderEnabled: extras?.reminderEnabled ?? false,
  };
}

export default function TraitementScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [extrasMap, setExtrasMap] = useState<Map<string, TreatmentExtras>>(new Map());
  const [draft, setDraft] = useState<TreatmentDraft | null>(null);

  const fetchAll = useCallback(async () => {
    await ensureScheduleTables(db);

    const nextTreatments = await listTreatments(db);

    for (const treatment of nextTreatments) {
      await migrateLegacyTreatment(db, {
        treatmentId: treatment.id,
        takenDays: treatment.takenDays ?? [],
      });
    }

    const nextExtras = await getExtrasMap(db);

    return { nextTreatments, nextExtras };
  }, [db]);

  const loadData = useCallback(async () => {
    const { nextTreatments, nextExtras } = await fetchAll();
    setTreatments(nextTreatments);
    setExtrasMap(nextExtras);
  }, [fetchAll]);

  const refresh = useCallback(() => {
    let active = true;

    void fetchAll().then(({ nextTreatments, nextExtras }) => {
      if (!active) {
        return;
      }

      setTreatments(nextTreatments);
      setExtrasMap(nextExtras);
    });

    return () => {
      active = false;
    };
  }, [fetchAll]);

  useFocusEffect(refresh);

  const todayKey = localDay();
  const lastThirtyDays = useMemo(() => buildDayRange(30), []);
  const lastSevenDays = useMemo(() => lastThirtyDays.slice(-7), [lastThirtyDays]);
  const hasTreatments = treatments.length > 0;

  const updateDraft = (updater: (current: TreatmentDraft) => TreatmentDraft) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const handleToggleTime = (time: string) => {
    updateDraft((current) => ({
      ...current,
      times: current.times.includes(time)
        ? current.times.filter((value) => value !== time)
        : [...current.times, time].sort(),
    }));
  };

  const handleAddCustomTime = () => {
    updateDraft((current) => {
      const value = current.timeInput.trim();

      if (!TIME_RE.test(value)) {
        return current;
      }

      if (current.times.includes(value)) {
        return { ...current, timeInput: '' };
      }

      return { ...current, times: [...current.times, value].sort(), timeInput: '' };
    });
  };

  const handlePickDuration = (days: number | null) => {
    updateDraft((current) => {
      if (days === null) {
        return { ...current, endDate: '' };
      }

      const base = DATE_RE.test(current.startDate) ? current.startDate : localDay();

      return { ...current, startDate: base, endDate: addDays(base, days - 1) };
    });
  };

  const handleSave = async () => {
    if (!draft || (!draft.name.trim() && !draft.dose.trim())) {
      return;
    }

    const times = [...new Set(draft.times.filter((time) => TIME_RE.test(time)))].sort();

    if (times.length === 0) {
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

    const treatmentId = (saved as Treatment).id ?? draft.id;

    if (!treatmentId) {
      return;
    }

    const startDate = DATE_RE.test(draft.startDate) ? draft.startDate : null;
    let endDate = DATE_RE.test(draft.endDate) ? draft.endDate : null;

    if (startDate && endDate && endDate < startDate) {
      endDate = startDate;
    }

    await saveSchedule(db, {
      treatmentId,
      times,
      startDate,
      endDate,
      reminderEnabled: draft.reminderEnabled,
    });

    setDraft(null);
    await loadData();
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deleteSchedule(db, draft.id);
    await deleteTreatment(db, draft.id);
    setDraft(null);
    await loadData();
  };

  const handleToggleIntake = async (treatmentId: string, day: string, time: string) => {
    await toggleIntake(db, { treatmentId, day, time });
    setExtrasMap(await getExtrasMap(db));
  };

  const handleToggleFullDay = async (
    treatmentId: string,
    day: string,
    times: string[],
    taken: boolean,
  ) => {
    await setDayIntakes(db, { treatmentId, day, times, taken });
    setExtrasMap(await getExtrasMap(db));
  };

  if (draft) {
    const hasValidTimeInput = TIME_RE.test(draft.timeInput.trim());

    return (
      <AppShell kicker="Observance" title={draft.id ? 'Modifier le traitement' : 'Ajouter un traitement'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour au suivi</Text>
        </Pressable>

        <View style={styles.editorCard}>
          <TextInput
            onChangeText={(value) => updateDraft((current) => ({ ...current, name: value }))}
            placeholder="Nom du traitement"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.name}
          />
          <TextInput
            onChangeText={(value) => updateDraft((current) => ({ ...current, dose: value }))}
            placeholder="Dosage, ex. 75 ug ou 1 comprimé"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.dose}
          />

          <Text style={styles.fieldLabel}>Prises quotidiennes</Text>
          <View style={styles.chipRowWrap}>
            {TIME_PRESETS.map((preset) => {
              const selected = draft.times.includes(preset.time);

              return (
                <Pressable
                  key={preset.time}
                  onPress={() => handleToggleTime(preset.time)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>
                    {preset.label} · {preset.time}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {draft.times.length > 0 ? (
            <View style={styles.chipRowWrap}>
              {draft.times.map((time) => (
                <Pressable key={time} onPress={() => handleToggleTime(time)} style={styles.timeChip}>
                  <Text style={styles.timeChipLabel}>
                    {timeSlotLabel(time)} · {time}
                  </Text>
                  <Text style={styles.timeChipRemove}>✕</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>Ajoute au moins un horaire de prise.</Text>
          )}

          <View style={styles.inlineRow}>
            <TextInput
              keyboardType="numbers-and-punctuation"
              onChangeText={(value) => updateDraft((current) => ({ ...current, timeInput: value }))}
              onSubmitEditing={handleAddCustomTime}
              placeholder="Autre horaire, ex. 09:30"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.inlineInput]}
              value={draft.timeInput}
            />
            <Pressable
              disabled={!hasValidTimeInput}
              onPress={handleAddCustomTime}
              style={[styles.secondaryButton, !hasValidTimeInput && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonLabel}>Ajouter</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Durée du traitement</Text>
          <View style={styles.inlineRow}>
            <TextInput
              keyboardType="numbers-and-punctuation"
              onChangeText={(value) => updateDraft((current) => ({ ...current, startDate: value }))}
              placeholder="Début AAAA-MM-JJ"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.inlineInput]}
              value={draft.startDate}
            />
            <TextInput
              keyboardType="numbers-and-punctuation"
              onChangeText={(value) => updateDraft((current) => ({ ...current, endDate: value }))}
              placeholder="Fin (optionnel)"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.inlineInput]}
              value={draft.endDate}
            />
          </View>
          <View style={styles.chipRowWrap}>
            {DURATION_PRESETS.map((preset) => {
              const base = DATE_RE.test(draft.startDate) ? draft.startDate : localDay();
              const selected = draft.endDate === addDays(base, preset.days - 1);

              return (
                <Pressable
                  key={preset.label}
                  onPress={() => handlePickDuration(preset.days)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>{preset.label}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => handlePickDuration(null)}
              style={[styles.chip, draft.endDate === '' && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, draft.endDate === '' && styles.chipLabelActive]}>Continu</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Rappels</Text>
          <View style={styles.chipRow}>
            <Pressable
              onPress={() => updateDraft((current) => ({ ...current, reminderEnabled: true }))}
              style={[styles.chip, draft.reminderEnabled && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, draft.reminderEnabled && styles.chipLabelActive]}>Activés</Text>
            </Pressable>
            <Pressable
              onPress={() => updateDraft((current) => ({ ...current, reminderEnabled: false }))}
              style={[styles.chip, !draft.reminderEnabled && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, !draft.reminderEnabled && styles.chipLabelActive]}>Désactivés</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>Un rappel par horaire de prise, chaque jour de la période.</Text>

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
        subtitle="Plusieurs traitements, plusieurs prises par jour, durée définie ou continue, rappels par traitement."
      />

      <Pressable onPress={() => setDraft(createDraft(null, null))} style={styles.addButton}>
        <Text style={styles.addButtonLabel}>+ Ajouter un traitement</Text>
      </Pressable>

      {!hasTreatments ? (
        <EmptyState
          title="Aucun traitement"
          message="Ajoute un traitement pour définir ses prises (matin, midi, soir…), sa durée et suivre l'observance jour par jour."
        />
      ) : (
        treatments.map((treatment) => {
          const extras = extrasMap.get(treatment.id) ?? emptyExtras();
          const activeToday = isActiveOn(todayKey, extras);
          const takenToday = extras.times.filter((time) =>
            extras.intakes.has(intakeKey(todayKey, time)),
          ).length;

          const activeDays30 = lastThirtyDays
            .map((date) => localDay(date))
            .filter((day) => isActiveOn(day, extras));
          const expected30 = activeDays30.length * extras.times.length;
          const taken30 = activeDays30.reduce(
            (acc, day) =>
              acc + extras.times.filter((time) => extras.intakes.has(intakeKey(day, time))).length,
            0,
          );
          const observance30 = expected30 > 0 ? Math.round((taken30 / expected30) * 100) : 0;

          const lastIntake = [...extras.intakes].sort().pop() ?? null;
          const period = periodLabel(extras, todayKey);

          return (
            <View key={treatment.id} style={styles.treatmentCard}>
              <View style={styles.treatmentHeader}>
                <View style={styles.treatmentTitleBlock}>
                  <Text style={styles.treatmentTitle}>{treatment.name || 'Traitement'}</Text>
                  {treatment.dose ? <Text style={styles.treatmentDose}>{treatment.dose}</Text> : null}
                  {period ? <Text style={styles.periodMeta}>{period}</Text> : null}
                </View>
                <Pressable onPress={() => setDraft(createDraft(treatment, extras))} style={styles.editChip}>
                  <Text style={styles.editChipLabel}>Modifier</Text>
                </Pressable>
              </View>

              <Text style={styles.progressLabel}>
                Aujourd'hui · {takenToday}/{extras.times.length} prise{extras.times.length > 1 ? 's' : ''}
              </Text>
              {activeToday ? (
                <View style={styles.intakeRow}>
                  {extras.times.map((time) => {
                    const taken = extras.intakes.has(intakeKey(todayKey, time));

                    return (
                      <Pressable
                        key={time}
                        onPress={() => handleToggleIntake(treatment.id, todayKey, time)}
                        style={[styles.intakeChip, taken && styles.intakeChipActive]}
                      >
                        <Text style={[styles.intakeChipSlot, taken && styles.intakeChipTextActive]}>
                          {timeSlotLabel(time)}
                        </Text>
                        <Text style={[styles.intakeChipTime, taken && styles.intakeChipTextActive]}>
                          {time}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.periodNotice}>Hors période de traitement aujourd'hui.</Text>
              )}

              <View style={styles.progressCard}>
                <Text style={styles.progressLabel}>
                  Observance sur 30 jours · {taken30}/{expected30 || 0} prises
                </Text>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${observance30}%`, backgroundColor: colors.accent }]}
                  />
                </View>
              </View>

              <View style={styles.weekRow}>
                {lastSevenDays.map((date) => {
                  const day = localDay(date);
                  const dayActive = isActiveOn(day, extras);
                  const dayTaken = extras.times.filter((time) =>
                    extras.intakes.has(intakeKey(day, time)),
                  ).length;
                  const complete = dayActive && extras.times.length > 0 && dayTaken === extras.times.length;

                  return (
                    <Pressable
                      disabled={!dayActive}
                      key={day}
                      onPress={() => handleToggleFullDay(treatment.id, day, extras.times, !complete)}
                      style={[
                        styles.dayChip,
                        complete && styles.dayChipActive,
                        !dayActive && styles.dayChipDisabled,
                      ]}
                    >
                      <Text style={[styles.dayChipWeekLabel, complete && styles.dayChipWeekLabelActive]}>
                        {date.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 1).toUpperCase()}
                      </Text>
                      <Text style={[styles.dayChipLabel, complete && styles.dayChipLabelActive]}>
                        {date.getDate()}
                      </Text>
                      <Text style={[styles.dayChipCount, complete && styles.dayChipWeekLabelActive]}>
                        {dayActive ? `${dayTaken}/${extras.times.length}` : '—'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Dernière prise</Text>
                <Text style={styles.summaryValue}>
                  {lastIntake
                    ? `${formatDayLabel(lastIntake.split('|')[0])} · ${lastIntake.split('|')[1]}`
                    : 'Aucune'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Rappels</Text>
                <Text style={styles.summaryValue}>
                  {extras.reminderEnabled ? extras.times.join(' · ') : 'Désactivés'}
                </Text>
              </View>
            </View>
          );
        })
      )}
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
    helperText: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13,
    },
    chipRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    chipRowWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    inlineRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    inlineInput: {
      flex: 1,
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
    timeChip: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.pill,
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    timeChipLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    timeChipRemove: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    buttonDisabled: {
      opacity: 0.4,
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
    periodMeta: {
      color: colors.accent,
      fontFamily: fonts.bodySemi,
      fontSize: 13,
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
    intakeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    intakeChip: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      gap: 2,
      minWidth: 84,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    intakeChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    intakeChipSlot: {
      color: colors.muted,
      fontFamily: fonts.mono,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    intakeChipTime: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 16,
    },
    intakeChipTextActive: {
      color: colors.white,
    },
    periodNotice: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
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
    dayChipDisabled: {
      opacity: 0.35,
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
    dayChipCount: {
      color: colors.muted,
      fontFamily: fonts.mono,
      fontSize: 10,
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
  });
