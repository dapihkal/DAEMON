import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/theme-provider';
import { fonts, radii, spacing } from '../theme/tokens';

type MetricCardProps = {
  label: string;
  value: string;
  caption?: string;
  tone?: 'primary' | 'accent' | 'neutral';
};

export function MetricCard({ label, value, caption, tone = 'primary' }: MetricCardProps) {
  const { accentGradient, colors } = useTheme();
  const styles = createStyles(colors);
  const toneMap = {
    primary: [colors.accent, colors.accentSoft],
    accent: accentGradient.slice(0, 2) as [string, string],
    neutral: [colors.surfaceMuted, colors.surface],
  } as const;

  return (
    <LinearGradient colors={toneMap[tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : <View style={styles.spacer} />}
    </LinearGradient>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    flex: 1,
    gap: spacing.sm,
    minHeight: 132,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  label: {
    color: colors.white,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  value: {
    color: colors.white,
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
  },
  caption: {
    color: colors.white,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 'auto',
  },
  spacer: {
    marginTop: 'auto',
  },
});
