import { useCallback, useMemo, useState } from 'react';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../../src/components/app-shell';
import { EmptyState } from '../../src/components/empty-state';
import { PeoplePicker } from '../../src/components/people-picker';
import { SectionTitle } from '../../src/components/section-title';
import { SkeletonScreen } from '../../src/components/skeleton-screen';
import { SwipeActionRow } from '../../src/components/swipe-action-row';
import { useUndo } from '../../src/components/undo-toast';
import { listEntityPersonIds, replaceEntityPersonLinks } from '../../src/db/cross-repositories';
import { deleteNote, listNotes, restoreNote, saveNote, setNoteArchived, setNotePinned } from '../../src/db/repositories';
import type { Note } from '../../src/db/types';
import { confirmationHaptic, deletionHaptic, selectionHaptic } from '../../src/lib/haptics';
import { useTheme, useThemePreferences } from '../../src/theme/theme-provider';
import { fonts, radii, spacing } from '../../src/theme/tokens';

type NoteDraft = {
  id: string | null;
  title: string;
  body: string;
  tags: string;
  people: string[];
};

function createEmptyDraft(): NoteDraft {
  return {
    id: null,
    title: '',
    body: '',
    tags: '',
    people: [],
  };
}

function toDraft(note: Note): NoteDraft {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    tags: note.tags.join(', '),
    people: [],
  };
}

export default function NotesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const { showUndo } = useUndo();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{ noteId?: string }>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesReady, setNotesReady] = useState(false);
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft | null>(null);

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = useMemo(() => notes.filter((note) => note.archived).length, [notes]);

  const baseNotes = useMemo(
    () => notes.filter((note) => note.archived === showArchived),
    [notes, showArchived],
  );

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    baseNotes.forEach((note) => note.tags.forEach((tag) => set.add(tag.trim().toLowerCase())));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr-FR'));
  }, [baseNotes]);

  const filteredNotes = useMemo(() => {
    if (!selectedTag) {
      return baseNotes;
    }
    return baseNotes.filter((note) => note.tags.some((tag) => tag.trim().toLowerCase() === selectedTag));
  }, [baseNotes, selectedTag]);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const rows = await listNotes(db);
      if (active) {
        setNotes(rows);
        setNotesReady(true);

        if (typeof params.noteId === 'string') {
          const targetNote = rows.find((note) => note.id === params.noteId) ?? null;
          setDraft(targetNote ? toDraft(targetNote) : null);
          setFocusedNoteId(targetNote?.id ?? null);
          router.replace('/notes');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [db, params.noteId, router]);

  useFocusEffect(refresh);

  const handleCloseDraft = () => {
    if (!draft) {
      return;
    }

    let dirty: boolean;
    if (draft.id) {
      const original = notes.find((entry) => entry.id === draft.id);
      dirty = !original
        || draft.title !== original.title
        || draft.body !== original.body
        || draft.tags !== original.tags.join(', ');
    } else {
      dirty = Boolean(draft.title.trim() || draft.body.trim() || draft.tags.trim() || draft.people.length);
    }

    if (!dirty) {
      setDraft(null);
      return;
    }

    Alert.alert(
      'Modifications non enregistrées',
      'Tu as des changements non sauvegardés sur cette note.',
      [
        { text: "Continuer l'édition", style: 'cancel' },
        { text: 'Abandonner', style: 'destructive', onPress: () => setDraft(null) },
      ],
    );
  };

  const handleSave = async () => {
    if (!draft || (!draft.title.trim() && !draft.body.trim())) {
      return;
    }

    const saved = await saveNote(db, {
      id: draft.id ?? undefined,
      title: draft.title,
      body: draft.body,
      tags: draft.tags.split(',').map((entry) => entry.trim()).filter(Boolean),
    });

    if (saved) {
      await replaceEntityPersonLinks(db, {
        entityKind: 'note',
        entityId: saved.id,
        personIds: draft.people,
      });
    }

    await confirmationHaptic(preferences.reduceMotion);
    setDraft(null);
    setNotes(await listNotes(db));
  };

  const deleteNoteWithUndo = useCallback(
    async (note: Note) => {
      const personIds = await listEntityPersonIds(db, { entityKind: 'note', entityId: note.id });
      await replaceEntityPersonLinks(db, { entityKind: 'note', entityId: note.id, personIds: [] });
      await deleteNote(db, note.id);
      showUndo({
        message: `Note « ${note.title || 'sans titre'} » supprimée`,
        onUndo: async () => {
          await restoreNote(db, note);
          await replaceEntityPersonLinks(db, { entityKind: 'note', entityId: note.id, personIds });
          setNotes(await listNotes(db));
        },
      });
    },
    [db, showUndo],
  );

  const togglePin = useCallback(
    async (note: Note) => {
      await setNotePinned(db, note.id, !note.pinned);
      void selectionHaptic(preferences.reduceMotion);
      setNotes(await listNotes(db));
    },
    [db, preferences.reduceMotion],
  );

  const handleArchiveToggle = async () => {
    if (!draft?.id) {
      return;
    }

    const note = notes.find((entry) => entry.id === draft.id);
    await setNoteArchived(db, draft.id, !(note?.archived ?? false));
    await confirmationHaptic(preferences.reduceMotion);
    setDraft(null);
    setFocusedNoteId(null);
    setNotes(await listNotes(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    const note = notes.find((entry) => entry.id === draft.id);
    if (note) {
      await deleteNoteWithUndo(note);
    } else {
      await replaceEntityPersonLinks(db, { entityKind: 'note', entityId: draft.id, personIds: [] });
      await deleteNote(db, draft.id);
    }
    await deletionHaptic(preferences.reduceMotion);
    setDraft(null);
    setFocusedNoteId(null);
    setNotes(await listNotes(db));
  };

  const renderNote = useCallback<ListRenderItem<Note>>(
    ({ item: note }) => (
      <SwipeActionRow
        accessibilityLabel={`Supprimer la note ${note.title || 'sans titre'}`}
        key={note.id}
        onAction={async () => {
          await deleteNoteWithUndo(note);
          setFocusedNoteId((current) => (current === note.id ? null : current));
          setNotes(await listNotes(db));
        }}
      >
        <Pressable
          accessibilityLabel={`Modifier la note ${note.title || 'sans titre'}`}
          accessibilityRole="button"
          onPress={() => {
            void selectionHaptic(preferences.reduceMotion);
            setDraft(toDraft(note));
            setFocusedNoteId(note.id);
          }}
          style={({ pressed }) => [styles.noteCard, focusedNoteId === note.id && styles.noteCardFocused, pressed && styles.pressedCard]}
        >
          <View style={styles.noteHeaderRow}>
            <Text style={[styles.noteTitle, styles.noteTitleFlex]}>{note.title}</Text>
            {!note.archived ? (
              <Pressable
                accessibilityLabel={note.pinned ? `Désépingler la note ${note.title || 'sans titre'}` : `Épingler la note ${note.title || 'sans titre'}`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => void togglePin(note)}
                style={({ pressed }) => [styles.pinChip, note.pinned && styles.pinChipActive, pressed && styles.pressedSoft]}
              >
                <Text style={[styles.pinChipLabel, note.pinned && styles.pinChipLabelActive]}>
                  {note.pinned ? 'Épinglée' : 'Épingler'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text numberOfLines={3} style={styles.noteBody}>{note.body || 'Sans contenu detaille pour le moment.'}</Text>
          {note.tags.length ? (
            <View style={styles.tagRow}>
              {note.tags.map((tag) => (
                <Pressable
                  accessibilityLabel={`Ouvrir le tag ${tag}`}
                  accessibilityRole="button"
                  key={`${note.id}-${tag}`}
                  onPress={() => router.push({ pathname: '/tags', params: { tag } })}
                  style={({ pressed }) => [styles.tagChip, pressed && styles.pressedSoft]}
                >
                  <Text style={styles.tagChipLabel}>#{tag}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.noteMeta}>{new Date(note.updatedAt).toLocaleString('fr-FR')}</Text>
          {focusedNoteId === note.id ? <Text style={styles.focusedMeta}>Ouverte depuis la recherche</Text> : null}
        </Pressable>
      </SwipeActionRow>
    ),
    [db, deleteNoteWithUndo, focusedNoteId, preferences.reduceMotion, router, styles, togglePin],
  );

  if (draft) {
    return (
      <AppShell kicker="Carnet" title={draft.id ? 'Modifier la note' : 'Nouvelle note'}>
        <Pressable accessibilityLabel="Retour aux notes" accessibilityRole="button" onPress={handleCloseDraft} style={({ pressed }) => [styles.backButton, pressed && styles.pressedSoft]}>
          <Text style={styles.backLabel}>Retour aux notes</Text>
        </Pressable>

        <View style={styles.composerCard}>
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, title: value } : current))}
            placeholder="Titre"
            placeholderTextColor={colors.muted}
            style={styles.titleInput}
            value={draft.title}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, body: value } : current))}
            placeholder="Écris ici..."
            placeholderTextColor={colors.muted}
            style={styles.bodyInput}
            textAlignVertical="top"
            value={draft.body}
          />
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, tags: value } : current))}
            placeholder="Tags séparés par des virgules"
            placeholderTextColor={colors.muted}
            style={styles.titleInput}
            value={draft.tags}
          />

          <PeoplePicker
            entityKind="note"
            entityId={draft.id}
            selectedIds={draft.people}
            onChange={(people) => setDraft((current) => (current ? { ...current, people } : current))}
          />

          <View style={styles.actionRow}>
            <Pressable accessibilityLabel="Enregistrer la note" accessibilityRole="button" onPress={handleSave} style={({ pressed }) => [styles.primaryButton, styles.flexButton, pressed && styles.pressedSoft]}>
              <Text style={styles.primaryButtonLabel}>Enregistrer</Text>
            </Pressable>
            {draft.id ? (
              <Pressable accessibilityLabel="Supprimer la note" accessibilityRole="button" onPress={handleDelete} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedSoft]}>
                <Text style={styles.secondaryButtonLabel}>Supprimer</Text>
              </Pressable>
            ) : null}
          </View>

          {draft.id ? (
            <Pressable
              accessibilityLabel={notes.find((entry) => entry.id === draft.id)?.archived ? 'Désarchiver la note' : 'Archiver la note'}
              accessibilityRole="button"
              onPress={handleArchiveToggle}
              style={({ pressed }) => [styles.archiveButton, pressed && styles.pressedSoft]}
            >
              <Text style={styles.archiveButtonLabel}>
                {notes.find((entry) => entry.id === draft.id)?.archived ? 'Désarchiver cette note' : 'Archiver cette note'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </AppShell>
    );
  }

  if (!notesReady) {
    return (
      <AppShell kicker="Capture" title="Notes">
        <Pressable accessibilityLabel="Créer une nouvelle note" accessibilityRole="button" onPress={() => setDraft(createEmptyDraft())} style={({ pressed }) => [styles.newNoteButton, pressed && styles.pressedCard]}>
          <Text style={styles.newNoteButtonLabel}>+ Nouvelle note</Text>
        </Pressable>
        <SkeletonScreen rows={4} />
      </AppShell>
    );
  }

  return (
    <AppShell contentMode="view" kicker="Capture" title="Notes">
      <FlashList
        contentContainerStyle={styles.notesListContent}
        data={filteredNotes}
        drawDistance={420}
        ItemSeparatorComponent={() => <View style={styles.noteSeparator} />}
        keyExtractor={(note) => note.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          showArchived
            ? <EmptyState title="Aucune archive" message="Les notes archivées apparaîtront ici, hors de la vue principale." />
            : <EmptyState title="Aucune note" message="Créer une note ici doit toujours rester plus rapide que la remettre à plus tard." />
        }
        ListHeaderComponent={(
          <View style={{ gap: spacing.md }}>
            <Pressable accessibilityLabel="Créer une nouvelle note" accessibilityRole="button" onPress={() => setDraft(createEmptyDraft())} style={({ pressed }) => [styles.newNoteButton, pressed && styles.pressedCard]}>
              <Text style={styles.newNoteButtonLabel}>+ Nouvelle note</Text>
            </Pressable>
            {archivedCount > 0 || showArchived ? (
              <Pressable
                accessibilityLabel={showArchived ? 'Revenir aux notes actives' : 'Afficher les notes archivées'}
                accessibilityRole="button"
                onPress={() => {
                  void selectionHaptic(preferences.reduceMotion);
                  setSelectedTag(null);
                  setShowArchived((current) => !current);
                }}
                style={({ pressed }) => [styles.archiveToggle, showArchived && styles.archiveToggleActive, pressed && styles.pressedSoft]}
              >
                <Text style={[styles.archiveToggleLabel, showArchived && styles.archiveToggleLabelActive]}>
                  {showArchived ? '← Retour aux notes actives' : `Archives (${archivedCount})`}
                </Text>
              </Pressable>
            ) : null}
            {uniqueTags.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: 4 }}
              >
                <Pressable
                  onPress={() => setSelectedTag(null)}
                  style={({ pressed }) => [
                    styles.tagChip,
                    selectedTag === null && { backgroundColor: colors.accent, borderColor: colors.accent },
                    pressed && styles.pressedSoft,
                  ]}
                >
                  <Text style={[styles.tagChipLabel, selectedTag === null && { color: colors.white }]}>
                    Tout
                  </Text>
                </Pressable>
                {uniqueTags.map((tag) => {
                  const active = selectedTag === tag;
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => setSelectedTag(active ? null : tag)}
                      style={({ pressed }) => [
                        styles.tagChip,
                        active && { backgroundColor: colors.accent, borderColor: colors.accent },
                        pressed && styles.pressedSoft,
                      ]}
                    >
                      <Text style={[styles.tagChipLabel, active && { color: colors.white }]}>
                        #{tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        )}
        ListHeaderComponentStyle={styles.notesListHeader}
        renderItem={renderNote}
        showsVerticalScrollIndicator={false}
        style={styles.notesList}
      />
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedSoft: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  pressedCard: {
    borderColor: colors.accent,
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  composerCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  composerTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 24,
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
  newNoteButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  newNoteButtonLabel: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
  },
  titleInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  bodyInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    minHeight: 138,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  flexButton: {
    flex: 1,
    minWidth: 0,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    flexShrink: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryButtonLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  noteCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    minWidth: 0,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  noteCardFocused: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  noteHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  noteTitleFlex: {
    flex: 1,
    minWidth: 0,
  },
  pinChip: {
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  pinChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pinChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  pinChipLabelActive: {
    color: colors.white,
  },
  archiveToggle: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  archiveToggleActive: {
    borderColor: colors.accent,
  },
  archiveToggleLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  archiveToggleLabelActive: {
    color: colors.accent,
  },
  archiveButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  archiveButtonLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  noteTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  noteBody: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    minWidth: 0,
  },
  tagChip: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  tagChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  noteMeta: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  focusedMeta: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  notesList: {
    alignSelf: 'stretch',
    flex: 1,
  },
  notesListContent: {
    paddingBottom: spacing.lg,
  },
  notesListHeader: {
    marginBottom: spacing.lg,
  },
  noteSeparator: {
    height: spacing.lg,
  },
});
