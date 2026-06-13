import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { PeoplePicker } from '../src/components/people-picker';
import { SectionTitle } from '../src/components/section-title';
import { replaceEntityPersonLinks } from '../src/db/cross-repositories';
import { deleteDose, ensureSubstance, listDoses, listSubstances, saveDose } from '../src/db/module-repositories';
import type { Dose, Substance, SubstanceCategory } from '../src/db/types';
import { doseRoutes, doseUnits, feelOptions, substanceCategoryOptions } from '../src/lib/module-options';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/use-themed-styles';

type DoseDraft = {
  id: string | null;
  substance: string;
  category: SubstanceCategory;
  dose: string;
  unit: string;
  route: string;
  datetime: string;
  cost: string;
  notes: string;
  feel: number;
  contextTags: string;
  people: string[];
  createdAt: number | null;
};

function createEmptyDraft(): DoseDraft {
  const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return {
    id: null,
    substance: '',
    category: 'autre',
    dose: '',
    unit: 'mg',
    route: 'Orale',
    datetime: localNow,
    cost: '',
    notes: '',
    feel: 0,
    contextTags: '',
    people: [],
    createdAt: null,
  };
}

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getDraftDay(value: string) {
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : localDay();
}

function getDraftTime(value: string) {
  const time = value.slice(11, 16);
  return time || '12:00';
}

function getSafeDraftTime(value: string) {
  const time = getDraftTime(value);
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) ? time : '12:00';
}

function composeDraftDateTime(day: string, time: string) {
  return `${day}T${time}`;
}

function toDraft(dose: Dose, substances: Substance[]): DoseDraft {
  const category = substances.find((substance) => substance.name.toLowerCase() === dose.substance.toLowerCase())?.category ?? 'autre';
  const localDateTime = new Date(new Date(dose.datetime).getTime() - new Date(dose.datetime).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  return {
    id: dose.id,
    substance: dose.substance,
    category,
    dose: dose.dose,
    unit: dose.unit || 'mg',
    route: dose.route || 'Orale',
    datetime: localDateTime,
    cost: dose.cost,
    notes: dose.notes,
    feel: dose.feel,
    contextTags: dose.contextTags.join(', '),
    people: [],
    createdAt: dose.createdAt,
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RANGE_OPTIONS = [
  { label: '7j', value: 7 },
  { label: '15j', value: 15 },
  { label: '30j', value: 30 },
  { label: '90j', value: 90 },
  { label: '180j', value: 180 },
  { label: '360j', value: 360 },
] as const;

type RangeMode = (typeof RANGE_OPTIONS)[number]['value'] | 'custom';

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export default function ConsoScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ doseId?: string }>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [substances, setSubstances] = useState<Substance[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | SubstanceCategory>('all');
  const [tagFilter, setTagFilter] = useState<'all' | string>('all');
  const [viewMode, setViewMode] = useState<'liste' | 'calendrier' | 'graphique'>('liste');
  const [rangeMode, setRangeMode] = useState<RangeMode>(30);
  const [customRange, setCustomRange] = useState({ start: localDay(addDays(new Date(), -30)), end: localDay() });
  const [isRangeModalVisible, setIsRangeModalVisible] = useState(false);
  const [draft, setDraft] = useState<DoseDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const [nextDoses, nextSubstances] = await Promise.all([listDoses(db), listSubstances(db)]);
      if (!active) {
        return;
      }

      setDoses(nextDoses);
      setSubstances(nextSubstances);

      if (typeof params.doseId === 'string') {
        const targetDose = nextDoses.find((dose) => dose.id === params.doseId) ?? null;
        setDraft(targetDose ? toDraft(targetDose, nextSubstances) : null);
        setViewMode('liste');
        router.replace('/conso');
      }
    })();

    return () => {
      active = false;
    };
  }, [db, params.doseId, router]);

  useFocusEffect(refresh);

  const filteredDoses = useMemo(() => {
    const byCategory = categoryFilter === 'all'
      ? doses
      : doses.filter((dose) => {
          const category = substances.find((substance) => substance.name.toLowerCase() === dose.substance.toLowerCase())?.category ?? 'autre';
          return category === categoryFilter;
        });

    return tagFilter === 'all'
      ? byCategory
      : byCategory.filter((dose) => dose.contextTags.includes(tagFilter));
  }, [categoryFilter, doses, substances, tagFilter]);

  const availableTags = useMemo(
    () => [...new Set(doses.flatMap((dose) => dose.contextTags))].sort((left, right) => left.localeCompare(right, 'fr-FR')),
    [doses],
  );

  const monthMetrics = useMemo(() => {
    const now = new Date();
    const sameMonth = doses.filter((dose) => {
      const target = new Date(dose.datetime);
      return target.getMonth() === now.getMonth() && target.getFullYear() === now.getFullYear();
    });
    const spend = sameMonth.reduce((sum, dose) => sum + (Number.parseFloat(dose.cost.replace(',', '.')) || 0), 0);
    const counts = sameMonth.reduce<Record<string, number>>((accumulator, dose) => {
      accumulator[dose.substance] = (accumulator[dose.substance] ?? 0) + 1;
      return accumulator;
    }, {});
    const topSubstance = Object.entries(counts).sort((left, right) => right[1] - left[1])[0] ?? null;

    return {
      count: sameMonth.length,
      spend,
      topSubstance,
    };
  }, [doses]);

  const calendarCells = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const dayCount = doses.reduce<Record<number, number>>((accumulator, dose) => {
      const target = new Date(dose.datetime);
      if (target.getFullYear() !== year || target.getMonth() !== month) {
        return accumulator;
      }

      accumulator[target.getDate()] = (accumulator[target.getDate()] ?? 0) + 1;
      return accumulator;
    }, {});
    const maxCount = Math.max(1, ...Object.values(dayCount));
    const cells: Array<{ label: string; count: number; active: boolean }> = [];

    for (let index = 0; index < offset; index += 1) {
      cells.push({ label: '', count: 0, active: false });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      cells.push({ label: `${day}`, count: dayCount[day] ?? 0, active: dayCount[day] != null });
    }

    return { cells, maxCount, monthLabel: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) };
  }, [doses]);

  const consumptionTrend = useMemo(() => {
    const today = new Date();
    const points: Array<{ key: string; label: string; value: number }> = [];

    let start: Date;
    let count: number;

    if (rangeMode === 'custom') {
      const s = new Date(customRange.start);
      const e = new Date(customRange.end);
      count = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      start = s;
    } else {
      count = rangeMode;
      start = addDays(today, -(count - 1));
    }

    for (let i = 0; i < count; i++) {
      const date = addDays(start, i);
      const key = localDay(date);
      points.push({
        key,
        label: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        value: 0,
      });
    }

    doses.forEach((dose) => {
      const dayKey = dose.datetime.slice(0, 10);
      const point = points.find((p) => p.key === dayKey);
      if (point) {
        point.value += 1;
      }
    });

    const max = Math.max(1, ...points.map((p) => p.value));
    return { points, max };
  }, [doses, rangeMode, customRange]);

  const handleSave = async () => {
    if (!draft?.substance.trim()) {
      return;
    }

    const saved = await saveDose(db, {
      id: draft.id ?? undefined,
      substance: draft.substance,
      dose: draft.dose,
      unit: draft.unit,
      route: draft.route,
      datetime: new Date(composeDraftDateTime(getDraftDay(draft.datetime), getSafeDraftTime(draft.datetime))).toISOString(),
      cost: draft.cost,
      notes: draft.notes,
      feel: draft.feel,
      contextTags: draft.contextTags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean),
      createdAt: draft.createdAt ?? undefined,
    });

    if (!saved) {
      return;
    }

    await replaceEntityPersonLinks(db, {
      entityKind: 'dose',
      entityId: saved.id,
      personIds: draft.people,
    });

    await ensureSubstance(db, {
      name: draft.substance,
      category: draft.category,
      firstTried: getDraftDay(draft.datetime),
    });

    setDraft(null);
    const [nextDoses, nextSubstances] = await Promise.all([listDoses(db), listSubstances(db)]);
    setDoses(nextDoses);
    setSubstances(nextSubstances);
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await replaceEntityPersonLinks(db, { entityKind: 'dose', entityId: draft.id, personIds: [] });
    await deleteDose(db, draft.id);
    setDraft(null);
    setDoses(await listDoses(db));
  };

  const handleSubstanceChange = (value: string) => {
    setDraft((current) => {
      if (!current) {
        return null;
      }

      const matchingSubstance = substances.find((substance) => substance.name.toLowerCase() === value.trim().toLowerCase());

      return {
        ...current,
        substance: value,
        category: matchingSubstance ? matchingSubstance.category : current.category,
      };
    });
  };

  if (draft) {
    return (
      <AppShell kicker="Suivi" title={draft.id ? 'Modifier la prise' : 'Nouvelle prise'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}><Text style={styles.backLabel}>Retour à la conso</Text></Pressable>
        <View style={styles.editorCard}>
          <TextInput onChangeText={handleSubstanceChange} placeholder="Substance" placeholderTextColor={colors.muted} style={styles.input} value={draft.substance} />
          <Text style={styles.fieldLabel}>Catégorie</Text>
          <View style={styles.chipWrap}>{substanceCategoryOptions.map((category) => { const selected = draft.category === category.id; return <Pressable key={category.id} onPress={() => setDraft((current) => (current ? { ...current, category: category.id } : current))} style={[styles.statusChip, selected && { backgroundColor: category.color, borderColor: category.color }]}><Text style={[styles.statusChipLabel, selected && styles.statusChipLabelSelected]}>{category.label}</Text></Pressable>; })}</View>
          <View style={styles.rowSplit}><TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, dose: value } : current))} placeholder="Dose" placeholderTextColor={colors.muted} style={[styles.input, styles.halfInput]} value={draft.dose} /><TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, unit: value } : current))} placeholder="Unité" placeholderTextColor={colors.muted} style={[styles.input, styles.halfInput]} value={draft.unit} /></View>
          <Text style={styles.fieldLabel}>Voie</Text>
          <View style={styles.chipWrap}>{doseRoutes.map((route) => { const selected = draft.route === route; return <Pressable key={route} onPress={() => setDraft((current) => (current ? { ...current, route } : current))} style={[styles.filterChip, selected && styles.filterChipSelected]}><Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>{route}</Text></Pressable>; })}</View>
          <DateField label="Date" onChange={(value) => setDraft((current) => (current ? { ...current, datetime: composeDraftDateTime(value, getDraftTime(current.datetime)) } : current))} value={getDraftDay(draft.datetime)} />
          <TextInput keyboardType="numbers-and-punctuation" onChangeText={(value) => setDraft((current) => (current ? { ...current, datetime: composeDraftDateTime(getDraftDay(current.datetime), value) } : current))} placeholder="Heure HH:mm" placeholderTextColor={colors.muted} style={styles.input} value={getDraftTime(draft.datetime)} />
          <PeoplePicker entityKind="dose" entityId={draft.id} selectedIds={draft.people} onChange={(people) => setDraft((current) => (current ? { ...current, people } : current))} />
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, cost: value } : current))} placeholder="Coût en euros" placeholderTextColor={colors.muted} style={styles.input} value={draft.cost} />
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, contextTags: value } : current))} placeholder="Contexte: soirée, solo, médical" placeholderTextColor={colors.muted} style={styles.input} value={draft.contextTags} />
          <Text style={styles.fieldLabel}>Ressenti</Text>
          <View style={styles.chipWrap}>{feelOptions.map((feel, index) => { const selected = draft.feel === index; return <Pressable key={`${feel}-${index}`} onPress={() => setDraft((current) => (current ? { ...current, feel: index } : current))} style={[styles.ratingChip, selected && styles.ratingChipSelected]}><Text style={styles.emojiLabel}>{feel}</Text></Pressable>; })}</View>
          <TextInput multiline onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))} placeholder="Effets, remarques, session..." placeholderTextColor={colors.muted} style={styles.textarea} textAlignVertical="top" value={draft.notes} />
          <View style={styles.buttonRow}><Pressable onPress={handleSave} style={styles.primaryButton}><Text style={styles.primaryButtonLabel}>Enregistrer</Text></Pressable>{draft.id ? <Pressable onPress={handleDelete} style={styles.secondaryButton}><Text style={styles.secondaryButtonLabel}>Supprimer</Text></Pressable> : null}</View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell contentMode="view" kicker="Suivi" title="Conso">
      {viewMode === 'liste' ? (
        <FlashList
          data={filteredDoses}
          keyExtractor={(dose) => dose.id}
          ItemSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          ListHeaderComponent={(
            <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
              <SectionTitle eyebrow="Suivi" title="Suivi des prises" subtitle="Journal de prises avec catégorie, voie, coût, ressenti, contexte et vue calendrier." />
              <Pressable onPress={() => setDraft(createEmptyDraft())} style={styles.primaryCta}><Text style={styles.primaryCtaLabel}>+ Nouvelle prise</Text></Pressable>
              <View style={styles.metricsGrid}><View style={styles.metricTile}><Text style={styles.metricValue}>{monthMetrics.count}</Text><Text style={styles.metricLabel}>prises ce mois</Text></View><View style={styles.metricTile}><Text style={styles.metricValue}>{monthMetrics.spend ? monthMetrics.spend.toFixed(monthMetrics.spend % 1 ? 2 : 0) : '0'}</Text><Text style={styles.metricLabel}>euros ce mois</Text></View></View>
              {monthMetrics.topSubstance ? <View style={styles.highlightCard}><Text style={styles.highlightTitle}>{monthMetrics.topSubstance[0]}</Text><Text style={styles.highlightBody}>substance la plus loguée ce mois-ci · {monthMetrics.topSubstance[1]} fois</Text></View> : null}
              <View style={styles.modeRow}><Pressable onPress={() => setViewMode('liste')} style={[styles.modeChip, (viewMode as string) === 'liste' && styles.modeChipActive]}><Text style={[styles.modeChipLabel, (viewMode as string) === 'liste' && styles.modeChipLabelActive]}>Liste</Text></Pressable><Pressable onPress={() => setViewMode('calendrier')} style={[styles.modeChip, (viewMode as string) === 'calendrier' && styles.modeChipActive]}><Text style={[styles.modeChipLabel, (viewMode as string) === 'calendrier' && styles.modeChipLabelActive]}>Calendrier</Text></Pressable><Pressable onPress={() => setViewMode('graphique')} style={[styles.modeChip, (viewMode as string) === 'graphique' && styles.modeChipActive]}><Text style={[styles.modeChipLabel, (viewMode as string) === 'graphique' && styles.modeChipLabelActive]}>Graphique</Text></Pressable></View>
              <View style={styles.filterRow}><Pressable onPress={() => setCategoryFilter('all')} style={[styles.filterChip, categoryFilter === 'all' && styles.filterChipSelected]}><Text style={[styles.filterChipLabel, categoryFilter === 'all' && styles.filterChipLabelSelected]}>Toutes</Text></Pressable>{substanceCategoryOptions.filter((category) => doses.some((dose) => (substances.find((substance) => substance.name.toLowerCase() === dose.substance.toLowerCase())?.category ?? 'autre') === category.id)).map((category) => { const selected = categoryFilter === category.id; return <Pressable key={category.id} onPress={() => setCategoryFilter(category.id)} style={[styles.filterChip, selected && { backgroundColor: category.color, borderColor: category.color }]}><Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>{category.label}</Text></Pressable>; })}</View>
              {availableTags.length ? <View style={styles.filterRow}><Pressable onPress={() => setTagFilter('all')} style={[styles.filterChip, tagFilter === 'all' && styles.filterChipSelected]}><Text style={[styles.filterChipLabel, tagFilter === 'all' && styles.filterChipLabelSelected]}>Tous les contextes</Text></Pressable>{availableTags.map((tag) => { const selected = tagFilter === tag; return <Pressable key={tag} onPress={() => setTagFilter(tag)} style={[styles.filterChip, selected && styles.filterChipSelected]}><Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>#{tag}</Text></Pressable>; })}</View> : null}
            </View>
          )}
          renderItem={({ item: dose }) => {
            const category = substances.find((substance) => substance.name.toLowerCase() === dose.substance.toLowerCase())?.category ?? 'autre';
            const categoryMeta = substanceCategoryOptions.find((option) => option.id === category) ?? substanceCategoryOptions[substanceCategoryOptions.length - 1];
            return (
              <Pressable onPress={() => setDraft(toDraft(dose, substances))} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <View style={styles.itemHeaderMain}>
                    <Text style={styles.itemTitle}>{dose.substance}</Text>
                    <Text style={styles.itemMeta}>{formatDateTime(dose.datetime)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: categoryMeta.color }]}><Text style={styles.statusBadgeLabel}>{categoryMeta.label}</Text></View>
                </View>
                <View style={styles.itemMetaRow}>
                  {dose.dose ? <Text style={styles.itemMeta}>{dose.dose} {dose.unit}</Text> : null}
                  {dose.route ? <Text style={styles.itemMeta}>{dose.route}</Text> : null}
                  {dose.cost ? <Text style={styles.itemMeta}>{dose.cost} €</Text> : null}
                  {dose.feel ? <Text style={styles.itemMeta}>{feelOptions[dose.feel]}</Text> : null}
                </View>
                {dose.contextTags.length ? <Text style={styles.itemMeta}>{dose.contextTags.map((tag) => `#${tag}`).join(' · ')}</Text> : null}
                {dose.notes ? <Text style={styles.itemNotes}>{dose.notes}</Text> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<EmptyState title="Aucune prise" message="Ajoute une première prise pour démarrer le journal." />}
        />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.md }}>
          <SectionTitle eyebrow="Suivi" title="Suivi des prises" subtitle="Journal de prises avec catégorie, voie, coût, ressenti, contexte et vue calendrier." />
          <Pressable onPress={() => setDraft(createEmptyDraft())} style={styles.primaryCta}><Text style={styles.primaryCtaLabel}>+ Nouvelle prise</Text></Pressable>
          <View style={styles.metricsGrid}><View style={styles.metricTile}><Text style={styles.metricValue}>{monthMetrics.count}</Text><Text style={styles.metricLabel}>prises ce mois</Text></View><View style={styles.metricTile}><Text style={styles.metricValue}>{monthMetrics.spend ? monthMetrics.spend.toFixed(monthMetrics.spend % 1 ? 2 : 0) : '0'}</Text><Text style={styles.metricLabel}>euros ce mois</Text></View></View>
          {monthMetrics.topSubstance ? <View style={styles.highlightCard}><Text style={styles.highlightTitle}>{monthMetrics.topSubstance[0]}</Text><Text style={styles.highlightBody}>substance la plus loguée ce mois-ci · {monthMetrics.topSubstance[1]} fois</Text></View> : null}
          <View style={styles.modeRow}><Pressable onPress={() => setViewMode('liste')} style={[styles.modeChip, (viewMode as string) === 'liste' && styles.modeChipActive]}><Text style={[styles.modeChipLabel, (viewMode as string) === 'liste' && styles.modeChipLabelActive]}>Liste</Text></Pressable><Pressable onPress={() => setViewMode('calendrier')} style={[styles.modeChip, (viewMode as string) === 'calendrier' && styles.modeChipActive]}><Text style={[styles.modeChipLabel, (viewMode as string) === 'calendrier' && styles.modeChipLabelActive]}>Calendrier</Text></Pressable><Pressable onPress={() => setViewMode('graphique')} style={[styles.modeChip, (viewMode as string) === 'graphique' && styles.modeChipActive]}><Text style={[styles.modeChipLabel, (viewMode as string) === 'graphique' && styles.modeChipLabelActive]}>Graphique</Text></Pressable></View>

          {viewMode === 'calendrier' ? (
            <View style={styles.calendarCard}><Text style={styles.calendarTitle}>{calendarCells.monthLabel}</Text><View style={styles.calendarGrid}>{['L','M','M','J','V','S','D'].map((label) => <Text key={label} style={styles.calendarDow}>{label}</Text>)}{calendarCells.cells.map((cell, index) => <View key={`${cell.label}-${index}`} style={[styles.calendarCell, cell.active && { backgroundColor: colors.accent, opacity: 0.24 + (cell.count / calendarCells.maxCount) * 0.62 }]}><Text style={[styles.calendarCellLabel, cell.active && styles.calendarCellLabelActive]}>{cell.label}</Text>{cell.count ? <Text style={styles.calendarCount}>{cell.count}</Text> : null}</View>)}</View></View>
          ) : (
            <View style={styles.graphCard}>
              <View style={styles.graphHeader}>
                <Text style={styles.graphTitle}>Tendances</Text>
                <Pressable onPress={() => setIsRangeModalVisible(true)} style={styles.rangeButton}>
                  <Text style={styles.rangeButtonLabel}>
                    {rangeMode === 'custom' ? 'Perso' : `${rangeMode}j`}
                  </Text>
                </Pressable>
              </View>
              
              <View style={styles.graphContainer}>
                <View style={styles.graphBars}>
                  {consumptionTrend.points.map((point) => {
                    const height = point.value > 0 ? Math.max(4, Math.round((point.value / consumptionTrend.max) * 120)) : 2;
                    return (
                      <View key={point.key} style={styles.graphBarSlot}>
                        <View style={[styles.graphBar, { backgroundColor: point.value > 0 ? colors.accent : colors.line, height }]} />
                      </View>
                    );
                  })}
                </View>
                <View style={styles.graphLabels}>
                  <Text style={styles.graphLabel}>{consumptionTrend.points[0].label}</Text>
                  <Text style={styles.graphLabel}>{consumptionTrend.points[consumptionTrend.points.length - 1].label}</Text>
                </View>
              </View>
              <View style={styles.graphLegend}>
                <Text style={styles.graphLegendText}>Total de {doses.filter(d => d.datetime >= consumptionTrend.points[0].key).length} prises sur la période</Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      <Modal animationType="fade" transparent visible={isRangeModalVisible} onRequestClose={() => setIsRangeModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsRangeModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Période du graphique</Text>
            <View style={styles.rangeOptions}>
              {RANGE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    setRangeMode(option.value);
                    setIsRangeModalVisible(false);
                  }}
                  style={[styles.rangeOption, rangeMode === option.value && styles.rangeOptionActive]}
                >
                  <Text style={[styles.rangeOptionLabel, rangeMode === option.value && styles.rangeOptionLabelActive]}>{option.label}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setRangeMode('custom')}
                style={[styles.rangeOption, rangeMode === 'custom' && styles.rangeOptionActive]}
              >
                <Text style={[styles.rangeOptionLabel, rangeMode === 'custom' && styles.rangeOptionLabelActive]}>Perso</Text>
              </Pressable>
            </View>

            {rangeMode === 'custom' && (
              <View style={styles.customRangeInputs}>
                <DateField label="De" value={customRange.start} onChange={(val) => setCustomRange((prev) => ({ ...prev, start: val }))} />
                <DateField label="À" value={customRange.end} onChange={(val) => setCustomRange((prev) => ({ ...prev, end: val }))} />
              </View>
            )}

            <Pressable onPress={() => setIsRangeModalVisible(false)} style={styles.closeModalButton}>
              <Text style={styles.closeModalLabel}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  backButton: { alignSelf: 'flex-start' },
  backLabel: { color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  editorCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.xl, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, color: colors.text, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  textarea: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, color: colors.text, fontFamily: fonts.body, fontSize: 15, minHeight: 120, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  fieldLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusChip: { backgroundColor: colors.chip, borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statusChipLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 12 },
  statusChipLabelSelected: { color: colors.white },
  rowSplit: { flexDirection: 'row', gap: spacing.sm },
  halfInput: { flex: 1 },
  ratingChip: { backgroundColor: colors.chip, borderColor: colors.chip, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  ratingChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  emojiLabel: { fontSize: 16 },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, flex: 1, paddingVertical: spacing.sm },
  primaryButtonLabel: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.chip, borderRadius: radii.pill, flex: 1, justifyContent: 'center', paddingVertical: spacing.sm },
  secondaryButtonLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  primaryCta: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.xl, paddingVertical: spacing.lg },
  primaryCtaLabel: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 15 },
  metricsGrid: { alignSelf: 'stretch', flexDirection: 'row', gap: spacing.md },
  metricTile: { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderRadius: radii.xl, borderWidth: 1, flex: 1, flexBasis: 0, gap: spacing.xs, minWidth: 0, padding: spacing.lg },
  metricValue: { color: colors.text, fontFamily: fonts.display, fontSize: 30 },
  metricLabel: { color: colors.muted, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  highlightCard: { backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderRadius: radii.xl, borderWidth: 1, gap: spacing.xs, padding: spacing.lg },
  highlightTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 22 },
  highlightBody: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeChip: { backgroundColor: colors.chip, borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  modeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeChipLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
  modeChipLabelActive: { color: colors.white },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterChip: { backgroundColor: colors.chip, borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 12 },
  filterChipLabelSelected: { color: colors.white },
  itemCard: { alignSelf: 'stretch', backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderRadius: radii.xl, borderWidth: 1, gap: spacing.sm, minWidth: 0, padding: spacing.lg, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 18 },
  itemHeader: { flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', alignItems: 'center', minWidth: 0 },
  itemHeaderMain: { flex: 1, gap: spacing.xs, minWidth: 0 },
  itemTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 20 },
  statusBadge: { borderRadius: radii.pill, flexShrink: 0, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  statusBadgeLabel: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 10, textAlign: 'center' },
  itemMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  itemMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  itemNotes: { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  calendarCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.xl, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  calendarTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 22, textTransform: 'capitalize' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  calendarDow: { color: colors.muted, fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', width: '13.2%' },
  calendarCell: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: 2, height: 42, justifyContent: 'center', width: '13.2%' },
  calendarCellLabel: { color: colors.muted, fontFamily: fonts.bodySemi, fontSize: 12 },
  calendarCellLabelActive: { color: colors.white },
  calendarCount: { color: colors.white, fontFamily: fonts.mono, fontSize: 9 },
  graphCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.xl, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  graphHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  graphTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 22 },
  rangeButton: { backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  rangeButtonLabel: { color: colors.accent, fontFamily: fonts.mono, fontSize: 12, fontWeight: 'bold' },
  graphContainer: { gap: spacing.sm },
  graphBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 1, height: 120, justifyContent: 'space-between' },
  graphBarSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  graphBar: { borderRadius: radii.sm, minWidth: 1, width: '100%' },
  graphLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  graphLabel: { color: colors.muted, fontFamily: fonts.mono, fontSize: 10 },
  graphLegend: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: spacing.md },
  graphLegendText: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalContent: { backgroundColor: colors.surface, borderRadius: radii.xl, gap: spacing.md, maxWidth: 400, padding: spacing.lg, width: '100%' },
  modalTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 20, textAlign: 'center' },
  rangeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  rangeOption: { backgroundColor: colors.chip, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rangeOptionActive: { backgroundColor: colors.accent },
  rangeOptionLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
  rangeOptionLabelActive: { color: colors.white },
  customRangeInputs: { gap: spacing.sm, marginTop: spacing.md },
  closeModalButton: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, marginTop: spacing.md, paddingVertical: spacing.md },
  closeModalLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
});