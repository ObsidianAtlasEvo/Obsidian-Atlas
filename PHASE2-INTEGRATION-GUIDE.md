# Obsidian Atlas — Governance Integration Guide
## Phases 2, 3 & 4

---

## Phase 2 — Core Governance Layer

### `atlas-governance/constitution/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `mutationConstitution.ts` | 5 immutable + 4 protected articles. Call `validateMutation()` before every evolution commit. | `personalEvolutionEngine.ts` before committing any instruction |
| `mutationLedger.ts` | Append-only ledger. Call `commitMutation()`, `rollbackToSnapshot()`, `takeSnapshot()`. | Evolution engine flush cycle |
| `identityResolution.ts` | Signal classification (durable/contextual/temporary/anomaly) + confidence decay. Call `recordSignal()` per extracted trait, `applyDecay()` on login. | `personalEvolutionEngine.ts`, session hydration |

### `atlas-governance/memory/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `goalMemory.ts` | Goals, projects, open loops, decisions, abandoned paths. Call `getMissionContext()` to inject into Atlas context. | `contextAssembler.ts` — inject alongside user profile |

### `atlas-governance/evidence/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `evidenceArbitrator.ts` | Claim registration, contradiction resolution, staleness expiry. Call `buildEvidenceContext()` for context injection. | `contextAssembler.ts` |
| `uncertaintyTracker.ts` | Uncertainty states and disclosure injection. Call `injectUncertaintyDisclosures()` on every response before it reaches the user. | `AtlasOverseer` / synthesis pipeline |

### `atlas-governance/infrastructure/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `eventBus.ts` | Singleton append-only event bus (35 event types). All subsystems emit here. | Import everywhere — `AtlasEventBus.emit(...)` |
| `concurrencyOrchestrator.ts` | Priority queue + mutex + debounced flush. Wrap the evolution 30s flush in `debounce()`. | `personalEvolutionEngine.ts` flush cycle, graph updates |

### `atlas-governance/transparency/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `userEvolutionControl.ts` | Freeze, revert, reset, inspect evolution. Check `isFrozen()` before any mutation commit. | Evolution engine pre-check |
| `EvolutionControlPanel.tsx` | React UI for the above. Mount inside `MindProfile` or `Settings`. | `MindProfile` chamber or `SovereigntyControls` |

### `atlas-governance/evaluation/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `evaluationHarness.ts` | Call `recordSample()` after each Atlas response. `detectRegressions()` auto-runs and emits to event bus. | Post-response pipeline in `synthesizer.ts` |

### `atlas-governance/crucible/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `difficultyGovernor.ts` | Call `assessMode()` before each Crucible exchange. Inject `promptInjection` into the Crucible system prompt. | `CrucibleDeepWorkModule.tsx` |

### `atlas-governance/resonance/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `resonanceGuardrails.ts` | Call `checkResonanceResponse()` on every Resonance output before rendering. Block or sanitize on `approved: false`. | `ResonanceModule.tsx` post-generation hook |

### `atlas-governance/graph/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `conceptHygiene.ts` | Call `upsertConcept()` and `upsertEdge()` as concepts are extracted. Run `pruneFalseEdges()` + `applyTemporalDecay()` on login. | `mindMapGraphBridge.ts` |

### `atlas-governance/sovereign/`

| File | Purpose | Wire Into |
|------|---------|-----------|
| `sovereignSecurity.ts` | Call `checkPermission()` before every console action. `validateOrigin()` on all requests from the console UI. | `ConsoleView.tsx`, backend middleware |
| `SovereignAuditLog.tsx` | Drop into `ConsoleView` audit tab. Pass `initialEntries={getAuditLog()}`. | `ConsoleView.tsx` — `activeTab === 'audit'` |

---

## Phase 3 — Governance Infrastructure (Backend)

Located in `atlas-backend/src/services/governance/infrastructure/`:

| File | Purpose | Wire Into |
|------|---------|-----------|
| `systemPrecedence.ts` | 8-layer authority hierarchy. Call `resolvePrecedence()` in `contextAssembler.ts` before final prompt assembly. | `contextAssembler.ts`, `primePipeline.ts` |
| `stateVersionManager.ts` | Schema versioning at v2.0.0. Wrap all IndexedDB/Firestore reads in `migrateState()`. Call `wrapStateForPersistence()` on all writes. | `atlasWorkspacePersistence.ts`, `persistence.ts` |
| `degradedModeController.ts` | Tracks 10 subsystems. Call `withDegradedFallback()` around every governance subsystem call. Check `assessMode()` before response assembly. | All governance service calls, `synthesizer.ts` |

---

## Phase 4 — Structural Completeness

| File | Purpose | Wire Into |
|------|---------|-----------|
| `infrastructure/explainabilityEngine.ts` | Human-readable rationale for every governance action. Call `wireExplainabilityToEventBus()` once on app init. Expose `getExplanations()` in `MindProfile`. | App init, `MindProfile` chamber |
| `infrastructure/dataRetentionPolicy.ts` | Retention rules for all 10 data domains. Call `requestDeletion()` from `PrivacyCenter`. Run `getExpiredDomains()` on scheduled cleanup. | `PrivacyCenter.tsx`, backend cron job |
| `infrastructure/systemPrecedence.ts` *(Phase 3)* | Already covered above | — |

---

## Backend Route: Governance Console

`atlas-backend/src/routes/governanceConsoleRoutes.ts` exposes:

- `POST /v1/governance/console-command` — terminal commands from ConsoleView
- `POST /v1/governance/ai-command` — AI governance from the AI Governance tab

Both are sovereign-gated (creator email check). `ConsoleView.tsx` now calls these routes with `credentials: 'include'`, falling back to local Ollama only in dev.

---

## Bug Fixes Included in This Commit

### BugHunter (`src/components/BugHunter.tsx`)
- **Root cause:** `isActive` was never set to `true` — error monitoring was never activated
- **Fix:** Auto-activates on mount when embedded or panel opens. Added Live/Paused toggle button. Deactivates on panel close.

### ConsoleView (`src/components/ConsoleView.tsx`)
- **Root cause:** `handleAiCommand` and terminal commands routed to `ollamaComplete` → `localhost:11434`, which doesn't exist in production
- **Fix:** Routes through `POST /v1/governance/ai-command` and `POST /v1/governance/console-command` on the Atlas backend. Graceful fallback to local Ollama in dev environments.

---

## Commit Structure

This single commit (`fix/governance-phase2-phase3-phase4`) covers:
- Phase 2: Full `atlas-governance/` directory (12 files)
- Phase 3: `atlas-backend/src/services/governance/infrastructure/` (4 files, via PR #4)
- Phase 4: `explainabilityEngine.ts`, `dataRetentionPolicy.ts`
- Mobile responsiveness, chat FSM, IndexedDB persistence (from `fix/mobile-freeze-persistence`)
- BugHunter + ConsoleView functional fixes
