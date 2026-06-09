import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AppAccent, AppPreferences, AppThemeMode } from '../db/types';
import { defaultAppPreferences, getStoredPreferencesAsync, sanitizeAppPreferences, savePreferencesAsync } from '../lib/preferences';
import { buildTheme, type AppTheme } from './tokens';

type ThemeContextValue = {
  preferences: AppPreferences;
  resolvedTheme: Exclude<AppThemeMode, 'auto'>;
  theme: AppTheme;
  replacePreferences: (preferences: AppPreferences) => Promise<void>;
  updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>;
  setThemeMode: (themeMode: AppThemeMode) => Promise<void>;
  setAccent: (accent: AppAccent) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveThemeMode(themeMode: AppThemeMode, now: Date) {
  if (themeMode === 'light' || themeMode === 'dark') {
    return themeMode;
  }

  const hour = now.getHours();
  return hour >= 19 || hour < 7 ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppPreferences>(defaultAppPreferences);
  const [timeTick, setTimeTick] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      const storedPreferences = await getStoredPreferencesAsync();
      if (!active) {
        return;
      }

      setPreferences(storedPreferences);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (preferences.theme !== 'auto') {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setTimeTick((current) => current + 1);
    }, 60_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [preferences.theme]);

  const resolvedTheme = useMemo(
    () => resolveThemeMode(preferences.theme, new Date()),
    [preferences.theme, timeTick],
  );

  const theme = useMemo(() => buildTheme(resolvedTheme, preferences.accent), [preferences.accent, resolvedTheme]);

  const replacePreferences = useCallback(async (nextPreferences: AppPreferences) => {
    const sanitizedPreferences = sanitizeAppPreferences(nextPreferences);
    setPreferences(sanitizedPreferences);
    await savePreferencesAsync(sanitizedPreferences);
  }, []);

  const updatePreferences = useCallback(
    async (patch: Partial<AppPreferences>) => {
      const nextPreferences = sanitizeAppPreferences({ ...preferences, ...patch });
      setPreferences(nextPreferences);
      await savePreferencesAsync(nextPreferences);
    },
    [preferences],
  );

  const setThemeMode = useCallback(
    async (themeMode: AppThemeMode) => {
      const nextPreferences = { ...preferences, theme: themeMode };
      setPreferences(nextPreferences);
      await savePreferencesAsync(nextPreferences);
    },
    [preferences],
  );

  const setAccent = useCallback(
    async (accent: AppAccent) => {
      const nextPreferences = { ...preferences, accent };
      setPreferences(nextPreferences);
      await savePreferencesAsync(nextPreferences);
    },
    [preferences],
  );

  const value = useMemo(
    () => ({
      preferences,
      resolvedTheme,
      theme,
      replacePreferences,
      updatePreferences,
      setThemeMode,
      setAccent,
    }),
    [preferences, replacePreferences, resolvedTheme, setAccent, setThemeMode, theme, updatePreferences],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('ThemeProvider is required before using theme hooks.');
  }

  return value;
}

export function useTheme() {
  return useThemeContext().theme;
}

export function useThemePreferences() {
  const { preferences, replacePreferences, resolvedTheme, setAccent, setThemeMode, updatePreferences } = useThemeContext();

  return {
    preferences,
    replacePreferences,
    resolvedTheme,
    setAccent,
    setThemeMode,
    updatePreferences,
  };
}