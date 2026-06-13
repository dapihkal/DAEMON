import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import { deleteGlobalTag, getEntityKey, listAllEntityRefs, listEntityTags, renameGlobalTag } from '../src/db/cross-repositories';
import { listIdeas } from '../src/db/module-repositories';
import { listNotes, listProjects, listJournalEntries } from '../src/db/repositories';
import type { EntityRef, EntityTag, Idea, Note, Project, JournalEntry } from '../src/db/types';
import { useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/use-themed-styles';

type TagTarget = {
  id: string;
  kind: 'note' | 'project' | 'idea' | 'global' | 'journal';
  label: string;
  href: Href;
};

type TagBucket = {
  tag: string;
  items: TagTarget[];
};

const tagPalette = ['#2563eb', '#0891b2', '#c026d3', '#d97706', '#65a30d', '#dc2626', '#7c3aed'];

function getTagColor(tag: string) {
  const weight = [...tag].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tagPalette[weight % tagPalette.length];
}

export default function TagsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ tag?: string }>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [entityTags, setEntityTags] = useState<EntityTag[]>([]);
  const [entities, setEntities] = useState<EntityRef[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const [nextNotes, nextProjects, nextIdeas, nextEntityTags, nextEntities, nextJournalEntries] = await Promise.all([
        listNotes(db),
        listProjects(db),
        listIdeas(db),
        listEntityTags(db),
        listAllEntityRefs(db, { showSensitive: preferences.showSensitiveContent }),
        listJournalEntries(db),
      ]);

      if (!active) {
        return;
      }

      setNotes(nextNotes);
      setProjects(nextProjects);
      setIdeas(nextIdeas);
      setEntityTags(nextEntityTags);
      setEntities(nextEntities);
      setJournalEntries(nextJournalEntries);
    })();

    return () => {
      active = false;
    };
  }, [db, preferences.showSensitiveContent]);

  useFocusEffect(refresh);

  const tagBuckets = useMemo(() => {
    const map = new Map<string, TagTarget[]>();

    const add = (tag: string, item: TagTarget) => {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) {
        return;
      }

      const bucket = map.get(normalized) ?? [];
      bucket.push(item);
      map.set(normalized, bucket);
    };

    notes.forEach((note) => {
      note.tags.forEach((tag) => {
        add(tag, {
          id: note.id,
          kind: 'note',
          label: note.title,
          href: { pathname: '/notes' as const, params: { noteId: note.id } },
        });
      });
    });

    projects.forEach((project) => {
      project.tags.forEach((tag) => {
        add(tag, {
          id: project.id,
          kind: 'project',
          label: project.name,
          href: { pathname: '/pro' as const, params: { projectId: project.id } },
        });
      });
    });

    ideas.forEach((idea) => {
      idea.tags.forEach((tag) => {
        add(tag, {
          id: idea.id,
          kind: 'idea',
          label: idea.text,
          href: { pathname: '/idees' as const, params: { ideaId: idea.id } },
        });
      });
    });

    journalEntries.forEach((entry) => {
      if (entry.tags) {
        entry.tags.forEach((tag) => {
          add(tag, {
            id: entry.date,
            kind: 'journal',
            label: `Journal du ${new Date(`${entry.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`,
            href: { pathname: '/journal' as const, params: { date: entry.date } },
          });
        });
      }
    });

    const entityByKey = new Map(entities.map((entity) => [getEntityKey(entity), entity]));
    entityTags.forEach((entry) => {
      const entity = entityByKey.get(`${entry.entityKind}:${entry.entityId}`);
      add(entry.tag, {
        id: `${entry.entityKind}-${entry.entityId}-${entry.tag}`,
        kind: 'global',
        label: entity ? entity.label : `${entry.entityKind}:${entry.entityId}`,
        href: '/liens' as const,
      });
    });

    return [...map.entries()]
      .map(([tag, items]) => ({
        tag,
        items: [...items].sort((left, right) => left.label.localeCompare(right.label, 'fr-FR')),
      }))
      .sort((left, right) => left.tag.localeCompare(right.tag, 'fr-FR'));
  }, [entities, entityTags, ideas, notes, projects, journalEntries]);

  const activeBucket = selectedTag ? tagBuckets.find((bucket) => bucket.tag === selectedTag) ?? null : null;

  const refreshTags = useCallback(async () => {
    const [nextNotes, nextProjects, nextIdeas, nextEntityTags, nextEntities, nextJournalEntries] = await Promise.all([
      listNotes(db),
      listProjects(db),
      listIdeas(db),
      listEntityTags(db),
      listAllEntityRefs(db, { showSensitive: preferences.showSensitiveContent }),
      listJournalEntries(db),
    ]);

    setNotes(nextNotes);
    setProjects(nextProjects);
    setIdeas(nextIdeas);
    setEntityTags(nextEntityTags);
    setEntities(nextEntities);
    setJournalEntries(nextJournalEntries);
  }, [db, preferences.showSensitiveContent]);

  const handleRenameTag = async () => {
    if (!selectedTag) {
      return;
    }

    const nextTag = tagDraft.trim().replace(/^#/, '').toLowerCase();
    if (!nextTag || nextTag === selectedTag) {
      return;
    }

    const touched = await renameGlobalTag(db, { from: selectedTag, to: nextTag });
    await refreshTags();
    setSelectedTag(nextTag);
    setTagDraft('');
    setFeedback(`${touched} entrée${touched > 1 ? 's' : ''} mise${touched > 1 ? 's' : ''} à jour.`);
  };

  const handleDeleteTag = async () => {
    if (!selectedTag) {
      return;
    }

    const touched = await deleteGlobalTag(db, { tag: selectedTag });
    await refreshTags();
    setSelectedTag(null);
    setTagDraft('');
    setFeedback(`#${selectedTag} retiré de ${touched} entrée${touched > 1 ? 's' : ''}.`);
  };

  useFocusEffect(
    useCallback(() => {
      if (typeof params.tag !== 'string') {
        return undefined;
      }

      const normalized = params.tag.trim().toLowerCase();
      if (normalized) {
        setSelectedTag(normalized);
      }

      router.replace('/tags');
      return undefined;
    }, [params.tag, router]),
  );

  return (
    <AppShell kicker="Navigation transversale" title="Tags">
      <SectionTitle
        eyebrow="Index"
        title={selectedTag ? `#${selectedTag}` : 'Index des tags'}
        subtitle={
          selectedTag
            ? 'Chaque entrée renvoie vers son module ou vers le gestionnaire de liens.'
            : 'Les tags de Notes, Pro, Idées et les tags globaux sont regroupés dans un index commun.'
        }
      />

      {selectedTag ? (
        <Pressable onPress={() => setSelectedTag(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour aux tags</Text>
        </Pressable>
      ) : null}

      {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

      {!tagBuckets.length ? (
        <EmptyState
          title="Aucun tag"
          message="Ajoute des tags dans les notes, projets ou idées pour commencer à naviguer par thèmes."
        />
      ) : selectedTag && activeBucket ? (
        <>
          <View style={styles.editCard}>
            <View style={[styles.tagColorRail, { backgroundColor: getTagColor(selectedTag) }]} />
            <View style={styles.editMain}>
              <Text style={styles.editTitle}>Gestion du tag</Text>
              <Text style={styles.editBody}>Renommer vers un tag existant fusionne automatiquement les entrées.</Text>
              <View style={styles.inlineForm}>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setTagDraft}
                  placeholder="nouveau-tag"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={tagDraft}
                />
                <Pressable onPress={handleRenameTag} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonLabel}>Renommer</Text>
                </Pressable>
              </View>
              <Pressable onPress={handleDeleteTag} style={styles.deleteButton}>
                <Text style={styles.deleteButtonLabel}>Supprimer ce tag partout</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            {activeBucket.items.map((item, index) => (
              <Pressable
                key={`${item.kind}-${item.id}`}
                onPress={() => router.push(item.href)}
                style={[styles.row, index > 0 && styles.rowBorder]}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{item.label}</Text>
                  <Text style={styles.rowMeta}>{item.kind === 'note' ? 'Note' : item.kind === 'project' ? 'Projet pro' : item.kind === 'idea' ? 'Idée' : item.kind === 'journal' ? 'Journal' : 'Tag global'}</Text>
                </View>
                <Text style={styles.rowArrow}>›</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.tagWrap}>
          {tagBuckets.map((bucket) => (
            <Pressable key={bucket.tag} onPress={() => { setSelectedTag(bucket.tag); setFeedback(null); }} style={[styles.tagChip, { borderColor: getTagColor(bucket.tag) }]}>
              <View style={[styles.tagDot, { backgroundColor: getTagColor(bucket.tag) }]} />
              <Text style={styles.tagChipLabel}>#{bucket.tag} · {bucket.items.length}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
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
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tagDot: {
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  tagChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  feedback: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  editCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  tagColorRail: {
    borderRadius: radii.pill,
    width: 6,
  },
  editMain: {
    flex: 1,
    gap: spacing.sm,
  },
  editTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  editBody: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  inlineForm: {
    gap: spacing.sm,
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
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  deleteButtonLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  rowBorder: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  rowMain: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 18,
  },
  rowMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  rowArrow: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 22,
  },
});