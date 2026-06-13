import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSpring } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { EmptyState } from '../src/components/empty-state';
import { PeoplePicker } from '../src/components/people-picker';
import { SectionTitle } from '../src/components/section-title';
import {
  addEntityTag,
  entityKindLabels,
  listPersonRelatedEntityRefsByPersonId,
  listPersonRelationshipEventsByPersonId,
  replaceEntityPersonLinks,
  logActivity,
  type PersonRelationshipEvent,
} from '../src/db/cross-repositories';
import {
  deletePerson,
  deletePersonCategory,
  getPerson,
  listPeople,
  listPersonCategories,
  saveNote,
  savePerson,
  savePersonCategory,
  saveReminder,
  saveTimelineEntry,
} from '../src/db/repositories';
import { syncAllBirthdayRemindersAsync } from '../src/lib/birthday-reminders';
import {
  getStoredCercleCategoryLabelsAsync,
  getStoredCercleLayoutAsync,
  getStoredPreferencesAsync,
  saveCercleCategoryLabelsAsync,
  saveCercleLayoutAsync,
} from '../src/lib/preferences';
import { createId } from '../src/lib/id';
import { selectionHaptic } from '../src/lib/haptics';
import {
  defaultPersonCategories,
  getDefaultPersonCategory,
  isDefaultPersonCategory,
  personCategoryPalette,
  personCategoryRoles,
} from '../src/lib/person-categories';
import type {
  BasePersonCategory,
  EntityKind,
  EntityRef,
  Person,
  PersonCategory,
  PersonCategoryDefinition,
  PersonContactFrequency,
  PersonLink,
  PersonLinkStrength,
  PersonProfile,
  PersonRelationshipStatus,
} from '../src/db/types';
import { useTheme } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';

const networkSize = 440;
const networkCenter = networkSize / 2;

const networkRingByCategory: Record<BasePersonCategory, number> = {
  famille: 85,
  pro: 135,
  relation: 180,
  autre: 205,
};

const networkAngleByCategory: Record<BasePersonCategory, number> = {
  famille: -Math.PI / 3,
  pro: Math.PI / 4,
  relation: Math.PI * 0.8,
  autre: Math.PI * 1.3,
};

type PersonDraft = {
  id: string | null;
  name: string;
  category: PersonCategory;
  secondaryCategories: PersonCategory[];
  photoUri: string;
  favorite: boolean;
  note: string;
  birthday: string;
  phone: string;
  address: string;
  lastContactedAt: string;
  contactFrequency: PersonContactFrequency;
  relationshipStatus: PersonRelationshipStatus;
  interests: string;
  tags: string;
  role: string;
  organization: string;
  links: PersonLink[];
  profile: PersonProfile;
};

type NetworkLayoutMode = 'categories' | 'proximite' | 'contact' | 'tags';

type NetworkContactFilter = 'due' | PersonContactFrequency;

type ContactState = 'none' | 'missing' | 'ok' | 'soon' | 'due' | 'overdue';

const contactFrequencyOptions: Array<{ id: PersonContactFrequency; label: string; days: number | null }> = [
  { id: 'none', label: 'Libre', days: null },
  { id: 'weekly', label: 'Hebdo', days: 7 },
  { id: 'monthly', label: 'Mensuel', days: 30 },
  { id: 'quarterly', label: 'Trimestriel', days: 90 },
  { id: 'yearly', label: 'Annuel', days: 365 },
];

const networkLayoutOptions: Array<{ id: NetworkLayoutMode; label: string }> = [
  { id: 'categories', label: 'Catégories' },
  { id: 'proximite', label: 'Proximité' },
  { id: 'contact', label: 'Contact' },
  { id: 'tags', label: 'Tags' },
];

const relationshipEventTypes = [
  { id: 'rencontre', label: 'Rencontre / Café', color: '#f39c12' },
  { id: 'appel', label: 'Appel', color: '#3498db' },
  { id: 'message', label: 'Message / Chat', color: '#9b59b6' },
  { id: 'activite', label: 'Activité partagée', color: '#1abc9c' },
  { id: 'animosite', label: 'Animosité', color: '#e23e57' },
  { id: 'tension', label: 'Tension', color: '#ff944d' },
  { id: 'distance', label: 'Distance', color: '#8b95a9' },
  { id: 'rapprochement', label: 'Rapprochement', color: '#4f8bff' },
  { id: 'reconciliation', label: 'Réconciliation', color: '#3f8f6b' },
  { id: 'autre', label: 'Autre', color: '#a87bff' },
] as const;

const relationshipStatusOptions: Array<{ id: PersonRelationshipStatus; label: string; color: string }> = [
  { id: 'proche', label: 'Proche', color: '#3f8f6b' },
  { id: 'stable', label: 'Stable', color: '#4f8bff' },
  { id: 'fragile', label: 'Fragile', color: '#ff944d' },
  { id: 'distant', label: 'Distant', color: '#8b95a9' },
  { id: 'complique', label: 'Compliqué', color: '#e23e57' },
];

type RelationshipEventKind = typeof relationshipEventTypes[number]['id'];

type RelationshipEventDraft = {
  sourcePersonId: string;
  otherPersonIds: string[];
  kind: RelationshipEventKind;
  date: string;
  note: string;
};

type NetworkNode = {
  person: Person;
  x: number;
  y: number;
  radius: number;
  color: string;
  initials: string;
  label: string;
  selected: boolean;
  dimmed: boolean;
  showLabel: boolean;
  scale: number;
  haloOpacity: number;
  connectedToSelection: boolean;
  dragged: boolean;
};

type NetworkLine = {
  id: string;
  x: number;
  y: number;
  length: number;
  angle: number;
  color: string;
  dimmed: boolean;
  opacity: number;
  thickness: number;
  highlighted: boolean;
  glowOpacity: number;
};

type NetworkStar = {
  id: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
};

type ManualNodePosition = {
  x: number;
  y: number;
};

type DragSession = {
  nodeId: string;
  pointerStartX: number;
  pointerStartY: number;
  nodeStartX: number;
  nodeStartY: number;
  lastPointerX: number;
  lastPointerY: number;
  lastTimestamp: number;
  velocityX: number;
  velocityY: number;
  moved: boolean;
};

type DragPreview = {
  nodeId: string;
  x: number;
  y: number;
};

type InertiaSession = {
  nodeId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
};

function getCategoryMeta(category: PersonCategory, categories: PersonCategoryDefinition[] = defaultPersonCategories) {
  return (
    categories.find((entry) => entry.id === category) ??
    getDefaultPersonCategory(category) ??
    defaultPersonCategories.find((entry) => entry.id === 'autre') ??
    defaultPersonCategories[0]
  );
}

function getNetworkCategoryIndex(category: PersonCategory, categories: PersonCategoryDefinition[]) {
  return Math.max(0, categories.findIndex((entry) => entry.id === category));
}

function getNetworkRing(category: PersonCategory, categories: PersonCategoryDefinition[]) {
  if (isDefaultPersonCategory(category)) {
    return networkRingByCategory[category];
  }

  return networkRingByCategory.autre + (getNetworkCategoryIndex(category, categories) % 4) * 12;
}

function getNetworkAngle(category: PersonCategory, categories: PersonCategoryDefinition[]) {
  if (isDefaultPersonCategory(category)) {
    return networkAngleByCategory[category];
  }

  const customCategories = categories.filter((entry) => !isDefaultPersonCategory(entry.id));
  const customIndex = Math.max(0, customCategories.findIndex((entry) => entry.id === category));
  const customCount = Math.max(1, customCategories.length);

  return -Math.PI * 0.92 + ((customIndex + 0.5) / customCount) * Math.PI * 1.84;
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join('') || '?';
}

function getLinkStrength(links: PersonLink[], personId: string) {
  return links.find((link) => link.personId === personId)?.strength ?? null;
}

function hasLinkTo(links: PersonLink[], personId: string) {
  return links.some((link) => link.personId === personId);
}

function setDraftLinkStrength(links: PersonLink[], personId: string, strength: PersonLinkStrength | null) {
  if (!strength) {
    return links.filter((link) => link.personId !== personId);
  }

  const existingLink = links.find((link) => link.personId === personId);
  if (existingLink) {
    return links.map((link) => (link.personId === personId ? { ...link, strength } : link));
  }

  return [...links, { personId, strength }];
}

function getLinkStrengthLabel(strength: PersonLinkStrength) {
  if (strength === 3) {
    return 'Intime';
  }

  if (strength === 2) {
    return 'Proche';
  }

  return 'Connaissance';
}

function getStrongestLinkStrength(person: Person) {
  return person.links.reduce<PersonLinkStrength | null>((strongest, link) => {
    if (!strongest || link.strength > strongest) {
      return link.strength;
    }

    return strongest;
  }, null);
}

function listUniqueInterests(people: Person[]) {
  return [...new Set(people.flatMap((person) => person.interests.map((interest) => interest.trim()).filter(Boolean)))].sort((left, right) =>
    left.localeCompare(right, 'fr'),
  );
}

function listUniqueTags(people: Person[]) {
  return [...new Set(people.flatMap((person) => person.tags.map((tag) => tag.trim()).filter(Boolean)))].sort((left, right) =>
    left.localeCompare(right, 'fr'),
  );
}

function createEmptyPersonProfile(): PersonProfile {
  return {
    nickname: '',
    pronouns: '',
    memories: '',
    places: '',
    giftIdeas: '',
    avoidTopics: '',
    preferences: '',
    ourStory: '',
    affinityScore: 0,
    preferredActivities: '',
    sharedValues: '',
    frequentTopics: '',
    mutualSupport: '',
  };
}

function sanitizeFileName(value: string) {
  const sanitized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return sanitized || 'portrait.jpg';
}

function getContactFrequencyMeta(frequency: PersonContactFrequency) {
  return contactFrequencyOptions.find((option) => option.id === frequency) ?? contactFrequencyOptions[0];
}

function getRelationshipStatusMeta(status: PersonRelationshipStatus) {
  return relationshipStatusOptions.find((option) => option.id === status) ?? relationshipStatusOptions[1];
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function addDays(value: Date, days: number) {
  const nextDate = new Date(value);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function differenceInDays(left: Date, right: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.ceil((left.getTime() - right.getTime()) / dayMs);
}

function formatShortDate(value: string) {
  const date = parseLocalDate(value);
  if (!date) {
    return '';
  }

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatLongDate(value: string) {
  const date = parseLocalDate(value);
  if (!date) {
    return '';
  }

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function toLocalIsoDate(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function getContactSummary(person: Person): { label: string; state: ContactState; daysUntil: number | null } {
  const frequency = getContactFrequencyMeta(person.contactFrequency);
  if (!frequency.days) {
    return { label: 'Rythme libre', state: 'none', daysUntil: null };
  }

  const lastContact = parseLocalDate(person.lastContactedAt);
  if (!lastContact) {
    return { label: 'Dernier contact à dater', state: 'missing', daysUntil: null };
  }

  const nextContact = addDays(lastContact, frequency.days);
  const today = parseLocalDate(localDay()) ?? new Date();
  const daysUntil = differenceInDays(nextContact, today);

  if (daysUntil < 0) {
    return { label: `${Math.abs(daysUntil)} j de retard`, state: 'overdue', daysUntil };
  }

  if (daysUntil === 0) {
    return { label: 'À recontacter aujourd\'hui', state: 'due', daysUntil };
  }

  const soonThreshold = frequency.days <= 7 ? 2 : frequency.days <= 30 ? 7 : frequency.days <= 90 ? 14 : 30;
  if (daysUntil <= soonThreshold) {
    return { label: `Dans ${daysUntil} j`, state: 'soon', daysUntil };
  }

  return { label: `OK jusqu'au ${formatShortDate(toLocalIsoDate(nextContact))}`, state: 'ok', daysUntil };
}

function getContactUrgencyRank(person: Person) {
  const summary = getContactSummary(person);
  if (summary.state === 'overdue') {
    return 0;
  }
  if (summary.state === 'due') {
    return 1;
  }
  if (summary.state === 'soon') {
    return 2;
  }
  if (summary.state === 'missing') {
    return 3;
  }
  if (summary.state === 'ok') {
    return 4;
  }

  return 5;
}

function hashSeed(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 10000;
  }

  return hash / 1000;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createNetworkStars(motionTick: number): NetworkStar[] {
  return Array.from({ length: 28 }, (_, index) => {
    const seed = hashSeed(`star-${index}`);
    const drift = Math.sin(motionTick * 0.08 + seed * 5) * 2;

    return {
      id: `star-${index}`,
      x: 18 + ((seed * 97) % 1) * (networkSize - 36),
      y: 16 + (((seed * 173) % 1) * (networkSize - 32)) + drift,
      size: 1.5 + (((seed * 191) % 1) * 2.2),
      opacity: 0.18 + (((seed * 223) % 1) * 0.34) + Math.sin(motionTick * 0.22 + seed * 4) * 0.06,
    };
  });
}

function buildNetworkGraph(
  people: Person[],
  categoryDefinitions: PersonCategoryDefinition[],
  selectedPersonId: string | null,
  layoutMode: NetworkLayoutMode,
  selectedNetworkTag: string | null,
  externalScale = 1,
  manualPositions: Record<string, ManualNodePosition> = {},
  dragPreview: DragPreview | null = null,
  draggedNodeId: string | null = null,
) {
  const personById = new Map(people.map((person) => [person.id, person]));
  const selectedPerson = selectedPersonId ? personById.get(selectedPersonId) ?? null : null;
  const visibleIds = selectedPerson
    ? new Set([
        selectedPerson.id,
        ...selectedPerson.links.map((link) => link.personId),
        ...people.filter((person) => hasLinkTo(person.links, selectedPerson.id)).map((person) => person.id),
      ])
    : null;

  const cx = networkCenter;
  const cy = networkCenter;
  const nodeCoords = new Map<string, { x: number; y: number }>();

  if (layoutMode === 'categories') {
    const presentCategories = categoryDefinitions.filter((cat) =>
      people.some((person) => person.category === cat.id)
    );
    const catCount = presentCategories.length || 1;

    presentCategories.forEach((cat, catIdx) => {
      const baseAngle = (catIdx * (2 * Math.PI)) / catCount - Math.PI / 2;
      const catPeople = people.filter((p) => p.category === cat.id);

      const tier1 = catPeople.filter((p) => p.favorite || p.relationshipStatus === 'proche');
      const tier2 = catPeople.filter((p) => !p.favorite && (p.relationshipStatus === 'stable' || p.relationshipStatus === 'fragile'));
      const tier3 = catPeople.filter((p) => !p.favorite && p.relationshipStatus !== 'proche' && p.relationshipStatus !== 'stable' && p.relationshipStatus !== 'fragile');

      const tiers = [
        { people: tier1, r: 85 * externalScale },
        { people: tier2, r: 145 * externalScale },
        { people: tier3, r: 200 * externalScale },
      ];

      const sectorSpread = ((2 * Math.PI) / catCount) * 0.75;

      tiers.forEach((tier) => {
        const k = tier.people.length;
        tier.people.forEach((p, pIdx) => {
          const angle = k <= 1
            ? baseAngle
            : baseAngle - sectorSpread / 2 + (pIdx / (k - 1)) * sectorSpread;
          nodeCoords.set(p.id, {
            x: cx + tier.r * Math.cos(angle),
            y: cy + tier.r * Math.sin(angle),
          });
        });
      });
    });
  } else if (layoutMode === 'proximite') {
    const tier1 = people.filter((p) => p.favorite || p.relationshipStatus === 'proche')
      .sort((a, b) => a.category.localeCompare(b.category));
    const tier2 = people.filter((p) => !p.favorite && (p.relationshipStatus === 'stable' || p.relationshipStatus === 'fragile'))
      .sort((a, b) => a.category.localeCompare(b.category));
    const tier3 = people.filter((p) => !p.favorite && p.relationshipStatus !== 'proche' && p.relationshipStatus !== 'stable' && p.relationshipStatus !== 'fragile')
      .sort((a, b) => a.category.localeCompare(b.category));

    const tiers = [
      { people: tier1, r: 85 * externalScale },
      { people: tier2, r: 145 * externalScale },
      { people: tier3, r: 200 * externalScale },
    ];

    tiers.forEach((tier) => {
      const k = tier.people.length;
      tier.people.forEach((p, pIdx) => {
        const angle = (pIdx * 2 * Math.PI) / (k || 1) - Math.PI / 2;
        nodeCoords.set(p.id, {
          x: cx + tier.r * Math.cos(angle),
          y: cy + tier.r * Math.sin(angle),
        });
      });
    });
  } else if (layoutMode === 'contact') {
    const tier1 = people.filter((p) => {
      const s = getContactSummary(p).state;
      return s === 'overdue' || s === 'due';
    }).sort((a, b) => a.category.localeCompare(b.category));

    const tier2 = people.filter((p) => {
      const s = getContactSummary(p).state;
      return s === 'soon' || s === 'missing';
    }).sort((a, b) => a.category.localeCompare(b.category));

    const tier3 = people.filter((p) => {
      const s = getContactSummary(p).state;
      return s !== 'overdue' && s !== 'due' && s !== 'soon' && s !== 'missing';
    }).sort((a, b) => a.category.localeCompare(b.category));

    const tiers = [
      { people: tier1, r: 85 * externalScale },
      { people: tier2, r: 145 * externalScale },
      { people: tier3, r: 200 * externalScale },
    ];

    tiers.forEach((tier) => {
      const k = tier.people.length;
      tier.people.forEach((p, pIdx) => {
        const angle = (pIdx * 2 * Math.PI) / (k || 1) - Math.PI / 2;
        nodeCoords.set(p.id, {
          x: cx + tier.r * Math.cos(angle),
          y: cy + tier.r * Math.sin(angle),
        });
      });
    });
  } else if (layoutMode === 'tags') {
    const isTagSelected = Boolean(selectedNetworkTag);
    const tier1 = people.filter((p) => {
      if (!isTagSelected) return true;
      return p.tags.some((t) => t.toLowerCase() === selectedNetworkTag?.toLowerCase());
    }).sort((a, b) => a.category.localeCompare(b.category));

    const tier2 = isTagSelected
      ? people.filter((p) => !p.tags.some((t) => t.toLowerCase() === selectedNetworkTag?.toLowerCase()))
          .sort((a, b) => a.category.localeCompare(b.category))
      : [];

    const tiers = [
      { people: tier1, r: (isTagSelected ? 90 : 145) * externalScale },
      { people: tier2, r: 200 * externalScale },
    ];

    tiers.forEach((tier) => {
      const k = tier.people.length;
      tier.people.forEach((p, pIdx) => {
        const angle = (pIdx * 2 * Math.PI) / (k || 1) - Math.PI / 2;
        nodeCoords.set(p.id, {
          x: cx + tier.r * Math.cos(angle),
          y: cy + tier.r * Math.sin(angle),
        });
      });
    });
  }

  // Les positions manuelles (drag) priment sur le layout calculé,
  // puis la position de drag en cours prime sur tout.
  Object.entries(manualPositions).forEach(([personId, position]) => {
    if (personById.has(personId)) {
      nodeCoords.set(personId, { x: position.x, y: position.y });
    }
  });

  if (dragPreview && personById.has(dragPreview.nodeId)) {
    nodeCoords.set(dragPreview.nodeId, { x: dragPreview.x, y: dragPreview.y });
  }

  const nodes: NetworkNode[] = people.map((person) => {
    const coord = nodeCoords.get(person.id) || { x: cx, y: cy };
    const isSelected = selectedPerson?.id === person.id;
    const isVisible = visibleIds ? visibleIds.has(person.id) : true;
    const connectedToSelection = Boolean(selectedPerson && !isSelected && visibleIds?.has(person.id));
    const isDragged = draggedNodeId === person.id;

    return {
      person,
      x: coord.x,
      y: coord.y,
      radius: 15 + Math.min(4, person.links.length) * 1.5 + (person.favorite ? 3 : 0),
      color: getCategoryMeta(person.category, categoryDefinitions).color,
      initials: getInitials(person.name),
      label: getFirstName(person.name),
      selected: isSelected,
      dimmed: !isVisible && !isDragged,
      showLabel: isSelected || isVisible || isDragged,
      scale: isDragged ? 1.18 : isSelected ? 1.15 : connectedToSelection ? 1.05 : 1,
      haloOpacity: isDragged ? 0.5 : isSelected ? 0.56 : connectedToSelection ? 0.24 : isVisible ? 0.15 : 0.04,
      connectedToSelection,
      dragged: isDragged,
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.person.id, node]));
  const lines: NetworkLine[] = [];
  const seen = new Set<string>();

  people.forEach((person) => {
    person.links.forEach((link) => {
      const linkedPersonId = link.personId;
      const source = nodeById.get(person.id);
      const target = nodeById.get(linkedPersonId);
      if (!source || !target) {
        return;
      }

      const edgeId = [person.id, linkedPersonId].sort().join(':');
      if (seen.has(edgeId)) {
        return;
      }

      seen.add(edgeId);

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const strength = Math.max(link.strength, getLinkStrength(target.person.links, person.id) ?? 1) as PersonLinkStrength;
      const highlighted = Boolean(selectedPerson && (source.person.id === selectedPerson.id || target.person.id === selectedPerson.id));
      const isVisible = selectedPerson ? highlighted : true;

      lines.push({
        id: edgeId,
        x: (source.x + target.x) / 2,
        y: (source.y + target.y) / 2 - 1,
        length: Math.max(12, Math.hypot(dx, dy)),
        angle: Math.atan2(dy, dx),
        color: source.person.category === target.person.category ? source.color : '#95b8ff',
        dimmed: !isVisible,
        opacity: highlighted ? 0.45 : isVisible ? 0.22 : 0.045,
        thickness: highlighted ? 1.9 + strength * 1.05 : isVisible ? 0.9 + strength * 0.78 : 1,
        highlighted,
        glowOpacity: highlighted ? 0.24 : 0,
      });
    });
  });

  return { nodes, lines };
}

function createEmptyDraft(): PersonDraft {
  return {
    id: null,
    name: '',
    category: 'relation',
    secondaryCategories: [],
    photoUri: '',
    favorite: false,
    note: '',
    birthday: '',
    phone: '',
    address: '',
    lastContactedAt: '',
    contactFrequency: 'none',
    relationshipStatus: 'stable',
    interests: '',
    tags: '',
    role: '',
    organization: '',
    links: [],
    profile: createEmptyPersonProfile(),
  };
}

function toDraft(person: Person): PersonDraft {
  return {
    id: person.id,
    name: person.name,
    category: person.category,
    secondaryCategories: [...person.secondaryCategories],
    photoUri: person.photoUri,
    favorite: person.favorite,
    note: person.note,
    birthday: person.birthday,
    phone: person.phone,
    address: person.address,
    lastContactedAt: person.lastContactedAt,
    contactFrequency: person.contactFrequency,
    relationshipStatus: person.relationshipStatus,
    interests: person.interests.join(', '),
    tags: person.tags.join(', '),
    role: person.role,
    organization: person.organization,
    links: [...person.links],
    profile: { ...person.profile },
  };
}

function formatBirthday(value: string) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (!month || !day) {
    return null;
  }

  if (year && year > 1900) {
    return new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  return new Date(2000, month - 1, day).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getRelationshipEventMeta(kind: string) {
  return relationshipEventTypes.find((eventType) => eventType.id === kind) ?? relationshipEventTypes[relationshipEventTypes.length - 1];
}

function getReminderCategoryForPerson(category: PersonCategory) {
  if (category === 'famille') {
    return 'famille';
  }

  if (category === 'relation') {
    return 'amis';
  }

  if (category === 'pro') {
    return 'pro';
  }

  return 'autre';
}

export default function CercleScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const breathingTime = useSharedValue(0);

  useEffect(() => {
    breathingTime.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 4000 }),
      -1,
      true
    );
  }, []);

  const coreHaloStyle = useAnimatedStyle(() => ({
    opacity: 0.2 + Math.sin(breathingTime.value * 2) * 0.04
  }));

  const proHaloStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + Math.cos(breathingTime.value * 1.5) * 0.03
  }));

  const scrollRef = useRef<any>(null);
  const params = useLocalSearchParams<{ personId?: string }>();
  const queryClient = useQueryClient();

  const { data: people = [] } = useQuery<Person[]>({
    queryKey: ['people'],
    queryFn: () => listPeople(db),
  });

  const { data: dbCategoryDefinitions = defaultPersonCategories } = useQuery<PersonCategoryDefinition[]>({
    queryKey: ['personCategories'],
    queryFn: () => listPersonCategories(db),
  });

  const { data: relatedItemsByPersonId = {} } = useQuery<Record<string, EntityRef[]>>({
    queryKey: ['personRelatedItems'],
    queryFn: async () => {
      const preferences = await getStoredPreferencesAsync();
      return listPersonRelatedEntityRefsByPersonId(db, { showSensitive: preferences.showSensitiveContent });
    },
  });

  const { data: relationshipEventsByPersonId = {} } = useQuery<Record<string, PersonRelationshipEvent[]>>({
    queryKey: ['personRelationshipEvents'],
    queryFn: () => listPersonRelationshipEventsByPersonId(db),
  });

  const [categoryDefinitions, setCategoryDefinitions] = useState<PersonCategoryDefinition[]>(defaultPersonCategories);

  useEffect(() => {
    setCategoryDefinitions(dbCategoryDefinitions);
  }, [dbCategoryDefinitions]);

  const [relationshipDraft, setRelationshipDraft] = useState<RelationshipEventDraft | null>(null);
  const [draft, setDraft] = useState<PersonDraft | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNetworkCategory, setSelectedNetworkCategory] = useState<PersonCategory | null>(null);
  const [selectedNetworkProximity, setSelectedNetworkProximity] = useState<PersonLinkStrength | null>(null);
  const [selectedNetworkContact, setSelectedNetworkContact] = useState<NetworkContactFilter | null>(null);
  const [selectedNetworkTag, setSelectedNetworkTag] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'reseau' | 'liste'>('reseau');
  const [networkLayoutMode, setNetworkLayoutMode] = useState<NetworkLayoutMode>('categories');
  const [categoryFeedback, setCategoryFeedback] = useState<string | null>(null);
  const [isPanned, setIsPanned] = useState(false);

  const boardScale = useSharedValue(1);
  const boardTranslateX = useSharedValue(0);
  const boardTranslateY = useSharedValue(0);

  const stagePanStart = useRef<{ x: number; y: number; bx: number; by: number } | null>(null);
  const stagePinchStart = useRef<{ dist: number; scale: number } | null>(null);

  const animatedBoardStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: boardTranslateX.value },
        { translateY: boardTranslateY.value },
        { scale: boardScale.value }
      ]
    };
  });
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(personCategoryPalette[4]);
  const [showCategoryPersonalization, setShowCategoryPersonalization] = useState(false);
  const [dragRenderTick, setDragRenderTick] = useState(0);
  const [manualNodePositions, setManualNodePositions] = useState<Record<string, ManualNodePosition>>({});
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [networkGestureLocked, setNetworkGestureLocked] = useState(false);
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const inertiaRef = useRef<InertiaSession | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const manualNodePositionsRef = useRef<Record<string, ManualNodePosition>>({});
  const layoutLoadedRef = useRef(false);

  const auraLeftStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + Math.sin(breathingTime.value * 1.8) * 0.03
  }));

  const auraRightStyle = useAnimatedStyle(() => ({
    opacity: 0.13 + Math.cos(breathingTime.value * 1.3) * 0.03
  }));

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['people'] });
      void queryClient.invalidateQueries({ queryKey: ['personCategories'] });
      void queryClient.invalidateQueries({ queryKey: ['personRelatedItems'] });
      void queryClient.invalidateQueries({ queryKey: ['personRelationshipEvents'] });

      let active = true;
      if (typeof params.personId === 'string') {
        void (async () => {
          const targetPerson = await getPerson(db, params.personId!);
          if (active) {
            setDraft(targetPerson ? toDraft(targetPerson) : null);
            router.replace('/cercle');
          }
        })();
      }

      return () => {
        active = false;
      };
    }, [db, params.personId, router, queryClient])
  );

  const displayPersonCategories = categoryDefinitions;

  const categoryLabelById = useMemo(
    () => new Map(displayPersonCategories.map((category) => [category.id, category.label])),
    [displayPersonCategories],
  );

  const getCategoryLabel = useCallback(
    (category: PersonCategory) => categoryLabelById.get(category) ?? getCategoryMeta(category, displayPersonCategories).label,
    [categoryLabelById, displayPersonCategories],
  );

  const categoryUsageCounts = useMemo(() => {
    const counts = Object.fromEntries(displayPersonCategories.map((category) => [category.id, 0]));
    people.forEach((person) => {
      [person.category, ...person.secondaryCategories].forEach((category) => {
        counts[category] = (counts[category] ?? 0) + 1;
      });
    });

    return counts;
  }, [displayPersonCategories, people]);

  const filteredPeople = useMemo(() => {
    let result = people;

    if (selectedInterest) {
      result = result.filter((person) =>
        person.interests.some((interest) => interest.toLowerCase() === selectedInterest.toLowerCase())
      );
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((person) => {
        const nameMatch = person.name.toLowerCase().includes(q);
        const tagMatch = person.tags.some((tag) => tag.toLowerCase().includes(q));
        const roleMatch = person.role.toLowerCase().includes(q);
        const orgMatch = person.organization.toLowerCase().includes(q);
        const interestMatch = person.interests.some((interest) => interest.toLowerCase().includes(q));
        return nameMatch || tagMatch || roleMatch || orgMatch || interestMatch;
      });
    }

    return result;
  }, [people, selectedInterest, searchQuery]);

  const groupedPeople = useMemo(
    () =>
      displayPersonCategories
        .map((category) => ({
          ...category,
          people: filteredPeople.filter((person) => person.category === category.id),
        }))
        .filter((category) => category.people.length > 0),
    [displayPersonCategories, filteredPeople],
  );

  const dashboardAlerts = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    
    const birthdays = filteredPeople.filter((person) => {
      if (!person.birthday) return false;
      const date = parseLocalDate(person.birthday);
      return date && date.getMonth() === currentMonth;
    }).sort((a, b) => {
      const dateA = parseLocalDate(a.birthday)!.getDate();
      const dateB = parseLocalDate(b.birthday)!.getDate();
      return dateA - dateB;
    });

    const toContact = filteredPeople.filter((person) => {
      const state = getContactSummary(person).state;
      return state === 'due' || state === 'overdue';
    });

    return { birthdays, toContact };
  }, [filteredPeople]);

  const networkFilterCategories = useMemo(
    () =>
      displayPersonCategories.filter((category) =>
        filteredPeople.some(
          (person) => person.category === category.id || person.secondaryCategories.includes(category.id),
        ),
      ),
    [displayPersonCategories, filteredPeople],
  );

  const networkPeople = useMemo(() => {
    let nextPeople = filteredPeople;

    if (networkLayoutMode === 'categories' && selectedNetworkCategory) {
      nextPeople = nextPeople.filter(
        (person) =>
          person.category === selectedNetworkCategory || person.secondaryCategories.includes(selectedNetworkCategory),
      );
    }

    if (networkLayoutMode === 'proximite' && selectedNetworkProximity) {
      nextPeople = nextPeople.filter((person) => getStrongestLinkStrength(person) === selectedNetworkProximity);
    }

    if (networkLayoutMode === 'contact' && selectedNetworkContact) {
      nextPeople = nextPeople.filter((person) => {
        if (selectedNetworkContact === 'due') {
          const contactState = getContactSummary(person).state;
          return contactState === 'overdue' || contactState === 'due' || contactState === 'soon' || contactState === 'missing';
        }

        return person.contactFrequency === selectedNetworkContact;
      });
    }

    if (networkLayoutMode === 'tags' && selectedNetworkTag) {
      nextPeople = nextPeople.filter((person) => person.tags.some((tag) => tag.toLowerCase() === selectedNetworkTag.toLowerCase()));
    }

    if (networkLayoutMode === 'contact') {
      return [...nextPeople].sort((left, right) => getContactUrgencyRank(left) - getContactUrgencyRank(right));
    }

    if (networkLayoutMode === 'proximite') {
      return [...nextPeople].sort((left, right) => (getStrongestLinkStrength(right) ?? 0) - (getStrongestLinkStrength(left) ?? 0));
    }

    return nextPeople;
  }, [filteredPeople, networkLayoutMode, selectedNetworkCategory, selectedNetworkContact, selectedNetworkProximity, selectedNetworkTag]);

  const interestFilters = useMemo(() => listUniqueInterests(people), [people]);
  const tagFilters = useMemo(() => listUniqueTags(people), [people]);

  // Compteurs affichés sur les chips du mode Contact.
  const contactFilterCounts = useMemo(() => {
    const counts: Record<string, number> = { due: 0 };
    contactFrequencyOptions.forEach((option) => {
      counts[option.id] = 0;
    });

    filteredPeople.forEach((person) => {
      counts[person.contactFrequency] = (counts[person.contactFrequency] ?? 0) + 1;
      const state = getContactSummary(person).state;
      if (state === 'overdue' || state === 'due' || state === 'soon' || state === 'missing') {
        counts.due += 1;
      }
    });

    return counts;
  }, [filteredPeople]);

  // Libellé sûr : une catégorie en cours de renommage (label vide) garde un nom lisible.
  const getDisplayCategoryLabel = useCallback(
    (category: PersonCategoryDefinition) =>
      category.label.trim() || getDefaultPersonCategory(category.id)?.label || 'Catégorie',
    [],
  );

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      selectedInterest ||
      selectedNetworkCategory ||
      selectedNetworkProximity ||
      selectedNetworkContact ||
      selectedNetworkTag,
  );

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedInterest(null);
    setSelectedNetworkCategory(null);
    setSelectedNetworkProximity(null);
    setSelectedNetworkContact(null);
    setSelectedNetworkTag(null);
    setSelectedPersonId(null);
  }, []);

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId],
  );

  useEffect(() => {
    if (selectedNetworkCategory && !networkFilterCategories.some((category) => category.id === selectedNetworkCategory)) {
      setSelectedNetworkCategory(null);
    }
  }, [networkFilterCategories, selectedNetworkCategory]);

  useEffect(() => {
    if (networkLayoutMode !== 'categories' && selectedNetworkCategory) {
      setSelectedNetworkCategory(null);
    }
    if (networkLayoutMode !== 'proximite' && selectedNetworkProximity) {
      setSelectedNetworkProximity(null);
    }
    if (networkLayoutMode !== 'contact' && selectedNetworkContact) {
      setSelectedNetworkContact(null);
    }
    if (networkLayoutMode !== 'tags' && selectedNetworkTag) {
      setSelectedNetworkTag(null);
    }
  }, [networkLayoutMode, selectedNetworkCategory, selectedNetworkContact, selectedNetworkProximity, selectedNetworkTag]);

  useEffect(() => {
    if (selectedNetworkTag && !tagFilters.some((tag) => tag.toLowerCase() === selectedNetworkTag.toLowerCase())) {
      setSelectedNetworkTag(null);
    }
  }, [selectedNetworkTag, tagFilters]);

  useEffect(() => {
    if (!selectedPersonId) {
      return;
    }

    if (!people.some((person) => person.id === selectedPersonId)) {
      setSelectedPersonId(null);
    }
  }, [people, selectedPersonId]);

  useEffect(() => {
    manualNodePositionsRef.current = manualNodePositions;
  }, [manualNodePositions]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const [storedLayout, storedCategoryLabels, storedCategories] = await Promise.all([
        getStoredCercleLayoutAsync(),
        getStoredCercleCategoryLabelsAsync(),
        listPersonCategories(db),
      ]);
      if (!active) {
        return;
      }

      let nextCategories = storedCategories;
      const migratedLabels = Object.entries(storedCategoryLabels).filter(([, label]) => label.trim().length > 0);
      if (migratedLabels.length) {
        for (const [categoryId, label] of migratedLabels) {
          const category = nextCategories.find((entry) => entry.id === categoryId);
          if (category) {
            await savePersonCategory(db, { id: category.id, label, color: category.color, position: category.position });
          }
        }
        await saveCercleCategoryLabelsAsync({});
        nextCategories = await listPersonCategories(db);
      }

      setManualNodePositions(storedLayout);
      setCategoryDefinitions(nextCategories);
      layoutLoadedRef.current = true;
    })();

    return () => {
      active = false;
    };
  }, [db]);

  useEffect(() => {
    const validIds = new Set(people.map((person) => person.id));

    setManualNodePositions((current) => {
      const nextEntries = Object.entries(current).filter(([personId]) => validIds.has(personId));
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [people]);

  useEffect(() => {
    if (!layoutLoadedRef.current) {
      return;
    }

    void saveCercleLayoutAsync(manualNodePositions);
  }, [manualNodePositions]);

  const runInertiaAnimation = useCallback(() => {
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current);
    }

    const animate = () => {
      const inertia = inertiaRef.current;
      if (!inertia || dragSessionRef.current) {
        inertiaFrameRef.current = null;
        return;
      }

      let nextX = inertia.x + inertia.velocityX;
      let nextY = inertia.y + inertia.velocityY;

      if (nextX <= 28 || nextX >= networkSize - 28) {
        inertia.velocityX *= -0.35;
      }

      if (nextY <= 28 || nextY >= networkSize - 28) {
        inertia.velocityY *= -0.35;
      }

      nextX = clamp(nextX, 28, networkSize - 28);
      nextY = clamp(nextY, 28, networkSize - 28);

      inertia.velocityX *= 0.92;
      inertia.velocityY *= 0.92;
      inertia.x = nextX;
      inertia.y = nextY;
      dragPreviewRef.current = { nodeId: inertia.nodeId, x: nextX, y: nextY };
      setDragRenderTick((current) => current + 1);

      if (Math.hypot(inertia.velocityX, inertia.velocityY) < 0.18) {
        setManualNodePositions({
          ...manualNodePositionsRef.current,
          [inertia.nodeId]: { x: nextX, y: nextY },
        });
        dragPreviewRef.current = null;
        inertiaRef.current = null;
        inertiaFrameRef.current = null;
        return;
      }

      inertiaFrameRef.current = requestAnimationFrame(animate);
    };

    inertiaFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => () => {
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current);
    }
  }, []);

  const [scaleFactor, setScaleFactor] = useState(1);

  const networkGraph = useMemo(
    () =>
      buildNetworkGraph(
        networkPeople,
        displayPersonCategories,
        selectedPersonId,
        networkLayoutMode,
        selectedNetworkTag,
        scaleFactor,
        manualNodePositions,
        dragPreviewRef.current,
        draggedNodeId,
      ),
    // dragRenderTick force le recalcul pendant un drag (dragPreviewRef est une ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayPersonCategories, networkPeople, selectedPersonId, networkLayoutMode, selectedNetworkTag, scaleFactor, manualNodePositions, draggedNodeId, dragRenderTick],
  );

  const selectedNetworkNode = useMemo(
    () => networkGraph.nodes.find((node) => node.person.id === selectedPersonId) ?? null,
    [networkGraph.nodes, selectedPersonId],
  );

  const networkFocusTransform = useMemo(() => {
    if (!selectedNetworkNode) {
      return [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }];
    }

    const translateX = clamp((networkCenter - selectedNetworkNode.x) * 0.22, -26, 26);
    const translateY = clamp((networkCenter - selectedNetworkNode.y) * 0.22, -24, 24);

    return [{ translateX }, { translateY }, { scale: 1.075 }];
  }, [selectedNetworkNode]);

  const networkStars = useMemo(() => createNetworkStars(0), []);

  const linkedPeople = useMemo(() => {
    if (!draft) {
      return [];
    }

    const peopleById = new Map(people.map((person) => [person.id, person]));

    return draft.links
      .map((link) => {
        const person = peopleById.get(link.personId);
        return person ? { person, strength: link.strength } : null;
      })
      .filter((entry): entry is { person: Person; strength: PersonLinkStrength } => Boolean(entry));
  }, [draft, people]);

  const linkAddCandidates = useMemo(() => {
    if (!draft) {
      return [];
    }

    const linkedIds = new Set(draft.links.map((link) => link.personId));
    return people.filter((person) => person.id !== draft.id && !linkedIds.has(person.id));
  }, [draft, people]);

  useEffect(() => {
    setShowLinkPicker(false);
  }, [draft?.id]);

  const refreshCategories = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['personCategories'] });
  }, [queryClient]);

  const handleCategoryLabelChange = (categoryId: PersonCategory, label: string) => {
    setCategoryDefinitions((current) =>
      current.map((category) => (category.id === categoryId ? { ...category, label } : category)),
    );
  };

  const persistCategory = async (categoryId: PersonCategory) => {
    const category = categoryDefinitions.find((entry) => entry.id === categoryId);
    if (!category) {
      return;
    }

    const saved = await savePersonCategory(db, {
      id: category.id,
      label: category.label,
      color: category.color,
      position: category.position,
    });
    if (saved) {
      await refreshCategories();
      setCategoryFeedback('Catégorie mise à jour.');
    }
  };

  const handleCategoryColorChange = async (category: PersonCategoryDefinition, color: string) => {
    setCategoryDefinitions((current) =>
      current.map((entry) => (entry.id === category.id ? { ...entry, color } : entry)),
    );
    const saved = await savePersonCategory(db, {
      id: category.id,
      label: category.label,
      color,
      position: category.position,
    });
    if (saved) {
      await refreshCategories();
      setCategoryFeedback('Couleur appliquée.');
    }
  };

  const handleResetCategory = async (category: PersonCategoryDefinition) => {
    const defaultCategory = getDefaultPersonCategory(category.id);
    if (!defaultCategory) {
      return;
    }

    const saved = await savePersonCategory(db, {
      id: category.id,
      label: defaultCategory.label,
      color: defaultCategory.color,
      position: defaultCategory.position,
    });
    if (saved) {
      await refreshCategories();
      setCategoryFeedback('Catégorie remise par défaut.');
    }
  };

  const handleCreateCategory = async () => {
    const saved = await savePersonCategory(db, {
      label: newCategoryLabel,
      color: newCategoryColor,
      position: displayPersonCategories.length,
    });

    if (!saved) {
      setCategoryFeedback('Nom de catégorie requis.');
      return;
    }

    await refreshCategories();
    setNewCategoryLabel('');
    setNewCategoryColor(personCategoryPalette[(personCategoryPalette.indexOf(newCategoryColor) + 1) % personCategoryPalette.length]);
    setCategoryFeedback('Catégorie créée.');
  };

  const handleDeleteCategory = async (category: PersonCategoryDefinition) => {
    const deleted = await deletePersonCategory(db, category.id);
    if (!deleted) {
      setCategoryFeedback('Impossible de supprimer une catégorie utilisée.');
      return;
    }

    await refreshCategories();
    setSelectedNetworkCategory((current) => (current === category.id ? null : current));
    setCategoryFeedback('Catégorie supprimée.');
  };

  const renderPalette = (selectedColor: string, onSelect: (color: string) => void) => (
    <View style={styles.paletteGrid}>
      {personCategoryPalette.map((color) => {
        const selected = selectedColor.toLowerCase() === color.toLowerCase();
        return (
          <Pressable
            accessibilityLabel={`Couleur ${color}`}
            accessibilityRole="button"
            key={color}
            onPress={() => onSelect(color)}
            style={[styles.colorSwatch, { backgroundColor: color }, selected && styles.colorSwatchSelected]}
          />
        );
      })}
    </View>
  );

  const saveExistingPerson = async (person: Person, updates: Partial<Person>) => {
    const nextPerson = {
      ...person,
      ...updates,
      profile: {
        ...person.profile,
        ...(updates.profile ?? {}),
      },
    };

    const saved = await savePerson(db, {
      id: nextPerson.id,
      name: nextPerson.name,
      category: nextPerson.category,
      secondaryCategories: nextPerson.secondaryCategories,
      photoUri: nextPerson.photoUri,
      favorite: nextPerson.favorite,
      note: nextPerson.note,
      birthday: nextPerson.birthday,
      phone: nextPerson.phone,
      address: nextPerson.address,
      lastContactedAt: nextPerson.lastContactedAt,
      contactFrequency: nextPerson.contactFrequency,
      relationshipStatus: nextPerson.relationshipStatus,
      interests: nextPerson.interests,
      tags: nextPerson.tags,
      role: nextPerson.role,
      organization: nextPerson.organization,
      links: nextPerson.links,
      profile: nextPerson.profile,
    });

    if (saved) {
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }

    return saved;
  };

  const handlePickPortrait = async () => {
    if (!draft) {
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: 'image/*' });
      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      const portraitId = createId('portrait');
      const originalName = sanitizeFileName(asset.name || 'portrait.jpg');

      try {
        const portraitsDirectory = new Directory(Paths.document, 'portraits');
        portraitsDirectory.create({ idempotent: true, intermediates: true });

        const sourceFile = new File(asset.uri);
        const targetFile = new File(portraitsDirectory, `${portraitId}-${originalName}`);
        await sourceFile.copy(targetFile, { overwrite: true });

        setDraft((current) => (current ? { ...current, photoUri: targetFile.uri } : current));
        setDraftFeedback('Portrait ajouté.');
      } catch (fsError) {
        // En cas d'erreur filesystem (ex : sur la version Web où Paths.document n'existe pas),
        // on utilise directement l'URI de l'image sélectionnée (Blob ou data URL) fonctionnelle sur le Web.
        setDraft((current) => (current ? { ...current, photoUri: asset.uri } : current));
        setDraftFeedback('Portrait chargé (mode compatibilité web).');
      }
    } catch {
      setDraftFeedback('Impossible d\'ajouter ce portrait.');
    }
  };

  const openExternalUrl = (url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  };

  const handleMarkContactToday = async (person: Person) => {
    await saveExistingPerson(person, { lastContactedAt: localDay() });
    await logActivity(db, {
      entityKind: 'person',
      entityId: person.id,
      action: 'contact',
      label: `Contact marqué aujourd'hui pour ${person.name}`,
    });
  };

  const handleCreateLinkedNote = async (person: Person) => {
    const note = await saveNote(db, {
      title: `Note - ${person.name}`,
      body: '',
      tags: ['cercle', ...person.tags],
    });

    if (!note) {
      return;
    }

    await replaceEntityPersonLinks(db, {
      entityKind: 'note',
      entityId: note.id,
      personIds: [person.id],
    });
    await refreshPersonRelations();
    router.push({ pathname: '/notes', params: { noteId: note.id } } as never);
  };

  const handleCreateLinkedReminder = async (person: Person) => {
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + 1);
    scheduledFor.setHours(9, 0, 0, 0);

    const reminder = await saveReminder(db, {
      title: `Recontacter ${person.name}`,
      scheduledFor: scheduledFor.toISOString(),
      notificationId: null,
      category: getReminderCategoryForPerson(person.category),
    });

    await replaceEntityPersonLinks(db, {
      entityKind: 'reminder',
      entityId: reminder.id,
      personIds: [person.id],
    });
    await refreshPersonRelations();
    router.push({ pathname: '/rappels', params: { reminderId: reminder.id } } as never);
  };

  const unlockNetworkScrollIfIdle = useCallback(() => {
    if (dragSessionRef.current) {
      return;
    }

    setNetworkGestureLocked(false);
  }, []);

  const handleNetworkStageTouchStart = useCallback((event: GestureResponderEvent) => {
    setNetworkGestureLocked(true);
    const touches = event.nativeEvent.touches;
    if (touches.length === 2) {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      stagePinchStart.current = {
        dist: Math.hypot(dx, dy),
        scale: scaleFactor,
      };
      stagePanStart.current = null;
    } else if (touches.length === 1) {
      stagePanStart.current = {
        x: touches[0].pageX,
        y: touches[0].pageY,
        bx: boardTranslateX.value,
        by: boardTranslateY.value,
      };
      stagePinchStart.current = null;
    }
  }, [scaleFactor, boardTranslateX, boardTranslateY]);

  const handleNetworkStageTouchMove = useCallback((event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length === 2) {
      stagePanStart.current = null;
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      const dist = Math.hypot(dx, dy);
      if (!stagePinchStart.current) {
        stagePinchStart.current = {
          dist,
          scale: scaleFactor,
        };
      } else if (stagePinchStart.current.dist > 10) {
        const nextScale = Math.max(0.5, Math.min(2.5, stagePinchStart.current.scale * (dist / stagePinchStart.current.dist)));
        setScaleFactor(nextScale);
      }
    } else if (touches.length === 1) {
      stagePinchStart.current = null;
      if (!stagePanStart.current) {
        stagePanStart.current = {
          x: touches[0].pageX,
          y: touches[0].pageY,
          bx: boardTranslateX.value,
          by: boardTranslateY.value,
        };
      } else {
        const dx = touches[0].pageX - stagePanStart.current.x;
        const dy = touches[0].pageY - stagePanStart.current.y;
        boardTranslateX.value = stagePanStart.current.bx + dx;
        boardTranslateY.value = stagePanStart.current.by + dy;
      }
    }
  }, [scaleFactor, boardTranslateX, boardTranslateY]);

  const handleNetworkStageTouchEnd = useCallback(() => {
    stagePanStart.current = null;
    stagePinchStart.current = null;

    setDragRenderTick((t) => t + 1);

    const currentlyPanned = boardTranslateX.value !== 0 || boardTranslateY.value !== 0;
    if (currentlyPanned !== isPanned) {
      setIsPanned(currentlyPanned);
    }

    if (inertiaRef.current) {
      setNetworkGestureLocked(false);
      return;
    }

    unlockNetworkScrollIfIdle();
  }, [unlockNetworkScrollIfIdle, isPanned, boardTranslateX, boardTranslateY]);

  useEffect(() => {
    if (draft || viewMode !== 'reseau') {
      setNetworkGestureLocked(false);
    }
  }, [draft, viewMode]);

  const handleResetManualLayout = () => {
    setManualNodePositions({});
    setScaleFactor(1);
    setIsPanned(false);
    boardScale.value = withSpring(1);
    boardTranslateX.value = withSpring(0);
    boardTranslateY.value = withSpring(0);
    selectionHaptic();
  };

  const handleNodeResponderGrant = (node: NetworkNode, event: GestureResponderEvent) => {
    inertiaRef.current = null;
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
    dragSessionRef.current = {
      nodeId: node.person.id,
      pointerStartX: event.nativeEvent.pageX,
      pointerStartY: event.nativeEvent.pageY,
      nodeStartX: node.x,
      nodeStartY: node.y,
      lastPointerX: event.nativeEvent.pageX,
      lastPointerY: event.nativeEvent.pageY,
      lastTimestamp: Date.now(),
      velocityX: 0,
      velocityY: 0,
      moved: false,
    };
    dragPreviewRef.current = {
      nodeId: node.person.id,
      x: node.x,
      y: node.y,
    };
    setNetworkGestureLocked(true);
    setDraggedNodeId(node.person.id);
  };

  const handleNodeResponderMove = (event: GestureResponderEvent) => {
    const session = dragSessionRef.current;
    if (!session) {
      return;
    }

    const dx = event.nativeEvent.pageX - session.pointerStartX;
    const dy = event.nativeEvent.pageY - session.pointerStartY;
    const now = Date.now();
    const dt = Math.max(16, now - session.lastTimestamp);
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      session.moved = true;
    }

    session.velocityX = ((event.nativeEvent.pageX - session.lastPointerX) / dt) * 16;
    session.velocityY = ((event.nativeEvent.pageY - session.lastPointerY) / dt) * 16;
    session.lastPointerX = event.nativeEvent.pageX;
    session.lastPointerY = event.nativeEvent.pageY;
    session.lastTimestamp = now;

    dragPreviewRef.current = {
      nodeId: session.nodeId,
      x: clamp(session.nodeStartX + dx, 28, networkSize - 28),
      y: clamp(session.nodeStartY + dy, 28, networkSize - 28),
    };
    setDragRenderTick((current) => current + 1);
  };

  const handleNodeResponderRelease = () => {
    const session = dragSessionRef.current;
    if (!session) {
      unlockNetworkScrollIfIdle();
      return;
    }

    if (!session.moved) {
      setSelectedPersonId((current) => (current === session.nodeId ? null : session.nodeId));
      selectionHaptic();
    } else if (dragPreviewRef.current?.nodeId === session.nodeId) {
      const preview = dragPreviewRef.current;
      if (Math.hypot(session.velocityX, session.velocityY) > 0.6) {
        inertiaRef.current = {
          nodeId: session.nodeId,
          x: preview.x,
          y: preview.y,
          velocityX: session.velocityX,
          velocityY: session.velocityY,
        };
        runInertiaAnimation();
      } else {
        setManualNodePositions({
          ...manualNodePositionsRef.current,
          [session.nodeId]: { x: preview.x, y: preview.y },
        });
        dragPreviewRef.current = null;
      }
    }

    dragSessionRef.current = null;
    setNetworkGestureLocked(false);
    setDraggedNodeId(null);
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }

    if (!draft.name.trim()) {
      Alert.alert('Erreur', 'Le nom de la personne est obligatoire.');
      return;
    }

    try {
      const saved = await savePerson(db, {
        id: draft.id || undefined,
        name: draft.name,
        category: draft.category,
        secondaryCategories: draft.secondaryCategories,
        photoUri: draft.photoUri,
        favorite: draft.favorite,
        note: draft.note,
        birthday: draft.birthday,
        phone: draft.phone,
        address: draft.address,
        lastContactedAt: draft.lastContactedAt,
        contactFrequency: draft.contactFrequency,
        relationshipStatus: draft.relationshipStatus,
        interests: (draft.interests || '').split(',').map((entry) => entry.trim()).filter(Boolean),
        tags: (draft.tags || '').split(',').map((entry) => entry.trim()).filter(Boolean),
        role: draft.role,
        organization: draft.organization,
        links: draft.links,
        profile: draft.profile,
      });

      if (!saved) {
        Alert.alert('Erreur', 'Impossible de sauvegarder la fiche.');
        return;
      }

      setDraft(null);
      setDraftFeedback(null);
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void listPeople(db).then((nextPeople) => syncAllBirthdayRemindersAsync(db, nextPeople)).catch(() => undefined);
    } catch (saveError: any) {
      console.error("Error saving person:", saveError);
      Alert.alert('Erreur de sauvegarde', saveError?.message || 'Une erreur est survenue lors de l\'enregistrement.');
    }
  };

  const handleDelete = async () => {
    if (!draft?.id) {
      return;
    }

    await deletePerson(db, draft.id);
    setDraft(null);
    setDraftFeedback(null);
    await queryClient.invalidateQueries({ queryKey: ['people'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void listPeople(db).then((nextPeople) => syncAllBirthdayRemindersAsync(db, nextPeople)).catch(() => undefined);
  };

  const refreshPersonRelations = async () => {
    await queryClient.invalidateQueries({ queryKey: ['personRelatedItems'] });
    await queryClient.invalidateQueries({ queryKey: ['personRelationshipEvents'] });
  };

  const startRelationshipEvent = (personId: string) => {
    setRelationshipDraft({
      sourcePersonId: personId,
      otherPersonIds: [],
      kind: 'animosite',
      date: localDay(),
      note: '',
    });
  };

  const markAsContactedToday = async (person: Person) => {
    await handleMarkContactToday(person);
  };

  const saveRelationshipEvent = async (person: Person) => {
    if (!relationshipDraft || relationshipDraft.sourcePersonId !== person.id) {
      return;
    }

    const otherPersonId = relationshipDraft.otherPersonIds[0];
    const otherPerson = people.find((candidate) => candidate.id === otherPersonId) ?? null;
    if (!otherPerson) {
      return;
    }

    const relationMeta = getRelationshipEventMeta(relationshipDraft.kind);
    const saved = await saveTimelineEntry(db, {
      date: relationshipDraft.date,
      title: `${relationMeta.label} · ${person.name} / ${otherPerson.name}`,
      note: relationshipDraft.note,
    });

    if (!saved) {
      return;
    }

    await replaceEntityPersonLinks(db, {
      entityKind: 'timeline',
      entityId: saved.id,
      personIds: [person.id, otherPerson.id],
    });
    await addEntityTag(db, {
      entityKind: 'timeline',
      entityId: saved.id,
      tag: `relation-${relationshipDraft.kind}`,
    });

    setRelationshipDraft(null);
    await refreshPersonRelations();
  };

  const openRelatedEntity = (entity: EntityRef) => {
    const routeByKind: Partial<Record<EntityKind, { pathname: string; paramName?: string }>> = {
      note: { pathname: '/notes', paramName: 'noteId' },
      project: { pathname: '/pro', paramName: 'projectId' },
      book: { pathname: '/livres', paramName: 'bookId' },
      idea: { pathname: '/idees', paramName: 'ideaId' },
      dose: { pathname: '/conso', paramName: 'doseId' },
      substance: { pathname: '/pharmaco', paramName: 'substanceId' },
      game: { pathname: '/jeux', paramName: 'gameId' },
      country: { pathname: '/pays', paramName: 'countryId' },
      concert: { pathname: '/concerts', paramName: 'concertId' },
      journal: { pathname: '/journal', paramName: 'date' },
      timeline: { pathname: '/frise' },
      objective: { pathname: '/objectifs', paramName: 'objectiveId' },
      treatment: { pathname: '/traitement' },
    };
    const route = routeByKind[entity.kind] ?? { pathname: '/liens' };

    if (route.paramName) {
      router.push({ pathname: route.pathname, params: { [route.paramName]: entity.id } } as never);
      return;
    }

    router.push(route.pathname as never);
  };

  const renderAvatar = (person: Person, size = 40) => (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: getCategoryMeta(person.category, displayPersonCategories).color,
          borderRadius: size / 2,
          height: size,
          width: size,
        },
      ]}
    >
      {person.photoUri ? <Image cachePolicy="memory-disk" contentFit="cover" source={{ uri: person.photoUri }} style={styles.avatarPhoto} /> : <Text style={styles.avatarLabel}>{getInitials(person.name)}</Text>}
      {person.favorite ? (
        <View style={styles.favoriteBadge}>
          <Text style={styles.favoriteBadgeLabel}>*</Text>
        </View>
      ) : null}
    </View>
  );

  const renderPersonDetails = (person: Person) => {
    const relatedItems = relatedItemsByPersonId[person.id] ?? [];
    const relationshipEvents = relationshipEventsByPersonId[person.id] ?? [];
    const activeRelationshipDraft = relationshipDraft?.sourcePersonId === person.id ? relationshipDraft : null;
    const contactSummary = getContactSummary(person);
    const relationshipStatus = getRelationshipStatusMeta(person.relationshipStatus);
    const profileEntries = [
      { label: 'Surnom', value: person.profile.nickname },
      { label: 'Pronoms', value: person.profile.pronouns },
      { label: 'Complicité', value: person.profile.affinityScore ? `${person.profile.affinityScore}/5` : '' },
      { label: 'Rencontre / Histoire', value: person.profile.ourStory },
      { label: 'Activités partagées', value: person.profile.preferredActivities },
      { label: 'Valeurs & Passions', value: person.profile.sharedValues },
      { label: 'Sujets récurrents', value: person.profile.frequentTopics },
      { label: 'Soutien mutuel', value: person.profile.mutualSupport },
      { label: 'Souvenirs', value: person.profile.memories },
      { label: 'Lieux', value: person.profile.places },
      { label: 'Idées cadeaux', value: person.profile.giftIdeas },
      { label: 'À éviter', value: person.profile.avoidTopics },
      { label: 'Préférences', value: person.profile.preferences },
    ].filter((entry) => typeof entry.value === 'string' && entry.value.trim().length > 0);

    return (
      <View style={styles.networkSelectionCard}>
        <View style={styles.networkSelectionHeader}>
          {renderAvatar(person, 56)}
          <View style={styles.networkSelectionBody}>
            <Text style={styles.personName}>{person.name}</Text>
            {(person.role || person.organization) ? (
              <Text style={styles.personRoleDetail}>
                {person.role}{person.role && person.organization ? ' @ ' : ''}{person.organization}
              </Text>
            ) : null}
            <Text style={styles.personMeta}>
              {getCategoryLabel(person.category)} · {person.links.length} lien{person.links.length > 1 ? 's' : ''}{person.profile.affinityScore ? ` · Complicité : ${person.profile.affinityScore}/5` : ''}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusChip, { backgroundColor: relationshipStatus.color }]}>
                <Text style={styles.statusChipLabel}>{relationshipStatus.label}</Text>
              </View>
              <View style={[styles.contactChip, contactSummary.state === 'overdue' || contactSummary.state === 'due' ? styles.contactChipUrgent : null]}>
                <Text style={styles.contactChipLabel}>{contactSummary.label}</Text>
              </View>
            </View>
            {person.birthday ? <Text style={styles.personDetail}>🎂 {formatBirthday(person.birthday)}</Text> : null}
            {person.phone ? (
              <View style={styles.quickActionsRow}>
                <Pressable onPress={() => Linking.openURL(`tel:${person.phone}`)} style={styles.quickActionButton}>
                  <Text style={styles.quickActionLabel}>📞 Appeler</Text>
                </Pressable>
                <Pressable onPress={() => Linking.openURL(`sms:${person.phone}`)} style={styles.quickActionButton}>
                  <Text style={styles.quickActionLabel}>💬 SMS</Text>
                </Pressable>
                <Pressable onPress={() => Linking.openURL(`whatsapp://send?phone=${person.phone.replace(/[^0-9+]/g, '')}`).catch(() => Alert.alert('WhatsApp', "WhatsApp n'est pas installé sur cet appareil"))} style={styles.quickActionButton}>
                  <Text style={styles.quickActionLabel}>🟢 WhatsApp</Text>
                </Pressable>
              </View>
            ) : null}
            {person.address ? <Text style={styles.personDetail}>📍 {person.address}</Text> : null}
            {person.lastContactedAt ? (
              <View style={styles.lastContactRow}>
                <Text style={styles.personDetail}>Dernier contact : {formatLongDate(person.lastContactedAt)}</Text>
                <Pressable onPress={() => markAsContactedToday(person)} style={styles.contactedTodayButton}>
                  <Text style={styles.contactedTodayLabel}>Aujourd'hui</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => markAsContactedToday(person)} style={styles.contactedTodayButton}>
                <Text style={styles.contactedTodayLabel}>Marquer contacté aujourd'hui</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.quickActionGrid}>
          {person.phone ? (
            <Pressable onPress={() => openExternalUrl(`tel:${person.phone.replace(/\s+/g, '')}`)} style={({ pressed }) => [styles.quickActionChip, pressed && styles.pressSoft]}>
              <Text style={styles.quickActionChipLabel}>Appeler</Text>
            </Pressable>
          ) : null}
          {person.phone ? (
            <Pressable onPress={() => openExternalUrl(`sms:${person.phone.replace(/\s+/g, '')}`)} style={({ pressed }) => [styles.quickActionChip, pressed && styles.pressSoft]}>
              <Text style={styles.quickActionChipLabel}>SMS</Text>
            </Pressable>
          ) : null}
          {person.address ? (
            <Pressable onPress={() => openExternalUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(person.address)}`)} style={({ pressed }) => [styles.quickActionChip, pressed && styles.pressSoft]}>
              <Text style={styles.quickActionChipLabel}>Adresse</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => handleMarkContactToday(person)} style={({ pressed }) => [styles.quickActionChip, pressed && styles.pressSoft]}>
            <Text style={styles.quickActionChipLabel}>Contact aujourd'hui</Text>
          </Pressable>
          <Pressable onPress={() => handleCreateLinkedNote(person)} style={({ pressed }) => [styles.quickActionChip, pressed && styles.pressSoft]}>
            <Text style={styles.quickActionChipLabel}>Note liée</Text>
          </Pressable>
          <Pressable onPress={() => handleCreateLinkedReminder(person)} style={({ pressed }) => [styles.quickActionChip, pressed && styles.pressSoft]}>
            <Text style={styles.quickActionChipLabel}>Rappel</Text>
          </Pressable>
        </View>

        {person.secondaryCategories.length ? (
          <View style={styles.chipWrap}>
            {person.secondaryCategories.map((category) => (
              <View key={`selected-secondary-${category}`} style={styles.secondaryCategoryTag}>
                <Text style={styles.secondaryCategoryTagLabel}>{getCategoryLabel(category)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {person.interests.length ? (
          <View style={styles.chipWrap}>
            {person.interests.map((interest) => (
              <View key={interest} style={styles.selectionTag}>
                <Text style={styles.selectionTagLabel}>{interest}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {person.tags.length ? (
          <View style={styles.chipWrap}>
            {person.tags.map((tag) => (
              <View key={`tag-${tag}`} style={styles.relationTag}>
                <Text style={styles.relationTagLabel}>#{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {profileEntries.length ? (
          <View style={styles.profileGrid}>
            {profileEntries.map((entry) => (
              <View key={entry.label} style={styles.profileItem}>
                <Text style={styles.profileItemLabel}>{entry.label}</Text>
                <Text style={styles.profileItemValue}>{entry.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {person.note ? <Text style={styles.helperText}>{person.note}</Text> : null}

        <View style={styles.relatedSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.fieldLabel}>Relations directes</Text>
            <Pressable onPress={() => startRelationshipEvent(person.id)} style={({ pressed }) => [styles.inlineActionChip, pressed && styles.pressSoft]}>
              <Text style={styles.inlineActionChipLabel}>+ Événement</Text>
            </Pressable>
          </View>

          {relationshipEvents.length ? (
            <View style={styles.relatedList}>
              {relationshipEvents.slice(0, 8).map((event) => {
                const eventMeta = getRelationshipEventMeta(event.relationKind);
                return (
                  <Pressable
                    key={`${event.id}-${event.otherPersonId}`}
                    onPress={() => openRelatedEntity({ kind: 'timeline', id: event.id, label: event.title, detail: event.date, sensitive: false })}
                    style={({ pressed }) => [styles.relationshipItem, pressed && styles.pressSoft]}
                  >
                    <View style={[styles.relationshipKindDot, { backgroundColor: eventMeta.color }]} />
                    <View style={styles.relatedBody}>
                      <Text style={styles.relatedTitle}>{eventMeta.label} avec {event.otherPersonName}</Text>
                      <Text style={styles.relatedDetail}>{event.date}</Text>
                      {event.note ? <Text style={styles.relationshipNote}>{event.note}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.helperText}>Aucun événement relationnel direct pour le moment.</Text>
          )}

          {activeRelationshipDraft ? (
            <View style={styles.relationshipComposer}>
              <PeoplePicker
                entityKind="timeline"
                entityId={null}
                label="Personne concernée"
                onChange={(personIds) =>
                  setRelationshipDraft((current) =>
                    current?.sourcePersonId === person.id
                      ? { ...current, otherPersonIds: personIds.slice(-1) }
                      : current,
                  )
                }
                people={people.filter((candidate) => candidate.id !== person.id)}
                selectedIds={activeRelationshipDraft.otherPersonIds}
              />
              <Text style={styles.fieldLabel}>Nature</Text>
              <View style={styles.chipWrap}>
                {relationshipEventTypes.map((eventType) => {
                  const selected = activeRelationshipDraft.kind === eventType.id;
                  return (
                    <Pressable
                      key={eventType.id}
                      onPress={() =>
                        setRelationshipDraft((current) =>
                          current?.sourcePersonId === person.id ? { ...current, kind: eventType.id } : current,
                        )
                      }
                      style={({ pressed }) => [styles.relationshipTypeChip, selected && { backgroundColor: eventType.color, borderColor: eventType.color }, pressed && styles.pressSoft]}
                    >
                      <Text style={[styles.relationshipTypeChipLabel, selected && styles.relationshipTypeChipLabelSelected]}>{eventType.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <DateField
                label="Date"
                onChange={(date) =>
                  setRelationshipDraft((current) =>
                    current?.sourcePersonId === person.id ? { ...current, date } : current,
                  )
                }
                value={activeRelationshipDraft.date}
              />
              <TextInput
                multiline
                onChangeText={(note) =>
                  setRelationshipDraft((current) =>
                    current?.sourcePersonId === person.id ? { ...current, note } : current,
                  )
                }
                placeholder="Ce qui s'est passé..."
                placeholderTextColor={colors.muted}
                style={styles.relationshipTextarea}
                textAlignVertical="top"
                value={activeRelationshipDraft.note}
              />
              <View style={styles.buttonRow}>
                <Pressable onPress={() => saveRelationshipEvent(person)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressScale]}>
                  <Text style={styles.primaryButtonLabel}>Créer</Text>
                </Pressable>
                <Pressable onPress={() => setRelationshipDraft(null)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressSoft]}>
                  <Text style={styles.secondaryButtonLabel}>Annuler</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.relatedSection}>
          <Text style={styles.fieldLabel}>Choses en commun</Text>
          {relatedItems.length ? (
            <View style={styles.relatedList}>
              {relatedItems.slice(0, 16).map((entity) => (
                <Pressable key={`${entity.kind}-${entity.id}`} onPress={() => openRelatedEntity(entity)} style={({ pressed }) => [styles.relatedItem, pressed && styles.pressSoft]}>
                  <Text style={styles.relatedKind}>{entityKindLabels[entity.kind]}</Text>
                  <View style={styles.relatedBody}>
                    <Text style={styles.relatedTitle}>{entity.label}</Text>
                    {entity.detail ? <Text style={styles.relatedDetail}>{entity.detail}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.helperText}>Associez cette personne dans Jeux, Concerts, Conso, Pays, Frise ou les autres modules pour remplir cette liste.</Text>
          )}
        </View>

        <View style={styles.buttonRow}>
          <Pressable onPress={() => { setDraftFeedback(null); setDraft(toDraft(person)); }} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressScale]}>
            <Text style={styles.primaryButtonLabel}>Modifier la fiche</Text>
          </Pressable>
          <Pressable onPress={() => setSelectedPersonId(null)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressSoft]}>
            <Text style={styles.secondaryButtonLabel}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  if (draft) {
    return (
      <AppShell kicker="Carnet" title={draft.id ? 'Modifier un contact' : 'Nouvelle personne'}>
        <Pressable onPress={() => setDraft(null)} style={({ pressed }) => [styles.backButton, pressed && styles.pressSoft]}>
          <Text style={styles.backLabel}>Retour au cercle</Text>
        </Pressable>

        <View style={styles.editorCard}>
          <View style={styles.portraitEditorRow}>
            <View style={[styles.avatar, styles.portraitPreview, { backgroundColor: getCategoryMeta(draft.category, displayPersonCategories).color }]}> 
              {draft.photoUri ? <Image cachePolicy="memory-disk" contentFit="cover" source={{ uri: draft.photoUri }} style={styles.avatarPhoto} /> : <Text style={styles.avatarLabel}>{getInitials(draft.name)}</Text>}
            </View>
            <View style={styles.portraitEditorBody}>
              <Text style={styles.fieldLabel}>Portrait</Text>
              {draftFeedback ? <Text style={styles.helperText}>{draftFeedback}</Text> : <Text style={styles.helperText}>Image locale affichée sur la fiche et le réseau.</Text>}
              <View style={styles.buttonRowWrap}>
                <Pressable onPress={handlePickPortrait} style={({ pressed }) => [styles.secondaryButtonCompact, pressed && styles.pressSoft]}>
                  <Text style={styles.secondaryButtonLabel}>Choisir une image</Text>
                </Pressable>
                {draft.photoUri ? (
                  <Pressable onPress={() => setDraft((current) => (current ? { ...current, photoUri: '' } : current))} style={({ pressed }) => [styles.secondaryButtonCompact, pressed && styles.pressSoft]}>
                    <Text style={styles.secondaryButtonLabel}>Retirer</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, name: value } : current))}
            placeholder="Nom"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.name}
          />

          <Pressable
            onPress={() => setDraft((current) => (current ? { ...current, favorite: !current.favorite } : current))}
            style={({ pressed }) => [styles.favoriteToggle, draft.favorite && styles.favoriteToggleActive, pressed && styles.pressSoft]}
          >
            <Text style={[styles.favoriteToggleLabel, draft.favorite && styles.favoriteToggleLabelActive]}>{draft.favorite ? 'Personne favorite' : 'Personne au top !'}</Text>
          </Pressable>

          <Text style={styles.fieldLabel}>Catégorie principale</Text>
          <View style={styles.chipWrap}>
            {displayPersonCategories.map((category) => {
              const isSelected = draft.category === category.id;
              return (
                <Pressable
                  key={category.id}
                  onPress={() =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            category: category.id,
                            secondaryCategories: current.secondaryCategories.filter(
                              (secondaryCategory) => secondaryCategory !== category.id,
                            ),
                          }
                        : current,
                    )
                  }
                  style={({ pressed }) => [
                    styles.categoryChip,
                    isSelected && { backgroundColor: category.color, borderColor: category.color },
                    pressed && styles.pressSoft,
                  ]}
                >
                  <Text style={[styles.categoryChipLabel, isSelected && styles.categoryChipLabelSelected]}>{category.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {draft.category === 'pro' && (
            <TextInput
              onChangeText={(value) => setDraft((current) => (current ? { ...current, organization: value } : current))}
              placeholder="Structure / Association / Entreprise"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={draft.organization}
            />
          )}

          {personCategoryRoles[draft.category] && (
            <>
              <Text style={styles.fieldLabel}>Rôle / Relation spécifique</Text>
              <View style={styles.chipWrap}>
                {personCategoryRoles[draft.category].map((role) => {
                  const isSelected = draft.role === role;
                  return (
                    <Pressable
                      key={role}
                      onPress={() => setDraft((current) => (current ? { ...current, role } : current))}
                      style={({ pressed }) => [styles.linkChip, isSelected && styles.linkChipSelected, pressed && styles.pressSoft]}
                    >
                      <Text style={[styles.linkChipLabel, isSelected && styles.linkChipLabelSelected]}>{role}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, role: value } : current))}
            placeholder={personCategoryRoles[draft.category] ? "Autre rôle..." : "Rôle / Relation"}
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={personCategoryRoles[draft.category]?.includes(draft.role) ? '' : draft.role}
          />

          <Text style={styles.fieldLabel}>Catégories secondaires</Text>
          <View style={styles.chipWrap}>
            {displayPersonCategories
              .filter((category) => category.id !== draft.category)
              .map((category) => {
                const isSelected = draft.secondaryCategories.includes(category.id);
                return (
                  <Pressable
                    key={`secondary-${category.id}`}
                    onPress={() =>
                      setDraft((current) => {
                        if (!current) {
                          return current;
                        }

                        return {
                          ...current,
                          secondaryCategories: isSelected
                            ? current.secondaryCategories.filter((secondaryCategory) => secondaryCategory !== category.id)
                            : [...current.secondaryCategories, category.id],
                        };
                      })
                    }
                    style={({ pressed }) => [
                      styles.linkChip,
                      isSelected && { backgroundColor: category.color, borderColor: category.color },
                      pressed && styles.pressSoft,
                    ]}
                  >
                    <Text style={[styles.linkChipLabel, isSelected && styles.linkChipLabelSelected]}>{category.label}</Text>
                  </Pressable>
                );
              })}
          </View>

          <Text style={styles.fieldLabel}>État de la relation</Text>
          <View style={styles.chipWrap}>
            {relationshipStatusOptions.map((status) => {
              const isSelected = draft.relationshipStatus === status.id;
              return (
                <Pressable
                  key={status.id}
                  onPress={() => setDraft((current) => (current ? { ...current, relationshipStatus: status.id } : current))}
                  style={({ pressed }) => [styles.relationshipTypeChip, isSelected && { backgroundColor: status.color, borderColor: status.color }, pressed && styles.pressSoft]}
                >
                  <Text style={[styles.relationshipTypeChipLabel, isSelected && styles.relationshipTypeChipLabelSelected]}>{status.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <DateField
            allowClear
            label="Anniversaire"
            onChange={(value) => setDraft((current) => (current ? { ...current, birthday: value } : current))}
            value={draft.birthday}
          />
          <DateField
            allowClear
            label="Dernier contact"
            onChange={(value) => setDraft((current) => (current ? { ...current, lastContactedAt: value } : current))}
            value={draft.lastContactedAt}
          />
          <Text style={styles.fieldLabel}>Rythme de contact</Text>
          <View style={styles.chipWrap}>
            {contactFrequencyOptions.map((frequency) => {
              const isSelected = draft.contactFrequency === frequency.id;
              return (
                <Pressable
                  key={frequency.id}
                  onPress={() => setDraft((current) => (current ? { ...current, contactFrequency: frequency.id } : current))}
                  style={({ pressed }) => [styles.linkChip, isSelected && styles.linkChipSelected, pressed && styles.pressSoft]}
                >
                  <Text style={[styles.linkChipLabel, isSelected && styles.linkChipLabelSelected]}>{frequency.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, phone: value } : current))}
            placeholder="Téléphone"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.phone}
          />
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, address: value } : current))}
            placeholder="Adresse"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.address}
          />
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, interests: value } : current))}
            placeholder="Intérêts séparés par des virgules"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.interests}
          />
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, tags: value } : current))}
            placeholder="Tags relationnels séparés par des virgules"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.tags}
          />

          <Text style={styles.fieldLabel}>Portrait relationnel (Surnom & Infos)</Text>
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, nickname: value } } : current))}
            placeholder="Surnom"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.profile.nickname}
          />
          <TextInput
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, pronouns: value } } : current))}
            placeholder="Pronoms"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={draft.profile.pronouns}
          />

          <Text style={styles.fieldLabel}>Moi & cette personne (Détails de la relation)</Text>
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingLabel}>Niveau de complicité (note manuelle) :</Text>
            <View style={styles.manualScoreWrapper}>
              <TextInput
                keyboardType="number-pad"
                maxLength={1}
                onChangeText={(value) => {
                  const cleaned = value.replace(/[^0-5]/g, '');
                  const num = parseInt(cleaned, 10);
                  const score = isNaN(num) ? 0 : Math.max(0, Math.min(5, num));
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          profile: {
                            ...current.profile,
                            affinityScore: score,
                          },
                        }
                      : current,
                  );
                }}
                placeholder="0"
                placeholderTextColor={colors.muted}
                style={styles.manualScoreInput}
                value={draft.profile.affinityScore ? String(draft.profile.affinityScore) : ''}
              />
              <Text style={styles.manualScoreMax}>/ 5</Text>
            </View>
          </View>
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, ourStory: value } } : current))}
            placeholder="Comment on s'est connus, notre rencontre, notre histoire de vie..."
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.ourStory}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, preferredActivities: value } } : current))}
            placeholder="Ce qu'on aime le plus faire ensemble (rituels, activités, partages)..."
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.preferredActivities}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, sharedValues: value } } : current))}
            placeholder="Valeurs communes ou passions partagées..."
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.sharedValues}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, frequentTopics: value } } : current))}
            placeholder="Nos sujets de discussions de prédilection, blagues, débats..."
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.frequentTopics}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, mutualSupport: value } } : current))}
            placeholder="Soutien mutuel, ce qu'on s'apporte réciproquement..."
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.mutualSupport}
          />

          <Text style={styles.fieldLabel}>Souvenirs & Lieux</Text>
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, memories: value } } : current))}
            placeholder="Souvenirs importants"
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.memories}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, places: value } } : current))}
            placeholder="Lieux associés"
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.places}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, giftIdeas: value } } : current))}
            placeholder="Idées cadeaux"
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.giftIdeas}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, avoidTopics: value } } : current))}
            placeholder="Sujets à éviter"
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.avoidTopics}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, profile: { ...current.profile, preferences: value } } : current))}
            placeholder="Préférences, habitudes, choses à retenir"
            placeholderTextColor={colors.muted}
            style={styles.textareaSmall}
            textAlignVertical="top"
            value={draft.profile.preferences}
          />
          <TextInput
            multiline
            onChangeText={(value) => setDraft((current) => (current ? { ...current, note: value } : current))}
            placeholder="Note"
            placeholderTextColor={colors.muted}
            style={styles.textarea}
            textAlignVertical="top"
            value={draft.note}
          />

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.fieldLabel}>Liens dans le cercle</Text>
            {linkAddCandidates.length ? (
              <Pressable onPress={() => setShowLinkPicker((current) => !current)} style={({ pressed }) => [styles.inlineActionChip, pressed && styles.pressSoft]}>
                <Text style={styles.inlineActionChipLabel}>{showLinkPicker ? 'Fermer' : '+ Ajouter un lien'}</Text>
              </Pressable>
            ) : null}
          </View>
          {linkedPeople.length ? (
            <View style={styles.linkEditorWrap}>
              {linkedPeople.map(({ person, strength: selectedStrength }) => {
                return (
                  <View key={person.id} style={styles.linkEditorRow}>
                    <View style={styles.linkEditorPerson}>
                      <Text style={styles.linkEditorName}>{person.name}</Text>
                      <Text style={styles.linkEditorMeta}>{getLinkStrengthLabel(selectedStrength)}</Text>
                    </View>
                    <View style={styles.linkStrengthRow}>
                      {([1, 2, 3] as PersonLinkStrength[]).map((strength) => {
                        const active = selectedStrength === strength;
                        return (
                          <Pressable
                            key={`${person.id}-${strength}`}
                            onPress={() =>
                              setDraft((current) => {
                                if (!current) {
                                  return current;
                                }

                                return {
                                  ...current,
                                  links: setDraftLinkStrength(current.links, person.id, active ? null : strength),
                                };
                              })
                            }
                            style={({ pressed }) => [styles.linkStrengthButton, active && styles.linkStrengthButtonActive, pressed && styles.pressSoft]}
                          >
                            <Text style={[styles.linkStrengthButtonLabel, active && styles.linkStrengthButtonLabelActive]}>{strength}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.helperText}>Aucun lien existant pour cette fiche.</Text>
          )}

          {showLinkPicker ? (
            linkAddCandidates.length ? (
              <View style={styles.linkEditorWrap}>
                {linkAddCandidates.map((person) => (
                  <View key={`add-${person.id}`} style={styles.linkEditorRow}>
                    <View style={styles.linkEditorPerson}>
                      <Text style={styles.linkEditorName}>{person.name}</Text>
                      <Text style={styles.linkEditorMeta}>Choisis une intensité</Text>
                    </View>
                    <View style={styles.linkStrengthRow}>
                      {([1, 2, 3] as PersonLinkStrength[]).map((strength) => (
                        <Pressable
                          key={`add-${person.id}-${strength}`}
                          onPress={() => {
                            setDraft((current) => {
                              if (!current) {
                                return current;
                              }

                              return {
                                ...current,
                                  links: setDraftLinkStrength(current.links, person.id, strength),
                              };
                            });
                            setShowLinkPicker(false);
                          }}
                          style={({ pressed }) => [styles.linkStrengthButton, pressed && styles.pressSoft]}
                        >
                          <Text style={styles.linkStrengthButtonLabel}>{strength}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>Toutes les personnes disponibles sont déjà liées.</Text>
            )
          ) : null}

          {!people.some((person) => person.id !== draft.id) ? (
            <Text style={styles.helperText}>Ajoute d'abord d'autres personnes pour créer des liens réciproques.</Text>
          ) : null}

          <View style={styles.buttonRow}>
            <Pressable onPress={handleSave} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressScale]}>
              <Text style={styles.primaryButtonLabel}>Enregistrer</Text>
            </Pressable>
            {draft.id ? (
              <Pressable onPress={handleDelete} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressSoft]}>
                <Text style={styles.secondaryButtonLabel}>Supprimer</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell ref={scrollRef} kicker="Relations" scrollEnabled={!networkGestureLocked} title="Cercle">
      <SectionTitle
        eyebrow="Relations"
        title="Contacts, liste et réseau"
        subtitle="Vue liste pour éditer, vue réseau pour lire les liens entre personnes, avec filtre par intérêt." 
      />

      <View style={styles.searchBarContainer}>
        <TextInput
          onChangeText={setSearchQuery}
          placeholder="Rechercher par nom, tag, rôle, entreprise..."
          placeholderTextColor={colors.muted}
          style={styles.searchBarInput}
          value={searchQuery}
        />
        {searchQuery.length > 0 ? (
          <Pressable onPress={() => setSearchQuery('')} style={({ pressed }) => [styles.searchBarClearButton, pressed && styles.pressSoft]}>
            <Text style={styles.searchBarClearButtonText}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.modeRow}>
        <Pressable onPress={() => setViewMode('reseau')} style={({ pressed }) => [styles.modeChip, viewMode === 'reseau' && styles.modeChipActive, pressed && styles.pressScale]}>
          <Text style={[styles.modeChipLabel, viewMode === 'reseau' && styles.modeChipLabelActive]}>Réseau</Text>
        </Pressable>
        <Pressable onPress={() => setViewMode('liste')} style={({ pressed }) => [styles.modeChip, viewMode === 'liste' && styles.modeChipActive, pressed && styles.pressScale]}>
          <Text style={[styles.modeChipLabel, viewMode === 'liste' && styles.modeChipLabelActive]}>Liste</Text>
        </Pressable>
      </View>

      {interestFilters.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pressable
            onPress={() => {
              setSelectedInterest(null);
              setSelectedPersonId(null);
            }}
            style={({ pressed }) => [styles.filterChip, !selectedInterest && styles.filterChipActive, pressed && styles.pressSoft]}
          >
            <Text style={[styles.filterChipLabel, !selectedInterest && styles.filterChipLabelActive]}>Tous</Text>
          </Pressable>
          {interestFilters.map((interest) => {
            const active = selectedInterest === interest;
            return (
              <Pressable
                key={interest}
                onPress={() => {
                  setSelectedInterest((current) => (current === interest ? null : interest));
                  setSelectedPersonId(null);
                }}
                style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.pressSoft]}
              >
                <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>{interest}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {viewMode === 'reseau' ? (
        <>
          <Text style={styles.helperText}>Mode de constellation</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {networkLayoutOptions.map((option) => {
              const active = networkLayoutMode === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    setNetworkLayoutMode(option.id);
                    setSelectedPersonId(null);
                  }}
                  style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.pressSoft]}
                >
                  <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.inlineActionsRow}>
            <Pressable onPress={() => setShowCategoryPersonalization((current) => !current)} style={({ pressed }) => [styles.inlineSettingsButton, pressed && styles.pressSoft]}>
              <Text style={styles.inlineSettingsButtonLabel}>{showCategoryPersonalization ? 'Masquer les catégories' : 'Personnaliser les catégories'}</Text>
            </Pressable>

            {Object.keys(manualNodePositions).length > 0 || scaleFactor !== 1 || isPanned ? (
              <Pressable onPress={handleResetManualLayout} style={({ pressed }) => [styles.inlineSettingsButton, pressed && styles.pressSoft]}>
                <Text style={styles.inlineSettingsButtonLabel}>🔄 Réinitialiser la constellation</Text>
              </Pressable>
            ) : null}
          </View>

          {showCategoryPersonalization ? (
            <View style={styles.categoryPersonalizationCard}>
              {categoryFeedback ? <Text style={styles.helperText}>{categoryFeedback}</Text> : null}
              {displayPersonCategories.map((category) => {
                const usageCount = categoryUsageCounts[category.id] ?? 0;
                const defaultCategory = getDefaultPersonCategory(category.id);
                const canDelete = category.custom && usageCount === 0;

                return (
                  <View key={`category-editor-${category.id}`} style={styles.categoryEditorBlock}>
                    <View style={styles.categoryLabelRow}>
                      <View style={[styles.legendDot, { backgroundColor: category.color }]} />
                      <TextInput
                        onChangeText={(value) => handleCategoryLabelChange(category.id, value)}
                        onEndEditing={() => void persistCategory(category.id)}
                        placeholder={defaultCategory?.label ?? category.label}
                        placeholderTextColor={colors.muted}
                        style={styles.categoryLabelInput}
                        value={category.label}
                      />
                      <Text style={styles.categoryUsageLabel}>{usageCount}</Text>
                    </View>
                    {renderPalette(category.color, (color) => {
                      void handleCategoryColorChange(category, color);
                    })}
                    <View style={styles.categoryActionRow}>
                      {defaultCategory ? (
                        <Pressable onPress={() => void handleResetCategory(category)} style={({ pressed }) => [styles.categoryActionButton, pressed && styles.pressSoft]}>
                          <Text style={styles.categoryActionButtonLabel}>Défaut</Text>
                        </Pressable>
                      ) : null}
                      {category.custom ? (
                        <Pressable
                          disabled={!canDelete}
                          onPress={() => void handleDeleteCategory(category)}
                          style={({ pressed }) => [styles.categoryActionButton, !canDelete && styles.categoryActionButtonDisabled, pressed && styles.pressSoft]}
                        >
                          <Text style={[styles.categoryActionButtonLabel, !canDelete && styles.categoryActionButtonLabelDisabled]}>Supprimer</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
              <View style={styles.categoryCreator}>
                <Text style={styles.fieldLabel}>Nouvelle catégorie</Text>
                <TextInput
                  onChangeText={setNewCategoryLabel}
                  placeholder="Nom de catégorie"
                  placeholderTextColor={colors.muted}
                  style={styles.categoryLabelInput}
                  value={newCategoryLabel}
                />
                {renderPalette(newCategoryColor, setNewCategoryColor)}
                <Pressable onPress={() => void handleCreateCategory()} style={({ pressed }) => [styles.categoryCreateButton, pressed && styles.pressScale]}>
                  <Text style={styles.primaryButtonLabel}>Créer la catégorie</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : null}

      {viewMode === 'reseau' && networkLayoutMode === 'categories' && networkFilterCategories.length ? (
        <>
          <Text style={styles.helperText}>Filtrer la cartographie par catégorie</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Pressable
              onPress={() => {
                setSelectedNetworkCategory(null);
                setSelectedPersonId(null);
              }}
              style={({ pressed }) => [styles.filterChip, !selectedNetworkCategory && styles.filterChipActive, pressed && styles.pressSoft]}
            >
              <Text style={[styles.filterChipLabel, !selectedNetworkCategory && styles.filterChipLabelActive]}>Tout le réseau</Text>
            </Pressable>
            {networkFilterCategories.map((category) => {
              const active = selectedNetworkCategory === category.id;
              return (
                <Pressable
                  key={`network-${category.id}`}
                  onPress={() => {
                    setSelectedNetworkCategory((current) => (current === category.id ? null : category.id));
                    setSelectedPersonId(null);
                  }}
                  style={({ pressed }) => [
                    styles.filterChip,
                    active && { backgroundColor: category.color, borderColor: category.color },
                    pressed && styles.pressSoft,
                  ]}
                >
                  <Text style={[styles.filterChipLabel, active && styles.linkChipLabelSelected]}>{getDisplayCategoryLabel(category)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {viewMode === 'reseau' && networkLayoutMode === 'proximite' ? (
        <>
          <Text style={styles.helperText}>Filtrer par intensité de lien</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Pressable
              onPress={() => {
                setSelectedNetworkProximity(null);
                setSelectedPersonId(null);
              }}
              style={({ pressed }) => [styles.filterChip, !selectedNetworkProximity && styles.filterChipActive, pressed && styles.pressSoft]}
            >
              <Text style={[styles.filterChipLabel, !selectedNetworkProximity && styles.filterChipLabelActive]}>Toutes</Text>
            </Pressable>
            {([1, 2, 3] as PersonLinkStrength[]).map((strength) => {
              const active = selectedNetworkProximity === strength;
              return (
                <Pressable
                  key={`proximity-${strength}`}
                  onPress={() => {
                    setSelectedNetworkProximity((current) => (current === strength ? null : strength));
                    setSelectedPersonId(null);
                  }}
                  style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.pressSoft]}
                >
                  <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>{getLinkStrengthLabel(strength)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {viewMode === 'reseau' && networkLayoutMode === 'contact' ? (
        <>
          <Text style={styles.helperText}>Filtrer par rythme de contact</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Pressable
              onPress={() => {
                setSelectedNetworkContact(null);
                setSelectedPersonId(null);
              }}
              style={({ pressed }) => [styles.filterChip, !selectedNetworkContact && styles.filterChipActive, pressed && styles.pressSoft]}
            >
              <Text style={[styles.filterChipLabel, !selectedNetworkContact && styles.filterChipLabelActive]}>Tous</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSelectedNetworkContact((current) => (current === 'due' ? null : 'due'));
                setSelectedPersonId(null);
              }}
              style={({ pressed }) => [styles.filterChip, selectedNetworkContact === 'due' && styles.filterChipActive, pressed && styles.pressSoft]}
            >
              <Text style={[styles.filterChipLabel, selectedNetworkContact === 'due' && styles.filterChipLabelActive]}>
                À recontacter · {contactFilterCounts.due ?? 0}
              </Text>
            </Pressable>
            {contactFrequencyOptions.filter((frequency) => frequency.id !== 'none').map((frequency) => {
              const active = selectedNetworkContact === frequency.id;
              return (
                <Pressable
                  key={`contact-${frequency.id}`}
                  onPress={() => {
                    setSelectedNetworkContact((current) => (current === frequency.id ? null : frequency.id));
                    setSelectedPersonId(null);
                  }}
                  style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.pressSoft]}
                >
                  <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>
                    {frequency.label} · {contactFilterCounts[frequency.id] ?? 0}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {viewMode === 'reseau' && networkLayoutMode === 'tags' ? (
        tagFilters.length ? (
          <>
            <Text style={styles.helperText}>Filtrer par tag relationnel</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <Pressable
                onPress={() => {
                  setSelectedNetworkTag(null);
                  setSelectedPersonId(null);
                }}
                style={({ pressed }) => [styles.filterChip, !selectedNetworkTag && styles.filterChipActive, pressed && styles.pressSoft]}
              >
                <Text style={[styles.filterChipLabel, !selectedNetworkTag && styles.filterChipLabelActive]}>Tous</Text>
              </Pressable>
              {tagFilters.map((tag) => {
                const active = selectedNetworkTag?.toLowerCase() === tag.toLowerCase();
                return (
                  <Pressable
                    key={`network-tag-${tag}`}
                    onPress={() => {
                      setSelectedNetworkTag((current) => (current?.toLowerCase() === tag.toLowerCase() ? null : tag));
                      setSelectedPersonId(null);
                    }}
                    style={({ pressed }) => [styles.filterChip, active && styles.filterChipActive, pressed && styles.pressSoft]}
                  >
                    <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>#{tag}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <Text style={styles.helperText}>Aucun tag relationnel défini. Ajoute des tags aux fiches pour filtrer le réseau.</Text>
        )
      ) : null}

      {hasActiveFilters ? (
        <View style={styles.filterSummaryRow}>
          <Text style={styles.filterSummaryLabel}>
            {(viewMode === 'reseau' ? networkPeople.length : filteredPeople.length)} personne{(viewMode === 'reseau' ? networkPeople.length : filteredPeople.length) > 1 ? 's' : ''} affichée{(viewMode === 'reseau' ? networkPeople.length : filteredPeople.length) > 1 ? 's' : ''}
          </Text>
          <Pressable onPress={handleResetFilters} style={({ pressed }) => [styles.inlineActionChip, pressed && styles.pressSoft]}>
            <Text style={styles.inlineActionChipLabel}>Réinitialiser les filtres</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable onPress={() => { setSelectedPersonId(null); setDraftFeedback(null); setDraft(createEmptyDraft()); }} style={({ pressed }) => [styles.addButton, pressed && styles.pressScale]}>
        <Text style={styles.addButtonLabel}>+ Ajouter une personne</Text>
      </Pressable>

      {(viewMode === 'reseau' ? networkPeople : filteredPeople).length ? (
        viewMode === 'reseau' ? (
          <>
            <View style={styles.networkCard}>
              <LinearGradient
                colors={[colors.surfaceRaised, colors.surface, colors.accentSoft]}
                end={{ x: 1, y: 1 }}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={handleNetworkStageTouchStart}
                onResponderMove={handleNetworkStageTouchMove}
                onResponderRelease={handleNetworkStageTouchEnd}
                onResponderTerminate={handleNetworkStageTouchEnd}
                onStartShouldSetResponder={() => true}
                start={{ x: 0, y: 0 }}
                style={styles.networkStage}
              >
                <Animated.View style={[styles.networkAura, styles.networkAuraLeft, auraLeftStyle]} />
                <Animated.View style={[styles.networkAura, styles.networkAuraRight, auraRightStyle]} />
                {networkStars.map((star) => (
                  <View
                    key={star.id}
                    pointerEvents="none"
                    style={[
                      styles.networkStar,
                      {
                        height: star.size,
                        left: star.x,
                        opacity: star.opacity,
                        top: star.y,
                        width: star.size,
                      },
                    ]}
                  />
                ))}
                
                <Animated.View style={[styles.networkBoard, animatedBoardStyle]}>
                  <View style={[styles.networkFocusLayer, { transform: networkFocusTransform }]}> 
                    <Animated.View style={[styles.networkCoreHalo, coreHaloStyle]} />
                    <Animated.View style={[styles.networkProHalo, proHaloStyle]} />

                    {displayPersonCategories.map((category) => {
                      const ring = getNetworkRing(category.id, displayPersonCategories);
                      return (
                        <View
                          key={category.id}
                          style={[
                            styles.networkRing,
                            {
                              borderColor: category.id === 'relation' || category.id === 'famille' ? colors.lineStrong : colors.line,
                              height: ring * 2,
                              left: networkCenter - ring,
                              opacity: category.id === 'autre' ? 0.22 : 0.34,
                              top: networkCenter - ring,
                              width: ring * 2,
                            },
                          ]}
                        />
                      );
                    })}

                    {networkGraph.lines.map((line) => (
                      <View key={`${line.id}-wrap`} pointerEvents="none">
                        {line.highlighted ? (
                          <View
                            style={[
                              styles.networkLineGlow,
                              {
                                backgroundColor: line.color,
                                height: line.thickness + 5,
                                left: line.x,
                                opacity: line.glowOpacity,
                                top: line.y - 2,
                                transform: [{ translateX: -line.length / 2 }, { rotateZ: `${line.angle}rad` }],
                                width: line.length,
                              },
                            ]}
                          />
                        ) : null}
                        <View
                          style={[
                            styles.networkLine,
                            {
                              backgroundColor: line.color,
                              height: line.thickness,
                              left: line.x,
                              opacity: line.opacity,
                              top: line.y,
                              transform: [{ translateX: -line.length / 2 }, { rotateZ: `${line.angle}rad` }],
                              width: line.length,
                            },
                          ]}
                        />
                      </View>
                    ))}

                    <View style={styles.networkCenterBadge} pointerEvents="none">
                      <View style={styles.networkCenterInner}>
                        <Text style={styles.networkCenterLabel}>Moi</Text>
                      </View>
                    </View>

                    {networkGraph.nodes.map((node) => (
                      <View key={`${node.person.id}-wrap`} pointerEvents="box-none">
                        <View
                          pointerEvents="none"
                          style={[
                            styles.networkNodeHalo,
                            {
                              backgroundColor: node.color,
                              height: node.radius * 2 + (node.connectedToSelection ? 22 : 18),
                              left: node.x - node.radius - (node.connectedToSelection ? 11 : 9),
                              opacity: node.haloOpacity,
                              top: node.y - node.radius - (node.connectedToSelection ? 11 : 9),
                              width: node.radius * 2 + (node.connectedToSelection ? 22 : 18),
                            },
                          ]}
                        />
                        <View
                          accessible
                          accessibilityRole="button"
                          hitSlop={12}
                          onStartShouldSetResponder={() => true}
                          onResponderTerminationRequest={() => false}
                          onResponderGrant={(event) => handleNodeResponderGrant(node, event)}
                          onResponderMove={handleNodeResponderMove}
                          onResponderRelease={handleNodeResponderRelease}
                          onResponderTerminate={handleNodeResponderRelease}
                          style={[
                            styles.networkNode,
                            {
                              backgroundColor: node.color,
                              borderColor: node.dragged ? colors.white : node.selected ? colors.white : node.connectedToSelection ? colors.accent : colors.surfaceRaised,
                              height: node.radius * 2,
                              left: node.x - node.radius,
                              opacity: node.dimmed ? 0.22 : 1,
                              top: node.y - node.radius,
                              transform: [{ scale: node.scale }],
                              width: node.radius * 2,
                              zIndex: node.dragged ? 20 : node.selected ? 10 : 1,
                            },
                            node.selected && styles.networkNodeSelected,
                            node.connectedToSelection && styles.networkNodeConnected,
                          ]}
                        >
                          {node.person.photoUri ? <Image cachePolicy="memory-disk" contentFit="cover" source={{ uri: node.person.photoUri }} style={styles.avatarPhoto} /> : <Text style={[styles.networkNodeLabel, { fontSize: Math.max(12, node.radius * 0.62) }]}>{node.initials}</Text>}
                          {node.person.favorite ? (
                            <View style={styles.networkFavoriteBadge}>
                              <Text style={styles.networkFavoriteBadgeLabel}>*</Text>
                            </View>
                          ) : null}
                        </View>
                        <View
                          pointerEvents="none"
                          style={[
                            styles.networkNodeCaption,
                            {
                              left: node.x - 36,
                              opacity: node.showLabel ? 1 : 0.18,
                              top: node.y + node.radius + 4,
                            },
                          ]}
                        >
                          <Text numberOfLines={1} style={styles.networkNodeCaptionLabel}>{node.label}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  {selectedNetworkNode ? <View pointerEvents="none" style={styles.networkFocusVignette} /> : null}
                </Animated.View>
              </LinearGradient>

              <Text style={styles.networkHint}>
                Touche un point pour isoler ses liens. Navigue dans le réseau en faisant glisser le doigt et utilise deux doigts pour zoomer.
              </Text>

              <View style={styles.legendWrap}>
                {displayPersonCategories.filter((category) => networkPeople.some((person) => person.category === category.id)).map((category) => (
                  <View key={category.id} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: category.color }]} />
                    <Text style={styles.legendLabel}>{getDisplayCategoryLabel(category)}</Text>
                  </View>
                ))}
              </View>
            </View>
            {selectedPerson ? renderPersonDetails(selectedPerson) : null}
          </>
        ) : (
          <>
            {selectedPerson ? renderPersonDetails(selectedPerson) : null}
            
            {(dashboardAlerts.birthdays.length > 0 || dashboardAlerts.toContact.length > 0) && (
              <View style={styles.dashboardSection}>
                {dashboardAlerts.toContact.length > 0 && (
                  <View style={styles.dashboardCard}>
                    <Text style={styles.dashboardTitle}>🔔 À recontacter</Text>
                    {dashboardAlerts.toContact.map(person => (
                      <Pressable key={`tocontact-${person.id}`} onPress={() => setSelectedPersonId(current => current === person.id ? null : person.id)} style={styles.dashboardItem}>
                        <Text style={styles.dashboardItemName}>{person.name}</Text>
                        <Text style={styles.dashboardItemDetail}>{getContactSummary(person).label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {dashboardAlerts.birthdays.length > 0 && (
                  <View style={styles.dashboardCard}>
                    <Text style={styles.dashboardTitle}>🎂 Anniversaires (Mois en cours)</Text>
                    {dashboardAlerts.birthdays.map(person => (
                      <Pressable key={`birthday-${person.id}`} onPress={() => setSelectedPersonId(current => current === person.id ? null : person.id)} style={styles.dashboardItem}>
                        <Text style={styles.dashboardItemName}>{person.name}</Text>
                        <Text style={styles.dashboardItemDetail}>{formatBirthday(person.birthday)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {groupedPeople.map((group) => (
              <View key={group.id} style={styles.groupSection}>
              <Text style={[styles.groupTitle, { color: group.color }]}>{group.label} · {group.people.length}</Text>
              {group.people.map((person) => {
                const birthdayLabel = formatBirthday(person.birthday);
                const interestPreview = person.interests.slice(0, 3).join(' · ');

                return (
                  <Pressable
                    key={person.id}
                    onPress={() => {
                      const isNew = selectedPersonId !== person.id;
                      setSelectedPersonId((current) => (current === person.id ? null : person.id));
                      selectionHaptic();
                      if (isNew) {
                        scrollRef.current?.scrollTo({ y: 0, animated: true });
                      }
                    }}
                    style={({ pressed }) => [styles.personCard, selectedPersonId === person.id && styles.personCardSelected, pressed && styles.pressSoft]}
                  >
                    {renderAvatar(person)}
                    <View style={styles.personBody}>
                      <Text style={styles.personName}>{person.name}</Text>
                      {(person.role || person.organization) ? (
                        <Text style={styles.personRoleDetail}>
                          {person.role}{person.role && person.organization ? ' @ ' : ''}{person.organization}
                        </Text>
                      ) : null}
                      <Text style={styles.personMeta}>
                        {getRelationshipStatusMeta(person.relationshipStatus).label} · {getContactSummary(person).label}
                      </Text>
                      {interestPreview ? <Text style={styles.personDetail}>{interestPreview}</Text> : null}
                      {birthdayLabel ? <Text style={styles.personDetail}>{birthdayLabel}</Text> : null}
                    </View>
                    <Text style={styles.personArrow}>{selectedPersonId === person.id ? 'Fiche' : 'Voir'}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          </>
        )
      ) : (
        <EmptyState
          title={people.length ? 'Aucun resultat' : 'Cercle vide'}
          message={
            people.length
              ? viewMode === 'reseau' && selectedNetworkCategory
                ? `Aucune personne visible dans le réseau pour la categorie ${getCategoryLabel(selectedNetworkCategory)}.`
                : `Aucune personne n a l interet ${selectedInterest ? `"${selectedInterest}"` : 'selectionne'}.`
              : 'Ajoute des proches, contacts pro ou personnes a retrouver pour construire le réseau.'
          }
        />
      )}
    </AppShell>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  pressSoft: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  pressScale: {
    opacity: 0.82,
    transform: [{ scale: 0.94 }],
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
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
    minHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  textareaSmall: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    minHeight: 78,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  ratingLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  manualScoreWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  manualScoreInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    height: 36,
    textAlign: 'center',
    width: 44,
    padding: 0,
  },
  manualScoreMax: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  helperText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    backgroundColor: colors.chip,
    borderColor: colors.chip,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  categoryChipLabelSelected: {
    color: colors.white,
  },
  linkChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  linkChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  linkChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  linkChipLabelSelected: {
    color: colors.white,
  },
  linkEditorWrap: {
    gap: spacing.sm,
  },
  linkEditorRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  linkEditorPerson: {
    flex: 1,
    gap: 2,
  },
  linkEditorName: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 13,
  },
  linkEditorMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  linkStrengthRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  linkStrengthButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  linkStrengthButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  linkStrengthButtonLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  linkStrengthButtonLabelActive: {
    color: colors.white,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    flex: 1,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryButtonLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  secondaryButtonCompact: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
  },
  addButtonLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeChip: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  modeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modeChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  modeChipLabelActive: {
    color: colors.white,
  },
  filterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
    paddingVertical: 2,
  },
  filterSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  filterSummaryLabel: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  filterChipLabel: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  filterChipLabelActive: {
    color: colors.accent,
  },
  inlineActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  inlineSettingsButton: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inlineSettingsButtonLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  categoryPersonalizationCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  categoryEditorBlock: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  categoryLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  categoryLabelInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryUsageLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    minWidth: 24,
    textAlign: 'right',
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  colorSwatch: {
    borderColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 26,
    width: 26,
  },
  colorSwatchSelected: {
    borderColor: colors.text,
    transform: [{ scale: 1.08 }],
  },
  categoryActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryActionButton: {
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  categoryActionButtonDisabled: {
    opacity: 0.45,
  },
  categoryActionButtonLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  categoryActionButtonLabelDisabled: {
    color: colors.muted,
  },
  categoryCreator: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  categoryCreateButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
  },
  groupSection: {
    gap: spacing.sm,
  },
  groupTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  personCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  personCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    position: 'relative',
    width: 40,
  },
  avatarPhoto: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.pill,
  },
  avatarLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
  },
  favoriteBadge: {
    alignItems: 'center',
    backgroundColor: colors.sun,
    borderColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    borderWidth: 2,
    bottom: -4,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    width: 18,
  },
  favoriteBadgeLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    lineHeight: 14,
  },
  portraitEditorRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  portraitPreview: {
    borderRadius: 36,
    height: 72,
    width: 72,
  },
  portraitEditorBody: {
    flex: 1,
    gap: spacing.xs,
  },
  favoriteToggle: {
    alignItems: 'center',
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  favoriteToggleActive: {
    backgroundColor: colors.sun,
    borderColor: colors.sun,
  },
  favoriteToggleLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  favoriteToggleLabelActive: {
    color: colors.accent,
  },
  personBody: {
    flex: 1,
    gap: 2,
  },
  personName: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  personRoleDetail: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.accent,
    marginBottom: 2,
  },
  personMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  personDetail: {
    color: colors.accent,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    flexWrap: 'wrap',
  },
  quickActionButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickActionLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  lastContactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  contactedTodayButton: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  contactedTodayLabel: {
    color: colors.primary,
    fontFamily: fonts.bodySemi,
    fontSize: 11,
  },
  dashboardSection: {
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  dashboardCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dashboardTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  dashboardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  dashboardItemName: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
  },
  dashboardItemDetail: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  statusChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  statusChipLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  contactChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  contactChipUrgent: {
    backgroundColor: 'rgba(226, 62, 87, 0.16)',
  },
  contactChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  personArrow: {
    color: colors.muted,
    fontFamily: fonts.title,
    fontSize: 20,
  },
  networkCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  networkStage: {
    borderColor: colors.lineStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    position: 'relative',
  },
  networkAura: {
    borderRadius: radii.pill,
    height: 160,
    position: 'absolute',
    width: 160,
  },
  networkAuraLeft: {
    backgroundColor: colors.accent,
    left: -28,
    top: 18,
  },
  networkAuraRight: {
    backgroundColor: colors.accent,
    right: -24,
    top: 110,
  },
  networkStar: {
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    position: 'absolute',
  },
  networkBoard: {
    alignSelf: 'center',
    height: networkSize,
    overflow: 'visible',
    position: 'relative',
    width: networkSize,
  },
  networkFocusLayer: {
    height: networkSize,
    width: networkSize,
  },
  networkCoreHalo: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 116,
    left: networkCenter - 58,
    position: 'absolute',
    top: networkCenter - 58,
    width: 116,
  },
  networkProHalo: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    height: 108,
    left: networkCenter + 18,
    position: 'absolute',
    top: networkCenter - 6,
    width: 108,
  },
  networkRing: {
    borderRadius: radii.pill,
    borderWidth: 1,
    position: 'absolute',
  },
  networkLine: {
    borderRadius: radii.pill,
    position: 'absolute',
  },
  networkLineGlow: {
    borderRadius: radii.pill,
    position: 'absolute',
  },
  networkCenterBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    left: networkCenter - 28,
    position: 'absolute',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    top: networkCenter - 28,
    width: 56,
  },
  networkCenterInner: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    width: 40,
  },
  networkCenterLabel: {
    color: colors.white,
    fontFamily: fonts.title,
    fontSize: 12,
  },
  networkNodeHalo: {
    borderRadius: radii.pill,
    position: 'absolute',
  },
  networkNode: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 2,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  networkNodeSelected: {
    shadowOpacity: 0.34,
    shadowRadius: 22,
  },
  networkNodeConnected: {
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },
  networkNodeDragged: {
    shadowOpacity: 0.36,
    shadowRadius: 26,
    zIndex: 10,
  },
  networkNodeLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
  },
  networkFavoriteBadge: {
    alignItems: 'center',
    backgroundColor: colors.sun,
    borderColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 15,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    top: -4,
    width: 15,
  },
  networkFavoriteBadgeLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    lineHeight: 12,
  },
  networkNodeCaption: {
    position: 'absolute',
    width: 72,
  },
  networkNodeCaptionLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    textAlign: 'center',
  },
  networkHint: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  legendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  legendDot: {
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  legendLabel: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  networkSelectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  networkSelectionHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  networkSelectionBody: {
    flex: 1,
    gap: 2,
  },
  relatedSection: {
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  inlineActionChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  inlineActionChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickActionChip: {
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickActionChipLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  relatedList: {
    gap: spacing.sm,
  },
  relatedItem: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  relatedKind: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  relatedBody: {
    flex: 1,
    gap: 2,
  },
  relatedTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  relatedDetail: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  relationshipItem: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  relationshipKindDot: {
    borderRadius: radii.pill,
    height: 12,
    width: 12,
  },
  relationshipNote: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  relationshipComposer: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  relationshipTypeChip: {
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  relationshipTypeChipLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  relationshipTypeChipLabelSelected: {
    color: colors.white,
  },
  relationshipTextarea: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    minHeight: 86,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  selectionTag: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectionTagLabel: {
    color: colors.accent,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  relationTag: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  relationTagLabel: {
    color: colors.accent,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  profileGrid: {
    gap: spacing.sm,
  },
  profileItem: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  profileItemLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  profileItemValue: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  secondaryCategoryTag: {
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryCategoryTagLabel: {
    color: colors.text,
    fontFamily: fonts.bodySemi,
    fontSize: 12,
  },
  networkFocusVignette: {
    backgroundColor: 'rgba(4, 10, 24, 0.08)',
    borderRadius: radii.xl,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    marginVertical: spacing.xs,
  },
  searchBarInput: {
    color: colors.text,
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    padding: 0,
  },
  searchBarClearButton: {
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarClearButtonText: {
    color: colors.muted,
    fontSize: 22,
    fontFamily: fonts.bodyBold,
    lineHeight: 22,
  },
});