<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Obsidian Atlas

Production site: [obsidianatlastech.com](https://obsidianatlastech.com). Local development uses Vite on port **3000** with `/api` and `/auth` proxied to the Fastify backend on **3001** (see `vite.config.ts`). A **Cloudflare Tunnel** can expose `localhost:3000` publicly; set `NEXTAUTH_URL`, `AUTH_URL`, and `APP_URL` to `https://obsidianatlastech.com` in `.env.local` and `atlas-backend/.env`, and register the OAuth redirect URI `https://obsidianatlastech.com/auth/google/callback` in Google Cloud Console.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run [Ollama](https://ollama.com/) locally and install at least one model (`ollama pull …` or a custom Modelfile). With `npm run dev`, chat and `/api/tags` go through a **Vite proxy** at `/ollama` by default (no CORS). In `.env.local`, keep **a single** `OLLAMA_MODEL=` line whose value matches one entry from `ollama list` (remove duplicates or commented alternatives). If only one model is installed, you can omit `OLLAMA_MODEL`. Override `OLLAMA_CHAT_URL` only if you need a non-default Ollama address.
3. Run the app:
   `npm run dev`

## Atlas backend (local runtime)

The **API-first** stack (Fastify, SQLite, JSONL, `ModelProvider` → Ollama) lives in [`atlas-backend/`](atlas-backend/README.md). It is separate from the Vite UI (`src/` at repo root). See that README for layout, data paths, and `curl` examples.
