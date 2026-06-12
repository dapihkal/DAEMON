import type { SQLiteDatabase } from 'expo-sqlite';

import {
  deleteReminder,
  listReminders,
  saveReminder,
  setReminderNotificationId,
} from '../db/repositories';
import type { Person, Reminder } from '../db/types';
import {
  cancelReminderNotificationAsync,
  getLocalNotificationPermissionStatusAsync,
  scheduleReminderNotificationAsync,
} from './notifications';

const BIRTHDAY_REMINDER_PREFIX = 'birthday-';
const BIRTHDAY_REMINDER_OFFSETS = [7, 0] as const;

type BirthdayReminderOffset = (typeof BIRTHDAY_REMINDER_OFFSETS)[number];

type BirthdayReminderDraft = {
  id: string;
  title: string;
  scheduledFor: string;
};

type SyncBirthdayReminderOptions = {
  scheduleNotifications?: boolean;
};

function startOfLocalDay(value: Date) {
  const nextDate = new Date(value);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function getNextBirthdayDate(birthday: string) {
  if (!birthday.trim()) {
    return null;
  }

  const parts = birthday.trim().split('-').map(Number);
  const month = parts.length === 3 ? parts[1] : parts[0];
  const day = parts.length === 3 ? parts[2] : parts[1];

  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const today = startOfLocalDay(new Date());
  let next = new Date(today.getFullYear(), month - 1, day, 9, 0, 0, 0);
  if (startOfLocalDay(next).getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day, 9, 0, 0, 0);
  }

  return next;
}

function getBirthdayReminderIds(personId: string) {
  return BIRTHDAY_REMINDER_OFFSETS.map((offset) => `${BIRTHDAY_REMINDER_PREFIX}${personId}-${offset}`);
}

function getPersonIdFromBirthdayReminderId(reminderId: string) {
  if (!reminderId.startsWith(BIRTHDAY_REMINDER_PREFIX)) {
    return null;
  }

  for (const offset of BIRTHDAY_REMINDER_OFFSETS) {
    const suffix = `-${offset}`;
    if (reminderId.endsWith(suffix)) {
      return reminderId.slice(BIRTHDAY_REMINDER_PREFIX.length, -suffix.length);
    }
  }

  return null;
}

function offsetTitle(offset: BirthdayReminderOffset, name: string) {
  return offset === 0
    ? `Anniversaire de ${name} aujourd'hui !`
    : `Anniversaire de ${name} dans ${offset} jours`;
}

function buildBirthdayReminderDrafts(person: Person): BirthdayReminderDraft[] {
  const nextBirthday = getNextBirthdayDate(person.birthday);
  if (!nextBirthday) {
    return [];
  }

  return BIRTHDAY_REMINDER_OFFSETS.map((offset) => {
    const scheduledAt = new Date(nextBirthday);
    scheduledAt.setDate(scheduledAt.getDate() - offset);

    return {
      id: `${BIRTHDAY_REMINDER_PREFIX}${person.id}-${offset}`,
      title: offsetTitle(offset, person.name),
      scheduledFor: scheduledAt.toISOString(),
    };
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

export async function syncAllBirthdayRemindersAsync(
  db: SQLiteDatabase,
  people: Person[],
  options: SyncBirthdayReminderOptions = {},
) {
  const [existingReminders, notificationStatus] = await Promise.all([
    listReminders(db),
    getLocalNotificationPermissionStatusAsync(),
  ]);
  const canScheduleNotification = options.scheduleNotifications !== false && notificationStatus.granted;

  const today = startOfLocalDay(new Date());
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const draftsById = new Map<string, BirthdayReminderDraft>();

  for (const person of people) {
    for (const draft of buildBirthdayReminderDrafts(person)) {
      draftsById.set(draft.id, draft);
    }
  }

  let changedCount = 0;

  for (const reminder of existingReminders) {
    const personId = getPersonIdFromBirthdayReminderId(reminder.id);
    if (!personId) {
      continue;
    }

    const nextDraft = draftsById.get(reminder.id);
    if (!nextDraft || !peopleById.has(personId)) {
      await cancelReminderNotificationAsync(reminder.notificationId);
      await deleteReminder(db, reminder.id);
      changedCount += 1;
      draftsById.delete(reminder.id);
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

    if (
      reminder.title !== nextDraft.title ||
      reminder.scheduledFor !== nextDraft.scheduledFor ||
      reminder.status !== nextStatus
    ) {
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
    } else {
      await syncGeneratedReminderNotificationAsync(db, reminder, null, canScheduleNotification);
    }

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
