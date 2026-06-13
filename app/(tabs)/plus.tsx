import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { AppShell } from '../../src/components/app-shell';
import { useTheme, useThemePreferences } from '../../src/theme/theme-provider';
import { fonts, radii, spacing } from '../../src/theme/tokens';
import { useThemedStyles } from '../../src/theme/use-themed-styles';

export default function PlusScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useThemedStyles(createStyles);

  const friseHref = '/frise' as Href;
  const journalHref = '/journal' as Href;
  const objectifsHref = '/objectifs' as Href;
  const treatmentHref = '/traitement' as Href;

  const moduleCardStyle = ({ pressed }: { pressed: boolean }) => [styles.moduleCard, pressed && styles.pressedCard];

  return (
    <AppShell kicker="Modules" title="Plus">
      <View style={styles.moduleGrid}>
        <Pressable onPress={() => router.push('/notes')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Notes</Text>
          <Text style={styles.moduleBody}>Capture, édition, tags et liens avec les personnes du cercle.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/listes')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Listes</Text>
          <Text style={styles.moduleBody}>Listes actives, items restants et suivi des choses à finir.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/rappels')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Rappels</Text>
          <Text style={styles.moduleBody}>Échéances, routines et notifications locales.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/sante')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Santé</Text>
          <Text style={styles.moduleBody}>Hub général pour consos, traitement, sommeil et activité physique.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/sommeil')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Sommeil</Text>
          <Text style={styles.moduleBody}>Nuits, horaires de coucher et réveil, qualité et notes.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/activite')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Activité</Text>
          <Text style={styles.moduleBody}>Séances physiques, durée, intensité et ressenti après effort.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/idees')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Idées</Text>
          <Text style={styles.moduleBody}>Capture, pipeline, tags, personnes impliquées et prochaines actions.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/liens')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Liens</Text>
          <Text style={styles.moduleBody}>Liens transversaux, tags globaux, vues sauvegardées et journal d'activité.</Text>
        </Pressable>
        {preferences.showSensitiveContent ? (
          <>
            <Pressable onPress={() => router.push('/conso')} style={moduleCardStyle}>
              <Text style={styles.moduleTitle}>Conso</Text>
              <Text style={styles.moduleBody}>Journal des prises avec catégorie, dose, voie, coût, contexte, ressenti et vue calendrier.</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/pharmaco')} style={moduleCardStyle}>
              <Text style={styles.moduleTitle}>Substances</Text>
              <Text style={styles.moduleBody}>Catalogue de référence avec catégories, premières expériences, notes et fréquence.</Text>
            </Pressable>
          </>
        ) : null}
        <Pressable onPress={() => router.push('/jeux')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Jeux</Text>
          <Text style={styles.moduleBody}>Collection de jeux avec plateforme, statut, note et date.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/pays')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Pays</Text>
          <Text style={styles.moduleBody}>Pays visités avec continent, ville, année, note et souvenir.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/concerts')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Concerts</Text>
          <Text style={styles.moduleBody}>Concerts vus en live avec lieu, date, note et commentaires.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/cercle')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Cercle</Text>
          <Text style={styles.moduleBody}>Contacts, catégories, liens et notes relationnelles.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/pro')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Pro</Text>
          <Text style={styles.moduleBody}>Projets, échéances, tags et collaborateurs liés au cercle.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/agenda')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Agenda</Text>
          <Text style={styles.moduleBody}>Calendrier des rappels, anniversaires et échéances.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/stats')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Suivi</Text>
          <Text style={styles.moduleBody}>Aperçu chiffré des données locales.</Text>
        </Pressable>
        {preferences.showSensitiveContent ? (
          <Pressable onPress={() => router.push(treatmentHref)} style={moduleCardStyle}>
            <Text style={styles.moduleTitle}>Traitement</Text>
            <Text style={styles.moduleBody}>Nom, dosage, observance et rappel quotidien pour le suivi santé.</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.push(journalHref)} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Journal</Text>
          <Text style={styles.moduleBody}>Humeur du jour, note libre et historique simple.</Text>
        </Pressable>
        <Pressable onPress={() => router.push(objectifsHref)} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Objectifs</Text>
          <Text style={styles.moduleBody}>Objectifs personnels ou professionnels, progression et échéance optionnelle.</Text>
        </Pressable>
        <Pressable onPress={() => router.push(friseHref)} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Frise</Text>
          <Text style={styles.moduleBody}>Chronologie des moments clés avec date, titre et note optionnelle.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/tags')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Tags</Text>
          <Text style={styles.moduleBody}>Navigation transversale entre notes, projets et idées étiquetés.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/templates')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Modèles</Text>
          <Text style={styles.moduleBody}>Structures réutilisables pour garder des formats prêts à remplir sur mobile.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/livres')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Livres</Text>
          <Text style={styles.moduleBody}>Bibliothèque de lectures avec statut, note et commentaire.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/reglages')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Réglages</Text>
          <Text style={styles.moduleBody}>Thème, accent, confort de lecture et accueil personnalisable.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/securite')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Sécurité</Text>
          <Text style={styles.moduleBody}>Code PIN local, verrouillage manuel et délai de reverrouillage.</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/sauvegarde')} style={moduleCardStyle}>
          <Text style={styles.moduleTitle}>Sauvegarde</Text>
          <Text style={styles.moduleBody}>Export et import de backups JSON, avec option de chiffrement.</Text>
        </Pressable>
        {!preferences.showSensitiveContent ? (
          <Pressable onPress={() => router.push('/reglages')} style={moduleCardStyle}>
            <Text style={styles.moduleTitle}>Modules sensibles masqués</Text>
            <Text style={styles.moduleBody}>Conso, substances et traitement restent disponibles en réactivant leur affichage dans Réglages.</Text>
          </Pressable>
        ) : null}
      </View>
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressedCard: {
    borderColor: colors.accent,
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  moduleGrid: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
  moduleCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.xs,
    minWidth: 0,
    padding: spacing.lg,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  moduleTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
  },
  moduleBody: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
});
