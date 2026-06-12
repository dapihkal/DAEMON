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
  const { accentGradient, colors, surfaceGradient } = useTheme();
  const styles = createStyles(colors);
  const stripMap = {
    primary: accentGradient.slice(0, 2) as [string, string],
    accent: [colors.sun, accentGradient[2]] as [string, string],
    neutral: [colors.lineStrong, colors.line] as [string, string],
  } as const;
  const valueColor = tone === 'neutral' ? colors.text : colors.accent;

  return (
    <LinearGradient colors={surfaceGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <LinearGradient colors={stripMap[tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.strip} />
      <View style={styles.cornerGlow} />
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : <View style={styles.spacer} />}
    </LinearGradient>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  card: {
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    minHeight: 132,
    overflow: 'hidden',
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  strip: {
    borderRadius: radii.pill,
    height: 3,
    left: 0,
    position: 'absolute',
    right: '40%',
    top: 0,
  },
  cornerGlow: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    height: 110,
    position: 'absolute',
    right: -45,
    top: -45,
    width: 110,
  },
  label: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 34,
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  caption: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 'auto',
  },
  spacer: {
    marginTop: 'auto',
  },
});
