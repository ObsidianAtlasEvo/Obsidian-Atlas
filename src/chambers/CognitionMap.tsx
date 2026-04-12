/**
 * CognitionMap.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Obsidian Atlas — Living Nebula Star Map of the user's mind.
 *
 * Renders a canvas-based animated star map where every concept node is a
 * glowing star, clusters are nebula clouds, edges are curved Bézier beams,
 * and the whole universe breathes with pulse animations and D3 force physics.
 *
 * Deps: d3, react (>=18), tailwindcss
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from 'react';
import * as d3 from 'd3';
import type {
  UserEvolutionProfile,
  ConceptNode,
  ConceptEdge,
  ConceptCluster,
  CognitionMapData,
  DomainKey,
  DomainInterest,
} from '../types/evolutionTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & palette
// ─────────────────────────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  philosophy: '#9b59b6',
  technology: '#4a9eff',
  strategy: '#c9a84c',
  psychology: '#e74c3c',
  science: '#00d4aa',
  history: '#e67e22',
  culture: '#f39c12',
  economics: '#27ae60',
  mathematics: '#1abc9c',
  art: '#e91e8c',
  language: '#8e44ad',
  ethics: '#d35400',
  default: '#7f8c8d',
};

const getDomainColor = (domain: string): string =>
  DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.default;

const BACKGROUND = '#0a0a0f';
const GOLD = '#c9a84c';
const STAR_COUNT = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Concept keyword extraction
// ─────────────────────────────────────────────────────────────────────────────

/** Domain keyword map for naive classification */
const DOMAIN_KEYWORDS: Record<DomainKey, string[]> = {
  philosophy: [
    'philosophy', 'ethics', 'metaphysics', 'epistemology', 'ontology',
    'consciousness', 'existence', 'meaning', 'truth', 'reality', 'morality',
    'virtue', 'socrates', 'kant', 'hegel', 'nietzsche', 'plato', 'aristotle',
    'stoic', 'phenomenology', 'dialectic', 'rationalism', 'empiricism',
  ],
  technology: [
    'technology', 'software', 'algorithm', 'code', 'programming', 'ai',
    'machine learning', 'neural', 'data', 'system', 'network', 'digital',
    'computer', 'api', 'database', 'architecture', 'infrastructure',
    'automation', 'robotics', 'quantum', 'blockchain', 'internet',
  ],
  strategy: [
    'strategy', 'planning', 'decision', 'framework', 'model', 'competitive',
    'advantage', 'leadership', 'organization', 'management', 'execution',
    'risk', 'opportunity', 'objective', 'goal', 'roadmap', 'leverage',
    'tactic', 'game theory', 'nash', 'porter', 'positioning',
  ],
  psychology: [
    'psychology', 'cognition', 'behavior', 'emotion', 'memory', 'attention',
    'perception', 'motivation', 'bias', 'heuristic', 'trauma', 'identity',
    'ego', 'self', 'anxiety', 'depression', 'therapy', 'freud', 'jung',
    'maslow', 'skinner', 'social', 'cognitive', 'developmental',
  ],
  science: [
    'science', 'physics', 'chemistry', 'biology', 'evolution', 'entropy',
    'relativity', 'quantum', 'thermodynamics', 'genetics', 'neuroscience',
    'cosmology', 'experiment', 'hypothesis', 'empirical', 'observation',
    'theory', 'paradigm', 'kuhn', 'darwin', 'einstein', 'newton',
  ],
  history: [
    'history', 'civilization', 'empire', 'revolution', 'war', 'ancient',
    'medieval', 'renaissance', 'enlightenment', 'industrial', 'colonial',
    'rome', 'greece', 'ottoman', 'dynasty', 'century', 'historical',
    'archaeological', 'chronicle', 'past', 'era', 'epoch', 'period',
  ],
  culture: [
    'culture', 'art', 'literature', 'music', 'film', 'society', 'tradition',
    'religion', 'ritual', 'myth', 'narrative', 'language', 'identity',
    'symbolism', 'aesthetic', 'beauty', 'creativity', 'expression',
    'anthropology', 'sociology', 'community', 'belief',
  ],
  economics: [
    'economics', 'market', 'capital', 'trade', 'supply', 'demand', 'price',
    'inflation', 'gdp', 'growth', 'recession', 'currency', 'finance',
    'investment', 'profit', 'labor', 'wealth', 'inequality', 'keynes',
    'hayek', 'smith', 'marx', 'monetary', 'fiscal',
  ],
  mathematics: [
    'mathematics', 'math', 'theorem', 'proof', 'equation', 'calculus',
    'algebra', 'geometry', 'topology', 'number', 'prime', 'infinity',
    'set theory', 'gödel', 'riemann', 'fractal', 'probability', 'statistics',
    'combinatorics', 'logic', 'axiom', 'formal',
  ],
  art: [
    'art', 'painting', 'sculpture', 'design', 'visual', 'aesthetic',
    'composition', 'color', 'form', 'space', 'texture', 'modernism',
    'contemporary', 'abstract', 'surrealism', 'impressionism', 'picasso',
    'duchamp', 'bauhaus', 'craft', 'medium', 'canvas',
  ],
  language: [
    'language', 'linguistics', 'grammar', 'syntax', 'semantics', 'word',
    'text', 'discourse', 'rhetoric', 'metaphor', 'narrative', 'writing',
    'speech', 'translation', 'babel', 'chomsky', 'saussure', 'sign',
    'symbol', 'meaning', 'interpretation', 'hermeneutics',
  ],
  ethics: [
    'ethics', 'moral', 'justice', 'fairness', 'rights', 'duty', 'virtue',
    'consequentialism', 'utilitarianism', 'deontology', 'kant', 'rawls',
    'mill', 'good', 'evil', 'harm', 'obligation', 'responsibility',
    'integrity', 'accountability', 'dignity', 'autonomy',
  ],
};

function classifyDomain(text: string): DomainKey {
  const lower = text.toLowerCase();
  let best: DomainKey = 'philosophy';
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [DomainKey, string[]][]) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = domain;
    }
  }
  return best;
}

/** Extract meaningful noun phrases / keywords from a message */
function extractConcepts(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
    'that', 'this', 'these', 'those', 'it', 'its', 'you', 'your', 'my',
    'me', 'we', 'our', 'they', 'their', 'i', 'if', 'as', 'so', 'up',
    'out', 'about', 'into', 'through', 'how', 'what', 'when', 'where',
    'which', 'who', 'why', 'more', 'also', 'just', 'not', 'no', 'yes',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w));

  // Also pull known domain keywords that appear in the text
  const domainHits: string[] = [];
  for (const keywords of Object.values(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.toLowerCase().includes(kw) && kw.length > 4) {
        domainHits.push(kw);
      }
    }
  }

  const combined = [...new Set([...words, ...domainHits])];
  return combined.slice(0, 12); // cap per message
}

// ─────────────────────────────────────────────────────────────────────────────
// Data derivation
// ─────────────────────────────────────────────────────────────────────────────

export function deriveMapData(
  profile: UserEvolutionProfile | null,
  messages: Array<{ role: 'user' | 'atlas'; content: string; timestamp: number }>
): CognitionMapData {
  // ── 1. Build concept frequency map from user messages ──
  const conceptFreq = new Map<
    string,
    { count: number; firstSeen: number; lastSeen: number; messageSets: Set<number>[] }
  >();
  const messageConceptSets: string[][] = [];

  const userMessages = messages.filter((m) => m.role === 'user');

  userMessages.forEach((msg, msgIdx) => {
    const concepts = extractConcepts(msg.content);
    messageConceptSets[msgIdx] = concepts;

    concepts.forEach((concept) => {
      const existing = conceptFreq.get(concept);
      if (existing) {
        existing.count += 1;
        existing.lastSeen = Math.max(existing.lastSeen, msg.timestamp);
        existing.messageSets.push(new Set([msgIdx]));
      } else {
        conceptFreq.set(concept, {
          count: 1,
          firstSeen: msg.timestamp,
          lastSeen: msg.timestamp,
          messageSets: [new Set([msgIdx])],
        });
      }
    });
  });

  // ── 2. Boost weights from profile domains ──
  const domainWeightMap = new Map<string, number>();
  if (profile) {
    // Support both DomainProfile[] (new) and DomainInterest[] (existing shape)
    const interests: DomainInterest[] = (profile as any).domainInterests ?? [];
    const domainProfiles: Array<{ key: string; weight: number; firstEngaged?: number; lastEngaged?: number; topConcepts?: string[] }> =
      (profile as any).domains ?? [];

    interests.forEach((d) => {
      domainWeightMap.set(d.name, d.score);
      // Seed concepts from related domains
      d.relatedDomains.forEach((c) => {
        const existing = conceptFreq.get(c);
        if (existing) {
          existing.count += Math.round(d.score * 3);
        } else {
          conceptFreq.set(c, {
            count: Math.round(d.score * 3),
            firstSeen: Date.now() - 86400000,
            lastSeen: Date.now(),
            messageSets: [],
          });
        }
      });
    });

    domainProfiles.forEach((d) => {
      domainWeightMap.set(d.key, d.weight);
      (d.topConcepts ?? []).forEach((c) => {
        const existing = conceptFreq.get(c);
        if (existing) {
          existing.count += Math.round(d.weight * 5);
        } else {
          conceptFreq.set(c, {
            count: Math.round(d.weight * 5),
            firstSeen: d.firstEngaged ?? Date.now() - 86400000,
            lastSeen: d.lastEngaged ?? Date.now(),
            messageSets: [],
          });
        }
      });
    });
  }

  // ── 3. Filter to top concepts, build nodes ──
  const maxCount = Math.max(...Array.from(conceptFreq.values()).map((v) => v.count), 1);
  const sortedConcepts = Array.from(conceptFreq.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 60);

  const nodes: ConceptNode[] = sortedConcepts.map(([label, data], idx) => {
    const domain = classifyDomain(label);
    const domainBoost = domainWeightMap.get(domain) ?? 0.3;
    const rawWeight = data.count / maxCount;
    const weight = Math.min(1, rawWeight * 0.7 + domainBoost * 0.3);

    return {
      id: `node-${idx}`,
      label,
      domain,
      weight,
      visitCount: data.count,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
      connections: [],
      glowColor: getDomainColor(domain),
      pulsePhase: Math.random() * Math.PI * 2,
      isCluster: false,
      clusterChildren: [],
    };
  });

  // ── 4. Build edge co-occurrence matrix ──
  const edgeMap = new Map<string, { strength: number; type: ConceptEdge['type'] }>();
  const nodeIdxByLabel = new Map(nodes.map((n, i) => [n.label, i]));

  messageConceptSets.forEach((conceptSet) => {
    for (let a = 0; a < conceptSet.length; a++) {
      for (let b = a + 1; b < conceptSet.length; b++) {
        const idxA = nodeIdxByLabel.get(conceptSet[a]);
        const idxB = nodeIdxByLabel.get(conceptSet[b]);
        if (idxA === undefined || idxB === undefined) continue;

        const key = `${Math.min(idxA, idxB)}-${Math.max(idxA, idxB)}`;
        const existing = edgeMap.get(key);
        if (existing) {
          existing.strength = Math.min(1, existing.strength + 0.15);
        } else {
          // Determine edge type from domains
          const domainA = nodes[idxA].domain;
          const domainB = nodes[idxB].domain;
          let type: ConceptEdge['type'] = 'semantic';
          if (domainA === domainB) type = 'semantic';
          else if (
            (domainA === 'philosophy' && domainB === 'science') ||
            (domainB === 'philosophy' && domainA === 'science')
          ) {
            type = 'causal';
          } else if (
            domainA === 'history' ||
            domainB === 'history'
          ) {
            type = 'temporal';
          }

          edgeMap.set(key, { strength: 0.2, type });
        }
      }
    }
  });

  const edges: ConceptEdge[] = Array.from(edgeMap.entries())
    .map(([key, { strength, type }]) => {
      const [a, b] = key.split('-').map(Number);
      // populate connections
      nodes[a].connections.push(nodes[b].id);
      nodes[b].connections.push(nodes[a].id);
      return { source: nodes[a].id, target: nodes[b].id, strength, type };
    })
    .filter((e) => e.strength > 0.1);

  // ── 5. Build clusters by domain ──
  const domainGroups = new Map<string, ConceptNode[]>();
  nodes.forEach((n) => {
    const existing = domainGroups.get(n.domain) ?? [];
    existing.push(n);
    domainGroups.set(n.domain, existing);
  });

  // Cognitive style affects cluster connectivity (support both object and array styles)
  const style = profile?.cognitiveStyle as any;
  const isSystems = Array.isArray(style)
    ? style.includes('systemsThinker')
    : style?.systemsThinker === true;
  const isPhilosophical = Array.isArray(style)
    ? style.includes('philosophicalSeeker')
    : style?.socraticDisposition === true;

  const clusters: ConceptCluster[] = Array.from(domainGroups.entries())
    .filter(([, group]) => group.length >= 2)
    .map(([domain, group], idx) => {
      const angle = (idx / domainGroups.size) * Math.PI * 2;
      const radius = 180 + (isSystems ? 40 : 0);
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius;

      // Mark cluster centers
      const centerNode = group.reduce((a, b) => (a.weight > b.weight ? a : b));
      centerNode.isCluster = true;
      centerNode.clusterChildren = group.filter((n) => n !== centerNode).map((n) => n.id);

      // Domain label humanization
      const clusterLabels: Record<string, string> = {
        philosophy: isPhilosophical ? 'Philosophical Inquiry' : 'Philosophy',
        technology: 'Technology & Systems',
        strategy: 'Strategic Thinking',
        psychology: 'Mind & Behavior',
        science: 'Scientific Lens',
        history: 'Historical Context',
        culture: 'Cultural Meaning',
        economics: 'Economic Systems',
        mathematics: 'Mathematical Structure',
        art: 'Aesthetic Sensibility',
        language: 'Language & Meaning',
        ethics: 'Ethical Reasoning',
      };

      return {
        id: `cluster-${domain}`,
        label: clusterLabels[domain] ?? domain,
        domain,
        nodeIds: group.map((n) => n.id),
        centroid: { x: cx, y: cy },
        radius: 80 + group.length * 8,
        color: getDomainColor(domain),
      };
    });

  return { nodes, edges, clusters, lastUpdated: Date.now() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Static background stars (generated once)
// ─────────────────────────────────────────────────────────────────────────────

interface BackgroundStar {
  x: number;   // 0–1 normalized
  y: number;
  r: number;
  alpha: number;
}

function generateBackgroundStars(): BackgroundStar[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.5 + Math.random() * 1.0,
    alpha: 0.2 + Math.random() * 0.6,
  }));
}

const BG_STARS = generateBackgroundStars();

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip component
// ─────────────────────────────────────────────────────────────────────────────

interface TooltipData {
  node: ConceptNode;
  x: number;
  y: number;
  connectedLabels: string[];
}

function NodeTooltip({
  data,
  allNodes,
}: {
  data: TooltipData;
  allNodes: ConceptNode[];
}) {
  const { node, x, y, connectedLabels } = data;
  const firstDate = new Date(node.firstSeen).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{ left: x + 16, top: y - 8 }}
    >
      <div
        style={{
          background: 'rgba(10, 10, 20, 0.92)',
          border: `1px solid ${node.glowColor}44`,
          backdropFilter: 'blur(16px)',
          borderRadius: 12,
          padding: '14px 18px',
          minWidth: 220,
          boxShadow: `0 0 24px ${node.glowColor}22, 0 8px 32px rgba(0,0,0,0.6)`,
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: node.glowColor,
              boxShadow: `0 0 8px ${node.glowColor}`,
            }}
          />
          <span
            style={{
              color: node.glowColor,
              fontFamily: 'monospace',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {node.label}
          </span>
        </div>

        {/* Domain pill */}
        <div className="mb-3">
          <span
            style={{
              background: node.glowColor + '22',
              border: `1px solid ${node.glowColor}44`,
              color: node.glowColor,
              fontSize: 10,
              borderRadius: 4,
              padding: '2px 8px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'monospace',
            }}
          >
            {node.domain}
          </span>
        </div>

        {/* Stats */}
        <div style={{ color: '#8892b0', fontSize: 11, lineHeight: 1.8 }}>
          <div>
            <span style={{ color: '#4a9eff' }}>Visits</span>{' '}
            <span style={{ color: '#ccd6f6', fontWeight: 600 }}>{node.visitCount}</span>
          </div>
          <div>
            <span style={{ color: '#4a9eff' }}>Weight</span>{' '}
            <span style={{ color: '#ccd6f6', fontWeight: 600 }}>
              {(node.weight * 100).toFixed(0)}%
            </span>
          </div>
          <div>
            <span style={{ color: '#4a9eff' }}>First encountered</span>{' '}
            <span style={{ color: '#ccd6f6', fontWeight: 600 }}>{firstDate}</span>
          </div>
        </div>

        {/* Connections */}
        {connectedLabels.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div
              style={{
                color: '#c9a84c',
                fontSize: 9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 6,
                fontFamily: 'monospace',
              }}
            >
              Connected to
            </div>
            <div className="flex flex-wrap gap-1">
              {connectedLabels.map((label) => (
                <span
                  key={label}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#8892b0',
                    fontSize: 10,
                    borderRadius: 4,
                    padding: '1px 6px',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Legend Panel
// ─────────────────────────────────────────────────────────────────────────────

function LegendPanel({ domains }: { domains: string[] }) {
  return (
    <div
      className="absolute top-4 right-4 z-30"
      style={{
        background: 'rgba(10, 10, 20, 0.75)',
        border: '1px solid rgba(201, 168, 76, 0.2)',
        backdropFilter: 'blur(20px)',
        borderRadius: 12,
        padding: '14px 16px',
        minWidth: 160,
      }}
    >
      <div
        style={{
          color: '#c9a84c',
          fontSize: 9,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          fontFamily: 'monospace',
          marginBottom: 10,
        }}
      >
        Domain Legend
      </div>
      <div className="flex flex-col gap-2">
        {domains.map((domain) => (
          <div key={domain} className="flex items-center gap-2">
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: getDomainColor(domain),
                boxShadow: `0 0 6px ${getDomainColor(domain)}88`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: '#8892b0',
                fontSize: 11,
                fontFamily: 'monospace',
                textTransform: 'capitalize',
              }}
            >
              {domain}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main CognitionMap component
// ─────────────────────────────────────────────────────────────────────────────

export interface CognitionMapProps {
  evolutionProfile: UserEvolutionProfile | null;
  messageHistory: Array<{ role: 'user' | 'atlas'; content: string; timestamp: number }>;
  onNodeSelect?: (node: ConceptNode) => void;
}

export const CognitionMap: React.FC<CognitionMapProps> = ({
  evolutionProfile,
  messageHistory,
  onNodeSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const simRef = useRef<d3.Simulation<ConceptNode, ConceptEdge> | null>(null);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, camX: 0, camY: 0 });

  // Interaction state
  const [hoveredNode, setHoveredNode] = useState<TooltipData | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });

  // Derive map data
  const mapData = useMemo(
    () => deriveMapData(evolutionProfile, messageHistory),
    [evolutionProfile, messageHistory]
  );

  // Present domains for legend
  const presentDomains = useMemo(
    () => [...new Set(mapData.nodes.map((n) => n.domain))].slice(0, 10),
    [mapData]
  );

  // Stats
  const stats = useMemo(() => {
    const systems = (evolutionProfile as any)?.thinkingSystems?.length ?? mapData.clusters.length;
    return {
      concepts: mapData.nodes.length,
      connections: mapData.edges.length,
      systems,
    };
  }, [mapData, evolutionProfile]);

  // ── Resize observer ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── D3 force simulation ──
  useEffect(() => {
    if (mapData.nodes.length === 0) return;

    const nodes = mapData.nodes.map((n) => ({ ...n }));
    const edges = mapData.edges.map((e) => ({
      ...e,
      source: nodes.findIndex((n) => n.id === e.source),
      target: nodes.findIndex((n) => n.id === e.target),
    }));

    const sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(edges)
          .id((_, i) => i)
          .strength((d: any) => d.strength * 0.3)
          .distance(80)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(0, 0))
      .force(
        'collision',
        d3.forceCollide((n: ConceptNode) => (n.weight * 12 + 4) + 20)
      )
      .alphaDecay(0.02)
      .on('tick', () => {
        // Copy positions back to original nodes
        nodes.forEach((simNode, i) => {
          const orig = mapData.nodes.find((n) => n.id === simNode.id);
          if (orig) {
            orig.x = simNode.x;
            orig.y = simNode.y;
          }
        });
      });

    simRef.current = sim as any;

    return () => {
      sim.stop();
    };
  }, [mapData]);

  // ── Canvas render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let startTime = performance.now();

    const draw = (now: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h } = canvasSize;
      const time = (now - startTime) / 1000;
      const cam = cameraRef.current;

      // Resize canvas if needed
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // Clear
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, w, h);

      // ── Background stars (no transform) ──
      BG_STARS.forEach((star) => {
        const sx = star.x * w;
        const sy = star.y * h;
        ctx.beginPath();
        ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 210, 255, ${star.alpha * (0.7 + 0.3 * Math.sin(time * 0.3 + star.x * 10))})`;
        ctx.fill();
      });

      // ── Apply camera transform ──
      ctx.save();
      ctx.translate(w / 2 + cam.x, h / 2 + cam.y);
      ctx.scale(cam.scale, cam.scale);

      const nodes = mapData.nodes;
      const edges = mapData.edges;
      const clusters = mapData.clusters;
      const nodeById = new Map(nodes.map((n) => [n.id, n]));

      // ── Nebula cluster clouds ──
      clusters.forEach((cluster) => {
        const cx = cluster.centroid.x;
        const cy = cluster.centroid.y;
        const r = cluster.radius;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        const col = cluster.color;
        grad.addColorStop(0, hexAlpha(col, 0.13));
        grad.addColorStop(0.5, hexAlpha(col, 0.07));
        grad.addColorStop(1, hexAlpha(col, 0));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      // ── Cluster labels ──
      clusters.forEach((cluster) => {
        const cx = cluster.centroid.x;
        const cy = cluster.centroid.y - cluster.radius * 0.8;
        const col = GOLD;
        ctx.save();
        ctx.font = '500 10px monospace';
        ctx.letterSpacing = '2px';
        ctx.textAlign = 'center';
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.fillStyle = hexAlpha(col, 0.65);
        ctx.fillText(cluster.label.toUpperCase(), cx, cy);
        ctx.restore();
      });

      // ── Edges ──
      edges.forEach((edge) => {
        const src = nodeById.get(edge.source);
        const tgt = nodeById.get(edge.target);
        if (!src || !tgt || src.x === undefined || tgt.x === undefined) return;

        const isFocused = focusedNodeId !== null;
        const isRelated =
          edge.source === focusedNodeId || edge.target === focusedNodeId;
        const alpha = isFocused ? (isRelated ? edge.strength : 0.04) : edge.strength * 0.4;
        const width = 0.5 + edge.strength * 1.5;

        const mx = (src.x! + tgt.x!) / 2;
        const my = (src.y! + tgt.y!) / 2 - 30;

        ctx.beginPath();
        ctx.moveTo(src.x!, src.y!);
        ctx.quadraticCurveTo(mx, my, tgt.x!, tgt.y!);

        let color = src.glowColor;
        if (edge.type === 'contradictory') color = '#e74c3c';
        if (edge.type === 'temporal') color = '#c9a84c';

        ctx.strokeStyle = hexAlpha(color, alpha);
        ctx.lineWidth = width;
        ctx.stroke();
      });

      // ── Nodes ──
      nodes.forEach((node) => {
        if (node.x === undefined || node.y === undefined) return;
        const r = node.weight * 12 + 4;
        const pulse = 0.15 * Math.sin(time * 1.4 + node.pulsePhase);
        const displayR = r * (1 + pulse);

        const isFocused = focusedNodeId === node.id;
        const isRelated = focusedNodeId
          ? node.connections.includes(focusedNodeId)
          : false;
        const isDimmed = focusedNodeId && !isFocused && !isRelated;

        const alpha = isDimmed ? 0.15 : 1.0;

        // Glow halo
        const glowR = displayR * (isFocused ? 4 : 3);
        const glowGrad = ctx.createRadialGradient(
          node.x!, node.y!, 0,
          node.x!, node.y!, glowR
        );
        glowGrad.addColorStop(0, hexAlpha(node.glowColor, 0.35 * alpha));
        glowGrad.addColorStop(0.4, hexAlpha(node.glowColor, 0.12 * alpha));
        glowGrad.addColorStop(1, hexAlpha(node.glowColor, 0));
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Core star
        ctx.save();
        ctx.shadowColor = node.glowColor;
        ctx.shadowBlur = isFocused ? 24 : 12;
        const coreGrad = ctx.createRadialGradient(
          node.x! - displayR * 0.3, node.y! - displayR * 0.3, 0,
          node.x!, node.y!, displayR
        );
        coreGrad.addColorStop(0, hexAlpha('#ffffff', 0.9 * alpha));
        coreGrad.addColorStop(0.3, hexAlpha(node.glowColor, 0.9 * alpha));
        coreGrad.addColorStop(1, hexAlpha(node.glowColor, 0.3 * alpha));
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, displayR, 0, Math.PI * 2);
        ctx.fillStyle = coreGrad;
        ctx.fill();
        ctx.restore();

        // Focus ring
        if (isFocused) {
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, displayR + 6, 0, Math.PI * 2);
          ctx.strokeStyle = hexAlpha(GOLD, 0.8);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Label (only for weighted or focused nodes)
        if (node.weight > 0.4 || isFocused || isRelated) {
          ctx.save();
          ctx.font = `${isFocused ? 600 : 400} ${isFocused ? 12 : 10}px monospace`;
          ctx.textAlign = 'center';
          ctx.shadowColor = node.glowColor;
          ctx.shadowBlur = 6;
          ctx.fillStyle = hexAlpha(
            isFocused ? '#ffffff' : '#ccd6f6',
            isDimmed ? 0.1 : isFocused ? 1 : 0.75
          );
          ctx.fillText(node.label, node.x!, node.y! + displayR + 14);
          ctx.restore();
        }
      });

      ctx.restore(); // camera

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mapData, canvasSize, focusedNodeId]);

  // ── Hit test: find node near canvas pointer ──
  const hitTest = useCallback(
    (clientX: number, clientY: number): ConceptNode | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current;

      // Convert client coords → world coords
      const wx = (clientX - rect.left - rect.width / 2 - cam.x) / cam.scale;
      const wy = (clientY - rect.top - rect.height / 2 - cam.y) / cam.scale;

      let closest: ConceptNode | null = null;
      let minDist = Infinity;

      mapData.nodes.forEach((node) => {
        if (node.x === undefined || node.y === undefined) return;
        const d = Math.hypot(wx - node.x, wy - node.y);
        const r = node.weight * 12 + 4 + 10;
        if (d < r && d < minDist) {
          minDist = d;
          closest = node;
        }
      });

      return closest;
    },
    [mapData]
  );

  // ── Mouse move → hover ──
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        cameraRef.current.x = dragRef.current.camX + dx;
        cameraRef.current.y = dragRef.current.camY + dy;
        setHoveredNode(null);
        return;
      }

      const node = hitTest(e.clientX, e.clientY);
      if (node) {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const connectedLabels = node.connections
          .slice(0, 3)
          .map((id) => mapData.nodes.find((n) => n.id === id)?.label ?? '')
          .filter(Boolean);

        setHoveredNode({
          node,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          connectedLabels,
        });
      } else {
        setHoveredNode(null);
      }
    },
    [hitTest, mapData]
  );

  // ── Mouse down → drag start ──
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      camX: cameraRef.current.x,
      camY: cameraRef.current.y,
    };
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDragging =
      Math.abs(e.clientX - dragRef.current.startX) > 4 ||
      Math.abs(e.clientY - dragRef.current.startY) > 4;
    dragRef.current.active = false;

    if (!wasDragging) {
      // Click: select/deselect node
      const node = hitTest(e.clientX, e.clientY);
      if (node) {
        setFocusedNodeId((prev) => (prev === node.id ? null : node.id));
        onNodeSelect?.(node);

        // Pan to node
        const canvas = canvasRef.current!;
        cameraRef.current.x = -(node.x ?? 0) * cameraRef.current.scale;
        cameraRef.current.y = -(node.y ?? 0) * cameraRef.current.scale;
      } else {
        setFocusedNodeId(null);
      }
    }
  }, [hitTest, onNodeSelect]);

  // ── Wheel → zoom ──
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    cameraRef.current.scale = Math.min(4, Math.max(0.3, cameraRef.current.scale * (1 + delta)));
  }, []);

  const handleMouseLeave = useCallback(() => {
    dragRef.current.active = false;
    setHoveredNode(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ background: BACKGROUND, minHeight: 400 }}
    >
      {/* Header */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-3">
        <PulseIndicator />
        <span
          style={{
            color: GOLD,
            fontFamily: 'monospace',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            textShadow: `0 0 12px ${GOLD}88`,
          }}
        >
          Cognition Map
        </span>
      </div>

      {/* Legend */}
      <LegendPanel domains={presentDomains} />

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        className="block w-full h-full cursor-grab active:cursor-grabbing"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      />

      {/* Tooltip */}
      {hoveredNode && (
        <NodeTooltip data={hoveredNode} allNodes={mapData.nodes} />
      )}

      {/* Stats bar */}
      <div
        className="absolute bottom-4 left-4 z-30 flex items-center gap-4"
        style={{
          background: 'rgba(10, 10, 20, 0.7)',
          border: '1px solid rgba(201, 168, 76, 0.15)',
          backdropFilter: 'blur(12px)',
          borderRadius: 8,
          padding: '8px 14px',
        }}
      >
        <StatItem value={stats.concepts} label="concepts" color="#4a9eff" />
        <Divider />
        <StatItem value={stats.connections} label="connections" color="#00d4aa" />
        <Divider />
        <StatItem value={stats.systems} label="thinking systems" color={GOLD} />
      </div>

      {/* Zoom hint */}
      <div
        className="absolute bottom-4 right-4 z-30"
        style={{
          color: 'rgba(136, 146, 176, 0.5)',
          fontSize: 10,
          fontFamily: 'monospace',
          letterSpacing: '0.06em',
        }}
      >
        scroll to zoom · drag to pan · click to focus
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Small UI atoms
// ─────────────────────────────────────────────────────────────────────────────

function PulseIndicator() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 12, height: 12 }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: '#00d4aa',
          animation: 'ping 1.8s cubic-bezier(0,0,0.2,1) infinite',
          opacity: 0.4,
        }}
      />
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: '#00d4aa',
          boxShadow: '0 0 8px #00d4aa',
        }}
      />
    </div>
  );
}

function StatItem({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span style={{ color, fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>
        {value}
      </span>
      <span style={{ color: '#4a5568', fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.06em' }}>
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)' }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

/** Convert hex color to rgba string with given alpha (0–1) */
function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default CognitionMap;
