import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths, Directory } from 'expo-file-system';
import { zip, unzip } from 'react-native-zip-archive';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';

import { AppShell } from '../src/components/app-shell';
import { SectionTitle } from '../src/components/section-title';
import { exportMobileBackup, importBackup, uploadBackupToCloud } from '../src/db/backup';
import { buildEncryptedExportPayload, unwrapEncryptedBackup } from '../src/lib/backup-crypto';
import { listObjectives, listReminders, listRoutines, setReminderNotificationId } from '../src/db/repositories';
import { syncAllObjectiveDeadlineRemindersAsync } from '../src/lib/objective-deadline-reminders';
import {
  cancelReminderNotificationAsync,
  ensureLocalNotificationPermissionAsync,
  scheduleReminderNotificationAsync,
  syncRoutineNotificationsAsync,
} from '../src/lib/notifications';
import { savePinAsync } from '../src/lib/security';
import { useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/use-themed-styles';

type ExportProfile = 'complete' | 'essential' | 'no-sensitive';

const sensitiveEntityKinds = ['dose', 'substance', 'treatment'];
const essentialEntityKinds = ['note', 'list', 'person', 'project', 'reminder', 'routine', 'template'];

type ImportPreview = {
  rawJson: string;
  sourceLabel: string;
  summary: string;
};

const exportProfiles: Array<{ id: ExportProfile; label: string; description: string }> = [
  { id: 'complete', label: 'Complète', description: 'Tous les modules.' },
  { id: 'essential', label: 'Essentiel', description: 'Notes, listes, rappels, projets, relations et modèles.' },
  { id: 'no-sensitive', label: 'Sans sensible', description: 'Exclut prises, substances et traitement.' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function countArray(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function counter(label: string, count: number): [string, number] {
  return [label, count];
}

const MOOD_LABELS = ['', '😕 1/5', '😐 2/5', '🙂 3/5', '😀 4/5', '🤩 5/5'];

function buildMarkdownExport(backup: Awaited<ReturnType<typeof exportMobileBackup>>) {
  const lines: string[] = [];
  const exportDay = backup.exportedAt.slice(0, 10);
  lines.push(`# Carnet — export du ${exportDay}`, '');

  const activeNotes = backup.notes.filter((note) => !note.archived);
  const archivedNotes = backup.notes.filter((note) => note.archived);

  if (activeNotes.length) {
    lines.push('## Notes', '');
    activeNotes.forEach((note) => {
      lines.push(`### ${note.title}${note.pinned ? ' 📌' : ''}`);
      if (note.tags.length) {
        lines.push(`Tags : ${note.tags.map((tag) => `#${tag}`).join(' ')}`);
      }
      lines.push(`_Modifiée le ${new Date(note.updatedAt).toLocaleDateString('fr-FR')}_`, '');
      if (note.body.trim()) {
        lines.push(note.body.trim(), '');
      }
    });
  }

  if (archivedNotes.length) {
    lines.push('## Notes archivées', '');
    archivedNotes.forEach((note) => {
      lines.push(`### ${note.title}`, '');
      if (note.body.trim()) {
        lines.push(note.body.trim(), '');
      }
    });
  }

  const journalEntries = backup.journal ?? [];
  if (journalEntries.length) {
    lines.push('## Journal', '');
    [...journalEntries]
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((entry) => {
        lines.push(`### ${new Date(`${entry.date}T12:00:00`).toLocaleDateString('fr-FR')} — ${MOOD_LABELS[entry.mood] ?? `${entry.mood}/5`}`);
        if (entry.tags?.length) {
          lines.push(`Tags : ${entry.tags.map((tag: string) => `#${tag}`).join(' ')}`);
        }
        lines.push('');
        if (entry.text.trim()) {
          lines.push(entry.text.trim(), '');
        }
      });
  }

  if (backup.people.length) {
    lines.push('## Contacts', '');
    backup.people.forEach((person) => {
      lines.push(`### ${person.name}${person.favorite ? ' ★' : ''}`);
      const details: string[] = [];
      if (person.birthday) details.push(`Anniversaire : ${person.birthday}`);
      if (person.phone) details.push(`Téléphone : ${person.phone}`);
      if (person.address) details.push(`Adresse : ${person.address}`);
      details.forEach((detail) => lines.push(`- ${detail}`));
      if (person.note.trim()) {
        lines.push('', person.note.trim());
      }
      lines.push('');
    });
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function buildImportPreview(rawJson: string, password: string): ImportPreview {
  const unwrapped = unwrapEncryptedBackup(rawJson, password);
  const parsed = JSON.parse(unwrapped.rawJson) as unknown;
  const payload = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;

  if (!isRecord(payload)) {
    throw new Error('Le fichier ne contient pas un objet JSON compatible.');
  }

  const sourceLabel = unwrapped.encrypted
    ? 'Sauvegarde chiffrée'
    : payload.format === 'carnet-mobile-backup-v1'
      ? 'Sauvegarde mobile'
      : 'JSON compatible';
  const counters = [
    counter('notes', countArray(payload.notes)),
    counter('listes', countArray(payload.lists)),
    counter('contacts', countArray(payload.people)),
    counter('projets', countArray(payload.projects)),
    counter('rappels', countArray(payload.reminders)),
    counter('routines', countArray(payload.routines)),
    counter('idées', countArray(payload.ideas)),
    counter('modèles', countArray(payload.templates)),
    counter('livres', countArray(payload.books)),
    counter('prises', countArray(payload.doses)),
    counter('substances', countArray(payload.substances)),
    counter('nuits', countArray(payload.sleepEntries)),
    counter('activités', countArray(payload.physicalActivities)),
    counter('jeux', countArray(payload.games)),
    counter('pays', countArray(payload.countries)),
    counter('concerts', countArray(payload.concerts)),
    counter('liens', countArray(payload.links)),
    counter('tags globaux', countArray(payload.entityTags)),
    counter('pièces jointes', countArray(payload.attachments)),
    counter('vues', countArray(payload.savedViews)),
    counter('journal', countArray(payload.journal)),
    counter('objectifs', countArray(payload.goals)),
    counter('frise', countArray(payload.timeline)),
    counter('traitements', countArray(payload.treatments) || (payload.treatment ? 1 : 0)),
  ].filter(([, count]) => count > 0);

  return {
    rawJson: unwrapped.rawJson,
    sourceLabel,
    summary: counters.length
      ? counters.map(([label, count]) => `${count} ${label}`).join(' · ')
      : 'Aucune donnée reconnue dans ce fichier.',
  };
}

function buildExportPayload(backup: Awaited<ReturnType<typeof exportMobileBackup>>, profile: ExportProfile) {
  if (profile === 'complete') {
    return backup;
  }

  const withoutSensitiveLinks = (backup.links ?? []).filter(
    (link) => !sensitiveEntityKinds.includes(link.sourceKind) && !sensitiveEntityKinds.includes(link.targetKind),
  );
  const withoutSensitiveTags = (backup.entityTags ?? []).filter(
    (tag) => !sensitiveEntityKinds.includes(tag.entityKind),
  );
  const withoutSensitiveActivity = (backup.activityLog ?? []).filter(
    (entry) => !sensitiveEntityKinds.includes(entry.entityKind),
  );
  const withoutSensitiveAttachments = (backup.attachments ?? []).filter(
    (attachment) => !sensitiveEntityKinds.includes(attachment.entityKind),
  );

  if (profile === 'no-sensitive') {
    return {
      ...backup,
      doses: [],
      substances: [],
      treatment: null,
      treatments: [],
      links: withoutSensitiveLinks,
      entityTags: withoutSensitiveTags,
      attachments: withoutSensitiveAttachments,
      activityLog: withoutSensitiveActivity,
    };
  }

  const essentialAttachments = withoutSensitiveAttachments.filter(
    (attachment) => essentialEntityKinds.includes(attachment.entityKind),
  );

  return {
    ...backup,
    ideas: [],
    doses: [],
    substances: [],
    books: [],
    games: [],
    countries: [],
    concerts: [],
    sleepEntries: [],
    physicalActivities: [],
    treatment: null,
    treatments: [],
    journal: [],
    goals: [],
    timeline: [],
    links: withoutSensitiveLinks,
    entityTags: withoutSensitiveTags,
    attachments: essentialAttachments,
    activityLog: [],
  };
}

function formatUnsupportedSections(
  sections: Array<{ key: string; count: number }>,
) {
  if (!sections.length) {
    return null;
  }

  return sections
    .map((section) => `${section.key}: ${section.count}`)
    .join(' · ');
}

export default function SauvegardeScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { preferences, replacePreferences, updatePreferences } = useThemePreferences();
  const styles = useThemedStyles(createStyles);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'import' | 'export' | 'cloud' | 'markdown' | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportPreview | null>(null);
  const [exportProfile, setExportProfile] = useState<ExportProfile>('complete');
  const [backupPassword, setBackupPassword] = useState('');

  const rescheduleReminderNotifications = useCallback(async () => {
    const reminders = await listReminders(db);
    const hasPermission = await ensureLocalNotificationPermissionAsync();

    if (!hasPermission) {
      for (const reminder of reminders) {
        await setReminderNotificationId(db, {
          reminderId: reminder.id,
          notificationId: null,
        });
      }

      return 0;
    }

    let scheduledCount = 0;

    for (const reminder of reminders) {
      if (reminder.status !== 'scheduled') {
        await setReminderNotificationId(db, {
          reminderId: reminder.id,
          notificationId: null,
        });
        continue;
      }

      const notificationId = await scheduleReminderNotificationAsync({
        reminderId: reminder.id,
        title: reminder.title,
        scheduledFor: reminder.scheduledFor,
      });

      await setReminderNotificationId(db, {
        reminderId: reminder.id,
        notificationId,
      });

      if (notificationId) {
        scheduledCount += 1;
      }
    }

    return scheduledCount;
  }, [db]);

  const applyImportBackup = async (rawJson: string) => {
    const existingReminders = await listReminders(db);

    for (const reminder of existingReminders) {
      await cancelReminderNotificationAsync(reminder.notificationId);
    }

    const imported = await importBackup(db, rawJson);

    if (imported.importedPin) {
      await savePinAsync(imported.importedPin);
    }

    if (imported.importedPreferences) {
      await replacePreferences(imported.importedPreferences);
    }

    await syncAllObjectiveDeadlineRemindersAsync(db, await listObjectives(db), { scheduleNotifications: false });
    const scheduledCount = await rescheduleReminderNotifications();
    const routineScheduledCount = await syncRoutineNotificationsAsync({
      routines: await listRoutines(db),
      requestPermission: false,
    });
    const unsupported = formatUnsupportedSections(imported.unsupportedSections);
    const importedStyle = imported.importedPreferences ? ' Préférences visuelles importées.' : '';
    const importedAttachments = imported.attachmentCount ? `, ${imported.attachmentCount} pièces jointes` : '';
    const failedAttachments = imported.attachmentFailureCount ? ` ${imported.attachmentFailureCount} pièce${imported.attachmentFailureCount > 1 ? 's' : ''} jointe${imported.attachmentFailureCount > 1 ? 's' : ''} non restaurée${imported.attachmentFailureCount > 1 ? 's' : ''}.` : '';

    setPendingImport(null);
    setSyncFeedback(
      `${imported.source === 'legacy-html' ? 'Import JSON' : 'Restauration mobile'}: ${imported.noteCount} notes, ${imported.listCount} listes, ${imported.personCount} contacts, ${imported.projectCount} projets, ${imported.reminderCount} rappels, ${imported.routineCount} routines, ${imported.templateCount} modèles, ${imported.bookCount} livres${importedAttachments}.${imported.importedPin ? ' PIN importé.' : ''}${importedStyle}${failedAttachments}${scheduledCount ? ` ${scheduledCount} notifications de rappels reprogrammées.` : ''}${routineScheduledCount ? ` ${routineScheduledCount} routine${routineScheduledCount > 1 ? 's' : ''} replanifiée${routineScheduledCount > 1 ? 's' : ''}.` : ''}${unsupported ? ` Sections ignorées: ${unsupported}.` : ''}`,
    );
  };

  const handleImportBackup = async () => {
    setBusyAction('import');
    setSyncFeedback(null);

    try {
      if (pendingImport) {
        await applyImportBackup(pendingImport.rawJson);
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['application/json', 'text/json'],
      });

      if (result.canceled) {
        return;
      }

      const pickedFile = new File(result.assets[0].uri);
      const preview = buildImportPreview(await pickedFile.text(), backupPassword);
      setPendingImport(preview);
      setSyncFeedback(`${preview.sourceLabel} prête à importer: ${preview.summary}`);
    } catch (error) {
      setSyncFeedback(
        error instanceof Error ? error.message : 'Import impossible pour ce fichier JSON.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCloudSync = async () => {
    if (!preferences.backupCloudUrl) {
      setSyncFeedback('Veuillez renseigner une URL de serveur.');
      return;
    }

    setBusyAction('cloud');
    setSyncFeedback(null);

    try {
      await uploadBackupToCloud(db, preferences.backupCloudUrl, backupPassword);
      await updatePreferences({ lastBackupAt: Date.now() });
      setSyncFeedback(backupPassword.trim() 
        ? 'Sauvegarde chiffrée réussie sur votre base de données.' 
        : 'Sauvegarde réussie (non chiffrée) sur votre base de données.');
    } catch (error) {
      setSyncFeedback(
        error instanceof Error ? error.message : 'Erreur de synchronisation cloud.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportBackup = async () => {
    setBusyAction('export');
    setSyncFeedback(null);

    try {
      const backup = await exportMobileBackup(db);
      const exportPayload = buildExportPayload(backup, exportProfile);
      const finalPayload = buildEncryptedExportPayload(exportPayload, backupPassword);
      const encrypted = backupPassword.trim().length > 0;
      const file = new File(
        Paths.cache,
        `carnet-mobile-${encrypted ? 'chiffre-' : ''}${exportProfile}-${backup.exportedAt.slice(0, 10)}.json`,
      );

      if (file.exists) {
        file.delete();
      }

      file.create({ overwrite: true });
      file.write(JSON.stringify(finalPayload, null, 2));

      if (!(await Sharing.isAvailableAsync())) {
        setSyncFeedback('Sauvegarde generee mais partage indisponible sur cet environnement.');
        return;
      }

      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Exporter la sauvegarde Carnet',
        mimeType: 'application/json',
        UTI: 'public.json',
      });

      await updatePreferences({ lastBackupAt: Date.now() });
      setSyncFeedback(`Sauvegarde ${exportProfiles.find((profile) => profile.id === exportProfile)?.label.toLowerCase() ?? 'complete'} ${encrypted ? 'chiffrée ' : ''}exportee en JSON.`);
    } catch (error) {
      setSyncFeedback(
        error instanceof Error ? error.message : 'Export impossible pour le moment.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportMarkdown = async () => {
    setBusyAction('markdown');
    setSyncFeedback(null);

    try {
      const backup = await exportMobileBackup(db);
      const markdown = buildMarkdownExport(backup);
      const file = new File(Paths.cache, `carnet-${backup.exportedAt.slice(0, 10)}.md`);

      if (file.exists) {
        file.delete();
      }

      file.create({ overwrite: true });
      file.write(markdown);

      if (!(await Sharing.isAvailableAsync())) {
        setSyncFeedback('Export Markdown généré mais partage indisponible sur cet environnement.');
        return;
      }

      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Exporter le carnet en Markdown',
        mimeType: 'text/markdown',
        UTI: 'net.daringfireball.markdown',
      });

      setSyncFeedback('Notes, journal et contacts exportés en Markdown lisible.');
    } catch (error) {
      setSyncFeedback(
        error instanceof Error ? error.message : 'Export Markdown impossible pour le moment.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <AppShell kicker="Sauvegarde" title="Import et export">
      <SectionTitle
        eyebrow="Paramètres"
        title="Mode de stockage"
        subtitle="Choisissez où vos données sont sauvegardées en priorité."
      />
      <View style={[styles.securityCard, { marginBottom: spacing.lg }]}>
        <View style={styles.profileList}>
          <Pressable
            onPress={() => updatePreferences({ backupMethod: 'cloud' })}
            style={[styles.profileChip, preferences.backupMethod === 'cloud' && styles.profileChipSelected]}
          >
            <Text style={[styles.profileLabel, preferences.backupMethod === 'cloud' && styles.profileLabelSelected]}>Base de données (Hébergée)</Text>
            <Text style={[styles.profileDescription, preferences.backupMethod === 'cloud' && styles.profileDescriptionSelected]}>Enregistre vos données sur votre serveur personnel.</Text>
          </Pressable>
          {preferences.backupMethod === 'cloud' && (
            <View style={styles.passwordBlock}>
              <Text style={styles.fieldLabel}>URL du serveur</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={(value) => updatePreferences({ backupCloudUrl: value })}
                placeholder="https://votre-base-de-donnees.com"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={preferences.backupCloudUrl}
              />
            </View>
          )}
          <Pressable
            onPress={() => updatePreferences({ backupMethod: 'local' })}
            style={[styles.profileChip, preferences.backupMethod === 'local' && styles.profileChipSelected]}
          >
            <Text style={[styles.profileLabel, preferences.backupMethod === 'local' && styles.profileLabelSelected]}>Enregistrement local</Text>
            <Text style={[styles.profileDescription, preferences.backupMethod === 'local' && styles.profileDescriptionSelected]}>Les données restent sur votre téléphone.</Text>
          </Pressable>
        </View>
        {preferences.backupMethod === 'cloud' && (
          <Pressable
            disabled={busyAction !== null || !preferences.backupCloudUrl}
            onPress={handleCloudSync}
            style={[styles.primaryButton, (busyAction !== null || !preferences.backupCloudUrl) && styles.buttonDisabled, { marginTop: spacing.sm }]}
          >
            <Text style={styles.primaryButtonLabel}>
              {busyAction === 'cloud' ? 'Sauvegarde cloud...' : 'Sauvegarder sur ma base'}
            </Text>
          </Pressable>
        )}
        {preferences.backupMethod === 'local' && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>⚠️ Message de vigilance</Text>
            <Text style={styles.warningText}>
              Le stockage local signifie que vos données ne quittent jamais votre téléphone. Si vous perdez votre appareil, si celui-ci tombe en panne ou si l'application est désinstallée, l'intégralité de vos données sera définitivement perdue. Pensez à effectuer des exports réguliers. Une copie de sécurité automatique est tout de même conservée chaque semaine dans le stockage interne de l'app (4 dernières copies).
            </Text>
          </View>
        )}
      </View>

      <SectionTitle
        eyebrow="Sauvegarde"
        title="Import et export JSON"
        subtitle="Importe un fichier JSON compatible et exporte une sauvegarde complete de l app."
      />
      <View style={styles.securityCard}>
        <Text style={styles.securityText}>
          Importe un fichier JSON compatible ou partage une sauvegarde depuis ce téléphone.
        </Text>
        <View style={styles.profileList}>
          {exportProfiles.map((profile) => {
            const selected = exportProfile === profile.id;
            return (
              <Pressable
                key={profile.id}
                onPress={() => setExportProfile(profile.id)}
                style={[styles.profileChip, selected && styles.profileChipSelected]}
              >
                <Text style={[styles.profileLabel, selected && styles.profileLabelSelected]}>{profile.label}</Text>
                <Text style={[styles.profileDescription, selected && styles.profileDescriptionSelected]}>{profile.description}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.passwordBlock}>
          <Text style={styles.fieldLabel}>Mot de passe optionnel</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={(value) => {
              setBackupPassword(value);
              setPendingImport(null);
            }}
            placeholder="Laisser vide pour JSON non chiffré"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            value={backupPassword}
          />
          <Text style={styles.passwordHint}>Le meme mot de passe sera demande pour previsualiser puis importer une sauvegarde chiffrée.</Text>
        </View>
        {pendingImport ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{pendingImport.sourceLabel}</Text>
            <Text style={styles.previewBody}>{pendingImport.summary}</Text>
            <Pressable onPress={() => { setPendingImport(null); setSyncFeedback(null); }} style={styles.previewCancel}>
              <Text style={styles.previewCancelLabel}>Annuler cet import</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.buttonRow}>
          <Pressable
            disabled={busyAction !== null}
            onPress={handleImportBackup}
            style={[styles.primaryButton, busyAction !== null && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonLabel}>
              {busyAction === 'import' ? 'Import en cours...' : pendingImport ? 'Confirmer import' : 'Importer un JSON'}
            </Text>
          </Pressable>
          <Pressable
            disabled={busyAction !== null}
            onPress={handleExportBackup}
            style={[styles.secondaryButton, busyAction !== null && styles.buttonDisabled]}
          >
            <Text style={styles.secondaryButtonLabel}>
              {busyAction === 'export' ? 'Export en cours...' : 'Exporter'}
            </Text>
          </Pressable>
        </View>
        {syncFeedback ? <Text style={styles.syncFeedback}>{syncFeedback}</Text> : null}
      </View>

      <SectionTitle
        eyebrow="Lecture"
        title="Export Markdown"
        subtitle="Un fichier .md lisible partout : notes, journal et contacts."
      />
      <View style={styles.securityCard}>
        <Text style={styles.securityText}>
          Contrairement au JSON, ce format est fait pour être relu ou imprimé, pas pour être réimporté.
        </Text>
        <Pressable
          disabled={busyAction !== null}
          onPress={handleExportMarkdown}
          style={[styles.secondaryButton, busyAction !== null && styles.buttonDisabled]}
        >
          <Text style={styles.secondaryButtonLabel}>
            {busyAction === 'markdown' ? 'Export en cours...' : 'Exporter en Markdown'}
          </Text>
        </Pressable>
      </View>
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  securityCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  securityText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  passwordBlock: {
    gap: spacing.sm,
  },
  passwordHint: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  warningBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.warning,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  warningTitle: {
    color: colors.warning,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  warningText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  profileList: {
    gap: spacing.sm,
  },
  profileChip: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.xs,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  profileChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  profileLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  profileLabelSelected: {
    color: colors.white,
  },
  profileDescription: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  profileDescriptionSelected: {
    color: colors.white,
  },
  previewCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  previewTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  previewBody: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  previewCancel: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  previewCancelLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryButtonLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  syncFeedback: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
