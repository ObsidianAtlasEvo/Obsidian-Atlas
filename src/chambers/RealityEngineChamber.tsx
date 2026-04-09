import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useAtlasStore } from '../store/useAtlasStore';

// ─── Types ─────────────────────────────────────────────────────────────────────

type NodeType = 'goal' | 'project' | 'relationship' | 'habit' | 'constraint' | 'leverage' | 'bottleneck';
type ConnectionType = 'positive' | 'negative' | 'neutral';

interface SystemNode {
  id: string;
  label: string;
  type: NodeType;
  importance: number;
  connections: { targetId: string; strength: number; type: ConnectionType }[];
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: NodeType;
  importance: number;
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  source: string | D3Node;
  target: string | D3Node;
  strength: number;
  type: ConnectionType;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<NodeType, string> = {
  goal:         'rgba(201,162,39,0.9)',
  project:      'rgba(99,102,241,0.8)',
  relationship: 'rgba(244,114,182,0.7)',
  habit:        'rgba(34,197,94,0.7)',
  constraint:   'rgba(239,68,68,0.7)',
  leverage:     'rgba(6,182,212,0.8)',
  bottleneck:   'rgba(234,179,8,0.8)',
};

const NODE_LABELS: Record<NodeType, string> = {
  goal:         'Goal',
  project:      'Project',
  relationship: 'Relationship',
  habit:        'Habit',
  constraint:   'Constraint',
  leverage:     'Leverage',
  bottleneck:   'Bottleneck',
};

const CONNECTION_COLORS: Record<ConnectionType, string> = {
  positive: 'rgba(34,197,94,0.55)',
  negative: 'rgba(239,68,68,0.55)',
  neutral:  'rgba(148,163,184,0.35)',
};

const NODE_TYPES: NodeType[] = ['goal', 'project', 'relationship', 'habit', 'constraint', 'leverage', 'bottleneck'];

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    fontFamily: "'Inter', sans-serif",
    color: 'rgba(226,232,240,0.92)',
    animation: 'atlas-fade-in 300ms ease both',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    background: 'rgba(15,10,30,0.55)',
    borderBottom: '1px solid rgba(88,28,135,0.14)',
    flexShrink: 0,
    flexWrap: 'wrap' as const,
  },
  topBarLabel: {
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'rgba(226,232,240,0.55)',
  },
  statBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 9px',
    background: 'rgba(5,5,8,0.72)',
    border: '1px solid rgba(88,28,135,0.14)',
    borderRadius: '6px',
    fontSize: '0.72rem',
    color: 'rgba(226,232,240,0.85)',
  },
  legendDot: (color: string) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '0.67rem',
    color: 'rgba(226,232,240,0.55)',
  },
  legendSep: {
    width: '1px',
    height: '14px',
    background: 'rgba(88,28,135,0.18)',
    margin: '0 4px',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  graphPanel: {
    flex: '0 0 65%',
    position: 'relative' as const,
    overflow: 'hidden',
    borderRight: '1px solid rgba(88,28,135,0.14)',
  },
  svg: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  rightPanel: {
    flex: '0 0 35%',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    background: 'rgba(15,10,30,0.3)',
  },
  rightScroll: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  panel: {
    background: 'rgba(15,10,30,0.55)',
    border: '1px solid rgba(88,28,135,0.14)',
    borderRadius: '10px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  panelTitle: {
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'rgba(226,232,240,0.55)',
    marginBottom: '2px',
  },
  input: {
    width: '100%',
    background: 'rgba(5,5,8,0.72)',
    border: '1px solid rgba(88,28,135,0.18)',
    borderRadius: '6px',
    padding: '7px 10px',
    color: 'rgba(226,232,240,0.92)',
    fontSize: '0.8rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: "'Inter', sans-serif",
  },
  select: {
    width: '100%',
    background: 'rgba(5,5,8,0.72)',
    border: '1px solid rgba(88,28,135,0.18)',
    borderRadius: '6px',
    padding: '7px 10px',
    color: 'rgba(226,232,240,0.92)',
    fontSize: '0.8rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: "'Inter', sans-serif",
    cursor: 'pointer',
  },
  label: {
    fontSize: '0.72rem',
    color: 'rgba(226,232,240,0.55)',
    marginBottom: '3px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  btnPrimary: {
    background: 'rgba(88,28,135,0.45)',
    border: '1px solid rgba(88,28,135,0.5)',
    borderRadius: '7px',
    color: 'rgba(167,139,250,0.95)',
    padding: '8px 14px',
    fontSize: '0.78rem',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    transition: 'background 0.15s',
  },
  btnDanger: {
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '7px',
    color: 'rgba(239,68,68,0.85)',
    padding: '7px 12px',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    transition: 'background 0.15s',
  },
  btnGhost: {
    background: 'rgba(5,5,8,0.45)',
    border: '1px solid rgba(88,28,135,0.14)',
    borderRadius: '6px',
    color: 'rgba(226,232,240,0.7)',
    padding: '5px 10px',
    fontSize: '0.73rem',
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    transition: 'background 0.15s',
  },
  typeBadge: (type: NodeType) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 9px',
    background: 'rgba(5,5,8,0.72)',
    border: `1px solid ${NODE_COLORS[type]}44`,
    borderRadius: '20px',
    fontSize: '0.67rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: NODE_COLORS[type],
    textTransform: 'uppercase' as const,
  }),
  connItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 9px',
    background: 'rgba(5,5,8,0.45)',
    borderRadius: '6px',
    border: '1px solid rgba(88,28,135,0.1)',
    fontSize: '0.75rem',
    gap: '6px',
  },
  importanceBar: (val: number) => ({
    height: '3px',
    borderRadius: '2px',
    background: `linear-gradient(90deg, rgba(167,139,250,0.8) ${val * 10}%, rgba(88,28,135,0.15) ${val * 10}%)`,
    marginTop: '4px',
  }),
  sectionDivider: {
    height: '1px',
    background: 'rgba(88,28,135,0.14)',
    margin: '2px 0',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '8px',
    color: 'rgba(226,232,240,0.3)',
    fontSize: '0.8rem',
    textAlign: 'center' as const,
    padding: '20px',
  },
  consequenceItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '7px',
    fontSize: '0.75rem',
    color: 'rgba(226,232,240,0.75)',
    lineHeight: 1.45,
  },
  bullet: (color: string) => ({
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
    marginTop: '5px',
  }),
  rippleItem: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '6px 9px',
    background: 'rgba(5,5,8,0.45)',
    borderRadius: '6px',
    border: '1px solid rgba(88,28,135,0.1)',
    gap: '8px',
    fontSize: '0.73rem',
  },
  magnitudeBar: (mag: number) => ({
    width: `${Math.min(100, mag * 10)}%`,
    height: '2px',
    borderRadius: '1px',
    background: mag >= 7
      ? 'rgba(239,68,68,0.7)'
      : mag >= 4
        ? 'rgba(234,179,8,0.7)'
        : 'rgba(34,197,94,0.6)',
    marginTop: '3px',
  }),
  connectPanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    maxHeight: '160px',
    overflowY: 'auto' as const,
  },
  connectNodeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '6px 9px',
    background: 'rgba(5,5,8,0.45)',
    border: '1px solid rgba(88,28,135,0.14)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.75rem',
    color: 'rgba(226,232,240,0.8)',
    fontFamily: "'Inter', sans-serif",
    textAlign: 'left' as const,
    width: '100%',
    transition: 'background 0.12s',
  },
  slider: {
    width: '100%',
    accentColor: 'rgba(167,139,250,0.85)',
    cursor: 'pointer',
  },
};

// ─── Helper ────────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function getTotalConnections(nodes: SystemNode[]): number {
  const seen = new Set<string>();
  nodes.forEach(n =>
    n.connections.forEach(c => {
      const key = [n.id, c.targetId].sort().join('-');
      seen.add(key);
    })
  );
  return seen.size;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const RealityEngineChamber: React.FC = () => {
  const realityEngine = useAtlasStore((s) => s.realityEngine);
  const addSystemNode    = useAtlasStore((s) => s.addSystemNode);
  const removeSystemNode = useAtlasStore((s) => s.removeSystemNode);
  const updateSystemNode = useAtlasStore((s) => s.updateSystemNode);
  const addNodeConnection    = useAtlasStore((s) => s.addNodeConnection);
  const removeNodeConnection = useAtlasStore((s) => s.removeNodeConnection);

  const nodes: SystemNode[] = realityEngine?.systemNodes ?? [];
  const consequence = realityEngine?.consequenceInspector;
  const timeRipples = realityEngine?.timeRipples ?? [];

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = nodes.find(n => n.id === selectedId) ?? null;

  // Add node form
  const [addLabel, setAddLabel]       = useState('');
  const [addType, setAddType]         = useState<NodeType>('goal');
  const [addImportance, setAddImportance] = useState(5);

  // Edit node form
  const [editLabel, setEditLabel]         = useState('');
  const [editImportance, setEditImportance] = useState(5);

  // Connect panel
  const [showConnect, setShowConnect]   = useState(false);
  const [connStrength, setConnStrength] = useState(5);
  const [connType, setConnType]         = useState<ConnectionType>('positive');

  // D3 refs
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<D3Node, D3Link> | null>(null);

  // When selected node changes, seed edit fields
  useEffect(() => {
    if (selectedNode) {
      setEditLabel(selectedNode.label);
      setEditImportance(selectedNode.importance);
      setShowConnect(false);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── D3 Force Graph ──────────────────────────────────────────────────────────

  useEffect(() => {
    const svgEl = svgRef.current;
    const container = containerRef.current;
    if (!svgEl || !container) return;

    const { width, height } = container.getBoundingClientRect();
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (nodes.length === 0) {
      // Empty state
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 - 12)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(226,232,240,0.25)')
        .attr('font-size', '13px')
        .attr('font-family', "'Inter', sans-serif")
        .text('No system nodes yet');
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 + 10)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(226,232,240,0.15)')
        .attr('font-size', '11px')
        .attr('font-family', "'Inter', sans-serif")
        .text('Add a node using the panel →');
      return;
    }

    // Build D3 node/link data (deep copy so D3 can mutate)
    const d3Nodes: D3Node[] = nodes.map(n => ({
      id:         n.id,
      label:      n.label,
      type:       n.type,
      importance: n.importance,
    }));

    const nodeById = new Map(d3Nodes.map(n => [n.id, n]));

    const d3Links: D3Link[] = [];
    const addedLinks = new Set<string>();
    nodes.forEach(n => {
      n.connections.forEach(c => {
        const key = [n.id, c.targetId].sort().join('|');
        if (!addedLinks.has(key) && nodeById.has(n.id) && nodeById.has(c.targetId)) {
          addedLinks.add(key);
          d3Links.push({ source: n.id, target: c.targetId, strength: c.strength, type: c.type });
        }
      });
    });

    // SVG setup
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // Defs: arrow markers
    const defs = svg.append('defs');
    (['positive', 'negative', 'neutral'] as ConnectionType[]).forEach(ct => {
      defs.append('marker')
        .attr('id', `arrow-${ct}`)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 18)
        .attr('refY', 0)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L8,0L0,4')
        .attr('fill', CONNECTION_COLORS[ct]);
    });

    // Subtle grid background
    const grid = svg.append('g').attr('class', 'grid');
    const gridSize = 48;
    for (let x = 0; x < width; x += gridSize) {
      grid.append('line')
        .attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', height)
        .attr('stroke', 'rgba(88,28,135,0.04)').attr('stroke-width', 1);
    }
    for (let y = 0; y < height; y += gridSize) {
      grid.append('line')
        .attr('x1', 0).attr('y1', y).attr('x2', width).attr('y2', y)
        .attr('stroke', 'rgba(88,28,135,0.04)').attr('stroke-width', 1);
    }

    // Link group
    const linkGroup = svg.append('g').attr('class', 'links');
    const linkEls = linkGroup
      .selectAll<SVGLineElement, D3Link>('line')
      .data(d3Links)
      .join('line')
      .attr('stroke', d => CONNECTION_COLORS[d.type])
      .attr('stroke-width', d => Math.max(1, d.strength * 0.5))
      .attr('stroke-linecap', 'round')
      .attr('marker-end', d => `url(#arrow-${d.type})`);

    // Node group
    const nodeGroup = svg.append('g').attr('class', 'nodes');
    const nodeEls = nodeGroup
      .selectAll<SVGGElement, D3Node>('g.node')
      .data(d3Nodes, d => d.id)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer');

    // Glow circle (selection indicator)
    nodeEls.append('circle')
      .attr('class', 'glow')
      .attr('r', d => 8 + (d.importance / 10) * 16 + 6)
      .attr('fill', 'none')
      .attr('stroke', d => NODE_COLORS[d.type])
      .attr('stroke-width', 0)
      .attr('opacity', 0);

    // Main circle
    nodeEls.append('circle')
      .attr('class', 'main')
      .attr('r', d => 8 + (d.importance / 10) * 16)
      .attr('fill', d => NODE_COLORS[d.type] + '33')
      .attr('stroke', d => NODE_COLORS[d.type])
      .attr('stroke-width', 1.5);

    // Label
    nodeEls.append('text')
      .attr('class', 'lbl')
      .attr('text-anchor', 'middle')
      .attr('dy', d => 8 + (d.importance / 10) * 16 + 14)
      .attr('fill', 'rgba(226,232,240,0.75)')
      .attr('font-size', '10px')
      .attr('font-family', "'Inter', sans-serif")
      .text(d => d.label.length > 14 ? d.label.slice(0, 13) + '…' : d.label);

    // Highlight selected node
    const highlightSelected = (selId: string | null) => {
      nodeEls.each(function(d) {
        const isSelected = d.id === selId;
        d3.select(this).select('circle.glow')
          .attr('stroke-width', isSelected ? 2 : 0)
          .attr('opacity', isSelected ? 0.5 : 0);
        d3.select(this).select('circle.main')
          .attr('stroke-width', isSelected ? 2.5 : 1.5)
          .attr('fill', isSelected
            ? NODE_COLORS[d.type] + '66'
            : NODE_COLORS[d.type] + '33');
      });
    };
    highlightSelected(selectedId);

    // Click handler
    nodeEls.on('click', (event: MouseEvent, d: D3Node) => {
      event.stopPropagation();
      setSelectedId(prev => prev === d.id ? null : d.id);
    });

    // Deselect on background click
    svg.on('click', () => setSelectedId(null));

    // Drag
    const drag = d3.drag<SVGGElement, D3Node>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
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

    nodeEls.call(drag as any);

    // Simulation
    const simulation = d3.forceSimulation<D3Node>(d3Nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(d3Links)
        .id(d => d.id)
        .distance(d => 90 + (10 - d.strength) * 8)
        .strength(d => d.strength / 12))
      .force('charge', d3.forceManyBody<D3Node>().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collide', d3.forceCollide<D3Node>().radius(d => 8 + (d.importance / 10) * 16 + 12).strength(0.8))
      .alphaDecay(0.025);

    simulationRef.current = simulation;

    simulation.on('tick', () => {
      linkEls
        .attr('x1', d => (d.source as D3Node).x ?? 0)
        .attr('y1', d => (d.source as D3Node).y ?? 0)
        .attr('x2', d => (d.target as D3Node).x ?? 0)
        .attr('y2', d => (d.target as D3Node).y ?? 0);

      nodeEls.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes]); // re-run when nodes change (selectedId handled by highlight fn below)

  // Separate effect to update node visual selection state without rebuilding D3
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    svg.selectAll<SVGGElement, D3Node>('g.node').each(function(d) {
      const isSelected = d.id === selectedId;
      d3.select(this).select('circle.glow')
        .attr('stroke-width', isSelected ? 2 : 0)
        .attr('opacity', isSelected ? 0.5 : 0);
      d3.select(this).select('circle.main')
        .attr('stroke-width', isSelected ? 2.5 : 1.5)
        .attr('fill', isSelected
          ? NODE_COLORS[d.type] + '66'
          : NODE_COLORS[d.type] + '33');
    });
  }, [selectedId]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleAddNode = useCallback(() => {
    if (!addLabel.trim()) return;
    const newNode: SystemNode = {
      id:          uid(),
      label:       addLabel.trim(),
      type:        addType,
      importance:  addImportance,
      connections: [],
    };
    addSystemNode(newNode);
    setAddLabel('');
    setAddImportance(5);
  }, [addLabel, addType, addImportance, addSystemNode]);

  const handleUpdateNode = useCallback(() => {
    if (!selectedNode || !editLabel.trim()) return;
    updateSystemNode(selectedNode.id, {
      label: editLabel.trim(),
      importance: editImportance,
    });
  }, [selectedNode, editLabel, editImportance, updateSystemNode]);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNode) return;
    removeSystemNode(selectedNode.id);
    setSelectedId(null);
  }, [selectedNode, removeSystemNode]);

  const handleAddConnection = useCallback((targetId: string) => {
    if (!selectedNode) return;
    // Avoid duplicate
    if (selectedNode.connections.some(c => c.targetId === targetId)) return;
    addNodeConnection(selectedNode.id, { targetId, strength: connStrength, type: connType });
    setShowConnect(false);
  }, [selectedNode, connStrength, connType, addNodeConnection]);

  const handleRemoveConnection = useCallback((targetId: string) => {
    if (!selectedNode) return;
    removeNodeConnection(selectedNode.id, targetId);
  }, [selectedNode, removeNodeConnection]);

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const totalConnections = getTotalConnections(nodes);
  const connectableNodes = nodes.filter(n =>
    n.id !== selectedId &&
    !selectedNode?.connections.some(c => c.targetId === n.id)
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* Top Bar */}
      <div style={styles.topBar}>
        <span style={styles.topBarLabel}>Reality Engine</span>
        <div style={styles.statBadge}>
          <span style={{ color: 'rgba(167,139,250,0.85)', fontWeight: 600 }}>{nodes.length}</span>
          <span style={{ color: 'rgba(226,232,240,0.4)' }}>nodes</span>
        </div>
        <div style={styles.statBadge}>
          <span style={{ color: 'rgba(6,182,212,0.85)', fontWeight: 600 }}>{totalConnections}</span>
          <span style={{ color: 'rgba(226,232,240,0.4)' }}>connections</span>
        </div>
        <div style={styles.legendSep} />
        {NODE_TYPES.map(t => (
          <div key={t} style={styles.legendItem}>
            <div style={styles.legendDot(NODE_COLORS[t])} />
            <span>{NODE_LABELS[t]}</span>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Left: D3 Graph */}
        <div ref={containerRef} style={styles.graphPanel}>
          <svg ref={svgRef} style={styles.svg} />
        </div>

        {/* Right: Detail Panel */}
        <div style={styles.rightPanel}>
          <div style={styles.rightScroll}>

            {/* Node Panel — Add or Edit */}
            {selectedNode ? (
              /* Edit Node */
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Selected Node</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={styles.typeBadge(selectedNode.type)}>
                    <span style={{ ...styles.legendDot(NODE_COLORS[selectedNode.type]), width: '6px', height: '6px' }} />
                    {NODE_LABELS[selectedNode.type]}
                  </span>
                </div>

                <div style={styles.fieldGroup}>
                  <div style={styles.label}>Label</div>
                  <input
                    style={styles.input}
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateNode()}
                    placeholder="Node label"
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <div style={{ ...styles.label, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Importance</span>
                    <span style={{ color: 'rgba(167,139,250,0.85)', fontWeight: 600 }}>{editImportance}</span>
                  </div>
                  <input
                    type="range" min={1} max={10} step={1}
                    style={styles.slider}
                    value={editImportance}
                    onChange={e => setEditImportance(Number(e.target.value))}
                  />
                  <div style={styles.importanceBar(editImportance)} />
                </div>

                <div style={{ display: 'flex', gap: '7px' }}>
                  <button style={{ ...styles.btnPrimary, flex: 1 }} onClick={handleUpdateNode}>
                    Save Changes
                  </button>
                  <button style={styles.btnDanger} onClick={handleDeleteNode}>
                    Delete
                  </button>
                </div>

                {/* Connections */}
                <div style={styles.sectionDivider} />
                <div style={styles.panelTitle}>
                  Connections ({selectedNode.connections.length})
                </div>

                {selectedNode.connections.length === 0 ? (
                  <div style={{ fontSize: '0.73rem', color: 'rgba(226,232,240,0.3)', textAlign: 'center', padding: '8px 0' }}>
                    No connections yet
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {selectedNode.connections.map(conn => {
                      const target = nodes.find(n => n.id === conn.targetId);
                      if (!target) return null;
                      return (
                        <div key={conn.targetId} style={styles.connItem}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                            <div style={{ ...styles.legendDot(NODE_COLORS[target.type]), width: '6px', height: '6px', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.73rem', color: 'rgba(226,232,240,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {target.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.67rem', color: CONNECTION_COLORS[conn.type], fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                              {conn.type}
                            </span>
                            <span style={{ fontSize: '0.67rem', color: 'rgba(226,232,240,0.35)' }}>
                              ×{conn.strength}
                            </span>
                            <button
                              style={{ ...styles.btnGhost, padding: '2px 7px', fontSize: '0.67rem', color: 'rgba(239,68,68,0.7)' }}
                              onClick={() => handleRemoveConnection(conn.targetId)}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Connection */}
                {!showConnect ? (
                  <button style={styles.btnGhost} onClick={() => setShowConnect(true)}>
                    + Connect to…
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{ ...styles.fieldGroup, flex: 1 }}>
                        <div style={styles.label}>Type</div>
                        <select
                          style={styles.select}
                          value={connType}
                          onChange={e => setConnType(e.target.value as ConnectionType)}
                        >
                          <option value="positive">Positive</option>
                          <option value="negative">Negative</option>
                          <option value="neutral">Neutral</option>
                        </select>
                      </div>
                      <div style={{ ...styles.fieldGroup, flex: 1 }}>
                        <div style={{ ...styles.label, display: 'flex', justifyContent: 'space-between' }}>
                          <span>Strength</span>
                          <span style={{ color: 'rgba(167,139,250,0.85)' }}>{connStrength}</span>
                        </div>
                        <input
                          type="range" min={1} max={10} step={1}
                          style={styles.slider}
                          value={connStrength}
                          onChange={e => setConnStrength(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    {connectableNodes.length === 0 ? (
                      <div style={{ fontSize: '0.73rem', color: 'rgba(226,232,240,0.3)', textAlign: 'center', padding: '6px 0' }}>
                        No other nodes available
                      </div>
                    ) : (
                      <div style={styles.connectPanel}>
                        {connectableNodes.map(n => (
                          <button
                            key={n.id}
                            style={styles.connectNodeBtn}
                            onClick={() => handleAddConnection(n.id)}
                          >
                            <div style={{ ...styles.legendDot(NODE_COLORS[n.type]), width: '7px', height: '7px' }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {n.label}
                            </span>
                            <span style={{ ...styles.typeBadge(n.type), padding: '1px 6px', fontSize: '0.6rem' }}>
                              {NODE_LABELS[n.type]}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <button style={styles.btnGhost} onClick={() => setShowConnect(false)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Add Node */
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Add System Node</div>

                <div style={styles.fieldGroup}>
                  <div style={styles.label}>Label</div>
                  <input
                    style={styles.input}
                    value={addLabel}
                    onChange={e => setAddLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNode()}
                    placeholder="e.g. Launch product, Daily exercise…"
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <div style={styles.label}>Type</div>
                  <select style={styles.select} value={addType} onChange={e => setAddType(e.target.value as NodeType)}>
                    {NODE_TYPES.map(t => (
                      <option key={t} value={t}>{NODE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.fieldGroup}>
                  <div style={{ ...styles.label, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Importance</span>
                    <span style={{ color: 'rgba(167,139,250,0.85)', fontWeight: 600 }}>{addImportance}</span>
                  </div>
                  <input
                    type="range" min={1} max={10} step={1}
                    style={styles.slider}
                    value={addImportance}
                    onChange={e => setAddImportance(Number(e.target.value))}
                  />
                  <div style={styles.importanceBar(addImportance)} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '2px' }}>
                  <div style={{ ...styles.legendDot(NODE_COLORS[addType]), width: '10px', height: '10px' }} />
                  <span style={{ fontSize: '0.73rem', color: 'rgba(226,232,240,0.5)' }}>
                    {NODE_LABELS[addType]} · size proportional to importance
                  </span>
                </div>

                <button
                  style={{ ...styles.btnPrimary, opacity: addLabel.trim() ? 1 : 0.5, cursor: addLabel.trim() ? 'pointer' : 'default' }}
                  onClick={handleAddNode}
                  disabled={!addLabel.trim()}
                >
                  + Add Node
                </button>

                {nodes.length > 0 && (
                  <div style={{ fontSize: '0.72rem', color: 'rgba(226,232,240,0.3)', textAlign: 'center' }}>
                    Click a node in the graph to select it
                  </div>
                )}
              </div>
            )}

            {/* Consequence Inspector */}
            {consequence && (
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Consequence Inspector</div>

                {consequence.immediate.length > 0 && (
                  <>
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(34,197,94,0.7)', textTransform: 'uppercase' as const }}>
                      Immediate
                    </div>
                    {consequence.immediate.map((item, i) => (
                      <div key={i} style={styles.consequenceItem}>
                        <div style={styles.bullet('rgba(34,197,94,0.7)')} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </>
                )}

                {consequence.secondOrder.length > 0 && (
                  <>
                    <div style={styles.sectionDivider} />
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(234,179,8,0.7)', textTransform: 'uppercase' as const }}>
                      Second-Order
                    </div>
                    {consequence.secondOrder.map((item, i) => (
                      <div key={i} style={styles.consequenceItem}>
                        <div style={styles.bullet('rgba(234,179,8,0.7)')} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </>
                )}

                {consequence.hiddenCosts.length > 0 && (
                  <>
                    <div style={styles.sectionDivider} />
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(239,68,68,0.75)', textTransform: 'uppercase' as const }}>
                      Hidden Costs
                    </div>
                    {consequence.hiddenCosts.map((item, i) => (
                      <div key={i} style={styles.consequenceItem}>
                        <div style={styles.bullet('rgba(239,68,68,0.65)')} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </>
                )}

                {consequence.highestLeverage && (
                  <>
                    <div style={styles.sectionDivider} />
                    <div style={{
                      padding: '9px 11px',
                      background: 'rgba(6,182,212,0.07)',
                      border: '1px solid rgba(6,182,212,0.2)',
                      borderRadius: '7px',
                      display: 'flex',
                      flexDirection: 'column' as const,
                      gap: '3px',
                    }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(6,182,212,0.7)', textTransform: 'uppercase' as const }}>
                        Highest Leverage
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'rgba(226,232,240,0.88)' }}>
                        {consequence.highestLeverage}
                      </div>
                    </div>
                  </>
                )}

                {consequence.recommendation && (
                  <div style={{
                    padding: '9px 11px',
                    background: 'rgba(167,139,250,0.07)',
                    border: '1px solid rgba(167,139,250,0.2)',
                    borderRadius: '7px',
                    display: 'flex',
                    flexDirection: 'column' as const,
                    gap: '3px',
                  }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(167,139,250,0.75)', textTransform: 'uppercase' as const }}>
                      Recommendation
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(226,232,240,0.88)', lineHeight: 1.5 }}>
                      {consequence.recommendation}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Time Ripples */}
            {timeRipples.length > 0 && (
              <div style={styles.panel}>
                <div style={styles.panelTitle}>Time Ripples</div>
                {timeRipples.map((ripple, i) => (
                  <div key={i} style={styles.rippleItem}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.73rem', color: 'rgba(226,232,240,0.82)', lineHeight: 1.4 }}>
                        {ripple.effect}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '4px' }}>
                        <div style={styles.magnitudeBar(ripple.magnitude)} />
                        <span style={{ fontSize: '0.65rem', color: 'rgba(226,232,240,0.4)', flexShrink: 0 }}>
                          {ripple.magnitude}/10
                        </span>
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(226,232,240,0.35)', marginTop: '2px' }}>
                        {ripple.category} · {ripple.timestamp}
                      </div>
                    </div>
                    <div style={{
                      padding: '2px 7px',
                      background: ripple.magnitude >= 7
                        ? 'rgba(239,68,68,0.1)'
                        : ripple.magnitude >= 4
                          ? 'rgba(234,179,8,0.1)'
                          : 'rgba(34,197,94,0.08)',
                      border: `1px solid ${ripple.magnitude >= 7
                        ? 'rgba(239,68,68,0.25)'
                        : ripple.magnitude >= 4
                          ? 'rgba(234,179,8,0.25)'
                          : 'rgba(34,197,94,0.2)'}`,
                      borderRadius: '12px',
                      fontSize: '0.67rem',
                      fontWeight: 600,
                      color: ripple.magnitude >= 7
                        ? 'rgba(239,68,68,0.8)'
                        : ripple.magnitude >= 4
                          ? 'rgba(234,179,8,0.8)'
                          : 'rgba(34,197,94,0.75)',
                      alignSelf: 'flex-start',
                      flexShrink: 0,
                    }}>
                      {ripple.magnitude >= 7 ? 'High' : ripple.magnitude >= 4 ? 'Mid' : 'Low'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* System Status — small footer */}
            <div style={{ ...styles.panel, background: 'rgba(5,5,8,0.45)', padding: '10px 14px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '8px' }}>
                {NODE_TYPES.map(t => {
                  const count = nodes.filter(n => n.type === t).length;
                  return (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem' }}>
                      <div style={{ ...styles.legendDot(NODE_COLORS[t]), width: '6px', height: '6px' }} />
                      <span style={{ color: count > 0 ? NODE_COLORS[t] : 'rgba(226,232,240,0.2)', fontWeight: count > 0 ? 600 : 400 }}>
                        {count}
                      </span>
                      <span style={{ color: 'rgba(226,232,240,0.3)' }}>{NODE_LABELS[t]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default RealityEngineChamber;
