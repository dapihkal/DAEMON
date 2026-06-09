import type { SQLiteDatabase } from 'expo-sqlite';

import {
  deleteReminder,
  listReminders,
  saveReminder,
  setReminderNotificationId,
} from '../db/repositories';
import type { Objective, Reminder } from '../db/types';
import {
  cancelReminderNotificationAsync,
  getLocalNotificationPermissionStatusAsync,
  scheduleReminderNotificationAsync,
} from './notifications';

const DAY_MS = 24 * 60 * 60 * 1000;
const OBJECTIVE_DEADLINE_REMINDER_PREFIX = 'objective-deadline-';
const OBJECTIVE_DEADLINE_REMINDER_OFFSETS = [90, 30, 7, 1] as const;

type ObjectiveDeadlineReminderOffset = (typeof OBJECTIVE_DEADLINE_REMINDER_OFFSETS)[number];

type ObjectiveDeadlineReminderDraft = {
  id: string;
  title: string;
  scheduledFor: string;
};

type SyncObjectiveDeadlineReminderOptions = {
  scheduleNotifications?: boolean;
};

function dateFromDay(value: string, hour = 9) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(year, month - 1, day, hour, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function startOfLocalDay(value: Date) {
  const nextDate = new Date(value);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function offsetLabel(offset: ObjectiveDeadlineReminderOffset) {
  return offset === 1 ? 'demain' : `dans ${offset} jours`;
}

function getObjectiveDurationDays(objective: Objective, deadlineDate: Date) {
  const deadline = startOfLocalDay(deadlineDate);
  const rawCreatedAt = new Date(objective.createdAt);
  const createdAt = startOfLocalDay(Number.isNaN(rawCreatedAt.getTime()) ? new Date() : rawCreatedAt);
  return Math.floor((deadline.getTime() - createdAt.getTime()) / DAY_MS);
}

export function getObjectiveDeadlineReminderIds(objectiveId: string) {
  return OBJECTIVE_DEADLINE_REMINDER_OFFSETS.map((offset) => `${OBJECTIVE_DEADLINE_REMINDER_PREFIX}${objectiveId}-${offset}`);
}

function getObjectiveIdFromDeadlineReminderId(reminderId: string) {
  if (!reminderId.startsWith(OBJECTIVE_DEADLINE_REMINDER_PREFIX)) {
    return null;
  }

  for (const offset of OBJECTIVE_DEADLINE_REMINDER_OFFSETS) {
    const suffix = `-${offset}`;
    if (reminderId.endsWith(suffix)) {
      return reminderId.slice(OBJECTIVE_DEADLINE_REMINDER_PREFIX.length, -suffix.length);
    }
  }

  return null;
}

function buildObjectiveDeadlineReminderDrafts(objective: Objective): ObjectiveDeadlineReminderDraft[] {
  const deadlineDate = dateFromDay(objective.deadline);

  if (!deadlineDate || objective.progress >= 100) {
    return [];
  }

  const durationDays = getObjectiveDurationDays(objective, deadlineDate);

  return OBJECTIVE_DEADLINE_REMINDER_OFFSETS.flatMap((offset) => {
    if (durationDays < offset) {
      return [];
    }

    const scheduledAt = new Date(deadlineDate);
    scheduledAt.setDate(scheduledAt.getDate() - offset);

    return [
      {
        id: `${OBJECTIVE_DEADLINE_REMINDER_PREFIX}${objective.id}-${offset}`,
        title: `Objectif a echeance ${offsetLabel(offset)} : ${objective.title}`,
        scheduledFor: scheduledAt.toISOString(),
      },
    ];
  });
}

async function syncGeneratedReminderNotificationAsync(
  db: SQLiteDatabase,
  reminder: Reminder,
  previousNotificationId: string | null,
  canScheduleNotification: boolean,
) {
  if (previousNotificationId && previousNotificationId !== reminder.notificationId) {
    await cancelReminderNotificationAsync(previousNotificationId);
  }

  if (reminder.status !== 'scheduled' || !canScheduleNotification) {
    if (reminder.notificationId) {
      await cancelReminderNotificationAsync(reminder.notificationId);
      await setReminderNotificationId(db, {
        reminderId: reminder.id,
        notificationId: null,
      });
    }
    return;
  }

  if (reminder.notificationId) {
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
}

async function syncObjectiveDeadlineReminderRecordsAsync(
  db: SQLiteDatabase,
  objective: Objective,
  existingReminders: Reminder[],
  canScheduleNotification: boolean,
) {
  const today = startOfLocalDay(new Date());
  const generatedIds = new Set(getObjectiveDeadlineReminderIds(objective.id));
  const draftsById = new Map(buildObjectiveDeadlineReminderDrafts(objective).map((draft) => [draft.id, draft]));
  let changedCount = 0;

  for (const reminder of existingReminders) {
    if (!generatedIds.has(reminder.id)) {
      continue;
    }

    const nextDraft = draftsById.get(reminder.id);
    if (!nextDraft) {
      await cancelReminderNotificationAsync(reminder.notificationId);
      await deleteReminder(db, reminder.id);
      changedCount += 1;
      continue;
    }

    const canKeepStatus = reminder.scheduledFor === nextDraft.scheduledFor;
    const nextStatus = canKeepStatus ? reminder.status : 'scheduled';
    const canKeepNotification =
      canScheduleNotification &&
      reminder.notificationId &&
      reminder.title === nextDraft.title &&
      reminder.scheduledFor === nextDraft.scheduledFor &&
      nextStatus === 'scheduled';

    const savedReminder = await saveReminder(db, {
      id: nextDraft.id,
      title: nextDraft.title,
      scheduledFor: nextDraft.scheduledFor,
      notificationId: canKeepNotification ? reminder.notificationId : null,
      repeatRule: 'none',
      category: 'date',
      status: nextStatus,
    });

    await syncGeneratedReminderNotificationAsync(
      db,
      savedReminder,
      canKeepNotification ? null : reminder.notificationId,
      canScheduleNotification,
    );

    changedCount += 1;
    draftsById.delete(reminder.id);
  }

  for (const draft of draftsById.values()) {
    if (startOfLocalDay(new Date(draft.scheduledFor)).getTime() < today.getTime()) {
      continue;
    }

    const savedReminder = await saveReminder(db, {
      id: draft.id,
      title: draft.title,
      scheduledFor: draft.scheduledFor,
      notificationId: null,
      repeatRule: 'none',
      category: 'date',
      status: 'scheduled',
    });

    await syncGeneratedReminderNotificationAsync(db, savedReminder, null, canScheduleNotification);
    changedCount += 1;
  }

  return changedCount;
}

export async function syncObjectiveDeadlineRemindersAsync(
  db: SQLiteDatabase,
  objective: Objective,
  options: SyncObjectiveDeadlineReminderOptions = {},
) {
  const [existingReminders, notificationStatus] = await Promise.all([
    listReminders(db),
    getLocalNotificationPermissionStatusAsync(),
  ]);

  return syncObjectiveDeadlineReminderRecordsAsync(
    db,
    objective,
    existingReminders,
    options.scheduleNotifications !== false && notificationStatus.granted,
  );
}

export async function syncAllObjectiveDeadlineRemindersAsync(
  db: SQLiteDatabase,
  objectives: Objective[],
  options: SyncObjectiveDeadlineReminderOptions = {},
) {
  const [existingReminders, notificationStatus] = await Promise.all([
    listReminders(db),
    getLocalNotificationPermissionStatusAsync(),
  ]);
  const knownObjectiveIds = new Set(objectives.map((objective) => objective.id));
  const canScheduleNotification = options.scheduleNotifications !== false && notificationStatus.granted;
  let changedCount = 0;

  for (const objective of objectives) {
    changedCount += await syncObjectiveDeadlineReminderRecordsAsync(
      db,
      objective,
      existingReminders,
      canScheduleNotification,
    );
  }

  for (const reminder of existingReminders) {
    const objectiveId = getObjectiveIdFromDeadlineReminderId(reminder.id);
    if (!objectiveId || knownObjectiveIds.has(objectiveId)) {
      continue;
    }

    await cancelReminderNotificationAsync(reminder.notificationId);
    await deleteReminder(db, reminder.id);
    changedCount += 1;
  }

  return changedCount;
}

export async function clearObjectiveDeadlineRemindersAsync(db: SQLiteDatabase, objectiveId: string) {
  const existingReminders = await listReminders(db);
  const generatedIds = new Set(getObjectiveDeadlineReminderIds(objectiveId));

  for (const reminder of existingReminders) {
    if (!generatedIds.has(reminder.id)) {
      continue;
    }

    await cancelReminderNotificationAsync(reminder.notificationId);
    await deleteReminder(db, reminder.id);
  }
}