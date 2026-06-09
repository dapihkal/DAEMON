import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import {
  deleteTimelineEntry,
  deleteObjective,
  listObjectives,
  saveObjective,
  saveTimelineEntry,
} from '../src/db/repositories';
import { createId } from '../src/lib/id';
import {
  clearObjectiveDeadlineRemindersAsync,
  syncObjectiveDeadlineRemindersAsync,
} from '../src/lib/objective-deadline-reminders';
import type { Objective, ObjectiveEvent, ObjectiveScope } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

type ObjectiveDraft = {
  id: string | null;
  title: string;
  scope: ObjectiveScope;
  deadline: string;
  details: string;
  trackingMethod: 'manual' | 'milestones';
  manualProgress: number;
  events: ObjectiveEvent[];
  createdAt: number | null;
};

function createEmptyDraft(): ObjectiveDraft {
  return {
    id: null,
    title: '',
    scope: 'perso',
    deadline: '',
    details: '',
    trackingMethod: 'manual',
    manualProgress: 0,
    events: [],
    createdAt: null,
  };
}

function toDraft(objective: Objective): ObjectiveDraft {
  return {
    id: objective.id,
    title: objective.title,
    scope: objective.scope,
    deadline: objective.deadline,
    details: objective.details,
    trackingMethod: objective.events && objective.events.length > 0 ? 'milestones' : 'manual',
    manualProgress: objective.progress,
    events: objective.events || [],
    createdAt: objective.createdAt,
  };
}

function clampObjectiveProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sumObjectiveEvents(events: ObjectiveEvent[]) {
  return clampObjectiveProgress(events.reduce((total, event) => total + event.percent, 0));
}

function createEmptyEvent(): ObjectiveEvent {
  return { id: createId('objective-event'), title: '', percent: 0 };
}

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function objectiveTimelineEntryId(objectiveId: string) {
  return `objective-success-${objectiveId}`;
}

function buildObjectiveSuccessNote(objective: Objective) {
  const scopeLabel = objective.scope === 'pro' ? 'pro' : 'perso';
  const deadline = formatDeadline(objective.deadline);
  return `Objectif ${scopeLabel} validé à 100%.${deadline ? ` Échéance : ${deadline}.` : ''}`;
}

function formatDeadline(value: string) {
  if (!value) {
    return null;
  }

  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

export default function ObjectifsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ objectiveId?: string, add?: string, date?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [draft, setDraft] = useState<ObjectiveDraft | null>(null);
  const [successTitle, setSuccessTitle] = useState<string | null>(null);
  const successAnimation = useRef(new Animated.Value(0)).current;

  // New states for top filters
  const [scopeFilter, setScopeFilter] = useState<'all' | 'perso' | 'pro'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>('all');

  useEffect(() => {
    if (!successTitle) {
      return;
    }

    successAnimation.setValue(0);
    Animated.spring(successAnimation, {
      toValue: 1,
      damping: 12,
      stiffness: 170,
      useNativeDriver: true,
    }).start();

    const timeout = setTimeout(() => setSuccessTitle(null), 1800);
    return () => clearTimeout(timeout);
  }, [successAnimation, successTitle]);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const nextObjectives = await listObjectives(db);
      if (active) {
        setObjectives(nextObjectives);

        if (typeof params.objectiveId === 'string') {
          const targetObjective = nextObjectives.find((objective) => objective.id === params.objectiveId) ?? null;
          if (targetObjective) {
            setDraft(toDraft(targetObjective));
          }
          router.replace('/objectifs');
        } else if (params.add === 'true') {
          const initialDraft = createEmptyDraft();
          if (params.date && !Number.isNaN(new Date(params.date).getTime())) {
            initialDraft.deadline = params.date;
          }
          setDraft(initialDraft);
          router.replace('/objectifs');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [db, params.objectiveId, router]);

  useFocusEffect(refresh);

  const syncObjectiveSuccessTimelineEntry = async (objective: Objective, previousProgress: number) => {
    if (previousProgress < 100 && objective.progress >= 100) {
      await saveTimelineEntry(db, {
        id: objectiveTimelineEntryId(objective.id),
        date: localDay(),
        title: `Objectif reussi : ${objective.title}`,
        note: buildObjectiveSuccessNote(objective),
      });
    } else if (previousProgress >= 100 && objective.progress < 100) {
      await deleteTimelineEntry(db, objectiveTimelineEntryId(objective.id));
    }
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }

    const progress = draft.trackingMethod === 'milestones' ? sumObjectiveEvents(draft.events) : draft.manualProgress;
    const events = draft.trackingMethod === 'milestones' ? draft.events : [];

    const saved = await saveObjective(db, {
      id: draft.id ?? undefined,
      title: draft.title,
      scope: draft.scope,
      deadline: draft.deadline,
      details: draft.details,
      events,
      progress,
      createdAt: draft.createdAt ?? undefined,
    });

    if (!saved) {
      return;
    }

    const previousProgress = draft.id ? objectives.find((objective) => objective.id === draft.id)?.progress ?? 0 : 0;
    if (previousProgress < 100 && saved.progress >= 100) {
      await syncObjectiveSuccessTimelineEntry(saved, previousProgress);
      setSuccessTitle(saved.title);
    } else if (previousProgress >= 100 && saved.progress < 100) {
      await syncObjectiveSuccessTimelineEntry(saved, previousProgress);
    }
    await syncObjectiveDeadlineRemindersAsync(db, saved);

    setDraft(null);
    setObjectives(await listObjectives(db));
  };

  const handleQuickProgress = async (objective: Objective, increment: number) => {
    const newProgress = Math.max(0, Math.min(100, objective.progress + increment));
    const previousProgress = objective.progress;

    // Handle milestones (events) resetting or completing
    let updatedEvents = objective.events;
    if (objective.events && objective.events.length > 0) {
      if (newProgress === 0) {
        updatedEvents = objective.events.map((event) => ({ ...event, percent: 0 }));
      } else if (newProgress === 100) {
        const totalCurrent = objective.events.reduce((sum, e) => sum + e.percent, 0);
        if (totalCurrent === 0) {
          const count = objective.events.length;
          const base = Math.floor(100 / count);
          const remainder = 100 % count;
          updatedEvents = objective.events.map((event, index) => ({
            ...event,
            percent: base + (index === count - 1 ? remainder : 0),
          }));
        } else {
          let sumScaled = 0;
          updatedEvents = objective.events.map((event, index) => {
            let scaled = Math.round((event.percent * 100) / totalCurrent);
            if (index === objective.events.length - 1) {
              scaled = 100 - sumScaled;
            } else {
              sumScaled += scaled;
            }
            return { ...event, percent: Math.max(0, scaled) };
          });
        }
      }
    }

    const saved = await saveObjective(db, {
      id: objective.id,
      title: objective.title,
      scope: objective.scope,
      deadline: objective.deadline,
      details: objective.details,
      events: updatedEvents,
      progress: newProgress,
      createdAt: objective.createdAt,
    });

    if (saved) {
      if (previousProgress < 100 && saved.progress >= 100) {
        await syncObjectiveSuccessTimelineEntry(saved, previousProgress);
        setSuccessTitle(saved.title);
      } else if (previousProgress >= 100 && saved.progress < 100) {
        await syncObjectiveSuccessTimelineEntry(saved, previousProgress);
      }
      await syncObjectiveDeadlineRemindersAsync(db, saved);
      setObjectives(await listObjectives(db));
    }
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deleteObjective(db, draft.id);
    await deleteTimelineEntry(db, objectiveTimelineEntryId(draft.id));
    await clearObjectiveDeadlineRemindersAsync(db, draft.id);
    setDraft(null);
    setObjectives(await listObjectives(db));
  };

  const handleAddEvent = () => {
    setDraft((current) => (current ? { ...current, events: [...current.events, createEmptyEvent()] } : current));
  };

  const handleEventTitleChange = (eventId: string, title: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            events: current.events.map((event) => (event.id === eventId ? { ...event, title } : event)),
          }
        : current,
    );
  };

  const handleEventPercentChange = (eventId: string, value: string) => {
    const digits = value.replace(/[^0-9]/g, '');
    const requestedPercent = digits ? clampObjectiveProgress(Number.parseInt(digits, 10)) : 0;

    setDraft((current) => {
      if (!current) {
        return current;
      }

      const otherProgress = current.events.reduce(
        (total, event) => (event.id === eventId ? total : total + event.percent),
        0,
      );
      const percent = Math.min(requestedPercent, Math.max(0, 100 - otherProgress));

      return {
        ...current,
        events: current.events.map((event) => (event.id === eventId ? { ...event, percent } : event)),
      };
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    setDraft((current) =>
      current ? { ...current, events: current.events.filter((event) => event.id !== eventId) } : current,
    );
  };

  const successScale = successAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });

  const filteredObjectives = useMemo(() => {
    return objectives.filter((obj) => {
      const scopeMatch = scopeFilter === 'all' || obj.scope === scopeFilter;
      const done = obj.progress >= 100;
      const statusMatch =
        statusFilter === 'all' ||
        (statusFilter === 'active' && !done) ||
        (statusFilter === 'done' && done);
      return scopeMatch && statusMatch;
    });
  }, [objectives, scopeFilter, statusFilter]);

  if (draft) {
    const isTitleValid = draft.title.trim().length > 0;
    const draftProgress = draft.trackingMethod === 'milestones' ? sumObjectiveEvents(draft.events) : draft.manualProgress;
    const remainingProgress = Math.max(0, 100 - draftProgress);

    return (
      <AppShell kicker="Cap" title={draft.id ? 'Modifier l\'objectif' : 'Nouvel objectif'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour aux objectifs</Text>
        </Pressable>

        <View style={styles.editorCard}>
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, title: value } : current))}
            placeholder="Intitule de l'objectif"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.title}
          />

          <Text style={styles.fieldLabel}>Domaine</Text>
          <View style={styles.chipRow}>
            {[
              { id: 'perso' as const, label: 'Personnel' },
              { id: 'pro' as const, label: 'Pro' },
            ].map((scope) => {
              const selected = draft.scope === scope.id;
              return (
                <Pressable
                  key={scope.id}
                  onPress={() => setDraft((current) => (current ? { ...current, scope: scope.id } : current))}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>{scope.label}</Text>
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
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, details: value } : current))}
            placeholder="Détails de l'événement, contexte, critères de réussite..."
            placeholderTextColor={colors.muted}
            style={styles.textarea}
            textAlignVertical="top"
            value={draft.details}
          />

          {/* We only configure progression for existing objectives (meaning we edit them) */}
          {draft.id !== null ? (
            <>
              <Text style={styles.fieldLabel}>Type de suivi de progression</Text>
              <View style={styles.chipRow}>
                {[
                  { id: 'manual' as const, label: 'Entièrement manuel' },
                  { id: 'milestones' as const, label: 'Par étapes / événements' },
                ].map((method) => {
                  const selected = draft.trackingMethod === method.id;
                  return (
                    <Pressable
                      key={method.id}
                      onPress={() => setDraft((current) => (current ? { ...current, trackingMethod: method.id } : current))}
                      style={[styles.chip, selected && styles.chipActive]}
                    >
                      <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>{method.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Conditional Tracking UI */}
              {draft.trackingMethod === 'manual' ? (
                <View style={styles.manualProgressContainer}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.fieldLabel}>Progression manuelle</Text>
                    <Text style={styles.progressValue}>{draft.manualProgress}%</Text>
                  </View>
                  
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, draft.manualProgress >= 100 && styles.progressFillDone, { width: `${draft.manualProgress}%` }]} />
                  </View>

                  <View style={styles.manualProgressControls}>
                    <Pressable
                      onPress={() => setDraft(current => current ? { ...current, manualProgress: Math.max(0, current.manualProgress - 10) } : null)}
                      style={styles.adjustButton}
                    >
                      <Text style={styles.adjustButtonText}>-10%</Text>
                    </Pressable>
                    
                    <View style={styles.manualInputWrap}>
                      <TextInput
                        keyboardType="number-pad"
                        maxLength={3}
                        onChangeText={(val) => {
                          const digits = val.replace(/[^0-9]/g, '');
                          const num = digits ? Math.min(100, Math.max(0, parseInt(digits, 10))) : 0;
                          setDraft(current => current ? { ...current, manualProgress: num } : null);
                        }}
                        style={styles.manualInput}
                        value={`${draft.manualProgress}`}
                      />
                      <Text style={styles.percentSuffix}>%</Text>
                    </View>

                    <Pressable
                      onPress={() => setDraft(current => current ? { ...current, manualProgress: Math.min(100, current.manualProgress + 10) } : null)}
                      style={styles.adjustButton}
                    >
                      <Text style={styles.adjustButtonText}>+10%</Text>
                    </Pressable>
                  </View>

                  <View style={styles.quickSelectRow}>
                    {[0, 25, 50, 75, 100].map((val) => (
                      <Pressable
                        key={val}
                        onPress={() => setDraft(current => current ? { ...current, manualProgress: val } : null)}
                        style={[styles.quickSelectChip, draft.manualProgress === val && styles.quickSelectChipActive]}
                      >
                        <Text style={[styles.quickSelectChipLabel, draft.manualProgress === val && styles.quickSelectChipLabelActive]}>
                          {val}%
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.milestonesContainer}>
                  <View style={styles.progressOverview}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.fieldLabel}>Événements</Text>
                      <Text style={styles.progressValue}>{draftProgress}%</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, draftProgress >= 100 && styles.progressFillDone, { width: `${draftProgress}%` }]} />
                    </View>
                    <Text style={styles.helperText}>{remainingProgress}% restant a repartir</Text>
                  </View>

                  {draft.events.length ? (
                    <View style={styles.eventList}>
                      {draft.events.map((event) => (
                        <View key={event.id} style={styles.eventRow}>
                          <TextInput
                            onChangeText={(value) => handleEventTitleChange(event.id, value)}
                            placeholder="Détail de l'événement"
                            placeholderTextColor={colors.muted}
                            style={[styles.input, styles.eventTitleInput]}
                            value={event.title}
                          />
                          <View style={styles.percentInputWrap}>
                            <TextInput
                              keyboardType="number-pad"
                              maxLength={3}
                              onChangeText={(value) => handleEventPercentChange(event.id, value)}
                              placeholder="%"
                              placeholderTextColor={colors.muted}
                              style={styles.percentInput}
                              value={event.percent ? `${event.percent}` : ''}
                            />
                            <Text style={styles.percentSuffix}>%</Text>
                          </View>
                          <Pressable onPress={() => handleDeleteEvent(event.id)} style={styles.eventDeleteButton}>
                            <Text style={styles.eventDeleteLabel}>X</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.helperText}>Ajoute les moments qui font avancer cet objectif.</Text>
                  )}

                  <Pressable onPress={handleAddEvent} style={styles.eventAddButton}>
                    <Text style={styles.eventAddLabel}>+ Ajouter un événement</Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : (
            <Text style={styles.helperText}>Une fois créé, vous pourrez suivre la progression de cet objectif ou lui ajouter des étapes.</Text>
          )}

          <View style={styles.buttonRow}>
            <Pressable
              disabled={!isTitleValid}
              onPress={handleSave}
              style={[styles.primaryButton, !isTitleValid && styles.primaryButtonDisabled]}
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
    <AppShell kicker="Cap" title="Objectifs">
      <Modal transparent visible={successTitle !== null} animationType="none" onRequestClose={() => setSuccessTitle(null)}>
        <View style={styles.modalBackdrop}>
          <Animated.View style={[styles.successPopup, { opacity: successAnimation, transform: [{ scale: successScale }] }]}>
            <Text style={styles.successKicker}>Super</Text>
            <Text style={styles.successTitle}>Bravo !</Text>
            <Text style={styles.successBody}>{successTitle ? `${successTitle} est reussi.` : 'Objectif reussi.'}</Text>
            <Pressable onPress={() => setSuccessTitle(null)} style={styles.successButton}>
              <Text style={styles.successButtonLabel}>OK</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
      <SectionTitle
        eyebrow="Progression"
        title="Progression"
        subtitle="Suis tes objectifs personnels ou pro à ton rythme, manuellement ou par étapes." 
      />

      {/* Top filters bar */}
      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          {[
            { id: 'all' as const, label: 'Tous' },
            { id: 'perso' as const, label: 'Personnel' },
            { id: 'pro' as const, label: 'Pro' },
          ].map((scope) => {
            const selected = scopeFilter === scope.id;
            return (
              <Pressable
                key={scope.id}
                onPress={() => setScopeFilter(scope.id)}
                style={[styles.filterChip, selected && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelActive]}>{scope.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.filterRow}>
          {[
            { id: 'all' as const, label: 'Tous les états' },
            { id: 'active' as const, label: 'En cours' },
            { id: 'done' as const, label: 'Réussis' },
          ].map((status) => {
            const selected = statusFilter === status.id;
            return (
              <Pressable
                key={status.id}
                onPress={() => setStatusFilter(status.id)}
                style={[styles.filterChip, selected && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelActive]}>{status.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable onPress={() => setDraft(createEmptyDraft())} style={({ pressed }) => [styles.addButton, pressed && styles.pressedCard]}>
        <Text style={styles.addButtonLabel}>+ Nouvel objectif</Text>
      </Pressable>

      {filteredObjectives.length ? (
        filteredObjectives.map((objective) => {
          const done = objective.progress >= 100;

          return (
            <View key={objective.id} style={[styles.objectiveCard, done && styles.objectiveCardDone]}>
              <Pressable onPress={() => setDraft(toDraft(objective))} style={({ pressed }) => [styles.objectiveMain, pressed && styles.pressedSoft]}>
                {done ? (
                  <View style={styles.successBadge}>
                    <Text style={styles.successBadgeLabel}>Reussi</Text>
                  </View>
                ) : null}
                <Text style={styles.objectiveTitle}>{objective.title}</Text>
                <Text style={styles.objectiveMeta}>
                  {objective.scope === 'pro' ? 'Pro' : 'Personnel'}
                  {formatDeadline(objective.deadline) ? ` · ${formatDeadline(objective.deadline)}` : ''}
                </Text>
                {objective.details ? <Text style={styles.objectiveDetails}>{objective.details}</Text> : null}
                {objective.events && objective.events.length ? (
                  <View style={styles.eventSummaryList}>
                    {objective.events.map((event) => (
                      <View key={event.id} style={styles.eventSummaryRow}>
                        <Text style={styles.eventSummaryTitle}>{event.title}</Text>
                        <Text style={styles.eventSummaryPercent}>{event.percent}%</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, done && styles.progressFillDone, { width: `${objective.progress}%` }]} />
                </View>
              </Pressable>
              
              {/* Quick adjustment and completion bar on cards */}
              <View style={styles.cardFooter}>
                {objective.events && objective.events.length === 0 ? (
                  <View style={styles.cardProgressAdjustment}>
                    <Pressable
                      onPress={() => handleQuickProgress(objective, -10)}
                      style={({ pressed }) => [styles.cardAdjustButton, pressed && styles.pressedSoft]}
                    >
                      <Text style={styles.cardAdjustButtonText}>-10%</Text>
                    </Pressable>
                    
                    <View style={styles.cardProgressDisplay}>
                      <Text style={styles.progressValueText}>{objective.progress}%</Text>
                    </View>

                    <Pressable
                      onPress={() => handleQuickProgress(objective, 10)}
                      style={({ pressed }) => [styles.cardAdjustButton, pressed && styles.pressedSoft]}
                    >
                      <Text style={styles.cardAdjustButtonText}>+10%</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.progressValueText}>{objective.progress}%</Text>
                )}

                {objective.progress < 100 ? (
                  <Pressable
                    onPress={() => handleQuickProgress(objective, 100 - objective.progress)}
                    style={({ pressed }) => [styles.cardCompleteButton, pressed && styles.pressedSoft]}
                  >
                    <Text style={styles.cardCompleteButtonText}>Réussir</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => handleQuickProgress(objective, -objective.progress)}
                    style={({ pressed }) => [styles.cardResetButton, pressed && styles.pressedSoft]}
                  >
                    <Text style={styles.cardResetButtonText}>Réinitialiser</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })
      ) : (
        <EmptyState title="Aucun objectif" message="Aucun cap ne correspond à tes filtres." />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    pressedSoft: {
      opacity: 0.72,
      transform: [{ scale: 0.985 }],
    },
    pressedCard: {
      borderColor: colors.accent,
      opacity: 0.9,
      transform: [{ scale: 0.985 }],
    },
    backButton: { alignSelf: 'flex-start' },
    backLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    editorCard: {
      alignSelf: 'stretch',
      backgroundColor: colors.surface,
      borderColor: colors.lineStrong,
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
      minWidth: 0,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    textarea: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 15,
      minHeight: 104,
      minWidth: 0,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    fieldLabel: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    helperText: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
    },
    chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', minWidth: 0 },
    chip: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
    chipLabelActive: { color: colors.white },
    
    // New Styles for Manual Tracking in Editor
    manualProgressContainer: {
      gap: spacing.sm,
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.xl,
      padding: spacing.md,
    },
    manualProgressControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      marginTop: spacing.sm,
      minWidth: 0,
    },
    adjustButton: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderWidth: 1,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minWidth: 60,
      alignItems: 'center',
    },
    adjustButtonText: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 14,
    },
    manualInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderColor: colors.line,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      width: 100,
      justifyContent: 'center',
    },
    manualInput: {
      color: colors.text,
      fontFamily: fonts.mono,
      fontSize: 20,
      fontWeight: 'bold',
      paddingVertical: spacing.xs,
      textAlign: 'center',
      width: 48,
    },
    quickSelectRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    quickSelectChip: {
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderWidth: 1,
      borderRadius: radii.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      minWidth: 46,
      alignItems: 'center',
    },
    quickSelectChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    quickSelectChipLabel: {
      color: colors.text,
      fontFamily: fonts.bodySemi,
      fontSize: 12,
    },
    quickSelectChipLabelActive: {
      color: colors.white,
    },
    milestonesContainer: {
      gap: spacing.md,
    },

    // New Styles for Filters bar
    filterSection: {
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    filterRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    filterChip: {
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderColor: colors.line,
      borderWidth: 1,
    },
    filterChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    filterChipLabel: {
      color: colors.text,
      fontFamily: fonts.bodySemi,
      fontSize: 12,
    },
    filterChipLabelActive: {
      color: colors.white,
    },

    progressOverview: {
      gap: spacing.sm,
    },
    progressHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    eventList: {
      gap: spacing.sm,
    },
    eventRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      minWidth: 0,
    },
    eventTitleInput: {
      flex: 1,
      minWidth: 0,
    },
    percentInputWrap: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      flexDirection: 'row',
      flexShrink: 0,
      paddingRight: spacing.sm,
    },
    percentInput: {
      color: colors.text,
      fontFamily: fonts.mono,
      fontSize: 15,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.md,
      textAlign: 'right',
      width: 52,
    },
    percentSuffix: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    eventDeleteButton: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
    eventDeleteLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    eventAddButton: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderColor: colors.line,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    eventAddLabel: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    buttonRow: { flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      flex: 1,
      minWidth: 0,
      paddingVertical: spacing.sm,
    },
    primaryButtonDisabled: {
      opacity: 0.45,
    },
    primaryButtonLabel: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 15 },
    secondaryButton: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      flexShrink: 0,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    secondaryButtonLabel: { color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 15 },
    addButton: {
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.lineStrong,
      borderRadius: radii.lg,
      borderWidth: 1,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
    },
    addButtonLabel: { color: colors.muted, fontFamily: fonts.bodySemi, fontSize: 15 },
    objectiveCard: {
      alignSelf: 'stretch',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.lineStrong,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.sm,
      minWidth: 0,
      padding: spacing.lg,
      marginBottom: spacing.md,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
    },
    objectiveCardDone: {
      borderColor: colors.success,
    },
    objectiveMain: { gap: spacing.sm, minWidth: 0 },
    objectiveTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 21 },
    objectiveMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
    objectiveDetails: {
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
    },
    eventSummaryList: {
      gap: spacing.xs,
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    eventSummaryRow: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'space-between',
      minWidth: 0,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    eventSummaryTitle: {
      color: colors.text,
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 13,
      minWidth: 0,
    },
    eventSummaryPercent: {
      color: colors.accent,
      flexShrink: 0,
      fontFamily: fonts.mono,
      fontSize: 12,
    },
    successBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.success,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    successBadgeLabel: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    progressTrack: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      height: 10,
      opacity: 0.15,
      overflow: 'hidden',
    },
    progressFill: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      height: 10,
      minWidth: 4,
    },
    progressFillDone: {
      backgroundColor: colors.accent,
    },
    progressValue: { color: colors.accent, fontFamily: fonts.mono, fontSize: 12 },
    
    // New Card Footer Styles (Adjustment bar on list cards)
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    cardProgressAdjustment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexShrink: 1,
      minWidth: 0,
    },
    cardAdjustButton: {
      backgroundColor: colors.chip,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.md,
      borderColor: colors.line,
      borderWidth: 1,
      flexShrink: 0,
    },
    cardAdjustButtonText: {
      color: colors.text,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
    },
    cardProgressDisplay: {
      paddingHorizontal: spacing.sm,
    },
    progressValueText: {
      color: colors.accent,
      fontFamily: fonts.mono,
      fontSize: 13,
      fontWeight: 'bold',
    },
    cardCompleteButton: {
      backgroundColor: colors.success,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      flexShrink: 0,
    },
    cardCompleteButtonText: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
    },
    cardResetButton: {
      backgroundColor: colors.chip,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      borderColor: colors.line,
      borderWidth: 1,
      flexShrink: 0,
    },
    cardResetButtonText: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
    },

    modalBackdrop: {
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.36)',
      flex: 1,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    successPopup: {
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.success,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.sm,
      maxWidth: 340,
      padding: spacing.xl,
      width: '100%',
    },
    successKicker: {
      color: colors.success,
      fontFamily: fonts.mono,
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    successTitle: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: 32,
    },
    successBody: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    successButton: {
      backgroundColor: colors.success,
      borderRadius: radii.pill,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm,
    },
    successButtonLabel: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 14,
    },
  });