import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { useTheme } from '../theme/theme-provider';
import { fonts, radii, spacing } from '../theme/tokens';

type EmptyStateProps = {
  title: string;
  message: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
};

export function EmptyState({ title, message, icon = 'sparkles-outline' }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.card}>
      <View style={styles.iconRing}>
        <View style={styles.iconShell}>
          <Ionicons color={colors.accent} name={icon} size={22} />
        </View>
      </View>
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
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  iconRing: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  iconShell: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    width: 48,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
    marginTop: spacing.xs,
    textAlign: 'center',
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
