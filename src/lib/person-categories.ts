import type { BasePersonCategory, PersonCategory, PersonCategoryDefinition } from '../db/types';

export const personCategoryPalette = [
  '#e23e57',
  '#ff5c7a',
  '#ff79c6',
  '#c768ff',
  '#a87bff',
  '#7f8cff',
  '#4f8bff',
  '#35a7ff',
  '#20a4a2',
  '#2fd4a8',
  '#7ac77a',
  '#b5cc39',
  '#ffcc4d',
  '#ffb24a',
  '#ff944d',
  '#ff7a59',
  '#d06f48',
  '#9b7b4f',
  '#6f8fce',
  '#8b95a9',
  '#5d6b82',
  '#2d3a4e',
];

export const defaultPersonCategories: PersonCategoryDefinition[] = [
  { id: 'famille', label: 'Famille', color: '#ff944d', custom: false, position: 0, createdAt: 0 },
  { id: 'pro', label: 'Pro', color: '#4f8bff', custom: false, position: 1, createdAt: 0 },
  { id: 'relation', label: 'Relation', color: '#ff79c6', custom: false, position: 2, createdAt: 0 },
  { id: 'autre', label: 'Autre', color: '#a87bff', custom: false, position: 3, createdAt: 0 },
];

export const personCategoryRoles: Record<string, string[]> = {
  pro: ['collègue', 'partenaire', 'contact'],
  famille: [
    'frère',
    'soeur',
    'père',
    'mère',
    'grand-parents',
    'oncle',
    'tante',
    'neveu',
    'nièce',
    'cousin',
    'cousine',
  ],
  relation: [
    'ami·e',
    'amoureux',
    'amoureuse',
    'amour libre',
    'connaissance',
    'crush',
  ],
};

const defaultCategoryIds = new Set(defaultPersonCategories.map((category) => category.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimCategoryId(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, '-').slice(0, 64);
}

export function sanitizeOptionalPersonCategoryId(value: unknown): PersonCategory | null {
  const categoryId = trimCategoryId(value);
  return categoryId ? (categoryId as PersonCategory) : null;
}

export function sanitizePersonCategoryId(value: unknown, fallback: PersonCategory = 'autre'): PersonCategory {
  return sanitizeOptionalPersonCategoryId(value) ?? fallback;
}

export function isDefaultPersonCategory(categoryId: string): categoryId is BasePersonCategory {
  return defaultCategoryIds.has(categoryId as BasePersonCategory);
}

export function getDefaultPersonCategory(categoryId: string) {
  return defaultPersonCategories.find((category) => category.id === categoryId) ?? null;
}

function humanizeCategoryId(categoryId: string) {
  const normalized = categoryId
    .replace(/^cat-/, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  if (!normalized) {
    return 'Categorie';
  }

  return normalized.slice(0, 1).toUpperCase() + normalized.slice(1);
}

export function sanitizePersonCategoryLabel(value: unknown, categoryId: PersonCategory) {
  const label = typeof value === 'string' ? value.trim().slice(0, 48) : '';
  return label || getDefaultPersonCategory(categoryId)?.label || humanizeCategoryId(categoryId);
}

export function sanitizePersonCategoryColor(value: unknown, fallback = personCategoryPalette[6]) {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    return value.trim().toLowerCase();
  }

  return fallback;
}

export function getPersonCategoryColorFallback(index: number) {
  return personCategoryPalette[Math.abs(index) % personCategoryPalette.length];
}

export function normalizePersonCategoryDefinition(value: unknown, fallbackPosition: number): PersonCategoryDefinition | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = sanitizeOptionalPersonCategoryId(value.id);
  if (!id) {
    return null;
  }

  const defaultCategory = getDefaultPersonCategory(id);
  const position = typeof value.position === 'number' && Number.isFinite(value.position)
    ? value.position
    : defaultCategory?.position ?? fallbackPosition;
  const colorFallback = defaultCategory?.color ?? getPersonCategoryColorFallback(position);

  return {
    id,
    label: sanitizePersonCategoryLabel(value.label, id),
    color: sanitizePersonCategoryColor(value.color, colorFallback),
    custom: defaultCategory ? false : typeof value.custom === 'boolean' ? value.custom : true,
    position,
    createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
  };
}

export function mergePersonCategoryDefinitions(
  categories: PersonCategoryDefinition[],
  usedCategoryIds: PersonCategory[] = [],
) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const mergedDefaults = defaultPersonCategories.map((category) => {
    const stored = byId.get(category.id);

    return {
      ...category,
      label: stored?.label ?? category.label,
      color: stored?.color ?? category.color,
      createdAt: stored?.createdAt ?? category.createdAt,
    } satisfies PersonCategoryDefinition;
  });

  const customCategories = categories
    .filter((category) => !isDefaultPersonCategory(category.id))
    .map((category, index) => ({
      ...category,
      custom: true,
      position: Number.isFinite(category.position) ? category.position : defaultPersonCategories.length + index,
    }))
    .sort((left, right) => left.position - right.position || left.label.localeCompare(right.label, 'fr'));

  const knownIds = new Set([...mergedDefaults, ...customCategories].map((category) => category.id));
  const inferredCategories = [...new Set(usedCategoryIds)]
    .filter((categoryId) => !knownIds.has(categoryId) && !isDefaultPersonCategory(categoryId))
    .map((categoryId, index) => ({
      id: categoryId,
      label: sanitizePersonCategoryLabel('', categoryId),
      color: getPersonCategoryColorFallback(defaultPersonCategories.length + customCategories.length + index),
      custom: true,
      position: defaultPersonCategories.length + customCategories.length + index,
      createdAt: Date.now(),
    } satisfies PersonCategoryDefinition));

  return [...mergedDefaults, ...customCategories, ...inferredCategories];
}

export function createPersonCategoryId(label: string, existingIds: Set<string>) {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'categorie';
  const baseId = `cat-${slug}`;

  if (!existingIds.has(baseId)) {
    return baseId as PersonCategory;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseId}-${index}`;
    if (!existingIds.has(candidate)) {
      return candidate as PersonCategory;
    }
  }

  return `cat-${Date.now()}` as PersonCategory;
}