import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, Switch, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { SectionTitle } from '../src/components/section-title';
import type { AppPinRelockDelay } from '../src/db/types';
import { clearPinAsync, getStoredPinAsync, requestAppLock, savePinAsync, isBiometricsAvailableAsync, wipeAllDataAsync } from '../src/lib/security';
import { useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

const pinRelockDelayOptions: Array<{ id: AppPinRelockDelay; label: string; description: string }> = [
  { id: 'immediate', label: 'Immédiat', description: 'Verrouille dès que l\'app quitte le premier plan.' },
  { id: 'minute', label: '1 min', description: 'Laisse une courte reprise sans PIN.' },
  { id: 'five', label: '5 min', description: 'Pratique quand tu navigues entre deux apps.' },
  { id: 'never', label: 'Manuel', description: 'Verrouillage uniquement depuis le bouton.' },
];

export default function SecurityScreen() {
  const { colors } = useTheme();
  const { preferences, updatePreferences } = useThemePreferences();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

  useEffect(() => {
    void (async () => {
      const available = await isBiometricsAvailableAsync();
      setBiometricsAvailable(available);
    })();
  }, []);

  const refresh = useCallback(() => {
    let active = true;

    void (async () => {
      const pin = await getStoredPinAsync();
      if (active) {
        setStoredPin(pin);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(refresh);

  const handleSavePin = async () => {
    if (!/^\d{4,8}$/.test(draftPin)) {
      setFeedback('Entre un PIN de 4 à 8 chiffres.');
      return;
    }

    await savePinAsync(draftPin);
    setDraftPin('');
    setStoredPin(await getStoredPinAsync());
    setFeedback('PIN local activé.');
  };

  const handleClearPin = async () => {
    await clearPinAsync();
    setStoredPin(null);
    setDraftPin('');
    setFeedback('PIN retiré.');
  };

  const handleWipeData = () => {
    Alert.alert(
      'Remise à zéro',
      'Es-tu vraiment sûr de vouloir effacer toutes les données locales ? Cette action est irréversible et supprimera tout ton historique, tes réglages et tes fichiers.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tout effacer',
          style: 'destructive',
          onPress: async () => {
            await wipeAllDataAsync();
            setFeedback('Toutes les données ont été effacées.');
          },
        },
      ]
    );
  };

  return (
    <AppShell kicker="Paramètres" title="Sécurité">
      <SectionTitle
        eyebrow="Verrou"
        title="Accès à l'application"
        subtitle="Protège tes données en exigeant une authentification à l'ouverture."
      />

      <View style={styles.securityCard}>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>Code PIN local</Text>
          {storedPin ? <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Actif</Text></View> : null}
        </View>
        <Text style={styles.securityText}>
          {storedPin ? 'Un code PIN est configuré sur cet appareil.' : 'Aucun code PIN défini pour le moment.'}
        </Text>
        <TextInput
          keyboardType="number-pad"
          maxLength={8}
          onChangeText={(value) => {
            setDraftPin(value.replace(/\D/g, ''));
            setFeedback(null);
          }}
          placeholder="Nouveau code (4 à 8 chiffres)"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={draftPin}
        />
        <View style={styles.buttonRow}>
          <Pressable onPress={handleSavePin} style={styles.primaryButton}>
            <Text style={styles.primaryButtonLabel}>{storedPin ? 'Modifier' : 'Activer'}</Text>
          </Pressable>
          {storedPin && (
            <Pressable onPress={handleClearPin} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonLabel}>Désactiver</Text>
            </Pressable>
          )}
        </View>
        {feedback ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
      </View>

      {biometricsAvailable && (
        <View style={styles.securityCard}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Biométrie</Text>
            <Switch
              disabled={!storedPin}
              onValueChange={(value) => updatePreferences({ useBiometrics: value })}
              trackColor={{ false: colors.line, true: colors.accent }}
              value={preferences.useBiometrics && !!storedPin}
            />
          </View>
          <Text style={styles.securityText}>
            Utilise ton empreinte digitale ou la reconnaissance faciale pour déverrouiller plus rapidement.
          </Text>
          {!storedPin && (
            <Text style={styles.warningText}>
              Configure un code PIN d'abord pour activer la biométrie.
            </Text>
          )}
        </View>
      )}

      <SectionTitle
        eyebrow="Robustesse"
        title="Auto-destruction"
        subtitle="Efface toutes les données locales après plusieurs échecs consécutifs."
      />

      <View style={styles.securityCard}>
        <View style={styles.profileList}>
          {[null, 5, 10, 20].map((count) => {
            const selected = preferences.wipeDataAfterFailedAttempts === count;
            return (
              <Pressable
                key={String(count)}
                onPress={() => updatePreferences({ wipeDataAfterFailedAttempts: count })}
                style={[styles.optionCard, selected && styles.optionCardSelected]}
              >
                <View style={styles.optionHeader}>
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                    {count === null ? 'Désactivé' : `${count} tentatives`}
                  </Text>
                  {selected && <View style={styles.radioSelected} />}
                </View>
                <Text style={[styles.optionDescription, selected && styles.optionDescriptionSelected]}>
                  {count === null
                    ? 'Aucune suppression automatique.'
                    : `Les données seront définitivement supprimées après ${count} codes erronés.`}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {preferences.wipeDataAfterFailedAttempts !== null && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>⚠️ Attention</Text>
            <Text style={styles.warningText}>
              Cette option est radicale. Assurez-vous d'avoir des sauvegardes régulières si vous l'activez.
            </Text>
          </View>
        )}
      </View>

      <SectionTitle
        eyebrow="Délai"
        title="Verrouillage automatique"
        subtitle="Choisis après combien de temps l'app doit demander le code."
      />

      <View style={styles.optionsList}>
        {pinRelockDelayOptions.map((option) => {
          const selected = preferences.pinRelockDelay === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => updatePreferences({ pinRelockDelay: option.id })}
              style={[styles.optionCard, selected && styles.optionCardSelected]}
            >
              <View style={styles.optionHeader}>
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
                {selected && <View style={styles.radioSelected} />}
              </View>
              <Text style={[styles.optionDescription, selected && styles.optionDescriptionSelected]}>
                {option.description}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {storedPin ? (
        <View style={{ marginTop: spacing.xl, paddingHorizontal: spacing.md }}>
          <Pressable onPress={requestAppLock} style={styles.lockNowButton}>
            <Text style={styles.lockNowLabel}>Verrouiller immédiatement</Text>
          </Pressable>
        </View>
      ) : null}

      <SectionTitle
        eyebrow="Danger"
        title="Réinitialisation"
        subtitle="Efface l'intégralité du contenu local stocké sur cet appareil."
      />

      <View style={{ marginBottom: spacing.xl, paddingHorizontal: spacing.md }}>
        <Pressable onPress={handleWipeData} style={styles.dangerButton}>
          <Text style={styles.dangerButtonLabel}>Remettre à zéro le stockage local</Text>
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
    marginBottom: spacing.md,
  },
  securityText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  activeBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.success + '40',
  },
  activeBadgeText: {
    color: colors.success,
    fontSize: 10,
    fontFamily: fonts.bodyBold,
    textTransform: 'uppercase',
  },
  feedbackText: {
    color: colors.accent,
    fontSize: 12,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  warningText: {
    color: colors.warning,
    fontSize: 12,
    fontFamily: fonts.body,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
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
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
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
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryButtonLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  lockNowButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  lockNowLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  profileList: {
    gap: spacing.sm,
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
  optionsList: {
    gap: spacing.sm,
  },
  optionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  optionCardSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  optionLabelSelected: {
    color: colors.accent,
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  optionDescription: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  optionDescriptionSelected: {
    color: colors.text,
  },
  dangerButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.sun + '15',
    borderColor: colors.sun,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  dangerButtonLabel: {
    color: colors.sun,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
});