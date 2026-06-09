import { useCallback, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText, G } from 'react-native-svg';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';

import { AppShell } from '../src/components/app-shell';
import { listAllEntityRefs, listEntityLinks, entityKindLabels } from '../src/db/cross-repositories';
import { useThemePreferences, useTheme } from '../src/theme/theme-provider';
import type { EntityRef, EntityLink } from '../src/db/types';

export default function GrapheScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

  // Compute graph data
  const graph = useMemo(() => {
    const nodes = entities.filter(e => 
      // Only show entities that have at least one link to not clutter the graph
      links.some(l => (l.sourceKind === e.kind && l.sourceId === e.id) || (l.targetKind === e.kind && l.targetId === e.id))
    );
    
    const width = Dimensions.get('window').width - 32;
    const height = 400;
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(cx, cy) - 40;

    const positionedNodes = nodes.map((node, i) => {
      const angle = (i / Math.max(1, nodes.length)) * 2 * Math.PI;
      return {
        ...node,
        key: `${node.kind}:${node.id}`,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    });

    const edges = links.reduce((acc, link) => {
      const source = positionedNodes.find(n => n.kind === link.sourceKind && n.id === link.sourceId);
      const target = positionedNodes.find(n => n.kind === link.targetKind && n.id === link.targetId);
      if (source && target) {
        acc.push({ source, target, id: link.id });
      }
      return acc;
    }, [] as any[]);

    return { nodes: positionedNodes, edges, width, height };
  }, [entities, links]);

  return (
    <AppShell kicker="Liens transversaux" title="Constellation" backPath="/liens" backLabel="Liens">
      <View style={styles.card}>
        <Text style={styles.helpText}>Les elements relies gravitent ici. Touche un point pour voir son nom.</Text>
        <View style={styles.svgContainer}>
          <Svg width={graph.width} height={graph.height}>
            {graph.edges.map((edge) => (
              <Line
                key={edge.id}
                x1={edge.source.x}
                y1={edge.source.y}
                x2={edge.target.x}
                y2={edge.target.y}
                stroke={colors.lineStrong}
                strokeWidth={1}
                opacity={0.6}
              />
            ))}
            {graph.nodes.map((node) => {
              const isSelected = selectedNode === node.key;
              return (
                <G key={node.key} onPress={() => setSelectedNode(node.key)}>
                  <Circle
                    cx={node.x}
                    cy={node.y}
                    r={isSelected ? 12 : 8}
                    fill={isSelected ? colors.accent : colors.primary}
                  />
                  {(isSelected || graph.nodes.length < 15) ? (
                    <SvgText
                      x={node.x}
                      y={node.y - 15}
                      fill={colors.text}
                      fontSize={11}
                      textAnchor="middle"
                      opacity={isSelected ? 1 : 0.7}
                    >
                      {node.label.length > 20 ? node.label.substring(0, 20) + '...' : node.label}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}
          </Svg>
        </View>
      </View>
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
});