# Reality Audit — 2026-07-19

Audit of the repository against the Canonical Master Vision ("Obsidian Atlas Vision"), conducted per §XXXIV (Required Working Method). Method: inspected routing (`src/components/shell/ChamberView.tsx`), chamber source, store persistence, backend route registration (`atlas-backend/src/index.ts`), and service inventory. No runtime probing was performed in this pass; states below are source-audited, not runtime-confirmed.

## 1. System map (summary)

The product is two substantial halves that barely touch:

**Frontend** (React 19 / Vite / Zustand / Dexie): 63 routed modes. ~34 render real chambers with local-only persistence, ~6 alias other chambers, ~20 rendered placeholders before this audit. A parallel set of unrouted view components (`SalonView`, `StrategicModelingWorkbench`, `PrivacyCenter`, `DriftView`, `CognitiveSignature`, …) exists as dead code alongside a legacy `Lazy*` export system in `lazyChamberModules.tsx`.

**Backend** (Fastify / SQLite / Ollama): a genuinely governed spine — versioned constitutional clauses with supersession lineage, memory extraction with eval gating, context assembly, orchestration, migration locks/canary/rollback, retention and erasure executors, registered routes for trajectory, friction, threshold protocols, sovereign overview, cognitive graph, and forge.

## 2. Central finding

**Exactly one chamber (Model Hub) calls atlas-backend.** The primary Atlas conversation streams browser→Ollama directly (`src/lib/ollama.ts`), bypassing the §VI pipeline entirely: no intent classification, no context curation, no memory extraction, no constitutional review, no orchestration trace. The backend's governance machinery runs for no one; the frontend's chambers persist locally and feed nothing. This is the systemic-integrity failure §XXXII names: two halves, each real, forming "another isolated semi-product."

Secondary findings:

- **No Reality Spine existed** (§IX). No implementation-state tracking anywhere in code. The only artifact named for it, `src/components/RealityLedger.tsx`, was unrouted dead code containing fabricated metrics ("Calibration Score 68%", "Primary Bias Detected") — a direct violation of the prohibition on fake system health.
- **State-incongruent navigation**: Home and Global Search advertised a "Truth Ledger" that opened a generic placeholder; the prefetch map warmed `CoreSystemsView` for that route while the router rendered neither.
- **Identity residue**: the package was named `react-example`; `src/constants.ts` still carries demo mock entities (Sarah Miller / MicroRGB) from the template era.
- **Constitution split-brain**: a local-only Constitution chamber and a governed backend constitution service exist simultaneously, disconnected — two sources of highest-order law, neither aware of the other.

## 3. Changes made in this pass

1. **`src/reality/realitySpine.ts` (new)** — canonical §IX implementation states (`VISION_ONLY` → `PRODUCTION_READY`/`DEGRADED`/`RETIRED`) and a total, compiler-enforced `Record<ActiveMode, FeatureRecord>` classifying all 63 modes with evidence and gaps. A mode cannot be added to the interface without declaring its reality here — `tsc` fails otherwise. No state above `PARTIALLY_INTEGRATED` is claimed anywhere, because none has been verified.
2. **`src/chambers/RealityLedgerChamber.tsx` (new)** — real chamber at `reality-ledger` rendering the spine: state summary, per-domain grouping, expandable evidence and next-state gaps, the ledger's own limits stated in its footer. Replaces the placeholder; the "Truth Ledger" entries on Home and Global Search now lead somewhere true.
3. **`ChamberView.tsx`** — routed `reality-ledger` to the new chamber.
4. **`lazyChamberModules.tsx`** — prefetch for `reality-ledger` now loads the correct chunk; stale audit comment corrected.
5. **`PlaceholderChamber.tsx`** — now state-congruent: shows the spine's true state (e.g. `BACKEND_ONLY`, `DOCTRINE_DEFINED`) and evidence for its route instead of an undifferentiated "Under Construction", and links to the Reality Ledger. A placeholder whose backend already exists now says so.
6. **`src/components/RealityLedger.tsx` (deleted)** — fabricated-metrics dead code removed (§XXXII: features that cannot justify their existence are removed).
7. **`package.json`** — name corrected to `obsidian-atlas`.

## 4. Priority queue (by user impact × architectural leverage, per §XXXIV.8)

1. **Route Atlas chat through atlas-backend orchestration** — the single change that activates memory extraction, constitutional review, context assembly, and traces for the primary experience. Everything in §VI–§VIII is downstream of this connection.
2. **Unify the constitution** — Constitution chamber reads/writes the backend's versioned clause service; retire the local shadow copy.
3. **Surface Privacy Center** — retention/erasure/holds routes exist; §XXVII requires user inspectability. Wire the existing unrouted `PrivacyCenter.tsx` to them.
4. **Connect Memory Vault to backend memories** with §VII metadata (provenance, confidence, state, correction lineage).
5. **Wire the three BACKEND_ONLY intelligence chambers** (trajectory, friction, threshold) to their live routes — `IntelligenceChambersViews.tsx` already exists unrouted.
6. **Purge template residue** (`constants.ts` mock entities) and reconcile the legacy `Lazy*` system with ChamberView routing.
7. **Runtime confirmation pass** — probe endpoints and chamber flows; only then may any spine entry rise above `PARTIALLY_INTEGRATED`.

## 5. Honest completion statement (§XXXIV.13)

**Complete and verified by typecheck:** items in §3; `tsc --noEmit` passes for frontend and backend.
**Unverified:** runtime behavior and production build — this session's environment could not execute Vite/Vitest (Windows-installed native binaries, sandboxed registry). Run `npm run lint && npm run test && npm run build` locally before merging.
**Not attempted (deferred, with reasons):** everything in §4 — each is a real integration requiring runtime verification that this environment cannot provide; claiming them without it would violate the constitution this audit serves.

## 6. Architectural effect (§XXXIV.14)

The Reality Spine inverts the repository's default failure mode. Until now, the interface could silently promise more than the system was; from now on, every route carries a typed, evidenced, user-visible classification, and upgrading a claim requires editing a single audited file. The ledger is itself listed in the ledger, with its own gaps. The next structural act should be priority 1 above: making the governed backend the spine of the actual conversation, so that continuity, truth, and memory stop being parallel constructs and become the same system.

---

## Addendum — same-day follow-up pass

### 7. Priority 1 closed: Atlas chamber now routes through the governed backend

`src/chambers/AtlasChamber.tsx` streamed browser→Ollama directly via `src/lib/ollama.ts`. Added `src/lib/atlasOmniStream.ts`, a streaming client for `POST /v1/chat/omni-stream` (quota gating, policy profile, swarm/consensus routing, quality gate, async Overseer lens + evolution trigger), and rewired `AtlasChamber` to use it. Same change fixed a latent bug: the chamber's "Stop generation" button updated UI state but never actually aborted the in-flight stream, because the request-lifecycle `AbortController` (`useChatRequestState`) was never connected to the fetch that `streamChat` created internally. `atlasOmniStream.ts` accepts an external `signal` for exactly this reason; abort now actually cancels the request.

`src/reality/realitySpine.ts`'s `atlas` entry is updated accordingly: `PARTIALLY_INTEGRATED` → `INTEGRATED_UNVERIFIED`. Not raised further — `tsc --noEmit` and `vite build` pass, but no live run against a deployed backend + provider stack was performed in this environment. Per the ledger's own rule, `RUNTIME_CONFIRMED` may not be claimed from memory.

### 8. New finding: a second, disconnected component architecture

While tracing why `today-in-atlas` (labeled "Home" everywhere it's referenced — `Sidebar.tsx`, `GlobalSearch.tsx`, `CapabilitiesView.tsx`) didn't appear to call the backend despite last session's `.env.production` comment claiming it lands users on "Home (Groq via omni-stream)": that mode is routed by `ChamberView.tsx` to `PulseChamber`, which has zero backend calls. The component the comment actually describes — `src/components/HomeView.tsx`, 1471 lines, genuinely wired to `/v1/chat/omni-stream` with routing-provenance UI and resonance context — is never imported by `ChamberView` or any live route. It is orphaned.

Pulling this thread further: `src/components/` contains at least 36 files (`HomeView.tsx`, `TodayInAtlas.tsx`, `Sidebar.tsx`, `GlobalSearch.tsx`, `SovereignAtrium.tsx`, `ConsoleView.tsx`, `DriftView.tsx`, `GapLedger.tsx`, `ResonanceChamber.tsx`, and more) built against an older prop-drilled architecture (`{ state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> }`), some duplicating the name of a live, Zustand-hook-based chamber in `src/chambers/`. A parallel `src/modules/action-modules/` tree and `src/components/lazyChamberModules.tsx`'s `Lazy*` exports reference this older tree. Almost none of it appears reachable from `AppShell` → `ChamberView`, which is the only router actually mounted by `App.tsx`. This is a second, larger instance of the systemic-integrity failure named in §2 above (real code, disconnected from what runs) — the prior audit's "legacy `Lazy*` export system... dead code" note undersold its size.

**Not attempted this pass, and why:** reconciling or wiring in a ~1500-line component with unverified dependencies (`useSettingsStore`, `ResonanceEngine`, an `InteractionSignal` type, a full `state`/`setState` bridge to the Zustand store) without the ability to run the app and click through it in this environment would risk shipping an unverified, possibly-broken surface while claiming it as an improvement — exactly what §XXXI/§XXXII prohibit. This is recorded as the new top priority instead of being rushed.

### 9. Revised priority queue

1. **Reconcile or retire the `src/components/` legacy tree** (§8). Decide, file by file: promote to a real route (with a runtime verification pass), or delete as dead weight per §XXXII ("a feature that cannot justify its existence should be merged, redesigned, hidden, or removed"). `HomeView.tsx` vs `PulseChamber` for `today-in-atlas` is the first decision this forces.
2. **Runtime confirmation pass on the Atlas chamber's new backend path** (§7) — run the app against a live atlas-backend + at least one provider, send a real message, confirm the SSE events, the Overseer/evolution side effects, and the abort fix, before claiming `RUNTIME_CONFIRMED`.
3. Original priorities 2–6 from §4 above remain open and unchanged (unify the constitution; surface Privacy Center; connect Memory Vault; wire the three `BACKEND_ONLY` intelligence chambers; purge template residue in `constants.ts`).

### 10. Honest completion statement for this pass

**Complete and verified by typecheck/build:** `atlasOmniStream.ts` added; `AtlasChamber.tsx` rewired; `tsc --noEmit` (web + backend) and `vite build` pass. Reality Spine and env-var comments updated to match.
**Unverified:** runtime behavior of the new Atlas-chamber path — same environment limitation as the prior pass (no Vite/Vitest dev-server execution available here). Run the app locally against atlas-backend and confirm before wider release.
**Not attempted (deferred, with reasons):** the `src/components/` legacy-tree reconciliation (§8/§9.1) — real, large, and requires runtime verification this environment cannot provide.

---

## Addendum 2 — HomeView vs PulseChamber, resolved

### 11. Decision: retire `src/components/HomeView.tsx`; keep PulseChamber

Investigated the first item of the revised priority queue (§9.1): decide `HomeView.tsx` vs `PulseChamber` for the `today-in-atlas` ("Home") route. Read both fully.

**`PulseChamber.tsx`** (393 lines, live, routed for both `pulse` and `today-in-atlas`): greeting, session-intent picker, quick stats, a pulse-item list with add/remove, a "Begin Session" handoff into the Atlas chamber. Small, but real, on-brand, and styled with this repo's actual live design system (CSS custom properties from `atlas-tokens.css` + inline styles — the same idiom `AtlasChamber.tsx` uses).

**`HomeView.tsx`** (1471 lines, unrouted): a genuinely richer concept — three-column layout, live inquiry surface wired to `/v1/chat/omni-stream`, favorites, quick access, a background `AtlasGraph`, routing-provenance display. On functionality alone this reads closer to Vision §XI's description of Home. But every visual surface in it is built from Tailwind utility classes against a design system that does not exist in this repository: `gold-500`, `ivory`, `stone`, `obsidian-surface`, `glass-obsidian`, `instrument-label`, and similar tokens appear nowhere in `atlas-tokens.css`, `src/index.css`, or any Tailwind `@theme` block (checked directly — grepped for `@theme` across the repo: zero matches; grepped for `.glass-obsidian`/`.obsidian-surface`/`.instrument-label` definitions: zero matches). 80 files under `src/components/` use this same vocabulary; zero files under the live `src/chambers/` tree do. These are two different, incompatible design systems, and only one of them is connected to real CSS. Mounting `HomeView` today would render an unstyled, broken-looking page — the exact "beautiful interface concealing shallow logic" (inverted: shallow *appearance* concealing real logic) that §XXXI/§XXV exist to prevent, just discovered before shipping instead of after.

Its unique dependencies (`AtlasGraph.tsx`, `LayeredResponse.tsx`, `DirectiveIntake.tsx`) were checked: `LayeredResponse` and `DirectiveIntake` have no other importers (dead once `HomeView` is gone); `AtlasGraph` is also imported by `src/chambers/AtlasGraphView.tsx` and a duplicate `src/components/AtlasGraphView.tsx` — neither of which is routed in `ChamberView.tsx` either, so `AtlasGraph` was already effectively dead. None of these were deleted in this pass (scope discipline: the ask was to resolve the Home/Pulse duplication specifically, not to clear the whole legacy tree) — they're noted here so the next pass doesn't have to re-derive it.

**Action taken:** deleted `src/components/HomeView.tsx` (`git rm`, so it's recoverable from history, not silently gone). Updated `src/reality/realitySpine.ts`: `today-in-atlas` no longer lists the orphan as an open gap — it lists the retirement and why, plus a note that a real richer Home is still open work, to be built against the live design system next time, not by reviving the deleted file. Added a matching note to the `pulse` entry that it's still deliberately aliased with `today-in-atlas` (one component, two entry points) pending that future work. `tsc --noEmit` (web + backend) and `vite build` pass after the deletion.

**What this did not do:** it did not build the richer Home surface Vision §XI actually asks for (priorities, unfinished business, relevant memory, system health, one meaningful thread). `PulseChamber` remains a minimal placeholder for that ambition, honestly labeled as such in the ledger. That is real, scoped, future work — building it against `atlas-tokens.css` conventions, most likely reusing the inquiry-surface pattern now proven in `AtlasChamber.tsx`/`atlasOmniStream.ts` rather than reviving any of the deleted Tailwind-era code.

### 12. Revised priority queue

1. **Build a real Home surface for `today-in-atlas`**, in the live design system, using `atlasOmniStream.ts` for any inquiry surface it includes. Un-alias it from `pulse` once it exists as its own thing.
2. Runtime confirmation pass on the Atlas chamber's backend path (§9.2, unchanged).
3. Original priorities 2–6 from §4 (unify the constitution; surface Privacy Center; connect Memory Vault; wire the three `BACKEND_ONLY` intelligence chambers; purge template residue in `constants.ts`) remain open.
4. Eventually: audit the rest of `src/components/` (~76 remaining files) against the same "does its design system exist" test applied here, and against whether `ChamberView.tsx` actually routes to it. Expect most of it to be dead by the same criterion.

---

## Addendum 3 — legacy tree retired; first real runtime pass

### 13. The orphaned `src/components/` tree: measured, then retired

Wrote a module-graph reachability walk (static + dynamic imports, `@/` alias resolution) rooted at the real entry point (`index.html` → `src/main.tsx` — verified the only entry). Result: **53 files are reachable; not one file in flat `src/components/` is among them.** The live app is exactly `App.tsx` → `AppShell` → `NavRail`/`ChamberView` → 30 chambers in `src/chambers/` + their `src/lib`, `src/store`, `src/hooks`, `src/reality` support. Everything else — 80 files in `src/components/` (except `shell/`), 49 one-line re-export bridge shims in `src/chambers/`, and all of `src/modules/action-modules/` — was unreachable from the running application. No test file imported any of it either (the repo's only two test files cover `atlasWayfinding` and `atlasWorkspacePersistence`).

Applied §XXXII ("a feature that cannot justify its existence should be merged, redesigned, hidden, or removed"): **deleted all three groups via `git rm`** (~21,000 lines; recoverable from history). This includes the previously-noted `LayeredResponse`, `DirectiveIntake`, `AtlasGraph`, both `AtlasGraphView` copies, `PrivacyCenter`, `IntelligenceChambersViews` (556 lines, backend-wired — a real loss candidate, but it imported `AtlasPanel` and `atlasAuthContext` from the same dead tree and styles itself in the nonexistent Tailwind vocabulary; rebuilding it against the live design system remains the §4 priority it always was), `ErrorBoundary`, `GlobalSearch`, `Sidebar`, and `lazyChamberModules` — dead names that Atlas-Audit comments across the repo still reference as if live. Verified after deletion: `tsc --noEmit` (web + backend), `vite build`, and `vitest run` (17/17) all pass.

One knock-on: `isAtlasAuthDisabled()` in `src/lib/atlasApi.ts` now has zero consumers — its only user (`AuthGuard`) died with the tree. `VITE_ATLAS_AUTH_DISABLED` is therefore currently a no-op env var. Left in place pending a decision (delete it, or wire the live `AuthChamber` to honor it for dev).

### 14. First real runtime pass (local backend + local Ollama)

Ran the stack in this session: `atlas-backend` under `tsx`, Vite dev server, Ollama daemon with `llama3.1:8b-instruct-q8_0` present.

**Finding (fixed): `npm run dev` ran the wrong backend.** `atlas-backend`'s `dev` script pointed at `src/server.ts` — a "lite" server registering only health/embeddings/models/orchestrate/governance-console. No omni-stream, no auth, no sovereignty, no memory routes. Every dev session was exercising an unrepresentative backend while production (`start` → `dist/index.js`) runs the full one. The first curl of this pass 404'd on `/v1/chat/omni-stream` because of exactly this (plus a Windows subtlety: the lite server's `127.0.0.1:3001` bind coexisted with the full server's later `0.0.0.0:3001` bind, and loopback traffic went to the lite one). Fixed: `dev` now runs `tsx watch src/index.ts`; the lite server remains available as `dev:lite`.

**Backend contract: runtime-confirmed.** POST `/v1/chat/omni-stream` with the exact body shape `atlasOmniStream.ts` sends (userId, posture, lineOfInquiry, messages), on the sovereign local lane (via the code's own `ATLAS_TRUST_ROUTING_EMAIL_HEADER` dev mechanism — set as process env for the test run only, not persisted):

- SSE sequence observed: `status` (routing) → `routing` {mode: direct_qa, posture: 1, lineOfInquiry: atlas-chamber} → `route` {strategy: god_mode_local} → `delta` tokens (real streamed inference) → `done` {traceId, requestId, reply, surface: god_mode_local, model: llama3.1:8b-instruct-q8_0, evolution: scheduled}. HTTP 200 after ~39 s of genuine local inference.
- These are precisely the events the new client parses. The public cloud lane was also exercised and produced the honest failure chain: `route` {strategy: direct, rationale: chief_http_401} → `error` (Groq 401).
- Post-turn side effects observed in server logs: Overseer lens ran async after `done` and failed on the dead Groq key **non-fatally**, falling back to the evolution trigger with the raw response — the exact degradation path the code promises.
- The degraded-mode oracle + auto-recovery orchestrator ran unprompted, correctly diagnosing the two dead credentials and reporting `DEGRADED` on `/health` instead of pretending health (§IV state-congruence, observed working).

**Environment findings (not code defects):** the Groq API key and Supabase key configured on this machine both return 401 — dead/rotated credentials. Cloud lanes and Supabase-backed persistence can't be verified until they're replaced.

**Not completed: the browser click-through.** The app boots to the local `AuthChamber` (renders correctly; verified via page inspection). Creating the local instance requires entering a password, which the operator must do — an assistant must not create accounts or enter credentials. The frontend half of the runtime pass (send a message from the real chamber UI, watch tokens stream, verify abort now actually cancels, verify persistence) resumes the moment a local session exists. Accordingly the `atlas` spine entry keeps `INTEGRATED_UNVERIFIED` with narrowed, precise gaps: the backend contract is confirmed; the UI traversal is not.

### 15. Honest completion statement for this pass

**Complete and verified:** legacy-tree deletion (typecheck + build + tests green); dev-script fix; backend omni-stream contract runtime-confirmed on the local lane with real streamed inference; degraded-mode honesty observed live.
**Blocked on operator:** browser click-through of the Atlas chamber (local login), Groq/Supabase key rotation for cloud-lane verification.
**Unchanged:** priorities in §12; `atlas` remains `INTEGRATED_UNVERIFIED` until the UI traversal completes.
