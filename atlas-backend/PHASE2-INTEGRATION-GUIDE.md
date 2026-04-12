# Atlas Phase 2 — Governance Infrastructure Integration Guide

This document describes how the three core governance infrastructure systems connect to the rest of the Atlas backend. Each system already exists as a standalone module; this guide explains **how they are wired**, **what depends on them**, and **how to extend them**.

---

## 1. Policy Precedence Engine (`src/governance/policyPrecedence.ts`)

### Purpose

Canonical authority hierarchy. When multiple Atlas systems try to influence the same response (constitution rules vs. user evolution vs. feature flags vs. tone shaping), this engine decides who wins.

### Architecture

```
PrecedenceLevel enum (1=highest → 7=lowest):
  CONSTITUTION → SAFETY_TRUTH → EVIDENCE → USER_EVOLUTION
    → FEATURE_INJECTION → STYLE_TONE → DEFAULT
```

`PolicyPrecedenceEngine` holds a `Map<PrecedenceLevel, PolicyLayer>`, each containing ordered `PolicyInstruction[]`. On every chat request, `resolveForContext()` produces a `ResolvedPolicyStack` — the conflict-free, ordered set of instructions that assembles the system prompt.

### Wired in

| Consumer | File | How |
|----------|------|-----|
| Chat policy assembly | `src/governance/chatPolicyAssembly.ts` | Imports `PolicyPrecedenceEngine`, calls `resolveForContext()` to build the system prompt before omni-stream synthesis. |
| Omni-stream router | `src/routes/omniStream.ts` | Uses resolved policy stack to inject constitutional and safety constraints. |
| Intelligence router | `src/services/intelligence/router.ts` | Checks precedence for model selection and routing constraints. |
| Health endpoint | `src/routes/health.ts` | Reports active conflict count in `/v1/health` payload. |

### Adding a new precedence layer

1. Add a new member to `PrecedenceLevel` enum (numeric order = authority rank).
2. Call `initializeLayer()` in the constructor with the new level, name, system owner, and `canBeOverriddenBy` set.
3. Register instructions via `addInstruction()` from whichever system owns the layer.

---

## 2. Schema Version Manager (`src/persistence/schemaVersioning.ts`)

### Purpose

Schema versioning and forward/backward migration for all long-lived Atlas data stores. Every data domain has a version number. When code changes the schema shape, chained migrations run automatically on startup.

### Architecture

`SchemaVersionManager` tracks current versions for 12 data stores:

```
evolution_profile, goal_memory, mutation_ledger, evidence_claims,
uncertainty_records, event_stream, concept_graph, evaluation_snapshots,
evolution_control, sovereign_audit, crucible_sessions, journal_entries
```

Each migration has `up()`, `down()`, `validate()`, and a `breaking` flag. Breaking migrations require explicit sovereign approval before execution.

### Wired in

| Consumer | File | How |
|----------|------|-----|
| Server startup | `src/index.ts` | `await runMigrationsOnStartup()` runs before the Fastify server starts listening. |
| Evolution engine | `src/services/evolutionEngine.ts` | Checks profile schema version before mutating. |
| Event bus mirror | `src/infrastructure/eventBusMirror.ts` | Uses `schemaVersion` field on persisted events. |

### Adding a new migration

1. Call `registerMigration()` on the `SchemaVersionManager` singleton:

```ts
manager.registerMigration({
  store: 'evolution_profile',
  fromVersion: 1,
  toVersion: 2,
  description: 'Add cognitive style preferences field',
  up: (data) => ({ ...(data as object), cognitiveStyle: {} }),
  down: (data) => { const d = { ...(data as object) }; delete (d as any).cognitiveStyle; return d; },
  validate: (data) => typeof (data as any).cognitiveStyle === 'object',
  breaking: false,
});
```

2. Bump `currentVersions[store]` in the constructor.
3. The migration runs automatically on next `runMigrationsOnStartup()`.

---

## 3. Failure Mode Doctrine (`src/resilience/failureModeDoctrine.ts`)

### Purpose

Explicit degraded-mode behavior for every Atlas subsystem failure. When a system goes down, Atlas enters a known safe operating mode — it never crashes silently or pretends everything is fine.

### Architecture

`FailureModeDoctrine` maintains:

- `healthStates: Map<AtlasSystem, SystemHealthState>` — per-system health with `healthy | degraded | failed | unknown`.
- `activeDegradedModes: Map<AtlasSystem, DegradedMode>` — active fallback behaviors.
- `doctrine: DegradedMode[]` — pre-defined fallback behaviors for each `(system, failureType)` pair.
- Capacity weights per system (e.g. `evidence_arbitrator` = 12% of total capability).
- `MINIMUM_VIABLE_PROMPT` — bare-bones system prompt used when 3+ systems are degraded.

14 subsystems tracked: `evolution_engine`, `evidence_arbitrator`, `overseer`, `concept_graph`, `event_bus`, `goal_memory`, `mutation_constitution`, `identity_resolver`, `resonance_engine`, `crucible_engine`, `profile_state`, `supabase`, `groq_api`, `ollama`.

### Wired in

| Consumer | File | How |
|----------|------|-----|
| Global middleware | `src/index.ts` | `app.addHook('onRequest', doctrineMiddleware(failureDoctrine))` — every request checks health before proceeding. |
| Health endpoint | `src/routes/health.ts` | Returns `AtlasHealthReport` with per-system status, active degraded modes, and estimated capacity. |
| Omni-stream | `src/routes/omniStream.ts` | If `overallStatus === 'critical'`, injects `MINIMUM_VIABLE_PROMPT` instead of full system prompt assembly. |

### Reporting a failure

```ts
const doctrine = getFailureModeDoctrine();
doctrine.reportFailure('evolution_engine', 'timeout', 'Flush cycle exceeded 10s');
```

The doctrine automatically selects the matching `DegradedMode`, injects a prompt disclaimer if `userVisible`, and starts auto-recovery if configured.

### Recovering

```ts
doctrine.reportRecovery('evolution_engine');
```

---

## Phase 2.1 — Frontend Governance Infrastructure

### Chat FSM + IndexedDB Persistence (`src/db/`)

The chat persistence layer uses **Dexie** (IndexedDB) to survive page refreshes:

| File | Purpose |
|------|---------|
| `src/db/atlasEntities.ts` | Defines `ChatRequestState` FSM (`idle → submitting → streaming → completed \| failed \| timed_out \| aborted \| interrupted`) and record types for threads, messages, prompt history, and user preferences. |
| `src/db/atlasDexieDb.ts` | Dexie v2 schema with `chatThreads`, `chatMessages`, `promptHistory`, `userPreferences` tables. |
| `src/db/chatPersistence.ts` | CRUD layer: `createThread`, `appendMessage`, `saveStreamingChunk`, `finalizeMessage`, `recoverInterruptedRequests`, `savePromptHistory`. |

**Wiring in `AtlasChamber`:**

- On mount: `recoverInterruptedRequests()` transitions any `submitting`/`streaming` rows to `interrupted`.
- On submit: creates a thread (if none), persists the user message and a placeholder assistant message with `requestState: 'submitting'`.
- During streaming: a 2-second interval calls `saveStreamingChunk()` so partial content survives refresh.
- On completion: `finalizeMessage()` writes `completed` / `failed` / `timed_out` / `aborted` with final content.

### EmergencyConsole Migration

`src/components/EmergencyConsole.tsx` was migrated off Firestore:

- **Before:** `onSnapshot(collection(db, 'audit_logs'), ...)` — real-time Firestore listener.
- **After:** Polls `GET /v1/governance/audit-logs?userId=...&limit=50` every 15 seconds via `atlasApiUrl()`.

---

## Dependency Graph

```
index.ts (startup)
  ├── initSqlite()
  ├── runMigrationsOnStartup()          ← schemaVersioning.ts
  ├── initSemanticVectorIndex()
  ├── getFailureModeDoctrine()          ← failureModeDoctrine.ts
  │   └── doctrineMiddleware()          → every request
  ├── initGovernanceEventBus()          ← governanceInit.ts
  │   └── AtlasEventBus.getInstance()  ← eventBus.ts
  └── routes
      ├── omniStream                    ← uses policyPrecedence + failureDoctrine
      ├── health                        ← reports precedence conflicts + health
      ├── governanceConsole             ← gaps/changes/audit/emergency CRUD
      └── cognitiveGovernance           ← sovereign overview with governance counts
```

---

## Checklist for new governance subsystems

1. Define types in the subsystem file (follow existing patterns).
2. Wire into `index.ts` startup sequence if initialization is needed.
3. Register with `AtlasEventBus` for events the subsystem emits or consumes.
4. Add health reporting to `FailureModeDoctrine` if the subsystem can fail.
5. Register precedence instructions via `PolicyPrecedenceEngine` if the subsystem influences prompts.
6. Add schema version tracking via `SchemaVersionManager` if the subsystem persists user state.
7. Expose routes and register them in `index.ts`.
