/**
 * ModelHubChamber.tsx
 * ===================
 * The command center for Atlas's multi-model orchestration system.
 *
 * ARCHITECTURAL PRINCIPLES:
 * ─────────────────────────
 * 1. ALL available models are queried in PARALLEL — not just one or two. Every
 *    enabled model across every configured provider receives the user's query
 *    simultaneously. This is the Atlas "broadcast" step.
 *
 * 2. The local Ollama model (the "Atlas Hub") is the ONLY model that ever speaks
 *    directly to the user. Its voice is the user's voice back.
 *
 * 3. All other cloud/remote models are "advisors". Their responses are piped back
 *    into the Atlas Hub as context — they are inputs to synthesis, not outputs
 *    to the user.
 *
 * 4. The synthesis process applies the user's evolved personal model as a filter:
 *    doctrine, constitution, cognitive signature, resonance profile, and active
 *    directives all shape how the Hub model weighs and fuses the advisor responses.
 *
 * 5. Personalization is structural, not cosmetic. No two users receive the same
 *    synthesis even if every advisor model returned identical text, because the
 *    personal cognitive lens transforms the meaning before it reaches the user.
 *
 * Backend communication:
 *   GET  /api/v1/models          — list all registered models
 *   GET  /api/v1/models/check    — test a provider connection (query: provider=<id>)
 *   POST /api/v1/keys            — store an API key for a provider
 *   GET  /api/v1/orchestration/last — retrieve the last orchestration result
 *
 * Vite proxy routes /api/* to the backend (typically http://localhost:8000).
 * If the backend is unavailable, the component falls back to local constants.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAtlasStore } from '../store/useAtlasStore';

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

type ProviderID =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'deepseek'
  | 'groq'
  | 'together'
  | 'cohere'
  | 'perplexity'
  | 'xai';

type Tier = 'free' | 'paid';

type TierPlan = 'free' | 'sovereign' | 'creator';

interface ModelDef {
  id: string;
  provider: ProviderID;
  name: string;
  description: string;
  tier: Tier;
  strengths: string[];
  contextWindow: number; // tokens
  estimatedCostPer1k: number; // USD per 1k tokens, 0 = free
  isLocal: boolean;
  requiresApiKey: boolean;
  enabled: boolean;
}

interface ProviderDef {
  id: ProviderID;
  name: string;
  color: string;
  apiKeyField: string;
  hasApiKey: boolean;
  isLocal: boolean;
}

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error';

interface ProviderState {
  apiKey: string;
  connectionStatus: ConnectionStatus;
  expanded: boolean;
  errorMsg?: string;
}

interface ModelResponse {
  modelId: string;
  provider: ProviderID;
  modelName: string;
  content: string;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  tokenCount?: number;
  errorMsg?: string;
  expanded: boolean;
}

interface OrchestrationResult {
  query: string;
  timestamp: string;
  responses: ModelResponse[];
  synthesis: {
    content: string;
    sourcesUsed: string[];
    consensusAreas: string[];
    disagreementAreas: string[];
    atlasJudgment: string;
    confidence: number; // 0–1
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDERS: ProviderDef[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    color: 'rgba(6,182,212,0.85)',
    apiKeyField: 'OLLAMA_HOST',
    hasApiKey: true, // always available locally
    isLocal: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    color: 'rgba(16,163,127,0.85)',
    apiKeyField: 'OPENAI_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    color: 'rgba(204,169,120,0.85)',
    apiKeyField: 'ANTHROPIC_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
  {
    id: 'google',
    name: 'Google',
    color: 'rgba(66,133,244,0.85)',
    apiKeyField: 'GOOGLE_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    color: 'rgba(255,119,0,0.85)',
    apiKeyField: 'MISTRAL_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    color: 'rgba(74,144,226,0.85)',
    apiKeyField: 'DEEPSEEK_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    color: 'rgba(244,114,182,0.85)',
    apiKeyField: 'GROQ_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
  {
    id: 'together',
    name: 'Together AI',
    color: 'rgba(99,102,241,0.85)',
    apiKeyField: 'TOGETHER_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
  {
    id: 'cohere',
    name: 'Cohere',
    color: 'rgba(201,162,39,0.85)',
    apiKeyField: 'COHERE_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    color: 'rgba(32,191,255,0.85)',
    apiKeyField: 'PERPLEXITY_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
  {
    id: 'xai',
    name: 'xAI',
    color: 'rgba(226,232,240,0.85)',
    apiKeyField: 'XAI_API_KEY',
    hasApiKey: false,
    isLocal: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MODEL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const MODELS: ModelDef[] = [
  // Ollama (local)
  {
    id: 'ollama/llama3.1:70b',
    provider: 'ollama',
    name: 'Llama 3.1 70B',
    description: 'Meta\'s flagship open-source model. Excellent all-rounder.',
    tier: 'free',
    strengths: ['Reasoning', 'Code', 'Instruction following'],
    contextWindow: 128000,
    estimatedCostPer1k: 0,
    isLocal: true,
    requiresApiKey: false,
    enabled: true,
  },
  {
    id: 'ollama/llama3.1:8b',
    provider: 'ollama',
    name: 'Llama 3.1 8B',
    description: 'Lightweight Llama 3.1 — fast local inference',
    tier: 'free',
    strengths: ['Speed', 'General-purpose', 'Low resource'],
    contextWindow: 128000,
    estimatedCostPer1k: 0,
    isLocal: true,
    requiresApiKey: false,
    enabled: true,
  },
  {
    id: 'ollama/mistral-nemo',
    provider: 'ollama',
    name: 'Mistral Nemo',
    description: 'Compact 12B model — multilingual and function calling',
    tier: 'free',
    strengths: ['Multilingual', 'Function calling', 'Speed'],
    contextWindow: 128000,
    estimatedCostPer1k: 0,
    isLocal: true,
    requiresApiKey: false,
    enabled: false,
  },
  {
    id: 'ollama/deepseek-r1:70b',
    provider: 'ollama',
    name: 'DeepSeek R1 70B',
    description: 'Local reasoning model with chain-of-thought',
    tier: 'free',
    strengths: ['Chain-of-thought', 'Math', 'Reasoning'],
    contextWindow: 128000,
    estimatedCostPer1k: 0,
    isLocal: true,
    requiresApiKey: false,
    enabled: false,
  },
  // OpenAI (GPT-5.4 family)
  {
    id: 'openai/gpt-5.4-nano',
    provider: 'openai',
    name: 'GPT-5.4 Nano',
    description: 'Fastest GPT-5.4 — routing, classification, high-throughput',
    tier: 'free',
    strengths: ['Speed', 'Classification', 'Routing', 'Structured output'],
    contextWindow: 400000,
    estimatedCostPer1k: 0.0002,
    isLocal: false,
    requiresApiKey: true,
    enabled: true,
  },
  {
    id: 'openai/gpt-5.4-mini',
    provider: 'openai',
    name: 'GPT-5.4 Mini',
    description: 'Balanced reasoning and coding at moderate cost',
    tier: 'paid',
    strengths: ['Reasoning', 'Coding', 'Synthesis', 'Structured output'],
    contextWindow: 400000,
    estimatedCostPer1k: 0.00075,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  {
    id: 'openai/gpt-5.4',
    provider: 'openai',
    name: 'GPT-5.4',
    description: 'OpenAI flagship — 1M+ context, powerful reasoning',
    tier: 'paid',
    strengths: ['Reasoning', 'Coding', 'Analysis', 'Long context'],
    contextWindow: 1050000,
    estimatedCostPer1k: 0.0025,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  {
    id: 'openai/gpt-5.4-pro',
    provider: 'openai',
    name: 'GPT-5.4 Pro',
    description: 'Most powerful — hard arbitration, sovereign only',
    tier: 'paid',
    strengths: ['Complex reasoning', 'Arbitration', 'Deep analysis'],
    contextWindow: 1050000,
    estimatedCostPer1k: 0.03,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  // Anthropic (Claude 4.6)
  {
    id: 'anthropic/claude-sonnet-4-6',
    provider: 'anthropic',
    name: 'Claude Sonnet 4.6',
    description: 'Fast elite coding, nuanced writing — sovereign only',
    tier: 'paid',
    strengths: ['Coding', 'Writing', 'Reasoning', 'Analysis'],
    contextWindow: 200000,
    estimatedCostPer1k: 0.003,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  {
    id: 'anthropic/claude-opus-4-6',
    provider: 'anthropic',
    name: 'Claude Opus 4.6',
    description: 'Frontier reasoning, elite coding — sovereign only',
    tier: 'paid',
    strengths: ['Frontier reasoning', 'Elite coding', 'Research', 'Creative writing'],
    contextWindow: 200000,
    estimatedCostPer1k: 0.015,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  // Google
  {
    id: 'google/gemini-2.5-flash',
    provider: 'google',
    name: 'Gemini 2.5 Flash',
    description: 'Google\'s most capable — 1M context, multimodal',
    tier: 'free',
    strengths: ['Long context', 'Multimodal', 'Code', 'Reasoning'],
    contextWindow: 1000000,
    estimatedCostPer1k: 0.00125,
    isLocal: false,
    requiresApiKey: true,
    enabled: true,
  },
  {
    id: 'google/gemini-2.0-flash',
    provider: 'google',
    name: 'Gemini 2.0 Flash',
    description: 'Fast agentic Gemini with realtime performance',
    tier: 'free',
    strengths: ['Speed', 'Agentic', 'Multimodal', 'Realtime'],
    contextWindow: 1000000,
    estimatedCostPer1k: 0.0001,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  {
    id: 'google/gemini-3.1-flash-lite-preview',
    provider: 'google',
    name: 'Gemini 3.1 Flash Lite (Preview)',
    description: 'Free-tier Overseer — lightweight, 1M context',
    tier: 'free',
    strengths: ['Speed', 'Cost efficiency', 'Overseer', 'Classification'],
    contextWindow: 1000000,
    estimatedCostPer1k: 0,
    isLocal: false,
    requiresApiKey: true,
    enabled: true,
  },
  // Mistral
  {
    id: 'mistral/mistral-large',
    provider: 'mistral',
    name: 'Mistral Large',
    description: 'Top-tier European reasoning model',
    tier: 'free',
    strengths: ['Multilingual', 'Reasoning', 'Code'],
    contextWindow: 128000,
    estimatedCostPer1k: 0.002,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  {
    id: 'mistral/mistral-nemo',
    provider: 'mistral',
    name: 'Mistral Nemo',
    description: 'Efficient multilingual model with function calling',
    tier: 'free',
    strengths: ['Multilingual', 'Function calling', 'Cost efficiency'],
    contextWindow: 128000,
    estimatedCostPer1k: 0.00015,
    isLocal: false,
    requiresApiKey: true,
    enabled: true,
  },
  {
    id: 'mistral/codestral',
    provider: 'mistral',
    name: 'Codestral',
    description: 'Specialized code generation — 80+ languages',
    tier: 'free',
    strengths: ['Code generation', 'Completion', 'Multi-language'],
    contextWindow: 32000,
    estimatedCostPer1k: 0.0003,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  // DeepSeek
  {
    id: 'deepseek/deepseek-chat',
    provider: 'deepseek',
    name: 'DeepSeek V3',
    description: 'Competitive with GPT-4 at a fraction of the cost',
    tier: 'free',
    strengths: ['Coding', 'Reasoning', 'Math', 'Cost efficiency'],
    contextWindow: 64000,
    estimatedCostPer1k: 0.00014,
    isLocal: false,
    requiresApiKey: true,
    enabled: true,
  },
  {
    id: 'deepseek/deepseek-reasoner',
    provider: 'deepseek',
    name: 'DeepSeek R1',
    description: 'Reasoning model with transparent chain-of-thought',
    tier: 'free',
    strengths: ['Chain-of-thought', 'Math', 'Logic', 'Transparency'],
    contextWindow: 64000,
    estimatedCostPer1k: 0.00055,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  // Groq
  {
    id: 'groq/llama-3.3-70b-versatile',
    provider: 'groq',
    name: 'Llama 3.3 70B (Groq)',
    description: 'Ultra-fast LPU inference — primary free-tier routing model',
    tier: 'free',
    strengths: ['Speed', 'Routing', 'Reasoning', 'Free tier'],
    contextWindow: 128000,
    estimatedCostPer1k: 0,
    isLocal: false,
    requiresApiKey: true,
    enabled: true,
  },
  {
    id: 'groq/mixtral-8x7b-32768',
    provider: 'groq',
    name: 'Mixtral 8x7B (Groq)',
    description: 'Sparse MoE on Groq — fast multilingual',
    tier: 'free',
    strengths: ['MoE efficiency', 'Multilingual', 'Speed'],
    contextWindow: 32768,
    estimatedCostPer1k: 0,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  // Together AI
  {
    id: 'together/meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    provider: 'together',
    name: 'Llama 3.1 70B Turbo (Together)',
    description: 'Llama 3.1 70B optimized for throughput',
    tier: 'free',
    strengths: ['Reasoning', 'Instruction following', 'Coding'],
    contextWindow: 128000,
    estimatedCostPer1k: 0.00088,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  // Cohere
  {
    id: 'cohere/command-r-plus',
    provider: 'cohere',
    name: 'Command R+',
    description: 'Enterprise RAG and tool-use model',
    tier: 'free',
    strengths: ['RAG', 'Tool use', 'Document Q&A'],
    contextWindow: 128000,
    estimatedCostPer1k: 0.003,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  // Perplexity
  {
    id: 'perplexity/llama-3.1-sonar-large-128k-online',
    provider: 'perplexity',
    name: 'Sonar Large (Online)',
    description: 'Real-time web search grounded model',
    tier: 'paid',
    strengths: ['Web search', 'Current events', 'Citations'],
    contextWindow: 128000,
    estimatedCostPer1k: 0.001,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
  // xAI
  {
    id: 'xai/grok-2',
    provider: 'xai',
    name: 'Grok 2',
    description: 'xAI reasoning model with real-time data access',
    tier: 'paid',
    strengths: ['Real-time data', 'Reasoning', 'Analysis'],
    contextWindow: 131072,
    estimatedCostPer1k: 0.002,
    isLocal: false,
    requiresApiKey: true,
    enabled: false,
  },
];

// No mock orchestration data — use real data from backend or show empty state

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

function formatCost(costPer1k: number): string {
  if (costPer1k === 0) return 'Free';
  if (costPer1k < 0.001) return `$${(costPer1k * 1000).toFixed(3)}/1M`;
  return `$${costPer1k.toFixed(4)}/1K`;
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return '••••••••';
  return '•'.repeat(key.length - 4) + key.slice(-4);
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function getProviderDef(id: ProviderID): ProviderDef {
  return PROVIDERS.find((p) => p.id === id)!;
}

const LS_KEY = 'atlas-provider-keys';

function loadStoredKeys(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredKeys(keys: Record<string, string>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(keys));
  } catch {
    // ignore storage quota errors
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS (inline style helpers)
// ─────────────────────────────────────────────────────────────────────────────

const ds = {
  body: '#050505',
  panel: 'rgba(15,10,30,0.55)',
  inset: 'rgba(5,5,8,0.72)',
  border: 'rgba(88,28,135,0.14)',
  borderSubtle: 'rgba(88,28,135,0.1)',
  text: 'rgba(226,232,240,0.92)',
  muted: 'rgba(226,232,240,0.55)',
  dim: 'rgba(226,232,240,0.3)',
  gold: 'rgba(201,162,39,0.9)',
  violet: 'rgba(167,139,250,0.85)',
  danger: 'rgba(239,68,68,0.75)',
  success: 'rgba(34,197,94,0.7)',
  indigo: 'rgba(99,102,241,0.7)',
  amber: 'rgba(234,179,8,0.7)',
  teal: 'rgba(6,182,212,0.7)',
  rose: 'rgba(244,114,182,0.7)',
  font: "'Inter', sans-serif",
  fadeIn: 'atlas-fade-in 300ms ease both' as const,
  label: {
    fontSize: '0.62rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 34,
        height: 18,
        borderRadius: 9,
        background: checked ? ds.teal : 'rgba(226,232,240,0.12)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 200ms ease',
        flexShrink: 0,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'rgba(226,232,240,0.9)',
          transition: 'left 180ms ease',
        }}
      />
    </button>
  );
}

// ── Tier Badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: Tier }) {
  const color = tier === 'free' ? ds.teal : ds.gold;
  return (
    <span
      style={{
        ...ds.label,
        color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: '1px 5px',
        display: 'inline-block',
      }}
    >
      {tier}
    </span>
  );
}

// ── Status Dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ConnectionStatus | 'no-key' }) {
  const color =
    status === 'connected'
      ? ds.success
      : status === 'error'
      ? ds.danger
      : status === 'testing'
      ? ds.amber
      : status === 'no-key'
      ? ds.dim
      : ds.dim;
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        boxShadow: status === 'connected' ? `0 0 5px ${color}` : 'none',
        flexShrink: 0,
      }}
    />
  );
}

// ── Strengths Tags ────────────────────────────────────────────────────────────

function StrengthTags({ strengths }: { strengths: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {strengths.map((s) => (
        <span
          key={s}
          style={{
            fontSize: '0.6rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: ds.violet,
            background: 'rgba(167,139,250,0.08)',
            border: '1px solid rgba(167,139,250,0.18)',
            borderRadius: 3,
            padding: '1px 5px',
          }}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: MODEL DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

interface DashboardTabProps {
  models: ModelDef[];
  providers: ProviderDef[];
  providerStates: Record<ProviderID, ProviderState>;
  onToggleModel: (modelId: string) => void;
  onKeyChange: (providerId: ProviderID, key: string) => void;
  onTestConnection: (providerId: ProviderID) => void;
  onToggleProviderExpand: (providerId: ProviderID) => void;
  tierPlan: TierPlan;
  onTierChange: (t: TierPlan) => void;
}

function DashboardTab({
  models,
  providers,
  providerStates,
  onToggleModel,
  onKeyChange,
  onTestConnection,
  onToggleProviderExpand,
  tierPlan,
  onTierChange,
}: DashboardTabProps) {
  const tierDefs: { id: TierPlan; label: string; desc: string; color: string; cap: string }[] = [
    {
      id: 'free',
      label: 'Free',
      desc: 'Local + free cloud models',
      color: ds.teal,
      cap: '3 models per query',
    },
    {
      id: 'sovereign',
      label: 'Sovereign',
      desc: 'All cloud models',
      color: ds.violet,
      cap: '6 models per query',
    },
    {
      id: 'creator',
      label: 'Creator',
      desc: 'Unlimited. All models, no caps.',
      color: ds.gold,
      cap: 'No limits',
    },
  ];

  const enabledModels = models.filter((m) => m.enabled);
  const byProvider: Partial<Record<ProviderID, ModelDef[]>> = {};
  enabledModels.forEach((m) => {
    if (!byProvider[m.provider]) byProvider[m.provider] = [];
    byProvider[m.provider]!.push(m);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: ds.fadeIn }}>
      {/* Tier Selector */}
      <div>
        <div style={{ ...ds.label, color: ds.dim, marginBottom: 10 }}>Tier Plan</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {tierDefs.map((t) => {
            const active = tierPlan === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onTierChange(t.id)}
                style={{
                  background: active ? `rgba(${t.color.slice(5,-1)},0.08)` : ds.inset,
                  border: `1.5px solid ${active ? t.color : ds.border}`,
                  borderRadius: 8,
                  padding: '14px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 180ms ease',
                }}
              >
                <span style={{ color: t.color, fontWeight: 700, fontSize: '0.88rem', fontFamily: ds.font }}>
                  {t.label}
                </span>
                <span style={{ color: ds.muted, fontSize: '0.73rem', fontFamily: ds.font }}>{t.desc}</span>
                <span style={{ ...ds.label, color: active ? t.color : ds.dim, marginTop: 2 }}>{t.cap}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Provider Grid */}
      <div>
        <div style={{ ...ds.label, color: ds.dim, marginBottom: 10 }}>Providers</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {providers.map((prov) => {
            const ps = providerStates[prov.id];
            const provModels = models.filter((m) => m.provider === prov.id);
            const hasKey = prov.isLocal || (ps.apiKey && ps.apiKey.length > 0);
            const status: ConnectionStatus | 'no-key' = !hasKey
              ? 'no-key'
              : ps.connectionStatus;

            return (
              <div
                key={prov.id}
                style={{
                  background: ds.panel,
                  border: `1px solid ${ds.border}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  transition: 'border-color 180ms ease',
                }}
              >
                {/* Provider Header */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: prov.color,
                          flexShrink: 0,
                          display: 'inline-block',
                        }}
                      />
                      <span style={{ color: ds.text, fontWeight: 600, fontSize: '0.82rem', fontFamily: ds.font }}>
                        {prov.name}
                      </span>
                    </div>
                    <StatusDot status={status} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                    <span style={{ ...ds.label, color: ds.dim }}>
                      {provModels.length} model{provModels.length !== 1 ? 's' : ''}
                    </span>
                    {prov.isLocal && (
                      <span
                        style={{
                          ...ds.label,
                          color: ds.teal,
                          border: `1px solid ${ds.teal}`,
                          borderRadius: 3,
                          padding: '0 4px',
                        }}
                      >
                        local
                      </span>
                    )}
                  </div>

                  {/* API Key Input */}
                  {!prov.isLocal && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ ...ds.label, color: ds.dim, marginBottom: 4 }}>{prov.apiKeyField}</div>
                      <input
                        type="password"
                        placeholder="Enter API key..."
                        value={ps.apiKey}
                        onChange={(e) => onKeyChange(prov.id, e.target.value)}
                        style={{
                          width: '100%',
                          background: ds.inset,
                          border: `1px solid ${ds.border}`,
                          borderRadius: 5,
                          padding: '5px 8px',
                          color: ds.text,
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      {ps.apiKey && (
                        <div style={{ ...ds.label, color: ds.dim, marginTop: 3 }}>
                          {maskKey(ps.apiKey)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Test + Expand buttons */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => onTestConnection(prov.id)}
                      disabled={ps.connectionStatus === 'testing'}
                      style={{
                        flex: 1,
                        background: ps.connectionStatus === 'testing'
                          ? 'rgba(234,179,8,0.08)'
                          : 'rgba(6,182,212,0.08)',
                        border: `1px solid ${ps.connectionStatus === 'testing' ? ds.amber : ds.teal}`,
                        borderRadius: 5,
                        padding: '5px 0',
                        color: ps.connectionStatus === 'testing' ? ds.amber : ds.teal,
                        ...ds.label,
                        cursor: ps.connectionStatus === 'testing' ? 'not-allowed' : 'pointer',
                        fontFamily: ds.font,
                      }}
                    >
                      {ps.connectionStatus === 'testing' ? 'Testing…' : 'Test'}
                    </button>
                    <button
                      onClick={() => onToggleProviderExpand(prov.id)}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: `1px solid ${ds.border}`,
                        borderRadius: 5,
                        padding: '5px 0',
                        color: ds.muted,
                        ...ds.label,
                        cursor: 'pointer',
                        fontFamily: ds.font,
                      }}
                    >
                      {ps.expanded ? 'Hide' : 'Models'}
                    </button>
                  </div>

                  {/* Error message */}
                  {ps.connectionStatus === 'error' && ps.errorMsg && (
                    <div style={{ color: ds.danger, fontSize: '0.68rem', marginTop: 6, fontFamily: ds.font }}>
                      {ps.errorMsg}
                    </div>
                  )}
                  {ps.connectionStatus === 'connected' && (
                    <div style={{ color: ds.success, fontSize: '0.68rem', marginTop: 6, fontFamily: ds.font }}>
                      Connected
                    </div>
                  )}
                </div>

                {/* Expanded Model List */}
                {ps.expanded && (
                  <div
                    style={{
                      borderTop: `1px solid ${ds.border}`,
                      padding: '8px 14px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    {provModels.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <span
                            style={{
                              color: m.enabled ? ds.text : ds.dim,
                              fontSize: '0.75rem',
                              fontFamily: ds.font,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {m.name}
                          </span>
                          <TierBadge tier={m.tier} />
                        </div>
                        <Toggle checked={m.enabled} onChange={() => onToggleModel(m.id)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Models Summary */}
      <div
        style={{
          background: ds.inset,
          border: `1px solid ${ds.border}`,
          borderRadius: 10,
          padding: '14px 18px',
        }}
      >
        <div style={{ ...ds.label, color: ds.dim, marginBottom: 10 }}>Active Models Summary</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {Object.entries(byProvider).map(([pid, ms]) => {
            const prov = getProviderDef(pid as ProviderID);
            return (
              <div
                key={pid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  background: ds.panel,
                  border: `1px solid ${ds.border}`,
                  borderRadius: 6,
                  padding: '4px 10px',
                }}
              >
                <span
                  style={{ width: 7, height: 7, borderRadius: '50%', background: prov.color, display: 'inline-block', flexShrink: 0 }}
                />
                <span style={{ color: ds.text, fontSize: '0.78rem', fontFamily: ds.font }}>
                  {prov.name}
                </span>
                <span style={{ ...ds.label, color: prov.color }}>{ms!.length}</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: ds.gold,
              fontFamily: ds.font,
              lineHeight: 1,
            }}
          >
            {enabledModels.length}
          </span>
          <span style={{ color: ds.muted, fontSize: '0.82rem', fontFamily: ds.font }}>
            models will be queried on next request
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: MODEL ROSTER
// ─────────────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'provider' | 'context' | 'cost';

interface RosterTabProps {
  models: ModelDef[];
  providerStates: Record<ProviderID, ProviderState>;
  onToggleModel: (modelId: string) => void;
}

function RosterTab({ models, providerStates, onToggleModel }: RosterTabProps) {
  const [search, setSearch] = useState('');
  const [filterProvider, setFilterProvider] = useState<ProviderID | 'all'>('all');
  const [filterTier, setFilterTier] = useState<Tier | 'all'>('all');
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('provider');
  const [sortAsc, setSortAsc] = useState(true);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = models
    .filter((m) => {
      if (search && !m.name.toLowerCase().includes(search.toLowerCase()) &&
        !m.provider.toLowerCase().includes(search.toLowerCase()) &&
        !m.strengths.some(s => s.toLowerCase().includes(search.toLowerCase()))) return false;
      if (filterProvider !== 'all' && m.provider !== filterProvider) return false;
      if (filterTier !== 'all' && m.tier !== filterTier) return false;
      if (filterEnabled === 'enabled' && !m.enabled) return false;
      if (filterEnabled === 'disabled' && m.enabled) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'provider') cmp = a.provider.localeCompare(b.provider);
      else if (sortKey === 'context') cmp = a.contextWindow - b.contextWindow;
      else if (sortKey === 'cost') cmp = a.estimatedCostPer1k - b.estimatedCostPer1k;
      return sortAsc ? cmp : -cmp;
    });

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      style={{
        background: sortKey === k ? 'rgba(167,139,250,0.1)' : 'transparent',
        border: `1px solid ${sortKey === k ? ds.violet : ds.border}`,
        borderRadius: 5,
        padding: '4px 10px',
        color: sortKey === k ? ds.violet : ds.muted,
        ...ds.label,
        cursor: 'pointer',
        fontFamily: ds.font,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {label}
      {sortKey === k && (
        <span style={{ fontSize: '0.7rem' }}>{sortAsc ? '↑' : '↓'}</span>
      )}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: ds.fadeIn }}>
      {/* Search + Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="text"
          placeholder="Search models, providers, strengths..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: ds.inset,
            border: `1px solid ${ds.border}`,
            borderRadius: 7,
            padding: '8px 14px',
            color: ds.text,
            fontSize: '0.82rem',
            fontFamily: ds.font,
            outline: 'none',
            width: '100%',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {/* Provider filter */}
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value as ProviderID | 'all')}
            style={{
              background: ds.inset,
              border: `1px solid ${ds.border}`,
              borderRadius: 5,
              padding: '4px 8px',
              color: ds.muted,
              fontSize: '0.75rem',
              fontFamily: ds.font,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Providers</option>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Tier filter */}
          <select
            value={filterTier}
            onChange={(e) => setFilterTier(e.target.value as Tier | 'all')}
            style={{
              background: ds.inset,
              border: `1px solid ${ds.border}`,
              borderRadius: 5,
              padding: '4px 8px',
              color: ds.muted,
              fontSize: '0.75rem',
              fontFamily: ds.font,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Tiers</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>

          {/* Enabled filter */}
          <select
            value={filterEnabled}
            onChange={(e) => setFilterEnabled(e.target.value as 'all' | 'enabled' | 'disabled')}
            style={{
              background: ds.inset,
              border: `1px solid ${ds.border}`,
              borderRadius: 5,
              padding: '4px 8px',
              color: ds.muted,
              fontSize: '0.75rem',
              fontFamily: ds.font,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Status</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>

          <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
            <SortBtn k="name" label="Name" />
            <SortBtn k="provider" label="Provider" />
            <SortBtn k="context" label="Context" />
            <SortBtn k="cost" label="Cost" />
          </div>
        </div>
      </div>

      {/* Count */}
      <div style={{ ...ds.label, color: ds.dim }}>
        {filtered.length} model{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Model Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map((m) => {
          const prov = getProviderDef(m.provider);
          const ps = providerStates[m.provider];
          const needsKey = m.requiresApiKey && (!ps.apiKey || ps.apiKey.length === 0);

          return (
            <div
              key={m.id}
              style={{
                background: ds.panel,
                border: `1px solid ${m.enabled ? ds.border : ds.borderSubtle}`,
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                opacity: m.enabled ? 1 : 0.6,
                transition: 'opacity 200ms ease',
              }}
            >
              {/* Provider dot */}
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: prov.color,
                  display: 'inline-block',
                  marginTop: 3,
                  flexShrink: 0,
                }}
              />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: ds.text, fontWeight: 600, fontSize: '0.82rem', fontFamily: ds.font }}>
                    {m.name}
                  </span>
                  <span style={{ color: ds.dim, fontSize: '0.72rem', fontFamily: ds.font }}>{prov.name}</span>
                  <TierBadge tier={m.tier} />
                  {needsKey && (
                    <span
                      style={{
                        ...ds.label,
                        color: ds.danger,
                        border: `1px solid ${ds.danger}`,
                        borderRadius: 3,
                        padding: '0 5px',
                      }}
                    >
                      needs key
                    </span>
                  )}
                  {m.isLocal && (
                    <span
                      style={{
                        ...ds.label,
                        color: ds.teal,
                        border: `1px solid ${ds.teal}`,
                        borderRadius: 3,
                        padding: '0 5px',
                      }}
                    >
                      local
                    </span>
                  )}
                </div>
                <div style={{ color: ds.muted, fontSize: '0.73rem', fontFamily: ds.font, marginBottom: 6 }}>
                  {m.description}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                  <StrengthTags strengths={m.strengths} />
                  <span style={{ ...ds.label, color: ds.dim }}>
                    {formatContext(m.contextWindow)} ctx
                  </span>
                  <span style={{ ...ds.label, color: m.estimatedCostPer1k === 0 ? ds.teal : ds.dim }}>
                    {formatCost(m.estimatedCostPer1k)}
                  </span>
                </div>
              </div>

              {/* Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: 2 }}>
                <Toggle checked={m.enabled} onChange={() => onToggleModel(m.id)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: ORCHESTRATION MONITOR
// ─────────────────────────────────────────────────────────────────────────────

interface MonitorTabProps {
  result: OrchestrationResult | null;
  onToggleResponseExpand: (modelId: string) => void;
}

function MonitorTab({ result, onToggleResponseExpand }: MonitorTabProps) {
  if (!result) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 0',
          gap: 12,
          animation: ds.fadeIn,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: `2px solid ${ds.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="7" stroke={ds.dim} strokeWidth="1.5" />
            <path d="M11 8v3l2 2" stroke={ds.dim} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div style={{ color: ds.muted, fontSize: '0.82rem', fontFamily: ds.font }}>
          No orchestration results yet.
        </div>
        <div style={{ color: ds.dim, fontSize: '0.72rem', fontFamily: ds.font, textAlign: 'center', maxWidth: 320 }}>
          Send a query through Atlas to see how all models respond and how the synthesis is formed.
        </div>
      </div>
    );
  }

  const successCount = result.responses.filter((r) => r.status === 'success').length;
  const errorCount = result.responses.filter((r) => r.status === 'error').length;
  const timeoutCount = result.responses.filter((r) => r.status === 'timeout').length;
  const avgDuration =
    result.responses.reduce((s, r) => s + r.durationMs, 0) / result.responses.length;

  const statusColor = (s: ModelResponse['status']) =>
    s === 'success' ? ds.success : s === 'error' ? ds.danger : ds.amber;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, animation: ds.fadeIn }}>
      {/* Last Query */}
      <div
        style={{
          background: ds.inset,
          border: `1px solid ${ds.border}`,
          borderRadius: 10,
          padding: '14px 18px',
        }}
      >
        <div style={{ ...ds.label, color: ds.dim, marginBottom: 8 }}>Last Query</div>
        <div
          style={{
            color: ds.text,
            fontSize: '0.9rem',
            fontFamily: ds.font,
            lineHeight: 1.55,
            fontStyle: 'italic',
          }}
        >
          "{result.query}"
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ ...ds.label, color: ds.dim }}>
            {new Date(result.timestamp).toLocaleTimeString()}
          </span>
          <span style={{ ...ds.label, color: ds.success }}>{successCount} success</span>
          {errorCount > 0 && (
            <span style={{ ...ds.label, color: ds.danger }}>{errorCount} error</span>
          )}
          {timeoutCount > 0 && (
            <span style={{ ...ds.label, color: ds.amber }}>{timeoutCount} timeout</span>
          )}
          <span style={{ ...ds.label, color: ds.dim }}>avg {formatDuration(avgDuration)}</span>
        </div>
      </div>

      {/* Model Responses Grid */}
      <div>
        <div style={{ ...ds.label, color: ds.dim, marginBottom: 10 }}>
          Advisor Responses ({result.responses.length})
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {result.responses.map((r) => {
            const prov = getProviderDef(r.provider);
            return (
              <div
                key={r.modelId}
                style={{
                  background: ds.panel,
                  border: `1px solid ${r.status === 'success' ? ds.border : statusColor(r.status)}`,
                  borderRadius: 9,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{ width: 8, height: 8, borderRadius: '50%', background: prov.color, display: 'inline-block', flexShrink: 0 }}
                    />
                    <span style={{ color: ds.text, fontWeight: 600, fontSize: '0.78rem', fontFamily: ds.font }}>
                      {r.modelName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span
                      style={{
                        ...ds.label,
                        color: statusColor(r.status),
                        border: `1px solid ${statusColor(r.status)}`,
                        borderRadius: 3,
                        padding: '1px 5px',
                      }}
                    >
                      {r.status}
                    </span>
                    <span style={{ ...ds.label, color: ds.dim }}>{formatDuration(r.durationMs)}</span>
                  </div>
                </div>

                {/* Content */}
                <div
                  style={{
                    color: r.status === 'success' ? ds.muted : ds.dim,
                    fontSize: '0.75rem',
                    fontFamily: ds.font,
                    lineHeight: 1.6,
                    overflow: 'hidden',
                    maxHeight: r.expanded ? 'none' : '4.8rem',
                  }}
                >
                  {r.content}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                  {r.tokenCount && (
                    <span style={{ ...ds.label, color: ds.dim }}>{r.tokenCount} tokens</span>
                  )}
                  {r.content.length > 180 && (
                    <button
                      onClick={() => onToggleResponseExpand(r.modelId)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: ds.violet,
                        ...ds.label,
                        cursor: 'pointer',
                        padding: 0,
                        fontFamily: ds.font,
                        marginLeft: 'auto',
                      }}
                    >
                      {r.expanded ? 'Collapse' : 'Expand'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Atlas Synthesis */}
      <div
        style={{
          background: 'rgba(201,162,39,0.04)',
          border: `1.5px solid ${ds.gold}`,
          borderRadius: 12,
          padding: '20px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...ds.label, color: ds.gold, fontSize: '0.68rem', letterSpacing: '0.14em' }}>
            Atlas Synthesis
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ ...ds.label, color: ds.dim }}>Confidence</span>
            <span
              style={{
                ...ds.label,
                color: result.synthesis.confidence > 0.7 ? ds.success : result.synthesis.confidence > 0.5 ? ds.amber : ds.danger,
              }}
            >
              {Math.round(result.synthesis.confidence * 100)}%
            </span>
          </div>
        </div>

        <div style={{ color: ds.text, fontSize: '0.83rem', fontFamily: ds.font, lineHeight: 1.7 }}>
          {result.synthesis.content}
        </div>

        {/* Sources */}
        <div>
          <div style={{ ...ds.label, color: ds.dim, marginBottom: 6 }}>Sources Used</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {result.synthesis.sourcesUsed.map((s) => (
              <span
                key={s}
                style={{
                  ...ds.label,
                  color: ds.muted,
                  background: 'rgba(226,232,240,0.05)',
                  border: `1px solid ${ds.border}`,
                  borderRadius: 4,
                  padding: '2px 7px',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Consensus */}
        <div
          style={{
            background: 'rgba(34,197,94,0.05)',
            border: `1px solid rgba(34,197,94,0.2)`,
            borderRadius: 7,
            padding: '10px 14px',
          }}
        >
          <div style={{ ...ds.label, color: ds.success, marginBottom: 6 }}>Consensus Areas</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {result.synthesis.consensusAreas.map((c) => (
              <li key={c} style={{ color: ds.muted, fontSize: '0.75rem', fontFamily: ds.font, lineHeight: 1.5 }}>
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* Disagreement */}
        <div
          style={{
            background: 'rgba(234,179,8,0.05)',
            border: `1px solid rgba(234,179,8,0.2)`,
            borderRadius: 7,
            padding: '10px 14px',
          }}
        >
          <div style={{ ...ds.label, color: ds.amber, marginBottom: 6 }}>Disagreement Areas</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {result.synthesis.disagreementAreas.map((d) => (
              <li key={d} style={{ color: ds.muted, fontSize: '0.75rem', fontFamily: ds.font, lineHeight: 1.5 }}>
                {d}
              </li>
            ))}
          </ul>
        </div>

        {/* Atlas Judgment */}
        <div
          style={{
            background: 'rgba(201,162,39,0.04)',
            border: `1px solid rgba(201,162,39,0.18)`,
            borderRadius: 7,
            padding: '10px 14px',
          }}
        >
          <div style={{ ...ds.label, color: ds.gold, marginBottom: 6 }}>Atlas Judgment</div>
          <div style={{ color: ds.muted, fontSize: '0.75rem', fontFamily: ds.font, lineHeight: 1.6 }}>
            {result.synthesis.atlasJudgment}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: HOW IT WORKS
// ─────────────────────────────────────────────────────────────────────────────

function HowItWorksTab() {
  const steps = [
    {
      num: '01',
      title: 'Your question enters Atlas',
      desc: 'Your query arrives at the Atlas Hub — the local Ollama model running on your machine. Atlas immediately identifies which models to consult based on your active tier, enabled model set, and query characteristics.',
      color: ds.teal,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7" stroke={ds.teal} strokeWidth="1.5" />
          <path d="M10 7v3l2 2" stroke={ds.teal} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      num: '02',
      title: 'Atlas broadcasts to all models simultaneously',
      desc: 'Your query is dispatched in parallel to every enabled model across all configured providers. No sequential bottleneck — all advisors receive the question at the same moment.',
      color: ds.violet,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="3" fill={ds.violet} />
          <path d="M10 10 L3 3" stroke={ds.violet} strokeWidth="1.2" strokeOpacity="0.5" />
          <path d="M10 10 L17 3" stroke={ds.violet} strokeWidth="1.2" strokeOpacity="0.5" />
          <path d="M10 10 L3 17" stroke={ds.violet} strokeWidth="1.2" strokeOpacity="0.5" />
          <path d="M10 10 L17 17" stroke={ds.violet} strokeWidth="1.2" strokeOpacity="0.5" />
          <path d="M10 10 L10 2" stroke={ds.violet} strokeWidth="1.2" strokeOpacity="0.5" />
          <path d="M10 10 L10 18" stroke={ds.violet} strokeWidth="1.2" strokeOpacity="0.5" />
        </svg>
      ),
    },
    {
      num: '03',
      title: 'All responses are collected',
      desc: 'Advisor responses stream back as they complete. Atlas tracks each response\'s content, duration, confidence signals, and token count. Timeouts and errors are noted but do not halt the process.',
      color: ds.indigo,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="4" width="14" height="3" rx="1.5" fill={ds.indigo} fillOpacity="0.3" stroke={ds.indigo} strokeWidth="1" />
          <rect x="3" y="9" width="10" height="3" rx="1.5" fill={ds.indigo} fillOpacity="0.3" stroke={ds.indigo} strokeWidth="1" />
          <rect x="3" y="14" width="12" height="3" rx="1.5" fill={ds.indigo} fillOpacity="0.3" stroke={ds.indigo} strokeWidth="1" />
        </svg>
      ),
    },
    {
      num: '04',
      title: 'Atlas synthesizes through your personal lens',
      desc: 'The local Hub model — your Atlas — processes all advisor responses through the architecture of your mind: your doctrine, cognitive constitution, resonance profile, active directives, and learned posture all act as a filter that determines how advisor outputs are weighted, combined, and transformed.',
      color: ds.gold,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 10 C4 6.686 6.686 4 10 4 C13.314 4 16 6.686 16 10" stroke={ds.gold} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4 10 C4 13.314 6.686 16 10 16 C13.314 16 16 13.314 16 10" stroke={ds.gold} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
          <circle cx="10" cy="10" r="2.5" fill={ds.gold} fillOpacity="0.6" />
        </svg>
      ),
    },
    {
      num: '05',
      title: 'You receive one unified, personalized response',
      desc: 'A single response emerges — not a list of AI outputs, not a committee report, but a genuinely synthesized perspective shaped by every available intelligence and filtered through who you are. No other user receives the same synthesis, even from identical model outputs.',
      color: ds.success,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 10 L8 14 L16 6" stroke={ds.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: ds.fadeIn }}>
      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((step, i) => (
          <div
            key={step.num}
            style={{
              display: 'flex',
              gap: 16,
              position: 'relative',
              paddingBottom: i < steps.length - 1 ? 0 : 0,
            }}
          >
            {/* Timeline line + icon */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: 36,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: `rgba(${step.color.slice(5, -1)},0.08)`,
                  border: `1.5px solid ${step.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  zIndex: 1,
                }}
              >
                {step.icon}
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    width: 1,
                    flex: 1,
                    background: `linear-gradient(to bottom, ${step.color}, ${steps[i + 1].color})`,
                    opacity: 0.25,
                    minHeight: 24,
                    margin: '4px 0',
                  }}
                />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingBottom: i < steps.length - 1 ? 20 : 0, paddingTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                <span style={{ ...ds.label, color: step.color }}>{step.num}</span>
                <span style={{ color: ds.text, fontWeight: 600, fontSize: '0.88rem', fontFamily: ds.font }}>
                  {step.title}
                </span>
              </div>
              <div style={{ color: ds.muted, fontSize: '0.78rem', fontFamily: ds.font, lineHeight: 1.65 }}>
                {step.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Hub-and-Spoke Diagram */}
      <div
        style={{
          background: ds.panel,
          border: `1px solid ${ds.border}`,
          borderRadius: 12,
          padding: '20px 18px',
        }}
      >
        <div style={{ ...ds.label, color: ds.dim, marginBottom: 16, textAlign: 'center' }}>
          Orchestration Architecture
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <svg
            width="340"
            height="280"
            viewBox="0 0 340 280"
            fill="none"
            style={{ maxWidth: '100%', overflow: 'visible' }}
            aria-label="Hub-and-spoke diagram showing Atlas at center connected to multiple AI models"
          >
            {/* Outer model nodes */}
            {PROVIDERS.filter((p) => p.id !== 'ollama').slice(0, 8).map((prov, i) => {
              const total = 8;
              const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
              const radius = 110;
              const cx = 170 + Math.cos(angle) * radius;
              const cy = 140 + Math.sin(angle) * radius;
              return (
                <g key={prov.id}>
                  {/* Spoke line */}
                  <line
                    x1="170"
                    y1="140"
                    x2={cx}
                    y2={cy}
                    stroke={prov.color}
                    strokeWidth="1"
                    strokeOpacity="0.3"
                    strokeDasharray="3 3"
                  />
                  {/* Animated dot traveling the spoke */}
                  <circle r="2.5" fill={prov.color} fillOpacity="0.8">
                    <animateMotion
                      dur={`${1.2 + i * 0.18}s`}
                      repeatCount="indefinite"
                      path={`M 170 140 L ${cx} ${cy} L 170 140`}
                    />
                  </circle>
                  {/* Model node */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="18"
                    fill="rgba(15,10,30,0.8)"
                    stroke={prov.color}
                    strokeWidth="1.2"
                    strokeOpacity="0.6"
                  />
                  <circle cx={cx} cy={cy} r="5" fill={prov.color} fillOpacity="0.6" />
                  <text
                    x={cx}
                    y={cy + 30}
                    textAnchor="middle"
                    fill={prov.color}
                    fontSize="7"
                    fontFamily="'Inter', sans-serif"
                    fontWeight="600"
                    letterSpacing="0.08em"
                    opacity="0.8"
                  >
                    {prov.name.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* Hub glow */}
            <circle cx="170" cy="140" r="40" fill="rgba(201,162,39,0.04)" />
            <circle cx="170" cy="140" r="34" fill="rgba(201,162,39,0.06)" />

            {/* Hub ring pulse */}
            <circle cx="170" cy="140" r="34" stroke={ds.gold} strokeWidth="1" strokeOpacity="0.3">
              <animate attributeName="r" values="34;40;34" dur="3s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
            </circle>

            {/* Hub circle */}
            <circle cx="170" cy="140" r="30" fill="rgba(15,10,30,0.9)" stroke={ds.gold} strokeWidth="1.5" />

            {/* Hub label */}
            <text
              x="170"
              y="136"
              textAnchor="middle"
              fill={ds.gold}
              fontSize="9"
              fontFamily="'Inter', sans-serif"
              fontWeight="700"
              letterSpacing="0.14em"
            >
              ATLAS
            </text>
            <text
              x="170"
              y="148"
              textAnchor="middle"
              fill="rgba(201,162,39,0.5)"
              fontSize="6"
              fontFamily="'Inter', sans-serif"
              fontWeight="600"
              letterSpacing="0.1em"
            >
              HUB
            </text>
          </svg>
        </div>
        <div
          style={{
            color: ds.dim,
            fontSize: '0.7rem',
            fontFamily: ds.font,
            textAlign: 'center',
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Atlas broadcasts to all models simultaneously. Responses flow back to the Hub for synthesis.
        </div>
      </div>

      {/* Philosophy */}
      <div
        style={{
          background: 'rgba(201,162,39,0.03)',
          border: `1px solid rgba(201,162,39,0.2)`,
          borderRadius: 12,
          padding: '22px 24px',
        }}
      >
        <div style={{ ...ds.label, color: ds.gold, marginBottom: 14 }}>Philosophy</div>
        <blockquote
          style={{
            margin: 0,
            color: ds.text,
            fontSize: '0.9rem',
            fontFamily: ds.font,
            lineHeight: 1.75,
            fontStyle: 'italic',
            borderLeft: `3px solid ${ds.gold}`,
            paddingLeft: 16,
          }}
        >
          "Atlas is not any single AI model. Atlas is the intelligence that emerges when multiple models are filtered through the architecture of YOUR mind."
        </blockquote>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          {[
            {
              heading: 'Plurality, not singularity',
              body: 'Every major AI model has different training data, alignment choices, and emergent behaviors. Relying on one is a single point of failure. Atlas uses all of them as advisors.',
            },
            {
              heading: 'Your lens is the differentiator',
              body: 'Two people could run identical queries through identical models and receive different syntheses from Atlas — because Atlas applies your cognitive signature as the final transformation layer.',
            },
            {
              heading: 'Local sovereignty',
              body: 'The model that speaks to you is always local. Your personal cognitive model never leaves your machine. Only your queries travel to external providers — and only the ones you explicitly enable.',
            },
          ].map((item) => (
            <div
              key={item.heading}
              style={{
                background: ds.inset,
                border: `1px solid ${ds.border}`,
                borderRadius: 7,
                padding: '10px 14px',
              }}
            >
              <div style={{ color: ds.gold, fontWeight: 600, fontSize: '0.8rem', fontFamily: ds.font, marginBottom: 4 }}>
                {item.heading}
              </div>
              <div style={{ color: ds.muted, fontSize: '0.75rem', fontFamily: ds.font, lineHeight: 1.6 }}>
                {item.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'dashboard' | 'roster' | 'monitor' | 'howto';

export default function ModelHubChamber() {
  // Atlas store (read docName or user info if needed in the future)
  const _atlasStore = useAtlasStore();

  // Active tab
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // Tier plan
  const [tierPlan, setTierPlan] = useState<TierPlan>('free');

  // Model list (local state — hydrated from backend or fallback constants)
  const [models, setModels] = useState<ModelDef[]>(MODELS);

  // Provider definitions with hydrated hasApiKey state
  const [providers] = useState<ProviderDef[]>(PROVIDERS);

  // Per-provider UI state: apiKey, connectionStatus, expanded
  const [providerStates, setProviderStates] = useState<Record<ProviderID, ProviderState>>(() => {
    const stored = loadStoredKeys();
    const init: Partial<Record<ProviderID, ProviderState>> = {};
    PROVIDERS.forEach((p) => {
      init[p.id] = {
        apiKey: stored[p.id] ?? '',
        connectionStatus: 'idle',
        expanded: false,
      };
    });
    return init as Record<ProviderID, ProviderState>;
  });

  // Orchestration monitor data — null until real data arrives from backend
  const [orchResult, setOrchResult] = useState<OrchestrationResult | null>(null);

  // ── Effects ──────────────────────────────────────────────────────────────

  // Attempt to hydrate models from backend; fall back to constants silently
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/models', { signal: controller.signal, credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ModelDef[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setModels(data);
        }
      })
      .catch(() => {
        // Backend not running — constants are already loaded
      });
    return () => controller.abort();
  }, []);

  // Attempt to load last orchestration result
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/orchestration/last', { signal: controller.signal, credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: OrchestrationResult) => {
        if (data && data.query) {
          // Attach expanded: false to each response
          const hydrated: OrchestrationResult = {
            ...data,
            responses: data.responses.map((r) => ({ ...r, expanded: false })),
          };
          setOrchResult(hydrated);
        }
      })
      .catch(() => {
        // No orchestration data available — leave as null for empty state
      });
    return () => controller.abort();
  }, []);

  // ── Callbacks ────────────────────────────────────────────────────────────

  const handleToggleModel = useCallback((modelId: string) => {
    setModels((prev) =>
      prev.map((m) => (m.id === modelId ? { ...m, enabled: !m.enabled } : m))
    );
  }, []);

  const handleKeyChange = useCallback((providerId: ProviderID, key: string) => {
    setProviderStates((prev) => {
      const next = { ...prev, [providerId]: { ...prev[providerId], apiKey: key } };
      // Persist to localStorage
      const allKeys: Record<string, string> = {};
      (Object.keys(next) as ProviderID[]).forEach((pid) => {
        if (next[pid].apiKey) allKeys[pid] = next[pid].apiKey;
      });
      saveStoredKeys(allKeys);
      return next;
    });
  }, []);

  const handleTestConnection = useCallback(async (providerId: ProviderID) => {
    setProviderStates((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], connectionStatus: 'testing', errorMsg: undefined },
    }));

    try {
      const res = await fetch(
        `/api/v1/models/check?provider=${providerId}`,
        { signal: AbortSignal.timeout(6000), credentials: 'include' }
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json() as { available?: boolean };
      if (data.available) {
        setProviderStates((prev) => ({
          ...prev,
          [providerId]: { ...prev[providerId], connectionStatus: 'connected' },
        }));
      } else {
        setProviderStates((prev) => ({
          ...prev,
          [providerId]: {
            ...prev[providerId],
            connectionStatus: 'error',
            errorMsg: 'API key not configured',
          },
        }));
      }
    } catch {
      // Backend unavailable — report honestly instead of random simulation
      setProviderStates((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          connectionStatus: 'error',
          errorMsg: 'Backend unavailable — cannot test connectivity',
        },
      }));
    }
  }, []);

  const handleToggleProviderExpand = useCallback((providerId: ProviderID) => {
    setProviderStates((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], expanded: !prev[providerId].expanded },
    }));
  }, []);

  const handleToggleResponseExpand = useCallback((modelId: string) => {
    setOrchResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        responses: prev.responses.map((r) =>
          r.modelId === modelId ? { ...r, expanded: !r.expanded } : r
        ),
      };
    });
  }, []);

  // ── Tab Config ───────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; badge?: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'roster', label: 'Model Roster', badge: String(models.filter((m) => m.enabled).length) },
    { id: 'monitor', label: 'Monitor' },
    { id: 'howto', label: 'How It Works' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        fontFamily: ds.font,
        background: ds.body,
        minHeight: '100%',
        color: ds.text,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Chamber Header */}
      <div
        style={{
          borderBottom: `1px solid ${ds.border}`,
          padding: '18px 24px 0',
          background: ds.panel,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
              {/* Atlas Hub SVG Icon */}
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="9" stroke={ds.gold} strokeWidth="1.2" strokeOpacity="0.5" />
                <circle cx="11" cy="11" r="5" fill="rgba(201,162,39,0.15)" stroke={ds.gold} strokeWidth="1.2" />
                <circle cx="11" cy="11" r="2" fill={ds.gold} />
                <line x1="11" y1="2" x2="11" y2="5" stroke={ds.gold} strokeWidth="1" strokeOpacity="0.5" />
                <line x1="11" y1="17" x2="11" y2="20" stroke={ds.gold} strokeWidth="1" strokeOpacity="0.5" />
                <line x1="2" y1="11" x2="5" y2="11" stroke={ds.gold} strokeWidth="1" strokeOpacity="0.5" />
                <line x1="17" y1="11" x2="20" y2="11" stroke={ds.gold} strokeWidth="1" strokeOpacity="0.5" />
              </svg>
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: ds.text,
                  letterSpacing: '0.01em',
                }}
              >
                Model Hub
              </h1>
            </div>
            <p
              style={{
                margin: 0,
                color: ds.muted,
                fontSize: '0.75rem',
                lineHeight: 1.5,
                maxWidth: 480,
              }}
            >
              Multi-model orchestration command center. Atlas queries all enabled models simultaneously
              and synthesizes through your personal cognitive lens.
            </p>
          </div>

          {/* Live stats */}
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...ds.label, color: ds.dim, marginBottom: 3 }}>Active Models</div>
              <div style={{ color: ds.gold, fontWeight: 700, fontSize: '1.2rem', lineHeight: 1 }}>
                {models.filter((m) => m.enabled).length}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...ds.label, color: ds.dim, marginBottom: 3 }}>Providers</div>
              <div style={{ color: ds.violet, fontWeight: 700, fontSize: '1.2rem', lineHeight: 1 }}>
                {providers.length}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav style={{ display: 'flex', gap: 0 }}>
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active
                    ? `2px solid ${ds.gold}`
                    : '2px solid transparent',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  color: active ? ds.text : ds.muted,
                  fontSize: '0.8rem',
                  fontFamily: ds.font,
                  fontWeight: active ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'color 150ms ease, border-color 150ms ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
                {tab.badge && (
                  <span
                    style={{
                      ...ds.label,
                      color: active ? ds.gold : ds.dim,
                      background: active ? 'rgba(201,162,39,0.1)' : 'rgba(226,232,240,0.06)',
                      borderRadius: 10,
                      padding: '1px 6px',
                      fontSize: '0.6rem',
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div
        style={{
          flex: 1,
          padding: '22px 24px',
          overflowY: 'auto',
        }}
      >
        {activeTab === 'dashboard' && (
          <DashboardTab
            models={models}
            providers={providers}
            providerStates={providerStates}
            onToggleModel={handleToggleModel}
            onKeyChange={handleKeyChange}
            onTestConnection={handleTestConnection}
            onToggleProviderExpand={handleToggleProviderExpand}
            tierPlan={tierPlan}
            onTierChange={setTierPlan}
          />
        )}
        {activeTab === 'roster' && (
          <RosterTab
            models={models}
            providerStates={providerStates}
            onToggleModel={handleToggleModel}
          />
        )}
        {activeTab === 'monitor' && (
          <MonitorTab
            result={orchResult}
            onToggleResponseExpand={handleToggleResponseExpand}
          />
        )}
        {activeTab === 'howto' && <HowItWorksTab />}
      </div>
    </div>
  );
}
