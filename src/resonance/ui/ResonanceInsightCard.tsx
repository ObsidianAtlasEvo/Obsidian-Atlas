import React from 'react';
import { motion } from 'motion/react';
import { 
  ResonanceThread, 
  ResonanceTier, 
  ResonanceConfidence 
} from '../types';
import { 
  Info, 
  Shield, 
  Target, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Zap, 
  Heart, 
  Brain, 
  AlertCircle 
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ResonanceInsightCardProps {
  thread: ResonanceThread;
  onUpdate?: (threadId: string, updates: Partial<ResonanceThread>) => void;
  className?: string;
}

export const ResonanceInsightCard: React.FC<ResonanceInsightCardProps> = ({
  thread,
  onUpdate,
  className
}) => {
  const getTierIcon = (tier: ResonanceTier) => {
    switch (tier) {
      case ResonanceTier.SACRED: return <Shield className="w-4 h-4 text-gold" />;
      case ResonanceTier.CORE: return <Heart className="w-4 h-4 text-ivory" />;
      case ResonanceTier.ESTABLISHED: return <Target className="w-4 h-4 text-stone" />;
      case ResonanceTier.EMERGING: return <Zap className="w-4 h-4 text-stone/80" />;
      case ResonanceTier.FLEETING: return <Activity className="w-4 h-4 text-stone/60" />;
    }
  };

  const getTrendIcon = (trend: ResonanceThread['trendDirection']) => {
    switch (trend) {
      case 'rising': return <TrendingUp className="w-3 h-3 text-gold" />;
      case 'fading': return <TrendingDown className="w-3 h-3 text-stone" />;
      case 'stable': return <Minus className="w-3 h-3 text-ivory/60" />;
      case 'oscillating': return <Activity className="w-3 h-3 text-stone/80" />;
    }
  };

  // Signal Gain effect based on strengthScore
  const gainOpacity = 0.5 + (thread.strengthScore * 0.5);
  const glowIntensity = thread.strengthScore > 0.8 ? 'rgba(176,138,67,0.15)' : 'transparent';

  // Alignment Pulse effect based on confidence
  const confidenceScore = thread.confidence === ResonanceConfidence.HIGH ? 0.9 : 
                          thread.confidence === ResonanceConfidence.MEDIUM ? 0.6 : 0.3;
  
  const pulseDuration = confidenceScore > 0.7 ? '3s' : '0.5s';
  const pulseOpacity = confidenceScore > 0.7 ? 0.1 : 0.05;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: gainOpacity, y: 0 }}
      style={{
        boxShadow: `0 0 20px ${glowIntensity}`,
        borderColor: `rgba(176,138,67,${thread.strengthScore * 0.2})`
      }}
      className={cn(
        "p-4 rounded-sm bg-titanium/10 backdrop-blur-md border relative overflow-hidden group",
        className
      )}
    >
      {/* Alignment Pulse Background */}
      <div 
        className="absolute inset-0 pointer-events-none animate-pulse-slow"
        style={{ 
          animationDuration: pulseDuration,
          opacity: pulseOpacity,
          backgroundColor: 'rgba(176,138,67,1)'
        }}
      />

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getTierIcon(thread.tier)}
          <h4 className="text-sm font-medium text-ivory">{thread.canonicalTheme}</h4>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-obsidian/50 border border-titanium/20">
          {getTrendIcon(thread.trendDirection)}
          <span className="text-[10px] uppercase tracking-wider text-stone">{thread.tier}</span>
        </div>
      </div>

      <div className="relative z-10 space-y-2 mt-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-stone">Resonance Strength</span>
          <span className="text-gold/80">{Math.round(thread.strengthScore * 100)}%</span>
        </div>
        <div className="h-[1px] w-full bg-titanium/30 overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${thread.strengthScore * 100}%` }}
            className="h-full bg-gold/50"
          />
        </div>
      </div>

      <div className="relative z-10 flex flex-wrap gap-1.5 mt-3">
        {thread.relatedValues.slice(0, 3).map((value, i) => (
          <span key={i} className="px-2 py-0.5 rounded-sm bg-obsidian/30 border border-titanium/20 text-[10px] text-stone">
            {value}
          </span>
        ))}
      </div>

      {thread.tensionSummary && (
        <div className="relative z-10 mt-3 p-2 rounded-sm bg-obsidian/50 border border-stone/20 flex gap-2">
          <AlertCircle className="w-3 h-3 text-stone shrink-0 mt-0.5" />
          <p className="text-[10px] text-stone/80 leading-relaxed">
            {thread.tensionSummary}
          </p>
        </div>
      )}

      <div className="relative z-10 pt-3 mt-3 flex items-center justify-between border-t border-titanium/10">
        <button 
          onClick={() => onUpdate?.(thread.threadId, { tier: ResonanceTier.CORE })}
          className="text-[10px] text-stone hover:text-gold transition-colors uppercase tracking-widest"
        >
          Mark as Central
        </button>
        <button 
          onClick={() => onUpdate?.(thread.threadId, { status: 'archived' })}
          className="text-[10px] text-stone hover:text-ivory transition-colors uppercase tracking-widest"
        >
          Not Representative
        </button>
      </div>
    </motion.div>
  );
};
