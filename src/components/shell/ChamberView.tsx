import React, { Suspense, lazy } from 'react';
import { useAtlasStore } from '../../store/useAtlasStore';
import type { AppState } from '@/types';

// ── Lazy-loaded chambers ──────────────────────────────────────────────────

// Phase 1 — Core
const AtlasChamber       = lazy(() => import('../../chambers/AtlasChamber'));
const AuthChamber        = lazy(() => import('../../chambers/AuthChamber'));
const JournalChamber     = lazy(() => import('../../chambers/JournalChamber'));
const DoctrineChamber    = lazy(() => import('../../chambers/DoctrineChamber'));
const PulseChamber       = lazy(() => import('../../chambers/PulseChamber'));
const PlaceholderChamber = lazy(() => import('../../chambers/PlaceholderChamber'));

// Phase 2 — Functional Depth
const DecisionsChamber       = lazy(() => import('../../chambers/DecisionsChamber'));
const CrucibleChamber        = lazy(() => import('../../chambers/CrucibleChamber'));
const DirectiveCenterChamber = lazy(() => import('../../chambers/DirectiveCenterChamber'));
const MemoryVaultChamber     = lazy(() => import('../../chambers/MemoryVaultChamber'));
const ConstitutionChamber    = lazy(() => import('../../chambers/ConstitutionChamber'));

// Phase 3 — Intelligence Layer
const ResonanceChamber      = lazy(() => import('../../chambers/ResonanceChamber'));
const MirrorForgeChamber    = lazy(() => import('../../chambers/MirrorForgeChamber'));
const RealityEngineChamber  = lazy(() => import('../../chambers/RealityEngineChamber'));
const TopologyChamber       = lazy(() => import('../../chambers/TopologyChamber'));

// Phase 4 — Remaining Chambers
const ScenariosChamber      = lazy(() => import('../../chambers/ScenariosChamber'));
const ForgeChamber           = lazy(() => import('../../chambers/ForgeChamber'));
const ContinuityChamber      = lazy(() => import('../../chambers/ContinuityChamber'));
const RelationshipsChamber   = lazy(() => import('../../chambers/RelationshipsChamber'));
const SignalsChamber         = lazy(() => import('../../chambers/SignalsChamber'));
const CanonChamber           = lazy(() => import('../../chambers/CanonChamber'));
const CouncilChamber         = lazy(() => import('../../chambers/CouncilChamber'));
const MasteryChamber         = lazy(() => import('../../chambers/MasteryChamber'));
const ChrysalisChamber       = lazy(() => import('../../chambers/ChrysalisChamber'));

// Phase 4 — Governance
const CreatorConsoleChamber  = lazy(() => import('../../chambers/CreatorConsoleChamber'));
const GapLedgerChamber       = lazy(() => import('../../chambers/GapLedgerChamber'));
const AuditLogsChamber       = lazy(() => import('../../chambers/AuditLogsChamber'));
const ChangeControlChamber   = lazy(() => import('../../chambers/ChangeControlChamber'));

// Multi-Model Orchestration
const ModelHubChamber        = lazy(() => import('../../chambers/ModelHubChamber'));

// ── Suspense wrapper ──────────────────────────────────────────────────────

function ChamberSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '1.5px solid rgba(201,162,39,0.3)',
              borderTopColor: 'rgba(201,162,39,0.8)',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function chamber(Component: React.LazyExoticComponent<React.ComponentType>) {
  return (
    <ChamberSuspense>
      <Component />
    </ChamberSuspense>
  );
}

function placeholder(mode: string) {
  return (
    <ChamberSuspense>
      <PlaceholderChamber mode={mode} />
    </ChamberSuspense>
  );
}

// ── Router ────────────────────────────────────────────────────────────────

export default function ChamberView() {
  const mode = useAtlasStore((s) => s.activeMode);

  const view = (() => {
    switch (mode) {
      // ── Phase 1: Core ───────────────────────────────────────────────────
      case 'atlas':                                   return chamber(AtlasChamber);
      case 'journal':                                 return chamber(JournalChamber);
      case 'pulse': case 'today-in-atlas':            return chamber(PulseChamber);
      case 'doctrine':                                return chamber(DoctrineChamber);

      // ── Phase 2: Functional Depth ───────────────────────────────────────
      case 'decisions':                               return chamber(DecisionsChamber);
      case 'crucible': case 'red-team':               return chamber(CrucibleChamber);
      case 'directive-center':                        return chamber(DirectiveCenterChamber);
      case 'memory-vault':                            return chamber(MemoryVaultChamber);
      case 'constitution':                            return chamber(ConstitutionChamber);

      // ── Phase 3: Intelligence Layer ─────────────────────────────────────
      case 'resonance':                               return chamber(ResonanceChamber);
      case 'mirrorforge': case 'mirror':              return chamber(MirrorForgeChamber);
      case 'reality-engine': case 'systems':          return chamber(RealityEngineChamber);
      case 'topology': case 'mind-cartography':       return chamber(TopologyChamber);

      // ── Phase 4: Remaining Chambers ─────────────────────────────────────
      case 'scenarios':                               return chamber(ScenariosChamber);
      case 'forge': case 'forge-artifact':            return chamber(ForgeChamber);
      case 'continuity': case 'lineage':              return chamber(ContinuityChamber);
      case 'relationships': case 'people':            return chamber(RelationshipsChamber);
      case 'signals':                                 return chamber(SignalsChamber);
      case 'canon':                                   return chamber(CanonChamber);
      case 'council':                                 return chamber(CouncilChamber);
      case 'mastery':                                 return chamber(MasteryChamber);
      case 'chrysalis':                               return chamber(ChrysalisChamber);

      // ── Multi-Model Orchestration ───────────────────────────────
      case 'core-systems':                            return chamber(ModelHubChamber);
      case 'capabilities':                            return chamber(ModelHubChamber);

      // ── Phase 4: Governance ─────────────────────────────────────────────
      case 'creator-console':                         return chamber(CreatorConsoleChamber);
      case 'gap-ledger':                              return chamber(GapLedgerChamber);
      case 'audit-logs':                              return chamber(AuditLogsChamber);
      case 'change-control':                          return chamber(ChangeControlChamber);

      // ── Remaining placeholders ──────────────────────────────────────────
      case 'salon': case 'discussion':                return placeholder('Salon');
      case 'signature':                               return placeholder('Cognitive Signature');
      case 'vault':                                   return placeholder('Vault');
      case 'threads':                                 return placeholder('Threads');
      case 'chambers':                                return placeholder('Chambers');
      case 'privacy-center':                          return placeholder('Privacy Center');
      case 'roadmap':                                 return placeholder('Roadmap');
      case 'onboarding':                              return placeholder('Onboarding');
      case 'evolution-layer':                         return placeholder('Evolution Layer');
      case 'humanization-controls':                   return placeholder('Humanization Controls');
      case 'life-domains':                            return placeholder('Life Domains');
      case 'operating-manual':                        return placeholder('Operating Manual');
      case 'essential-mode':                          return placeholder('Essential Mode');
      case 'second-sun':                              return placeholder('Second Sun');
      case 'reality-ledger':                          return placeholder('Reality Ledger');
      case 'drift-center':                            return placeholder('Drift Center');
      case 'final-filter':                            return placeholder('Final Filter');
      case 'deep-work':                               return placeholder('Deep Work');
      case 'leviathan':                               return placeholder('Leviathan');

      case 'strategic-modeling':                      return placeholder('Strategic Modeling');
      case 'sovereign-atrium':                        return placeholder('Sovereign Atrium');
      case 'trajectory-observatory':                  return placeholder('Trajectory Observatory');
      case 'friction-cartography':                    return placeholder('Friction Cartography');
      case 'threshold-forge':                         return placeholder('Threshold Forge');
      case 'arena':                                   return placeholder('Arena');

      case 'auth':                                    return chamber(AuthChamber);
      default:                                        return placeholder(mode);
    }
  })();

  return (
    <div
      key={mode}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'atlas-fade-in var(--atlas-motion-moderate) var(--atlas-ease-out) both',
      }}
    >
      {view}
    </div>
  );
}
