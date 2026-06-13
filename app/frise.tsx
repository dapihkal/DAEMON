import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { PeoplePicker } from '../src/components/people-picker';
import { SectionTitle } from '../src/components/section-title';
import { replaceEntityPersonLinks } from '../src/db/cross-repositories';
import { deleteTimelineEntry, listTimelineEntries, saveTimelineEntry } from '../src/db/repositories';
import type { TimelineEntry } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/use-themed-styles';

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatTimelineDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

function yearOf(value: string) {
  return value.slice(0, 4);
}

export default function FriseScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [draftDate, setDraftDate] = useState(localDay());
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftPeople, setDraftPeople] = useState<string[]>([]);
  const [peopleDirty, setPeopleDirty] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const nextEntries = await listTimelineEntries(db);
      if (active) {
        setEntries(nextEntries);
      }
    })();

    return () => {
      active = false;
    };
  }, [db]);

  useFocusEffect(refresh);

  // Tri défensif (desc) + regroupement par année pour la lecture en frise.
  const groupedEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
    const groups: { year: string; items: TimelineEntry[] }[] = [];
    for (const entry of sorted) {
      const year = yearOf(entry.date);
      const last = groups[groups.length - 1];
      if (last && last.year === year) {
        last.items.push(entry);
      } else {
        groups.push({ year, items: [entry] });
      }
    }
    return groups;
  }, [entries]);

  const canSave = draftTitle.trim().length > 0 && !saving;

  const resetDraft = () => {
    setEditingEntryId(null);
    setDraftDate(localDay());
    setDraftTitle('');
    setDraftNote('');
    setDraftPeople([]);
    setPeopleDirty(false);
  };

  const handlePeopleChange = (ids: string[]) => {
    setDraftPeople(ids);
    setPeopleDirty(true);
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      const entry = await saveTimelineEntry(db, {
        id: editingEntryId ?? undefined,
        date: draftDate,
        title: draftTitle.trim(),
        note: draftNote.trim(),
      });

      if (!entry) {
        return;
      }

      // En édition, ne remplacer les liens que s'ils ont été touchés :
      // sinon une édition de titre/note effacerait les personnes liées.
      if (!editingEntryId || peopleDirty) {
        await replaceEntityPersonLinks(db, {
          entityKind: 'timeline',
          entityId: entry.id,
          personIds: draftPeople,
        });
      }

      resetDraft();
      setEntries(await listTimelineEntries(db));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (entry: TimelineEntry) => {
    setEditingEntryId(entry.id);
    setDraftDate(entry.date);
    setDraftTitle(entry.title);
    setDraftNote(entry.note);
    setDraftPeople([]);
    setPeopleDirty(false);
  };

  const handleDelete = (entry: TimelineEntry) => {
    Alert.alert('Supprimer cet événement ?', `« ${entry.title} » sera définitivement retiré de la frise.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await replaceEntityPersonLinks(db, {
              entityKind: 'timeline',
              entityId: entry.id,
              personIds: [],
            });
            await deleteTimelineEntry(db, entry.id);
            if (editingEntryId === entry.id) {
              resetDraft();
            }
            setEntries(await listTimelineEntries(db));
          })();
        },
      },
    ]);
  };

  return (
    <AppShell kicker="Temps" title="Frise">
      <SectionTitle
        eyebrow="Chronologie"
        title="Moments clés"
        subtitle={
          entries.length
            ? `${entries.length} événement${entries.length > 1 ? 's' : ''} sur la frise.`
            : "Ajout et modification d'événements datés, note optionnelle et lecture en frise chronologique descendante."
        }
      />

      <View style={styles.editorCard}>
        {editingEntryId ? <Text style={styles.editingBadge}>Modification en cours</Text> : null}
        <DateField label="Date" value={draftDate} onChange={setDraftDate} />
        <TextInput
          onChangeText={setDraftTitle}
          placeholder="Moment marquant"
          placeholderTextColor={colors.muted}
          returnKeyType="next"
          style={styles.input}
          value={draftTitle}
        />
        <TextInput
          multiline
          onChangeText={setDraftNote}
          placeholder="Détails (optionnel)"
          placeholderTextColor={colors.muted}
          style={styles.textarea}
          textAlignVertical="top"
          value={draftNote}
        />
        <PeoplePicker
          entityKind="timeline"
          entityId={editingEntryId}
          selectedIds={draftPeople}
          onChange={handlePeopleChange}
        />
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            disabled={!canSave}
            onPress={handleSave}
            style={[styles.primaryButton, !canSave && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonLabel}>{editingEntryId ? 'Enregistrer' : 'Ajouter'}</Text>
          </Pressable>
          {editingEntryId ? (
            <Pressable accessibilityRole="button" onPress={resetDraft} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonLabel}>Annuler</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {groupedEntries.length ? (
        groupedEntries.map((group, groupIndex) => (
          <View key={group.year}>
            <Text style={styles.yearHeader}>{group.year}</Text>
            {group.items.map((entry, index) => {
              const isLastOfAll =
                groupIndex === groupedEntries.length - 1 && index === group.items.length - 1;
              const isEditing = editingEntryId === entry.id;
              return (
                <View key={entry.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={styles.timelineDot} />
                    {!isLastOfAll ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={[styles.entryCard, isEditing && styles.entryCardEditing]}>
                    <View style={styles.entryHeader}>
                      <View style={styles.entryMain}>
                        <Text style={styles.entryDate}>{formatTimelineDate(entry.date)}</Text>
                        <Text style={styles.entryTitle}>{entry.title}</Text>
                        {entry.note ? <Text style={styles.entryNote}>{entry.note}</Text> : null}
                      </View>
                      <View style={styles.entryActions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => handleEdit(entry)}
                          style={styles.editChip}
                        >
                          <Text style={styles.editChipLabel}>Modifier</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => handleDelete(entry)}
                          style={styles.deleteChip}
                        >
                          <Text style={styles.deleteChipLabel}>Suppr.</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ))
      ) : (
        <EmptyState title="Frise vide" message="Ajoute des moments importants pour construire une chronologie claire." />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    editorCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      gap: spacing.md,
      padding: spacing.lg,
    },
    editingBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.pill,
      color: colors.accent,
      fontFamily: fonts.mono,
      fontSize: 11,
      letterSpacing: 0.8,
      overflow: 'hidden',
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
      textTransform: 'uppercase',
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
      minHeight: 80,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      flex: 1,
      paddingVertical: spacing.sm,
    },
    primaryButtonDisabled: {
      opacity: 0.4,
    },
    primaryButtonLabel: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: spacing.sm,
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
    yearHeader: {
      color: colors.muted,
      fontFamily: fonts.mono,
      fontSize: 12,
      letterSpacing: 1.2,
      marginBottom: spacing.sm,
      marginLeft: 18 + 12,
      marginTop: spacing.md,
    },
    timelineRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    timelineRail: {
      alignItems: 'center',
      width: 18,
    },
    timelineDot: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      height: 14,
      marginTop: 6,
      width: 14,
    },
    timelineLine: {
      backgroundColor: colors.lineStrong,
      flex: 1,
      marginTop: 4,
      width: 2,
    },
    entryCard: {
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderRadius: radii.xl,
      borderWidth: 1,
      flex: 1,
      marginBottom: spacing.md,
      padding: spacing.lg,
    },
    entryCardEditing: {
      borderColor: colors.accent,
    },
    entryHeader: {
      gap: spacing.md,
    },
    entryMain: {
      flex: 1,
      gap: spacing.xs,
    },
    entryDate: {
      color: colors.accent,
      fontFamily: fonts.mono,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    entryTitle: {
      color: colors.text,
      fontFamily: fonts.title,
      fontSize: 19,
    },
    entryNote: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
    },
    entryActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    editChip: {
      alignItems: 'center',
      backgroundColor: colors.accentSoft,
      borderRadius: radii.pill,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    editChipLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    deleteChip: {
      alignItems: 'center',
      backgroundColor: colors.chip,
      borderRadius: radii.pill,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    deleteChipLabel: {
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
  });
