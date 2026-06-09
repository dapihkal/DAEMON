import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatTimelineDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function FriseScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [draftDate, setDraftDate] = useState(localDay());
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftPeople, setDraftPeople] = useState<string[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

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

  const handleSave = async () => {
    const entry = await saveTimelineEntry(db, {
      id: editingEntryId ?? undefined,
      date: draftDate,
      title: draftTitle,
      note: draftNote,
    });

    if (!entry) {
      return;
    }

    await replaceEntityPersonLinks(db, {
      entityKind: 'timeline',
      entityId: entry.id,
      personIds: draftPeople,
    });

    setDraftTitle('');
    setDraftNote('');
    setDraftDate(localDay());
    setDraftPeople([]);
    setEditingEntryId(null);
    setEntries(await listTimelineEntries(db));
  };

  const handleEdit = (entry: TimelineEntry) => {
    setEditingEntryId(entry.id);
    setDraftDate(entry.date);
    setDraftTitle(entry.title);
    setDraftNote(entry.note);
    setDraftPeople([]);
  };

  const handleCancelEdit = () => {
    setEditingEntryId(null);
    setDraftDate(localDay());
    setDraftTitle('');
    setDraftNote('');
    setDraftPeople([]);
  };

  const handleDelete = async (entryId: string) => {
    await replaceEntityPersonLinks(db, { entityKind: 'timeline', entityId: entryId, personIds: [] });
    await deleteTimelineEntry(db, entryId);
    setEntries(await listTimelineEntries(db));
  };

  return (
    <AppShell kicker="Temps" title="Frise">
      <SectionTitle
        eyebrow="Chronologie"
        title="Moments clés"
        subtitle="Ajout et modification d'événements datés, note optionnelle et lecture en frise chronologique descendante." 
      />

      <View style={styles.editorCard}>
        <DateField label="Date" value={draftDate} onChange={setDraftDate} />
        <TextInput
          onChangeText={setDraftTitle}
          placeholder="Moment marquant"
          placeholderTextColor={colors.muted}
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
          onChange={setDraftPeople}
        />
        <View style={styles.buttonRow}>
          <Pressable onPress={handleSave} style={styles.primaryButton}>
            <Text style={styles.primaryButtonLabel}>{editingEntryId ? 'Enregistrer' : 'Ajouter'}</Text>
          </Pressable>
          {editingEntryId ? (
            <Pressable onPress={handleCancelEdit} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonLabel}>Annuler</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {entries.length ? (
        entries.map((entry, index) => (
          <View key={entry.id} style={styles.timelineRow}>
            <View style={styles.timelineRail}>
              <View style={styles.timelineDot} />
              {index < entries.length - 1 ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <View style={styles.entryMain}>
                  <Text style={styles.entryDate}>{formatTimelineDate(entry.date)}</Text>
                  <Text style={styles.entryTitle}>{entry.title}</Text>
                  {entry.note ? <Text style={styles.entryNote}>{entry.note}</Text> : null}
                </View>
                <View style={styles.entryActions}>
                  <Pressable onPress={() => handleEdit(entry)} style={styles.editChip}>
                    <Text style={styles.editChipLabel}>Modifier</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDelete(entry.id)} style={styles.deleteChip}>
                    <Text style={styles.deleteChipLabel}>Suppr.</Text>
                  </Pressable>
                </View>
              </View>
            </View>
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