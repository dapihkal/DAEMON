import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/theme-provider';
import { fonts, radii, spacing } from '../theme/tokens';

const UNDO_DURATION_MS = 5000;

type UndoRequest = {
  message: string;
  onUndo: () => void | Promise<void>;
};

type ActiveUndo = UndoRequest & { key: number };

type UndoContextValue = {
  showUndo: (request: UndoRequest) => void;
};

const UndoContext = createContext<UndoContextValue | null>(null);

export function useUndo() {
  const context = useContext(UndoContext);
  if (!context) {
    throw new Error('useUndo must be used inside UndoProvider');
  }
  return context;
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveUndo | null>(null);
  const keyRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showUndo = useCallback(
    (request: UndoRequest) => {
      clearTimer();
      keyRef.current += 1;
      setActive({ ...request, key: keyRef.current });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setActive(null);
      }, UNDO_DURATION_MS);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const handleUndo = useCallback(async () => {
    if (!active) {
      return;
    }
    clearTimer();
    setActive(null);
    await active.onUndo();
  }, [active, clearTimer]);

  const handleDismiss = useCallback(() => {
    clearTimer();
    setActive(null);
  }, [clearTimer]);

  const value = useMemo(() => ({ showUndo }), [showUndo]);

  return (
    <UndoContext.Provider value={value}>
      {children}
      {active ? (
        <UndoToast key={active.key} message={active.message} onDismiss={handleDismiss} onUndo={handleUndo} />
      ) : null}
    </UndoContext.Provider>
  );
}

function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    Animated.timing(progress, {
      duration: 180,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.wrapper,
          { bottom: insets.bottom + 104 },
          {
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.toast}>
          <Text numberOfLines={2} style={styles.message}>
            {message}
          </Text>
          <Pressable
            accessibilityLabel="Annuler la suppression"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onUndo}
            style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}
          >
            <Text style={styles.undoLabel}>Annuler</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Fermer"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onDismiss}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    wrapper: {
      left: spacing.lg,
      position: 'absolute',
      right: spacing.lg,
    },
    toast: {
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.lineStrong,
      borderRadius: radii.lg,
      borderWidth: 1,
      elevation: 14,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.3,
      shadowRadius: 22,
    },
    message: {
      color: colors.text,
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      minWidth: 0,
    },
    undoButton: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    undoLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    closeButton: {
      padding: spacing.xs,
    },
    closeLabel: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    pressed: {
      opacity: 0.7,
    },
  });
