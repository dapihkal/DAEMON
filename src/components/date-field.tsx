import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/theme-provider';
import { fonts, radii, spacing } from '../theme/tokens';

type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
};

// Labels distincts : 'M'/'M' (mardi/mercredi) était ambigu.
const weekDays = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDisplayDate(date: Date | null) {
  if (!date) {
    return 'Choisir une date';
  }

  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatMonth(date: Date) {
  return date.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function DateField({ label, value, onChange, allowClear = false }: DateFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Stabilisés sur `value` : tant que la valeur ne change pas, on ne recrée
  // pas de new Date() à chaque render (l'effet ci-dessous reste fiable).
  const selectedDate = useMemo(() => parseDay(value), [value]);
  const fallbackDate = useMemo(() => selectedDate ?? new Date(), [selectedDate]);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(fallbackDate));

  useEffect(() => {
    setVisibleMonth(startOfMonth(fallbackDate));
  }, [fallbackDate]);

  const todayKey = localDay();
  const selectedKey = selectedDate ? localDay(selectedDate) : '';
  const cells = useMemo(() => {
    const firstDay = startOfMonth(visibleMonth);
    const monthOffset = (firstDay.getDay() + 6) % 7;
    const dayCount = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
    const emptyCells = Array.from({ length: monthOffset }, () => null);
    const dayCells = Array.from({ length: dayCount }, (_, index) => new Date(firstDay.getFullYear(), firstDay.getMonth(), index + 1, 12));
    return [...emptyCells, ...dayCells];
  }, [visibleMonth]);

  const selectDate = (date: Date) => {
    onChange(localDay(date));
    setCalendarOpen(false);
  };

  const moveDay = (amount: number) => {
    selectDate(addDays(fallbackDate, amount));
  };

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controlRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jour précédent"
          onPress={() => moveDay(-1)}
          style={styles.stepButton}
        >
          <Text style={styles.stepButtonLabel}>-</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={selectedDate ? `Date : ${formatLongDate(selectedDate)}. Ouvrir le calendrier` : 'Ouvrir le calendrier'}
          onPress={() => setCalendarOpen((current) => !current)}
          style={styles.valueButton}
        >
          <Text numberOfLines={1} style={styles.valueLabel}>{formatDisplayDate(selectedDate)}</Text>
          <Text style={styles.valueMeta}>{value || 'Aucune date'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jour suivant"
          onPress={() => moveDay(1)}
          style={styles.stepButton}
        >
          <Text style={styles.stepButtonLabel}>+</Text>
        </Pressable>
      </View>

      <View style={styles.quickRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choisir aujourd'hui"
          onPress={() => selectDate(new Date())}
          style={styles.quickButton}
        >
          <Text style={styles.quickButtonLabel}>Aujourd'hui</Text>
        </Pressable>
        {allowClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Effacer la date"
            onPress={() => onChange('')}
            style={styles.quickButton}
          >
            <Text style={styles.quickButtonLabel}>Effacer</Text>
          </Pressable>
        ) : null}
      </View>

      {calendarOpen ? (
        <View style={styles.calendar}>
          <View style={styles.monthRow}>
            <View style={styles.monthNavGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Année précédente"
                onPress={() => setVisibleMonth((current) => new Date(current.getFullYear() - 1, current.getMonth(), 1, 12))}
                style={styles.monthButton}
              >
                <Text style={[styles.monthButtonLabel, styles.yearButtonLabel]}>{'<<'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mois précédent"
                onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))}
                style={styles.monthButton}
              >
                <Text style={styles.monthButtonLabel}>{'<'}</Text>
              </Pressable>
            </View>
            <Text style={styles.monthLabel}>{formatMonth(visibleMonth)}</Text>
            <View style={styles.monthNavGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mois suivant"
                onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))}
                style={styles.monthButton}
              >
                <Text style={styles.monthButtonLabel}>{'>'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Année suivante"
                onPress={() => setVisibleMonth((current) => new Date(current.getFullYear() + 1, current.getMonth(), 1, 12))}
                style={styles.monthButton}
              >
                <Text style={[styles.monthButtonLabel, styles.yearButtonLabel]}>{'>>'}</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.weekRow}>
            {weekDays.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekLabel}>{day}</Text>
            ))}
          </View>
          <View style={styles.dayGrid}>
            {cells.map((date, index) => {
              if (!date) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }

              const dayKey = localDay(date);
              const selected = dayKey === selectedKey;
              const today = dayKey === todayKey;

              return (
                <Pressable
                  key={dayKey}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={formatLongDate(date)}
                  onPress={() => selectDate(date)}
                  style={[styles.dayCell, today && styles.dayCellToday, selected && styles.dayCellSelected]}
                >
                  <Text style={[styles.dayLabel, selected && styles.dayLabelSelected]}>{date.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    root: {
      gap: spacing.sm,
    },
    label: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    controlRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    stepButton: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.md,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 58,
      width: 48,
    },
    stepButtonLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 18,
    },
    valueButton: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      flex: 1,
      gap: 2,
      justifyContent: 'center',
      minHeight: 58,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    valueLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      textTransform: 'capitalize',
    },
    valueMeta: {
      color: colors.muted,
      fontFamily: fonts.mono,
      fontSize: 11,
    },
    quickRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    quickButton: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    quickButtonLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    calendar: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.md,
    },
    monthRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    monthNavGroup: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    monthButton: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    monthButtonLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 16,
    },
    yearButtonLabel: {
      fontSize: 12,
    },
    monthLabel: {
      color: colors.text,
      fontFamily: fonts.title,
      fontSize: 17,
      textTransform: 'capitalize',
    },
    weekRow: {
      flexDirection: 'row',
    },
    weekLabel: {
      color: colors.muted,
      flex: 1,
      fontFamily: fonts.mono,
      fontSize: 11,
      textAlign: 'center',
    },
    dayGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      alignItems: 'center',
      aspectRatio: 1,
      borderColor: 'transparent',
      borderRadius: radii.md,
      borderWidth: 1,
      justifyContent: 'center',
      width: '14.285%',
    },
    dayCellToday: {
      borderColor: colors.success,
    },
    dayCellSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    dayLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    dayLabelSelected: {
      color: colors.white,
    },
  });
