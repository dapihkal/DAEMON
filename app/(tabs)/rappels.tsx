import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../../src/components/app-shell';
import { DateField } from '../../src/components/date-field';
import { EmptyState } from '../../src/components/empty-state';
import { PeoplePicker } from '../../src/components/people-picker';
import { SectionTitle } from '../../src/components/section-title';
import { SwipeActionRow } from '../../src/components/swipe-action-row';
import { useUndo } from '../../src/components/undo-toast';
import { replaceEntityPersonLinks, listEntityPersonIds } from '../../src/db/cross-repositories';
import {
  deleteReminder,
  listObjectives,
  listReminders,
  listRoutines,
  markReminderDone,
  restoreReminder,
  saveReminder,
  setReminderNotificationId,
  setRoutineEnabled,
  setRoutineTime,
} from '../../src/db/repositories';
import type { Reminder, Routine } from '../../src/db/types';
import { buildReminderPresets, formatDateTime } from '../../src/lib/date';
import { syncAllObjectiveDeadlineRemindersAsync } from '../../src/lib/objective-deadline-reminders';
import { confirmationHaptic, deletionHaptic, selectionHaptic, toggleHaptic } from '../../src/lib/haptics';
import {
  cancelReminderNotificationAsync,
  ensureLocalNotificationPermissionAsync,
  scheduleReminderNotificationAsync,
  syncRoutineNotificationsAsync,
} from '../../src/lib/notifications';
import { useTheme, useThemePreferences } from '../../src/theme/theme-provider';
import { fonts, radii, spacing } from '../../src/theme/tokens';
import { useThemedStyles } from '../../src/theme/use-themed-styles';

const repeatRuleLabels: Record<Reminder['repeatRule'], string | null> = {
  none: null,
  daily: 'Chaque jour',
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
  yearly: 'Chaque année',
};

const categoryLabels: Record<Reminder['category'], string | null> = {
  rappel: null,
  famille: 'Famille',
  amis: 'Amis',
  date: 'Date',
  loyer: 'Loyer',
  rdv: 'RDV',
  pro: 'Pro',
  medicament: 'Médicament',
  autre: 'Autre',
};

type ReminderDraft = {
  id: string | null;
  title: string;
  scheduledFor: string;
  timeText: string;
  repeatRule: Reminder['repeatRule'];
  category: Reminder['category'];
  status: Reminder['status'];
  notificationId: string | null;
  people: string[];
};

function createEmptyDraft(defaultDate: string): ReminderDraft {
  return {
    id: null,
    title: '',
    scheduledFor: defaultDate,
    timeText: getDraftTime(defaultDate),
    repeatRule: 'none',
    category: 'rappel',
    status: 'scheduled',
    notificationId: null,
    people: [],
  };
}

function toDraft(reminder: Reminder, people: string[] = []): ReminderDraft {
  return {
    id: reminder.id,
    title: reminder.title,
    scheduledFor: reminder.scheduledFor,
    timeText: getDraftTime(reminder.scheduledFor),
    repeatRule: reminder.repeatRule,
    category: reminder.category,
    status: reminder.status,
    notificationId: reminder.notificationId,
    people,
  };
}

function getDraftDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getDraftTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '12:00';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function composeDraftDateTime(day: string, time: string) {
  const [year, month, dateNum] = day.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const localDate = new Date(year, month - 1, dateNum, hours || 0, minutes || 0, 0, 0);
  return localDate.toISOString();
}

export default function RemindersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const { showUndo } = useUndo();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ reminderId?: string; add?: string; date?: string }>();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineDraftTimes, setRoutineDraftTimes] = useState<Record<Routine['key'], string>>({
    treatment: '08:00',
    mood: '21:30',
  });
  const [focusedReminderId, setFocusedReminderId] = useState<string | null>(null);
  const presets = useMemo(() => buildReminderPresets(), []);
  const [draft, setDraft] = useState<ReminderDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const nextObjectives = await listObjectives(db);
      await syncAllObjectiveDeadlineRemindersAsync(db, nextObjectives);

      const [nextReminders, nextRoutines] = await Promise.all([
        listReminders(db),
        listRoutines(db),
      ]);

      if (!active) {
        return;
      }

      setReminders(nextReminders);
      setRoutines(nextRoutines);
      setRoutineDraftTimes({
        treatment: nextRoutines.find((routine) => routine.key === 'treatment')?.time ?? '08:00',
        mood: nextRoutines.find((routine) => routine.key === 'mood')?.time ?? '21:30',
      });

      if (typeof params.reminderId === 'string') {
        const targetReminder = nextReminders.find((reminder) => reminder.id === params.reminderId) ?? null;
        if (targetReminder) {
          const linkedPersonIds = await listEntityPersonIds(db, { entityKind: 'reminder', entityId: targetReminder.id });
          setFocusedReminderId(targetReminder.id);
          setDraft(toDraft(targetReminder, linkedPersonIds));
        }
        router.replace('/rappels');
      } else if (params.add === 'true') {
        const initialDate = params.date && !Number.isNaN(new Date(params.date).getTime()) 
          ? params.date 
          : new Date().toISOString().slice(0, 10);
        setDraft(createEmptyDraft(initialDate));
        router.replace('/rappels');
      }
    })();

    return () => {
      active = false;
    };
  }, [db, params.reminderId, router]);

  useFocusEffect(refresh);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const overdueReminders = reminders.filter(
    (reminder) => reminder.status === 'scheduled' && new Date(reminder.scheduledFor).getTime() < startOfToday.getTime(),
  );
  const todayReminders = reminders.filter((reminder) => {
    if (reminder.status !== 'scheduled') {
      return false;
    }

    const reminderTime = new Date(reminder.scheduledFor).getTime();
    return reminderTime >= startOfToday.getTime() && reminderTime <= endOfToday.getTime();
  });
  const upcomingReminders = reminders.filter(
    (reminder) => reminder.status === 'scheduled' && new Date(reminder.scheduledFor).getTime() > endOfToday.getTime(),
  );
  const doneReminders = reminders.filter((reminder) => reminder.status === 'done');

  const syncReminderNotification = async (reminder: Reminder) => {
    await cancelReminderNotificationAsync(reminder.notificationId);

    if (reminder.status !== 'scheduled') {
      await setReminderNotificationId(db, {
        reminderId: reminder.id,
        notificationId: null,
      });
      return;
    }

    const hasPermission = await ensureLocalNotificationPermissionAsync();
    if (!hasPermission) {
      await setReminderNotificationId(db, {
        reminderId: reminder.id,
        notificationId: null,
      });
      return;
    }

    const notificationId = await scheduleReminderNotificationAsync({
      reminderId: reminder.id,
      title: reminder.title,
      scheduledFor: reminder.scheduledFor,
    });

    await setReminderNotificationId(db, {
      reminderId: reminder.id,
      notificationId,
    });
  };

  const handleSaveReminder = async () => {
    if (!draft?.title.trim()) {
      return;
    }

    let targetTime = draft.timeText;
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(targetTime)) {
      targetTime = '12:00';
    }

    const finalScheduledFor = composeDraftDateTime(getDraftDay(draft.scheduledFor), targetTime);

    const reminder = await saveReminder(db, {
      id: draft.id ?? undefined,
      title: draft.title,
      scheduledFor: finalScheduledFor,
      repeatRule: draft.repeatRule,
      category: draft.category,
      status: draft.status,
      notificationId: draft.notificationId,
    });

    await replaceEntityPersonLinks(db, {
      entityKind: 'reminder',
      entityId: reminder.id,
      personIds: draft.people,
    });

    await syncReminderNotification(reminder);
    await confirmationHaptic(preferences.reduceMotion);
    setDraft(null);
    setReminders(await listReminders(db));
  };

  const deleteReminderWithUndo = async (reminder: Reminder) => {
    await cancelReminderNotificationAsync(reminder.notificationId);
    await deleteReminder(db, reminder.id);
    showUndo({
      message: `Rappel « ${reminder.title} » supprimé`,
      onUndo: async () => {
        await restoreReminder(db, reminder);
        const restored = { ...reminder, notificationId: null };
        if (restored.status === 'scheduled') {
          await syncReminderNotification(restored);
        }
        setReminders(await listReminders(db));
      },
    });
  };

  const handleQuickPostpone = async (reminder: Reminder, target: 'hour' | 'tonight' | 'tomorrow') => {
    const now = new Date();
    let nextDate: Date;

    if (target === 'hour') {
      nextDate = new Date(now.getTime() + 60 * 60 * 1000);
    } else if (target === 'tonight') {
      nextDate = new Date(now);
      nextDate.setHours(20, 0, 0, 0);
      if (nextDate.getTime() <= now.getTime()) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
    } else {
      nextDate = new Date(now);
      nextDate.setDate(nextDate.getDate() + 1);
      nextDate.setHours(9, 0, 0, 0);
    }

    await cancelReminderNotificationAsync(reminder.notificationId);
    const saved = await saveReminder(db, {
      id: reminder.id,
      title: reminder.title,
      scheduledFor: nextDate.toISOString(),
      repeatRule: reminder.repeatRule,
      category: reminder.category,
      status: 'scheduled',
      notificationId: null,
    });

    await syncReminderNotification(saved);
    await confirmationHaptic(preferences.reduceMotion);
    setReminders(await listReminders(db));
  };

  const handleDeleteReminder = async () => {
    if (!draft?.id) {
      return;
    }

    await replaceEntityPersonLinks(db, {
      entityKind: 'reminder',
      entityId: draft.id,
      personIds: [],
    });

    const reminder = reminders.find((entry) => entry.id === draft.id);
    if (reminder) {
      await deleteReminderWithUndo(reminder);
    } else {
      await cancelReminderNotificationAsync(draft.notificationId);
      await deleteReminder(db, draft.id);
    }
    await deletionHaptic(preferences.reduceMotion);
    setDraft(null);
    setFocusedReminderId(null);
    setReminders(await listReminders(db));
  };

  const handleDone = async (reminder: Reminder) => {
    await cancelReminderNotificationAsync(reminder.notificationId);
    const updatedReminder = await markReminderDone(db, reminder.id);

    if (updatedReminder?.status === 'scheduled') {
      const hasPermission = await ensureLocalNotificationPermissionAsync();

      if (hasPermission) {
        const notificationId = await scheduleReminderNotificationAsync({
          reminderId: updatedReminder.id,
          title: updatedReminder.title,
          scheduledFor: updatedReminder.scheduledFor,
        });

        await setReminderNotificationId(db, {
          reminderId: updatedReminder.id,
          notificationId,
        });
      }
    }

    await confirmationHaptic(preferences.reduceMotion);
    setReminders(await listReminders(db));
  };

  const handleToggleRoutine = async (routine: Routine) => {
    const nextEnabled = !routine.enabled;
    await setRoutineEnabled(db, {
      key: routine.key,
      enabled: nextEnabled,
    });

    const nextRoutines = await listRoutines(db);
    await syncRoutineNotificationsAsync({
      routines: nextRoutines,
      requestPermission: nextRoutines.some((entry) => entry.enabled),
    });
    await toggleHaptic(nextEnabled, preferences.reduceMotion);
    setRoutines(nextRoutines);
  };

  const handleSaveRoutineTime = async (routine: Routine) => {
    const nextTime = routineDraftTimes[routine.key]?.trim() ?? '';
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(nextTime)) {
      return;
    }

    await setRoutineTime(db, {
      key: routine.key,
      time: nextTime,
    });

    const nextRoutines = await listRoutines(db);
    await syncRoutineNotificationsAsync({
      routines: nextRoutines,
      requestPermission: nextRoutines.some((entry) => entry.enabled),
    });
    setRoutines(nextRoutines);
  };

  const renderReminderRows = (items: Reminder[], options: { quickPostpone?: boolean } = {}) =>
    items.map((reminder) => (
      <SwipeActionRow
        actionKind={reminder.status === 'done' ? 'delete' : 'done'}
        actionLabel={reminder.status === 'done' ? 'Supprimer' : 'Terminer'}
        accessibilityLabel={`${reminder.status === 'done' ? 'Supprimer' : 'Terminer'} le rappel ${reminder.title}`}
        key={reminder.id}
        onAction={async () => {
          if (reminder.status === 'done') {
            await deleteReminderWithUndo(reminder);
            setReminders(await listReminders(db));
            return;
          }

          await handleDone(reminder);
        }}
      >
      <View style={[styles.reminderCard, focusedReminderId === reminder.id && styles.reminderCardFocused]}>
        <Pressable
          accessibilityLabel={`Modifier le rappel ${reminder.title}`}
          accessibilityRole="button"
          onPress={async () => {
            const linkedPersonIds = await listEntityPersonIds(db, { entityKind: 'reminder', entityId: reminder.id });
            await selectionHaptic(preferences.reduceMotion);
            setFocusedReminderId(reminder.id);
            setDraft(toDraft(reminder, linkedPersonIds));
          }}
          style={({ pressed }) => [styles.reminderCopy, pressed && styles.pressedSoft]}
        >
          <Text style={styles.reminderTitle}>{reminder.title}</Text>
          <Text style={styles.reminderMeta}>
            {[
              formatDateTime(reminder.scheduledFor),
              categoryLabels[reminder.category],
              repeatRuleLabels[reminder.repeatRule],
              reminder.status === 'done' ? 'terminé' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {focusedReminderId === reminder.id ? <Text style={styles.focusedMeta}>Ouvert depuis la recherche</Text> : null}
          {options.quickPostpone && reminder.status === 'scheduled' ? (
            <View style={styles.snoozeRow}>
              {([
                { target: 'hour', label: '+1 h' },
                { target: 'tonight', label: 'Ce soir' },
                { target: 'tomorrow', label: 'Demain 9h' },
              ] as const).map((option) => (
                <Pressable
                  accessibilityLabel={`Reporter ${reminder.title} : ${option.label}`}
                  accessibilityRole="button"
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  key={option.target}
                  onPress={() => handleQuickPostpone(reminder, option.target)}
                  style={({ pressed }) => [styles.snoozeChip, pressed && styles.pressedSoft]}
                >
                  <Text style={styles.snoozeChipLabel}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityLabel={`${reminder.status === 'done' ? 'Rappel déjà terminé' : 'Terminer le rappel'} ${reminder.title}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: reminder.status === 'done' }}
          disabled={reminder.status === 'done'}
          onPress={() => handleDone(reminder)}
          style={({ pressed }) => [styles.doneButton, reminder.status === 'done' && styles.doneButtonMuted, pressed && styles.pressedSoft]}
        >
          <Text style={[styles.doneButtonLabel, reminder.status === 'done' && styles.doneButtonLabelMuted]}>
            {reminder.status === 'done' ? 'Fait' : 'Terminer'}
          </Text>
        </Pressable>
      </View>
      </SwipeActionRow>
    ));

  if (draft) {
    const adjustTime = (minutesToAdding: number) => {
      setDraft((current) => {
        if (!current) return null;
        let targetTime = current.timeText;
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(targetTime)) {
          targetTime = '12:00';
        }
        const [hours, minutes] = targetTime.split(':').map(Number);
        const tempDate = new Date();
        tempDate.setHours(hours || 0, minutes || 0, 0, 0);
        tempDate.setTime(tempDate.getTime() + minutesToAdding * 60 * 1000);
        const pad = (n: number) => String(n).padStart(2, '0');
        const nextTimeText = `${pad(tempDate.getHours())}:${pad(tempDate.getMinutes())}`;
        return {
          ...current,
          timeText: nextTimeText,
          scheduledFor: composeDraftDateTime(getDraftDay(current.scheduledFor), nextTimeText),
        };
      });
    };

    return (
      <AppShell kicker="Local notifications" title={draft.id ? 'Modifier le rappel' : 'Nouveau rappel'}>
        <Pressable accessibilityLabel="Retour aux rappels" accessibilityRole="button" onPress={() => setDraft(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour aux rappels</Text>
        </Pressable>

        <View style={styles.composerCard}>
          <Text style={styles.composerTitle}>Rappel</Text>
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, title: value } : current))}
            placeholder="Ex. appeler, acheter, valider"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.title}
          />

          <DateField
            label="Date du rappel"
            onChange={(value) =>
              setDraft((current) =>
                current
                  ? { ...current, scheduledFor: composeDraftDateTime(value, current.timeText) }
                  : current
              )
            }
            value={getDraftDay(draft.scheduledFor)}
          />

          <Text style={styles.fieldLabel}>Heure du rappel</Text>
          <View style={styles.timePickerContainer}>
            <Pressable accessibilityLabel="Retirer une heure" accessibilityRole="button" onPress={() => adjustTime(-60)} style={styles.timeAdjustButton}>
              <Text style={styles.timeAdjustButtonText}>-1h</Text>
            </Pressable>
            <Pressable accessibilityLabel="Retirer cinq minutes" accessibilityRole="button" onPress={() => adjustTime(-5)} style={styles.timeAdjustButton}>
              <Text style={styles.timeAdjustButtonText}>-5m</Text>
            </Pressable>

            <TextInput
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              onChangeText={(value) => {
                setDraft((current) => {
                  if (!current) return null;
                  const nextDraft = { ...current, timeText: value };
                  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
                    nextDraft.scheduledFor = composeDraftDateTime(getDraftDay(current.scheduledFor), value);
                  }
                  return nextDraft;
                });
              }}
              placeholder="12:00"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.timeInput]}
              value={draft.timeText}
            />

            <Pressable accessibilityLabel="Ajouter cinq minutes" accessibilityRole="button" onPress={() => adjustTime(5)} style={styles.timeAdjustButton}>
              <Text style={styles.timeAdjustButtonText}>+5m</Text>
            </Pressable>
            <Pressable accessibilityLabel="Ajouter une heure" accessibilityRole="button" onPress={() => adjustTime(60)} style={styles.timeAdjustButton}>
              <Text style={styles.timeAdjustButtonText}>+1h</Text>
            </Pressable>
          </View>

          <View style={styles.timePresetsRow}>
            {['08:00', '12:00', '14:00', '18:00', '20:00', '22:00'].map((time) => {
              const selected = draft.timeText === time;
              return (
                <Pressable
                  key={time}
                  accessibilityLabel={`Choisir l heure ${time}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setDraft((current) => {
                      if (!current) return null;
                      return {
                        ...current,
                        timeText: time,
                        scheduledFor: composeDraftDateTime(getDraftDay(current.scheduledFor), time),
                      };
                    });
                  }}
                  style={[styles.timePresetChip, selected && styles.timePresetChipActive]}
                >
                  <Text style={[styles.timePresetChipLabel, selected && styles.timePresetChipLabelActive]}>{time}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.selectedLabel}>Declenchement: {formatDateTime(draft.scheduledFor)}</Text>

          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.presetRow}>
            {Object.entries(categoryLabels).map(([category, label]) => {
              const selected = draft.category === category;
              return (
                <Pressable
                  key={category}
                  accessibilityLabel={`Type de rappel ${label ?? 'Rappel'}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setDraft((current) => (current ? { ...current, category: category as Reminder['category'] } : current))}
                  style={[styles.presetChip, selected && styles.presetChipActive]}
                >
                  <Text style={[styles.presetChipLabel, selected && styles.presetChipLabelActive]}>{label ?? 'Rappel'}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Recurrence</Text>
          <View style={styles.presetRow}>
            {Object.entries(repeatRuleLabels).map(([rule, label]) => {
              const selected = draft.repeatRule === rule;
              return (
                <Pressable
                  key={rule}
                  accessibilityLabel={`Recurrence ${label ?? 'Une fois'}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setDraft((current) => (current ? { ...current, repeatRule: rule as Reminder['repeatRule'], status: 'scheduled' } : current))}
                  style={[styles.presetChip, selected && styles.presetChipActive]}
                >
                  <Text style={[styles.presetChipLabel, selected && styles.presetChipLabelActive]}>{label ?? 'Une fois'}</Text>
                </Pressable>
              );
            })}
          </View>

          {draft.category === 'rdv' ? (
            <PeoplePicker
              entityKind="reminder"
              entityId={draft.id}
              selectedIds={draft.people}
              onChange={(people) => setDraft((current) => (current ? { ...current, people } : current))}
            />
          ) : null}

          <View style={styles.buttonRow}>
            <Pressable accessibilityLabel="Enregistrer le rappel" accessibilityRole="button" onPress={handleSaveReminder} style={styles.primaryButtonWide}>
              <Text style={styles.primaryButtonLabel}>Enregistrer</Text>
            </Pressable>
            {draft.id ? (
              <Pressable accessibilityLabel="Supprimer le rappel" accessibilityRole="button" onPress={handleDeleteReminder} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonLabel}>Supprimer</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell kicker="Local notifications" title="Rappels">
      <Pressable accessibilityLabel="Creer un nouveau rappel" accessibilityRole="button" onPress={() => setDraft(createEmptyDraft(presets[0]?.date.toISOString() ?? new Date().toISOString()))} style={styles.newReminderButton}>
        <Text style={styles.newReminderLabel}>+ Nouveau rappel</Text>
      </Pressable>

      <SectionTitle eyebrow="Routines" title="Automatismes utiles" />
      <View style={styles.routineList}>
        {routines.map((routine) => (
          <View key={routine.key} style={styles.routineCard}>
            <View style={styles.routineCopy}>
              <Text style={styles.routineTitle}>{routine.label}</Text>
              <Text style={styles.routineTime}>Chaque jour a {routine.time}</Text>
            </View>
            <View style={styles.routineControls}>
              <TextInput
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                onChangeText={(value) =>
                  setRoutineDraftTimes((current) => ({
                    ...current,
                    [routine.key]: value,
                  }))
                }
                onEndEditing={() => {
                  void handleSaveRoutineTime(routine);
                }}
                placeholder="08:00"
                placeholderTextColor={colors.muted}
                style={styles.routineTimeInput}
                value={routineDraftTimes[routine.key] ?? routine.time}
              />
              <Pressable accessibilityLabel={`Valider l heure de routine ${routine.label}`} accessibilityRole="button" onPress={() => handleSaveRoutineTime(routine)} style={styles.routineSaveButton}>
                <Text style={styles.routineSaveLabel}>OK</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`${routine.enabled ? 'Desactiver' : 'Activer'} ${routine.label}`}
                accessibilityRole="switch"
                accessibilityState={{ checked: routine.enabled }}
                onPress={() => handleToggleRoutine(routine)}
                style={[styles.toggle, routine.enabled && styles.toggleActive]}
              >
                <View style={[styles.toggleKnob, routine.enabled && styles.toggleKnobActive]} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {reminders.length ? (
        <View style={styles.reminderSections}>
          {overdueReminders.length ? (
            <View style={styles.reminderGroup}>
              <Text style={[styles.groupLabel, styles.groupLabelWarning]}>En retard</Text>
              {renderReminderRows(overdueReminders, { quickPostpone: true })}
            </View>
          ) : null}

          {todayReminders.length ? (
            <View style={styles.reminderGroup}>
              <Text style={styles.groupLabel}>Aujourd'hui</Text>
              {renderReminderRows(todayReminders, { quickPostpone: true })}
            </View>
          ) : null}

          {upcomingReminders.length ? (
            <View style={styles.reminderGroup}>
              <Text style={styles.groupLabel}>À venir</Text>
              {renderReminderRows(upcomingReminders)}
            </View>
          ) : null}

          {doneReminders.length ? (
            <View style={styles.reminderGroup}>
              <Text style={styles.groupLabel}>Terminés</Text>
              {renderReminderRows(doneReminders)}
            </View>
          ) : null}
        </View>
      ) : (
        <EmptyState title="Aucun rappel" message="Crée un rappel local pour suivre une échéance ou une routine." />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  composerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  composerTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 24,
  },
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
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  timePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timeAdjustButton: {
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    width: 46,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeAdjustButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  timeInput: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 18,
    height: 48,
    paddingVertical: 0,
  },
  timePresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: -spacing.xs,
  },
  timePresetChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  timePresetChipActive: {
    backgroundColor: colors.accent,
  },
  timePresetChipLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  timePresetChipLabelActive: {
    color: colors.white,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  presetChip: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  presetChipActive: {
    backgroundColor: colors.accent,
  },
  presetChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  presetChipLabelActive: {
    color: colors.white,
  },
  selectedLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  newReminderButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  newReminderLabel: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
  },
  primaryButtonWide: {
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
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  routineList: {
    gap: spacing.md,
  },
  reminderSections: {
    gap: spacing.lg,
  },
  reminderGroup: {
    gap: spacing.sm,
  },
  groupLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  groupLabelWarning: {
    color: colors.accent,
  },
  routineCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  routineCopy: {
    flex: 1,
    gap: 4,
  },
  routineTitle: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
  },
  routineTime: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  routineControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  routineTimeInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    minWidth: 74,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlign: 'center',
  },
  routineSaveButton: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  routineSaveLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  toggle: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: 58,
  },
  toggleActive: {
    backgroundColor: 'rgba(23, 107, 93, 0.20)',
  },
  toggleKnob: {
    backgroundColor: colors.white,
    borderRadius: 13,
    height: 26,
    width: 26,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
  },
  reminderCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minWidth: 0,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  reminderCardFocused: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  reminderCopy: {
    flex: 1,
    gap: 4,
    minHeight: 44,
    minWidth: 0,
    justifyContent: 'center',
  },
  reminderTitle: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
  },
  reminderMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  focusedMeta: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  snoozeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  snoozeChip: {
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  snoozeChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  doneButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  doneButtonMuted: {
    backgroundColor: colors.chip,
  },
  doneButtonLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  doneButtonLabelMuted: {
    color: colors.muted,
  },
  pressedSoft: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
});
