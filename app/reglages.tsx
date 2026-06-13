import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { AppShell } from '../src/components/app-shell';
import { SectionTitle } from '../src/components/section-title';
import type { HomeModuleId, HomeWidgetId } from '../src/db/types';
import {
  defaultHomeModuleOrder,
  defaultHomeWidgets,
  densityOptions,
  homeProfileOptions,
  homeModuleOptions,
  homeWidgetOptions,
  sensitiveHomeModuleIds,
  textScaleOptions,
  agendaColorOptions,
  agendaCategoryOptions,
} from '../src/lib/personalization';
import { toggleHaptic } from '../src/lib/haptics';
import { useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { useThemedStyles } from '../src/theme/use-themed-styles';
import { accentOptions, fonts, radii, spacing, themeModeOptions } from '../src/theme/tokens';

const pinRelockDelayOptions = [
  { id: 'immediate', label: 'Immédiat', description: "Verrouille dès que l'app quitte le premier plan." },
  { id: 'minute', label: '1 min', description: 'Laisse une courte reprise sans PIN.' },
  { id: 'five', label: '5 min', description: 'Pratique quand tu navigues entre deux apps.' },
  { id: 'never', label: 'Manuel', description: 'Ne reverrouille pas automatiquement au retour.' },
] as const;

const hitSlop = { top: 8, right: 8, bottom: 8, left: 8 } as const;

export default function ReglagesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences, resolvedTheme, setAccent, setThemeMode, updatePreferences } = useThemePreferences();
  const styles = useThemedStyles(createStyles);
  const [editingAgendaCategoryId, setEditingAgendaCategoryId] = useState<string | null>(null);

  const orderedHomeModuleOptions = useMemo(() => {
    const optionById = new Map(homeModuleOptions.map((option) => [option.id, option]));
    const visibleOptions = preferences.homeModules.flatMap((moduleId) => {
      const option = optionById.get(moduleId);
      return option ? [option] : [];
    });
    const hiddenOptions = homeModuleOptions.filter((option) => !preferences.homeModules.includes(option.id));

    return [...visibleOptions, ...hiddenOptions];
  }, [preferences.homeModules]);

  // Haptique courte pour une simple sélection (cohérente avec les interrupteurs).
  const tapHaptic = () => {
    void toggleHaptic(true, preferences.reduceMotion);
  };

  const toggleHomeModule = (moduleId: HomeModuleId) => {
    const enabled = preferences.homeModules.includes(moduleId);
    if (enabled && preferences.homeModules.length === 1) {
      return;
    }

    const nextModules = enabled
      ? preferences.homeModules.filter((currentModuleId) => currentModuleId !== moduleId)
      : [...preferences.homeModules, moduleId];

    void toggleHaptic(!enabled, preferences.reduceMotion);
    void updatePreferences({ homeModules: nextModules, homeProfile: 'custom' });
  };

  const moveHomeModule = (moduleId: HomeModuleId, direction: -1 | 1) => {
    const currentIndex = preferences.homeModules.indexOf(moduleId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= preferences.homeModules.length) {
      return;
    }

    const nextModules = [...preferences.homeModules];
    const [module] = nextModules.splice(currentIndex, 1);
    nextModules.splice(nextIndex, 0, module);
    tapHaptic();
    void updatePreferences({ homeModules: nextModules, homeProfile: 'custom' });
  };

  const toggleHomeWidget = (widgetId: HomeWidgetId) => {
    const enabled = preferences.homeWidgets.includes(widgetId);
    if (enabled && preferences.homeWidgets.length === 1) {
      return;
    }

    const nextWidgets = enabled
      ? preferences.homeWidgets.filter((currentWidgetId) => currentWidgetId !== widgetId)
      : [...preferences.homeWidgets, widgetId];

    void toggleHaptic(!enabled, preferences.reduceMotion);
    void updatePreferences({ homeWidgets: nextWidgets, homeProfile: 'custom' });
  };

  const applyHomeProfile = (profileId: (typeof homeProfileOptions)[number]['id']) => {
    tapHaptic();
    const profile = homeProfileOptions.find((option) => option.id === profileId);
    if (!profile || profile.id === 'custom') {
      void updatePreferences({ homeProfile: 'custom' });
      return;
    }

    void updatePreferences({
      homeProfile: profile.id,
      homeModules: profile.modules,
      homeWidgets: profile.widgets,
    });
  };

  const setAgendaColor = (categoryId: string, color: string | null) => {
    const nextColors = { ...(preferences.agendaColors || {}) };
    if (color) {
      nextColors[categoryId] = color;
    } else {
      delete nextColors[categoryId];
    }
    tapHaptic();
    void updatePreferences({ agendaColors: nextColors });
  };

  // ─── Helpers de rendu (suppriment la répétition du JSX) ───────────────────

  // Groupe de pastilles à sélection unique (thème, densité, taille de texte).
  function renderPillGroup<T extends string>(
    label: string | null,
    options: readonly { id: T; label: string }[],
    selectedId: T,
    onSelect: (id: T) => void,
  ) {
    return (
      <>
        {label ? <Text style={styles.groupLabel}>{label}</Text> : null}
        <View style={styles.pillRow}>
          {options.map((option) => {
            const selected = selectedId === option.id;

            return (
              <Pressable
                accessibilityLabel={`${label ?? 'Option'} ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                hitSlop={hitSlop}
                key={option.id}
                onPress={() => onSelect(option.id)}
                style={({ pressed }) => [styles.pill, selected && styles.pillSelected, pressed && styles.pressed]}
              >
                <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </>
    );
  }

  // Ligne sélectionnable avec coche (profils, reverrouillage PIN, cartes).
  const renderSelectRow = (
    key: string,
    label: string,
    description: string,
    selected: boolean,
    onPress: () => void,
    accessibilityLabel: string,
  ) => (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={hitSlop}
      key={key}
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, selected && styles.optionRowSelected, pressed && styles.pressed]}
    >
      <View style={styles.optionMain}>
        <Text style={styles.optionTitle}>{label}</Text>
        <Text style={styles.optionBody}>{description}</Text>
      </View>
      <View style={[styles.checkBox, selected && styles.checkBoxSelected]}>
        <Ionicons color={selected ? colors.white : colors.muted} name={selected ? 'checkmark' : 'ellipse-outline'} size={16} />
      </View>
    </Pressable>
  );

  // Ligne interrupteur (animations calmes, modules sensibles).
  const renderToggleRow = (
    label: string,
    valueText: string,
    active: boolean,
    onPress: () => void,
    accessibilityLabel: string,
  ) => (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      hitSlop={hitSlop}
      key={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
    >
      <View style={styles.optionMain}>
        <Text style={styles.optionTitle}>{label}</Text>
        <Text style={styles.optionBody}>{valueText}</Text>
      </View>
      <View style={[styles.switchTrack, active && styles.switchTrackActive]}>
        <View style={[styles.switchThumb, active && styles.switchThumbActive]} />
      </View>
    </Pressable>
  );

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <AppShell kicker="Réglages" title="Personnalisation">
      <Pressable
        accessibilityLabel="Retour à l'écran précédent"
        accessibilityRole="button"
        hitSlop={hitSlop}
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Ionicons color={colors.accent} name="chevron-back" size={16} />
        <Text style={styles.backLabel}>Retour</Text>
      </Pressable>

      <SectionTitle
        eyebrow="Thème"
        title="Ambiance générale"
        subtitle={`Choisis auto, clair ou sombre. En ce moment le rendu actif est ${resolvedTheme === 'dark' ? 'sombre' : 'clair'}.`}
      />
      <View style={styles.groupCard}>
        <View style={styles.pillRow}>
          {renderPillGroup(null, themeModeOptions, preferences.theme, (id) => {
            void setThemeMode(id);
          })}
        </View>
      </View>

      <SectionTitle
        eyebrow="Accent"
        title="Couleur signature"
        subtitle="Ces couleurs permettent d'adapter la personnalité visuelle sans changer la structure de l'app."
      />
      <View style={styles.groupCard}>
        <View style={styles.accentList}>
          {accentOptions.map((option) => {
            const selected = preferences.accent === option.id;

            return (
              <Pressable
                accessibilityLabel={`Accent ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                hitSlop={hitSlop}
                key={option.id}
                onPress={() => {
                  void setAccent(option.id);
                }}
                style={({ pressed }) => [styles.accentRow, selected && styles.accentRowSelected, pressed && styles.pressed]}
              >
                <LinearGradient colors={option.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.accentSwatch} />
                <View style={styles.accentTextWrap}>
                  <Text style={styles.accentTitle}>{option.label}</Text>
                  <Text style={styles.accentBody}>{selected ? 'Accent actif' : 'Appliquer cette direction visuelle'}</Text>
                </View>
                <Ionicons color={selected ? colors.accent : colors.muted} name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <SectionTitle
        eyebrow="Confort"
        title="Rythme de lecture"
        subtitle="Ces options changent la densité générale, les textes et les contenus visibles sur l'accueil."
      />
      <View style={styles.groupCard}>
        <View style={styles.optionList}>
          {renderPillGroup('Densité', densityOptions, preferences.density, (id) => {
            void updatePreferences({ density: id });
          })}

          {renderPillGroup('Texte', textScaleOptions, preferences.textScale, (id) => {
            void updatePreferences({ textScale: id });
          })}

          {renderToggleRow(
            'Animations calmes',
            preferences.reduceMotion ? 'Activées' : 'Désactivées',
            preferences.reduceMotion,
            () => {
              void toggleHaptic(!preferences.reduceMotion, preferences.reduceMotion);
              void updatePreferences({ reduceMotion: !preferences.reduceMotion });
            },
            'Animations calmes',
          )}

          {renderToggleRow(
            "Modules sensibles sur l'accueil",
            preferences.showSensitiveContent ? 'Visibles' : 'Masqués',
            preferences.showSensitiveContent,
            () => {
              void toggleHaptic(!preferences.showSensitiveContent, preferences.reduceMotion);
              void updatePreferences({ showSensitiveContent: !preferences.showSensitiveContent });
            },
            "Modules sensibles sur l'accueil",
          )}
        </View>
      </View>

      <SectionTitle
        eyebrow="Profils"
        title="Modes d'accueil"
        subtitle="Applique un ordre de modules et de signaux selon le moment, puis ajuste librement si besoin."
      />
      <View style={styles.groupCard}>
        <View style={styles.optionList}>
          {homeProfileOptions.map((option) =>
            renderSelectRow(
              option.id,
              option.label,
              option.description,
              preferences.homeProfile === option.id,
              () => applyHomeProfile(option.id),
              `Profil d'accueil ${option.label}`,
            ),
          )}
        </View>
      </View>

      <SectionTitle
        eyebrow="Agenda"
        title="Couleurs par catégorie"
        subtitle="Personnalise les marqueurs de ton agenda pour mieux différencier tes contenus."
      />
      <View style={styles.groupCard}>
        <View style={styles.agendaCategoryList}>
          {agendaCategoryOptions.map((option) => {
            const isEditing = editingAgendaCategoryId === option.id;
            const customColor = preferences.agendaColors?.[option.id];

            return (
              <View key={option.id} style={styles.agendaRow}>
                <Pressable
                  accessibilityLabel={`Couleur de la catégorie ${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isEditing }}
                  hitSlop={hitSlop}
                  onPress={() => setEditingAgendaCategoryId(isEditing ? null : option.id)}
                  style={({ pressed }) => [styles.agendaCategoryButton, pressed && styles.pressed]}
                >
                  <View style={[styles.colorBubble, { backgroundColor: customColor || colors.surfaceMuted }]} />
                  <Text style={styles.agendaCategoryLabel}>{option.label}</Text>
                  <Ionicons name={isEditing ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
                </Pressable>

                {isEditing && (
                  <View style={styles.colorPickerGrid}>
                    {agendaColorOptions.map((color) => {
                      const selected = customColor === color;

                      return (
                        <Pressable
                          accessibilityLabel={`Couleur ${color}${selected ? ' (sélectionnée)' : ''}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          key={color}
                          onPress={() => setAgendaColor(option.id, color)}
                          style={({ pressed }) => [
                            styles.colorOption,
                            selected && styles.colorOptionSelected,
                            pressed && styles.pressed,
                            { backgroundColor: color },
                          ]}
                        >
                          {selected && <Ionicons name="checkmark" size={14} color="white" />}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      accessibilityLabel="Couleur par défaut"
                      accessibilityRole="button"
                      accessibilityState={{ selected: !customColor }}
                      onPress={() => setAgendaColor(option.id, null)}
                      style={({ pressed }) => [
                        styles.colorOption,
                        !customColor && styles.colorOptionSelected,
                        pressed && styles.pressed,
                        { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line },
                      ]}
                    >
                      {!customColor && <Ionicons name="close" size={14} color={colors.text} />}
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <SectionTitle
        eyebrow="Sécurité"
        title="Reverrouillage PIN"
        subtitle="Quand un PIN existe, choisis le délai avant que l'app redemande le code après arrière-plan."
      />
      <View style={styles.groupCard}>
        <View style={styles.optionList}>
          {pinRelockDelayOptions.map((option) =>
            renderSelectRow(
              option.id,
              option.label,
              option.description,
              preferences.pinRelockDelay === option.id,
              () => {
                tapHaptic();
                void updatePreferences({ pinRelockDelay: option.id });
              },
              `Reverrouillage ${option.label}`,
            ),
          )}
        </View>
      </View>

      <SectionTitle
        eyebrow="Accueil"
        title="Cartes contextuelles"
        subtitle="Choisis les signaux qui remontent en haut de l'accueil quand ils deviennent pertinents."
      />
      <View style={styles.groupCard}>
        <View style={styles.optionList}>
          {homeWidgetOptions.map((option) =>
            renderSelectRow(
              option.id,
              option.label,
              option.description,
              preferences.homeWidgets.includes(option.id),
              () => toggleHomeWidget(option.id),
              `Carte contextuelle ${option.label}`,
            ),
          )}
        </View>
      </View>

      <SectionTitle
        eyebrow="Accueil"
        title="Accès rapide"
        subtitle="L'ordre ci-dessous devient l'ordre des tuiles sur l'accueil."
      />
      <View style={styles.groupCard}>
        <View style={styles.optionList}>
          <Pressable
            accessibilityLabel="Rétablir l'accueil par défaut"
            accessibilityRole="button"
            hitSlop={hitSlop}
            onPress={() => {
              tapHaptic();
              void updatePreferences({ homeModules: defaultHomeModuleOrder, homeWidgets: defaultHomeWidgets, homeProfile: 'custom' });
            }}
            style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.text} name="refresh" size={16} />
            <Text style={styles.resetLabel}>Rétablir l'accueil par défaut</Text>
          </Pressable>

          {orderedHomeModuleOptions.map((option) => {
            const selected = preferences.homeModules.includes(option.id);
            const index = preferences.homeModules.indexOf(option.id);
            const sensitive = sensitiveHomeModuleIds.includes(option.id);
            const canMoveUp = selected && index > 0;
            const canMoveDown = selected && index >= 0 && index < preferences.homeModules.length - 1;

            return (
              <View key={option.id} style={[styles.optionRow, !selected && styles.optionRowMuted]}>
                <Pressable
                  accessibilityLabel={`Module d'accueil ${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  hitSlop={hitSlop}
                  onPress={() => toggleHomeModule(option.id)}
                  style={({ pressed }) => [styles.optionMain, pressed && styles.pressed]}
                >
                  <Text style={styles.optionTitle}>{option.label}</Text>
                  <Text style={styles.optionBody}>{option.description}{sensitive ? ' · sensible' : ''}</Text>
                </Pressable>
                <View style={styles.optionActions}>
                  <Pressable
                    accessibilityLabel={`Monter ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canMoveUp }}
                    disabled={!canMoveUp}
                    hitSlop={hitSlop}
                    onPress={() => moveHomeModule(option.id, -1)}
                    style={({ pressed }) => [styles.smallButton, !canMoveUp && styles.smallButtonDisabled, pressed && styles.pressed]}
                  >
                    <Ionicons color={colors.text} name="chevron-up" size={17} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`Descendre ${option.label}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canMoveDown }}
                    disabled={!canMoveDown}
                    hitSlop={hitSlop}
                    onPress={() => moveHomeModule(option.id, 1)}
                    style={({ pressed }) => [styles.smallButton, !canMoveDown && styles.smallButtonDisabled, pressed && styles.pressed]}
                  >
                    <Ionicons color={colors.text} name="chevron-down" size={17} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`${selected ? 'Masquer' : 'Afficher'} ${option.label} sur l'accueil`}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: selected }}
                    hitSlop={hitSlop}
                    onPress={() => toggleHomeModule(option.id)}
                    style={({ pressed }) => [styles.smallButton, selected && styles.smallButtonActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.smallButtonLabel, selected && styles.smallButtonLabelActive]}>{selected ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    backButton: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexDirection: 'row',
      gap: spacing.xs,
      minHeight: 44,
      paddingRight: spacing.sm,
    },
    backLabel: {
      color: colors.accent,
      fontFamily: fonts.mono,
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    groupCard: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg,
    },
    pressed: {
      opacity: 0.72,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      minWidth: 0,
    },
    pill: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 42,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    pillSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    pillLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    pillLabelSelected: {
      color: colors.white,
    },
    accentList: {
      gap: spacing.sm,
    },
    accentRow: {
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.md,
      minWidth: 0,
      padding: spacing.md,
    },
    accentRowSelected: {
      borderColor: colors.accent,
    },
    accentSwatch: {
      borderRadius: radii.md,
      flexShrink: 0,
      height: 42,
      width: 42,
    },
    accentTextWrap: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    accentTitle: {
      color: colors.text,
      fontFamily: fonts.title,
      fontSize: 18,
    },
    accentBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
    },
    optionList: {
      gap: spacing.md,
    },
    groupLabel: {
      color: colors.muted,
      fontFamily: fonts.mono,
      fontSize: 11,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
    },
    optionRow: {
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 64,
      minWidth: 0,
      padding: spacing.md,
    },
    optionRowMuted: {
      opacity: 0.62,
    },
    optionRowSelected: {
      borderColor: colors.accent,
    },
    optionMain: {
      flex: 1,
      gap: 4,
      minHeight: 44,
      minWidth: 0,
      justifyContent: 'center',
    },
    optionTitle: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
    optionBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 17,
    },
    optionActions: {
      flexShrink: 0,
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'flex-end',
    },
    switchTrack: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      height: 30,
      justifyContent: 'center',
      flexShrink: 0,
      paddingHorizontal: 3,
      width: 54,
    },
    switchTrackActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    switchThumb: {
      backgroundColor: colors.white,
      borderRadius: radii.pill,
      height: 22,
      width: 22,
    },
    switchThumbActive: {
      alignSelf: 'flex-end',
    },
    checkBox: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexShrink: 0,
      height: 34,
      justifyContent: 'center',
      width: 46,
    },
    checkBoxSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkBoxLabel: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
    },
    checkBoxLabelSelected: {
      color: colors.white,
    },
    resetButton: {
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      flexDirection: 'row',
      gap: spacing.xs,
      justifyContent: 'center',
      minHeight: 48,
      minWidth: 0,
      paddingVertical: spacing.md,
    },
    resetLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    smallButton: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      flexShrink: 0,
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    smallButtonActive: {
      backgroundColor: colors.accent,
    },
    smallButtonDisabled: {
      opacity: 0.35,
    },
    smallButtonLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
    },
    smallButtonLabelActive: {
      color: colors.white,
    },
    previewCard: {
      borderColor: colors.lineStrong,
      borderRadius: radii.xxl,
      borderWidth: 1,
      gap: spacing.md,
      overflow: 'hidden',
      padding: spacing.lg,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.18,
      shadowRadius: 28,
    },
    previewChip: {
      alignSelf: 'flex-start',
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    previewChipLabel: {
      color: colors.white,
      fontFamily: fonts.mono,
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    previewTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 28,
      lineHeight: 32,
    },
    previewBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 21,
    },
    agendaCategoryList: {
      gap: spacing.sm,
    },
    agendaRow: {
      gap: spacing.sm,
    },
    agendaCategoryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radii.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.line,
      gap: spacing.md,
    },
    colorBubble: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: colors.lineStrong,
    },
    agendaCategoryLabel: {
      flex: 1,
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 14,
    },
    colorPickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.backgroundTint,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
    },
    colorOption: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorOptionSelected: {
      borderWidth: 2,
      borderColor: colors.white,
      transform: [{ scale: 1.1 }],
    },
  });
