import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../theme/theme-provider';
import { fonts, radii, spacing } from '../theme/tokens';

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.card}>
      <LinearGradient colors={[colors.accentSoft, colors.surfaceRaised]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
        <View style={styles.badgeDot} />
        <View style={styles.badgeLine} />
      </LinearGradient>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  badge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    width: 92,
  },
  badgeDot: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  badgeLine: {
    backgroundColor: colors.sun,
    borderRadius: radii.pill,
    height: 4,
    width: 34,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
  },
  message: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
    textAlign: 'center',
  },
});
