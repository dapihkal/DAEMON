import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { Stack } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { SkeletonScreen } from '../src/components/skeleton-screen';
import { UndoProvider } from '../src/components/undo-toast';
import { listObjectives, listPeople, listRoutines } from '../src/db/repositories';
import { migrateDbIfNeeded } from '../src/db/migrations';
import {
  configureNotificationsAsync,
  syncRoutineNotificationsAsync,
  useNotificationObserver,
} from '../src/lib/notifications';
import { syncAllBirthdayRemindersAsync } from '../src/lib/birthday-reminders';
import { runAutoBackupIfDueAsync } from '../src/lib/auto-backup';
import { syncAllObjectiveDeadlineRemindersAsync } from '../src/lib/objective-deadline-reminders';
import { getStoredPinAsync, subscribeToLockRequests, subscribeToPinChanges, verifyPinAsync, wipeAllDataAsync } from '../src/lib/security';
import { ThemeProvider, useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useAppFonts } from '../src/theme/use-app-fonts';
import { useThemedStyles } from '../src/theme/use-themed-styles';

type RelockDelay = 'never' | 'five' | 'minute' | string;

function getRelockDelayMs(delay: RelockDelay) {
  if (delay === 'never') {
    return Number.POSITIVE_INFINITY;
  }

  if (delay === 'five') {
    return 5 * 60_000;
  }

  if (delay === 'minute') {
    return 60_000;
  }

  return 0;
}

function getBiometricLabel(types: LocalAuthentication.AuthenticationType[]) {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face ID';
  }

  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'empreinte';
  }

  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'iris';
  }

  return 'biométrie';
}

function AppRuntime() {
  const db = useSQLiteContext();

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [objectives, routines, people] = await Promise.all([
          listObjectives(db),
          listRoutines(db),
          listPeople(db),
        ]);
        if (!active) {
          return;
        }

        await syncAllObjectiveDeadlineRemindersAsync(db, objectives);
        if (!active) {
          return;
        }
        await syncAllBirthdayRemindersAsync(db, people);
        if (!active) {
          return;
        }
        await syncRoutineNotificationsAsync({
          routines,
          requestPermission: false,
        });
        await runAutoBackupIfDueAsync(db);
      } catch (error) {
        // Les tâches de démarrage ne doivent jamais bloquer ni crasher l'app.
        console.warn('[startup] Synchronisation différée échouée :', error);
      }
    })();

    return () => {
      active = false;
    };
  }, [db]);

  return <RootNavigator />;
}

function PinGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useThemedStyles(createStyles);

  const backgroundAtRef = useRef<number | null>(null);
  const storedPinRef = useRef<string | null>(null);
  const relockDelayRef = useRef(preferences.pinRelockDelay);
  const autoPromptedRef = useRef(false);

  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [pinReady, setPinReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [draftPin, setDraftPin] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('biométrie');
  const [isInactive, setIsInactive] = useState(false);

  // Refs synchronisées pour éviter de re-souscrire AppState et les
  // listeners de sécurité à chaque changement de PIN ou de préférence.
  useEffect(() => {
    storedPinRef.current = storedPin;
  }, [storedPin]);

  useEffect(() => {
    relockDelayRef.current = preferences.pinRelockDelay;
  }, [preferences.pinRelockDelay]);

  useEffect(() => {
    let active = true;

    const relock = () => {
      setUnlocked(false);
      setDraftPin('');
      setUnlockError(null);
    };

    const syncPin = async () => {
      const pin = await getStoredPinAsync();
      if (!active) {
        return;
      }

      setStoredPin(pin);
      setUnlocked((current) => current || !pin);
      setPinReady(true);
    };

    void syncPin();

    const unsubscribePin = subscribeToPinChanges((pin) => {
      if (!active) {
        return;
      }

      setStoredPin(pin);
      setUnlocked((current) => (pin ? current : true));
      setUnlockError(null);
      setDraftPin('');
      setPinReady(true);
    });

    const unsubscribeLock = subscribeToLockRequests(() => {
      if (!active || !storedPinRef.current) {
        return;
      }

      relock();
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (!active) {
        return;
      }

      setIsInactive(nextState !== 'active');
      const delayMs = getRelockDelayMs(relockDelayRef.current);

      if (nextState === 'active') {
        void syncPin();
        const backgroundAt = backgroundAtRef.current;
        backgroundAtRef.current = null;

        if (storedPinRef.current && backgroundAt !== null && Date.now() - backgroundAt >= delayMs) {
          relock();
        }
        return;
      }

      if (storedPinRef.current) {
        backgroundAtRef.current = Date.now();

        if (delayMs === 0) {
          relock();
        }
      }
    });

    return () => {
      active = false;
      unsubscribePin();
      unsubscribeLock();
      appStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!storedPin) {
        setBiometricAvailable(false);
        setBiometricLabel('biométrie');
        return;
      }

      const [hasHardware, enrolled, supportedTypes] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
      ]);

      if (!active) {
        return;
      }

      setBiometricAvailable(hasHardware && enrolled && supportedTypes.length > 0);
      setBiometricLabel(getBiometricLabel(supportedTypes));
    })();

    return () => {
      active = false;
    };
  }, [storedPin]);

  // Compte à rebours live pendant un verrouillage temporaire (trop d'essais).
  useEffect(() => {
    if (!lockedUntil) {
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockCountdown(remaining);

      if (remaining <= 0) {
        setLockedUntil(null);
        setUnlockError(null);
      }
    };

    tick();
    const interval = setInterval(tick, 1_000);

    return () => {
      clearInterval(interval);
    };
  }, [lockedUntil]);

  const inputDisabled = unlockBusy || Boolean(lockedUntil);

  const handleUnlock = async () => {
    if (!storedPin) {
      setUnlocked(true);
      return;
    }

    if (inputDisabled) {
      return;
    }

    if (!/^\d{4,8}$/.test(draftPin)) {
      setUnlockError('Entre un PIN de 4 à 8 chiffres.');
      return;
    }

    setUnlockBusy(true);
    let result: Awaited<ReturnType<typeof verifyPinAsync>>;
    try {
      result = await verifyPinAsync(draftPin);
    } catch {
      setUnlockBusy(false);
      setUnlockError('Vérification impossible pour le moment.');
      return;
    }
    setUnlockBusy(false);

    if (result.ok) {
      setUnlocked(true);
      setDraftPin('');
      setUnlockError(null);
      setLockedUntil(null);
      return;
    }

    if (result.wiped) {
      await wipeAllDataAsync();
      setUnlockError('Sécurité : données effacées après trop d\u2019échecs.');
      setStoredPin(null);
      setUnlocked(true);
      return;
    }

    const remainingLockMs = result.lockedUntil - Date.now();
    if (remainingLockMs > 0) {
      setLockedUntil(result.lockedUntil);
      setUnlockError(null);
    } else {
      setUnlockError('PIN incorrect.');
    }
    setDraftPin('');
  };

  const handleBiometricUnlock = async () => {
    if (!storedPin || !biometricAvailable || biometricBusy || !preferences.useBiometrics) {
      return;
    }

    setBiometricBusy(true);
    setUnlockError(null);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Déverrouiller Carnet',
        promptSubtitle: 'Protection locale',
        promptDescription: 'Utilise la sécurité de ce téléphone pour ouvrir le carnet.',
        cancelLabel: 'Annuler',
        fallbackLabel: 'Utiliser le code',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setUnlocked(true);
        setDraftPin('');
        setUnlockError(null);
        setLockedUntil(null);
      } else if (result.error !== 'user_cancel' && result.error !== 'app_cancel' && result.error !== 'system_cancel') {
        const errorMsg = result.error === 'not_enrolled' ? 'Aucune biométrie enregistrée.' : 'Erreur biométrique.';
        setUnlockError(`${errorMsg} Utilise le PIN.`);
      }
    } catch {
      setUnlockError('Biométrie indisponible. Utilise le PIN.');
    } finally {
      setBiometricBusy(false);
    }
  };

  const isLocked = pinReady && Boolean(storedPin) && !unlocked;

  // Prompt biométrique automatique : une seule fois par session de verrouillage,
  // et jamais pendant que l'app est en arrière-plan (le prompt système échouerait).
  useEffect(() => {
    if (!isLocked) {
      autoPromptedRef.current = false;
      return;
    }

    if (isInactive || autoPromptedRef.current) {
      return;
    }

    if (preferences.useBiometrics && biometricAvailable && !biometricBusy) {
      autoPromptedRef.current = true;
      void handleBiometricUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, isInactive, preferences.useBiometrics, biometricAvailable, biometricBusy]);

  return (
    <View style={styles.gateRoot}>
      {children}
      {isInactive && (
        <View style={[styles.lockOverlay, styles.privacyOverlay]}>
          <Text style={styles.lockTitle}>Carnet</Text>
        </View>
      )}
      {!pinReady || isLocked ? (
        <View style={styles.lockOverlay}>
          <View style={styles.lockCard}>
            <Text style={styles.lockKicker}>Verrou local</Text>
            <Text style={styles.lockTitle}>Carnet verrouillé</Text>
            <Text style={styles.lockBody}>
              {!pinReady ? 'Lecture du PIN stocké…' : 'Entre le code PIN pour rouvrir l\u2019app.'}
            </Text>
            {!pinReady ? (
              <SkeletonScreen compact rows={2} />
            ) : (
              <>
                <TextInput
                  accessibilityLabel="Code PIN"
                  autoFocus
                  editable={!inputDisabled}
                  keyboardType="number-pad"
                  maxLength={8}
                  onChangeText={(value) => {
                    setDraftPin(value.replace(/\D/g, ''));
                    if (unlockError) {
                      setUnlockError(null);
                    }
                  }}
                  onSubmitEditing={() => {
                    void handleUnlock();
                  }}
                  placeholder="4 à 8 chiffres"
                  placeholderTextColor={colors.muted}
                  secureTextEntry
                  style={styles.lockInput}
                  value={draftPin}
                />
                {lockedUntil ? (
                  <Text style={styles.lockError}>
                    {`Trop d\u2019essais. Réessaie dans ${lockCountdown} s.`}
                  </Text>
                ) : unlockError ? (
                  <Text style={styles.lockError}>{unlockError}</Text>
                ) : null}
                {biometricAvailable && preferences.useBiometrics && (
                  <Pressable
                    accessibilityRole="button"
                    disabled={biometricBusy}
                    onPress={handleBiometricUnlock}
                    style={({ pressed }) => [
                      styles.biometricButton,
                      (pressed || biometricBusy) && styles.buttonDimmed,
                    ]}
                  >
                    <Text style={styles.biometricButtonLabel}>
                      {biometricBusy ? 'Ouverture…' : `Ouvrir avec ${biometricLabel}`}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  disabled={inputDisabled}
                  onPress={() => void handleUnlock()}
                  style={({ pressed }) => [
                    styles.unlockButton,
                    (pressed || inputDisabled) && styles.buttonDimmed,
                  ]}
                >
                  <Text style={styles.unlockButtonLabel}>
                    {unlockBusy ? 'Vérification…' : 'Débloquer'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function RootNavigator() {
  const db = useSQLiteContext();
  useNotificationObserver(db);
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();

  return (
    <Stack
      screenOptions={{
        animation: preferences.reduceMotion ? 'none' : 'slide_from_right',
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="concerts" />
      <Stack.Screen name="conso" />
      <Stack.Screen name="idees" />
      <Stack.Screen name="frise" />
      <Stack.Screen name="liens" />
      <Stack.Screen name="journal" />
      <Stack.Screen name="jeux" />
      <Stack.Screen name="objectifs" />
      <Stack.Screen name="pays" />
      <Stack.Screen name="pharmaco" />
      <Stack.Screen name="reglages" />
      <Stack.Screen name="securite" />
      <Stack.Screen name="sante" />
      <Stack.Screen name="sommeil" />
      <Stack.Screen name="traitement" />
      <Stack.Screen name="activite" />
    </Stack>
  );
}

function AppFrame() {
  const { colors } = useTheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
    configureNotificationsAsync().catch(() => undefined);
  }, [colors.background]);

  return (
    <PinGate>
      <SQLiteProvider databaseName="carnet.db" onInit={migrateDbIfNeeded}>
        <UndoProvider>
          <AppRuntime />
        </UndoProvider>
      </SQLiteProvider>
    </PinGate>
  );
}

// Écran de chargement aux couleurs du thème, pour éviter le flash clair
// au démarrage quand le thème sombre est actif.
function ThemedLoadingScreen() {
  const { colors } = useTheme();

  return (
    <View style={[loadingStyles.loadingScreen, { backgroundColor: colors.background }]}>
      <SkeletonScreen rows={4} />
    </View>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Données 100 % locales (SQLite) : pas de refetch réseau pertinent.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useAppFonts();

  useEffect(() => {
    if (fontsError) {
      // On continue avec les polices système plutôt que de crasher l'app.
      console.warn('[fonts] Chargement des polices échoué :', fontsError);
    }
  }, [fontsError]);

  const fontsReady = fontsLoaded || Boolean(fontsError);

  return (
    <GestureHandlerRootView style={loadingStyles.root}>
      <KeyboardProvider preload={false}>
        <SafeAreaProvider>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>
              {!fontsReady ? <ThemedLoadingScreen /> : <AppFrame />}
            </QueryClientProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    gateRoot: {
      flex: 1,
    },
    lockOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      backgroundColor: colors.background,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    privacyOverlay: {
      zIndex: 9999,
    },
    lockCard: {
      backgroundColor: colors.surface,
      borderColor: colors.lineStrong,
      borderRadius: radii.xxl,
      borderWidth: 1,
      gap: spacing.md,
      maxWidth: 420,
      padding: spacing.xl,
      width: '100%',
    },
    lockKicker: {
      color: colors.primary,
      fontFamily: fonts.mono,
      fontSize: 12,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    lockTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 34,
      lineHeight: 38,
    },
    lockBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 15,
      lineHeight: 22,
    },
    lockInput: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.lg,
      color: colors.text,
      fontFamily: fonts.bodySemi,
      fontSize: 18,
      letterSpacing: 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      textAlign: 'center',
    },
    lockError: {
      color: colors.primaryStrong,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    biometricButton: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    biometricButtonLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 14,
    },
    unlockButton: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: radii.pill,
      paddingVertical: spacing.md,
    },
    buttonDimmed: {
      opacity: 0.6,
    },
    unlockButtonLabel: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
  });

const loadingStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
