import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme, useThemePreferences } from '../theme/theme-provider';
import { radii, spacing } from '../theme/tokens';

type SkeletonScreenProps = {
  rows?: number;
  compact?: boolean;
};

export function SkeletonScreen({ rows = 3, compact = false }: SkeletonScreenProps) {
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = createStyles(colors, compact);
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (preferences.reduceMotion) {
      pulse.setValue(0.8);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 700, toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 700, toValue: 0.55, useNativeDriver: true }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [preferences.reduceMotion, pulse]);

  return (
    <Animated.View
      accessibilityLabel="Chargement"
      accessibilityRole="progressbar"
      style={[styles.root, { opacity: pulse }]}
    >
      <View style={styles.hero}>
        <View style={[styles.line, styles.lineShort]} />
        <View style={[styles.line, styles.lineLong]} />
        <View style={styles.railRow}>
          <View style={[styles.rail, styles.railStrong]} />
          <View style={styles.rail} />
        </View>
      </View>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.card}>
          <View style={[styles.line, styles.lineMedium]} />
          <View style={styles.line} />
          <View style={[styles.line, styles.lineSmall]} />
        </View>
      ))}
    </Animated.View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], compact: boolean) =>
  StyleSheet.create({
    root: {
      alignSelf: 'stretch',
      gap: compact ? spacing.sm : spacing.md,
      width: '100%',
    },
    hero: {
      backgroundColor: colors.surface,
      borderColor: colors.lineStrong,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.sm,
      padding: compact ? spacing.md : spacing.lg,
    },
    card: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      gap: spacing.sm,
      padding: compact ? spacing.md : spacing.lg,
    },
    line: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.pill,
      height: compact ? 10 : 12,
      overflow: 'hidden',
      width: '100%',
    },
    lineShort: {
      width: '34%',
    },
    lineLong: {
      height: compact ? 22 : 28,
      width: '72%',
    },
    lineMedium: {
      width: '56%',
    },
    lineSmall: {
      width: '42%',
    },
    railRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    rail: {
      backgroundColor: colors.lineStrong,
      borderRadius: radii.pill,
      height: 5,
      width: 42,
    },
    railStrong: {
      backgroundColor: colors.accent,
      width: 76,
    },
  });