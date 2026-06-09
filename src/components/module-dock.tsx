import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemePreferences } from '../theme/theme-provider';
import { fonts, radii, spacing } from '../theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

type MenuGroupId = 'health' | 'suivi' | 'social' | 'remember' | 'config';

type ModuleLink = {
  id: string;
  label: string;
  href: Href;
  icon: IconName;
  sensitive?: boolean;
};

type MenuGroup = {
  id: MenuGroupId;
  label: string;
  icon: IconName;
  modules: ModuleLink[];
  activePaths?: string[];
};

const hitSlop = { top: 8, right: 8, bottom: 8, left: 8 } as const;

const menuGroups: MenuGroup[] = [
  {
    id: 'health',
    label: 'Santé',
    icon: 'heart-outline',
    activePaths: ['/sante'],
    modules: [
      { id: 'conso', label: 'Consos', href: '/conso' as Href, icon: 'flask-outline', sensitive: true },
      { id: 'pharmaco', label: 'Substances', href: '/pharmaco' as Href, icon: 'beaker-outline', sensitive: true },
      { id: 'sommeil', label: 'Sommeil', href: '/sommeil' as Href, icon: 'moon-outline' },
      { id: 'activite', label: 'Activité', href: '/activite' as Href, icon: 'fitness-outline' },
      { id: 'traitement', label: 'Traitement', href: '/traitement' as Href, icon: 'medkit-outline', sensitive: true },
    ],
  },
  {
    id: 'suivi',
    label: 'Suivis',
    icon: 'analytics-outline',
    activePaths: ['/stats'],
    modules: [
      { id: 'jeux', label: 'Jeux', href: '/jeux' as Href, icon: 'game-controller-outline' },
      { id: 'livres', label: 'Livres', href: '/livres' as Href, icon: 'book-outline' },
      { id: 'concerts', label: 'Concerts', href: '/concerts' as Href, icon: 'musical-notes-outline' },
      { id: 'pays', label: 'Pays', href: '/pays' as Href, icon: 'globe-outline' },
      { id: 'journal', label: 'Journal', href: '/journal' as Href, icon: 'journal-outline' },
    ],
  },
  {
    id: 'social',
    label: 'Social',
    icon: 'people-outline',
    modules: [
      { id: 'cercle', label: 'Cercle', href: '/cercle' as Href, icon: 'people-circle-outline' },
      { id: 'pro', label: 'Pro', href: '/pro' as Href, icon: 'briefcase-outline' },
      { id: 'frise', label: 'Frise', href: '/frise' as Href, icon: 'git-commit-outline' },
    ],
  },
  {
    id: 'remember',
    label: 'Pas zapper',
    icon: 'alarm-outline',
    modules: [
      { id: 'idees', label: 'Idées', href: '/idees' as Href, icon: 'bulb-outline' },
      { id: 'notes', label: 'Notes', href: '/notes' as Href, icon: 'document-text-outline' },
      { id: 'listes', label: 'Listes', href: '/listes' as Href, icon: 'list-outline' },
      { id: 'agenda', label: 'Agenda', href: '/agenda' as Href, icon: 'calendar-outline' },
      { id: 'rappels', label: 'Rappels', href: '/rappels' as Href, icon: 'notifications-outline' },
    ],
  },
  {
    id: 'config',
    label: "Config'",
    icon: 'settings-outline',
    modules: [
      { id: 'reglages', label: 'Réglages', href: '/reglages' as Href, icon: 'options-outline' },
      { id: 'securite', label: 'Sécurité', href: '/securite' as Href, icon: 'shield-checkmark-outline' },
      { id: 'sauvegarde', label: 'Sauvegarde', href: '/sauvegarde' as Href, icon: 'cloud-upload-outline' },
      { id: 'plus', label: 'Plus', href: '/plus' as Href, icon: 'grid-outline' },
    ],
  },
];

function hrefToPath(href: Href) {
  if (typeof href === 'string') {
    return href.split(/[?#]/)[0] || '/';
  }

  if (href && typeof href === 'object' && 'pathname' in href && typeof href.pathname === 'string') {
    return href.pathname;
  }

  return null;
}

function matchesPath(pathname: string, path: string) {
  return pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));
}

export function ModuleDock() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors, surfaceGradient } = useTheme();
  const { preferences } = useThemePreferences();
  const compact = preferences.density === 'compact';
  const styles = useMemo(() => createStyles(colors, compact, preferences.textScale), [colors, compact, preferences.textScale]);
  const [openGroupId, setOpenGroupId] = useState<MenuGroupId | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const openProgress = useRef(new Animated.Value(0)).current;

  const groups = useMemo(
    () => menuGroups.map((group) => ({
      ...group,
      modules: group.modules.filter((module) => preferences.showSensitiveContent || !module.sensitive),
    })),
    [preferences.showSensitiveContent],
  );
  const openGroup = groups.find((group) => group.id === openGroupId) ?? null;

  const activeGroupId = useMemo(() => {
    const activeGroup = groups.find((group) => {
      const groupPathIsActive = group.activePaths?.some((path) => matchesPath(pathname, path)) ?? false;
      const modulePathIsActive = group.modules.some((module) => {
        const path = hrefToPath(module.href);
        return path ? matchesPath(pathname, path) : false;
      });

      return groupPathIsActive || modulePathIsActive;
    });

    return activeGroup?.id ?? null;
  }, [groups, pathname]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      setOpenGroupId(null);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    setOpenGroupId(null);
  }, [pathname]);

  useEffect(() => {
    if (preferences.reduceMotion) {
      openProgress.setValue(openGroupId ? 1 : 0);
      return;
    }

    Animated.timing(openProgress, {
      duration: openGroupId ? 190 : 120,
      toValue: openGroupId ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [openGroupId, openProgress, preferences.reduceMotion]);

  if (keyboardVisible) {
    return null;
  }

  const bottomMargin = insets.bottom > 0 ? insets.bottom + (compact ? 4 : 8) : (compact ? 10 : 14);
  const railAnimatedStyle = {
    opacity: openProgress,
    transform: [
      {
        translateY: openProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
      {
        scale: openProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.97, 1],
        }),
      },
    ],
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents={openGroupId ? 'auto' : 'none'}
        style={[styles.backdrop, { opacity: openProgress }]}
      >
        <Pressable
          accessibilityLabel="Fermer le menu"
          onPress={() => setOpenGroupId(null)}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View
        pointerEvents="box-none"
        style={[
          styles.root,
          {
            bottom: bottomMargin,
            left: compact ? 10 : 14,
            right: compact ? 10 : 14,
          },
        ]}
      >
        {openGroup ? (
          <Animated.View pointerEvents="box-none" style={[styles.railShadow, railAnimatedStyle]}>
            <LinearGradient
              colors={surfaceGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.moduleRail}
            >
              <View style={styles.moduleGrid}>
                {openGroup.modules.map((module) => {
                  const path = hrefToPath(module.href);
                  const active = path ? matchesPath(pathname, path) : false;

                  return (
                    <Pressable
                      accessibilityLabel={`Ouvrir ${module.label}`}
                      accessibilityRole="button"
                      hitSlop={hitSlop}
                      key={module.id}
                      onPress={() => {
                        setOpenGroupId(null);
                        router.push(module.href);
                      }}
                      style={({ pressed }) => [
                        styles.moduleButton,
                        active && styles.moduleButtonActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.moduleIconShell, active && styles.moduleIconShellActive]}>
                        <Ionicons color={active ? colors.white : colors.accent} name={module.icon} size={compact ? 18 : 20} />
                      </View>
                      <Text
                        adjustsFontSizeToFit
                        minimumFontScale={0.72}
                        numberOfLines={1}
                        style={[styles.moduleLabel, active && styles.moduleLabelActive]}
                      >
                        {module.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </LinearGradient>
          </Animated.View>
        ) : null}

        <LinearGradient
          colors={surfaceGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bar}
        >
          {groups.map((group) => {
            const selected = openGroupId === group.id || activeGroupId === group.id;

            return (
              <Pressable
                accessibilityLabel={`Afficher ${group.label}`}
                accessibilityRole="button"
                hitSlop={hitSlop}
                key={group.id}
                onPress={() => setOpenGroupId((current) => (current === group.id ? null : group.id))}
                style={({ pressed }) => [
                  styles.groupButton,
                  selected && styles.groupButtonSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.groupIconShell, selected && styles.groupIconShellSelected]}>
                  <Ionicons color={selected ? colors.white : colors.muted} name={group.icon} size={compact ? 20 : 22} />
                </View>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.68}
                  numberOfLines={1}
                  style={[styles.groupLabel, selected && styles.groupLabelSelected]}
                >
                  {group.label}
                </Text>
              </Pressable>
            );
          })}
        </LinearGradient>
      </View>
    </View>
  );
}

const createStyles = (
  colors: ReturnType<typeof useTheme>['colors'],
  compact: boolean,
  textScale: ReturnType<typeof useThemePreferences>['preferences']['textScale'],
) => {
  const smallText = textScale === 'small';
  const largeText = textScale === 'large';

  return StyleSheet.create({
  root: {
    gap: compact ? spacing.xs : spacing.sm,
    position: 'absolute',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.backdrop,
  },
  railShadow: {
    elevation: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },
  moduleRail: {
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    padding: compact ? 4 : spacing.xs,
  },
  moduleGrid: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: compact ? 3 : spacing.xs,
    justifyContent: 'space-around',
  },
  moduleButton: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    gap: 2,
    minWidth: 0,
    paddingHorizontal: 1,
    paddingVertical: compact ? 3 : 5,
  },
  moduleButtonActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  moduleIconShell: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    height: compact ? 28 : 32,
    justifyContent: 'center',
    width: compact ? 32 : 36,
  },
  moduleIconShellActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  moduleLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: largeText ? 11 : smallText ? 9 : 10,
    maxWidth: '100%',
  },
  moduleLabelActive: {
    color: colors.accent,
  },
  bar: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    elevation: 12,
    flexDirection: 'row',
    gap: 2,
    height: compact ? 70 : largeText ? 84 : smallText ? 72 : 78,
    overflow: 'hidden',
    paddingHorizontal: compact ? 4 : 6,
    paddingVertical: compact ? 6 : 8,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
  },
  groupButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: radii.lg,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 1,
    paddingVertical: compact ? 3 : 4,
  },
  groupButtonSelected: {
    backgroundColor: colors.accentSoft,
  },
  groupIconShell: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    height: compact ? 30 : 34,
    justifyContent: 'center',
    width: compact ? 34 : 38,
  },
  groupIconShellSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  groupLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: largeText ? 10 : smallText ? 8 : 9,
    maxWidth: '100%',
  },
  groupLabelSelected: {
    color: colors.accent,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }],
  },
});
}