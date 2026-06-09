import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { PeoplePicker } from '../src/components/people-picker';
import { SectionTitle } from '../src/components/section-title';
import { replaceEntityPersonLinks } from '../src/db/cross-repositories';
import { deleteGame, listGames, saveGame } from '../src/db/module-repositories';
import type { Game, GameStatus } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type GameDraft = {
  id: string | null;
  name: string;
  platform: string;
  status: GameStatus;
  rating: number;
  date: string;
  notes: string;
  people: string[];
  createdAt: number | null;
};

function createEmptyDraft(): GameDraft {
  return {
    id: null,
    name: '',
    platform: '',
    status: 'aplayer',
    rating: 0,
    date: '',
    notes: '',
    people: [],
    createdAt: null,
  };
}

function toDraft(game: Game): GameDraft {
  return {
    id: game.id,
    name: game.name,
    platform: game.platform,
    status: game.status,
    rating: game.rating,
    date: game.date,
    notes: game.notes,
    people: [],
    createdAt: game.createdAt,
  };
}

function stars(value: number) {
  return '★'.repeat(value) + '☆'.repeat(Math.max(0, 5 - value));
}

export default function JeuxScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ gameId?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const gameStatusOptions = useMemo<Array<{ id: GameStatus; label: string; color: string }>>(() => [
    { id: 'aplayer', label: 'À jouer', color: '#a87bff' },
    { id: 'encours', label: 'En cours', color: '#ffb24a' },
    { id: 'fini', label: 'Fini', color: colors.accent },
    { id: 'abandon', label: 'Abandonné', color: '#8b95a9' },
  ], [colors.accent]);

  const [games, setGames] = useState<Game[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | GameStatus>('all');
  const [draft, setDraft] = useState<GameDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const nextGames = await listGames(db);
      if (active) {
        setGames(nextGames);

        if (typeof params.gameId === 'string') {
          const targetGame = nextGames.find((game) => game.id === params.gameId) ?? null;
          setDraft(targetGame ? toDraft(targetGame) : null);
          router.replace('/jeux');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [db, params.gameId, router]);

  useFocusEffect(refresh);

  const filteredGames = useMemo(
    () => (statusFilter === 'all' ? games : games.filter((game) => game.status === statusFilter)),
    [games, statusFilter],
  );

  const handleSave = async () => {
    if (!draft?.name.trim()) {
      return;
    }

    const saved = await saveGame(db, {
      id: draft.id ?? undefined,
      name: draft.name,
      platform: draft.platform,
      status: draft.status,
      rating: draft.rating,
      date: draft.date,
      notes: draft.notes,
      createdAt: draft.createdAt ?? undefined,
    });

    if (!saved) {
      return;
    }

    await replaceEntityPersonLinks(db, {
      entityKind: 'game',
      entityId: saved.id,
      personIds: draft.people,
    });

    setDraft(null);
    setGames(await listGames(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await replaceEntityPersonLinks(db, { entityKind: 'game', entityId: draft.id, personIds: [] });
    await deleteGame(db, draft.id);
    setDraft(null);
    setGames(await listGames(db));
  };

  if (draft) {
    return (
      <AppShell kicker="Joués" title={draft.id ? 'Modifier le jeu' : 'Nouveau jeu'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour aux jeux</Text>
        </Pressable>
        <View style={styles.editorCard}>
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))} placeholder="Nom du jeu" placeholderTextColor={colors.muted} style={styles.input} value={draft.name} />
          <TextInput onChangeText={(value) => setDraft((current) => (current ? { ...current, platform: value } : current))} placeholder="Plateforme" placeholderTextColor={colors.muted} style={styles.input} value={draft.platform} />
          <Text style={styles.fieldLabel}>Statut</Text>
          <View style={styles.chipWrap}>
            {gameStatusOptions.map((status) => {
              const selected = draft.status === status.id;
              return (
                <Pressable key={status.id} onPress={() => setDraft((current) => (current ? { ...current, status: status.id } : current))} style={[styles.statusChip, selected && { backgroundColor: status.color, borderColor: status.color }]}>
                  <Text style={[styles.statusChipLabel, selected && styles.statusChipLabelSelected]}>{status.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fieldLabel}>Note</Text>
          <View style={styles.chipWrap}>
            {[1, 2, 3, 4, 5].map((rating) => {
              const selected = draft.rating >= rating && draft.rating > 0;
              return (
                <Pressable key={rating} onPress={() => setDraft((current) => (current ? { ...current, rating } : current))} style={[styles.ratingChip, selected && styles.ratingChipSelected]}>
                  <Text style={[styles.ratingChipLabel, selected && styles.ratingChipLabelSelected]}>★</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setDraft((current) => (current ? { ...current, rating: 0 } : current))} style={[styles.ratingChip, draft.rating === 0 && styles.ratingChipSelected]}>
              <Text style={[styles.ratingChipLabel, draft.rating === 0 && styles.ratingChipLabelSelected]}>—</Text>
            </Pressable>
          </View>
          <DateField allowClear label="Date" onChange={(value) => setDraft((current) => (current ? { ...current, date: value } : current))} value={draft.date} />
          <PeoplePicker entityKind="game" entityId={draft.id} selectedIds={draft.people} onChange={(people) => setDraft((current) => (current ? { ...current, people } : current))} />
          <TextInput multiline onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))} placeholder="Avis, souvenir, progression..." placeholderTextColor={colors.muted} style={styles.textarea} textAlignVertical="top" value={draft.notes} />
          <View style={styles.buttonRow}>
            <Pressable onPress={handleSave} style={styles.primaryButton}><Text style={styles.primaryButtonLabel}>Enregistrer</Text></Pressable>
            {draft.id ? <Pressable onPress={handleDelete} style={styles.secondaryButton}><Text style={styles.secondaryButtonLabel}>Supprimer</Text></Pressable> : null}
          </View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell kicker="Joués" title="Jeux">
      <SectionTitle eyebrow="Collection" title="Joués et à jouer" subtitle="Collection de jeux avec statuts, plateforme, note, date et commentaire." />
      <Pressable onPress={() => setDraft(createEmptyDraft())} style={({ pressed }) => [styles.addButton, pressed && styles.pressedCard]}><Text style={styles.addButtonLabel}>+ Ajouter un jeu</Text></Pressable>
      <View style={styles.filterRow}>
        <Pressable onPress={() => setStatusFilter('all')} style={[styles.filterChip, statusFilter === 'all' && styles.filterChipSelected]}><Text style={[styles.filterChipLabel, statusFilter === 'all' && styles.filterChipLabelSelected]}>Tous</Text></Pressable>
        {gameStatusOptions.map((status) => {
          const selected = statusFilter === status.id;
          return <Pressable key={status.id} onPress={() => setStatusFilter(status.id)} style={[styles.filterChip, selected && { backgroundColor: status.color, borderColor: status.color }]}><Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>{status.label}</Text></Pressable>;
        })}
      </View>
      {filteredGames.length ? filteredGames.map((game) => {
        const statusMeta = gameStatusOptions.find((status) => status.id === game.status) ?? gameStatusOptions[0];
        return (
          <Pressable key={game.id} onPress={() => setDraft(toDraft(game))} style={({ pressed }) => [styles.itemCard, pressed && styles.pressedCard]}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>{game.name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusMeta.color }]}><Text style={styles.statusBadgeLabel}>{statusMeta.label}</Text></View>
            </View>
            {game.platform ? <Text style={styles.itemMeta}>{game.platform}</Text> : null}
            <View style={styles.itemMetaRow}>
              {game.rating ? <Text style={styles.ratingText}>{stars(game.rating)}</Text> : null}
              {game.date ? <Text style={styles.itemMeta}>{game.date}</Text> : null}
            </View>
            {game.notes ? <Text style={styles.itemNotes}>{game.notes}</Text> : null}
          </Pressable>
        );
      }) : <EmptyState title="Aucun jeu" message="Ajoute un premier jeu pour demarrer la collection." />}
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