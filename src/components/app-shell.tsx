import { useEffect, useMemo, useRef, type ReactNode, forwardRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Svg, { Circle, Path } from 'react-native-svg';

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

  const enterProgress = useRef(new Animated.Value(preferences.reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (preferences.reduceMotion) {
      enterProgress.setValue(1);
      return;
    }

    Animated.timing(enterProgress, {
      duration: 380,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [enterProgress, preferences.reduceMotion]);

  const enterStyle = {
    opacity: enterProgress,
    transform: [
      {
        translateY: enterProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };

  const header = (
    <LinearGradient
      accessibilityRole="header"
      colors={surfaceGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.headerCard}
    >
      <View style={styles.headerTopGlint} />
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
      
      {/* Halos lumineux doux */}
      <View style={styles.glowTop} />
      <View style={styles.glowMiddle} />
      <View style={styles.glowBottom} />
      <View style={styles.inkStripe} />

      {/* Fond géométrique épuré */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg height="100%" width="100%">
          {/* Trame fine */}
          <Path
            d="M 0 110 L 1000 110 M 0 220 L 1000 220 M 0 330 L 1000 330 M 0 440 L 1000 440 M 0 550 L 1000 550 M 0 660 L 1000 660 M 0 770 L 1000 770 M 0 880 L 1000 880"
            stroke={colors.line}
            strokeWidth="0.8"
            opacity="0.12"
          />
          <Path
            d="M 110 0 L 110 2000 M 220 0 L 220 2000 M 330 0 L 330 2000"
            stroke={colors.line}
            strokeWidth="0.8"
            opacity="0.08"
          />

          {/* Grands arcs en haut à droite */}
          <Circle cx="400" cy="30" r="170" stroke={colors.accent} strokeWidth="1" fill="none" opacity="0.1" />
          <Circle cx="400" cy="30" r="230" stroke={colors.lineStrong} strokeWidth="0.8" fill="none" opacity="0.08" />
          <Circle cx="400" cy="30" r="290" stroke={colors.line} strokeWidth="0.6" fill="none" opacity="0.07" />

          {/* Faisceau diagonal discret */}
          <Path
            d="M -60 520 L 220 240 M -30 540 L 250 260"
            stroke={colors.accent}
            strokeWidth="1.2"
            opacity="0.06"
          />
        </Svg>
      </View>

      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {contentMode === 'view' ? (
          <View ref={ref} style={[styles.content, styles.staticContent]}>
            <Animated.View style={[styles.enterWrap, enterStyle]}>
              {header}
              {children}
            </Animated.View>
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
            <Animated.View style={[styles.enterWrap, enterStyle]}>
              {header}
              {children}
            </Animated.View>
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
    flexGrow: 1,
    paddingBottom: Math.max(spacing.xxl * 2, bottomComfort),
    paddingHorizontal: compact ? 10 : 18,
    paddingTop: compact ? 4 : 12,
  },
  enterWrap: {
    flexGrow: 1,
    gap: compact ? 10 : 18,
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
  headerTopGlint: {
    backgroundColor: colors.lineStrong,
    height: StyleSheet.hairlineWidth * 2,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
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
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
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
    letterSpacing: -0.6,
    lineHeight: largeText ? 43 : smallText ? (compact ? 32 : 36) : (compact ? 36 : 40),
  },
  headerSignal: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  signalDot: {
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  signalDotPrimary: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  signalDotAccent: {
    backgroundColor: colors.sun,
    shadowColor: colors.sun,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  headerRailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerRailStrong: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 3,
    width: 72,
  },
  headerRailSoft: {
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 3,
    width: 36,
  },
  glowTop: {
    backgroundColor: glowTop,
    borderRadius: 240,
    height: 300,
    position: 'absolute',
    right: -60,
    top: -80,
    width: 300,
  },
  glowMiddle: {
    backgroundColor: glowMiddle,
    borderRadius: 220,
    height: 220,
    left: -100,
    position: 'absolute',
    top: 200,
    width: 220,
  },
  glowBottom: {
    backgroundColor: glowBottom,
    borderRadius: 240,
    bottom: -120,
    height: 320,
    left: -40,
    position: 'absolute',
    width: 320,
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
