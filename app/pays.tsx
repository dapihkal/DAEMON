import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { EmptyState } from '../src/components/empty-state';
import { PeoplePicker } from '../src/components/people-picker';
import { SectionTitle } from '../src/components/section-title';
import { replaceEntityPersonLinks } from '../src/db/cross-repositories';
import { deleteCountry, listCountries, saveCountry } from '../src/db/module-repositories';
import type { Country, CountryRegion } from '../src/db/types';
import { countryRegionOptions } from '../src/lib/module-options';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/use-themed-styles';

type CountryDraft = {
  id: string | null;
  name: string;
  city: string;
  region: CountryRegion;
  rating: number;
  year: string;
  notes: string;
  people: string[];
  createdAt: number | null;
};

function createEmptyDraft(): CountryDraft {
  return { id: null, name: '', city: '', region: 'autre', rating: 0, year: '', notes: '', people: [], createdAt: null };
}

function toDraft(country: Country): CountryDraft {
  return { id: country.id, name: country.name, city: country.city, region: country.region, rating: country.rating, year: country.year, notes: country.notes, people: [], createdAt: country.createdAt };
}

function stars(value: number) {
  return '★'.repeat(value) + '☆'.repeat(Math.max(0, 5 - value));
}

export default function PaysScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ countryId?: string }>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [countries, setCountries] = useState<Country[]>([]);
  const [regionFilter, setRegionFilter] = useState<'all' | CountryRegion>('all');
  const [draft, setDraft] = useState<CountryDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;
    void (async () => {
      const nextCountries = await listCountries(db);
      if (active) {
        setCountries(nextCountries);

        if (typeof params.countryId === 'string') {
          const targetCountry = nextCountries.find((country) => country.id === params.countryId) ?? null;
          setDraft(targetCountry ? toDraft(targetCountry) : null);
          router.replace('/pays');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [db, params.countryId, router]);

  useFocusEffect(refresh);

  const filteredCountries = useMemo(() => (regionFilter === 'all' ? countries : countries.filter((country) => country.region === regionFilter)), [countries, regionFilter]);

  const handleSave = async () => {
    if (!draft?.name.trim()) {
      return;
    }

    const saved = await saveCountry(db, { id: draft.id ?? undefined, name: draft.name, city: draft.city, region: draft.region, rating: draft.rating, year: draft.year, notes: draft.notes, createdAt: draft.createdAt ?? undefined });
    if (saved) {
      await replaceEntityPersonLinks(db, { entityKind: 'country', entityId: saved.id, personIds: draft.people });
    }
    setDraft(null);
    setCountries(await listCountries(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await replaceEntityPersonLinks(db, { entityKind: 'country', entityId: draft.id, personIds: [] });
    await deleteCountry(db, draft.id);
    setDraft(null);
    setCountries(await listCountries(db));
  };

  if (draft) {
    return (
      <AppShell kicker="Visités" title={draft.id ? 'Modifier le pays' : 'Nouveau pays'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}><Text style={styles.backLabel}>Retour aux pays</Text></Pressable>
        <View style={styles.editorCard}>
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))} placeholder="Nom du pays" placeholderTextColor={colors.muted} style={styles.input} value={draft.name} />
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, city: value } : current))} placeholder="Ville ou région" placeholderTextColor={colors.muted} style={styles.input} value={draft.city} />
          <Text style={styles.fieldLabel}>Continent</Text>
          <View style={styles.chipWrap}>{countryRegionOptions.map((region) => { const selected = draft.region === region.id; return <Pressable key={region.id} onPress={() => setDraft((current) => (current ? { ...current, region: region.id } : current))} style={[styles.statusChip, selected && { backgroundColor: region.color, borderColor: region.color }]}><Text style={[styles.statusChipLabel, selected && styles.statusChipLabelSelected]}>{region.label}</Text></Pressable>; })}</View>
          <Text style={styles.fieldLabel}>Note</Text>
          <View style={styles.chipWrap}>{[1,2,3,4,5].map((rating) => { const selected = draft.rating >= rating && draft.rating > 0; return <Pressable key={rating} onPress={() => setDraft((current) => (current ? { ...current, rating } : current))} style={[styles.ratingChip, selected && styles.ratingChipSelected]}><Text style={[styles.ratingChipLabel, selected && styles.ratingChipLabelSelected]}>★</Text></Pressable>; })}<Pressable onPress={() => setDraft((current) => (current ? { ...current, rating: 0 } : current))} style={[styles.ratingChip, draft.rating === 0 && styles.ratingChipSelected]}><Text style={[styles.ratingChipLabel, draft.rating === 0 && styles.ratingChipLabelSelected]}>—</Text></Pressable></View>
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, year: value } : current))} placeholder="Année" placeholderTextColor={colors.muted} style={styles.input} value={draft.year} />
          <PeoplePicker entityKind="country" entityId={draft.id} selectedIds={draft.people} onChange={(people) => setDraft((current) => (current ? { ...current, people } : current))} />
          <TextInput multiline onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))} placeholder="Souvenir, conseils, moment marquant..." placeholderTextColor={colors.muted} style={styles.textarea} textAlignVertical="top" value={draft.notes} />
          <View style={styles.buttonRow}><Pressable onPress={handleSave} style={styles.primaryButton}><Text style={styles.primaryButtonLabel}>Enregistrer</Text></Pressable>{draft.id ? <Pressable onPress={handleDelete} style={styles.secondaryButton}><Text style={styles.secondaryButtonLabel}>Supprimer</Text></Pressable> : null}</View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell kicker="Visités" title="Pays">
      <SectionTitle eyebrow="Collection" title="Pays visités" subtitle="Collection de pays avec continent, ville, année, note et souvenir." />
      <Pressable onPress={() => setDraft(createEmptyDraft())} style={styles.addButton}><Text style={styles.addButtonLabel}>+ Ajouter un pays</Text></Pressable>
      <View style={styles.filterRow}><Pressable onPress={() => setRegionFilter('all')} style={[styles.filterChip, regionFilter === 'all' && styles.filterChipSelected]}><Text style={[styles.filterChipLabel, regionFilter === 'all' && styles.filterChipLabelSelected]}>Tous</Text></Pressable>{countryRegionOptions.map((region) => { const selected = regionFilter === region.id; return <Pressable key={region.id} onPress={() => setRegionFilter(region.id)} style={[styles.filterChip, selected && { backgroundColor: region.color, borderColor: region.color }]}><Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>{region.label}</Text></Pressable>; })}</View>
      {filteredCountries.length ? filteredCountries.map((country) => { const regionMeta = countryRegionOptions.find((region) => region.id === country.region) ?? countryRegionOptions[countryRegionOptions.length - 1]; return <Pressable key={country.id} onPress={() => setDraft(toDraft(country))} style={styles.itemCard}><View style={styles.itemHeader}><Text style={styles.itemTitle}>{country.name}</Text><View style={[styles.statusBadge, { backgroundColor: regionMeta.color }]}><Text style={styles.statusBadgeLabel}>{regionMeta.label}</Text></View></View>{country.city ? <Text style={styles.itemMeta}>{country.city}</Text> : null}<View style={styles.itemMetaRow}>{country.rating ? <Text style={styles.ratingText}>{stars(country.rating)}</Text> : null}{country.year ? <Text style={styles.itemMeta}>{country.year}</Text> : null}</View>{country.notes ? <Text style={styles.itemNotes}>{country.notes}</Text> : null}</Pressable>; }) : <EmptyState title="Aucun pays" message="Ajoute un premier pays visité pour démarrer le suivi." />}
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
  ratingChip: { backgroundColor: colors.chip, borderColor: colors.chip, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  ratingChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  ratingChipLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 12 },
  ratingChipLabelSelected: { color: colors.white },
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
  itemHeader: { flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', minWidth: 0 },
  itemTitle: { color: colors.text, flex: 1, fontFamily: fonts.title, fontSize: 21, minWidth: 0 },
  statusBadge: { borderRadius: radii.pill, flexShrink: 0, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statusBadgeLabel: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 12 },
  itemMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  itemMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  ratingText: { color: colors.sun, fontFamily: fonts.bodyBold, fontSize: 14 },
  itemNotes: { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});