import type {
  CountryRegion,
  GameStatus,
  IdeaStatus,
  SubstanceCategory,
} from '../db/types';

export const ideaStatusOptions: Array<{ id: IdeaStatus; label: string; color: string }> = [
  { id: 'explorer', label: 'À explorer', color: '#a87bff' },
  { id: 'encours', label: 'En cours', color: '#ffb24a' },
  { id: 'publie', label: 'Publié', color: '#2fd4a8' },
];

export const substanceCategoryOptions: Array<{ id: SubstanceCategory; label: string; color: string }> = [
  { id: 'stim', label: 'Stimulants', color: '#ff3b30' },
  { id: 'stim_nps', label: 'Stimulants NPS', color: '#ff6b6b' },
  { id: 'depr', label: 'Dépresseurs', color: '#ffcc00' },
  { id: 'depr_nps', label: 'Dépresseurs NPS', color: '#ffe066' },
  { id: 'opio', label: 'Opioïdes', color: '#ff9500' },
  { id: 'opio_nps', label: 'Opioïdes NPS', color: '#ffb347' },
  { id: 'disso', label: 'Dissociatifs', color: '#00f2fe' },
  { id: 'disso_nps', label: 'Dissociatifs NPS', color: '#82e9de' },
  { id: 'canna', label: 'Cannabinoïdes', color: '#34c759' },
  { id: 'canna_nps', label: 'Cannabinoïdes NPS', color: '#7ee081' },
  { id: 'cathi', label: 'Cathinones', color: '#800020' },
  { id: 'cathi_nps', label: 'Cathinones NPS', color: '#9d3a51' },
  { id: 'psy', label: 'Psychédéliques', color: '#ff2d55' },
  { id: 'psy_nps', label: 'Psychédéliques NPS', color: '#ff7390' },
  { id: 'empath', label: 'Empathogènes', color: '#af52de' },
  { id: 'empath_nps', label: 'Empathogènes NPS', color: '#c382e7' },
  { id: 'autre', label: 'Autres', color: '#8b95a9' },
];

export const doseRoutes = [
  'Orale',
  'Sublinguale',
  'Nasale',
  'Fumée',
  'Vaporisée',
  'Intraveineuse',
  'Intramusculaire',
  'Rectale',
  'Autre',
];

export const doseUnits = ['mg', 'g', 'ug', 'ml', 'cl', 'comprimé', 'taffe', 'verre', 'dose', 'autre'];

export const feelOptions = ['—', '😖', '😐', '🙂', '😄', '🤩'];

export const gameStatusOptions: Array<{ id: GameStatus; label: string; color: string }> = [
  { id: 'aplayer', label: 'À jouer', color: '#a87bff' },
  { id: 'encours', label: 'En cours', color: '#ffb24a' },
  { id: 'fini', label: 'Fini', color: '#2fd4a8' },
  { id: 'abandon', label: 'Abandonné', color: '#8b95a9' },
];

export const countryRegionOptions: Array<{ id: CountryRegion; label: string; color: string }> = [
  { id: 'europe', label: 'Europe', color: '#4f8bff' },
  { id: 'ameriques', label: 'Amériques', color: '#ef7d34' },
  { id: 'asie', label: 'Asie', color: '#e0559b' },
  { id: 'afrique', label: 'Afrique', color: '#54b62e' },
  { id: 'oceanie', label: 'Océanie', color: '#13b8a6' },
  { id: 'autre', label: 'Autre', color: '#a87bff' },
];