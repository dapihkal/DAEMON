import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { PeoplePicker } from '../src/components/people-picker';
import { SectionTitle } from '../src/components/section-title';
import { cycleProjectStatus, deleteProject, getProject, listPeople, listProjects, saveProject } from '../src/db/repositories';
import type { Person, Project, ProjectStatus } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type ProjectDraft = {
  id: string | null;
  name: string;
  status: ProjectStatus;
  deadline: string;
  people: string[];
  notes: string;
  tags: string;
  createdAt: number | null;
};

function createEmptyDraft(): ProjectDraft {
  return {
    id: null,
    name: '',
    status: 'prospect',
    deadline: '',
    people: [],
    notes: '',
    tags: '',
    createdAt: null,
  };
}

function toDraft(project: Project): ProjectDraft {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    deadline: project.deadline,
    people: [...project.people],
    notes: project.notes,
    tags: project.tags.join(', '),
    createdAt: project.createdAt,
  };
}

function formatDeadline(value: string) {
  if (!value) {
    return 'Sans échéance';
  }

  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ProScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const projectStatuses = useMemo<Array<{ id: ProjectStatus; label: string; color: string }>>(() => [
    { id: 'prospect', label: 'Prospect', color: '#a87bff' },
    { id: 'encours', label: 'En cours', color: '#ffb24a' },
    { id: 'termine', label: 'Terminé', color: colors.accent },
  ], [colors.accent]);

  const params = useLocalSearchParams<{ projectId?: string }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [draft, setDraft] = useState<ProjectDraft | null>(null);

  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((project) => project.tags.forEach((tag) => set.add(tag.trim().toLowerCase())));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr-FR'));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    let result = projects;
    if (statusFilter !== 'all') {
      result = result.filter((project) => project.status === statusFilter);
    }
    if (selectedTag) {
      result = result.filter((project) => project.tags.some((tag) => tag.trim().toLowerCase() === selectedTag));
    }
    return result;
  }, [projects, statusFilter, selectedTag]);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const [nextProjects, nextPeople] = await Promise.all([listProjects(db), listPeople(db)]);
      if (active) {
        setProjects(nextProjects);
        setPeople(nextPeople);
      }

      if (typeof params.projectId === 'string') {
        const targetProject = await getProject(db, params.projectId);
        if (active) {
          setDraft(targetProject ? toDraft(targetProject) : null);
          router.replace('/pro');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [db, params.projectId, router]);

  useFocusEffect(refresh);

  const handleSave = async () => {
    if (!draft) {
      return;
    }

    const saved = await saveProject(db, {
      id: draft.id ?? undefined,
      name: draft.name,
      status: draft.status,
      deadline: draft.deadline,
      people: draft.people,
      notes: draft.notes,
      tags: draft.tags.split(',').map((entry) => entry.trim()).filter(Boolean),
      createdAt: draft.createdAt ?? undefined,
    });

    if (!saved) {
      return;
    }

    setDraft(null);
    setProjects(await listProjects(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deleteProject(db, draft.id);
    setDraft(null);
    setProjects(await listProjects(db));
  };

  const handleCycleStatus = async (projectId: string) => {
    await cycleProjectStatus(db, projectId);
    setProjects(await listProjects(db));
  };

  if (draft) {
    return (
      <AppShell kicker="Travail" title={draft.id ? 'Modifier un projet' : 'Nouveau projet'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour aux projets</Text>
        </Pressable>

        <View style={styles.editorCard}>
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))}
            placeholder="Nom du projet ou client"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.name}
          />

          <Text style={styles.fieldLabel}>Statut</Text>
          <View style={styles.chipWrap}>
            {projectStatuses.map((status) => {
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
            label="Échéance"
            onChange={(value) => setDraft((current) => (current ? { ...current, deadline: value } : current))}
            value={draft.deadline}
          />
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, tags: value } : current))}
            placeholder="Tags séparés par des virgules"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.tags}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, notes: value } : current))}
            placeholder="Notes, livrables, contexte..."
            placeholderTextColor={colors.muted}
            style={styles.textarea}
            textAlignVertical="top"
            value={draft.notes}
          />

          <PeoplePicker
            entityKind="project"
            entityId={null}
            label="Collaborateurs"
            onChange={(nextPeople) => setDraft((current) => (current ? { ...current, people: nextPeople } : current))}
            people={people}
            selectedIds={draft.people}
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
    <AppShell kicker="Carnet" title="Pro">
      <SectionTitle
        eyebrow="Pilotage"
        title="Projets et échéances"
        subtitle="Statut, échéance, notes, tags et collaborateurs reliés au Cercle."
      />

      <Pressable onPress={() => setDraft(createEmptyDraft())} style={styles.addButton}>
        <Text style={styles.addButtonLabel}>+ Nouveau projet</Text>
      </Pressable>

      <View style={{ gap: spacing.sm }}>
        <View style={styles.filterRow}>
          <Pressable onPress={() => setStatusFilter('all')} style={[styles.filterChip, statusFilter === 'all' && styles.filterChipSelected]}>
            <Text style={[styles.filterChipLabel, statusFilter === 'all' && styles.filterChipLabelSelected]}>Tous</Text>
          </Pressable>
          {projectStatuses.map((status) => {
            const selected = statusFilter === status.id;
            return (
              <Pressable key={status.id} onPress={() => setStatusFilter(status.id)} style={[styles.filterChip, selected && { backgroundColor: status.color, borderColor: status.color }]}>
                <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelSelected]}>{status.label}</Text>
              </Pressable>
            );
          })}
        </View>

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
                selectedTag === null && styles.filterChipSelected,
              ]}
            >
              <Text style={[styles.filterChipLabel, selectedTag === null && styles.filterChipLabelSelected]}>
                Tous les tags
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
                    active && styles.filterChipSelected,
                  ]}
                >
                  <Text style={[styles.filterChipLabel, active && styles.filterChipLabelSelected]}>
                    #{tag}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {filteredProjects.length ? (
        filteredProjects.map((project) => {
          const statusMeta = projectStatuses.find((status) => status.id === project.status) ?? projectStatuses[0];
          const linkedPeople = people.filter((person) => project.people.includes(person.id));

          return (
            <View key={project.id} style={styles.projectCard}>
              <Pressable onPress={() => setDraft(toDraft(project))} style={styles.projectMain}>
                <Text style={styles.projectName}>{project.name}</Text>
                <Text style={styles.projectMeta}>{formatDeadline(project.deadline)}</Text>
                {project.tags.length ? (
                  <View style={styles.projectTagsRow}>
                    {project.tags.map((tag) => (
                      <Pressable
                        key={`${project.id}-${tag}`}
                        onPress={() => router.push({ pathname: '/tags', params: { tag } })}
                        style={styles.projectTagChip}
                      >
                        <Text style={styles.projectTagChipLabel}>#{tag}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {linkedPeople.length ? (
                  <Text style={styles.projectPeople}>{linkedPeople.map((person) => person.name).join(' · ')}</Text>
                ) : null}
              </Pressable>
              <Pressable onPress={() => handleCycleStatus(project.id)} style={[styles.statusBadge, { backgroundColor: statusMeta.color }]}>
                <Text style={styles.statusBadgeLabel}>{statusMeta.label}</Text>
              </Pressable>
            </View>
          );
        })
      ) : (
        <EmptyState title="Aucun projet" message="Ajoute des missions, clients ou projets internes pour structurer le suivi." />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
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
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryButtonLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
  },
  addButtonLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
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
  projectCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  projectMain: {
    flex: 1,
    gap: 3,
  },
  projectName: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  projectMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  projectTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  projectTagChip: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  projectTagChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  projectPeople: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusBadgeLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
});