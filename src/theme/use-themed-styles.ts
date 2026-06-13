import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import type { AppTextScale } from '../db/types';
import { useTheme, useThemePreferences } from './theme-provider';

/**
 * Échelle de texte, façon fiable (pur React, indépendant de la version de RN).
 *
 * Toutes les tailles de police de l'app sont écrites en dur dans des
 * `createStyles(colors)`. Plutôt que de migrer chaque littéral, ce hook
 * enveloppe un `createStyles` existant : il le laisse produire ses styles,
 * puis multiplie `fontSize` et `lineHeight` par un facteur dérivé de
 * `preferences.textScale`. Quand la préférence change, le contexte du thème
 * se met à jour, ce hook se recalcule, et tout le texte de l'écran suit.
 *
 * Usage dans un écran :
 *   // avant : const styles = useMemo(() => createStyles(colors), [colors]);
 *   const styles = useThemedStyles(createStyles);
 */

// Amplitude volontairement marquée pour que l'écart soit bien visible.
// Ajuste ces trois valeurs si tu veux plus ou moins de contraste.
const TEXT_SCALE_FACTORS: Record<AppTextScale, number> = {
  small: 0.85,
  medium: 1,
  large: 1.2,
};

export function fontScaleFor(scale: AppTextScale | null | undefined): number {
  if (scale && Object.prototype.hasOwnProperty.call(TEXT_SCALE_FACTORS, scale)) {
    return TEXT_SCALE_FACTORS[scale];
  }
  return 1;
}

type ThemeColors = ReturnType<typeof useTheme>['colors'];
type StyleFactory<T> = (colors: ThemeColors) => T;

export function useThemedStyles<T extends Record<string, unknown>>(factory: StyleFactory<T>): T {
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const factor = fontScaleFor(preferences.textScale);

  return useMemo(() => {
    const base = factory(colors);

    // Échelle neutre (Moyen) : on renvoie les styles tels quels, zéro coût.
    if (factor === 1) {
      return base;
    }

    const scaled: Record<string, unknown> = {};

    for (const key of Object.keys(base)) {
      // flatten résout aussi les éventuels styles enregistrés (id numériques).
      const flat = StyleSheet.flatten(base[key] as never) as
        | { fontSize?: number; lineHeight?: number }
        | undefined;

      const hasFontSize = flat && typeof flat.fontSize === 'number';
      const hasLineHeight = flat && typeof flat.lineHeight === 'number';

      if (flat && (hasFontSize || hasLineHeight)) {
        scaled[key] = {
          ...flat,
          ...(hasFontSize ? { fontSize: Math.round(flat.fontSize! * factor) } : null),
          ...(hasLineHeight ? { lineHeight: Math.round(flat.lineHeight! * factor) } : null),
        };
      } else {
        scaled[key] = base[key];
      }
    }

    return scaled as T;
  }, [colors, factor, factory]);
}
