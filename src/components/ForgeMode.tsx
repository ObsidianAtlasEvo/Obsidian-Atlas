import React from 'react';
import { Hammer, FileText, Users, Sliders, CheckCircle2, AlertTriangle, Sparkles, Languages } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

const FORGE_CONTENT: Record<string, { title: string; content: { text: string; type: 'fact' | 'inference' | 'hypothesis' }[]; confidence: number; warning: string }> = {
  executive: {
    title: "Executive Summary: MicroRGB Strategic Positioning",
    content: [
      { text: "MicroRGB utilizes inorganic materials to achieve 3x the peak brightness of standard OLED.", type: 'fact' },
      { text: "This technology eliminates 'burn-in' concerns, providing a 10-year reliability window.", type: 'fact' },
      { text: "The transition to MicroRGB represents a fundamental shift in our premium display strategy.", type: 'inference' },
      { text: "Current price premiums are justified by the long-term reliability and visual fidelity.", type: 'hypothesis' }
    ],
    confidence: 94,
    warning: "Conflicting reports on Q3 supply chain stability."
  },
  expert: {
    title: "Technical Deep-Dive: MicroRGB Sub-pixel Architecture",
    content: [
      { text: "MicroRGB implementation utilizes a non-pentile sub-pixel arrangement.", type: 'fact' },
      { text: "The backplane transition to LTPO 4.0 allows for variable refresh rates down to 0.1Hz.", type: 'fact' },
      { text: "Passive vapor chambers integrated into the substrate manage thermal loads up to 4000 nits.", type: 'fact' },
      { text: "Non-pentile layouts significantly increase effective PPI and eliminate color fringing.", type: 'inference' },
      { text: "LTPO 4.0 will likely become the industry standard for ultra-low power consumption.", type: 'hypothesis' }
    ],
    confidence: 98,
    warning: "Thermal throttling observed in early Rev.A prototypes."
  },
  general: {
    title: "Understanding MicroRGB: The Next Generation of Screens",
    content: [
      { text: "MicroRGB combines the perfect blacks of OLED with high-end TV brightness.", type: 'fact' },
      { text: "It is more durable and energy-efficient than previous screen technologies.", type: 'fact' },
      { text: "For the average user, this means a screen that is easier to read in direct sunlight.", type: 'inference' },
      { text: "MicroRGB is the biggest upgrade to screens in a decade.", type: 'hypothesis' }
    ],
    confidence: 92,
    warning: "Initial consumer pricing may be significantly higher than OLED."
  },
  skeptical: {
    title: "Adversarial Analysis: MicroRGB Adoption Risks",
    content: [
      { text: "Manufacturing yield for MicroRGB remains below 40% in current facilities.", type: 'fact' },
      { text: "Competitor 'Lumina' has filed 12 patents challenging our sub-pixel layout.", type: 'fact' },
      { text: "Mass-market availability is likely at least 24 months away due to low yields.", type: 'inference' },
      { text: "MiniLED technology might catch up in brightness at a fraction of the cost.", type: 'hypothesis' }
    ],
    confidence: 85,
    warning: "Competitor 'Lumina' has filed 12 patents challenging our sub-pixel layout."
  },
  persuasive: {
    title: "The Case for MicroRGB: Defining the Future",
    content: [
      { text: "Early adoption will secure our supply chain dominance and set industry standards.", type: 'inference' },
      { text: "This technology positions us as the only brand delivering true-to-life visual experiences.", type: 'inference' },
      { text: "This is our 'iPhone moment' for display tech, defining the next frontier.", type: 'hypothesis' },
      { text: "Immediate $2B capital expenditure is required for fabrication facilities.", type: 'fact' }
    ],
    confidence: 88,
    warning: "Requires immediate $2B capital expenditure for fabrication facilities."
  }
};

export function ForgeMode() {
  const [audience, setAudience] = React.useState('executive');
  const activeContent = FORGE_CONTENT[audience] || FORGE_CONTENT.executive;

  return (
    <div className="h-full flex flex-col">
      <header className="p-6 border-b border-titanium flex items-center justify-between bg-obsidian/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 text-gold">
          <Hammer size={20} />
          <h2 className="text-lg font-medium tracking-tight">The Forge</h2>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex bg-titanium/30 p-1 rounded border border-titanium/50">
            {Object.keys(FORGE_CONTENT).map((mode) => (
              <button
                key={mode}
                onClick={() => setAudience(mode)}
                className={cn(
                  "px-3 py-1 text-[10px] uppercase tracking-widest rounded transition-all",
                  audience === mode ? "bg-gold text-obsidian font-bold" : "text-stone hover:text-ivory"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className="h-8 w-px bg-titanium mx-2" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stone uppercase">Tone</span>
            <select className="bg-titanium/30 border border-titanium/50 text-[10px] text-ivory rounded px-2 py-1 outline-none">
              <option>Concise</option>
              <option>Precise</option>
              <option>Credible</option>
              <option>Warm</option>
            </select>
          </div>
          <button className="px-4 py-1.5 bg-gold text-obsidian text-[10px] uppercase tracking-widest font-bold rounded hover:bg-amber transition-colors">
            Forge Synthesis
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Source Inputs */}
        <div className="w-1/2 border-r border-titanium p-6 overflow-y-auto no-scrollbar space-y-6">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-stone font-bold">Source Intelligence</h3>
          <div className="space-y-4">
            <div className="p-4 bg-titanium/20 border border-titanium/50 rounded-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gold uppercase font-bold">Entity: MicroRGB</span>
                <CheckCircle2 size={12} className="text-teal" />
              </div>
              <p className="text-xs text-stone leading-relaxed">Technical specs, contrast ratios, and brightness peaks vs traditional OLED panels.</p>
            </div>
            <div className="p-4 bg-titanium/20 border border-titanium/50 rounded-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gold uppercase font-bold">Signal: Sarah Miller Request</span>
                <CheckCircle2 size={12} className="text-teal" />
              </div>
              <p className="text-xs text-stone leading-relaxed">Request for "objective explanation" for non-technical leadership.</p>
            </div>
          </div>

          {/* Language Refinery */}
          <div className="pt-8 space-y-6">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-stone font-bold flex items-center gap-2">
              <Sparkles size={14} className="text-gold" /> Personal Language Refinery
            </h3>
            <div className="glass-panel p-6 space-y-4 border-gold/10 bg-gold/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-stone uppercase tracking-widest">Style Profile: Precision & Authority</span>
                <span className="text-[10px] text-gold font-bold">94% Match</span>
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-titanium/10 border border-titanium/20 rounded space-y-2">
                  <p className="text-[9px] text-stone uppercase tracking-widest">Natural Tendency</p>
                  <p className="text-xs text-ivory/60 italic">"Uses 'I think' or 'maybe' when presenting strategic pivots."</p>
                </div>
                <div className="p-3 bg-titanium/10 border border-titanium/20 rounded space-y-2">
                  <p className="text-[9px] text-gold uppercase tracking-widest">Refined Suggestion</p>
                  <p className="text-xs text-ivory italic">"The evidence suggests a strategic pivot is the most viable path forward."</p>
                </div>
              </div>
              <div className="pt-2 flex items-center gap-2">
                <Languages size={12} className="text-gold" />
                <span className="text-[9px] text-stone uppercase tracking-widest">Multilingual Synthesis: Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Output Pane */}
        <div className="w-1/2 p-8 bg-graphite/30 overflow-y-auto no-scrollbar">
          <motion.div 
            key={audience}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
            className="max-w-xl mx-auto space-y-8"
          >
            <div className="space-y-4">
              <h1 className="text-3xl font-serif italic text-ivory">{activeContent.title}</h1>
              <div className="h-px bg-gold/30 w-24" />
            </div>

            <div className="space-y-6 text-stone text-sm leading-relaxed font-light">
              {activeContent.content.map((item, i) => (
                <div key={i} className="group relative">
                  <span className={cn(
                    "absolute -left-20 top-0.5 text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded border opacity-0 group-hover:opacity-100 transition-opacity",
                    item.type === 'fact' && "text-teal border-teal/30 bg-teal/5",
                    item.type === 'inference' && "text-gold border-gold/30 bg-gold/5",
                    item.type === 'hypothesis' && "text-oxblood border-oxblood/30 bg-oxblood/5"
                  )}>
                    {item.type}
                  </span>
                  <p className={cn(
                    item.type === 'fact' ? "text-ivory/80" : "text-stone"
                  )}>
                    {item.text}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-8 border-t border-titanium space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-stone">Confidence Meter</span>
                <span className="text-[10px] text-teal font-bold">{activeContent.confidence}% Certainty</span>
              </div>
              <div className="h-1 bg-titanium rounded-full overflow-hidden">
                <div className="h-full bg-teal transition-all duration-1000" style={{ width: `${activeContent.confidence}%` }} />
              </div>
              
              <div className="flex items-center gap-2 text-oxblood bg-oxblood/5 p-3 border border-oxblood/20 rounded">
                <AlertTriangle size={14} />
                <span className="text-[10px] uppercase tracking-widest font-bold">Contradiction Warning:</span>
                <span className="text-xs italic">{activeContent.warning}</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
