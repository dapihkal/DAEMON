import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { type Href, useFocusEffect, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { EmptyState } from '../src/components/empty-state';
import { SectionTitle } from '../src/components/section-title';
import {
  addEntityTag,
  deleteEntityAttachment,
  deleteEntityLink,
  deleteEntityTag,
  deleteSavedView,
  entityKindLabels,
  getEntityKey,
  getEntityLabel,
  listActivityLog,
  listAllEntityRefs,
  listEntityAttachments,
  listEntityLinks,
  listEntityTags,
  listSavedViews,
  saveEntityAttachment,
  saveEntityLink,
  saveSavedView,
} from '../src/db/cross-repositories';
import type { ActivityLogEntry, EntityAttachment, EntityKind, EntityLink, EntityRef, EntityTag, SavedView } from '../src/db/types';
import { createId } from '../src/lib/id';
import { useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/use-themed-styles';

function getEntityHref(entity: EntityRef): Href {
  if (entity.kind === 'note') {
    return { pathname: '/notes' as const, params: { noteId: entity.id } };
  }

  if (entity.kind === 'list') {
    return { pathname: '/listes' as const, params: { listId: entity.id } };
  }

  if (entity.kind === 'person') {
    return { pathname: '/cercle' as const, params: { personId: entity.id } };
  }

  if (entity.kind === 'project') {
    return { pathname: '/pro' as const, params: { projectId: entity.id } };
  }

  if (entity.kind === 'reminder') {
    return { pathname: '/rappels' as const, params: { reminderId: entity.id } };
  }

  if (entity.kind === 'template') {
    return { pathname: '/templates' as const, params: { templateId: entity.id } };
  }

  if (entity.kind === 'book') {
    return { pathname: '/livres' as const, params: { bookId: entity.id } };
  }

  if (entity.kind === 'idea') {
    return { pathname: '/idees' as const, params: { ideaId: entity.id } };
  }

  if (entity.kind === 'substance') {
    return { pathname: '/pharmaco' as const, params: { substanceId: entity.id } };
  }

  if (entity.kind === 'dose') {
    return { pathname: '/conso' as const, params: { doseId: entity.id } };
  }

  if (entity.kind === 'game') {
    return { pathname: '/jeux' as const, params: { gameId: entity.id } };
  }

  if (entity.kind === 'country') {
    return { pathname: '/pays' as const, params: { countryId: entity.id } };
  }

  if (entity.kind === 'concert') {
    return { pathname: '/concerts' as const, params: { concertId: entity.id } };
  }

  if (entity.kind === 'objective') {
    return { pathname: '/objectifs' as const, params: { objectiveId: entity.id } };
  }

  if (entity.kind === 'timeline') {
    return '/frise' as const;
  }

  if (entity.kind === 'journal') {
    return '/journal' as const;
  }

  if (entity.kind === 'treatment') {
    return '/traitement' as const;
  }

  return '/rappels' as const;
}

function formatDate(value: number) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

function formatFileSize(value: number) {
  if (!value) {
    return 'taille inconnue';
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} Ko`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function sanitizeFileName(value: string) {
  return value.trim().replace(/[^a-z0-9._-]+/gi, '_') || 'piece-jointe';
}

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

export default function LiensScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useThemedStyles(createStyles);
  const [entities, setEntities] = useState<EntityRef[]>([]);
  const [links, setLinks] = useState<EntityLink[]>([]);
  const [tags, setTags] = useState<EntityTag[]>([]);
  const [attachments, setAttachments] = useState<EntityAttachment[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [targetSearch, setTargetSearch] = useState('');
  const [tagEntityKey, setTagEntityKey] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState('');
  const [attachmentEntityKey, setAttachmentEntityKey] = useState<string | null>(null);
  const [attachmentSearch, setAttachmentSearch] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [viewName, setViewName] = useState('');
  const [viewScope, setViewScope] = useState<'all' | EntityKind | 'tag'>('all');
  const [viewTagDraft, setViewTagDraft] = useState('');
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const [nextEntities, nextLinks, nextTags, nextAttachments, nextViews, nextActivity] = await Promise.all([
        listAllEntityRefs(db, { showSensitive: preferences.showSensitiveContent }),
        listEntityLinks(db),
        listEntityTags(db),
        listEntityAttachments(db),
        listSavedViews(db),
        listActivityLog(db),
      ]);

      if (!active) {
        return;
      }

      setEntities(nextEntities);
      setLinks(nextLinks);
      setTags(nextTags);
      setAttachments(nextAttachments);
      setViews(nextViews);
      setActivity(nextActivity);

      const availableKeys = new Set(nextEntities.map(getEntityKey));
      const entityMap = new Map(nextEntities.map(e => [getEntityKey(e), e]));

      setSourceKey((current) => {
        const key = current && availableKeys.has(current) ? current : nextEntities[0] ? getEntityKey(nextEntities[0]) : null;
        if (key) {
          const e = entityMap.get(key);
          if (e) setSourceSearch(e.label);
        }
        return key;
      });

      setTargetKey((current) => {
        const key = current && availableKeys.has(current) ? current : nextEntities[1] ? getEntityKey(nextEntities[1]) : nextEntities[0] ? getEntityKey(nextEntities[0]) : null;
        if (key) {
          const e = entityMap.get(key);
          if (e) setTargetSearch(e.label);
        }
        return key;
      });

      setTagEntityKey((current) => {
        const key = current && availableKeys.has(current) ? current : nextEntities[0] ? getEntityKey(nextEntities[0]) : null;
        if (key) {
          const e = entityMap.get(key);
          if (e) setTagSearch(e.label);
        }
        return key;
      });

      setAttachmentEntityKey((current) => {
        const key = current && availableKeys.has(current) ? current : nextEntities[0] ? getEntityKey(nextEntities[0]) : null;
        if (key) {
          const e = entityMap.get(key);
          if (e) setAttachmentSearch(e.label);
        }
        return key;
      });
    })();

    return () => {
      active = false;
    };
  }, [db, preferences.showSensitiveContent]);

  useFocusEffect(refresh);

  const entityByKey = useMemo(() => new Map(entities.map((entity) => [getEntityKey(entity), entity])), [entities]);
  const sourceEntity = sourceKey ? entityByKey.get(sourceKey) ?? null : null;
  const targetEntity = targetKey ? entityByKey.get(targetKey) ?? null : null;
  const tagEntity = tagEntityKey ? entityByKey.get(tagEntityKey) ?? null : null;
  const attachmentEntity = attachmentEntityKey ? entityByKey.get(attachmentEntityKey) ?? null : null;
  const activeView = activeViewId ? views.find((view) => view.id === activeViewId) ?? null : null;
  const normalizedQuery = query.trim().toLowerCase();
  const tagKeys = useMemo(() => {
    const keysByTag = new Map<string, Set<string>>();
    tags.forEach((tag) => {
      const current = keysByTag.get(tag.tag) ?? new Set<string>();
      current.add(`${tag.entityKind}:${tag.entityId}`);
      keysByTag.set(tag.tag, current);
    });
    return keysByTag;
  }, [tags]);
  const visibleEntities = useMemo(() => {
    if (!activeView || activeView.scope === 'all') {
      return entities;
    }

    if (activeView.scope === 'tag') {
      const tag = typeof activeView.config.tag === 'string' ? activeView.config.tag : '';
      const keys = tagKeys.get(tag) ?? new Set<string>();
      return entities.filter((entity) => keys.has(getEntityKey(entity)));
    }

    return entities.filter((entity) => entity.kind === activeView.scope);
  }, [activeView, entities, tagKeys]);
  const visibleEntityKeys = useMemo(() => new Set(visibleEntities.map(getEntityKey)), [visibleEntities]);
  const visibleLinks = useMemo(
    () => links.filter((link) => visibleEntityKeys.has(`${link.sourceKind}:${link.sourceId}`) || visibleEntityKeys.has(`${link.targetKind}:${link.targetId}`)),
    [links, visibleEntityKeys],
  );
  const visibleTags = useMemo(
    () => tags.filter((tag) => visibleEntityKeys.has(`${tag.entityKind}:${tag.entityId}`)),
    [tags, visibleEntityKeys],
  );
  const visibleAttachments = useMemo(
    () => attachments.filter((attachment) => visibleEntityKeys.has(`${attachment.entityKind}:${attachment.entityId}`)),
    [attachments, visibleEntityKeys],
  );
  const visibleActivity = useMemo(
    () => activeView ? activity.filter((entry) => visibleEntityKeys.has(`${entry.entityKind}:${entry.entityId}`) || entry.action === 'view') : activity,
    [activeView, activity, visibleEntityKeys],
  );
  const filteredEntities = useMemo(
    () => visibleEntities.filter((entity) => `${entity.label} ${entity.detail} ${entityKindLabels[entity.kind]}`.toLowerCase().includes(normalizedQuery)).slice(0, 24),
    [normalizedQuery, visibleEntities],
  );

  const tagBuckets = useMemo(() => {
    const map = new Map<string, EntityTag[]>();
    visibleTags.forEach((tag) => {
      const bucket = map.get(tag.tag) ?? [];
      bucket.push(tag);
      map.set(tag.tag, bucket);
    });
    return [...map.entries()].sort((left, right) => left[0].localeCompare(right[0], 'fr-FR'));
  }, [visibleTags]);

  const attachmentsByEntityKey = useMemo(() => {
    const map = new Map<string, EntityAttachment[]>();
    visibleAttachments.forEach((attachment) => {
      const key = `${attachment.entityKind}:${attachment.entityId}`;
      const bucket = map.get(key) ?? [];
      bucket.push(attachment);
      map.set(key, bucket);
    });
    return [...map.entries()].sort((left, right) => {
      const leftEntity = entityByKey.get(left[0]);
      const rightEntity = entityByKey.get(right[0]);
      return getEntityLabel(leftEntity).localeCompare(getEntityLabel(rightEntity), 'fr-FR');
    });
  }, [entityByKey, visibleAttachments]);

  const handleSaveLink = async () => {
    if (!sourceEntity || !targetEntity) {
      return;
    }

    const saved = await saveEntityLink(db, {
      sourceKind: sourceEntity.kind,
      sourceId: sourceEntity.id,
      targetKind: targetEntity.kind,
      targetId: targetEntity.id,
      note: linkNote,
    });

    if (!saved) {
      setFeedback('Choisis deux elements differents.');
      return;
    }

    setLinkNote('');
    setFeedback('Lien enregistre.');
    const [nextLinks, nextActivity] = await Promise.all([listEntityLinks(db), listActivityLog(db)]);
    setLinks(nextLinks);
    setActivity(nextActivity);
  };

  const handleAddTag = async () => {
    if (!tagEntity) {
      return;
    }

    const saved = await addEntityTag(db, {
      entityKind: tagEntity.kind,
      entityId: tagEntity.id,
      tag: tagDraft,
    });

    if (!saved) {
      return;
    }

    setTagDraft('');
    setFeedback('Tag global ajoute.');
    const [nextTags, nextActivity] = await Promise.all([listEntityTags(db), listActivityLog(db)]);
    setTags(nextTags);
    setActivity(nextActivity);
  };

  const handleSaveView = async () => {
    const selectedTag = viewTagDraft.trim().replace(/^#/, '').toLowerCase();
    const saved = await saveSavedView(db, {
      name: viewName,
      scope: viewScope,
      config: viewScope === 'tag' && selectedTag ? { tag: selectedTag } : {},
    });

    if (!saved) {
      return;
    }

    setViewName('');
  setViewTagDraft('');
    setFeedback('Vue sauvegardee.');
    const [nextViews, nextActivity] = await Promise.all([listSavedViews(db), listActivityLog(db)]);
    setViews(nextViews);
    setActivity(nextActivity);
  };

  const handlePickAttachment = async () => {
    if (!attachmentEntity) {
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      const attachmentId = createId('att');
      const originalName = sanitizeFileName(asset.name || 'piece-jointe');
      const sourceFile = new File(asset.uri);
      const sourceSize = asset.size ?? sourceFile.size ?? 0;
      if (sourceSize > MAX_ATTACHMENT_SIZE_BYTES) {
        setFeedback(`Pièce jointe trop lourde (${formatFileSize(sourceSize)}). Limite: ${formatFileSize(MAX_ATTACHMENT_SIZE_BYTES)}.`);
        return;
      }

      const attachmentsDirectory = new Directory(Paths.document, 'attachments');
      attachmentsDirectory.create({ idempotent: true, intermediates: true });

      const targetFile = new File(attachmentsDirectory, `${attachmentId}-${originalName}`);
      await sourceFile.copy(targetFile, { overwrite: true });

      await saveEntityAttachment(db, {
        id: attachmentId,
        entityKind: attachmentEntity.kind,
        entityId: attachmentEntity.id,
        name: asset.name || originalName,
        mimeType: asset.mimeType ?? '',
        fileUri: targetFile.uri,
        size: sourceSize,
      });

      setFeedback('Pièce jointe ajoutée.');
      const [nextAttachments, nextActivity] = await Promise.all([listEntityAttachments(db), listActivityLog(db)]);
      setAttachments(nextAttachments);
      setActivity(nextActivity);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Pièce jointe imossible pour le moment.');
    }
  };

  const handleShareAttachment = async (attachment: EntityAttachment) => {
    if (!(await Sharing.isAvailableAsync())) {
      setFeedback('Partage indisponible sur cet environnement.');
      return;
    }

    await Sharing.shareAsync(attachment.fileUri, {
      dialogTitle: attachment.name,
      mimeType: attachment.mimeType || undefined,
    });
  };

  const handleDeleteAttachment = async (attachment: EntityAttachment) => {
    await deleteEntityAttachment(db, attachment.id);
    try {
      const file = new File(attachment.fileUri);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // Metadata deletion is the source of truth; file cleanup is best effort.
    }

    setFeedback('Pièce jointe retirée.');
    setAttachments(await listEntityAttachments(db));
  };

  const renderEntitySelector = (
    selectedKey: string | null,
    onSelect: (key: string) => void,
    searchQuery: string,
    onSearchChange: (v: string) => void,
    placeholder: string
  ) => {
    const filtered = entities.filter(e =>
      !searchQuery || `${e.label} ${e.detail} ${entityKindLabels[e.kind]}`.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 10);

    return (
      <View style={{ gap: spacing.xs, marginBottom: spacing.sm }}>
        <TextInput
          onChangeText={(v) => {
            onSearchChange(v);
            // If the user is typing, we clear the selected key to ensure they click a suggestion
            if (v !== searchQuery) {
              onSelect(null as any);
            }
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={searchQuery}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRow}>
          {filtered.map((entity) => {
            const key = getEntityKey(entity);
            const selected = selectedKey === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  onSelect(key);
                  onSearchChange(entity.label);
                }}
                style={[styles.entityChip, selected && styles.entityChipSelected]}
              >
                <Text style={[styles.entityKind, selected && styles.entityKindSelected]}>{entityKindLabels[entity.kind]}</Text>
                <Text numberOfLines={1} style={[styles.entityLabel, selected && styles.entityLabelSelected]}>{entity.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <AppShell kicker="Transversal" title="Liens">
      <SectionTitle
        eyebrow="Graphe personnel"
        title="Relier, taguer, retrouver"
        subtitle="Crée des liens persistants entre modules, ajoute des tags globaux et garde des vues utiles sous la main."
      />

      <TextInput
        onChangeText={setQuery}
        placeholder={activeView ? `Filtrer dans ${activeView.name}...` : 'Filtrer les éléments...'}
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        value={query}
      />

      {activeView ? (
        <View style={styles.activeViewCard}>
          <View style={styles.savedViewMain}>
            <Text style={styles.savedViewTitle}>{activeView.name}</Text>
            <Text style={styles.savedViewMeta}>{activeView.scope === 'tag' && typeof activeView.config.tag === 'string' ? `#${activeView.config.tag}` : activeView.scope === 'all' ? 'Tout le graphe' : entityKindLabels[activeView.scope as EntityKind]} · {visibleEntities.length} entrée{visibleEntities.length > 1 ? 's' : ''}</Text>
          </View>
          <Pressable onPress={() => setActiveViewId(null)} style={styles.smallButton}>
            <Text style={styles.smallButtonLabel}>Tout voir</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nouveau lien</Text>
        <Text style={styles.fieldLabel}>Départ</Text>
        {renderEntitySelector(sourceKey, setSourceKey, sourceSearch, setSourceSearch, "Rechercher départ...")}
        <Text style={styles.fieldLabel}>Arrivée</Text>
        {renderEntitySelector(targetKey, setTargetKey, targetSearch, setTargetSearch, "Rechercher arrivée...")}
        <TextInput
          onChangeText={setLinkNote}
          placeholder="Note optionnelle sur le lien"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={linkNote}
        />
        <Pressable onPress={handleSaveLink} style={styles.primaryButton}>
          <Text style={styles.primaryButtonLabel}>Relier</Text>
        </Pressable>
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionTitle eyebrow="Liens" title={`${visibleLinks.length} connexion${visibleLinks.length > 1 ? 's' : ''}`} />
        <Pressable onPress={() => router.push('/graphe')} style={styles.smallButton}>
          <Text style={styles.smallButtonLabel}>Vue Graphe</Text>
        </Pressable>
      </View>
      
      {visibleLinks.length ? (
        visibleLinks.map((link) => {
          const source = entityByKey.get(`${link.sourceKind}:${link.sourceId}`);
          const target = entityByKey.get(`${link.targetKind}:${link.targetId}`);
          return (
            <View key={link.id} style={styles.linkCard}>
              <Pressable onPress={() => source ? router.push(getEntityHref(source)) : undefined} style={({ pressed }) => [styles.linkSide, pressed && styles.pressedSoft]}>
                <Text style={styles.linkTitle}>{getEntityLabel(source)}</Text>
              </Pressable>
              <Text style={styles.linkArrow}>↔</Text>
              <Pressable onPress={() => target ? router.push(getEntityHref(target)) : undefined} style={({ pressed }) => [styles.linkSide, pressed && styles.pressedSoft]}>
                <Text style={styles.linkTitle}>{getEntityLabel(target)}</Text>
              </Pressable>
              {link.note ? <Text style={styles.linkNote}>{link.note}</Text> : null}
              <Pressable
                onPress={async () => {
                  await deleteEntityLink(db, link.id);
                  setLinks(await listEntityLinks(db));
                }}
                style={({ pressed }) => [styles.smallButton, pressed && styles.pressedSoft]}
              >
                <Text style={styles.smallButtonLabel}>Retirer</Text>
              </Pressable>
            </View>
          );
        })
      ) : (
        <EmptyState title="Aucun lien" message={activeView ? 'Cette vue ne contient pas encore de lien.' : 'Relie une note à un projet, un rappel à une personne ou une idée à une collection.'} />
      )}

      <SectionTitle eyebrow="Tags" title="Tags globaux" />
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Élément à taguer</Text>
        {renderEntitySelector(tagEntityKey, setTagEntityKey, tagSearch, setTagSearch, "Rechercher élément...")}
        <View style={styles.inlineForm}>
          <TextInput
            onChangeText={setTagDraft}
            placeholder="tag-global"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.inlineInput]}
            value={tagDraft}
          />
          <Pressable onPress={handleAddTag} style={styles.inlineButton}>
            <Text style={styles.inlineButtonLabel}>Ajouter</Text>
          </Pressable>
        </View>
      </View>

      {tagBuckets.length ? (
        <View style={styles.tagWrap}>
          {tagBuckets.map(([tag, entries]) => (
            <View key={tag} style={styles.tagBucket}>
              <Text style={styles.tagTitle}>#{tag} · {entries.length}</Text>
              {entries.slice(0, 4).map((entry) => {
                const entity = entityByKey.get(`${entry.entityKind}:${entry.entityId}`);
                return (
                  <View key={`${entry.entityKind}-${entry.entityId}-${entry.tag}`} style={styles.tagRow}>
                    <Pressable onPress={() => entity ? router.push(getEntityHref(entity)) : undefined} style={({ pressed }) => [styles.tagMain, pressed && styles.pressedSoft]}>
                      <Text style={styles.tagEntity}>{getEntityLabel(entity)}</Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        await deleteEntityTag(db, entry);
                        setTags(await listEntityTags(db));
                      }}
                      style={({ pressed }) => [styles.removeTagButton, pressed && styles.pressedSoft]}
                    >
                      <Text style={styles.removeTagLabel}>x</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}

      <SectionTitle eyebrow="Fichiers" title="Pièces jointes locales" />
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Élément à documenter</Text>
        {renderEntitySelector(attachmentEntityKey, setAttachmentEntityKey, attachmentSearch, setAttachmentSearch, "Rechercher élément...")}
        <Pressable onPress={handlePickAttachment} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonLabel}>Ajouter un fichier</Text>
        </Pressable>
      </View>

      {attachmentsByEntityKey.length ? (
        <View style={styles.attachmentWrap}>
          {attachmentsByEntityKey.map(([key, entries]) => {
            const entity = entityByKey.get(key);
            return (
              <View key={key} style={styles.attachmentBucket}>
                <Text style={styles.attachmentTitle}>{getEntityLabel(entity)} · {entries.length}</Text>
                {entries.map((attachment) => (
                  <View key={attachment.id} style={styles.attachmentRow}>
                    <Pressable onPress={() => handleShareAttachment(attachment)} style={({ pressed }) => [styles.attachmentMain, pressed && styles.pressedSoft]}>
                      <Text style={styles.attachmentName}>{attachment.name}</Text>
                      <Text style={styles.attachmentMeta}>{formatFileSize(attachment.size)} · {formatDate(attachment.createdAt)}</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDeleteAttachment(attachment)} style={({ pressed }) => [styles.removeTagButton, pressed && styles.pressedSoft]}>
                      <Text style={styles.removeTagLabel}>x</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.emptyText}>Ajoute un document, une image ou un PDF à une fiche pour le garder dans l'espace local de l'application.</Text>
        </View>
      )}

      <SectionTitle eyebrow="Vues" title="Vues sauvegardées" />
      <View style={styles.card}>
        <TextInput
          onChangeText={setViewName}
          placeholder="Nom de la vue"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={viewName}
        />
        <View style={styles.scopeRow}>
          {(['all', 'tag', 'note', 'project', 'person', 'idea', 'reminder'] as Array<typeof viewScope>).map((scope) => {
            const selected = viewScope === scope;
            return (
              <Pressable key={scope} onPress={() => setViewScope(scope)} style={[styles.scopeChip, selected && styles.scopeChipSelected]}>
                <Text style={[styles.scopeLabel, selected && styles.scopeLabelSelected]}>{scope === 'all' ? 'Tout' : scope === 'tag' ? 'Tag courant' : entityKindLabels[scope]}</Text>
              </Pressable>
            );
          })}
        </View>
        {viewScope === 'tag' ? (
          <TextInput
            autoCapitalize="none"
            onChangeText={setViewTagDraft}
            placeholder="tag-a-filtrer"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={viewTagDraft}
          />
        ) : null}
        <Pressable onPress={handleSaveView} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonLabel}>Sauvegarder la vue</Text>
        </Pressable>
      </View>
      {views.length ? (
        views.map((view) => (
          <View key={view.id} style={[styles.savedViewRow, activeViewId === view.id && styles.savedViewRowActive]}>
            <Pressable onPress={() => setActiveViewId(view.id)} style={styles.savedViewMain}>
              <Text style={styles.savedViewTitle}>{view.name}</Text>
              <Text style={styles.savedViewMeta}>{view.scope === 'tag' && typeof view.config.tag === 'string' ? `#${view.config.tag}` : view.scope} · {formatDate(view.createdAt)}</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await deleteSavedView(db, view.id);
                setViews(await listSavedViews(db));
                setActiveViewId((current) => current === view.id ? null : current);
              }}
              style={styles.smallButton}
            >
              <Text style={styles.smallButtonLabel}>Suppr.</Text>
            </Pressable>
          </View>
        ))
      ) : null}

      <SectionTitle eyebrow="Activité" title="Dernières actions" />
      {visibleActivity.length ? (
        <View style={styles.activityCard}>
          {visibleActivity.slice(0, 8).map((entry, index) => (
            <View key={entry.id} style={[styles.activityRow, index > 0 && styles.activityRowBorder]}>
              <Text style={styles.activityAction}>{entry.action}</Text>
              <Text style={styles.activityLabel}>{entry.label || entityKindLabels[entry.entityKind]}</Text>
              <Text style={styles.activityDate}>{formatDate(entry.createdAt)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.emptyText}>Les liens, tags et vues apparaîtront ici au fil de l'usage.</Text>
        </View>
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedSoft: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
  },
  fieldLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  selectorRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  entityChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 3,
    maxWidth: 180,
    minWidth: 132,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  entityChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  entityKind: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  entityKindSelected: {
    color: colors.white,
  },
  entityLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  entityLabelSelected: {
    color: colors.white,
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
  activeViewCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
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
    fontSize: 14,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
  },
  secondaryButtonLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  feedback: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  linkCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    minWidth: 0,
    padding: spacing.md,
  },
  linkSide: {
    flexBasis: '40%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 0,
  },
  linkTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  linkArrow: {
    color: colors.accent,
    flexShrink: 0,
    fontFamily: fonts.title,
    fontSize: 18,
  },
  linkNote: {
    color: colors.muted,
    flexBasis: '100%',
    fontFamily: fonts.body,
    fontSize: 13,
  },
  smallButton: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  smallButtonLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  inlineForm: {
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  inlineInput: {
    flex: 1,
    minWidth: 0,
  },
  inlineButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  inlineButtonLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  tagWrap: {
    gap: spacing.md,
  },
  tagBucket: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  tagTitle: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  tagRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  tagMain: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 0,
  },
  tagEntity: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  attachmentWrap: {
    gap: spacing.md,
  },
  attachmentBucket: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  attachmentTitle: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  attachmentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  attachmentMain: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 0,
  },
  attachmentName: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  attachmentMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  removeTagButton: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    flexShrink: 0,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  removeTagLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  scopeChip: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  scopeChipSelected: {
    backgroundColor: colors.accent,
  },
  scopeLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  scopeLabelSelected: {
    color: colors.white,
  },
  savedViewRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  savedViewRowActive: {
    borderColor: colors.accent,
  },
  savedViewMain: {
    flex: 1,
    gap: 3,
  },
  savedViewTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  savedViewMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  activityCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  activityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  activityRowBorder: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  activityAction: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  activityLabel: {
    color: colors.text,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  activityDate: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  emptyText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
});