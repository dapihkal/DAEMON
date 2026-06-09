import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

export default function LivresScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const bookStatuses = useMemo<Array<{ id: BookStatus; label: string; color: string }>>(() => [
    { id: 'alire', label: 'À lire', color: '#a87bff' },
    { id: 'encours', label: 'En cours', color: '#ffb24a' },
    { id: 'lu', label: 'Lu', color: colors.accent },
    { id: 'abandon', label: 'Abandonné', color: '#8b95a9' },
  ], [colors.accent]);

  const params = useLocalSearchParams<{ bookId?: string }>();
  const [books, setBooks] = useState<Book[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | BookStatus>('all');
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

  const filteredBooks = useMemo(
    () => (statusFilter === 'all' ? books : books.filter((book) => book.status === statusFilter)),
    [books, statusFilter],
  );

  const handleSave = async () => {
    if (!draft?.name.trim()) {
      return;
    }

    await saveBook(db, {
      id: draft.id ?? undefined,
      name: draft.name,
      author: draft.author,
      status: draft.status,
      rating: draft.rating,
      date: draft.date,
      notes: draft.notes,
      createdAt: draft.createdAt ?? undefined,
    });

    setDraft(null);
    setBooks(await listBooks(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deleteBook(db, draft.id);
    setDraft(null);
    setBooks(await listBooks(db));
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
              <Pressable onPress={handleDelete} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonLabel}>Supprimer</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </AppShell>
    );
  }

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

      <View style={styles.filterRow}>
        <Pressable onPress={() => setStatusFilter('all')} style={[styles.filterChip, statusFilter === 'all' && styles.filterChipSelected]}>
          <Text style={[styles.filterChipLabel, statusFilter === 'all' && styles.filterChipLabelSelected]}>Tous</Text>
        </Pressable>
        {bookStatuses.map((status) => {
          const selected = statusFilter === status.id;
          return (
            <Pressable key={status.id} onPress={() => setStatusFilter(status.id)} style={[styles.filterChip, selected && { backgroundColor: status.color, borderColor: status.color }]}>
              <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>{status.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {filteredBooks.length ? (
        filteredBooks.map((book) => {
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
        <EmptyState title="Aucun livre" message="Ajoute une première lecture pour démarrer la bibliothèque." />
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