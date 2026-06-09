import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Swipeable, type SwipeableProps } from 'react-native-gesture-handler';

import { deletionHaptic, swipeHaptic } from '../lib/haptics';
import { useTheme, useThemePreferences } from '../theme/theme-provider';
import { fonts, radii, spacing } from '../theme/tokens';

type SwipeActionRowProps = {
  children: ReactNode;
  actionLabel?: string;
  accessibilityLabel: string;
  onAction: () => void | Promise<void>;
  actionKind?: 'delete' | 'archive' | 'done';
  containerStyle?: SwipeableProps['containerStyle'];
};

export function SwipeActionRow({
  children,
  actionLabel = 'Supprimer',
  accessibilityLabel,
  onAction,
  actionKind = 'delete',
  containerStyle,
}: SwipeActionRowProps) {
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useMemo(() => createStyles(colors, actionKind), [actionKind, colors]);

  const handleAction = async () => {
    if (actionKind === 'delete') {
      await deletionHaptic(preferences.reduceMotion);
    } else {
      await swipeHaptic(preferences.reduceMotion);
    }

    await onAction();
  };

  return (
    <Swipeable
      containerStyle={containerStyle}
      enableTrackpadTwoFingerGesture
      friction={2}
      overshootFriction={8}
      renderRightActions={() => (
        <View style={styles.actionWrap}>
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            onPress={() => {
              void handleAction();
            }}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={styles.actionLabel}>{actionLabel}</Text>
          </Pressable>
        </View>
      )}
      rightThreshold={52}
      onSwipeableWillOpen={() => {
        void swipeHaptic(preferences.reduceMotion);
      }}
      onSwipeableOpen={(_, swipeable) => {
        swipeable.close();
        void handleAction();
      }}
    >
      {children}
    </Swipeable>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], actionKind: SwipeActionRowProps['actionKind']) => {
  const destructive = actionKind === 'delete';

  return StyleSheet.create({
    actionWrap: {
      alignSelf: 'stretch',
      justifyContent: 'center',
      marginLeft: spacing.sm,
      minWidth: 112,
    },
    actionButton: {
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: destructive ? colors.warning : colors.accent,
      borderRadius: radii.lg,
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    actionButtonPressed: {
      opacity: 0.78,
    },
    actionLabel: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
  });
};