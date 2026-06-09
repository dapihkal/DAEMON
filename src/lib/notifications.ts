import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Routine } from '../db/types';
import { markReminderDone, postponeReminder } from '../db/repositories';

type NotificationsModule = typeof import('expo-notifications');
const routineNotificationIds: Record<Routine['key'], string> = {
  treatment: 'routine:treatment',
  mood: 'routine:mood',
};

export type LocalNotificationPermissionStatus = {
  supported: boolean;
  granted: boolean;
};

function getRoutineRoute(key: Routine['key']) {
  return key === 'treatment' ? '/traitement' : '/journal';
}

function getRoutineBody(key: Routine['key']) {
  return key === 'treatment'
    ? 'Pense a noter ton traitement du jour.'
    : 'Prends 30 secondes pour noter ton humeur du jour.';
}

function parseClockTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function isExpoGoAndroid() {
  return Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';
}

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (isExpoGoAndroid()) {
    return null;
  }

  const notifications = await import('expo-notifications');

  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  return notifications;
}

export async function configureNotificationsAsync() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Rappels Carnet',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#d26b4a',
      vibrationPattern: [0, 180, 120, 180],
    });
  }

  await Notifications.setNotificationCategoryAsync('reminder', [
    {
      identifier: 'doneReminder',
      buttonTitle: 'Fait',
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: 'postponeReminder',
      buttonTitle: 'Dans 1 Heure',
      options: {
        opensAppToForeground: false,
      },
    },
  ]);
}

export async function getLocalNotificationPermissionStatusAsync(): Promise<LocalNotificationPermissionStatus> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return {
      supported: false,
      granted: false,
    };
  }

  const current = await Notifications.getPermissionsAsync();

  return {
    supported: true,
    granted:
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
  };
}

export async function ensureLocalNotificationPermissionAsync() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }

  const next = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  return next.granted || next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function scheduleReminderNotificationAsync(input: {
  reminderId: string;
  title: string;
  scheduledFor: string;
}) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return null;
  }

  await configureNotificationsAsync();

  const targetDate = new Date(input.scheduledFor);
  if (targetDate.getTime() <= Date.now()) {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      categoryIdentifier: 'reminder',
      title: 'Carnet',
      body: input.title,
      data: {
        url: '/rappels',
        reminderId: input.reminderId,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: targetDate,
      channelId: 'default',
    },
  });
}

export async function cancelReminderNotificationAsync(notificationId: string | null) {
  const Notifications = await getNotificationsModule();
  if (!Notifications || !notificationId) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function cancelRoutineNotificationAsync(routineKey: Routine['key']) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return;
  }

  await Notifications.cancelScheduledNotificationAsync(routineNotificationIds[routineKey]);
}

export async function scheduleRoutineNotificationAsync(input: Routine) {
  const Notifications = await getNotificationsModule();
  if (!Notifications || !input.enabled) {
    return null;
  }

  await configureNotificationsAsync();

  const parsedTime = parseClockTime(input.time);
  if (!parsedTime) {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    identifier: routineNotificationIds[input.key],
    content: {
      title: 'Carnet',
      body: getRoutineBody(input.key),
      data: {
        url: getRoutineRoute(input.key),
        routineKey: input.key,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: parsedTime.hour,
      minute: parsedTime.minute,
      channelId: 'default',
    },
  });
}

export async function syncRoutineNotificationsAsync(input: {
  routines: Routine[];
  requestPermission?: boolean;
}) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return 0;
  }

  for (const routineKey of Object.keys(routineNotificationIds) as Routine['key'][]) {
    await Notifications.cancelScheduledNotificationAsync(routineNotificationIds[routineKey]);
  }

  const hasPermission = input.requestPermission
    ? await ensureLocalNotificationPermissionAsync()
    : (await getLocalNotificationPermissionStatusAsync()).granted;

  if (!hasPermission) {
    return 0;
  }

  let scheduledCount = 0;
  for (const routine of input.routines) {
    const notificationId = await scheduleRoutineNotificationAsync(routine);
    if (notificationId) {
      scheduledCount += 1;
    }
  }

  return scheduledCount;
}

export function useNotificationObserver(db: SQLiteDatabase | null) {
  useEffect(() => {
    let active = true;
    let subscription: { remove: () => void } | null = null;
    let didProcessLastResponse = false;

    const handleAction = async (response: any) => {
      if (!db || !active) return;
      const actionId = response.actionIdentifier;
      const reminderId = response.notification.request.content.data?.reminderId;

      if (reminderId && actionId === 'doneReminder') {
        const next = await markReminderDone(db, reminderId);
        if (next && next.status === 'scheduled') {
          const Notifications = await getNotificationsModule();
          if (Notifications) {
            const nextNotification = await scheduleReminderNotificationAsync({
              reminderId: next.id,
              title: next.title,
              scheduledFor: next.scheduledFor,
            });
            if (nextNotification) {
              await db.runAsync('UPDATE reminders SET notification_id = ? WHERE id = ?', nextNotification, next.id);
            }
          }
        }
      } else if (reminderId && actionId === 'postponeReminder') {
        const next = await postponeReminder(db, reminderId, 1);
        if (next) {
          const Notifications = await getNotificationsModule();
          if (Notifications) {
            const nextNotification = await scheduleReminderNotificationAsync({
              reminderId: next.id,
              title: next.title,
              scheduledFor: next.scheduledFor,
            });
            if (nextNotification) {
              await db.runAsync('UPDATE reminders SET notification_id = ? WHERE id = ?', nextNotification, next.id);
            }
          }
        }
      }
    };

    const redirectToRoute = (urlValue: unknown, actionIdentifier?: string) => {
      const isDefault = !actionIdentifier || actionIdentifier === 'expo.modules.notifications.actions.DEFAULT';
      if (typeof urlValue === 'string' && isDefault) {
        router.push(urlValue as '/rappels');
      }
    };

    void (async () => {
      const Notifications = await getNotificationsModule();
      if (!Notifications || !active) {
        return;
      }

      const response = await Notifications.getLastNotificationResponseAsync();
      if (active && response?.notification && !didProcessLastResponse) {
        didProcessLastResponse = true;
        await handleAction(response);
        redirectToRoute(response.notification.request.content.data?.url, response.actionIdentifier);
      }

      subscription = Notifications.addNotificationResponseReceivedListener(async (nextResponse) => {
        await handleAction(nextResponse);
        redirectToRoute(nextResponse.notification.request.content.data?.url, nextResponse.actionIdentifier);
      });
    })();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [db]);
}
