import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { PeoplePicker } from '../src/components/people-picker';
import { SectionTitle } from '../src/components/section-title';
import { listPeople, listTemplates } from '../src/db/repositories';
import { cycleIdeaStatus, deleteIdea, listIdeas, saveIdea } from '../src/db/module-repositories';
import type { Idea, IdeaStatus, IdeaSubtask, Person, Template } from '../src/db/types';
import { ideaStatusOptions } from '../src/lib/module-options';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type IdeaDraft = {
  id: string | null;
  text: string;
  status: IdeaStatus;
  publishDate: string;
  pinned: boolean;
  people: string[];
  subtasks: IdeaSubtask[];
  createdAt: number | null;
};

function createEmptyDraft(): IdeaDraft {
  return {
    id: null,
    text: '',
    status: 'explorer',
    publishDate: '',
    pinned: false,
    people: [],
    subtasks: [],
    createdAt: null,
  };
}

function toDraft(idea: Idea): IdeaDraft {
  return {
    id: idea.id,
    text: idea.text,
    status: idea.status,
    publishDate: idea.publishDate,
    pinned: idea.pinned,
    people: [...idea.people],
    subtasks: idea.subtasks.map((subtask) => ({ ...subtask })),
    createdAt: idea.createdAt,
  };
}

function personName(people: Person[], personId: string) {
  return people.find((person) => person.id === personId)?.name ?? 'Contact';
}

export default function IdeesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ ideaId?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | IdeaStatus>('all');
  const [viewMode, setViewMode] = useState<'liste' | 'pipeline'>('liste');
  const [draft, setDraft] = useState<IdeaDraft | null>(null);
  const [quickText, setQuickText] = useState('');
  const [tagText, setTagText] = useState('');
  const [subtaskText, setSubtaskText] = useState('');

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    ideas.forEach((idea) => idea.tags.forEach((tag) => set.add(tag.trim().toLowerCase())));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr-FR'));
  }, [ideas]);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const [nextIdeas, nextPeople, nextTemplates] = await Promise.all([
        listIdeas(db),
        listPeople(db),
        listTemplates(db),
      ]);

      if (!active) {
        return;
      }

      setIdeas(nextIdeas);
      setPeople(nextPeople);
      setTemplates(nextTemplates);

      if (typeof params.ideaId === 'string') {
        const targetIdea = nextIdeas.find((idea) => idea.id === params.ideaId) ?? null;
        if (targetIdea) {
          setDraft(toDraft(targetIdea));
          setTagText(targetIdea.tags.join(', '));
        }
        router.replace('/idees');
      }
    })();

    return () => {
      active = false;
    };
  }, [db, params.ideaId, router]);

  useFocusEffect(refresh);

  const filteredIdeas = useMemo(() => {
    let result = ideas;
    if (statusFilter !== 'all') {
      result = result.filter((idea) => idea.status === statusFilter);
    }
    if (selectedTag) {
      result = result.filter((idea) => idea.tags.some((tag) => tag.trim().toLowerCase() === selectedTag));
    }
    const query = searchText.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (idea) =>
          idea.text.toLowerCase().includes(query) ||
          idea.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          idea.subtasks.some((subtask) => subtask.text.toLowerCase().includes(query)),
      );
    }
    return [...result].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  }, [ideas, statusFilter, selectedTag, searchText]);

  const statusCounts = useMemo(() => {
    const counts = new Map<IdeaStatus, number>();
    ideas.forEach((idea) => counts.set(idea.status, (counts.get(idea.status) ?? 0) + 1));
    return counts;
  }, [ideas]);

  const groupedIdeas = useMemo(() => {
    const activeIdeas = selectedTag
      ? ideas.filter((idea) => idea.tags.some((tag) => tag.trim().toLowerCase() === selectedTag))
      : ideas;
    return ideaStatusOptions.map((status) => ({
      ...status,
      ideas: activeIdeas.filter((idea) => idea.status === status.id),
    }));
  }, [ideas, selectedTag]);

  const openDraft = (idea: Idea | null) => {
    if (idea) {
      setDraft(toDraft(idea));
      setTagText(idea.tags.join(', '));
      setSubtaskText('');
      return;
    }

    setDraft(createEmptyDraft());
    setTagText('');
    setSubtaskText('');
  };

  const handleQuickAdd = async () => {
    if (!quickText.trim()) {
      return;
    }

    const saved = await saveIdea(db, {
      text: quickText.trim(),
      status: 'explorer',
      people: [],
      pinned: false,
      subtasks: [],
      tags: [],
      publishDate: '',
    });

    setQuickText('');
    if (saved) {
      setDraft(toDraft(saved));
    }
    setIdeas(await listIdeas(db));
  };

  const handleSave = async () => {
    if (!draft || !draft.text.trim()) {
      return;
    }

    const normalizedTags = [
      ...new Set(
        tagText
          .split(',')
          .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
          .filter(Boolean),
      ),
    ];

    const saved = await saveIdea(db, {
      id: draft.id ?? undefined,
      text: draft.text.trim(),
      status: draft.status,
      publishDate: draft.publishDate,
      pinned: draft.pinned,
      people: draft.people,
      subtasks: draft.subtasks,
      tags: normalizedTags,
      createdAt: draft.createdAt ?? undefined,
    });

    if (!saved) {
      return;
    }

    setDraft(null);
    setTagText('');
    setSubtaskText('');
    setIdeas(await listIdeas(db));
  };

  const handleDelete = () => {
    if (!draft?.id) {
      return;
    }

    Alert.alert('Supprimer cette idée ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteIdea(db, draft.id as string);
          setDraft(null);
          setTagText('');
          setSubtaskText('');
          setIdeas(await listIdeas(db));
        },
      },
    ]);
  };

  const handleCycleStatus = async (ideaId: string) => {
    await cycleIdeaStatus(db, ideaId);
    setIdeas(await listIdeas(db));
  };

  const addSubtask = () => {
    if (!draft || !subtaskText.trim()) {
      return;
    }

    setDraft({
      ...draft,
      subtasks: [
        ...draft.subtasks,
        {
          id: `subtask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: subtaskText.trim(),
          done: false,
        },
      ],
    });
    setSubtaskText('');
  };

  if (draft) {
    return (
      <AppShell kicker="Pipeline créatif" title={draft.id ? 'Modifier l\'idée' : 'Nouvelle idée'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour aux idées</Text>
        </Pressable>

        <View style={styles.editorCard}>
          {templates.length ? (
            <>
              <Text style={styles.fieldLabel}>Modèles</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroller} contentContainerStyle={styles.chipWrap}>
                {templates.map((template) => (
                  <Pressable
                    key={template.id}
                    onPress={() => setDraft((current) => (current ? { ...current, text: current.text ? `${current.text}\n\n${template.body}` : template.body } : current))}
                    style={styles.templateChip}
                  >
                    <Text style={styles.templateChipLabel}>{template.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, text: value } : current))}
            placeholder="Décris une idée..."
            placeholderTextColor={colors.muted}
            style={styles.textarea}
            textAlignVertical="top"
            value={draft.text}
          />

          <Text style={styles.fieldLabel}>Statut</Text>
          <View style={styles.chipWrap}>
            {ideaStatusOptions.map((status) => {
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

          <DateField
            allowClear
            label="Date de publication"
            onChange={(value) => setDraft((current) => (current ? { ...current, publishDate: value } : current))}
            value={draft.publishDate}
          />

          <Pressable onPress={() => setDraft((current) => (current ? { ...current, pinned: !current.pinned } : current))} style={[styles.toggleCard, draft.pinned && styles.toggleCardActive]}>
            <Text style={styles.toggleTitle}>{draft.pinned ? 'Épinglée' : 'Non épinglée'}</Text>
            <Text style={styles.toggleBody}>Les idées épinglées remontent en tête de liste.</Text>
          </Pressable>

          <Text style={styles.fieldLabel}>Tags</Text>
          <TextInput
            onChangeText={setTagText}
            placeholder="vidéo, client, idée forte"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={tagText}
          />

          <PeoplePicker
            entityKind="idea"
            entityId={null}
            label="Personnes à impliquer"
            onChange={(nextPeople) => setDraft((current) => (current ? { ...current, people: nextPeople } : current))}
            people={people}
            selectedIds={draft.people}
          />

          <Text style={styles.fieldLabel}>Sous-tâches</Text>
          <View style={styles.subtaskInputRow}>
            <TextInput
              blurOnSubmit={false}
              onChangeText={setSubtaskText}
              onSubmitEditing={addSubtask}
              placeholder="Ajouter une sous-tâche"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              style={[styles.input, styles.subtaskInput]}
              value={subtaskText}
            />
            <Pressable onPress={addSubtask} style={styles.smallButton}>
              <Text style={styles.smallButtonLabel}>Ajouter</Text>
            </Pressable>
          </View>
          <View style={styles.subtaskList}>
            {draft.subtasks.length ? (
              draft.subtasks.map((subtask) => (
                <View key={subtask.id} style={styles.subtaskRow}>
                  <Pressable
                    onPress={() =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              subtasks: current.subtasks.map((item) =>
                                item.id === subtask.id ? { ...item, done: !item.done } : item,
                              ),
                            }
                          : current,
                      )
                    }
                    style={[styles.checkbox, subtask.done && styles.checkboxActive]}
                  >
                    <Text style={styles.checkboxLabel}>{subtask.done ? '✓' : ''}</Text>
                  </Pressable>
                  <Text style={[styles.subtaskText, subtask.done && styles.subtaskTextDone]}>{subtask.text}</Text>
                  <Pressable
                    onPress={() =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              subtasks: current.subtasks.filter((item) => item.id !== subtask.id),
                            }
                          : current,
                      )
                    }
                    style={styles.deleteInlineButton}
                  >
                    <Text style={styles.deleteInlineLabel}>Supprimer</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={styles.helpText}>Aucune sous-tâche pour l'instant.</Text>
            )}
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              disabled={!draft.text.trim()}
              onPress={handleSave}
              style={[styles.primaryButton, !draft.text.trim() && styles.primaryButtonDisabled]}
            >
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
    <AppShell kicker="Projet" title="Idées">
      <SectionTitle
        eyebrow="Création"
        title="Pipeline créatif"
        subtitle="Capture rapide, pipeline, tags, sous-tâches et personnes à impliquer."
      />

      <View style={styles.quickComposerCard}>
        <TextInput
          multiline
          onChangeText={setQuickText}
          placeholder="Une idée à capturer tout de suite..."
          placeholderTextColor={colors.muted}
          style={styles.quickComposerInput}
          textAlignVertical="top"
          value={quickText}
        />
        {templates.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroller} contentContainerStyle={styles.chipWrap}>
            {templates.map((template) => (
              <Pressable
                key={template.id}
                onPress={() => setQuickText(template.body)}
                style={styles.templateChip}
              >
                <Text style={styles.templateChipLabel}>{template.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.buttonRow}>
          <Pressable onPress={handleQuickAdd} style={styles.primaryButton}>
            <Text style={styles.primaryButtonLabel}>Ajouter</Text>
          </Pressable>
          <Pressable onPress={() => openDraft(null)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonLabel}>Éditeur</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.modeRow}>
        <Pressable onPress={() => setViewMode('liste')} style={[styles.modeChip, viewMode === 'liste' && styles.modeChipActive]}>
          <Text style={[styles.modeChipLabel, viewMode === 'liste' && styles.modeChipLabelActive]}>Liste</Text>
        </Pressable>
        <Pressable onPress={() => setViewMode('pipeline')} style={[styles.modeChip, viewMode === 'pipeline' && styles.modeChipActive]}>
          <Text style={[styles.modeChipLabel, viewMode === 'pipeline' && styles.modeChipLabelActive]}>Pipeline</Text>
        </Pressable>
      </View>

      <View style={{ gap: spacing.sm }}>
        {viewMode === 'liste' ? (
          <>
            <TextInput
              onChangeText={setSearchText}
              placeholder="Rechercher dans les idées, tags, sous-tâches..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={searchText}
            />
            <View style={styles.filterRow}>
              <Pressable onPress={() => setStatusFilter('all')} style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}>
                <Text style={[styles.filterChipLabel, statusFilter === 'all' && styles.filterChipLabelActive]}>Toutes · {ideas.length}</Text>
              </Pressable>
              {ideaStatusOptions.map((status) => {
                const selected = statusFilter === status.id;
                const count = statusCounts.get(status.id) ?? 0;
                return (
                  <Pressable key={status.id} onPress={() => setStatusFilter(status.id)} style={[styles.filterChip, selected && { backgroundColor: status.color, borderColor: status.color }]}>
                    <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelActive]}>{status.label} · {count}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {uniqueTags.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: 4 }}
          >
            <Pressable
              onPress={() => setSelectedTag(null)}
              style={[
                styles.filterChip,
                selectedTag === null && styles.filterChipActive,
              ]}
            >
              <Text style={[styles.filterChipLabel, selectedTag === null && styles.filterChipLabelActive]}>
                Toutes les idées
              </Text>
            </Pressable>
            {uniqueTags.map((tag) => {
              const active = selectedTag === tag;
              return (
                <Pressable
                  key={tag}
                  onPress={() => setSelectedTag(active ? null : tag)}
                  style={[
                    styles.filterChip,
                    active && styles.filterChipActive,
                  ]}
                >
                  <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>
                    #{tag}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {ideas.length ? (
        viewMode === 'liste' ? (
          filteredIdeas.length ? (
            filteredIdeas.map((idea) => {
              const statusMeta = ideaStatusOptions.find((status) => status.id === idea.status) ?? ideaStatusOptions[0];
              const doneSubtasks = idea.subtasks.filter((subtask) => subtask.done).length;

              return (
                <Pressable key={idea.id} onPress={() => openDraft(idea)} style={[styles.ideaCard, idea.pinned && styles.ideaCardPinned]}>
                  <View style={styles.ideaHeader}>
                    <Text style={styles.ideaText}>{idea.pinned ? '★ ' : ''}{idea.text}</Text>
                    <Pressable onPress={() => handleCycleStatus(idea.id)} style={[styles.statusBadge, { backgroundColor: statusMeta.color }]}> 
                      <Text style={styles.statusBadgeLabel}>{statusMeta.label}</Text>
                    </Pressable>
                  </View>
                  {idea.publishDate ? (
                    <Text style={[styles.ideaMeta, idea.publishDate < new Date().toISOString().slice(0, 10) && styles.ideaMetaOverdue]}>
                      Publication : {idea.publishDate}
                    </Text>
                  ) : null}
                  {idea.subtasks.length ? (
                    <Text style={styles.ideaMeta}>{doneSubtasks}/{idea.subtasks.length} sous-tâches terminées</Text>
                  ) : null}
                  {idea.tags.length ? <Text style={styles.ideaMeta}>{idea.tags.map((tag) => `#${tag}`).join(' · ')}</Text> : null}
                  {idea.people.length ? (
                    <Text style={styles.ideaMeta}>{idea.people.slice(0, 3).map((personId) => personName(people, personId)).join(' · ')}</Text>
                  ) : null}
                </Pressable>
              );
            })
          ) : (
            <EmptyState title="Vide" message="Aucune idée dans ce filtre pour le moment." />
          )
        ) : (
          groupedIdeas.map((status) => (
            <View key={status.id} style={styles.pipelineSection}>
              <Text style={[styles.pipelineTitle, { color: status.color }]}>{status.label} · {status.ideas.length}</Text>
              {status.ideas.length ? (
                status.ideas.map((idea) => {
                  const doneSubtasks = idea.subtasks.filter((subtask) => subtask.done).length;
                  return (
                    <Pressable key={idea.id} onPress={() => openDraft(idea)} style={styles.pipelineCard}>
                      <Text style={styles.pipelineText}>{idea.pinned ? '★ ' : ''}{idea.text}</Text>
                      {idea.subtasks.length ? (
                        <Text style={styles.ideaMeta}>{doneSubtasks}/{idea.subtasks.length} sous-tâches</Text>
                      ) : null}
                    </Pressable>
                  );
                })
              ) : (
                <Text style={styles.helpText}>Aucune idée dans cette colonne.</Text>
              )}
            </View>
          ))
        )
      ) : (
        <EmptyState title="Aucune idée" message="Capture une première idée pour lancer le pipeline créatif." />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
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
    fieldLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    horizontalScroller: {
      maxHeight: 42,
    },
    chipWrap: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    templateChip: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    templateChipLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    textarea: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 15,
      minHeight: 140,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
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
    statusChip: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
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
    toggleCard: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.md,
    },
    toggleCardActive: {
      borderColor: colors.accent,
    },
    toggleTitle: {
      color: colors.text,
      fontFamily: fonts.title,
      fontSize: 18,
    },
    toggleBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13,
    },
    helpText: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
    },
    subtaskInputRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    subtaskInput: {
      flex: 1,
    },
    smallButton: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    smallButtonLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    subtaskList: {
      gap: spacing.sm,
    },
    subtaskRow: {
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
    },
    checkbox: {
      alignItems: 'center',
      borderColor: colors.lineStrong,
      borderRadius: radii.md,
      borderWidth: 2,
      height: 24,
      justifyContent: 'center',
      width: 24,
    },
    checkboxActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkboxLabel: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    subtaskText: {
      color: colors.text,
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
    },
    subtaskTextDone: {
      color: colors.muted,
      textDecorationLine: 'line-through',
    },
    deleteInlineButton: {
      paddingVertical: spacing.xs,
    },
    deleteInlineLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
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
      fontSize: 14,
    },
    primaryButtonDisabled: {
      opacity: 0.4,
    },
    ideaMetaOverdue: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
    },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      flex: 1,
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    secondaryButtonLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 14,
    },
    quickComposerCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg,
    },
    quickComposerInput: {
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 15,
      minHeight: 96,
      padding: 0,
    },
    modeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    modeChip: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    modeChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    modeChipLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    modeChipLabelActive: {
      color: colors.white,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    filterChip: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    filterChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    filterChipLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    filterChipLabelActive: {
      color: colors.white,
    },
    ideaCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.lg,
    },
    ideaCardPinned: {
      borderColor: colors.accent,
    },
    ideaHeader: {
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'space-between',
    },
    ideaText: {
      color: colors.text,
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 16,
      lineHeight: 22,
    },
    statusBadge: {
      alignItems: 'center',
      borderRadius: radii.pill,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    statusBadgeLabel: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    ideaMeta: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
    },
    pipelineSection: {
      gap: spacing.sm,
    },
    pipelineTitle: {
      fontFamily: fonts.mono,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    pipelineCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.md,
    },
    pipelineText: {
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 15,
      lineHeight: 20,
    },
  });