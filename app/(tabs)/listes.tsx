import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../../src/components/app-shell';
import { EmptyState } from '../../src/components/empty-state';
import { SectionTitle } from '../../src/components/section-title';
import { SwipeActionRow } from '../../src/components/swipe-action-row';
import { useUndo } from '../../src/components/undo-toast';
import {
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  getChecklist,
  listChecklists,
  restoreChecklist,
  restoreChecklistItem,
  toggleChecklistItem,
} from '../../src/db/repositories';
import type { Checklist, ChecklistSummary } from '../../src/db/types';
import { confirmationHaptic, deletionHaptic, selectionHaptic, toggleHaptic } from '../../src/lib/haptics';
import { useTheme, useThemePreferences } from '../../src/theme/theme-provider';
import { fonts, radii, spacing } from '../../src/theme/tokens';

export default function ListesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const { showUndo } = useUndo();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = useLocalSearchParams<{ listId?: string }>();
  const [lists, setLists] = useState<ChecklistSummary[]>([]);
  const [activeList, setActiveList] = useState<Checklist | null>(null);
  const [draftListName, setDraftListName] = useState('');
  const [draftItemText, setDraftItemText] = useState('');

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const nextLists = await listChecklists(db);
      if (!active) {
        return;
      }

      setLists(nextLists);

      if (typeof params.listId === 'string') {
        const nextActiveList = await getChecklist(db, params.listId);
        if (active) {
          setActiveList(nextActiveList);
          if (nextActiveList) {
            setDraftItemText('');
          }
          router.replace('/listes');
        }
        return;
      }

      if (activeList) {
        const nextActiveList = await getChecklist(db, activeList.id);
        if (active) {
          setActiveList(nextActiveList);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [activeList, db, params.listId, router]);

  useFocusEffect(refresh);

  const openList = async (listId: string) => {
    const checklist = await getChecklist(db, listId);
    setActiveList(checklist);
    setDraftItemText('');
  };

  const handleCreateList = async () => {
    const created = await createChecklist(db, {
      name: draftListName,
    });

    if (!created) {
      return;
    }

    setDraftListName('');
    await confirmationHaptic(preferences.reduceMotion);
    await openList(created.id);
    setLists(await listChecklists(db));
  };

  const handleDeleteList = async (listId: string) => {
    const snapshot = await getChecklist(db, listId);
    await deleteChecklist(db, listId);
    if (activeList?.id === listId) {
      setActiveList(null);
      setDraftItemText('');
    }
    await deletionHaptic(preferences.reduceMotion);
    setLists(await listChecklists(db));

    if (snapshot) {
      showUndo({
        message: `Liste « ${snapshot.name} » supprimée`,
        onUndo: async () => {
          await restoreChecklist(db, snapshot);
          setLists(await listChecklists(db));
        },
      });
    }
  };

  const handleCreateItem = async () => {
    if (!activeList) {
      return;
    }

    const created = await createChecklistItem(db, {
      checklistId: activeList.id,
      text: draftItemText,
    });

    if (!created) {
      return;
    }

    setDraftItemText('');
    await confirmationHaptic(preferences.reduceMotion);
    setActiveList(await getChecklist(db, activeList.id));
    setLists(await listChecklists(db));
  };

  const handleToggleItem = async (itemId: string) => {
    if (!activeList) {
      return;
    }

    const item = activeList.items.find((entry) => entry.id === itemId);
    await toggleChecklistItem(db, itemId);
    await toggleHaptic(!(item?.done ?? false), preferences.reduceMotion);
    setActiveList(await getChecklist(db, activeList.id));
    setLists(await listChecklists(db));
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!activeList) {
      return;
    }

    const listId = activeList.id;
    const item = activeList.items.find((entry) => entry.id === itemId);
    await deleteChecklistItem(db, itemId);
    await deletionHaptic(preferences.reduceMotion);
    setActiveList(await getChecklist(db, listId));
    setLists(await listChecklists(db));

    if (item) {
      showUndo({
        message: `« ${item.text} » supprimé de la liste`,
        onUndo: async () => {
          await restoreChecklistItem(db, listId, item);
          const refreshed = await getChecklist(db, listId);
          setActiveList((current) => (current && current.id === listId ? refreshed : current));
          setLists(await listChecklists(db));
        },
      });
    }
  };

  if (activeList) {
    return (
      <AppShell kicker="Carnet" title={activeList.name}>
        <Pressable accessibilityLabel="Retour aux listes" accessibilityRole="button" onPress={() => setActiveList(null)} style={({ pressed }) => [styles.backButton, pressed && styles.pressedSoft]}>
          <Text style={styles.backLabel}>Retour aux listes</Text>
        </Pressable>

        <View style={styles.composerCard}>
          <Text style={styles.composerTitle}>Ajouter un élément</Text>
          <TextInput
            onChangeText={setDraftItemText}
            onSubmitEditing={handleCreateItem}
            placeholder="Courses, tâches, pense-bête..."
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draftItemText}
          />
          <Pressable accessibilityLabel="Ajouter l'élément à la liste" accessibilityRole="button" onPress={handleCreateItem} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedSoft]}>
            <Text style={styles.primaryButtonLabel}>Ajouter</Text>
          </Pressable>
        </View>

        <SectionTitle
          eyebrow="Détail"
          title="Contenu de la liste"
          subtitle="Ajout rapide, coche, suppression et consultation d'une liste précise."
        />

        {activeList.items.length ? (
          activeList.items.map((item) => (
            <SwipeActionRow
              accessibilityLabel={`Supprimer ${item.text}`}
              key={item.id}
              onAction={() => handleDeleteItem(item.id)}
            >
            <View style={styles.itemCard}>
              <Pressable
                accessibilityLabel={`${item.done ? 'Décocher' : 'Cocher'} ${item.text}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                onPress={() => handleToggleItem(item.id)}
                style={({ pressed }) => [styles.checkbox, item.done && styles.checkboxDone, pressed && styles.pressedSoft]}
              >
                <Text style={styles.checkboxLabel}>{item.done ? 'OK' : ''}</Text>
              </Pressable>
              <Text style={[styles.itemText, item.done && styles.itemTextDone]}>{item.text}</Text>
              <Pressable accessibilityLabel={`Supprimer ${item.text}`} accessibilityRole="button" onPress={() => handleDeleteItem(item.id)} style={({ pressed }) => [styles.deleteChip, pressed && styles.pressedSoft]}>
                <Text style={styles.deleteChipLabel}>Suppr.</Text>
              </Pressable>
            </View>
            </SwipeActionRow>
          ))
        ) : (
          <EmptyState title="Liste vide" message="Ajoute le premier élément, puis coche-le au fur et à mesure." />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell kicker="Carnet" title="Listes">
      <View style={styles.composerCard}>
        <Text style={styles.composerTitle}>Nouvelle liste</Text>
        <TextInput
          onChangeText={setDraftListName}
          onSubmitEditing={handleCreateList}
          placeholder="Courses, à faire, valise..."
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={draftListName}
        />
        <Pressable accessibilityLabel="Créer la liste" accessibilityRole="button" onPress={handleCreateList} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedSoft]}>
          <Text style={styles.primaryButtonLabel}>Créer la liste</Text>
        </Pressable>
      </View>


      {lists.length ? (
        lists.map((list) => {
          const progressLabel = list.itemCount
            ? `${list.doneCount}/${list.itemCount} terminé${list.doneCount > 1 ? 's' : ''}`
            : 'Vide';

          return (
            <SwipeActionRow
              accessibilityLabel={`Supprimer la liste ${list.name}`}
              key={list.id}
              onAction={() => handleDeleteList(list.id)}
            >
            <View style={styles.listCard}>
              <Pressable accessibilityLabel={`Ouvrir la liste ${list.name}`} accessibilityRole="button" onPress={() => { void selectionHaptic(preferences.reduceMotion); void openList(list.id); }} style={({ pressed }) => [styles.listMain, pressed && styles.pressedSoft]}>
                <Text style={styles.listName}>{list.name}</Text>
                <Text style={styles.listMeta}>{progressLabel}</Text>
              </Pressable>
              <Pressable accessibilityLabel={`Supprimer la liste ${list.name}`} accessibilityRole="button" onPress={() => handleDeleteList(list.id)} style={({ pressed }) => [styles.deleteChip, pressed && styles.pressedSoft]}>
                <Text style={styles.deleteChipLabel}>Suppr.</Text>
              </Pressable>
            </View>
            </SwipeActionRow>
          );
        })
      ) : (
        <EmptyState title="Aucune liste" message="Crée une liste pour organiser courses, projets ou idées au même endroit." />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedSoft: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
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
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
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
  listCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  listMain: {
    flex: 1,
    gap: spacing.xs,
    minHeight: 44,
    minWidth: 0,
    justifyContent: 'center',
  },
  listName: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  listMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  itemCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minWidth: 0,
    padding: spacing.lg,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  checkboxDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
  },
  itemText: {
    color: colors.text,
    flex: 1,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    minWidth: 0,
  },
  itemTextDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  deleteChip: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  deleteChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
});