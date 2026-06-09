import { useMemo, type ReactNode, forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme, useThemePreferences } from '../theme/theme-provider';
import { fonts, radii, spacing } from '../theme/tokens';
import { ModuleDock } from './module-dock';

type AppShellProps = {
  kicker: string;
  title: string;
  headerContent?: ReactNode;
  children: ReactNode;
  contentMode?: 'scroll' | 'view';
  scrollEnabled?: boolean;
  floating?: ReactNode;
  backPath?: string;
  backLabel?: string;
};

export const AppShell = forwardRef<any, AppShellProps>(({ 
  kicker, 
  title, 
  headerContent, 
  children, 
  contentMode = 'scroll', 
  scrollEnabled = true, 
  floating, 
  backPath, 
  backLabel 
}, ref) => {
  const { backgroundGradient, colors, glowBottom, glowMiddle, glowTop, inkStripe, surfaceGradient } = useTheme();
  const { preferences } = useThemePreferences();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const isHome = pathname === '/' || pathname === '/index' || pathname === '/(tabs)' || pathname === '/(tabs)/index';
  const showHomeButton = !isHome;

  const handleGoHome = () => {
    router.navigate('/');
  };

  const handleGoBack = () => {
    if (backPath) {
      router.navigate(backPath as any);
    }
  };

  const styles = useMemo(
    () => createStyles(colors, glowTop, glowMiddle, glowBottom, inkStripe, preferences.density, preferences.textScale, insets.bottom),
    [colors, glowBottom, glowMiddle, glowTop, inkStripe, insets.bottom, preferences.density, preferences.textScale],
  );

  const header = (
    <LinearGradient
      accessibilityRole="header"
      colors={surfaceGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.headerCard}
    >
      <View style={styles.headerBadgeRow}>
        <View style={styles.kickerChip}>
          <Text style={styles.kicker}>{kicker}</Text>
        </View>
        <View style={styles.rightControls}>
          {backPath ? (
            <Pressable
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={handleGoBack}
              style={({ pressed }) => [
                styles.homeButton,
                pressed && styles.homeButtonPressed,
              ]}
              accessibilityLabel="Retour"
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back-outline" size={13} color={colors.accent} />
              <Text style={styles.homeButtonText}>{backLabel || 'Retour'}</Text>
            </Pressable>
          ) : showHomeButton ? (
            <Pressable
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={handleGoHome}
              style={({ pressed }) => [
                styles.homeButton,
                pressed && styles.homeButtonPressed,
              ]}
              accessibilityLabel="Retourner à l'accueil"
              accessibilityRole="button"
            >
              <Ionicons name="home-outline" size={13} color={colors.accent} />
              <Text style={styles.homeButtonText}>Accueil</Text>
            </Pressable>
          ) : null}
          <View style={styles.headerSignal}>
            <View style={[styles.signalDot, styles.signalDotPrimary]} />
            <View style={[styles.signalDot, styles.signalDotAccent]} />
          </View>
        </View>
      </View>
      {headerContent ? (
        headerContent
      ) : (
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.58}
          numberOfLines={1}
          style={styles.title}
        >
          {title}
        </Text>
      )}
      <View style={styles.headerRailRow}>
        <View style={styles.headerRailStrong} />
        <View style={styles.headerRailSoft} />
      </View>
    </LinearGradient>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={backgroundGradient} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFill} />
      
      {/* Dynamic Cyber/Tech Blur Spotlights & Tech Rings */}
      <View style={styles.glowTop}>
        <View style={styles.glowInnerRing1} />
        <View style={styles.glowInnerRing2} />
        <View style={styles.glowInnerRing3} />
      </View>
      <View style={styles.glowMiddle}>
        <View style={styles.glowInnerRing1} />
        <View style={styles.glowInnerRing2} />
      </View>
      <View style={styles.glowBottom}>
        <View style={styles.glowInnerRing1} />
        <View style={styles.glowInnerRing2} />
        <View style={styles.glowInnerRing3} />
      </View>
      <View style={styles.inkStripe} />
      
      {/* Background Abstract Tech Geometric Overlays */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg height="100%" width="100%">
          {/* Subtle Grid Matrix */}
          <Path
            d="M 0 40 L 1000 40 M 0 80 L 1000 80 M 0 120 L 1000 120 M 0 160 L 1000 160 M 0 200 L 1000 200 M 0 240 L 1000 240 M 0 280 L 1000 280 M 0 320 L 1000 320 M 0 360 L 1000 360 M 0 400 L 1000 400 M 0 440 L 1000 440 M 0 480 L 1000 480 M 0 520 L 1000 520 M 0 560 L 1000 560 M 0 600 L 1000 600 M 0 640 L 1000 640 M 0 680 L 1000 680 M 0 720 L 1000 720 M 0 760 L 1000 760 M 0 800 L 1000 800 M 0 840 L 1000 840 M 0 880 L 1000 880"
            stroke={colors.line}
            strokeWidth="0.8"
            opacity="0.25"
          />
          <Path
            d="M 40 0 L 40 2000 M 80 0 L 80 2000 M 120 0 L 120 2000 M 160 0 L 160 2000 M 200 0 L 200 2000 M 240 0 L 240 2000 M 280 0 L 280 2000 M 320 0 L 320 2000 M 360 0 L 320 2000 M 360 0 L 360 2000 M 400 0 L 400 2000"
            stroke={colors.line}
            strokeWidth="0.8"
            opacity="0.2"
          />

          {/* Abstract HUD crosshair markers & angle ticks */}
          {/* Top Left Corner Bracket */}
          <Path d="M 20 50 L 40 50 M 20 50 L 20 70" stroke={colors.accent} strokeWidth="1.5" opacity="0.4" />
          {/* Top Right Corner Bracket */}
          <Path d="M 360 50 L 380 50 M 380 50 L 380 70" stroke={colors.accent} strokeWidth="1.5" opacity="0.4" />
          
          {/* HUD Tech Circle Radar element on background */}
          <Circle cx="340" cy="180" r="60" stroke={colors.lineStrong} strokeWidth="1" strokeDasharray="3 6" fill="none" opacity="0.22" />
          <Circle cx="340" cy="180" r="100" stroke={colors.accent} strokeWidth="0.5" strokeDasharray="12 18" fill="none" opacity="0.12" />
          <Line x1="340" y1="60" x2="340" y2="300" stroke={colors.line} strokeWidth="0.5" opacity="0.1" />
          <Line x1="220" y1="180" x2="460" y2="180" stroke={colors.line} strokeWidth="0.5" opacity="0.1" />

          {/* Tech bits and digital coordinate markers */}
          <Rect x="20" y="220" width="8" height="8" stroke={colors.accent} strokeWidth="1" fill="none" opacity="0.3" />
          <Rect x="24" y="224" width="12" height="1" fill={colors.accent} opacity="0.25" />
          <Line x1="20" y1="260" x2="80" y2="260" stroke={colors.accent} strokeWidth="1" opacity="0.3" strokeDasharray="4 4" />
          
          {/* Diagonal tech stripe patterns */}
          <Path
            d="M -40 450 L 160 250 M -20 450 L 180 250 M 0 450 L 200 250 M 20 450 L 220 250 M 40 450 L 240 250"
            stroke={colors.accent}
            strokeWidth="2"
            opacity="0.12"
          />

          {/* Additional decorative tech wireframe */}
          <Path
            d="M 10 580 L 30 600 L 120 600 L 130 590 L 200 590"
            stroke={colors.accent}
            strokeWidth="0.8"
            fill="none"
            opacity="0.15"
          />
          <Circle cx="125" cy="595" r="3" fill={colors.accent} opacity="0.25" />
          <Circle cx="13" cy="583" r="2.5" stroke={colors.accent} strokeWidth="0.8" fill="none" opacity="0.25" />
        </Svg>
      </View>

      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {contentMode === 'view' ? (
          <View ref={ref} style={[styles.content, styles.staticContent]}>
            {header}
            {children}
          </View>
        ) : (
          <KeyboardAwareScrollView
            ref={ref}
            bottomOffset={24}
            contentContainerStyle={styles.content}
            disableScrollOnKeyboardHide
            extraKeyboardSpace={12}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            mode="insets"
            scrollEnabled={scrollEnabled}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
          >
            {header}
            {children}
          </KeyboardAwareScrollView>
        )}
      </SafeAreaView>
      {floating}
      <ModuleDock />
    </View>
  );
});

const createStyles = (
  colors: ReturnType<typeof useTheme>['colors'],
  glowTop: string,
  glowMiddle: string,
  glowBottom: string,
  inkStripe: string,
  density: ReturnType<typeof useThemePreferences>['preferences']['density'],
  textScale: ReturnType<typeof useThemePreferences>['preferences']['textScale'],
  bottomInset: number,
) => {
  const compact = density === 'compact';
  const smallText = textScale === 'small';
  const largeText = textScale === 'large';
  const bottomComfort = bottomInset + (compact ? 112 : 128);

  return StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    gap: compact ? 10 : 18,
    flexGrow: 1,
    paddingBottom: Math.max(spacing.xxl * 2, bottomComfort),
    paddingHorizontal: compact ? 10 : 18,
    paddingTop: compact ? 4 : 12,
  },
  staticContent: {
    flex: 1,
  },
  headerCard: {
    borderColor: colors.lineStrong,
    borderRadius: radii.xxl,
    borderWidth: 1,
    gap: compact ? 8 : 14,
    overflow: 'hidden',
    paddingHorizontal: compact ? 14 : 20,
    paddingVertical: compact ? 12 : 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
  },
  headerBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rightControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: compact ? spacing.xs : spacing.sm,
  },
  homeButton: {
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.lineStrong,
    borderWidth: 1,
    borderRadius: radii.pill,
    gap: compact ? 4 : spacing.xs,
    paddingHorizontal: compact ? spacing.xs : spacing.sm,
    paddingVertical: compact ? 3 : spacing.xs / 2,
  },
  homeButtonPressed: {
    opacity: 0.7,
    backgroundColor: colors.chip,
  },
  homeButtonText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: largeText ? 12 : smallText ? 10 : 11,
  },
  kickerChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  kicker: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: largeText ? 12 : smallText ? 10 : 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: largeText ? 41 : smallText ? (compact ? 30 : 34) : (compact ? 34 : 38),
    flexShrink: 1,
    lineHeight: largeText ? 43 : smallText ? (compact ? 32 : 36) : (compact ? 36 : 40),
  },
  headerSignal: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  signalDot: {
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  signalDotPrimary: {
    backgroundColor: colors.accent,
  },
  signalDotAccent: {
    backgroundColor: colors.sun,
  },
  headerRailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerRailStrong: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 4,
    width: 72,
  },
  headerRailSoft: {
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 4,
    width: 36,
  },
  glowTop: {
    backgroundColor: glowTop,
    borderRadius: 220,
    height: 260,
    position: 'absolute',
    right: -20,
    top: -36,
    width: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowMiddle: {
    backgroundColor: glowMiddle,
    borderRadius: 220,
    height: 200,
    left: -80,
    position: 'absolute',
    top: 180,
    width: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowBottom: {
    backgroundColor: glowBottom,
    borderRadius: 220,
    bottom: -90,
    height: 280,
    left: -30,
    position: 'absolute',
    width: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowInnerRing1: {
    position: 'absolute',
    width: '115%',
    height: '115%',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderStyle: 'dashed',
    opacity: 0.2,
  },
  glowInnerRing2: {
    position: 'absolute',
    width: '85%',
    height: '85%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    opacity: 0.15,
  },
  glowInnerRing3: {
    position: 'absolute',
    width: '55%',
    height: '55%',
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: colors.line,
    borderStyle: 'dashed',
    opacity: 0.12,
  },
  inkStripe: {
    backgroundColor: inkStripe,
    borderRadius: 48,
    height: 300,
    position: 'absolute',
    right: 24,
    top: 120,
    transform: [{ rotate: '-14deg' }],
    width: 46,
  },
  });
};
