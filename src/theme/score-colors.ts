export const MOOD_COLORS = {
  1: '#EF4444', // Rouge
  2: '#F97316', // Orange
  3: '#FACC15', // Jaune
  4: '#A3E635', // Vert clair/pomme
  5: '#22C55E', // Vert foncé
} as const;

export function getMoodColor(score: number): string {
  const rounded = Math.round(score) as keyof typeof MOOD_COLORS;
  return MOOD_COLORS[rounded] || '#8b95a9'; // fallback to muted
}

/**
 * Returns an interpolated color based on a score from 1 to 5.
 * Useful for averages.
 */
export function getInterpolatedMoodColor(score: number): string {
  if (score <= 1) return MOOD_COLORS[1];
  if (score >= 5) return MOOD_COLORS[5];

  const lower = Math.floor(score) as keyof typeof MOOD_COLORS;
  const upper = Math.ceil(score) as keyof typeof MOOD_COLORS;
  
  if (lower === upper) return MOOD_COLORS[lower];

  const ratio = score - lower;
  
  const c1 = MOOD_COLORS[lower];
  const c2 = MOOD_COLORS[upper];

  return interpolateColor(c1, c2, ratio);
}

function interpolateColor(color1: string, color2: string, ratio: number): string {
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);

  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
