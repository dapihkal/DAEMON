import type { AppDensity, AppHomeProfile, AppTextScale, HomeModuleId, HomeWidgetId } from '../db/types';

type PreferenceOption<T extends string> = {
  id: T;
  label: string;
  description: string;
};

export const densityOptions: Array<PreferenceOption<AppDensity>> = [
  {
    id: 'comfortable',
    label: 'Confort',
    description: 'Espaces larges et lecture plus posée.',
  },
  {
    id: 'compact',
    label: 'Compact',
    description: 'Plus de contenu visible à chaque écran.',
  },
];

export const textScaleOptions: Array<PreferenceOption<AppTextScale>> = [
  {
    id: 'small',
    label: 'Petit',
    description: 'Typographie compacte pour un maximum d\'éléments.',
  },
  {
    id: 'medium',
    label: 'Moyen',
    description: 'Typographie équilibrée par défaut.',
  },
  {
    id: 'large',
    label: 'Grand',
    description: 'Titres et textes plus présents.',
  },
];

export const homeWidgetOptions: Array<PreferenceOption<HomeWidgetId>> = [
  {
    id: 'focus',
    label: 'Focus du jour',
    description: 'Rappels, routines et prochaine action utile.',
  },
  {
    id: 'treatment',
    label: 'Traitement',
    description: 'Carte si le suivi est actif et pas coché aujourd\'hui.',
  },
  {
    id: 'journal',
    label: 'Journal',
    description: 'Invitation à noter l\'humeur si le jour est vide.',
  },
  {
    id: 'birthdays',
    label: 'Cercle',
    description: 'Anniversaires proches depuis les contacts.',
  },
  {
    id: 'backup',
    label: 'Sauvegarde',
    description: 'Rappel discret quand aucun export récent n\'existe.',
  },
];

export const defaultHomeWidgets = homeWidgetOptions.map((option) => option.id);

export const homeProfileOptions: Array<PreferenceOption<AppHomeProfile> & { modules: HomeModuleId[]; widgets: HomeWidgetId[] }> = [
  {
    id: 'custom',
    label: 'Libre',
    description: 'Garde ton ordre actuel et tes modules choisis.',
    modules: [],
    widgets: [],
  },
  {
    id: 'focus',
    label: 'Focus',
    description: 'Rappels, listes, objectifs, agenda et projets en tête.',
    modules: ['rappels', 'listes', 'objectifs', 'agenda', 'pro', 'notes', 'liens', 'stats', 'plus'],
    widgets: ['focus', 'backup'],
  },
  {
    id: 'soir',
    label: 'Soir',
    description: 'Journal, frise, livres, idées et notes pour le retour au calme.',
    modules: ['journal', 'frise', 'livres', 'idees', 'notes', 'agenda', 'liens', 'templates', 'plus'],
    widgets: ['journal', 'birthdays'],
  },
  {
    id: 'sante',
    label: 'Santé',
    description: 'Santé, journal, rappels et signaux de suivi.',
    modules: ['sante', 'journal', 'rappels', 'stats', 'agenda', 'liens', 'plus'],
    widgets: ['treatment', 'journal', 'focus'],
  },
  {
    id: 'voyage',
    label: 'Voyage',
    description: 'Pays, concerts, livres, frise et capture rapide.',
    modules: ['pays', 'concerts', 'livres', 'frise', 'notes', 'listes', 'agenda', 'liens', 'plus'],
    widgets: ['focus', 'birthdays', 'backup'],
  },
];

export const homeModuleOptions: Array<PreferenceOption<HomeModuleId>> = [
  { id: 'notes', label: 'Notes', description: 'Capture et lecture rapide.' },
  { id: 'rappels', label: 'Rappels', description: 'Échéances et routines.' },
  { id: 'listes', label: 'Listes', description: 'Listes actives et items restants.' },
  { id: 'liens', label: 'Liens', description: 'Liens, tags globaux et vues sauvegardées.' },
  { id: 'sante', label: 'Santé', description: 'Hub conso, traitement, sommeil et activité.' },
  { id: 'idees', label: 'Idées', description: 'Pipeline créatif et sous-tâches.' },
  { id: 'cercle', label: 'Cercle', description: 'Contacts, catégories et réseau.' },
  { id: 'pro', label: 'Pro', description: 'Projets, échéances et tags.' },
  { id: 'agenda', label: 'Agenda', description: 'Vue calendrier transversale.' },
  { id: 'stats', label: 'Statistiques', description: 'Aperçu chiffré local.' },
  { id: 'tags', label: 'Tags', description: 'Navigation par thèmes.' },
  { id: 'templates', label: 'Modèles', description: 'Structures réutilisables.' },
  { id: 'livres', label: 'Livres', description: 'Lectures et statuts.' },
  { id: 'jeux', label: 'Jeux', description: 'Collection de jeux.' },
  { id: 'pays', label: 'Pays', description: 'Voyages et souvenirs.' },
  { id: 'concerts', label: 'Concerts', description: 'Lives vus et notés.' },
  { id: 'objectifs', label: 'Objectifs', description: 'Caps personnels et professionnels.' },
  { id: 'frise', label: 'Frise', description: 'Moments clés dans le temps.' },
  { id: 'journal', label: 'Journal', description: 'Humeur et notes quotidiennes.' },
  { id: 'traitement', label: 'Traitement', description: 'Observance et rappel santé.' },
  { id: 'sommeil', label: 'Sommeil', description: 'Nuits, horaires et qualité.' },
  { id: 'activite', label: 'Activité physique', description: 'Séances, durée et intensité.' },
  { id: 'conso', label: 'Conso', description: 'Journal des prises.' },
  { id: 'pharmaco', label: 'Substances', description: 'Catalogue de substances.' },
  { id: 'reglages', label: 'Réglages', description: 'Thème et personnalisation.' },
  { id: 'plus', label: 'Plus', description: 'Sauvegarde, PIN et outils.' },
];

export const allHomeModuleIds = homeModuleOptions.map((option) => option.id);

export const defaultHomeModuleOrder: HomeModuleId[] = ['notes', 'rappels', 'agenda', 'sante', 'plus'];

export const sensitiveHomeModuleIds: HomeModuleId[] = ['conso', 'pharmaco', 'traitement'];

export const agendaColorOptions = [
  '#ff7a59',
  '#ffb24a',
  '#f59e0b',
  '#7f8cff',
  '#6366f1',
  '#bd70ff',
  '#a855f7',
  '#20a4a2',
  '#0d9488',
  '#f05d8f',
  '#e11d48',
  '#7aa35a',
  '#16a34a',
  '#d34f4f',
  '#6f8fce',
  '#9b7b4f',
];

export const agendaCategoryOptions = [
  { id: 'journal', label: 'Humeur' },
  { id: 'treatment', label: 'Traitement' },
  { id: 'manual', label: 'Rappels' },
  { id: 'date', label: 'Rappels (Date)' },
  { id: 'rdv', label: 'Rappels (RDV)' },
  { id: 'medicament', label: 'Rappels (Méd)' },
  { id: 'famille', label: 'Rappels (Famille)' },
  { id: 'loyer', label: 'Rappels (Loyer)' },
  { id: 'pro', label: 'Rappels (Pro)' },
  { id: 'objective', label: 'Objectifs' },
  { id: 'project', label: 'Projets' },
  { id: 'birthday', label: 'Anniv' },
  { id: 'concert', label: 'Concerts' },
  { id: 'book', label: 'Lectures' },
  { id: 'timeline', label: 'Frise' },
  { id: 'idea', label: 'Idées' },
];