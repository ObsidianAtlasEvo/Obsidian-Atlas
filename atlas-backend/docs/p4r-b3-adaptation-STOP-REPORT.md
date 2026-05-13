# P4-B3 STOP REPORT — `adaptation_events` SQLite schema not found

**Status:** STOP. Per the Stage B3 objective's explicit contract — *"If schema can't be found, stop and report — don't fabricate"* — this branch contains **no migration file, no service changes, and no backfill script**. It records the discovery so the parent can decide how to proceed.

## What I searched

| Search | Result |
|---|---|
| `awk '/CREATE TABLE IF NOT EXISTS adaptation_events/,/^\);/' atlas-backend/src/db/sqlite.ts` | 0 lines (no such table) |
| `grep -c "adaptation" atlas-backend/src/db/sqlite.ts` | 0 |
| `grep -rln "adaptation_events" atlas-backend/` | only stage-0 utility files (`storeFlags.ts`, `uuidMapping.ts` and their tests) |
| `grep -rln -E "adaptation_event\|behavior_adaptation\|behavioral_adaptation\|AdaptationEvent" Obsidian-Atlas/` | only the stage-0 utilities + a stub mention in `migrations/026_semantic_claims_postgres.sql` |
| `grep -rln "adaptation" atlas-backend/src/services/governance/` | 0 |
| `ls atlas-backend/src/services/governance/migration/migrations/` | only `001_upgrade_legacy_model_ids.ts` |
| `grep -rni "adaptationservice\|adaptationevent\|adaptation_log\|behaviour_adapt" atlas-backend` | 0 |

## What exists today (so the parent can scope the gap)

- `src/utils/storeFlags.ts` exposes `storeFlags.adaptation()` reading `ADAPTATION_STORE` (Stage 0, PR #164).
- `src/utils/uuidMapping.ts` reserves the `adaptation_events` UUID-v5 namespace (Stage 0).
- `.env.example` declares `ADAPTATION_STORE=sqlite`.
- No call-site, no SQLite table, no service-layer code references the table name.

The closest semantically-adjacent existing tables (per the reconciliation report, sec. Phase 5) are:
- `behavior_transparency_log` (mig 012/020) — transparency / explanation log
- `response_provenance_log` (mig 008) — provenance per response
- `drift_events` (sqlite.ts:134) — adaptation-volatility signal source consumed by `intelligence/driftMonitorService.ts`

`drift_events` is the only SQLite-side artifact that overlaps the "adaptation telemetry" theme, but its semantics (drift detection signals) are not what B3 describes ("before/after state and trigger semantics").

## Why this matters

The B3 objective requires migrating SQLite rows into a new `behavior_adaptation_events` Postgres table. With no source table and no producer service, there is:
1. nothing to backfill,
2. no column shape to mirror, and
3. no call sites to gate via `storeFlags.adaptation()`.

Creating `025_behavior_adaptation_events.sql` from the objective's *template* would be fabrication — the template's columns (`adaptation_type`, `trigger`, `before_state`, `after_state`, `metadata`) are illustrative, not derived from any observed producer in this repo.

## Recommended next actions for the parent

Pick one:

1. **Defer B3 until a producer exists.** Stage 0's `ADAPTATION_STORE` flag and UUID namespace are harmless no-ops in the meantime. Recommended.
2. **Confirm the table is supposed to be net-new** (no SQLite predecessor, no historical rows). If so, re-spec B3 as "create a brand-new analytics table" and provide the canonical column list — at that point the migration can be written without fabrication.
3. **Point me at a different repo / branch** where `adaptation_events` is actually defined. The objective references `atlas-backend/src/services/governance/migration/migrations/*.ts`, but that directory holds only `001_upgrade_legacy_model_ids.ts` on `main` at the commit Stage 0 branched from.

## Files in this PR

- `atlas-backend/docs/p4r-b3-adaptation-STOP-REPORT.md` (this file) — no source code changes.

`npx tsc --noEmit` is unchanged from Stage 0 (passes; no TypeScript modified).
