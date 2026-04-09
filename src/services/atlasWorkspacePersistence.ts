// Atlas-Audit: [EXEC-MODE] Verified — Snapshot read/write sanitizes activeMode (isKnownActiveMode); invalid Firestore strings never reach AppState via merge patch.
// Atlas-Audit: [EXEC-P1] Verified — Build/merge Firestore atlasWorkspace payloads so journal, decisions, directives, pulse, posture, and doctrine survive sessions.
import type { AppState, AtlasWorkspaceSnapshot } from '../types';
import { isKnownActiveMode } from '../lib/atlasWayfinding';

export function buildAtlasWorkspaceSnapshot(state: AppState): AtlasWorkspaceSnapshot {
  const rawMode = state.activeMode;
  const activeMode =
    typeof rawMode === 'string' && isKnownActiveMode(rawMode.trim())
      ? (rawMode.trim() as AppState['activeMode'])
      : ('today-in-atlas' as AppState['activeMode']);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    journal: state.journal,
    decisions: state.decisions,
    directives: state.directives,
    pulse: state.pulse,
    activePosture: state.activePosture,
    personalDoctrine: state.userModel.doctrine,
    activeMode,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Merge validated workspace fields from Firestore into a partial AppState patch. */
export function mergeAtlasWorkspaceFromFirestore(
  prev: AppState,
  raw: unknown
): Partial<AppState> {
  if (!isRecord(raw)) return {};
  if (raw.version !== 1) return {};
  const patch: Partial<AppState> = {};

  if (Array.isArray(raw.journal)) patch.journal = raw.journal as AppState['journal'];
  if (Array.isArray(raw.decisions)) patch.decisions = raw.decisions as AppState['decisions'];
  if (Array.isArray(raw.directives)) patch.directives = raw.directives as AppState['directives'];

  if (isRecord(raw.pulse) && Array.isArray(raw.pulse.items)) {
    patch.pulse = {
      lastUpdate: typeof raw.pulse.lastUpdate === 'string' ? raw.pulse.lastUpdate : prev.pulse.lastUpdate,
      items: raw.pulse.items as AppState['pulse']['items'],
    };
  }

  if (isRecord(raw.activePosture)) {
    patch.activePosture = raw.activePosture as unknown as AppState['activePosture'];
  }

  if (Array.isArray(raw.personalDoctrine)) {
    patch.userModel = {
      ...prev.userModel,
      doctrine: raw.personalDoctrine as AppState['userModel']['doctrine'],
    };
  }

  if (typeof raw.activeMode === 'string') {
    const m = raw.activeMode.trim();
    if (m && isKnownActiveMode(m)) {
      patch.activeMode = m as AppState['activeMode'];
    }
  }

  return patch;
}
