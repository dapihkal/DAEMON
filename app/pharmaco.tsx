import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import { deleteSubstance, listDoses, listSubstances, saveSubstance } from '../src/db/module-repositories';
import type { Dose, Substance, SubstanceCategory } from '../src/db/types';
import { feelOptions, substanceCategoryOptions } from '../src/lib/module-options';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type SubstanceDraft = {
  id: string | null;
  name: string;
  category: SubstanceCategory;
  firstTried: string;
  notes: string;
  createdAt: number | null;
};

function createEmptyDraft(): SubstanceDraft {
  return { id: null, name: '', category: 'autre', firstTried: '', notes: '', createdAt: null };
}

function toDraft(substance: Substance): SubstanceDraft {
  return { id: substance.id, name: substance.name, category: substance.category, firstTried: substance.firstTried, notes: substance.notes, createdAt: substance.createdAt };
}

function averageFeel(doses: Dose[], name: string) {
  const values = doses.filter((dose) => dose.substance.toLowerCase() === name.toLowerCase() && dose.feel > 0).map((dose) => dose.feel);
  if (!values.length) {
    return null;
  }

  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { avg, count: values.length };
}

export default function PharmacoScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ substanceId?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [substances, setSubstances] = useState<Substance[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | SubstanceCategory>('all');
  const [sortMode, setSortMode] = useState<'freq' | 'az'>('freq');
  const [draft, setDraft] = useState<SubstanceDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;
    void (async () => {
      const [nextSubstances, nextDoses] = await Promise.all([listSubstances(db), listDoses(db)]);
      if (!active) {
        return;
      }

      setSubstances(nextSubstances);
      setDoses(nextDoses);

      if (typeof params.substanceId === 'string') {
        const targetSubstance = nextSubstances.find((substance) => substance.id === params.substanceId) ?? null;
        setDraft(targetSubstance ? toDraft(targetSubstance) : null);
        router.replace('/pharmaco');
      }
    })();
    return () => {
      active = false;
    };
  }, [db, params.substanceId, router]);

  useFocusEffect(refresh);

  const orderedSubstances = useMemo(() => {
    const filtered = categoryFilter === 'all' ? substances : substances.filter((substance) => substance.category === categoryFilter);
    return [...filtered].sort(sortMode === 'az'
      ? (left, right) => left.name.localeCompare(right.name, 'fr-FR')
      : (left, right) => {
          const rightCount = doses.filter((dose) => dose.substance.toLowerCase() === right.name.toLowerCase()).length;
          const leftCount = doses.filter((dose) => dose.substance.toLowerCase() === left.name.toLowerCase()).length;
          return rightCount - leftCount || left.name.localeCompare(right.name, 'fr-FR');
        });
  }, [categoryFilter, doses, sortMode, substances]);

  const handleSave = async () => {
    if (!draft?.name.trim()) {
      return;
    }

    await saveSubstance(db, { id: draft.id ?? undefined, name: draft.name, category: draft.category, firstTried: draft.firstTried, notes: draft.notes, createdAt: draft.createdAt ?? undefined });
    setDraft(null);
    setSubstances(await listSubstances(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deleteSubstance(db, draft.id);
    setDraft(null);
    setSubstances(await listSubstances(db));
  };

  const handleNameChange = (value: string) => {
    setDraft((current) => {
      if (!current) {
        return null;
      }

      const matchingSubstance = substances.find((substance) => substance.name.toLowerCase() === value.trim().toLowerCase());

      return {
        ...current,
        name: value,
        category: matchingSubstance ? matchingSubstance.category : current.category,
        firstTried: matchingSubstance ? matchingSubstance.firstTried : current.firstTried,
        notes: matchingSubstance ? matchingSubstance.notes : current.notes,
      };
    });
  };

  if (draft) {
    return (
      <AppShell kicker="Déjà essayé" title={draft.id ? 'Modifier la substance' : 'Nouvelle substance'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}><Text style={styles.backLabel}>Retour aux substances</Text></Pressable>
        <View style={styles.editorCard}>
          <TextInput onChangeText={handleNameChange} placeholder="Nom" placeholderTextColor={colors.muted} style={styles.input} value={draft.name} />
          <Text style={styles.fieldLabel}>Catégorie</Text>
          <View style={styles.chipWrap}>{substanceCategoryOptions.map((category) => { const selected = draft.category === category.id; return <Pressable key={category.id} onPress={() => setDraft((current) => (current ? { ...current, category: category.id } : current))} style={[styles.statusChip, selected && { backgroundColor: category.color, borderColor: category.color }]}><Text style={[styles.statusChipLabel, selected && styles.statusChipLabelSelected]}>{category.label}</Text></Pressable>; })}</View>
          <DateField allowClear label="Première fois" onChange={(value) => setDraft((current) => (current ? { ...current, firstTried: value } : current))} value={draft.firstTried} />
          <TextInput multiline onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))} placeholder="Ressenti général, posologie, remarques..." placeholderTextColor={colors.muted} style={styles.textarea} textAlignVertical="top" value={draft.notes} />
          <View style={styles.buttonRow}><Pressable onPress={handleSave} style={styles.primaryButton}><Text style={styles.primaryButtonLabel}>Enregistrer</Text></Pressable>{draft.id ? <Pressable onPress={handleDelete} style={styles.secondaryButton}><Text style={styles.secondaryButtonLabel}>Supprimer</Text></Pressable> : null}</View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell kicker="Déjà essayé" title="Substances">
      <SectionTitle eyebrow="Catalogue" title="Liste à vie" subtitle="Catalogue de substances avec catégorie, première fois, notes, fréquence de prise et ressenti moyen." />
      <Pressable onPress={() => setDraft(createEmptyDraft())} style={styles.addButton}><Text style={styles.addButtonLabel}>+ Ajouter une substance</Text></Pressable>
      <View style={styles.filterRow}><Pressable onPress={() => setCategoryFilter('all')} style={[styles.filterChip, categoryFilter === 'all' && styles.filterChipSelected]}><Text style={[styles.filterChipLabel, categoryFilter === 'all' && styles.filterChipLabelSelected]}>Toutes</Text></Pressable>{substanceCategoryOptions.filter((category) => substances.some((substance) => substance.category === category.id)).map((category) => { const selected = categoryFilter === category.id; return <Pressable key={category.id} onPress={() => setCategoryFilter(category.id)} style={[styles.filterChip, selected && { backgroundColor: category.color, borderColor: category.color }]}><Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>{category.label}</Text></Pressable>; })}</View>
      {substances.length > 1 ? <View style={styles.filterRow}><Pressable onPress={() => setSortMode('freq')} style={[styles.filterChip, sortMode === 'freq' && styles.filterChipSelected]}><Text style={[styles.filterChipLabel, sortMode === 'freq' && styles.filterChipLabelSelected]}>Fréquence</Text></Pressable><Pressable onPress={() => setSortMode('az')} style={[styles.filterChip, sortMode === 'az' && styles.filterChipSelected]}><Text style={[styles.filterChipLabel, sortMode === 'az' && styles.filterChipLabelSelected]}>A-Z</Text></Pressable></View> : null}
      {orderedSubstances.length ? orderedSubstances.map((substance) => { const categoryMeta = substanceCategoryOptions.find((option) => option.id === substance.category) ?? substanceCategoryOptions[substanceCategoryOptions.length - 1]; const doseCount = doses.filter((dose) => dose.substance.toLowerCase() === substance.name.toLowerCase()).length; const avgFeel = averageFeel(doses, substance.name); return <Pressable key={substance.id} onPress={() => setDraft(toDraft(substance))} style={styles.itemCard}><View style={styles.itemHeader}><View style={styles.itemHeaderMain}><Text style={styles.itemTitle}>{substance.name}</Text><Text style={styles.itemMeta}>{doseCount} prise{doseCount > 1 ? 's' : ''}</Text></View><View style={[styles.statusBadge, { backgroundColor: categoryMeta.color }]}><Text style={styles.statusBadgeLabel}>{categoryMeta.label}</Text></View></View>{substance.firstTried ? <Text style={styles.itemMeta}>Première fois · {substance.firstTried}</Text> : null}{avgFeel ? <Text style={styles.itemMeta}>Ressenti moyen · {feelOptions[Math.round(avgFeel.avg)]} ({avgFeel.avg.toFixed(1)}/5 · {avgFeel.count})</Text> : null}{substance.notes ? <Text style={styles.itemNotes}>{substance.notes}</Text> : null}</Pressable>; }) : <EmptyState title="Liste vide" message="Ajoute une substance ou logue une prise pour remplir automatiquement cette vue." />}
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
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: { alignItems: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, flex: 1, paddingVertical: spacing.sm },
  primaryButtonLabel: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 14 },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.chip, borderRadius: radii.pill, flex: 1, justifyContent: 'center', paddingVertical: spacing.sm },
  secondaryButtonLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  addButton: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  addButtonLabel: { color: colors.muted, fontFamily: fonts.bodySemi, fontSize: 15 },
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
  itemMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  itemNotes: { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});