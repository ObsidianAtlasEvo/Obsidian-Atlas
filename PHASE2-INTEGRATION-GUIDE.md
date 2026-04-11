# Phase 2 Integration Guide

This document describes how Phase 2 governance infrastructure modules connect to the existing Atlas governance system.

## Phase 2.1 — Governance Infrastructure

Phase 2.1 introduces three infrastructure modules under `atlas-backend/src/services/governance/infrastructure/` that provide cross-cutting governance capabilities. All three modules communicate through a shared lightweight event bus (`eventBus.ts`).

### `systemPrecedence.ts` — Authority Hierarchy Resolution

Defines the canonical priority order for competing instructions across Atlas subsystems (Constitution → Safety/Truth → Identity → Evolution → Goals → Feature Flags → Overseer → Style/Tone). When multiple layers emit conflicting directives for the same prompt or mutation, `resolvePrecedence()` deterministically selects the winner.

**Wiring:** The response assembly pipeline should call `validatePrecedenceChain()` before composing a final response. Any instruction from a lower layer that contradicts a CONSTITUTION or SAFETY_TRUTH constraint is blocked and quarantined. The `cognitiveOrchestrator.ts` dispatch can invoke `resolvePrecedence()` when subsystem read/write lists produce conflicting directives. All resolution and conflict events are emitted to the event bus for audit logging.

### `stateVersionManager.ts` — Schema Versioning & Migrations

Manages schema versioning for all long-lived user state domains (evolution profile, goal memory, mutation ledger, concept graph, event stream, evidence state, mind profile). Every persisted state blob is wrapped with `{ version, domain, userId, timestamp, data }` metadata.

**Wiring:** Any persistence layer (IndexedDB writes, SQLite state snapshots) should call `wrapStateForPersistence()` before writing and `versionCheck()` when reading. If state is stale, `migrateState()` runs sequential migration functions to bring it to `CURRENT_SCHEMA_VERSION` (2.0.0). When state is suspected corrupted — or after a failed migration — `rebuildProjection()` replays the governance audit log to reconstruct current state from scratch. Failed migrations emit `STATE_MIGRATION_FAILED` to the event bus, which the `degradedModeController` can consume to mark the `state_version_manager` subsystem as degraded.

### `degradedModeController.ts` — Graceful Degradation

Tracks health of ten named subsystems and computes the overall operating mode: FULL → GRACEFUL → SAFE → MINIMAL → OFFLINE. The response pipeline checks `assessMode()` and, if below FULL, may skip personalization (GRACEFUL), add a user-facing disclaimer (SAFE/MINIMAL), or block responses entirely (OFFLINE).

**Wiring:** Each governance service should call `reportSubsystemHealth()` on startup and on error. The `withDegradedFallback()` wrapper can be used around any async subsystem call to automatically report DEGRADED status and return a safe default on failure. The `getDegradedModeDisclaimer()` function returns ready-to-display text for the chat UI when Atlas is operating below normal capacity. Health change events are emitted to the event bus so dashboards and alerting can react in real-time.
