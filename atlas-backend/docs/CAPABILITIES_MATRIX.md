# Deployment capabilities matrix

This table is the engineering-facing source of truth for what each deployment profile actually does today. Marketing copy should not claim rows that are false here.

| Capability | Local (sovereign + Ollama) | Direct Groq (cloud single-lane) | Swarm / multi-agent |
| --- | --- | --- | --- |
| Chat completion | Local model via Ollama | Groq OpenAI-compatible stream | Groq + optional Gemini / registry steps |
| System prompt stack | `buildPrimedChatSystemPrompt` + posture + optional semantic vault + policy layering | Same unified assembly (`buildUnifiedOmniSystemPrompt`) | Planner-chosen steps; substrate may vary by route |
| Truth ledger in prompt | Yes (`truth_entries` + structured claims when present) | Yes (same primed pack) | Yes when routed through omni / sovereign lanes that include primed pack |
| Semantic memory vault recall | When embeddings work (`retrieveRelevantMemories`) | Same when embeddings work | Route-dependent |
| Evolution engine (Supabase) | Optional; off if env unset | Optional | Optional |
| Governance console (SQLite gaps, audit, changes) | Yes | Yes | Yes |
| Rate limits / 429 | Ollama / host limits | Provider returns `provider_rate_limit` SSE + UI copy | Same as cloud path |
| Degraded mode (no Supabase) | Console banner: remote evolution features empty | Same | Same |

**Env notes**

- Ollama base URL: set `OLLAMA_BASE_URL` or legacy `OLLAMA_URL` (backend normalizes trailing `/api`).
- Optional: `POST_REPLY_EPISTEMIC_RECHECK` (`off` | `rules` | `llm`), `OMNI_SSE_INCLUDE_RULES_EVAL_IN_DONE`.

**Automated check**

- `npm run contract:truth-ledger` — asserts a `truth_entries` row appears in both primed and unified omni system prompts.
