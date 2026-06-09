import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { PeoplePicker } from '../src/components/people-picker';
import { SectionTitle } from '../src/components/section-title';
import { replaceEntityPersonLinks } from '../src/db/cross-repositories';
import { deleteConcert, listConcerts, saveConcert } from '../src/db/module-repositories';
import type { Concert } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type ConcertDraft = {
  id: string | null;
  name: string;
  venue: string;
  rating: number;
  date: string;
  notes: string;
  people: string[];
  createdAt: number | null;
};

function createEmptyDraft(): ConcertDraft {
  return { id: null, name: '', venue: '', rating: 0, date: '', notes: '', people: [], createdAt: null };
}

function toDraft(concert: Concert): ConcertDraft {
  return { id: concert.id, name: concert.name, venue: concert.venue, rating: concert.rating, date: concert.date, notes: concert.notes, people: [], createdAt: concert.createdAt };
}

function stars(value: number) {
  return '★'.repeat(value) + '☆'.repeat(Math.max(0, 5 - value));
}

export default function ConcertsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ concertId?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [draft, setDraft] = useState<ConcertDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;
    void (async () => {
      const nextConcerts = await listConcerts(db);
      if (active) {
        setConcerts(nextConcerts);

        if (typeof params.concertId === 'string') {
          const targetConcert = nextConcerts.find((concert) => concert.id === params.concertId) ?? null;
          setDraft(targetConcert ? toDraft(targetConcert) : null);
          router.replace('/concerts');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [db, params.concertId, router]);

  useFocusEffect(refresh);

  const handleSave = async () => {
    if (!draft?.name.trim()) {
      return;
    }

    const saved = await saveConcert(db, { id: draft.id ?? undefined, name: draft.name, venue: draft.venue, rating: draft.rating, date: draft.date, notes: draft.notes, createdAt: draft.createdAt ?? undefined });
    if (saved) {
      await replaceEntityPersonLinks(db, { entityKind: 'concert', entityId: saved.id, personIds: draft.people });
    }
    setDraft(null);
    setConcerts(await listConcerts(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await replaceEntityPersonLinks(db, { entityKind: 'concert', entityId: draft.id, personIds: [] });
    await deleteConcert(db, draft.id);
    setDraft(null);
    setConcerts(await listConcerts(db));
  };

  if (draft) {
    return (
      <AppShell kicker="Vus" title={draft.id ? 'Modifier le concert' : 'Nouveau concert'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}><Text style={styles.backLabel}>Retour aux concerts</Text></Pressable>
        <View style={styles.editorCard}>
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))} placeholder="Artiste ou concert" placeholderTextColor={colors.muted} style={styles.input} value={draft.name} />
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, venue: value } : current))} placeholder="Lieu ou salle" placeholderTextColor={colors.muted} style={styles.input} value={draft.venue} />
          <Text style={styles.fieldLabel}>Note</Text>
          <View style={styles.chipWrap}>{[1,2,3,4,5].map((rating) => { const selected = draft.rating >= rating && draft.rating > 0; return <Pressable key={rating} onPress={() => setDraft((current) => (current ? { ...current, rating } : current))} style={[styles.ratingChip, selected && styles.ratingChipSelected]}><Text style={[styles.ratingChipLabel, selected && styles.ratingChipLabelSelected]}>★</Text></Pressable>; })}<Pressable onPress={() => setDraft((current) => (current ? { ...current, rating: 0 } : current))} style={[styles.ratingChip, draft.rating === 0 && styles.ratingChipSelected]}><Text style={[styles.ratingChipLabel, draft.rating === 0 && styles.ratingChipLabelSelected]}>—</Text></Pressable></View>
          <DateField allowClear label="Date" onChange={(value) => setDraft((current) => (current ? { ...current, date: value } : current))} value={draft.date} />
          <PeoplePicker entityKind="concert" entityId={draft.id} selectedIds={draft.people} onChange={(people) => setDraft((current) => (current ? { ...current, people } : current))} />
          <TextInput multiline onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))} placeholder="Souvenir, ambiance, première partie..." placeholderTextColor={colors.muted} style={styles.textarea} textAlignVertical="top" value={draft.notes} />
          <View style={styles.buttonRow}><Pressable onPress={handleSave} style={styles.primaryButton}><Text style={styles.primaryButtonLabel}>Enregistrer</Text></Pressable>{draft.id ? <Pressable onPress={handleDelete} style={styles.secondaryButton}><Text style={styles.secondaryButtonLabel}>Supprimer</Text></Pressable> : null}</View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell contentMode="view" kicker="Vus" title="Concerts">
      <FlashList
        data={concerts}
        keyExtractor={(concert) => concert.id}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        ListHeaderComponent={(
          <View style={{ gap: spacing.md, marginBottom: spacing.md, marginTop: spacing.md }}>
            <SectionTitle eyebrow="Collection" title="Concerts vus en live" subtitle="Suivi des concerts avec lieu, date, note et commentaire." />
            <Pressable onPress={() => setDraft(createEmptyDraft())} style={({ pressed }) => [styles.addButton, pressed && styles.pressedCard]}><Text style={styles.addButtonLabel}>+ Ajouter un concert</Text></Pressable>
          </View>
        )}
        renderItem={({ item: concert }) => (
          <Pressable onPress={() => setDraft(toDraft(concert))} style={({ pressed }) => [styles.itemCard, pressed && styles.pressedCard]}>
            <Text style={styles.itemTitle}>{concert.name}</Text>
            {concert.venue ? <Text style={styles.itemMeta}>{concert.venue}</Text> : null}
            <View style={styles.itemMetaRow}>{concert.rating ? <Text style={styles.ratingText}>{stars(concert.rating)}</Text> : null}{concert.date ? <Text style={styles.itemMeta}>{concert.date}</Text> : null}</View>
            {concert.notes ? <Text style={styles.itemNotes}>{concert.notes}</Text> : null}
          </Pressable>
        )}
        ListEmptyComponent={<EmptyState title="Aucun concert" message="Ajoute un premier concert pour démarrer la collection." />}
      />
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedCard: { borderColor: colors.accent, opacity: 0.9, transform: [{ scale: 0.985 }] },
  backButton: { alignSelf: 'flex-start' },
  backLabel: { color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  editorCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.xl, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  input: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, color: colors.text, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  textarea: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, color: colors.text, fontFamily: fonts.body, fontSize: 15, minHeight: 120, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  fieldLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  itemCard: { alignSelf: 'stretch', backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderRadius: radii.xl, borderWidth: 1, gap: spacing.sm, minWidth: 0, padding: spacing.lg, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 18 },
  itemTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 21 },
  itemMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  itemMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  ratingText: { color: colors.sun, fontFamily: fonts.bodyBold, fontSize: 14 },
  itemNotes: { color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});