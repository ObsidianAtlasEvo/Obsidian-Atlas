import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import type { EvalResult } from './evalEngine.js';

export type SftMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface SftJsonlRow {
  id: string;
  userId: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  meta: {
    exchangeTraceId: string;
    evaluation: EvalResult;
    createdAt: string;
  };
}

function sftPath(userId: string): string {
  const dir = path.join(env.dataDir, 'datasets', userId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'sft.jsonl');
}

/**
 * TRL-friendly conversational lines: `messages` uses chat roles for SFTTrainer chat templates.
 */
export function appendApprovedSftExample(input: {
  userId: string;
  exchangeTraceId: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  evaluation: EvalResult;
}): SftJsonlRow {
  const row: SftJsonlRow = {
    id: randomUUID(),
    userId: input.userId,
    messages: input.messages,
    meta: {
      exchangeTraceId: input.exchangeTraceId,
      evaluation: input.evaluation,
      createdAt: new Date().toISOString(),
    },
  };
  fs.appendFileSync(sftPath(input.userId), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

/**
 * HuggingFace TRL conversational line only: `{"messages":[...]}` (no meta) for `atlas_sft.jsonl`.
 */
export function appendAtlasSftJsonl(messages: SftMessage[]): void {
  const dir = path.join(env.dataDir, 'datasets');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'atlas_sft.jsonl');
  const line = JSON.stringify({ messages });
  fs.appendFileSync(file, `${line}\n`, 'utf8');
}
