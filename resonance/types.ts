/**
 * Resonance subsystem — significance-based adaptive alignment engine.
 * Tracks how Atlas's response patterns align with the user's cognitive signature
 * and evolves over time through interaction signals.
 */

export interface ResonanceProfile {
  id: string;
  dimension: string;
  value: number; // 0–1
  confidence: number; // 0–1
  lastUpdated: string; // ISO
  evidenceCount: number;
}

export interface ResonanceObservation {
  id: string;
  timestamp: string;
  signal: string;
  dimension: string;
  strength: number; // -1 to 1
  context: string;
  sessionId?: string;
}

export interface ResonanceThread {
  id: string;
  topic: string;
  observations: string[]; // ObservationIDs
  coherence: number; // 0–1
  lastActive: string;
  status: 'active' | 'dormant' | 'resolved';
}

export interface ResonanceGraphNode {
  id: string;
  label: string;
  type: 'concept' | 'pattern' | 'value' | 'belief' | 'signal';
  weight: number; // 0–1
  position?: { x: number; y: number };
}

export interface ResonanceGraphEdge {
  source: string;
  target: string;
  strength: number; // 0–1
  type: 'reinforces' | 'contradicts' | 'contextualizes' | 'generates' | 'depends-on';
}

export interface ResonanceGraph {
  nodes: ResonanceGraphNode[];
  edges: ResonanceGraphEdge[];
  lastComputed: string;
}

export interface ResonanceAdjustmentLog {
  id: string;
  timestamp: string;
  dimension: string;
  previousValue: number;
  newValue: number;
  delta: number;
  trigger: string;
  confidence: number;
  sessionContext?: string;
}

export interface AdaptiveResponseProfile {
  currentPosture: {
    depth: number;       // 0–1
    challenge: number;   // 0–1
    precision: number;   // 0–1
    warmth: number;      // 0–1
    directness: number;  // 0–1
    abstractionBias: number; // 0–1
  };
  lastAdaptedAt: string;
  adaptationCount: number;
  stabilityScore: number; // 0–1 — how stable the profile is
}

export interface InteractionSignal {
  id: string;
  timestamp: string;
  type:
    | 'engagement'       // user actively engaged with content
    | 'skip'             // user skipped or dismissed
    | 'expand'           // user requested more depth
    | 'challenge'        // user challenged the response
    | 'accept'           // user accepted/confirmed
    | 'reject'           // user rejected explicitly
    | 'return'           // user revisited prior content
    | 'rephrase'         // user rephrased the same question
    | 'follow-through';  // user acted on Atlas guidance
  context: string;
  value: number; // signal magnitude -1 to 1
  chamberId?: string;
}

export interface EffectiveResponseProfile {
  successPatterns: string[];
  failurePatterns: string[];
  optimalDepth: number;       // 0–1
  optimalChallenge: number;   // 0–1
  optimalTone: string;
  sampleSize: number;
  confidence: number; // 0–1
  lastUpdated: string;
}
