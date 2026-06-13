import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Text as SvgText, G } from 'react-native-svg';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { listAllEntityRefs, listEntityLinks, entityKindLabels } from '../src/db/cross-repositories';
import { useThemePreferences, useTheme } from '../src/theme/theme-provider';
import type { EntityRef, EntityLink } from '../src/db/types';
import { useThemedStyles } from '../src/theme/use-themed-styles';

// Palette par type d'entité (teintes fixes, lisibles sur fond sombre comme clair)
const KIND_HUES = [210, 160, 30, 280, 0, 50, 330, 110];

const kindColor = (kind: string, kinds: string[]) => {
  const idx = kinds.indexOf(kind);
  const hue = KIND_HUES[idx % KIND_HUES.length];
  return `hsl(${hue}, 65%, 58%)`;
};

type PositionedNode = EntityRef & { key: string; x: number; y: number; degree: number };

export default function GrapheScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useThemedStyles(createStyles);

  const [entities, setEntities] = useState<EntityRef[]>([]);
  const [links, setLinks] = useState<EntityLink[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const refresh = useCallback(() => {
    let active = true;
    void (async () => {
      const [nextEntities, nextLinks] = await Promise.all([
        listAllEntityRefs(db, { showSensitive: preferences.showSensitiveContent }),
        listEntityLinks(db),
      ]);
      if (active) {
        setEntities(nextEntities);
        setLinks(nextLinks);
      }
    })();
    return () => { active = false; };
  }, [db, preferences.showSensitiveContent]);

  useFocusEffect(refresh);

  const graph = useMemo(() => {
    const width = windowWidth - 32 - 32; // marges écran + padding carte
    const height = 420;
    const cx = width / 2;
    const cy = height / 2;

    const keyOf = (kind: string, id: number | string) => `${kind}:${id}`;

    // Degré de chaque entité (nombre de liens)
    const degrees = new Map<string, number>();
    for (const l of links) {
      const s = keyOf(l.sourceKind, l.sourceId);
      const t = keyOf(l.targetKind, l.targetId);
      degrees.set(s, (degrees.get(s) ?? 0) + 1);
      degrees.set(t, (degrees.get(t) ?? 0) + 1);
    }

    // Ne garder que les entités reliées
    const linked = entities.filter(e => degrees.has(keyOf(e.kind, e.id)));

    // Position initiale : cercle, ordonné par type pour regrouper les couleurs
    const sorted = [...linked].sort((a, b) => a.kind.localeCompare(b.kind));
    const r0 = Math.min(cx, cy) - 50;
    const nodes: PositionedNode[] = sorted.map((node, i) => {
      const angle = (i / Math.max(1, sorted.length)) * 2 * Math.PI;
      return {
        ...node,
        key: keyOf(node.kind, node.id),
        x: cx + r0 * Math.cos(angle),
        y: cy + r0 * Math.sin(angle),
        degree: degrees.get(keyOf(node.kind, node.id)) ?? 0,
      };
    });

    const index = new Map(nodes.map(n => [n.key, n]));
    const edges = links.reduce((acc, link) => {
      const source = index.get(keyOf(link.sourceKind, link.sourceId));
      const target = index.get(keyOf(link.targetKind, link.targetId));
      if (source && target && source !== target) {
        acc.push({ source, target, id: link.id });
      }
      return acc;
    }, [] as { source: PositionedNode; target: PositionedNode; id: number | string }[]);

    // Layout force-directed statique : correction de position (pas de vélocité),
    // calculé une fois — résultat stable, aucune oscillation.
    const ITER = 160;
    const REPULSION = 1800;
    const SPRING = 0.04;
    const SPRING_LEN = 80;
    const CENTER = 0.012;
    const MARGIN = 30;

    for (let it = 0; it < ITER; it++) {
      const cool = 1 - it / ITER; // refroidissement progressif

      // Répulsion entre toutes les paires
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = dx * dx + dy * dy; }
          const d = Math.sqrt(d2);
          const push = Math.min((REPULSION / d2) * cool, 12);
          const ux = dx / d, uy = dy / d;
          a.x += ux * push; a.y += uy * push;
          b.x -= ux * push; b.y -= uy * push;
        }
      }

      // Attraction le long des arêtes
      for (const e of edges) {
        const dx = e.target.x - e.source.x, dy = e.target.y - e.source.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const pull = (d - SPRING_LEN) * SPRING * cool;
        const ux = dx / d, uy = dy / d;
        e.source.x += ux * pull; e.source.y += uy * pull;
        e.target.x -= ux * pull; e.target.y -= uy * pull;
      }

      // Gravité vers le centre + bornes
      for (const n of nodes) {
        n.x += (cx - n.x) * CENTER;
        n.y += (cy - n.y) * CENTER;
        n.x = Math.min(width - MARGIN, Math.max(MARGIN, n.x));
        n.y = Math.min(height - MARGIN, Math.max(MARGIN, n.y));
      }
    }

    const kinds = [...new Set(nodes.map(n => n.kind))];

    return { nodes, edges, width, height, kinds };
  }, [entities, links, windowWidth]);

  // Voisinage du nœud sélectionné
  const neighborhood = useMemo(() => {
    if (!selectedNode) return null;
    const keys = new Set<string>([selectedNode]);
    const edgeIds = new Set<number | string>();
    for (const e of graph.edges) {
      if (e.source.key === selectedNode || e.target.key === selectedNode) {
        keys.add(e.source.key);
        keys.add(e.target.key);
        edgeIds.add(e.id);
      }
    }
    return { keys, edgeIds };
  }, [selectedNode, graph.edges]);

  const selected = selectedNode ? graph.nodes.find(n => n.key === selectedNode) : null;
  const showAllLabels = graph.nodes.length < 15;

  const nodeRadius = (n: PositionedNode) => 6 + Math.min(6, n.degree * 1.5);

  return (
    <AppShell kicker="Liens transversaux" title="Constellation" backPath="/liens" backLabel="Liens">
      <View style={styles.card}>
        {graph.nodes.length === 0 ? (
          <Text style={styles.helpText}>
            Aucun lien pour l'instant. Relie des éléments entre eux pour voir la constellation se former.
          </Text>
        ) : (
          <>
            <Text style={styles.helpText}>
              {selected
                ? 'Touche le fond pour tout réafficher.'
                : 'Touche un point pour isoler ses connexions.'}
            </Text>

            <View style={styles.svgContainer}>
              <Svg width={graph.width} height={graph.height}>
                {/* Fond cliquable pour désélectionner */}
                <G onPress={() => setSelectedNode(null)}>
                  <Circle cx={graph.width / 2} cy={graph.height / 2} r={Math.max(graph.width, graph.height)} fill="transparent" />
                </G>

                {graph.edges.map((edge) => {
                  const active = !neighborhood || neighborhood.edgeIds.has(edge.id);
                  return (
                    <Line
                      key={edge.id}
                      x1={edge.source.x}
                      y1={edge.source.y}
                      x2={edge.target.x}
                      y2={edge.target.y}
                      stroke={active && neighborhood ? colors.accent : colors.lineStrong}
                      strokeWidth={active && neighborhood ? 1.5 : 1}
                      opacity={active ? 0.7 : 0.12}
                    />
                  );
                })}

                {graph.nodes.map((node) => {
                  const isSelected = selectedNode === node.key;
                  const inNeighborhood = !neighborhood || neighborhood.keys.has(node.key);
                  const r = nodeRadius(node);
                  const showLabel = isSelected || (inNeighborhood && (showAllLabels || !!neighborhood));
                  return (
                    <G key={node.key} onPress={() => setSelectedNode(isSelected ? null : node.key)} opacity={inNeighborhood ? 1 : 0.2}>
                      {isSelected ? (
                        <Circle cx={node.x} cy={node.y} r={r + 5} fill="none" stroke={colors.accent} strokeWidth={2} opacity={0.8} />
                      ) : null}
                      <Circle
                        cx={node.x}
                        cy={node.y}
                        r={isSelected ? r + 2 : r}
                        fill={kindColor(node.kind, graph.kinds)}
                      />
                      {showLabel ? (
                        <SvgText
                          x={node.x}
                          y={node.y - r - 7}
                          fill={colors.text}
                          fontSize={11}
                          fontWeight={isSelected ? 'bold' : 'normal'}
                          textAnchor="middle"
                          opacity={isSelected ? 1 : 0.75}
                        >
                          {node.label.length > 18 ? node.label.substring(0, 18) + '…' : node.label}
                        </SvgText>
                      ) : null}
                    </G>
                  );
                })}
              </Svg>
            </View>

            {/* Légende des types */}
            <View style={styles.legend}>
              {graph.kinds.map(kind => (
                <View key={kind} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: kindColor(kind, graph.kinds) }]} />
                  <Text style={styles.legendLabel}>
                    {(entityKindLabels as Record<string, string>)[kind] ?? kind}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Fiche du nœud sélectionné */}
      {selected ? (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={[styles.legendDot, { backgroundColor: kindColor(selected.kind, graph.kinds) }]} />
            <Text style={styles.detailKind}>
              {(entityKindLabels as Record<string, string>)[selected.kind] ?? selected.kind}
            </Text>
          </View>
          <Text style={styles.detailLabel}>{selected.label}</Text>
          <Text style={styles.detailMeta}>
            {selected.degree} lien{selected.degree > 1 ? 's' : ''}
          </Text>
          <Pressable onPress={() => setSelectedNode(null)} style={styles.detailClose} hitSlop={8}>
            <Text style={styles.detailCloseText}>Fermer</Text>
          </Pressable>
        </View>
      ) : null}
    </AppShell>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 16,
  },
  helpText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  svgContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
    gap: 6,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailKind: {
    color: colors.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  detailMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  detailClose: {
    alignSelf: 'flex-end',
  },
  detailCloseText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});
