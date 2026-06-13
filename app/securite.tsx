import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, Switch, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { SectionTitle } from '../src/components/section-title';
import type { AppPinRelockDelay } from '../src/db/types';
import { clearPinAsync, getStoredPinAsync, requestAppLock, savePinAsync, isBiometricsAvailableAsync, wipeAllDataAsync } from '../src/lib/security';
import { useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/use-themed-styles';

const pinRelockDelayOptions: Array<{ id: AppPinRelockDelay; label: string; description: string }> = [
  { id: 'immediate', label: 'Immédiat', description: 'Verrouille dès que l\'app quitte le premier plan.' },
  { id: 'minute', label: '1 min', description: 'Laisse une courte reprise sans PIN.' },
  { id: 'five', label: '5 min', description: 'Pratique quand tu navigues entre deux apps.' },
  { id: 'never', label: 'Manuel', description: 'Verrouillage uniquement depuis le bouton.' },
];

/** Détecte les PIN triviaux : chiffres identiques, suites croissantes/décroissantes. */
const isWeakPin = (pin: string): boolean => {
  if (/^(\d)\1+$/.test(pin)) return true; // 0000, 111111…
  const digits = pin.split('').map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  return ascending || descending; // 1234, 9876, 8901…
};

type Feedback = { text: string; kind: 'success' | 'error' } | null;

export default function SecurityScreen() {
  const { colors } = useTheme();
  const { preferences, updatePreferences } = useThemePreferences();
  const styles = useThemedStyles(createStyles);
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [feedback, setFeedbackState] = useState<Feedback>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFeedback = useCallback((next: Feedback) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedbackState(next);
    if (next?.kind === 'success') {
      feedbackTimer.current = setTimeout(() => setFeedbackState(null), 4000);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const available = await isBiometricsAvailableAsync();
      if (active) setBiometricsAvailable(available);
    })();
    return () => {
      active = false;
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
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
    if (busy) return;

    if (!/^\d{4,8}$/.test(draftPin)) {
      setFeedback({ text: 'Entre un PIN de 4 à 8 chiffres.', kind: 'error' });
      return;
    }
    if (draftPin !== confirmPin) {
      setFeedback({ text: 'Les deux saisies ne correspondent pas.', kind: 'error' });
      return;
    }
    if (draftPin === storedPin) {
      setFeedback({ text: 'Ce PIN est déjà celui en place.', kind: 'error' });
      return;
    }

    const save = async () => {
      setBusy(true);
      try {
        await savePinAsync(draftPin);
        setDraftPin('');
        setConfirmPin('');
        setStoredPin(await getStoredPinAsync());
        setFeedback({ text: storedPin ? 'PIN mis à jour.' : 'PIN local activé.', kind: 'success' });
      } catch {
        setFeedback({ text: 'Impossible d\'enregistrer le PIN. Réessaie.', kind: 'error' });
      } finally {
        setBusy(false);
      }
    };

    if (isWeakPin(draftPin)) {
      Alert.alert(
        'PIN facile à deviner',
        'Ce code est une suite ou une répétition (ex. 1234, 0000). Il sera essayé en premier par quiconque accède à ton téléphone. Le garder quand même ?',
        [
          { text: 'Choisir un autre', style: 'cancel' },
          { text: 'Garder ce PIN', style: 'destructive', onPress: () => void save() },
        ]
      );
      return;
    }

    await save();
  };

  const handleClearPin = () => {
    if (busy) return;

    const autoWipeActive = preferences.wipeDataAfterFailedAttempts !== null;
    Alert.alert(
      'Désactiver le PIN ?',
      autoWipeActive
        ? 'L\'app s\'ouvrira sans authentification. La biométrie et l\'auto-destruction seront aussi désactivées puisqu\'elles dépendent du PIN.'
        : 'L\'app s\'ouvrira sans authentification. La biométrie sera aussi désactivée.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Désactiver',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await clearPinAsync();
              updatePreferences({ useBiometrics: false, wipeDataAfterFailedAttempts: null });
              setStoredPin(null);
              setDraftPin('');
              setConfirmPin('');
              setFeedback({ text: 'PIN retiré.', kind: 'success' });
            } catch {
              setFeedback({ text: 'Impossible de retirer le PIN. Réessaie.', kind: 'error' });
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleWipeData = () => {
    if (busy) return;

    Alert.alert(
      'Remise à zéro',
      'Es-tu vraiment sûr de vouloir effacer toutes les données locales ? Cette action est irréversible et supprimera tout ton historique, tes réglages et tes fichiers.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          style: 'destructive',
          onPress: () => {
            // Seconde confirmation : l'action est irréversible et facile à déclencher par erreur.
            Alert.alert(
              'Dernière confirmation',
              'Toutes les données seront définitivement perdues, sans possibilité de récupération.',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Tout effacer',
                  style: 'destructive',
                  onPress: async () => {
                    setBusy(true);
                    try {
                      await wipeAllDataAsync();
                      setStoredPin(null);
                      setDraftPin('');
                      setConfirmPin('');
                      setFeedback({ text: 'Toutes les données ont été effacées.', kind: 'success' });
                    } catch {
                      setFeedback({ text: 'L\'effacement a échoué. Réessaie.', kind: 'error' });
                    } finally {
                      setBusy(false);
                    }
                  },
                },
              ]
            );
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
          accessibilityLabel="Nouveau code PIN"
          autoComplete="off"
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
          textContentType="oneTimeCode"
          value={draftPin}
        />
        {draftPin.length > 0 && (
          <TextInput
            accessibilityLabel="Confirmation du code PIN"
            autoComplete="off"
            keyboardType="number-pad"
            maxLength={8}
            onChangeText={(value) => {
              setConfirmPin(value.replace(/\D/g, ''));
              setFeedback(null);
            }}
            placeholder="Confirme le code"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            textContentType="oneTimeCode"
            value={confirmPin}
          />
        )}
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={handleSavePin}
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonLabel}>{storedPin ? 'Modifier' : 'Activer'}</Text>
          </Pressable>
          {storedPin && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={handleClearPin}
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonLabel}>Désactiver</Text>
            </Pressable>
          )}
        </View>
        {feedback ? (
          <Text style={[styles.feedbackText, feedback.kind === 'error' && styles.feedbackError]}>
            {feedback.text}
          </Text>
        ) : null}
      </View>

      {biometricsAvailable && (
        <View style={styles.securityCard}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Biométrie</Text>
            <Switch
              accessibilityLabel="Déverrouillage biométrique"
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
        {!storedPin && (
          <Text style={styles.warningText}>
            Cette option nécessite un code PIN actif : elle se déclenche sur les codes erronés.
          </Text>
        )}
        <View style={styles.profileList}>
          {[null, 5, 10, 20].map((count) => {
            const selected = preferences.wipeDataAfterFailedAttempts === count;
            const disabled = !storedPin && count !== null;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                key={String(count)}
                onPress={() => updatePreferences({ wipeDataAfterFailedAttempts: count })}
                style={[
                  styles.optionCard,
                  selected && styles.optionCardSelected,
                  disabled && styles.optionCardDisabled,
                ]}
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
              Cette option est radicale. Assure-toi d'avoir des sauvegardes régulières si tu l'actives.
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
              accessibilityRole="radio"
              accessibilityState={{ selected }}
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
          <Pressable accessibilityRole="button" onPress={requestAppLock} style={styles.lockNowButton}>
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
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={handleWipeData}
          style={[styles.dangerButton, busy && styles.buttonDisabled]}
        >
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
  feedbackError: {
    color: colors.warning,
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
  buttonDisabled: {
    opacity: 0.5,
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
  optionCardDisabled: {
    opacity: 0.45,
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
