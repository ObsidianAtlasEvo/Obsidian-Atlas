import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Globe, 
  Zap, 
  Target, 
  Activity, 
  Map, 
  TrendingUp, 
  AlertCircle, 
  ArrowRight,
  ChevronRight,
  Network,
  Compass,
  Layers,
  History,
  Clock,
  ExternalLink,
  Search,
  Plus
} from 'lucide-react';
import { AppState, RealityEngineModel } from '../types';
import { cn } from '../lib/utils';

interface RealityEngineProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function RealityEngine({ state, setState }: RealityEngineProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isAddingNode, setIsAddingNode] = useState(false);
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [newNodeType, setNewNodeType] = useState<'goal' | 'project' | 'relationship' | 'habit' | 'constraint' | 'leverage' | 'bottleneck'>('project');
  const [newNodeImportance, setNewNodeImportance] = useState(5);

  const selectedNode = state.realityEngine.systemNodes.find(n => n.id === selectedNodeId);

  const handleAddNode = () => {
    if (!newNodeLabel.trim()) return;

    const newNodeId = `node-${Date.now()}`;
    
    setState(prev => ({
      ...prev,
      realityEngine: {
        ...prev.realityEngine,
        systemNodes: [
          ...prev.realityEngine.systemNodes,
          {
            id: newNodeId,
            label: newNodeLabel,
            type: newNodeType,
            importance: newNodeImportance,
            connections: []
          }
        ]
      }
    }));

    setNewNodeLabel('');
    setNewNodeType('project');
    setNewNodeImportance(5);
    setIsAddingNode(false);
  };

  const handleExecuteStrategy = () => {
    setState(prev => ({
      ...prev,
      realityEngine: {
        ...prev.realityEngine,
        timeRipples: [
          {
            id: `ripple-${Date.now()}`,
            timestamp: new Date().toISOString(),
            effect: `Executed strategy: ${prev.realityEngine.consequenceInspector.highestLeverage}`,
            magnitude: 8,
            category: 'action'
          },
          ...prev.realityEngine.timeRipples
        ]
      }
    }));
  };

  return (
    <div className="h-full flex flex-col gap-8 p-8 overflow-y-auto custom-scrollbar bg-obsidian">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 text-emerald-400">
          <Globe size={24} />
          <h1 className="text-3xl font-serif text-ivory tracking-tight">Reality Engine</h1>
        </div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-stone opacity-60">
          Mapping the systems, consequences, and ripples of your world
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        {/* Left Column: Systems Map (Cartographic View) */}
        <div className="lg:col-span-8 space-y-8">
          <div className="glass-panel p-8 min-h-[500px] relative overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-[0.3em]">Systems Map</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">The interconnected architecture of your current reality</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-titanium/5 border border-titanium/10 rounded-sm">
                  <Search size={12} className="text-stone" />
                  <input 
                    type="text" 
                    placeholder="Search nodes..." 
                    className="bg-transparent border-none outline-none text-[10px] text-ivory uppercase tracking-widest placeholder:text-stone/40 w-32"
                  />
                </div>
                <button 
                  onClick={() => setIsAddingNode(!isAddingNode)}
                  className="p-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-sm transition-all"
                >
                  <Plus size={16} />
                </button>
                <Network size={16} className="text-emerald-400 opacity-40" />
              </div>
            </div>

            <AnimatePresence>
              {isAddingNode && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden mb-8"
                >
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={newNodeLabel}
                      onChange={(e) => setNewNodeLabel(e.target.value)}
                      placeholder="Node Label..."
                      className="flex-1 bg-obsidian/40 border border-titanium/10 rounded-sm p-3 text-xs text-ivory placeholder:text-stone/40 focus:border-emerald-500/50 outline-none"
                    />
                    <select
                      value={newNodeType}
                      onChange={(e) => setNewNodeType(e.target.value as any)}
                      className="bg-obsidian/40 border border-titanium/10 rounded-sm p-3 text-xs text-ivory outline-none focus:border-emerald-500/50"
                    >
                      <option value="goal">Goal</option>
                      <option value="project">Project</option>
                      <option value="relationship">Relationship</option>
                      <option value="habit">Habit</option>
                      <option value="constraint">Constraint</option>
                      <option value="leverage">Leverage</option>
                      <option value="bottleneck">Bottleneck</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-stone uppercase tracking-widest">Importance ({newNodeImportance})</span>
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={newNodeImportance}
                      onChange={(e) => setNewNodeImportance(parseInt(e.target.value))}
                      className="flex-1 accent-emerald-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setIsAddingNode(false)}
                      className="px-4 py-2 text-[10px] uppercase tracking-widest text-stone hover:text-ivory transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleAddNode}
                      className="px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] uppercase tracking-widest rounded-sm transition-colors"
                    >
                      Add Node
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cartographic Field */}
            <div className="flex-1 relative bg-obsidian/40 border border-titanium/10 rounded-sm overflow-hidden">
              {/* Grid Background */}
              <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #10b981 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
              
              {/* Nodes and Connections */}
              <div className="absolute inset-0 flex items-center justify-center">
                {state.realityEngine.systemNodes.map((node, index) => {
                  const angle = (index * (360 / state.realityEngine.systemNodes.length)) * (Math.PI / 180);
                  const radius = 180;
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;

                  return (
                    <motion.div
                      key={node.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute cursor-pointer group"
                      style={{ x, y }}
                      onClick={() => setSelectedNodeId(node.id)}
                    >
                      <div className={cn(
                        "relative flex flex-col items-center gap-2 transition-all duration-500",
                        selectedNodeId === node.id ? "scale-110" : "opacity-60 hover:opacity-100"
                      )}>
                        <div className={cn(
                          "w-12 h-12 rounded-sm border flex items-center justify-center transition-all duration-500 rotate-45",
                          selectedNodeId === node.id 
                            ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.2)]" 
                            : "bg-titanium/5 border-titanium/20"
                        )}>
                          <div className="-rotate-45">
                            <Target size={16} className={cn(
                              selectedNodeId === node.id ? "text-emerald-400" : "text-stone"
                            )} />
                          </div>
                        </div>
                        <span className="text-[8px] font-mono text-ivory text-center uppercase tracking-widest font-bold">{node.label}</span>
                      </div>

                      {/* Connection Lines */}
                      {node.connections.map(conn => {
                        const targetIndex = state.realityEngine.systemNodes.findIndex(n => n.id === conn.targetId);
                        if (targetIndex === -1) return null;
                        const targetAngle = (targetIndex * (360 / state.realityEngine.systemNodes.length)) * (Math.PI / 180);
                        const targetX = Math.cos(targetAngle) * radius;
                        const targetY = Math.sin(targetAngle) * radius;
                        
                        const dx = targetX - x;
                        const dy = targetY - y;
                        const distance = Math.sqrt(dx*dx + dy*dy);
                        const angleLine = Math.atan2(dy, dx);

                        return (
                          <div 
                            key={`${node.id}-${conn.targetId}`}
                            className={cn(
                              "absolute top-1/2 left-1/2 h-px origin-left -z-10 transition-all duration-500",
                              conn.type === 'positive' ? "bg-emerald-500/20" : conn.type === 'negative' ? "bg-oxblood/20" : "bg-titanium/10"
                            )}
                            style={{ 
                              width: distance,
                              transform: `rotate(${angleLine}rad)`,
                              left: '24px',
                              top: '24px'
                            }}
                          />
                        );
                      })}
                    </motion.div>
                  );
                })}
              </div>

              {/* Node Detail Overlay */}
              <AnimatePresence>
                {selectedNode && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="absolute top-8 right-8 w-64 glass-panel p-6 border-emerald-500/20 bg-emerald-500/5 z-20"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em]">{selectedNode.label}</h4>
                      <button onClick={() => setSelectedNodeId(null)} className="text-stone hover:text-ivory">
                        <ArrowRight size={12} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Type</span>
                        <p className="text-[10px] text-ivory uppercase tracking-widest">{selectedNode.type}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Importance</span>
                        <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${selectedNode.importance * 10}%` }} />
                        </div>
                      </div>
                      <div className="pt-4 border-t border-titanium/10 space-y-2">
                        <span className="text-[8px] font-mono uppercase tracking-widest text-stone">Connections</span>
                        <div className="space-y-1">
                          {selectedNode.connections.map(conn => (
                            <div key={conn.targetId} className="flex items-center justify-between text-[9px] text-stone">
                              <span>{state.realityEngine.systemNodes.find(n => n.id === conn.targetId)?.label}</span>
                              <span className={cn(
                                conn.type === 'positive' ? "text-emerald-400" : "text-oxblood"
                              )}>{conn.strength * 10}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Lower Left: Time Ripples */}
          <div className="glass-panel p-8 space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-[0.3em]">Time Ripples</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Consequence propagation across the timeline</p>
              </div>
              <Clock size={16} className="text-emerald-400 opacity-40" />
            </div>

            <div className="relative space-y-6 pl-6 border-l border-titanium/10">
              {state.realityEngine.timeRipples.map((ripple, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[29px] top-1 w-2 h-2 rounded-full bg-emerald-500/40 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-mono uppercase tracking-widest text-stone">{ripple.timestamp}</span>
                      <span className="text-[8px] font-mono uppercase tracking-widest text-emerald-400/60">{ripple.category}</span>
                    </div>
                    <p className="text-[11px] text-ivory opacity-80 leading-relaxed">{ripple.effect}</p>
                    <div className="h-0.5 bg-titanium/5 rounded-full overflow-hidden w-24">
                      <div className="h-full bg-emerald-500/30" style={{ width: `${ripple.magnitude * 10}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Consequence Inspector */}
        <div className="lg:col-span-4 space-y-8">
          <div className="glass-panel p-8 space-y-8 border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-[0.3em]">Consequence Inspector</h3>
                <p className="text-[10px] text-stone uppercase tracking-widest opacity-40">Deep analysis of your current trajectory</p>
              </div>
              <AlertCircle size={16} className="text-emerald-400 opacity-40" />
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Immediate Impact</span>
                <div className="space-y-2">
                  {state.realityEngine.consequenceInspector.immediate.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-obsidian/40 border border-titanium/10 rounded-sm">
                      <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5" />
                      <p className="text-[10px] text-ivory opacity-80">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Second-Order Effects</span>
                <div className="space-y-2">
                  {state.realityEngine.consequenceInspector.secondOrder.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-obsidian/40 border border-titanium/10 rounded-sm">
                      <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 animate-pulse" />
                      <p className="text-[10px] text-ivory opacity-80">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Hidden Costs</span>
                <div className="space-y-2">
                  {state.realityEngine.consequenceInspector.hiddenCosts.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-oxblood/5 border border-oxblood/10 rounded-sm">
                      <div className="w-1 h-1 rounded-full bg-oxblood mt-1.5" />
                      <p className="text-[10px] text-stone opacity-80">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-8 border-t border-titanium/10 space-y-6">
                <div className="space-y-2">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400">Highest Leverage Move</span>
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-sm">
                    <p className="text-xs font-bold text-ivory uppercase tracking-widest leading-relaxed">
                      {state.realityEngine.consequenceInspector.highestLeverage}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone">Strategic Recommendation</span>
                  <p className="text-[11px] text-stone italic leading-relaxed">
                    {state.realityEngine.consequenceInspector.recommendation}
                  </p>
                </div>

                <button 
                  onClick={handleExecuteStrategy}
                  className="w-full py-4 bg-emerald-500 text-obsidian hover:bg-emerald-400 transition-all text-[10px] font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-2"
                >
                  Execute Strategy <ExternalLink size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
