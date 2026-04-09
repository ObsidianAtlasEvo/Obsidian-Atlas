# Atlas v1 — self-evolution runtime

## What Atlas is

**Atlas** is a local-first “self-evolution” assistant runtime: a small **Fastify** service that talks to **Ollama** (or a compatible HTTP API), persists **memories**, **policies**, and **traces** in **SQLite**, and **accumulates evaluation-gated** supervised examples as **JSONL** for optional **per-user LoRA** fine-tunes. The repo’s Vite UI can live alongside this package; this folder is the **API-first** spine.

## Why local models

Running chat and embeddings **on your machine** (via Ollama today) keeps prompts, memories, and training data **off third-party inference** by default, reduces latency on a capable GPU, and matches a **sovereign** deployment story: the same code paths can later point at vLLM or other local servers without changing the app’s contract.

## Current architecture

| Piece | Role |
|--------|------|
| **Fastify** | HTTP API: health, chat, policy hooks as implemented in `src/routes/`. |
| **Zod env** | Fail-fast configuration (`PORT`, `OLLAMA_*`, thresholds, SQLite path). |
| **SQLite** | `memories`, `policy_profiles`, `traces` (and related schema) via `better-sqlite3`. |
| **Model provider** | Ollama client: chat + embeddings against `OLLAMA_BASE_URL`. |
| **Memory / eval / context** | Heuristic extraction, rule-based scoring, context assembly before the model call. |
| **Dataset writer** | Appends rows to `data/datasets/<userId>/sft.jsonl` when the eval gate approves. |

## How memory-based evolution works

1. Each chat turn can yield **memory candidates** (e.g. stable preferences, facts).
2. An **eval engine** scores the exchange and candidates against simple rules and thresholds.
3. Approved memories are **stored** and surfaced later by the **context assembler** so the model sees concise, structured recall — without automatic global retraining.

## How dataset accumulation works

When an exchange (and optional candidates) pass the **dataset gate**, the backend **appends** a line to `data/datasets/{userId}/sft.jsonl`. Each line is a JSON object with a **`messages`** array (chat turns), optionally **`meta`** (scores, ids, timestamps). This file is **append-only staging** for training; it is not sent to a cloud trainer by default.

## How future LoRA adaptation works

The starter script `training/sft/train_lora.py` reads that JSONL, formats dialogs with the tokenizer’s **chat template**, and runs **TRL `SFTTrainer`** with **PEFT LoRA** — producing a **local adapter** per user (or per machine). Serving that adapter (merge, Modelfile, or vLLM) is a **separate** integration step; the runtime today is **Ollama + SQLite + JSONL**.

## Setup

```bash
cd atlas-backend
cp .env.example .env   # if present; otherwise set env vars manually
npm install
```

Ensure **Ollama** is running and models named in `.env` exist (`ollama pull …`).

## Run

```bash
npm run dev
# or: npm run build && npm start
```

- **GET** `/health` — liveness.
- **POST** `/chat` — same behavior as **POST** `/v1/chat` (alias implemented in `src/index.ts`).
- **POST** `/v1/chat` — body `{ "userId", "messages": [{ "role", "content" }] }` (see route implementation for exact schema).

Startup logs a one-line summary with port and route list.

## Current limitations

- **Heuristic** memory extraction and **rule-based** eval — not a learned reward model.
- **No** built-in distributed training or hosted fine-tune pipeline.
- **Adapter serving** after LoRA is manual (Ollama/vLLM wiring not bundled here).
- **Single-tenant focus** per data directory; production hardening (auth, quotas, encryption) is not implied.

## Next milestone

Wire **optional** loading of a **user-local merged model or adapter** into the configured Ollama tag (or sidecar vLLM), driven by `userId` and a small **adapter registry** in SQLite — so approved SFT rows can close the loop from **JSONL → train → inference** without leaving the machine.
