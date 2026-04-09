/**
 * TopologyChamber.tsx
 * Knowledge cartography — D3 force-directed graph visualising the user's
 * conceptual landscape: concepts, patterns, values, beliefs, signals and
 * their relations from the Resonance graph.
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import * as d3 from 'd3';
import { useAtlasStore } from '../store/useAtlasStore';
import { generateId, nowISO } from '../lib/persistence';
import type { ResonanceGraphNode, ResonanceGraphEdge } from '@/resonance/types';

// ─── Colour + style constants ─────────────────────────────────────────────────

const NODE_COLOR: Record<ResonanceGraphNode['type'], string> = {
  concept: 'rgba(99,102,241,0.85)',
  pattern: 'rgba(201,162,39,0.85)',
  value:   'rgba(34,197,94,0.8)',
  belief:  'rgba(167,139,250,0.85)',
  signal:  'rgba(234,179,8,0.8)',
};

const NODE_COLOR_SOLID: Record<ResonanceGraphNode['type'], string> = {
  concept: '#6366f1',
  pattern: '#c9a227',
  value:   '#22c55e',
  belief:  '#a78bfa',
  signal:  '#eab308',
};

const EDGE_COLOR: Record<ResonanceGraphEdge['type'], string> = {
  reinforces:      'rgba(34,197,94,0.6)',
  contradicts:     'rgba(239,68,68,0.65)',
  contextualizes:  'rgba(148,163,184,0.5)',
  generates:       'rgba(6,182,212,0.6)',
  'depends-on':    'rgba(167,139,250,0.6)',
};

const EDGE_DASH: Record<ResonanceGraphEdge['type'], string | undefined> = {
  reinforces:     undefined,
  contradicts:    '4,3',
  contextualizes: undefined,
  generates:      undefined,
  'depends-on':   '2,4',
};

const TYPE_LABELS: Record<ResonanceGraphNode['type'], string> = {
  concept: 'Concept',
  pattern: 'Pattern',
  value:   'Value',
  belief:  'Belief',
  signal:  'Signal',
};

const EDGE_TYPE_LABELS: Record<ResonanceGraphEdge['type'], string> = {
  reinforces:     'Reinforces',
  contradicts:    'Contradicts',
  contextualizes: 'Contextualizes',
  generates:      'Generates',
  'depends-on':   'Depends-on',
};

const NODE_TYPES = Object.keys(TYPE_LABELS) as ResonanceGraphNode['type'][];
const EDGE_TYPES = Object.keys(EDGE_TYPE_LABELS) as ResonanceGraphEdge['type'][];

// ─── D3 simulation node (extends graph node with mutable x/y/vx/vy) ──────────

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: ResonanceGraphNode['type'];
  weight: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: SimNode | string;
  target: SimNode | string;
  strength: number;
  type: ResonanceGraphEdge['type'];
}

// ─── Tiny helper ─────────────────────────────────────────────────────────────

function nodeRadius(weight: number) {
  return 6 + weight * 14; // 6–20 px
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TopologyChamber() {
  // ── Store ──────────────────────────────────────────────────────────────────
  const graph              = useAtlasStore((s) => s.resonance.graph);
  const addNode            = useAtlasStore((s) => s.addResonanceGraphNode);
  const removeNode         = useAtlasStore((s) => s.removeResonanceGraphNode);
  const addEdge            = useAtlasStore((s) => s.addResonanceGraphEdge);
  const removeEdge         = useAtlasStore((s) => s.removeResonanceGraphEdge);

  // ── Local state ────────────────────────────────────────────────────────────
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [hoveredId,     setHoveredId]     = useState<string | null>(null);

  // Add-node form
  const [nodeLabel,     setNodeLabel]     = useState('');
  const [nodeType,      setNodeType]      = useState<ResonanceGraphNode['type']>('concept');
  const [nodeWeight,    setNodeWeight]    = useState(0.5);
  const [addNodeError,  setAddNodeError]  = useState('');

  // Add-edge form
  const [edgeTarget,    setEdgeTarget]    = useState('');
  const [edgeType,      setEdgeType]      = useState<ResonanceGraphEdge['type']>('reinforces');
  const [edgeStrength,  setEdgeStrength]  = useState(0.5);
  const [addEdgeError,  setAddEdgeError]  = useState('');

  // Panel collapse state
  const [panelOpen,     setPanelOpen]     = useState(true);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const simRef       = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const zoomRef      = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef         = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);

  // Keep latest selectedId accessible inside D3 callbacks without re-running effect
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // ── Derived data ───────────────────────────────────────────────────────────
  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId],
  );

  const connectedIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ids = new Set<string>();
    graph.edges.forEach((e) => {
      if (e.source === selectedId) ids.add(e.target);
      if (e.target === selectedId) ids.add(e.source);
    });
    return ids;
  }, [selectedId, graph.edges]);

  const connectedCount = connectedIds.size;

  // Possible edge targets: all nodes except the selected one
  const edgeTargetOptions = useMemo(
    () => graph.nodes.filter((n) => n.id !== selectedId),
    [graph.nodes, selectedId],
  );

  // ── D3 graph setup ─────────────────────────────────────────────────────────

  const buildGraph = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    // Clear previous render
    d3.select(svg).selectAll('*').remove();

    // SVG dims
    d3.select(svg).attr('width', width).attr('height', height);

    // ── Defs: radial background gradient + glow filter ─────────────────────
    const defs = d3.select(svg).append('defs');

    const radGrad = defs.append('radialGradient')
      .attr('id', 'topo-bg-grad')
      .attr('cx', '50%').attr('cy', '50%')
      .attr('r', '50%');
    radGrad.append('stop').attr('offset', '0%')
      .attr('stop-color', 'rgba(60,20,100,0.18)');
    radGrad.append('stop').attr('offset', '100%')
      .attr('stop-color', 'rgba(5,5,8,0)');

    const glowFilter = defs.append('filter')
      .attr('id', 'topo-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const selectedGlow = defs.append('filter')
      .attr('id', 'topo-selected-glow')
      .attr('x', '-80%').attr('y', '-80%')
      .attr('width', '260%').attr('height', '260%');
    selectedGlow.append('feGaussianBlur')
      .attr('stdDeviation', '6')
      .attr('result', 'glow');
    const feMerge2 = selectedGlow.append('feMerge');
    feMerge2.append('feMergeNode').attr('in', 'glow');
    feMerge2.append('feMergeNode').attr('in', 'SourceGraphic');

    // Background rect with radial gradient
    d3.select(svg).append('rect')
      .attr('width', width).attr('height', height)
      .attr('fill', 'url(#topo-bg-grad)');

    // ── Root group (zoom target) ───────────────────────────────────────────
    const g = d3.select(svg).append('g').attr('class', 'topo-root');
    gRef.current = g;

    // ── Zoom behaviour ─────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    zoomRef.current = zoom;
    d3.select(svg).call(zoom);

    // Double-click on background deselects
    d3.select(svg).on('dblclick.zoom', null); // disable default zoom
    d3.select(svg).on('dblclick', () => setSelectedId(null));

    if (graph.nodes.length === 0) return;

    // ── Build sim data ─────────────────────────────────────────────────────
    const simNodes: SimNode[] = graph.nodes.map((n) => ({
      id:     n.id,
      label:  n.label,
      type:   n.type,
      weight: n.weight,
      // preserve stored positions if available
      x: n.position?.x ?? width / 2 + (Math.random() - 0.5) * 200,
      y: n.position?.y ?? height / 2 + (Math.random() - 0.5) * 200,
    }));

    const nodeById = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = graph.edges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({
        source:   e.source,
        target:   e.target,
        strength: e.strength,
        type:     e.type,
      }));

    // ── Simulation ─────────────────────────────────────────────────────────
    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance((l) => 80 + (1 - l.strength) * 80)
        .strength((l) => l.strength * 0.4))
      .force('charge', d3.forceManyBody<SimNode>()
        .strength((d) => -120 - d.weight * 80))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collide', d3.forceCollide<SimNode>()
        .radius((d) => nodeRadius(d.weight) + 8)
        .strength(0.7))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .alphaDecay(0.028)
      .velocityDecay(0.4);

    simRef.current = simulation;

    // ── Edge lines ─────────────────────────────────────────────────────────
    const linkGroup = g.append('g').attr('class', 'links');

    const linkSel = linkGroup.selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', (d) => EDGE_COLOR[d.type])
      .attr('stroke-width', (d) => 0.8 + d.strength * 1.8)
      .attr('stroke-dasharray', (d) => EDGE_DASH[d.type] ?? null as any)
      .attr('stroke-opacity', (d) => 0.3 + d.strength * 0.6)
      .attr('fill', 'none');

    // ── Node circles ───────────────────────────────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'nodes');

    const nodeGSel = nodeGroup.selectAll<SVGGElement, SimNode>('g.node')
      .data(simNodes, (d) => d.id)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer');

    // Outer ring (selection indicator)
    nodeGSel.append('circle')
      .attr('class', 'node-ring')
      .attr('r', (d) => nodeRadius(d.weight) + 5)
      .attr('fill', 'none')
      .attr('stroke', (d) => NODE_COLOR_SOLID[d.type])
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0)
      .attr('filter', 'url(#topo-selected-glow)');

    // Main circle
    nodeGSel.append('circle')
      .attr('class', 'node-circle')
      .attr('r', (d) => nodeRadius(d.weight))
      .attr('fill', (d) => NODE_COLOR[d.type])
      .attr('stroke', (d) => NODE_COLOR_SOLID[d.type])
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.6);

    // Label
    nodeGSel.append('text')
      .attr('class', 'node-label')
      .attr('x', (d) => nodeRadius(d.weight) + 5)
      .attr('y', 4)
      .attr('fill', 'rgba(226,232,240,0.55)')
      .attr('font-size', '11px')
      .attr('font-family', 'Inter, sans-serif')
      .attr('pointer-events', 'none')
      .text((d) => d.label);

    // ── Drag behaviour ─────────────────────────────────────────────────────
    const drag = d3.drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.2).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeGSel.call(drag);

    // ── Click to select ────────────────────────────────────────────────────
    nodeGSel.on('click', (event, d) => {
      event.stopPropagation();
      setSelectedId((prev) => (prev === d.id ? null : d.id));
    });

    // Double-click to deselect
    nodeGSel.on('dblclick', (event) => {
      event.stopPropagation();
      setSelectedId(null);
    });

    // ── Tick ───────────────────────────────────────────────────────────────
    simulation.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      nodeGSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);

      // Update visual states based on current selection
      updateVisualState();
    });

    // ── Helper: dim/highlight per selection ────────────────────────────────
    function updateVisualState() {
      const sel = selectedIdRef.current;

      nodeGSel.select<SVGCircleElement>('.node-circle')
        .attr('fill-opacity', (d) => {
          if (!sel) return 1;
          if (d.id === sel) return 1;
          if (connectedIds.has(d.id)) return 0.9;
          return 0.15;
        });

      nodeGSel.select<SVGCircleElement>('.node-ring')
        .attr('stroke-opacity', (d) => (d.id === sel ? 0.9 : 0));

      nodeGSel.select<SVGTextElement>('.node-label')
        .attr('fill-opacity', (d) => {
          if (!sel) return 1;
          if (d.id === sel || connectedIds.has(d.id)) return 1;
          return 0.1;
        });

      linkSel.attr('stroke-opacity', (d) => {
        const src = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
        const tgt = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
        if (!sel) return 0.3 + d.strength * 0.6;
        if (src === sel || tgt === sel) return 0.7 + d.strength * 0.3;
        return 0.04;
      });
    }

    // Initial visual state
    updateVisualState();

    return () => {
      simulation.stop();
    };
  }, [graph, connectedIds]);

  // ── Run/re-run D3 whenever graph changes ───────────────────────────────────
  useEffect(() => {
    const cleanup = buildGraph();
    return () => {
      cleanup?.();
      simRef.current?.stop();
    };
  }, [buildGraph]);

  // ── Update visual state without full rebuild when selectedId changes ────────
  useEffect(() => {
    if (!gRef.current) return;
    const g = gRef.current;

    g.selectAll<SVGCircleElement, SimNode>('.node-circle')
      .attr('fill-opacity', (d) => {
        if (!selectedId) return 1;
        if (d.id === selectedId) return 1;
        if (connectedIds.has(d.id)) return 0.9;
        return 0.15;
      });

    g.selectAll<SVGCircleElement, SimNode>('.node-ring')
      .attr('stroke-opacity', (d) => (d.id === selectedId ? 0.9 : 0));

    g.selectAll<SVGTextElement, SimNode>('.node-label')
      .attr('fill-opacity', (d) => {
        if (!selectedId) return 1;
        if (d.id === selectedId || connectedIds.has(d.id)) return 1;
        return 0.1;
      });

    g.selectAll<SVGLineElement, SimLink>('.links line')
      .attr('stroke-opacity', (d) => {
        const src = typeof d.source === 'string' ? d.source : (d.source as SimNode).id;
        const tgt = typeof d.target === 'string' ? d.target : (d.target as SimNode).id;
        if (!selectedId) return 0.3 + d.strength * 0.6;
        if (src === selectedId || tgt === selectedId) return 0.7 + d.strength * 0.3;
        return 0.04;
      });
  }, [selectedId, connectedIds]);

  // ── ResizeObserver ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => buildGraph());
    ro.observe(el);
    return () => ro.disconnect();
  }, [buildGraph]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleAddNode(e: React.FormEvent) {
    e.preventDefault();
    if (!nodeLabel.trim()) {
      setAddNodeError('Label is required.');
      return;
    }
    const duplicate = graph.nodes.some(
      (n) => n.label.toLowerCase() === nodeLabel.trim().toLowerCase(),
    );
    if (duplicate) {
      setAddNodeError('A node with this label already exists.');
      return;
    }
    addNode({ label: nodeLabel.trim(), type: nodeType, weight: nodeWeight });
    setNodeLabel('');
    setNodeWeight(0.5);
    setAddNodeError('');
  }

  function handleAddEdge(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    if (!edgeTarget) {
      setAddEdgeError('Select a target node.');
      return;
    }
    const exists = graph.edges.some(
      (ed) =>
        (ed.source === selectedId && ed.target === edgeTarget) ||
        (ed.source === edgeTarget && ed.target === selectedId),
    );
    if (exists) {
      setAddEdgeError('An edge already exists between these nodes.');
      return;
    }
    addEdge({
      source: selectedId,
      target: edgeTarget,
      type: edgeType,
      strength: edgeStrength,
    });
    setEdgeTarget('');
    setEdgeStrength(0.5);
    setAddEdgeError('');
  }

  function handleDeleteNode() {
    if (!selectedId) return;
    // Remove all edges involving this node first
    graph.edges.forEach((ed) => {
      if (ed.source === selectedId || ed.target === selectedId) {
        removeEdge(ed.source, ed.target);
      }
    });
    removeNode(selectedId);
    setSelectedId(null);
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const S = {
    chamber: {
      position: 'relative' as const,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: '#050505',
      fontFamily: "'Inter', sans-serif",
      animation: 'atlas-fade-in 300ms ease both',
    },
    svgContainer: {
      position: 'absolute' as const,
      inset: 0,
      width: '100%',
      height: '100%',
    },
    // Floating control panel
    panel: {
      position: 'absolute' as const,
      top: 20,
      right: 20,
      width: 280,
      maxHeight: 'calc(100vh - 40px)',
      overflowY: 'auto' as const,
      background: 'rgba(15,10,30,0.82)',
      border: '1px solid rgba(88,28,135,0.18)',
      borderRadius: 12,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 0,
      animation: 'atlas-fade-in 300ms ease both',
      zIndex: 10,
    },
    panelHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 14px',
      borderBottom: '1px solid rgba(88,28,135,0.12)',
    },
    panelTitle: {
      fontSize: '0.62rem',
      fontWeight: 600,
      letterSpacing: '0.12em',
      color: 'rgba(226,232,240,0.35)',
      textTransform: 'uppercase' as const,
    },
    collapseBtn: {
      background: 'none',
      border: 'none',
      color: 'rgba(226,232,240,0.35)',
      cursor: 'pointer',
      fontSize: '0.75rem',
      padding: '2px 6px',
    },
    panelBody: {
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 14,
    },
    section: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 8,
    },
    sectionLabel: {
      fontSize: '0.62rem',
      fontWeight: 600,
      letterSpacing: '0.12em',
      color: 'rgba(226,232,240,0.28)',
      textTransform: 'uppercase' as const,
      marginBottom: 2,
    },
    input: {
      background: 'rgba(5,5,8,0.72)',
      border: '1px solid rgba(88,28,135,0.18)',
      borderRadius: 6,
      color: 'rgba(226,232,240,0.88)',
      fontSize: '0.8rem',
      padding: '6px 10px',
      width: '100%',
      outline: 'none',
      fontFamily: "'Inter', sans-serif",
    },
    select: {
      background: 'rgba(5,5,8,0.72)',
      border: '1px solid rgba(88,28,135,0.18)',
      borderRadius: 6,
      color: 'rgba(226,232,240,0.88)',
      fontSize: '0.8rem',
      padding: '6px 10px',
      width: '100%',
      outline: 'none',
      fontFamily: "'Inter', sans-serif",
      cursor: 'pointer',
    },
    sliderRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    sliderLabel: {
      fontSize: '0.72rem',
      color: 'rgba(226,232,240,0.4)',
      whiteSpace: 'nowrap' as const,
      minWidth: 44,
    },
    slider: {
      flex: 1,
      accentColor: 'rgba(167,139,250,0.85)',
      cursor: 'pointer',
    },
    sliderValue: {
      fontSize: '0.72rem',
      color: 'rgba(226,232,240,0.55)',
      minWidth: 28,
      textAlign: 'right' as const,
    },
    btn: {
      border: 'none',
      borderRadius: 6,
      fontSize: '0.78rem',
      fontWeight: 500,
      padding: '7px 12px',
      cursor: 'pointer',
      fontFamily: "'Inter', sans-serif",
    },
    primaryBtn: {
      background: 'rgba(88,28,135,0.3)',
      border: '1px solid rgba(88,28,135,0.4)',
      borderRadius: 6,
      color: 'rgba(167,139,250,0.9)',
      fontSize: '0.78rem',
      fontWeight: 500,
      padding: '7px 12px',
      cursor: 'pointer',
      fontFamily: "'Inter', sans-serif",
      width: '100%',
    },
    dangerBtn: {
      background: 'rgba(239,68,68,0.1)',
      border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 6,
      color: 'rgba(239,68,68,0.8)',
      fontSize: '0.78rem',
      fontWeight: 500,
      padding: '7px 12px',
      cursor: 'pointer',
      fontFamily: "'Inter', sans-serif",
      width: '100%',
    },
    errorText: {
      fontSize: '0.72rem',
      color: 'rgba(239,68,68,0.75)',
      marginTop: -4,
    },
    divider: {
      height: 1,
      background: 'rgba(88,28,135,0.1)',
      margin: '2px 0',
    },
    infoBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(5,5,8,0.72)',
      border: '1px solid rgba(88,28,135,0.14)',
      borderRadius: 20,
      padding: '3px 10px',
      fontSize: '0.72rem',
      color: 'rgba(226,232,240,0.7)',
    },
    typeDot: (color: string) => ({
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: color,
      flexShrink: 0,
    }),
    statsRow: {
      display: 'flex',
      gap: 10,
    },
    statBox: {
      flex: 1,
      background: 'rgba(5,5,8,0.72)',
      border: '1px solid rgba(88,28,135,0.1)',
      borderRadius: 8,
      padding: '8px 10px',
      textAlign: 'center' as const,
    },
    statNum: {
      fontSize: '1.2rem',
      fontWeight: 300,
      color: 'rgba(226,232,240,0.88)',
      letterSpacing: '-0.03em',
      lineHeight: 1,
      marginBottom: 2,
    },
    statLbl: {
      fontSize: '0.6rem',
      fontWeight: 600,
      letterSpacing: '0.1em',
      color: 'rgba(226,232,240,0.25)',
      textTransform: 'uppercase' as const,
    },
    // Empty state
    emptyState: {
      position: 'absolute' as const,
      inset: 0,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      pointerEvents: 'none' as const,
      animation: 'atlas-fade-in 300ms ease both',
    },
    emptyTitle: {
      fontSize: '1rem',
      fontWeight: 300,
      color: 'rgba(226,232,240,0.45)',
      maxWidth: 340,
      textAlign: 'center' as const,
      lineHeight: 1.6,
    },
    emptyBtn: {
      pointerEvents: 'auto' as const,
      background: 'rgba(88,28,135,0.25)',
      border: '1px solid rgba(88,28,135,0.38)',
      borderRadius: 8,
      color: 'rgba(167,139,250,0.9)',
      fontSize: '0.82rem',
      fontWeight: 500,
      padding: '9px 20px',
      cursor: 'pointer',
      fontFamily: "'Inter', sans-serif",
    },
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.chamber}>
      {/* SVG canvas */}
      <div ref={containerRef} style={S.svgContainer}>
        <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Empty state overlay */}
      {graph.nodes.length === 0 && (
        <div style={S.emptyState}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <circle cx="24" cy="24" r="22" stroke="rgba(88,28,135,0.3)" strokeWidth="1.5" />
            <circle cx="24" cy="24" r="4" fill="rgba(167,139,250,0.4)" />
            <circle cx="10" cy="16" r="3" fill="rgba(99,102,241,0.4)" />
            <circle cx="38" cy="16" r="3" fill="rgba(201,162,39,0.4)" />
            <circle cx="10" cy="34" r="3" fill="rgba(34,197,94,0.4)" />
            <circle cx="38" cy="34" r="3" fill="rgba(234,179,8,0.4)" />
            <line x1="24" y1="24" x2="10" y2="16" stroke="rgba(88,28,135,0.25)" strokeWidth="1" />
            <line x1="24" y1="24" x2="38" y2="16" stroke="rgba(88,28,135,0.25)" strokeWidth="1" />
            <line x1="24" y1="24" x2="10" y2="34" stroke="rgba(88,28,135,0.25)" strokeWidth="1" />
            <line x1="24" y1="24" x2="38" y2="34" stroke="rgba(88,28,135,0.25)" strokeWidth="1" />
          </svg>
          <p style={S.emptyTitle}>
            Your knowledge topology is empty.<br />
            Add concepts, patterns, and beliefs to begin mapping.
          </p>
          <button
            style={S.emptyBtn}
            onClick={() => {
              setPanelOpen(true);
              // focus label input
              setTimeout(() => {
                document.getElementById('topo-node-label')?.focus();
              }, 50);
            }}
          >
            Add First Node
          </button>
        </div>
      )}

      {/* Floating control panel */}
      <div style={S.panel}>
        {/* Panel header */}
        <div style={S.panelHeader}>
          <span style={S.panelTitle}>Topology Controls</span>
          <button
            style={S.collapseBtn}
            onClick={() => setPanelOpen((v) => !v)}
            aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'}
          >
            {panelOpen ? '▲' : '▼'}
          </button>
        </div>

        {panelOpen && (
          <div style={S.panelBody}>
            {/* Stats */}
            <div style={S.statsRow}>
              <div style={S.statBox}>
                <div style={S.statNum}>{graph.nodes.length}</div>
                <div style={S.statLbl}>Nodes</div>
              </div>
              <div style={S.statBox}>
                <div style={S.statNum}>{graph.edges.length}</div>
                <div style={S.statLbl}>Edges</div>
              </div>
            </div>

            <div style={S.divider} />

            {/* Selected node info */}
            {selectedNode ? (
              <div style={S.section}>
                <div style={S.sectionLabel}>Selected Node</div>
                <div style={{
                  background: 'rgba(5,5,8,0.72)',
                  border: '1px solid rgba(88,28,135,0.18)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={S.typeDot(NODE_COLOR[selectedNode.type])} />
                    <span style={{ fontSize: '0.85rem', color: 'rgba(226,232,240,0.88)', fontWeight: 500 }}>
                      {selectedNode.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                    <span style={{
                      ...S.infoBadge,
                      borderColor: NODE_COLOR[selectedNode.type],
                      color: NODE_COLOR[selectedNode.type],
                    }}>
                      {TYPE_LABELS[selectedNode.type]}
                    </span>
                    <span style={S.infoBadge}>
                      weight {selectedNode.weight.toFixed(2)}
                    </span>
                    <span style={S.infoBadge}>
                      {connectedCount} connection{connectedCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <button style={S.dangerBtn} onClick={handleDeleteNode}>
                  Delete Node
                </button>
              </div>
            ) : (
              <div style={{ fontSize: '0.75rem', color: 'rgba(226,232,240,0.25)', textAlign: 'center' as const, padding: '4px 0' }}>
                Click a node to select it
              </div>
            )}

            <div style={S.divider} />

            {/* Add Node form */}
            <form style={S.section} onSubmit={handleAddNode}>
              <div style={S.sectionLabel}>Add Node</div>
              <input
                id="topo-node-label"
                style={S.input}
                placeholder="Node label…"
                value={nodeLabel}
                onChange={(e) => { setNodeLabel(e.target.value); setAddNodeError(''); }}
              />
              <select
                style={S.select}
                value={nodeType}
                onChange={(e) => setNodeType(e.target.value as ResonanceGraphNode['type'])}
              >
                {NODE_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
              <div style={S.sliderRow}>
                <span style={S.sliderLabel}>Weight</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={nodeWeight}
                  style={S.slider}
                  onChange={(e) => setNodeWeight(parseFloat(e.target.value))}
                />
                <span style={S.sliderValue}>{nodeWeight.toFixed(2)}</span>
              </div>
              {addNodeError && <div style={S.errorText}>{addNodeError}</div>}
              <button type="submit" style={S.primaryBtn}>+ Add Node</button>
            </form>

            {/* Add Edge form (only when a node is selected) */}
            {selectedNode && edgeTargetOptions.length > 0 && (
              <>
                <div style={S.divider} />
                <form style={S.section} onSubmit={handleAddEdge}>
                  <div style={S.sectionLabel}>Add Edge from "{selectedNode.label}"</div>
                  <select
                    style={S.select}
                    value={edgeTarget}
                    onChange={(e) => { setEdgeTarget(e.target.value); setAddEdgeError(''); }}
                  >
                    <option value="">Select target node…</option>
                    {edgeTargetOptions.map((n) => (
                      <option key={n.id} value={n.id}>{n.label}</option>
                    ))}
                  </select>
                  <select
                    style={S.select}
                    value={edgeType}
                    onChange={(e) => setEdgeType(e.target.value as ResonanceGraphEdge['type'])}
                  >
                    {EDGE_TYPES.map((t) => (
                      <option key={t} value={t}>{EDGE_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <div style={S.sliderRow}>
                    <span style={S.sliderLabel}>Strength</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={edgeStrength}
                      style={S.slider}
                      onChange={(e) => setEdgeStrength(parseFloat(e.target.value))}
                    />
                    <span style={S.sliderValue}>{edgeStrength.toFixed(2)}</span>
                  </div>
                  {addEdgeError && <div style={S.errorText}>{addEdgeError}</div>}
                  <button type="submit" style={S.primaryBtn}>+ Add Edge</button>
                </form>
              </>
            )}

            <div style={S.divider} />

            {/* Node type legend */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Node Types</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                {NODE_TYPES.map((t) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={S.typeDot(NODE_COLOR[t])} />
                    <span style={{ fontSize: '0.75rem', color: 'rgba(226,232,240,0.55)' }}>
                      {TYPE_LABELS[t]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.divider} />

            {/* Edge type legend */}
            <div style={S.section}>
              <div style={S.sectionLabel}>Edge Types</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                {EDGE_TYPES.map((t) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="24" height="10" style={{ flexShrink: 0 }}>
                      <line
                        x1="0" y1="5" x2="24" y2="5"
                        stroke={EDGE_COLOR[t]}
                        strokeWidth="1.5"
                        strokeDasharray={EDGE_DASH[t] ?? undefined}
                      />
                    </svg>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(226,232,240,0.55)' }}>
                      {EDGE_TYPE_LABELS[t]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Last computed */}
            {graph.lastComputed && (
              <>
                <div style={S.divider} />
                <div style={{
                  fontSize: '0.62rem',
                  color: 'rgba(226,232,240,0.2)',
                  textAlign: 'center' as const,
                }}>
                  Last computed {new Date(graph.lastComputed).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
