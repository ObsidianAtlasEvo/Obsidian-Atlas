import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppState } from '../types';
import { cn } from '../lib/utils';
import { 
  Waves, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  GitBranch, 
  BookOpen, 
  Target, 
  ShieldAlert, 
  Activity, 
  Layers,
  ArrowDownToLine,
  ArrowRight,
  Eye,
  Microscope,
  Compass,
  AlertTriangle,
  Scale,
  BrainCircuit,
  MessageSquare,
  History,
  Save,
  Archive,
  Globe
} from 'lucide-react';

interface LeviathanModeProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

type InquiryState = 'root' | 'active-descent' | 'theory-test' | 'comparative' | 'archived';
type GroundLevel = 'strong' | 'partial' | 'indirect' | 'analogy' | 'contested' | 'weak' | 'none' | 'untestable';

interface TheoryNode {
  id: string;
  title: string;
  description: string;
  type: 'established' | 'emerging' | 'fringe' | 'unsupported' | 'historical' | 'user';
  ground: GroundLevel;
  support: string[];
  objections: string[];
  adjacent: string[];
}

interface Branch {
  id: string;
  title: string;
  type: 'deepening' | 'comparative' | 'contradiction' | 'theory' | 'historical' | 'application' | 'adversarial' | 'adjacent' | 'unresolved';
  depth: number;
  content: string;
  theories: TheoryNode[];
  isResolved: boolean;
}

export function LeviathanMode({ state, setState }: LeviathanModeProps) {
  const [inquiryState, setInquiryState] = useState<InquiryState>('root');
  const [rootQuestion, setRootQuestion] = useState('');
  const [isDescending, setIsDescending] = useState(false);
  
  // Mock data for the descent
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [userTheory, setUserTheory] = useState('');

  const handleStartDescent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rootQuestion.trim()) return;
    
    setIsDescending(true);
    setTimeout(() => {
      setInquiryState('active-descent');
      setBranches([
        {
          id: 'b1',
          title: 'Foundational Architecture',
          type: 'deepening',
          depth: 1,
          content: 'The current understanding suggests that this phenomenon is driven by systemic incentives rather than individual actors. The core mechanism relies on distributed consensus protocols that enforce behavior through economic penalties.',
          isResolved: false,
          theories: [
            {
              id: 't1',
              title: 'Incentive-Driven Consensus',
              description: 'Actors behave predictably when economic penalties exceed potential gains from defection.',
              type: 'established',
              ground: 'strong',
              support: ['Game theory models', 'Historical market data'],
              objections: ['Assumes perfect rationality', 'Ignores ideological motivation'],
              adjacent: ['Nash Equilibrium', 'Mechanism Design']
            },
            {
              id: 't2',
              title: 'Ideological Contagion',
              description: 'Behavior is driven by mimetic desire and social signaling, overriding economic rationality.',
              type: 'emerging',
              ground: 'partial',
              support: ['Network analysis of social clusters', 'Anomalous market events'],
              objections: ['Difficult to quantify', 'Often post-hoc rationalization'],
              adjacent: ['Mimetic Theory', 'Behavioral Economics']
            }
          ]
        }
      ]);
      setActiveBranchId('b1');
      setIsDescending(false);
    }, 1500);
  };

  const getGroundColor = (ground: GroundLevel) => {
    switch (ground) {
      case 'strong': return 'text-teal border-teal/30 bg-teal/10';
      case 'partial': return 'text-gold border-gold/30 bg-gold/10';
      case 'indirect': return 'text-blue-400 border-blue-400/30 bg-blue-400/10';
      case 'analogy': return 'text-purple-400 border-purple-400/30 bg-purple-400/10';
      case 'contested': return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
      case 'weak': return 'text-oxblood border-oxblood/30 bg-oxblood/10';
      case 'none': return 'text-stone border-stone/30 bg-stone/10';
      case 'untestable': return 'text-stone opacity-50 border-stone/20 bg-transparent border-dashed';
      default: return 'text-stone border-stone/30 bg-stone/10';
    }
  };

  const getTheoryIcon = (type: TheoryNode['type']) => {
    switch (type) {
      case 'established': return <Scale size={14} />;
      case 'emerging': return <Activity size={14} />;
      case 'fringe': return <Eye size={14} />;
      case 'unsupported': return <AlertTriangle size={14} />;
      case 'historical': return <History size={14} />;
      case 'user': return <Target size={14} />;
      default: return <BrainCircuit size={14} />;
    }
  };

  const renderLeftRail = () => (
    <div className="w-64 border-r border-titanium/20 bg-obsidian/50 flex flex-col h-full">
      <div className="p-6 border-b border-titanium/20">
        <div className="flex items-center gap-3 text-ivory mb-2">
          <Waves size={20} className="text-teal" />
          <h2 className="font-serif text-lg tracking-widest uppercase">Leviathan</h2>
        </div>
        <p className="text-[10px] font-mono text-stone uppercase tracking-widest mb-4">Deep Inquiry Chamber</p>
        <div className="flex items-center gap-2 px-2 py-1 bg-teal/5 border border-teal/20 rounded-sm">
          <Globe size={10} className="text-teal" />
          <span className="text-[8px] uppercase tracking-widest text-teal font-bold">Supreme Gathering Active</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-6">
        {inquiryState !== 'root' && (
          <div className="space-y-3">
            <h3 className="text-[10px] font-mono text-stone uppercase tracking-widest">Current Descent</h3>
            <div className="p-3 bg-titanium/5 border border-titanium/20 rounded-sm">
              <p className="text-sm text-ivory font-serif line-clamp-3">{rootQuestion}</p>
            </div>
            <button 
              onClick={() => setInquiryState('root')}
              className="text-[10px] text-stone hover:text-ivory uppercase tracking-widest flex items-center gap-1 transition-colors"
            >
              <ArrowDownToLine size={12} className="rotate-180" /> Return to Root
            </button>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-[10px] font-mono text-stone uppercase tracking-widest">Active Branches</h3>
          <div className="space-y-1">
            {branches.map(branch => (
              <button
                key={branch.id}
                onClick={() => setActiveBranchId(branch.id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs transition-all border-l-2 flex items-center justify-between group",
                  activeBranchId === branch.id 
                    ? "border-teal text-ivory bg-teal/5" 
                    : "border-transparent text-stone hover:text-ivory hover:bg-titanium/5"
                )}
              >
                <span className="truncate pr-2">{branch.title}</span>
                <GitBranch size={12} className={activeBranchId === branch.id ? "text-teal" : "opacity-0 group-hover:opacity-50"} />
              </button>
            ))}
            {branches.length === 0 && (
              <p className="text-xs text-stone opacity-50 italic px-3">No active branches</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-mono text-stone uppercase tracking-widest">Saved Descents</h3>
          <div className="space-y-2">
            <div className="text-xs text-stone hover:text-ivory cursor-pointer flex items-center gap-2 px-3 py-1.5 transition-colors">
              <Archive size={12} /> The Nature of Sovereignty
            </div>
            <div className="text-xs text-stone hover:text-ivory cursor-pointer flex items-center gap-2 px-3 py-1.5 transition-colors">
              <Archive size={12} /> Limits of Formal Logic
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderRightRail = () => {
    const activeBranch = branches.find(b => b.id === activeBranchId);
    
    return (
      <div className="w-72 border-l border-titanium/20 bg-obsidian/50 flex flex-col h-full">
        <div className="p-6 border-b border-titanium/20">
          <h3 className="text-[10px] font-mono text-stone uppercase tracking-widest mb-4">Structural Intelligence</h3>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone">Evidence Strength</span>
                <span className="text-teal">High</span>
              </div>
              <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                <div className="h-full bg-teal w-[75%]" />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone">Disagreement Level</span>
                <span className="text-oxblood">Significant</span>
              </div>
              <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                <div className="h-full bg-oxblood w-[60%]" />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-stone">Speculative Load</span>
                <span className="text-gold">Moderate</span>
              </div>
              <div className="h-1 bg-titanium/10 rounded-full overflow-hidden">
                <div className="h-full bg-gold w-[40%]" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8">
          {activeBranch && (
            <>
              <div className="space-y-3">
                <h4 className="text-[10px] font-mono text-stone uppercase tracking-widest flex items-center gap-2">
                  <Target size={12} /> Proof-Ground Status
                </h4>
                <div className="space-y-2">
                  {activeBranch.theories.map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span className="text-ivory truncate pr-2" title={t.title}>{t.title}</span>
                      <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border", getGroundColor(t.ground))}>
                        {t.ground}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-mono text-stone uppercase tracking-widest flex items-center gap-2">
                  <Layers size={12} /> Related Frameworks
                </h4>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] px-2 py-1 bg-titanium/5 border border-titanium/20 text-stone rounded">Game Theory</span>
                  <span className="text-[10px] px-2 py-1 bg-titanium/5 border border-titanium/20 text-stone rounded">Mimetic Desire</span>
                  <span className="text-[10px] px-2 py-1 bg-titanium/5 border border-titanium/20 text-stone rounded">Network Effects</span>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-mono text-stone uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert size={12} /> Risk of Overextension
                </h4>
                <p className="text-xs text-stone leading-relaxed">
                  Current branch relies heavily on rational actor models. Risk of ignoring irrational contagion effects is high.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderRootState = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-12 max-w-3xl mx-auto w-full">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full space-y-8 text-center"
      >
        <div className="mx-auto w-16 h-16 rounded-full bg-teal/5 border border-teal/20 flex items-center justify-center mb-8">
          <Waves size={32} className="text-teal" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-4xl font-serif text-ivory tracking-tight">The Deep Descent</h1>
          <p className="text-stone font-sans text-lg max-w-xl mx-auto leading-relaxed">
            Enter a subject, theory, anomaly, or contradiction. Atlas will pursue the outer limits of understanding while remaining loyal to truth, evidence, and epistemic honesty.
          </p>
        </div>

        <form onSubmit={handleStartDescent} className="relative max-w-2xl mx-auto w-full mt-12">
          <div className="absolute inset-0 bg-teal/5 blur-xl rounded-full" />
          <div className="relative flex items-center bg-obsidian border border-teal/30 rounded-lg p-2 focus-within:border-teal/60 focus-within:ring-1 focus-within:ring-teal/30 transition-all shadow-2xl">
            <Search size={20} className="text-teal/50 ml-3" />
            <input
              type="text"
              value={rootQuestion}
              onChange={(e) => setRootQuestion(e.target.value)}
              placeholder="What do you want to descend into?"
              className="flex-1 bg-transparent border-none text-ivory text-lg px-4 py-3 focus:outline-none placeholder:text-stone/40 font-serif"
              autoFocus
            />
            <button 
              type="submit"
              disabled={!rootQuestion.trim() || isDescending}
              className="bg-teal/10 hover:bg-teal/20 text-teal px-6 py-3 rounded-md text-sm font-mono uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isDescending ? 'Descending...' : 'Descend'} <ArrowDownToLine size={16} />
            </button>
          </div>
        </form>

        <div className="grid grid-cols-2 gap-4 mt-16 text-left max-w-2xl mx-auto">
          <div className="p-4 border border-titanium/10 bg-titanium/5 rounded-sm hover:border-titanium/30 cursor-pointer transition-colors" onClick={() => setRootQuestion("What is the deep structure of power and authority in decentralized networks?")}>
            <h4 className="text-sm font-serif text-ivory mb-1">Power in Decentralization</h4>
            <p className="text-xs text-stone">Explore the deep structure of authority.</p>
          </div>
          <div className="p-4 border border-titanium/10 bg-titanium/5 rounded-sm hover:border-titanium/30 cursor-pointer transition-colors" onClick={() => setRootQuestion("Why do highly intelligent people consistently fall for specific types of self-deception?")}>
            <h4 className="text-sm font-serif text-ivory mb-1">Intelligent Self-Deception</h4>
            <p className="text-xs text-stone">Analyze cognitive failure modes.</p>
          </div>
        </div>
      </motion.div>
    </div>
  );

  const renderActiveDescent = () => {
    const activeBranch = branches.find(b => b.id === activeBranchId);
    if (!activeBranch) return null;

    return (
      <div className="flex-1 overflow-y-auto no-scrollbar p-12 max-w-4xl mx-auto w-full space-y-16 pb-32">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-titanium/10 border border-titanium/20 rounded-full text-[10px] font-mono text-stone uppercase tracking-widest">
            <ArrowDownToLine size={12} /> Depth Level {activeBranch.depth}
          </div>
          <h2 className="text-3xl font-serif text-ivory leading-tight">{rootQuestion}</h2>
        </motion.div>

        {/* Direct Answer / Current Best Reading */}
        <div className="space-y-4">
          <h3 className="text-xs font-mono text-teal uppercase tracking-widest flex items-center gap-2">
            <Compass size={14} /> Current Best Synthesis
          </h3>
          <div className="p-8 bg-teal/5 border border-teal/20 rounded-sm">
            <p className="text-lg text-ivory font-serif leading-relaxed">
              {activeBranch.content}
            </p>
          </div>
        </div>

        {/* Serious Theories in the Space */}
        <div className="space-y-6">
          <h3 className="text-xs font-mono text-stone uppercase tracking-widest flex items-center gap-2">
            <Microscope size={14} /> Serious Theories in the Space
          </h3>
          <div className="grid grid-cols-1 gap-6">
            {activeBranch.theories.map(theory => (
              <div key={theory.id} className="border border-titanium/20 bg-obsidian p-6 rounded-sm space-y-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-ivory", theory.type === 'established' ? 'font-bold' : 'font-medium')}>
                        {theory.title}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-stone px-2 py-0.5 bg-titanium/10 rounded flex items-center gap-1">
                        {getTheoryIcon(theory.type)} {theory.type}
                      </span>
                    </div>
                    <p className="text-sm text-stone leading-relaxed">{theory.description}</p>
                  </div>
                  <span className={cn("text-[10px] uppercase tracking-widest px-2 py-1 rounded border whitespace-nowrap ml-4", getGroundColor(theory.ground))}>
                    Ground: {theory.ground}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-titanium/10">
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-mono text-teal uppercase tracking-widest">Strongest Support</h5>
                    <ul className="space-y-1">
                      {theory.support.map((s, i) => (
                        <li key={i} className="text-xs text-stone flex items-start gap-2">
                          <span className="text-teal mt-0.5">•</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-mono text-oxblood uppercase tracking-widest">Where It Breaks</h5>
                    <ul className="space-y-1">
                      {theory.objections.map((o, i) => (
                        <li key={i} className="text-xs text-stone flex items-start gap-2">
                          <span className="text-oxblood mt-0.5">•</span> {o}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                
                <div className="pt-4 flex justify-end">
                  <button className="text-[10px] font-mono text-stone hover:text-ivory uppercase tracking-widest flex items-center gap-1 transition-colors">
                    Compare <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User Theory Submission */}
        <div className="space-y-4 pt-8 border-t border-titanium/10">
          <h3 className="text-xs font-mono text-gold uppercase tracking-widest flex items-center gap-2">
            <Target size={14} /> Pressure-Test Your Theory
          </h3>
          <div className="p-6 border border-gold/20 bg-gold/5 rounded-sm space-y-4">
            <p className="text-sm text-stone">Submit your own model, suspicion, or framework for rigorous testing against known evidence and existing theories.</p>
            <textarea
              value={userTheory}
              onChange={(e) => setUserTheory(e.target.value)}
              placeholder="I suspect that..."
              className="w-full bg-obsidian border border-titanium/30 rounded p-4 text-ivory text-sm focus:outline-none focus:border-gold/50 min-h-[120px] resize-y font-serif"
            />
            <div className="flex justify-end">
              <button 
                disabled={!userTheory.trim()}
                className="bg-gold/10 hover:bg-gold/20 text-gold px-4 py-2 rounded text-xs font-mono uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                Submit for Testing
              </button>
            </div>
          </div>
        </div>

        {/* Predicted Follow-ups */}
        <div className="space-y-6 pt-12">
          <h3 className="text-xs font-mono text-stone uppercase tracking-widest flex items-center gap-2">
            <ArrowDownToLine size={14} /> Descend Further
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="p-4 border border-titanium/20 bg-titanium/5 hover:bg-titanium/10 hover:border-teal/30 transition-all text-left group rounded-sm flex flex-col justify-between min-h-[100px]">
              <span className="text-sm text-ivory font-serif group-hover:text-teal transition-colors">What is the exact mechanism of ideological contagion?</span>
              <span className="text-[10px] font-mono text-stone uppercase tracking-widest mt-4">Deeper Question</span>
            </button>
            <button className="p-4 border border-titanium/20 bg-titanium/5 hover:bg-titanium/10 hover:border-teal/30 transition-all text-left group rounded-sm flex flex-col justify-between min-h-[100px]">
              <span className="text-sm text-ivory font-serif group-hover:text-teal transition-colors">Where does the rational actor model fail most consistently?</span>
              <span className="text-[10px] font-mono text-stone uppercase tracking-widest mt-4">Contradiction</span>
            </button>
            <button className="p-4 border border-titanium/20 bg-titanium/5 hover:bg-titanium/10 hover:border-teal/30 transition-all text-left group rounded-sm flex flex-col justify-between min-h-[100px]">
              <span className="text-sm text-ivory font-serif group-hover:text-teal transition-colors">How do economic penalties lose their deterrent effect?</span>
              <span className="text-[10px] font-mono text-stone uppercase tracking-widest mt-4">Mechanism</span>
            </button>
          </div>

          <h3 className="text-xs font-mono text-stone uppercase tracking-widest flex items-center gap-2 pt-6">
            <GitBranch size={14} /> Adjacent Paths
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button className="p-4 border border-titanium/20 bg-titanium/5 hover:bg-titanium/10 hover:border-blue-400/30 transition-all text-left group rounded-sm flex flex-col justify-between min-h-[80px]">
              <span className="text-sm text-ivory font-serif group-hover:text-blue-400 transition-colors">Historical parallels in religious schisms</span>
              <span className="text-[10px] font-mono text-stone uppercase tracking-widest mt-2">Historical Branch</span>
            </button>
            <button className="p-4 border border-titanium/20 bg-titanium/5 hover:bg-titanium/10 hover:border-purple-400/30 transition-all text-left group rounded-sm flex flex-col justify-between min-h-[80px]">
              <span className="text-sm text-ivory font-serif group-hover:text-purple-400 transition-colors">Epidemiological models of idea spread</span>
              <span className="text-[10px] font-mono text-stone uppercase tracking-widest mt-2">Cross-Disciplinary</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full bg-obsidian overflow-hidden">
      {renderLeftRail()}
      
      <div className="flex-1 relative flex flex-col">
        {/* Background Atmosphere */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-30">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(20,184,166,0.05),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(0,0,0,0.8),transparent_100%)]" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {inquiryState === 'root' ? (
              <motion.div 
                key="root"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex-1 flex"
              >
                {renderRootState()}
              </motion.div>
            ) : (
              <motion.div 
                key="descent"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 flex overflow-hidden"
              >
                {renderActiveDescent()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Lower Branch Layer - Descent Trail */}
        {inquiryState !== 'root' && (
          <div className="h-16 border-t border-titanium/20 bg-obsidian/80 backdrop-blur-md flex items-center px-6 z-20">
            <div className="flex items-center gap-2 text-xs font-mono text-stone uppercase tracking-widest overflow-x-auto no-scrollbar whitespace-nowrap">
              <span className="text-ivory">Root</span>
              <ChevronRight size={12} className="opacity-50" />
              <span className="text-teal">Foundational Architecture</span>
            </div>
          </div>
        )}
      </div>

      {inquiryState !== 'root' && renderRightRail()}
    </div>
  );
}
