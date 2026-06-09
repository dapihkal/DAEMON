import * as SecureStore from 'expo-secure-store';

import type {
  AppAccent,
  AppDensity,
  AppHomeProfile,
  AppPreferences,
  AppPinRelockDelay,
  AppTextScale,
  AppThemeMode,
  HomeModuleId,
  HomeWidgetId,
} from '../db/types';
import { allHomeModuleIds, defaultHomeModuleOrder, defaultHomeWidgets } from './personalization';

export const PREFERENCES_KEY = 'carnet.preferences';
const CERCLE_LAYOUT_KEY = 'carnet.cercle.layout';
const CERCLE_CATEGORY_LABELS_KEY = 'carnet.cercle.categoryLabels';

export type StoredCercleLayout = Record<string, { x: number; y: number }>;
export type StoredCercleCategoryLabels = Record<string, string>;

export const defaultAppPreferences: AppPreferences = {
  theme: 'auto',
  accent: 'blue',
  density: 'comfortable',
  textScale: 'medium',
  reduceMotion: false,
  showSensitiveContent: true,
  homeProfile: 'custom',
  homeModules: defaultHomeModuleOrder,
  homeWidgets: defaultHomeWidgets,
  pinRelockDelay: 'immediate',
  lastBackupAt: null,
  backupMethod: 'local',
  useBiometrics: false,
  wipeDataAfterFailedAttempts: null,
};

function isThemeMode(value: unknown): value is AppThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark';
}

function isAccent(value: unknown): value is AppAccent {
  return value === 'blue' || value === 'aqua' || value === 'magenta' || value === 'amber' || value === 'lime';
}

function isDensity(value: unknown): value is AppDensity {
  return value === 'comfortable' || value === 'compact';
}

function isTextScale(value: unknown): value is AppTextScale {
  return value === 'small' || value === 'medium' || value === 'large';
}

function isHomeProfile(value: unknown): value is AppHomeProfile {
  return value === 'custom' || value === 'focus' || value === 'soir' || value === 'sante' || value === 'voyage';
}

function isPinRelockDelay(value: unknown): value is AppPinRelockDelay {
  return value === 'immediate' || value === 'minute' || value === 'five' || value === 'never';
}

function sanitizeHomeModules(value: unknown): HomeModuleId[] {
  if (!Array.isArray(value)) {
    return defaultAppPreferences.homeModules;
  }

  const allowedIds = new Set(allHomeModuleIds);
  const modules = [...new Set(value.filter((entry): entry is HomeModuleId => typeof entry === 'string' && allowedIds.has(entry as HomeModuleId)))];

  return modules.length ? modules : defaultAppPreferences.homeModules;
}

function sanitizeHomeWidgets(value: unknown): HomeWidgetId[] {
  if (!Array.isArray(value)) {
    return defaultAppPreferences.homeWidgets;
  }

  const allowedIds = new Set(defaultHomeWidgets);
  const widgets = [...new Set(value.filter((entry): entry is HomeWidgetId => typeof entry === 'string' && allowedIds.has(entry as HomeWidgetId)))];

  return widgets.length ? widgets : defaultAppPreferences.homeWidgets;
}

export function sanitizeAppPreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultAppPreferences;
  }

  const input = value as Record<string, unknown>;

  const rawTextScale = input.textScale === 'normal' ? 'medium' : input.textScale;

  return {
    theme: isThemeMode(input.theme) ? input.theme : defaultAppPreferences.theme,
    accent: isAccent(input.accent) ? input.accent : defaultAppPreferences.accent,
    density: isDensity(input.density) ? input.density : defaultAppPreferences.density,
    textScale: isTextScale(rawTextScale) ? rawTextScale : defaultAppPreferences.textScale,
    reduceMotion: typeof input.reduceMotion === 'boolean' ? input.reduceMotion : defaultAppPreferences.reduceMotion,
    showSensitiveContent:
      typeof input.showSensitiveContent === 'boolean'
        ? input.showSensitiveContent
        : defaultAppPreferences.showSensitiveContent,
    homeProfile: isHomeProfile(input.homeProfile) ? input.homeProfile : defaultAppPreferences.homeProfile,
    homeModules: sanitizeHomeModules(input.homeModules),
    homeWidgets: sanitizeHomeWidgets(input.homeWidgets),
    pinRelockDelay: isPinRelockDelay(input.pinRelockDelay)
      ? input.pinRelockDelay
      : defaultAppPreferences.pinRelockDelay,
    lastBackupAt:
      typeof input.lastBackupAt === 'number' && Number.isFinite(input.lastBackupAt)
        ? input.lastBackupAt
        : null,
    backupMethod: input.backupMethod === 'cloud' ? 'cloud' : 'local',
    backupCloudUrl: typeof input.backupCloudUrl === 'string' ? input.backupCloudUrl : undefined,
    useBiometrics: typeof input.useBiometrics === 'boolean' ? input.useBiometrics : defaultAppPreferences.useBiometrics,
    wipeDataAfterFailedAttempts: typeof input.wipeDataAfterFailedAttempts === 'number' ? input.wipeDataAfterFailedAttempts : null,
    agendaColors:
      typeof input.agendaColors === 'object' && input.agendaColors !== null
        ? (input.agendaColors as Record<string, string>)
        : undefined,
  };
}

export async function getStoredPreferencesAsync() {
  try {
    const rawValue = await SecureStore.getItemAsync(PREFERENCES_KEY);
    if (!rawValue) {
      return defaultAppPreferences;
    }

    return sanitizeAppPreferences(JSON.parse(rawValue));
  } catch {
    return defaultAppPreferences;
  }
}

export async function savePreferencesAsync(preferences: AppPreferences) {
  await SecureStore.setItemAsync(PREFERENCES_KEY, JSON.stringify(preferences), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

function sanitizeStoredCercleLayout(value: unknown): StoredCercleLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([personId, position]) => {
      if (!position || typeof position !== 'object' || Array.isArray(position)) {
        return [];
      }

      const input = position as Record<string, unknown>;
      const x = typeof input.x === 'number' && Number.isFinite(input.x) ? input.x : null;
      const y = typeof input.y === 'number' && Number.isFinite(input.y) ? input.y : null;

      if (x === null || y === null) {
        return [];
      }

      return [[personId, { x, y }]];
    }),
  );
}

export async function getStoredCercleLayoutAsync(): Promise<StoredCercleLayout> {
  try {
    const rawValue = await SecureStore.getItemAsync(CERCLE_LAYOUT_KEY);
    if (!rawValue) {
      return {};
    }

    return sanitizeStoredCercleLayout(JSON.parse(rawValue));
  } catch {
    return {};
  }
}

export async function saveCercleLayoutAsync(layout: StoredCercleLayout) {
  await SecureStore.setItemAsync(CERCLE_LAYOUT_KEY, JSON.stringify(layout), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

function sanitizeStoredCercleCategoryLabels(value: unknown): StoredCercleCategoryLabels {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([categoryId, label]) => {
      if (typeof label !== 'string') {
        return [];
      }

      const trimmedLabel = label.trim();
      return trimmedLabel ? [[categoryId, trimmedLabel]] : [];
    }),
  );
}

export async function getStoredCercleCategoryLabelsAsync(): Promise<StoredCercleCategoryLabels> {
  try {
    const rawValue = await SecureStore.getItemAsync(CERCLE_CATEGORY_LABELS_KEY);
    if (!rawValue) {
      return {};
    }

    return sanitizeStoredCercleCategoryLabels(JSON.parse(rawValue));
  } catch {
    return {};
  }
}

export async function saveCercleCategoryLabelsAsync(labels: StoredCercleCategoryLabels) {
  await SecureStore.setItemAsync(CERCLE_CATEGORY_LABELS_KEY, JSON.stringify(sanitizeStoredCercleCategoryLabels(labels)), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}