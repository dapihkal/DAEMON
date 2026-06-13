import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import { deleteTemplate, listTemplates, saveTemplate } from '../src/db/repositories';
import type { Template } from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/use-themed-styles';

type TemplateDraft = {
  id: string | null;
  name: string;
  body: string;
};

function createEmptyDraft(): TemplateDraft {
  return {
    id: null,
    name: '',
    body: '',
  };
}

function toDraft(template: Template): TemplateDraft {
  return {
    id: template.id,
    name: template.name,
    body: template.body,
  };
}

export default function TemplatesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ templateId?: string }>();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const nextTemplates = await listTemplates(db);

      if (!active) {
        return;
      }

      setTemplates(nextTemplates);

      if (typeof params.templateId === 'string') {
        const targetTemplate = nextTemplates.find((template) => template.id === params.templateId) ?? null;
        setDraft(targetTemplate ? toDraft(targetTemplate) : null);
        router.replace('/templates');
      }
    })();

    return () => {
      active = false;
    };
  }, [db, params.templateId, router]);

  useFocusEffect(refresh);

  const handleSave = async () => {
    if (!draft || !draft.name.trim() || !draft.body.trim()) {
      return;
    }

    await saveTemplate(db, {
      id: draft.id ?? undefined,
      name: draft.name,
      body: draft.body,
    });

    setDraft(null);
    setTemplates(await listTemplates(db));
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deleteTemplate(db, draft.id);
    setDraft(null);
    setTemplates(await listTemplates(db));
  };

  if (draft) {
    return (
      <AppShell kicker="Reutilisable" title={draft.id ? 'Modifier le modèle' : 'Nouveau modèle'}>
        <Pressable onPress={() => setDraft(null)} style={styles.backButton}>
          <Text style={styles.backLabel}>Retour aux modèles</Text>
        </Pressable>

        <View style={styles.editorCard}>
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))}
            placeholder="Nom du modèle"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.name}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, body: value } : current))}
            placeholder="Structure reutilisable..."
            placeholderTextColor={colors.muted}
            style={styles.textarea}
            textAlignVertical="top"
            value={draft.body}
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
    <AppShell kicker="Reutilisable" title="Modèles">
      <SectionTitle
        eyebrow="Formats"
        title="Structures prêtes a remplir"
        subtitle="Conserve des formats reutilisables pour repartir plus vite d une base claire."
      />

      <Pressable onPress={() => setDraft(createEmptyDraft())} style={styles.addButton}>
        <Text style={styles.addButtonLabel}>+ Nouveau modèle</Text>
      </Pressable>

      {templates.length ? (
        templates.map((template) => (
          <Pressable key={template.id} onPress={() => setDraft(toDraft(template))} style={styles.templateCard}>
            <Text style={styles.templateName}>{template.name}</Text>
            <Text numberOfLines={5} style={styles.templateBody}>{template.body}</Text>
          </Pressable>
        ))
      ) : (
        <EmptyState
          title="Aucun modèle"
          message="Cree une structure type pour reemployer des formats sans repartir de zero."
        />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start',
  },
  backLabel: {
    color: colors.primary,
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
    minHeight: 180,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
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
  templateCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  templateName: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
  },
  templateBody: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 22,
  },
});