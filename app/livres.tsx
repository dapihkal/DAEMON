import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import { deleteBook, listBooks, saveBook } from '../src/db/repositories';
import type { Book, BookStatus } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/use-themed-styles';

type BookDraft = {
  id: string | null;
  name: string;
  author: string;
  status: BookStatus;
  rating: number;
  date: string;
  notes: string;
  createdAt: number | null;
};

type SortKey = 'recent' | 'title' | 'rating';

function createEmptyDraft(): BookDraft {
  return {
    id: null,
    name: '',
    author: '',
    status: 'alire',
    rating: 0,
    date: '',
    notes: '',
    createdAt: null,
  };
}

function toDraft(book: Book): BookDraft {
  return {
    id: book.id,
    name: book.name,
    author: book.author,
    status: book.status,
    rating: book.rating,
    date: book.date,
    notes: book.notes,
    createdAt: book.createdAt,
  };
}

function stars(value: number) {
  return '★'.repeat(value) + '☆'.repeat(Math.max(0, 5 - value));
}

function formatDate(value: string) {
  if (!value) {
    return 'Sans date';
  }

  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: 'recent', label: 'Récents' },
  { id: 'title', label: 'Titre' },
  { id: 'rating', label: 'Note' },
];

export default function LivresScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const bookStatuses = useMemo<Array<{ id: BookStatus; label: string; color: string }>>(() => [
    { id: 'alire', label: 'À lire', color: '#a87bff' },
    { id: 'encours', label: 'En cours', color: '#ffb24a' },
    { id: 'lu', label: 'Lu', color: colors.accent },
    { id: 'abandon', label: 'Abandonné', color: '#8b95a9' },
  ], [colors.accent]);

  const params = useLocalSearchParams<{ bookId?: string }>();
  const [books, setBooks] = useState<Book[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | BookStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<BookDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const nextBooks = await listBooks(db);
      if (!active) {
        return;
      }

      setBooks(nextBooks);

      if (typeof params.bookId === 'string') {
        const targetBook = nextBooks.find((book) => book.id === params.bookId) ?? null;
        setDraft(targetBook ? toDraft(targetBook) : null);
        router.replace('/livres');
      }
    })();

    return () => {
      active = false;
    };
  }, [db, params.bookId, router]);

  useFocusEffect(refresh);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: books.length };
    for (const book of books) {
      counts[book.status] = (counts[book.status] ?? 0) + 1;
    }
    return counts;
  }, [books]);

  const visibleBooks = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = books.filter((book) => {
      const matchStatus = statusFilter === 'all' || book.status === statusFilter;
      if (!matchStatus) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        book.name.toLowerCase().includes(query) ||
        book.author.toLowerCase().includes(query)
      );
    });

    const sorted = [...filtered];
    if (sortKey === 'title') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    } else if (sortKey === 'rating') {
      sorted.sort((a, b) => b.rating - a.rating || (b.createdAt ?? 0) - (a.createdAt ?? 0));
    } else {
      sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }

    return sorted;
  }, [books, statusFilter, sortKey, search]);

  const handleSave = async () => {
    const name = draft?.name.trim();
    if (!draft || !name) {
      return;
    }

    await saveBook(db, {
      id: draft.id ?? undefined,
      name,
      author: draft.author.trim(),
      status: draft.status,
      rating: draft.rating,
      date: draft.date,
      notes: draft.notes.trim(),
      createdAt: draft.createdAt ?? undefined,
    });

    setDraft(null);
    setBooks(await listBooks(db));
  };

  const confirmDelete = () => {
    if (!draft?.id) {
      return;
    }

    Alert.alert(
      'Supprimer ce livre ?',
      `« ${draft.name} » sera retiré de la bibliothèque.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteBook(db, draft.id as string);
            setDraft(null);
            setBooks(await listBooks(db));
          },
        },
      ],
    );
  };

  if (draft) {
    return (
      <AppShell kicker="Lus" title={draft.id ? 'Modifier le livre' : 'Nouveau livre'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour aux livres</Text>
        </Pressable>

        <View style={styles.editorCard}>
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))}
            placeholder="Nom du livre"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.name}
          />
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, author: value } : current))}
            placeholder="Auteur"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.author}
          />

          <Text style={styles.fieldLabel}>Statut</Text>
          <View style={styles.chipWrap}>
            {bookStatuses.map((status) => {
              const selected = draft.status === status.id;
              return (
                <Pressable
                  key={status.id}
                  onPress={() => setDraft((current) => (current ? { ...current, status: status.id } : current))}
                  style={[styles.statusChip, selected && { backgroundColor: status.color, borderColor: status.color }]}
                >
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
                <Pressable
                  key={rating}
                  onPress={() => setDraft((current) => (current ? { ...current, rating } : current))}
                  style={[styles.ratingChip, selected && styles.ratingChipSelected]}
                >
                  <Text style={[styles.ratingChipLabel, selected && styles.ratingChipLabelSelected]}>★</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setDraft((current) => (current ? { ...current, rating: 0 } : current))} style={[styles.ratingChip, draft.rating === 0 && styles.ratingChipSelected]}>
              <Text style={[styles.ratingChipLabel, draft.rating === 0 && styles.ratingChipLabelSelected]}>—</Text>
            </Pressable>
          </View>

          <DateField
            allowClear
            label="Date"
            onChange={(value) => setDraft((current) => (current ? { ...current, date: value } : current))}
            value={draft.date}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))}
            placeholder="Avis, souvenir..."
            placeholderTextColor={colors.muted}
            style={styles.textarea}
            textAlignVertical="top"
            value={draft.notes}
          />

          <View style={styles.buttonRow}>
            <Pressable onPress={handleSave} style={styles.primaryButton}>
              <Text style={styles.primaryButtonLabel}>Enregistrer</Text>
            </Pressable>
            {draft.id ? (
              <Pressable onPress={confirmDelete} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonLabel}>Supprimer</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </AppShell>
    );
  }

  const filtersWithAll: Array<{ id: 'all' | BookStatus; label: string; color?: string }> = [
    { id: 'all', label: 'Tous' },
    ...bookStatuses,
  ];

  return (
    <AppShell kicker="Lus" title="Livres">
      <SectionTitle
        eyebrow="Bibliothèque"
        title="Lectures suivies"
        subtitle="Statut, auteur, note, date et commentaire dans un même flux."
      />

      <Pressable onPress={() => setDraft(createEmptyDraft())} style={styles.addButton}>
        <Text style={styles.addButtonLabel}>+ Ajouter un livre</Text>
      </Pressable>

      <TextInput
        onChangeText={setSearch}
        placeholder="Rechercher un titre ou un auteur"
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        value={search}
      />

      <View style={styles.filterRow}>
        {filtersWithAll.map((status) => {
          const selected = statusFilter === status.id;
          const count = statusCounts[status.id] ?? 0;
          const accent = status.color ?? colors.accent;
          return (
            <Pressable
              key={status.id}
              onPress={() => setStatusFilter(status.id)}
              style={[styles.filterChip, selected && { backgroundColor: accent, borderColor: accent }]}
            >
              <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>
                {status.label} · {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Trier</Text>
        {SORT_OPTIONS.map((option) => {
          const selected = sortKey === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setSortKey(option.id)}
              style={[styles.sortChip, selected && styles.sortChipSelected]}
            >
              <Text style={[styles.sortChipLabel, selected && styles.sortChipLabelSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {visibleBooks.length ? (
        visibleBooks.map((book) => {
          const statusMeta = bookStatuses.find((status) => status.id === book.status) ?? bookStatuses[0];

          return (
            <Pressable key={book.id} onPress={() => setDraft(toDraft(book))} style={({ pressed }) => [styles.bookCard, pressed && styles.pressedCard]}>
              <View style={styles.bookHeader}>
                <Text style={styles.bookName}>{book.name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusMeta.color }]}>
                  <Text style={styles.statusBadgeLabel}>{statusMeta.label}</Text>
                </View>
              </View>
              {book.author ? <Text style={styles.bookAuthor}>{book.author}</Text> : null}
              <View style={styles.bookMetaRow}>
                {book.rating ? <Text style={styles.bookRating}>{stars(book.rating)}</Text> : null}
                {book.date ? <Text style={styles.bookMeta}>{formatDate(book.date)}</Text> : null}
              </View>
              {book.notes ? <Text style={styles.bookNotes}>{book.notes}</Text> : null}
            </Pressable>
          );
        })
      ) : (
        <EmptyState
          title={search.trim() || statusFilter !== 'all' ? 'Aucun résultat' : 'Aucun livre'}
          message={
            search.trim() || statusFilter !== 'all'
              ? 'Aucun livre ne correspond à ce filtre ou cette recherche.'
              : 'Ajoute une première lecture pour démarrer la bibliothèque.'
          }
        />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedCard: {
    borderColor: colors.accent,
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  editorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  textarea: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    minHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusChip: {
    backgroundColor: colors.chip,
    borderColor: colors.chip,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  statusChipLabelSelected: {
    color: colors.white,
  },
  ratingChip: {
    backgroundColor: colors.chip,
    borderColor: colors.chip,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ratingChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  ratingChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  ratingChipLabelSelected: {
    color: colors.white,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryButtonLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  addButtonLabel: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterChip: {
    backgroundColor: colors.chip,
    borderColor: colors.chip,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  filterChipLabelSelected: {
    color: colors.white,
  },
  sortRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sortLabel: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sortChip: {
    backgroundColor: colors.chip,
    borderColor: colors.chip,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs ?? spacing.sm,
  },
  sortChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sortChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  sortChipLabelSelected: {
    color: colors.white,
  },
  bookCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.sm,
    minWidth: 0,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  bookHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  bookName: {
    color: colors.text,
    flex: 1,
    fontFamily: fonts.title,
    fontSize: 22,
    minWidth: 0,
  },
  statusBadge: {
    borderRadius: radii.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusBadgeLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  bookAuthor: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  bookMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  bookRating: {
    color: colors.warning,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 1,
  },
  bookMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  bookNotes: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
});
