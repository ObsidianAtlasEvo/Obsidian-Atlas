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
