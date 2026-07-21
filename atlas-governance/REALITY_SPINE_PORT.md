# Reality Spine — port onto `main`

## What this adds

A compiler-enforced **implementation-state ledger** (Canonical Vision §IX / §IV / §XXXII) that `main` did not have, plus the chamber that renders it:

- `src/reality/realitySpine.ts` — a total `Record<ActiveMode, FeatureRecord>` over all 63 routed modes. Because it is *total*, a new mode cannot be added to `activeMode` without also declaring an honest implementation state here, or `tsc` fails. Each record carries a state (`VISION_ONLY` → `PRODUCTION_READY` / `DEGRADED` / `RETIRED`), the evidence that justifies it, and the gap that blocks the next state.
- `src/chambers/RealityLedgerChamber.tsx` — renders the ledger: state summary, per-domain grouping, expandable evidence and gaps, filters, and its own limits stated in the header. Routed at `reality-ledger` (previously a placeholder on `main`).
- `src/components/shell/ChamberView.tsx` — routes `reality-ledger` to the real chamber.
- `src/components/shell/chamberCatalog.tsx` — adds a Control-Center nav entry so the ledger is reachable (visible to all users; transparency about system state is a user right, not a creator-only tool).

Nothing else on `main` is modified. This PR is **purely additive** — no deletions, no rewrites of existing behavior — so it applies cleanly with no conflicts.

## Honesty of the states

The states are a **source audit of `main` at merge time** (commit `c05f5f7`), derived from what the code demonstrably is:

- **Routing** — does `ChamberView` send the mode to a real chamber, an alias, or a placeholder?
- **Registered endpoints** — does the backing `/v1/...` or `/api/...` route exist in `atlas-backend`?
- **Chamber source** — does the component hold local state, or call the backend?

They are deliberately **conservative**. No entry claims `RUNTIME_CONFIRMED` or above, because this port did not run `main` end to end — and the ledger's own rule forbids claiming runtime confirmation from anything but a cited, verified run. Under-claiming is the safe error for an honesty ledger; over-claiming is the one it exists to prevent.

## Provenance note

An earlier line of work (branch history now preserved at tag `archive/reality-spine-stale-base`) built this ledger plus several other surfaces — a governed Home, intelligence chambers, a privacy center — and verified several of them at runtime. That branch had forked from an old base and had diverged from `main` in ways that could not be merged safely (it deleted a component tree that `main` still uses). **This PR deliberately carries over only the additive, conflict-free core — the Reality Spine — and re-audits its states against `main`'s actual code rather than importing the old branch's runtime evidence, which described different code.** The other surfaces can be ported in follow-up PRs, each verified against `main`'s backend.

## Verification

- `tsc --noEmit` — clean against `main`.
- `vite build` — clean; `RealityLedgerChamber` chunk emitted.
- `vitest run` — 17/17 pass.
- Runtime: not claimed. The ledger renders from a static registry (no backend dependency), so it cannot misreport live state; every classification is a source-level claim, cited in-record.
