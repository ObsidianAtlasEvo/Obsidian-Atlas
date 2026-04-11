/**
 * conceptHygiene.ts
 *
 * Keeps the CognitionMap semantically clean as it grows — prevents duplicate
 * concepts, false edges, semantic noise, and concept drift.
 *
 * ConceptNode and ConceptEdge are re-declared here as standalone types for
 * module isolation (originals live in atlas-evolution/chambers/CognitionMap).
 */

// ---------------------------------------------------------------------------
// Standalone type declarations (mirror of CognitionMap.tsx types)
// ---------------------------------------------------------------------------

export interface ConceptNode {
  id: string;
  label: string;
  domain: string;                    // e.g. "philosophy", "mathematics", "psychology"
  weight: number;                    // 0-1, overall salience
  visitCount: number;                // how many times this concept has been encountered
  lastSeen: number;                  // unix timestamp ms
  createdAt: number;                 // unix timestamp ms
  sessionIds: string[];              // all sessions in which this concept appeared
  tags?: string[];                   // optional semantic tags
}

export interface ConceptEdge {
  id: string;
  sourceId: string;
  targetId: string;
  strength: number;                  // 0-1, connection strength
  confidence: number;                // 0-1, how certain we are this edge is valid
  cooccurrenceCount: number;         // times source and target appeared together
  lastReinforced: number;            // unix timestamp ms
  sessionIds: string[];              // sessions where this edge was reinforced
  crossDomain: boolean;              // explicitly flagged as cross-domain
}

// ---------------------------------------------------------------------------
// Hygiene report types
// ---------------------------------------------------------------------------

export interface ConceptHygieneReport {
  userId: string;
  generatedAt: number;
  aliasGroups: AliasGroup[];
  falsEdges: FalseEdge[];
  staleNodes: StaleNode[];
  temporalWeightUpdates: TemporalWeightUpdate[];
  confidenceDowngrades: ConfidenceDowngrade[];
}

export interface AliasGroup {
  canonicalId: string;               // the concept that should survive
  canonicalLabel: string;
  aliases: Array<{ id: string; label: string; similarity: number }>;
  mergeRecommended: boolean;
}

export interface FalseEdge {
  sourceId: string;
  targetId: string;
  currentStrength: number;
  reason: 'low_cooccurrence' | 'temporal_gap' | 'semantic_mismatch' | 'single_session';
  pruneRecommended: boolean;
}

export interface StaleNode {
  id: string;
  label: string;
  lastSeen: number;
  daysSinceLastSeen: number;
  visitCount: number;
  archiveRecommended: boolean;
}

export interface TemporalWeightUpdate {
  nodeId: string;
  previousWeight: number;
  newWeight: number;
  reason: string;
}

export interface ConfidenceDowngrade {
  edgeId: string;
  previousConfidence: number;
  newConfidence: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Alias detection
const LEVENSHTEIN_MAX_DISTANCE = 3;
const SESSION_COOCCURRENCE_THRESHOLD = 0.9;   // appear together in 90%+ sessions

// False edge
const MIN_EDGE_STRENGTH = 0.1;
const TEMPORAL_GAP_DAYS = 60;
const SINGLE_SESSION_FLAG = 1;

// Stale node
const STALE_DAYS = 45;
const STALE_VISIT_COUNT = 5;

// Temporal weight decay
const DAILY_DECAY_RATE = 0.01;                // 1% per day
const RECENCY_BONUS = 0.1;
const RECENCY_BONUS_DAYS = 7;

// ---------------------------------------------------------------------------
// String distance helpers
// ---------------------------------------------------------------------------

/**
 * Compute Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use two-row dynamic programming
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n + 1; j++) {
      if (j > n) break;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Normalised similarity: 0 (completely different) to 1 (identical).
 * Combines Levenshtein distance with simple substring containment.
 */
function normalizedSimilarity(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();

  if (al === bl) return 1;

  const maxLen = Math.max(al.length, bl.length);
  if (maxLen === 0) return 1;

  const editSim = 1 - levenshtein(al, bl) / maxLen;

  // Substring bonus
  let substringBonus = 0;
  if (al.includes(bl) || bl.includes(al)) {
    substringBonus = 0.15;
  }

  // Shared token bonus (for multi-word labels)
  const aTokens = new Set(al.split(/\s+/));
  const bTokens = new Set(bl.split(/\s+/));
  let shared = 0;
  for (const t of aTokens) if (bTokens.has(t)) shared++;
  const tokenOverlap = shared / Math.max(aTokens.size, bTokens.size);
  const tokenBonus = tokenOverlap * 0.2;

  return Math.min(1, editSim + substringBonus + tokenBonus);
}

// ---------------------------------------------------------------------------
// ConceptHygiene
// ---------------------------------------------------------------------------

export class ConceptHygiene {
  // -------------------------------------------------------------------------
  // Public: run full hygiene pass
  // -------------------------------------------------------------------------

  analyze(nodes: ConceptNode[], edges: ConceptEdge[]): ConceptHygieneReport {
    const now = Date.now();

    return {
      userId: '',           // caller fills this in if needed
      generatedAt: now,
      aliasGroups: this.detectAliases(nodes),
      falsEdges: this.detectFalseEdges(edges, nodes),
      staleNodes: this.detectStaleNodes(nodes, now),
      temporalWeightUpdates: this.computeTemporalWeights(nodes, now),
      confidenceDowngrades: this.computeConfidenceDowngrades(edges, now),
    };
  }

  // -------------------------------------------------------------------------
  // Private: alias detection
  // -------------------------------------------------------------------------

  private detectAliases(nodes: ConceptNode[]): AliasGroup[] {
    const groups: AliasGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (processed.has(a.id)) continue;

      const aliases: AliasGroup['aliases'] = [];

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (processed.has(b.id)) continue;

        const areAliases = this.areConceptAliases(a, b, nodes);
        if (!areAliases.isAlias) continue;

        aliases.push({ id: b.id, label: b.label, similarity: areAliases.similarity });
        processed.add(b.id);
      }

      if (aliases.length > 0) {
        processed.add(a.id);

        // The canonical concept is the one with the highest visit count (most established)
        const allCandidates = [
          { id: a.id, label: a.label, visitCount: a.visitCount },
          ...aliases.map((al) => {
            const node = nodes.find((n) => n.id === al.id);
            return { id: al.id, label: al.label, visitCount: node?.visitCount ?? 0 };
          }),
        ];
        const canonical = allCandidates.sort((x, y) => y.visitCount - x.visitCount)[0];

        groups.push({
          canonicalId: canonical.id,
          canonicalLabel: canonical.label,
          aliases: aliases.filter((al) => al.id !== canonical.id),
          mergeRecommended: true,
        });
      }
    }

    return groups;
  }

  /**
   * Determine whether two concepts are aliases using the three alias rules.
   */
  private areConceptAliases(
    a: ConceptNode,
    b: ConceptNode,
    allNodes: ConceptNode[],
  ): { isAlias: boolean; similarity: number } {
    const sim = this.similarity(a.label, b.label);

    // Rule 1: Levenshtein distance < 3 AND same domain
    if (a.domain === b.domain) {
      const editDist = levenshtein(a.label.toLowerCase(), b.label.toLowerCase());
      if (editDist < LEVENSHTEIN_MAX_DISTANCE && editDist > 0) {
        return { isAlias: true, similarity: sim };
      }
    }

    // Rule 2: One is a substring of the other AND same domain
    if (a.domain === b.domain) {
      const al = a.label.toLowerCase();
      const bl = b.label.toLowerCase();
      if ((al.includes(bl) || bl.includes(al)) && al !== bl) {
        return { isAlias: true, similarity: sim };
      }
    }

    // Rule 3: Both appear in 90%+ of the same sessions
    if (a.sessionIds.length > 0 && b.sessionIds.length > 0) {
      const aSet = new Set(a.sessionIds);
      const bSet = new Set(b.sessionIds);
      const intersection = [...aSet].filter((s) => bSet.has(s)).length;
      const union = new Set([...aSet, ...bSet]).size;
      const cooccurrence = intersection / union;

      if (cooccurrence >= SESSION_COOCCURRENCE_THRESHOLD) {
        return { isAlias: true, similarity: sim };
      }
    }

    return { isAlias: false, similarity: sim };
  }

  // -------------------------------------------------------------------------
  // Private: false edge detection
  // -------------------------------------------------------------------------

  private detectFalseEdges(edges: ConceptEdge[], nodes: ConceptNode[]): FalseEdge[] {
    const falseEdges: FalseEdge[] = [];
    const now = Date.now();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    for (const edge of edges) {
      const source = nodeMap.get(edge.sourceId);
      const target = nodeMap.get(edge.targetId);

      // Rule 1: low strength AND appeared in only 1 session
      if (
        edge.strength < MIN_EDGE_STRENGTH &&
        edge.sessionIds.length <= SINGLE_SESSION_FLAG
      ) {
        falseEdges.push({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          currentStrength: edge.strength,
          reason: 'single_session',
          pruneRecommended: true,
        });
        continue;
      }

      // Rule 2: no shared domain AND not explicitly cross-domain → semantic mismatch
      if (source && target && !edge.crossDomain && source.domain !== target.domain) {
        // Allow if both nodes are in compatible domains (rough heuristic)
        const compatibleDomains = areDomainCompatible(source.domain, target.domain);
        if (!compatibleDomains) {
          falseEdges.push({
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            currentStrength: edge.strength,
            reason: 'semantic_mismatch',
            pruneRecommended: edge.strength < 0.3,
          });
          continue;
        }
      }

      // Rule 3: edge not reinforced in 60+ days → temporal gap
      const daysSinceReinforced = (now - edge.lastReinforced) / MS_PER_DAY;
      if (daysSinceReinforced >= TEMPORAL_GAP_DAYS) {
        falseEdges.push({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          currentStrength: edge.strength,
          reason: 'temporal_gap',
          pruneRecommended: edge.strength < 0.2,
        });
        continue;
      }

      // Rule 4: low co-occurrence count (< 3) overall
      if (edge.cooccurrenceCount < 3 && edge.strength < MIN_EDGE_STRENGTH * 1.5) {
        falseEdges.push({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          currentStrength: edge.strength,
          reason: 'low_cooccurrence',
          pruneRecommended: true,
        });
      }
    }

    return falseEdges;
  }

  // -------------------------------------------------------------------------
  // Private: stale node detection
  // -------------------------------------------------------------------------

  private detectStaleNodes(nodes: ConceptNode[], currentTimestamp: number): StaleNode[] {
    const staleNodes: StaleNode[] = [];

    for (const node of nodes) {
      const daysSinceLastSeen = (currentTimestamp - node.lastSeen) / MS_PER_DAY;

      if (daysSinceLastSeen >= STALE_DAYS && node.visitCount < STALE_VISIT_COUNT) {
        staleNodes.push({
          id: node.id,
          label: node.label,
          lastSeen: node.lastSeen,
          daysSinceLastSeen: Math.floor(daysSinceLastSeen),
          visitCount: node.visitCount,
          archiveRecommended: true,
        });
      }
    }

    return staleNodes;
  }

  // -------------------------------------------------------------------------
  // Private: temporal weight decay
  // -------------------------------------------------------------------------

  private computeTemporalWeights(
    nodes: ConceptNode[],
    currentTimestamp: number,
  ): TemporalWeightUpdate[] {
    const updates: TemporalWeightUpdate[] = [];

    for (const node of nodes) {
      const daysSinceLastSeen = (currentTimestamp - node.lastSeen) / MS_PER_DAY;
      let newWeight = node.weight;
      let reason = '';

      if (daysSinceLastSeen <= RECENCY_BONUS_DAYS) {
        // Recent node — apply recency bonus (capped at 1)
        const bonus = RECENCY_BONUS * (1 - daysSinceLastSeen / RECENCY_BONUS_DAYS);
        newWeight = Math.min(1, node.weight + bonus);
        reason = `Recency bonus: node seen within last ${RECENCY_BONUS_DAYS} days (+${bonus.toFixed(3)})`;
      } else {
        // Decay: 1% per day without reinforcement
        const decayDays = daysSinceLastSeen - RECENCY_BONUS_DAYS;
        const decayFactor = Math.pow(1 - DAILY_DECAY_RATE, decayDays);
        newWeight = Math.max(0, node.weight * decayFactor);
        reason = `Temporal decay: ${Math.floor(daysSinceLastSeen)} days without reinforcement (factor ${decayFactor.toFixed(4)})`;
      }

      if (Math.abs(newWeight - node.weight) > 0.001) {
        updates.push({
          nodeId: node.id,
          previousWeight: node.weight,
          newWeight: parseFloat(newWeight.toFixed(4)),
          reason,
        });
      }
    }

    return updates;
  }

  // -------------------------------------------------------------------------
  // Private: confidence downgrades for edges with temporal gaps
  // -------------------------------------------------------------------------

  private computeConfidenceDowngrades(
    edges: ConceptEdge[],
    currentTimestamp: number,
  ): ConfidenceDowngrade[] {
    const downgrades: ConfidenceDowngrade[] = [];

    for (const edge of edges) {
      const daysSinceReinforced = (currentTimestamp - edge.lastReinforced) / MS_PER_DAY;

      if (daysSinceReinforced >= TEMPORAL_GAP_DAYS) {
        // Reduce confidence by 50% for edges with a temporal gap ≥60 days
        const newConfidence = parseFloat((edge.confidence * 0.5).toFixed(4));
        if (newConfidence < edge.confidence) {
          downgrades.push({
            edgeId: edge.id,
            previousConfidence: edge.confidence,
            newConfidence,
            reason: `Temporal gap: edge not reinforced in ${Math.floor(daysSinceReinforced)} days. Confidence halved per policy.`,
          });
        }
      }
    }

    return downgrades;
  }

  // -------------------------------------------------------------------------
  // Public: apply hygiene recommendations to produce a cleaned graph
  // -------------------------------------------------------------------------

  apply(
    nodes: ConceptNode[],
    edges: ConceptEdge[],
    report: ConceptHygieneReport,
    options: {
      mergeAliases: boolean;
      pruneFalseEdges: boolean;
      archiveStale: boolean;
    },
  ): { nodes: ConceptNode[]; edges: ConceptEdge[]; archivedNodes: ConceptNode[] } {
    let workingNodes = [...nodes];
    let workingEdges = [...edges];
    const archivedNodes: ConceptNode[] = [];

    // Apply temporal weight updates regardless of options (always safe)
    const weightMap = new Map(report.temporalWeightUpdates.map((u) => [u.nodeId, u.newWeight]));
    workingNodes = workingNodes.map((n) =>
      weightMap.has(n.id) ? { ...n, weight: weightMap.get(n.id)! } : n,
    );

    // Apply confidence downgrades
    const confidenceMap = new Map(report.confidenceDowngrades.map((d) => [d.edgeId, d.newConfidence]));
    workingEdges = workingEdges.map((e) =>
      confidenceMap.has(e.id) ? { ...e, confidence: confidenceMap.get(e.id)! } : e,
    );

    // --- Merge aliases ---
    if (options.mergeAliases) {
      for (const group of report.aliasGroups) {
        if (!group.mergeRecommended) continue;

        const aliasIds = new Set(group.aliases.map((a) => a.id));

        // Merge alias node data into the canonical
        const canonicalNode = workingNodes.find((n) => n.id === group.canonicalId);
        if (!canonicalNode) continue;

        const mergedNode: ConceptNode = { ...canonicalNode };
        for (const alias of group.aliases) {
          const aliasNode = workingNodes.find((n) => n.id === alias.id);
          if (!aliasNode) continue;
          // Accumulate visits and sessions
          mergedNode.visitCount += aliasNode.visitCount;
          mergedNode.lastSeen = Math.max(mergedNode.lastSeen, aliasNode.lastSeen);
          const sessionSet = new Set([...mergedNode.sessionIds, ...aliasNode.sessionIds]);
          mergedNode.sessionIds = [...sessionSet];
          // Keep the higher weight
          mergedNode.weight = Math.max(mergedNode.weight, aliasNode.weight);
        }

        // Remove alias nodes
        workingNodes = workingNodes
          .filter((n) => !aliasIds.has(n.id))
          .map((n) => (n.id === group.canonicalId ? mergedNode : n));

        // Re-point edges from alias IDs to canonical ID
        workingEdges = workingEdges
          .filter((e) => !(aliasIds.has(e.sourceId) && aliasIds.has(e.targetId))) // drop intra-alias edges
          .map((e) => ({
            ...e,
            sourceId: aliasIds.has(e.sourceId) ? group.canonicalId : e.sourceId,
            targetId: aliasIds.has(e.targetId) ? group.canonicalId : e.targetId,
          }))
          .filter((e) => e.sourceId !== e.targetId); // remove self-loops created by merging
      }
    }

    // --- Prune false edges ---
    if (options.pruneFalseEdges) {
      const pruneSet = new Set(
        report.falsEdges
          .filter((fe) => fe.pruneRecommended)
          .map((fe) => `${fe.sourceId}::${fe.targetId}`),
      );
      workingEdges = workingEdges.filter(
        (e) => !pruneSet.has(`${e.sourceId}::${e.targetId}`),
      );
    }

    // --- Archive stale nodes ---
    if (options.archiveStale) {
      const archiveSet = new Set(
        report.staleNodes.filter((s) => s.archiveRecommended).map((s) => s.id),
      );
      const remaining: ConceptNode[] = [];
      for (const node of workingNodes) {
        if (archiveSet.has(node.id)) {
          archivedNodes.push(node);
        } else {
          remaining.push(node);
        }
      }
      workingNodes = remaining;

      // Remove edges connected to archived nodes
      const activeNodeIds = new Set(workingNodes.map((n) => n.id));
      workingEdges = workingEdges.filter(
        (e) => activeNodeIds.has(e.sourceId) && activeNodeIds.has(e.targetId),
      );
    }

    return { nodes: workingNodes, edges: workingEdges, archivedNodes };
  }

  // -------------------------------------------------------------------------
  // Public: compute string similarity (Levenshtein + semantic)
  // -------------------------------------------------------------------------

  similarity(a: string, b: string): number {
    return normalizedSimilarity(a, b);
  }
}

// ---------------------------------------------------------------------------
// Domain compatibility table
// ---------------------------------------------------------------------------

/**
 * Returns true if two domains are semantically compatible enough for a
 * cross-domain edge to be plausible without explicit tagging.
 */
function areDomainCompatible(domainA: string, domainB: string): boolean {
  const a = domainA.toLowerCase();
  const b = domainB.toLowerCase();

  // Compatible domain pairs (order-independent)
  const compatiblePairs: [string, string][] = [
    ['philosophy', 'ethics'],
    ['philosophy', 'logic'],
    ['philosophy', 'epistemology'],
    ['mathematics', 'logic'],
    ['mathematics', 'physics'],
    ['physics', 'philosophy'],
    ['psychology', 'philosophy'],
    ['psychology', 'neuroscience'],
    ['cognitive science', 'psychology'],
    ['cognitive science', 'philosophy'],
    ['economics', 'mathematics'],
    ['economics', 'psychology'],
    ['linguistics', 'philosophy'],
    ['linguistics', 'cognitive science'],
    ['history', 'philosophy'],
    ['sociology', 'psychology'],
    ['biology', 'philosophy'],
    ['computer science', 'mathematics'],
    ['computer science', 'logic'],
  ];

  for (const [x, y] of compatiblePairs) {
    if ((a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) {
      return true;
    }
  }

  // Same root domain (e.g. "applied mathematics" and "mathematics")
  if (a.includes(b) || b.includes(a)) return true;

  return false;
}
