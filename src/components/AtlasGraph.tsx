// Atlas-Audit: [EXEC-MAP] Verified — Optional `graphEntities` uses Mind Cartography API data; otherwise scaffold mock (explicit dual mode in parent).
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import { MOCK_ENTITIES } from '../constants';
import { Entity, GlobalIntelligence } from '../types';
import { Target, Activity, ShieldAlert, Zap } from 'lucide-react';

interface AtlasGraphProps {
  centerOn?: string;
  filter?: string[];
  globalIntelligence?: GlobalIntelligence;
  hideUI?: boolean;
  graphEntities?: Entity[];
  /** Controlled selection: parent renders detail UI (e.g. AtlasGraphView panel). */
  selectedEntity?: Entity | null;
  onSelectEntity?: (entity: Entity | null) => void;
}

export function AtlasGraph({
  centerOn,
  filter,
  globalIntelligence,
  hideUI,
  graphEntities,
  selectedEntity: selectedProp,
  onSelectEntity,
}: AtlasGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [internalSelected, setInternalSelected] = useState<Entity | null>(null);
  const controlled = onSelectEntity !== undefined;
  const effectiveSelected = controlled ? selectedProp ?? null : internalSelected;
  const showInternalPanel = !controlled && !hideUI;

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Create a container for the graph to allow zooming/panning
    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    const base =
      graphEntities && graphEntities.length > 0 ? graphEntities : MOCK_ENTITIES;
    let nodes = base.map((e) => ({ ...e }));
    
    // Apply filters
    if (filter && filter.length > 0) {
      nodes = nodes.filter(n => 
        filter.includes(n.id) || 
        filter.includes(n.type) || 
        filter.some(f => n.title.toLowerCase().includes(f.toLowerCase()))
      );
    }

    // Highlight trending topics from global intelligence
    if (globalIntelligence) {
      nodes.forEach((n: any) => {
        if (globalIntelligence.trendingTopics.some(t => 
          n.title.toLowerCase().includes(t.toLowerCase()) || 
          n.tags.some(tag => tag.toLowerCase().includes(t.toLowerCase()))
        )) {
          n.isTrending = true;
        }
      });
    }

    const links: any[] = [];
    nodes.forEach(node => {
      node.relationships.forEach(rel => {
        const target = nodes.find(n => n.id === rel.targetId);
        if (target) {
          links.push({ 
            source: node.id, 
            target: rel.targetId, 
            strength: rel.strength,
            recency: new Date(rel.recency).getTime(),
            type: rel.type
          });
        }
      });
    });

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance((d: any) => 220 - (d.strength * 80)))
      .force("charge", d3.forceManyBody().strength(-1200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(60));

    if (centerOn) {
      const targetNode = nodes.find(n => 
        n.id === centerOn || 
        n.title.toLowerCase().includes(centerOn.toLowerCase())
      );
      if (targetNode) {
        simulation.force("center", d3.forceCenter(width / 2, height / 2).strength(0.2));
        (targetNode as any).fx = width / 2;
        (targetNode as any).fy = height / 2;
      }
    }

    // Draw Links
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("stroke", (d: any) => {
        if (d.type === 'contradiction' || d.type === 'negative') return "#6b7280"; // Stone for friction
        const now = new Date().getTime();
        const age = now - d.recency;
        const day = 24 * 60 * 60 * 1000;
        if (age < day) return "#d4af37"; // Gold for recent
        return "#1a103c"; // Titanium for older
      })
      .attr("stroke-width", (d: any) => d.strength > 0.8 ? d.strength * 4 : d.strength * 2)
      .attr("stroke-opacity", 0)
      .attr("stroke-dasharray", (d: any) => {
        if (d.type === 'contradiction' || d.type === 'negative') return "2,4"; // Sharp dotted
        return d.type === 'influence' ? "none" : "3,6";
      })
      .attr("filter", (d: any) => d.strength > 0.8 ? "drop-shadow(0 0 4px rgba(212,175,55,0.3))" : "none");

    link.transition()
      .duration(1500)
      .delay((d, i) => i * 20)
      .attr("stroke-opacity", (d: any) => Math.min(0.2, d.strength * 0.2));

    // Draw Nodes
    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .attr("class", (d: any) => d.tension.tension > 0.7 ? "cursor-pointer animate-shiver" : "cursor-pointer")
      .attr("opacity", 0)
      .on("click", (event, d: any) => {
        if (controlled) onSelectEntity!(d);
        else setInternalSelected(d);
        event.stopPropagation();
      })
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.transition()
      .duration(1500)
      .delay((d, i) => i * 50)
      .attr("opacity", 1);

    // Node Background Glow
    node.append("circle")
      .attr("r", (d: any) => (12 + (d.tension.weight * 15)) * (d.isTrending ? 1.4 : 1))
      .attr("fill", (d: any) => d.isTrending ? "rgba(212,175,55,0.1)" : "transparent")
      .attr("stroke", (d: any) => d.isTrending ? "rgba(212,175,55,0.2)" : "transparent")
      .attr("stroke-width", 1);

    // Core Node Circle
    node.append("circle")
      .attr("r", (d: any) => (6 + (d.tension.weight * 8)) * (d.isTrending ? 1.2 : 1))
      .attr("fill", (d: any) => {
        if (d.isTrending) return "#d4af37";
        if (d.tension.tension > 0.7) return "#7f1d1d"; // Oxblood
        if (d.tension.weight > 0.7) return "#d4af37"; // Gold
        return "#0f0a1e"; // Deep Galactic
      })
      .attr("stroke", (d: any) => {
        if (effectiveSelected && d.id === effectiveSelected.id) return "#c9a227"; // signal-amber selection ring
        if (d.isTrending) return "#e2e8f0";
        if (d.epistemic?.layer === 'fact') return "#1A3D44"; // Teal for fact
        if (d.epistemic?.layer === 'inference') return "#d4af37"; // Gold for inference
        if (d.epistemic?.layer === 'speculation') return "#7f1d1d"; // Oxblood for speculation
        return "#1a103c"; // Titanium
      })
      .attr("stroke-width", (d: any) => {
        if (effectiveSelected && d.id === effectiveSelected.id) return 3;
        return d.isTrending ? 2 : 1.5;
      })
      .attr("stroke-dasharray", (d: any) => {
        if (d.epistemic?.layer === 'inference') return "3,2";
        if (d.epistemic?.layer === 'speculation') return "1,2";
        return "none";
      });

    // Node Labels
    node.append("text")
      .text((d: any) => d.title)
      .attr("x", (d: any) => (14 + (d.tension.weight * 10)))
      .attr("y", 4)
      .attr("fill", (d: any) => d.isTrending ? "#d4af37" : "#e2e8f0")
      .attr("font-size", (d: any) => d.isTrending ? "11px" : "9px")
      .attr("font-weight", (d: any) => d.isTrending ? "600" : "400")
      .attr("font-family", "Inter")
      .attr("letter-spacing", "0.05em")
      .attr("pointer-events", "none")
      .attr("class", "uppercase tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]");

    simulation.on("tick", () => {
      // Base positions updated by simulation
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Continuous Magnetic Pull animation
    const timer = d3.timer((elapsed) => {
      const time = elapsed / 1000;

      const getWaveOffset = (d: any) => {
        const clusterId = d.tags && d.tags.length > 0 ? d.tags[0].charCodeAt(0) : 0;
        return {
          x: Math.sin(time * 0.5 + clusterId) * 3,
          y: Math.cos(time * 0.5 + clusterId) * 3
        };
      };

      link
        .attr("x1", (d: any) => d.source.x + getWaveOffset(d.source).x)
        .attr("y1", (d: any) => d.source.y + getWaveOffset(d.source).y)
        .attr("x2", (d: any) => d.target.x + getWaveOffset(d.target).x)
        .attr("y2", (d: any) => d.target.y + getWaveOffset(d.target).y);

      node.attr("transform", (d: any) => {
        const offset = getWaveOffset(d);
        return `translate(${d.x + offset.x},${d.y + offset.y})`;
      });
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
      timer.stop();
    };
  }, [centerOn, filter, globalIntelligence, graphEntities, effectiveSelected?.id]);

  return (
    <div className="w-full h-full relative bg-obsidian overflow-hidden obsidian-surface">
      {!hideUI && (
        <div className="absolute top-12 left-12 z-10 space-y-2">
          <div className="flex items-center gap-3 text-gold">
            <Target size={20} />
            <h2 className="text-2xl font-serif tracking-tight text-ivory">Atlas Graph</h2>
          </div>
          <p className="instrument-label text-stone opacity-50 tracking-[0.3em]">Living Intelligence Map</p>
        </div>
      )}

      <AnimatePresence>
        {showInternalPanel && internalSelected && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-12 right-12 z-20 w-80 glass-panel p-8 space-y-6 border-signal-amber/15 gold-glow"
          >
            <div className="flex items-center justify-between">
              <span className="instrument-label text-signal-amber">{internalSelected.type}</span>
              <button
                type="button"
                onClick={() => setInternalSelected(null)}
                className="text-stone hover:text-ivory transition-colors"
              >
                <ShieldAlert size={16} />
              </button>
            </div>
            <h3 className="text-2xl font-serif text-ivory">{internalSelected.title}</h3>
            <p className="text-xs text-stone leading-relaxed font-sans opacity-80">{internalSelected.description}</p>

            <div className="pt-6 border-t border-titanium/20 space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between instrument-label text-stone">
                  <span>Truth Resonance</span>
                  <span className="text-signal-amber">{(internalSelected.tension.truth * 100).toFixed(0)}%</span>
                </div>
                <div className="h-px bg-titanium/20 w-full relative">
                  <div
                    className="absolute inset-y-0 left-0 bg-signal-amber/35"
                    style={{ width: `${internalSelected.tension.truth * 100}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between instrument-label text-stone">
                  <span>Strategic Weight</span>
                  <span className="text-signal-amber">{(internalSelected.tension.weight * 100).toFixed(0)}%</span>
                </div>
                <div className="h-px bg-titanium/20 w-full relative">
                  <div
                    className="absolute inset-y-0 left-0 bg-signal-amber/35"
                    style={{ width: `${internalSelected.tension.weight * 100}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between instrument-label text-stone">
                  <span>Systemic Tension</span>
                  <span className="text-drift-crimson">{(internalSelected.tension.tension * 100).toFixed(0)}%</span>
                </div>
                <div className="h-px bg-titanium/20 w-full relative">
                  <div
                    className="absolute inset-y-0 left-0 bg-drift-crimson/35"
                    style={{ width: `${internalSelected.tension.tension * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-4">
              {internalSelected.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] px-2 py-0.5 bg-titanium/20 text-stone rounded-full uppercase tracking-widest border border-titanium/30"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="absolute bottom-12 right-12 z-10 flex gap-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full border border-teal-500" />
          <span className="instrument-label text-stone">Fact</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full border border-dashed border-gold" />
          <span className="instrument-label text-stone">Inference</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full border border-dotted border-oxblood" />
          <span className="instrument-label text-stone">Speculation</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-oxblood shadow-[0_0_8px_rgba(93,39,50,0.6)]" />
          <span className="instrument-label text-stone">High Tension</span>
        </div>
      </div>

      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}
