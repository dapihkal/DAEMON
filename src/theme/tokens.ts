import type { AppAccent } from '../db/types';

export type ThemeColors = {
  background: string;
  backgroundTint: string;
  backgroundDeep: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  text: string;
  muted: string;
  line: string;
  lineStrong: string;
  primary: string;
  primaryStrong: string;
  accent: string;
  accentSoft: string;
  warning: string;
  success: string;
  chip: string;
  sun: string;
  white: string;
  shadow: string;
  backdrop: string;
};

export type AppTheme = {
  colors: ThemeColors;
  backgroundGradient: [string, string, string];
  surfaceGradient: [string, string];
  accentGradient: [string, string, string];
  glowTop: string;
  glowMiddle: string;
  glowBottom: string;
  inkStripe: string;
};

const lightBaseColors: Omit<ThemeColors, 'accent' | 'accentSoft'> = {
  background: '#0a0f1d',
  backgroundTint: '#111827',
  backgroundDeep: '#030712',
  surface: 'rgba(17, 24, 39, 0.85)',
  surfaceRaised: '#1f2937',
  surfaceMuted: 'rgba(255, 255, 255, 0.08)',
  text: '#f3f4f6',
  muted: '#a7b1c2',
  line: 'rgba(56, 189, 248, 0.15)',
  lineStrong: 'rgba(236, 72, 153, 0.25)',
  primary: '#38bdf8',
  primaryStrong: '#0ea5e9',
  warning: '#f59e0b',
  success: '#10b981',
  chip: 'rgba(56, 189, 248, 0.1)',
  sun: '#f43f5e',
  white: '#ffffff',
  shadow: 'rgba(56, 189, 248, 0.25)',
  backdrop: 'rgba(3, 7, 18, 0.75)',
};

const darkBaseColors: Omit<ThemeColors, 'accent' | 'accentSoft'> = {
  background: '#030508',
  backgroundTint: '#080d1a',
  backgroundDeep: '#010204',
  surface: 'rgba(10, 16, 28, 0.85)',
  surfaceRaised: 'rgba(16, 24, 42, 0.95)',
  surfaceMuted: 'rgba(0, 242, 254, 0.07)',
  text: '#f1f5f9',
  muted: '#8b9bb4',
  line: 'rgba(0, 242, 254, 0.12)',
  lineStrong: 'rgba(244, 63, 94, 0.24)',
  primary: '#00f2fe',
  primaryStrong: '#00b8ff',
  warning: '#ff9f1c',
  success: '#00ffcc',
  chip: 'rgba(0, 242, 254, 0.08)',
  sun: '#f43f5e',
  white: '#ffffff',
  shadow: 'rgba(0, 242, 254, 0.2)',
  backdrop: 'rgba(2, 4, 8, 0.85)',
};

const accentMap: Record<AppAccent, { accent: string; accentSoft: string; gradient: [string, string, string]; label: string }> = {
  blue: {
    accent: '#bd00ff',
    accentSoft: 'rgba(189, 0, 255, 0.15)',
    gradient: ['#7c00ff', '#bd00ff', '#ff00d4'],
    label: 'Cyber Violet',
  },
  aqua: {
    accent: '#00f2fe',
    accentSoft: 'rgba(0, 242, 254, 0.15)',
    gradient: ['#000000', '#00f2fe', '#4facfe'],
    label: 'Cyber Cyan',
  },
  magenta: {
    accent: '#ff007f',
    accentSoft: 'rgba(255, 0, 127, 0.15)',
    gradient: ['#ec008c', '#fc6767', '#ff007f'],
    label: 'Synthwave',
  },
  amber: {
    accent: '#ff8c00',
    accentSoft: 'rgba(255, 140, 0, 0.15)',
    gradient: ['#ff4e50', '#f9d423', '#ff8c00'],
    label: 'Plasma Orange',
  },
  lime: {
    accent: '#39ff14',
    accentSoft: 'rgba(57, 255, 20, 0.15)',
    gradient: ['#11998e', '#38ef7d', '#39ff14'],
    label: 'Matrix Lime',
  },
};

export const themeModeOptions = [
  { id: 'auto', label: 'Auto (soir)' },
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
] as const;

export const accentOptions = Object.entries(accentMap).map(([id, value]) => ({
  id: id as AppAccent,
  label: value.label,
  gradient: value.gradient,
}));

function hexToRgba(hex: string, opacity: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) {
    return hex;
  }
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function buildTheme(mode: 'light' | 'dark', accent: AppAccent): AppTheme {
  const baseColors = mode === 'dark' ? darkBaseColors : lightBaseColors;
  const accentColors = accentMap[accent];
  
  const colors: ThemeColors = {
    ...baseColors,
    accent: accentColors.accent,
    accentSoft: accentColors.accentSoft,
    line: hexToRgba(accentColors.accent, mode === 'dark' ? 0.14 : 0.16),
    lineStrong: hexToRgba(accentColors.accent, mode === 'dark' ? 0.3 : 0.34),
    primary: accentColors.accent,
    primaryStrong: hexToRgba(accentColors.accent, 0.8),
    chip: hexToRgba(accentColors.accent, mode === 'dark' ? 0.09 : 0.1),
    surfaceMuted: hexToRgba(accentColors.accent, mode === 'dark' ? 0.07 : 0.08),
    shadow: hexToRgba(accentColors.accent, mode === 'dark' ? 0.15 : 0.2),
  };

  return {
    colors,
    backgroundGradient: [colors.background, colors.backgroundTint, colors.backgroundDeep],
    surfaceGradient: mode === 'dark' ? ['rgba(16, 24, 48, 0.96)', 'rgba(8, 12, 24, 0.98)'] : ['rgba(22, 32, 54, 0.96)', 'rgba(12, 18, 30, 0.98)'],
    accentGradient: accentColors.gradient,
    glowTop: hexToRgba(accentColors.accent, mode === 'dark' ? 0.22 : 0.18),
    glowMiddle: mode === 'dark' ? 'rgba(244, 63, 94, 0.16)' : 'rgba(236, 72, 153, 0.14)',
    glowBottom: mode === 'dark' ? 'rgba(124, 58, 237, 0.18)' : 'rgba(124, 58, 237, 0.14)',
    inkStripe: hexToRgba(accentColors.accent, mode === 'dark' ? 0.08 : 0.06),
  };
}

export const colors = buildTheme('light', 'blue').colors;

export const spacing = {
  xs: 5,
  sm: 9,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  pill: 999,
};

export const fonts = {
  bodyRegular: 'Manrope_400Regular',
  body: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  mono: 'JetBrainsMono_600SemiBold',
  display: 'Syne_800ExtraBold',
  title: 'Syne_700Bold',
};
