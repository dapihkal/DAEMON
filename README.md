# Carnet Mobile

Application Expo locale-first pour organiser notes, rappels, listes, projets, relations, collections et suivis personnels dans un espace mobile autonome.

## Stack retenue

- Expo SDK 56
- Expo Router pour la navigation
- expo-sqlite pour la source de verite locale
- expo-secure-store pour le PIN et les secrets locaux
- expo-local-authentication pour le deverrouillage Face ID / empreinte autour du PIN local
- expo-notifications pour les rappels locaux
- crypto-js pour les exports JSON chiffres par mot de passe optionnel
- Google Fonts Manrope + Syne + JetBrains Mono pour une identite editoriale lisible et chaleureuse

## Pourquoi cette direction

- L app est prevue pour le telephone uniquement.
- Le besoin principal est une vraie ergonomie mobile et une architecture maintenable.
- Firebase n est pas necessaire au premier cran tant que l usage reste local-first.

## Ce qui est deja en place

- Shell Expo Router avec onglets, modules specialises et navigation directe vers les items depuis l accueil
- Base SQLite et schema local evolutif
- Seed de donnees de demonstration
- Ecran d accueil de pilotage
- Flux Cercle local avec fiche contact et liens reciproques
- Flux Pro local avec statuts, echeances et collaborateurs
- Flux Agenda local qui agrege rappels, anniversaires et echeances
- Flux Statistiques local avec indicateurs derives des modules disponibles
- Flux Tags local pour naviguer entre notes, projets, idees et tags globaux avec couleurs, renommage, fusion et suppression
- Flux Liens local avec liens transversaux, tags globaux, vues sauvegardees filtrantes et activite recente
- Pieces jointes locales rattachees aux elements transversaux depuis le flux Liens
- Flux Modeles local avec creation, edition et suppression
- Flux Livres local avec creation, edition, suppression et filtres de statut
- Flux Traitement local avec nom, dosage, observance sur 30 jours et rappel quotidien
- Flux Journal local avec humeur du jour, note libre et historique
- Flux Objectifs local avec domaine personnel/pro, progression et echeance optionnelle
- Flux Frise local avec chronologie d evenements dates et notes optionnelles
- Flux Reglages avec theme auto/clair/sombre, accents, densite, taille de texte et accueil personnalisable
- Profils d accueil Focus, Soir, Sante et Voyage avec delai de reverrouillage PIN configurable
- Revue 7 jours sur l accueil pour humeur, sommeil, activite, rappels et objectifs
- Recherche globale avec filtres rapides par notes, cercle, agenda, sante et tags
- Capture rapide depuis l accueil pour creer note, rappel, idee, liste, journal, objectif, moment ou prise selon les preferences, avec retour haptique et acces a la dictee du clavier natif
- Agenda universel regroupant rappels, routines, anniversaires, projets, objectifs, idees datees, frise, journal et collections datees
- Statistiques enrichies avec tendances 14 jours pour humeur, sommeil, activite physique et observance traitement
- Import JSON avec apercu avant confirmation, profils d export complet/essentiel/sans donnees sensibles et chiffrement optionnel par mot de passe
- Flux Listes local avec detail de liste et items coches
- Flux Notes local avec creation, edition et suppression
- Flux Rappels local avec creation, edition, suppression, regroupement par echeance et notifications locales simples
- Stockage du PIN dans Secure Store avec reverrouillage automatique ou manuel, et deverrouillage biometrique si l appareil est configure
- Import JSON compatible et export d une sauvegarde mobile partageable, avec signal d accueil quand aucun export recent n existe

## Ce qui reste a faire

1. Etendre les vues sauvegardees filtrantes directement dans les modules metier.
2. Ajouter une gestion plus fine des gros fichiers attaches: limite, progression et alertes avant export.
3. Evaluer plus tard une synchro cloud automatique si un vrai besoin apparait; le partage d export chiffre reste aujourd hui la voie compatible iCloud Drive / Google Drive.
4. Ajouter de vrais widgets d ecran d accueil via `expo-widgets` dans un dev build iOS si ce besoin devient prioritaire.
5. Etudier une reconnaissance vocale native via module tiers ou dev build; Expo SDK 56 expose `expo-speech` pour la synthese vocale, pas pour la dictee speech-to-text.

## Lancer le projet

```bash
npm install
npm run start
```

Puis ouvrir sur un telephone via Expo Go pour le shell et les flux locaux.

## Installs et mises a jour

- L identite de l app est maintenant fixee a `com.carnet.mobile` sur iOS et Android pour eviter de casser les mises a jour par-dessus une installation existante.
- Les donnees locales vivent dans SQLite et le PIN dans Secure Store. Une mise a jour installee par-dessus la meme app doit conserver ces donnees.
- Evite de desinstaller l app entre deux versions si tu veux garder les donnees locales.
- Avant une release un peu risquee, exporte un snapshot JSON depuis l onglet Plus pour avoir une restauration simple si besoin.
- Une base EAS minimale est en place dans `eas.json` pour preparer des builds installables sans repartir d Expo Go.

## Notes importantes

- Les notifications locales fonctionnent en Expo Go.
- La biometrie fonctionne avec `expo-local-authentication`; Face ID sur iOS doit etre teste dans un development build, pas dans Expo Go.
- Les fonctions plus avancees de notifications/push, widgets iOS et reconnaissance vocale native demanderont ensuite un dev build.
- Les donnees restent locales par defaut; exporte une sauvegarde JSON avant les releases importantes.
