// ── Google Gemini Provider ────────────────────────────────────────────────────
// Implements ModelProvider using Google's Generative Language REST API.
// Role mapping: 'system' → systemInstruction field; 'user' → 'user';
// 'assistant' → 'model' (Gemini's name for assistant turns).

import type { ModelProvider, ProviderMessage, CompletionOptions, CompletionResult } from './base.js';

const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

// ── Google API types ──────────────────────────────────────────────────────────

interface GooglePart {
  text: string;
}

interface GoogleContent {
  role: 'user' | 'model';
  parts: GooglePart[];
}

interface GoogleSystemInstruction {
  parts: GooglePart[];
}

interface GoogleGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
}

interface GoogleRequest {
  contents: GoogleContent[];
  systemInstruction?: GoogleSystemInstruction;
  generationConfig: GoogleGenerationConfig;
}

interface GoogleCandidate {
  content: GoogleContent;
  finishReason: string;
}

interface GoogleUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface GoogleResponse {
  candidates: GoogleCandidate[];
  usageMetadata?: GoogleUsageMetadata;
}

interface GoogleErrorBody {
  error?: { message?: string; status?: string };
}

/** Strip the 'google/' prefix to get the raw Gemini model name. */
function rawModelName(modelId: string): string {
  return modelId.startsWith('google/') ? modelId.slice(7) : modelId;
}

export class GoogleProvider implements ModelProvider {
  readonly id = 'google';
  readonly name = 'Google';

  async complete(
    messages: ProviderMessage[],
    options: CompletionOptions,
  ): Promise<CompletionResult> {
    const apiKey = process.env['GOOGLE_API_KEY'];
    if (!apiKey) {
      throw new Error(
        'Google API key not configured. Set the GOOGLE_API_KEY environment variable.',
      );
    }

    const modelName = rawModelName(options.model);
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 30_000;

    // Separate system instruction from conversation messages
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Map roles: 'assistant' → 'model'
    const contents: GoogleContent[] = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Google requires the conversation to start with a 'user' turn.
    // If it doesn't, prepend a dummy to avoid API errors.
    if (contents.length === 0 || contents[0]?.role !== 'user') {
      contents.unshift({ role: 'user', parts: [{ text: '.' }] });
    }

    const body: GoogleRequest = {
      contents,
      ...(systemMessage
        ? { systemInstruction: { parts: [{ text: systemMessage.content }] } }
        : {}),
      generationConfig: {
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        maxOutputTokens: options.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      },
    };

    const url = `${GOOGLE_BASE_URL}/${modelName}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Google API error ${response.status}`;
        try {
          const errBody = JSON.parse(errText) as GoogleErrorBody;
          if (errBody.error?.message) errMsg += `: ${errBody.error.message}`;
        } catch {
          errMsg += `: ${errText.slice(0, 200)}`;
        }
        throw new Error(errMsg);
      }

      const data = (await response.json()) as GoogleResponse;
      const candidate = data.candidates?.[0];

      if (!candidate) {
        throw new Error('Google API returned no candidates');
      }

      const textContent = candidate.content.parts
        .map((p) => p.text)
        .join('');

      if (!textContent) {
        throw new Error('Google API returned empty content');
      }

      return {
        content: textContent,
        model: modelName,
        provider: this.id,
        tokensUsed: data.usageMetadata?.totalTokenCount,
        durationMs,
        finishReason: candidate.finishReason,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = process.env['GOOGLE_API_KEY'];
    return Boolean(apiKey && apiKey.length > 0);
  }
}
