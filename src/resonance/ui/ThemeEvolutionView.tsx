import React from 'react';
import { motion } from 'motion/react';
import { 
  ResonanceThread, 
  ResonanceTier 
} from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Activity, 
  Calendar, 
  Clock, 
  Target, 
  Shield, 
  Heart, 
  Zap 
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ThemeEvolutionViewProps {
  threads: ResonanceThread[];
  onSelect?: (threadId: string) => void;
  className?: string;
}

/**
 * Theme Evolution View.
 * A timeline or trend view showing how major themes have developed.
 */
export const ThemeEvolutionView: React.FC<ThemeEvolutionViewProps> = ({
  threads,
  onSelect,
  className
}) => {
  const sortedThreads = [...threads].sort((a, b) => 
    new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
  );

  const getTierColor = (tier: ResonanceTier) => {
    switch (tier) {
      case ResonanceTier.SACRED: return "text-purple-400 bg-purple-500/10 border-purple-500/20";
      case ResonanceTier.CORE: return "text-red-400 bg-red-500/10 border-red-500/20";
      case ResonanceTier.ESTABLISHED: return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case ResonanceTier.EMERGING: return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case ResonanceTier.FLEETING: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  const getTierIcon = (tier: ResonanceTier) => {
    switch (tier) {
      case ResonanceTier.SACRED: return <Shield className="w-3 h-3" />;
      case ResonanceTier.CORE: return <Heart className="w-3 h-3" />;
      case ResonanceTier.ESTABLISHED: return <Target className="w-3 h-3" />;
      case ResonanceTier.EMERGING: return <Zap className="w-3 h-3" />;
      case ResonanceTier.FLEETING: return <Activity className="w-3 h-3" />;
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-medium text-white/90 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-400" />
          Resonance Evolution
        </h3>
        <span className="text-[10px] text-white/40 uppercase tracking-widest">
          {threads.length} Active Threads
        </span>
      </div>

      <div className="relative space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-white/5">
        {sortedThreads.map((thread, i) => (
          <motion.div
            key={thread.threadId}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onSelect?.(thread.threadId)}
            className="relative pl-8 group cursor-pointer"
          >
            {/* Timeline Dot */}
            <div className={cn(
              "absolute left-0 top-1.5 w-6 h-6 rounded-full border flex items-center justify-center z-10 transition-all group-hover:scale-110",
              getTierColor(thread.tier)
            )}>
              {getTierIcon(thread.tier)}
            </div>

            <div className="p-3 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 transition-all">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-medium text-white/80 group-hover:text-white transition-colors">
                  {thread.canonicalTheme}
                </h4>
                <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                  <Clock className="w-3 h-3" />
                  {new Date(thread.lastSeenAt).toLocaleDateString()}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${thread.strengthScore * 100}%` }}
                    className="h-full bg-gradient-to-r from-blue-500/50 to-purple-500/50"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {thread.trendDirection === 'rising' && <TrendingUp className="w-3 h-3 text-green-400/60" />}
                  {thread.trendDirection === 'fading' && <TrendingDown className="w-3 h-3 text-red-400/60" />}
                  {thread.trendDirection === 'stable' && <Minus className="w-3 h-3 text-blue-400/60" />}
                  <span className="text-[10px] text-white/40">{Math.round(thread.strengthScore * 100)}%</span>
                </div>
              </div>

              {thread.relatedProjects.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {thread.relatedProjects.slice(0, 2).map((project, j) => (
                    <span key={j} className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] text-white/40 border border-white/5">
                      {project}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
