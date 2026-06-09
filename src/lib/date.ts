export function toIsoString(value: Date) {
  return value.toISOString();
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function isDue(value: string) {
  return new Date(value).getTime() <= Date.now();
}

export function advanceReminderDate(value: string, repeatRule: string) {
  const nextDate = new Date(value);

  if (Number.isNaN(nextDate.getTime()) || repeatRule === 'none') {
    return value;
  }

  if (repeatRule === 'daily') {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (repeatRule === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (repeatRule === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + 1);
  } else if (repeatRule === 'yearly') {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  }

  return nextDate.toISOString();
}

export function buildReminderPresets() {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

  const tonight = new Date(now);
  tonight.setHours(20, 0, 0, 0);
  if (tonight.getTime() <= now.getTime()) {
    tonight.setDate(tonight.getDate() + 1);
  }

  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(now.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  return [
    { label: 'Dans 1 h', date: inOneHour },
    { label: 'Ce soir 20:00', date: tonight },
    { label: 'Demain 09:00', date: tomorrowMorning },
  ];
}
