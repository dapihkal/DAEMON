import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { listEntityPersonIds } from '../db/cross-repositories';
import { listPeople } from '../db/repositories';
import type { EntityKind, Person } from '../db/types';
import { useTheme } from '../theme/theme-provider';
import { fonts, radii, spacing } from '../theme/tokens';

type PeoplePickerProps = {
  entityKind: EntityKind;
  entityId: string | null;
  selectedIds: string[];
  onChange: (personIds: string[]) => void;
  people?: Person[];
  label?: string;
  placeholder?: string;
};

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .trim();
}

export function PeoplePicker({
  entityKind,
  entityId,
  selectedIds,
  onChange,
  people: providedPeople,
  label = 'Avec qui ?',
  placeholder = 'Chercher une personne',
}: PeoplePickerProps) {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loadedPeople, setLoadedPeople] = useState<Person[]>([]);
  const [searchText, setSearchText] = useState('');
  const people = providedPeople ?? loadedPeople;

  useEffect(() => {
    if (providedPeople) {
      return undefined;
    }

    let active = true;

    void (async () => {
      const nextPeople = await listPeople(db);

      if (!active) {
        return;
      }

      setLoadedPeople(nextPeople);
    })();

    return () => {
      active = false;
    };
  }, [db, providedPeople]);

  useEffect(() => {
    if (!entityId) {
      return undefined;
    }

    let active = true;

    void (async () => {
      const linkedPersonIds = await listEntityPersonIds(db, { entityKind, entityId });

      if (active) {
        onChange(linkedPersonIds);
      }
    })();

    return () => {
      active = false;
    };
  }, [db, entityId, entityKind]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedPeople = useMemo(
    () => selectedIds.flatMap((personId) => people.find((person) => person.id === personId) ?? []),
    [people, selectedIds],
  );

  const suggestedPeople = useMemo(() => {
    const query = normalizeSearchText(searchText);

    if (!query) {
      return [];
    }

    return people
      .filter((person) => !selectedSet.has(person.id))
      .filter((person) => normalizeSearchText(person.name).includes(query))
      .slice(0, 6);
  }, [people, searchText, selectedSet]);

  const togglePerson = (personId: string) => {
    onChange(
      selectedSet.has(personId)
        ? selectedIds.filter((selectedId) => selectedId !== personId)
        : [...selectedIds, personId],
    );
  };

  const handleSelect = (personId: string) => {
    togglePerson(personId);
    setSearchText('');
  };

  return (
    <View style={styles.root}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {selectedPeople.length ? <Text style={styles.counter}>{selectedPeople.length}</Text> : null}
      </View>
      {people.length ? (
        <View style={styles.pickerCard}>
          <TextInput
            autoCorrect={false}
            onChangeText={setSearchText}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={searchText}
          />

          {selectedPeople.length ? (
            <View style={styles.selectedWrap}>
              {selectedPeople.map((person) => (
                <Pressable key={person.id} onPress={() => togglePerson(person.id)} style={styles.selectedChip}>
                  <Text style={styles.selectedChipLabel}>{person.name}</Text>
                  <Text style={styles.selectedChipRemove}>x</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {searchText.trim() ? (
            <View style={styles.suggestionList}>
              {suggestedPeople.length ? (
                suggestedPeople.map((person) => (
                  <Pressable key={person.id} onPress={() => handleSelect(person.id)} style={styles.suggestionRow}>
                    <Text style={styles.suggestionName}>{person.name}</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.emptyText}>Aucune personne trouvee.</Text>
              )}
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.emptyText}>Ajoute d abord des personnes dans le Cercle.</Text>
      )}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    root: {
      gap: spacing.sm,
    },
    labelRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    label: {
      color: colors.muted,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    counter: {
      backgroundColor: colors.accentSoft,
      borderRadius: radii.pill,
      color: colors.accent,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      minWidth: 24,
      overflow: 'hidden',
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      textAlign: 'center',
    },
    pickerCard: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.line,
      borderRadius: radii.lg,
      borderWidth: 1,
      gap: spacing.sm,
      padding: spacing.sm,
    },
    searchInput: {
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 15,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    selectedWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    selectedChip: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      flexDirection: 'row',
      gap: spacing.xs,
      maxWidth: '100%',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    selectedChipLabel: {
      color: colors.white,
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    selectedChipRemove: {
      color: colors.white,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    suggestionList: {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.line,
      borderRadius: radii.md,
      borderWidth: 1,
      overflow: 'hidden',
    },
    suggestionRow: {
      borderBottomColor: colors.line,
      borderBottomWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    suggestionName: {
      color: colors.text,
      fontFamily: fonts.bodySemi,
      fontSize: 14,
    },
    emptyText: {
      color: colors.muted,
      fontFamily: fonts.body,
      fontSize: 13,
    },
  });