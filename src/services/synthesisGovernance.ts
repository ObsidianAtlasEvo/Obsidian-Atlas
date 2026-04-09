export type ClaimType =
  | "directly_observed"
  | "user_provided"
  | "retrieved_from_memory"
  | "retrieved_from_source"
  | "system_design_intent"
  | "runtime_capability_observed"
  | "inference"
  | "hypothesis"
  | "speculative"
  | "unsupported";

export interface ResponseClaim {
  id: string;
  text: string;
  type: ClaimType;
  supportIds: string[];
  provenance: {
    userMessageIds?: string[];
    memoryIds?: string[];
    sourceIds?: string[];
    runtimeSignals?: string[];
    systemDirectiveIds?: string[];
  };
  confidence?: number;
  confidenceBasis?: string;
  eligibleForUserFacingAnswer: boolean;
}

export interface SynthesisGovernanceAudit {
  unsupportedClaimCount: number;
  downgradedClaimCount: number;
  removedClaimCount: number;
  personalizationClaimsBlocked: number;
  certaintyLabelsSuppressed: number;
  internalDoctrineClaimsReframed: number;
  redundancyPruned: number;
}

export function extractClaims(rawClaims: any[]): ResponseClaim[] {
  return rawClaims.map(c => ({
    id: c.id || Math.random().toString(36).substring(7),
    text: c.text || "",
    type: classifyClaimType(c.type),
    supportIds: c.supportIds || [],
    provenance: c.provenance || {},
    confidence: c.confidence,
    confidenceBasis: c.confidenceBasis,
    eligibleForUserFacingAnswer: true
  }));
}

export function classifyClaimType(type: string): ClaimType {
  const validTypes = [
    "directly_observed", "user_provided", "retrieved_from_memory",
    "retrieved_from_source", "system_design_intent", "runtime_capability_observed",
    "inference", "hypothesis", "speculative", "unsupported"
  ];
  if (validTypes.includes(type)) return type as ClaimType;
  return "unsupported";
}

export function attachProvenance(claim: ResponseClaim, context: any): ResponseClaim {
  // In a real system, we would map supportIds to actual provenance records.
  // For now, we trust the LLM's provenance mapping but verify it's not empty if required.
  return claim;
}

export function canPersonalize(claim: ResponseClaim): boolean {
  const p = claim.provenance;
  // Provenance must be explicit user input or memory retrieval
  const hasUserProvenance = (p.userMessageIds && p.userMessageIds.length > 0) ||
                            (p.memoryIds && p.memoryIds.length > 0);
  return !!hasUserProvenance;
}

export function applyPersonalizationGate(claim: ResponseClaim, audit: SynthesisGovernanceAudit): ResponseClaim {
  const personalizationRegex = /\b(you|your|yours|you're|you've|you'll|you'd)\b/gi;
  
  if (personalizationRegex.test(claim.text) && !canPersonalize(claim)) {
    let newText = claim.text;
    
    // Rewrite rules for generalization
    newText = newText.replace(/\byou are\b/gi, "it is common for a user to be");
    newText = newText.replace(/\byou're\b/gi, "it is common for a user to be");
    newText = newText.replace(/\byou have\b/gi, "a user may have");
    newText = newText.replace(/\byou've\b/gi, "a user may have");
    newText = newText.replace(/\byou will\b/gi, "a user might");
    newText = newText.replace(/\byou'll\b/gi, "a user might");
    newText = newText.replace(/\byou would\b/gi, "one might");
    newText = newText.replace(/\byou'd\b/gi, "one might");
    newText = newText.replace(/\byour\b/gi, "a user's");
    newText = newText.replace(/\byou\b/gi, "a user");
    newText = newText.replace(/\byours\b/gi, "the user's");

    // Add conditional framing if it's an inference or hypothesis
    if (claim.type === "inference" || claim.type === "hypothesis") {
      newText = `In general contexts, ${newText.charAt(0).toLowerCase() + newText.slice(1)}`;
    }

    claim.text = newText;
    audit.personalizationClaimsBlocked++;
    audit.downgradedClaimCount++;
  }
  
  return claim;
}

export function enforceCertaintyPolicy(claim: ResponseClaim, audit: SynthesisGovernanceAudit): ResponseClaim {
  const strongCertaintyRegex = /\b(verified|confirmed|proven|guaranteed|established|certain|definitively|unquestionably|fully validated|system architecture verified)\b/gi;
  
  const hasStrongCertainty = strongCertaintyRegex.test(claim.text);
  if (!hasStrongCertainty) return claim;

  const p = claim.provenance;
  const hasProvenance = (p.userMessageIds && p.userMessageIds.length > 0) ||
                        (p.memoryIds && p.memoryIds.length > 0) ||
                        (p.sourceIds && p.sourceIds.length > 0) ||
                        (p.runtimeSignals && p.runtimeSignals.length > 0);

  const isAllowedType = ["directly_observed", "retrieved_from_source", "retrieved_from_memory", "runtime_capability_observed"].includes(claim.type);

  if (!isAllowedType || !hasProvenance || !claim.confidenceBasis) {
    // Downgrade
    let newText = claim.text;
    newText = newText.replace(/\bverified\b/gi, "supported");
    newText = newText.replace(/\bconfirmed\b/gi, "indicated");
    newText = newText.replace(/\bproven\b/gi, "appears");
    newText = newText.replace(/\bdefinitively\b/gi, "likely");
    newText = newText.replace(/\bguaranteed\b/gi, "intended");
    newText = newText.replace(/\b(established|certain|unquestionably|fully validated|system architecture verified)\b/gi, "suggested by available evidence");
    
    claim.text = newText;
    claim.confidence = undefined; // Remove numeric confidence
    audit.certaintyLabelsSuppressed++;
    audit.downgradedClaimCount++;
  }

  return claim;
}

export function enforceSourceCompatibility(claim: ResponseClaim, audit: SynthesisGovernanceAudit): ResponseClaim {
  const p = claim.provenance;
  const onlyInternal = (p.systemDirectiveIds && p.systemDirectiveIds.length > 0) &&
                       !(p.sourceIds && p.sourceIds.length > 0) &&
                       !(p.memoryIds && p.memoryIds.length > 0) &&
                       !(p.runtimeSignals && p.runtimeSignals.length > 0) &&
                       !(p.userMessageIds && p.userMessageIds.length > 0);

  if (onlyInternal) {
    if (claim.type === "runtime_capability_observed" || claim.type === "retrieved_from_memory" || claim.type === "retrieved_from_source") {
      claim.type = "system_design_intent";
      audit.internalDoctrineClaimsReframed++;
    }
  }

  if (claim.type === "unsupported") {
    claim.eligibleForUserFacingAnswer = false;
    audit.unsupportedClaimCount++;
    audit.removedClaimCount++;
  }

  return claim;
}

export function deduplicateSections(claims: ResponseClaim[], audit: SynthesisGovernanceAudit): ResponseClaim[] {
  const uniqueClaims: ResponseClaim[] = [];
  const seenTexts = new Set<string>();

  for (const claim of claims) {
    const normalized = claim.text.toLowerCase().trim();
    let isDuplicate = false;
    for (const seen of seenTexts) {
      if (normalized.includes(seen) || seen.includes(normalized)) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueClaims.push(claim);
      seenTexts.add(normalized);
    } else {
      audit.redundancyPruned++;
    }
  }

  return uniqueClaims;
}

export function composeUserFacingAnswer(claims: ResponseClaim[]): { answer: string, evidenceNote: string[], uncertainty: string[], claimHighlights: any[] } {
  const eligibleClaims = claims.filter(c => c.eligibleForUserFacingAnswer);
  
  const answerClaims = eligibleClaims.filter(c => ["directly_observed", "user_provided", "retrieved_from_memory", "retrieved_from_source", "system_design_intent", "runtime_capability_observed", "inference"].includes(c.type));
  const answer = answerClaims.map(c => c.text).join(" ");

  const evidenceNote = eligibleClaims.filter(c => c.type === "system_design_intent").map(c => "This description is primarily based on Atlas's internal design directives.");
  const uncertainty = eligibleClaims.filter(c => c.type === "speculative" || c.type === "hypothesis" || c.type === "system_design_intent").map(c => "Not every design goal described here should be treated as independently verified runtime behavior.");

  const claimHighlights = eligibleClaims.map(c => ({ claim: c.text, type: c.type }));

  return {
    answer: answer || "I do not have sufficient supported information to answer this.",
    evidenceNote: Array.from(new Set(evidenceNote)),
    uncertainty: Array.from(new Set(uncertainty)),
    claimHighlights
  };
}

export function buildGovernanceAudit(): SynthesisGovernanceAudit {
  return {
    unsupportedClaimCount: 0,
    downgradedClaimCount: 0,
    removedClaimCount: 0,
    personalizationClaimsBlocked: 0,
    certaintyLabelsSuppressed: 0,
    internalDoctrineClaimsReframed: 0,
    redundancyPruned: 0
  };
}

export function processClaims(rawClaims: any[]): { response: any, audit: SynthesisGovernanceAudit } {
  const audit = buildGovernanceAudit();
  let claims = extractClaims(rawClaims);

  claims = claims.map(claim => {
    claim = attachProvenance(claim, {});
    
    // Personalization Gate
    claim = applyPersonalizationGate(claim, audit);

    // Grandiosity rewrite
    const grandioseRegex = /\b(ultimate|singular|irreducible|category-defining|absolute rigor|uncompromisingly verified|sovereign individual|cognitive operating environment|master complexity|intellectually obsolete)\b/gi;
    if (grandioseRegex.test(claim.text) && ["inference", "hypothesis", "speculative", "unsupported", "system_design_intent"].includes(claim.type)) {
      claim.text = claim.text.replace(/\bultimate\b/gi, "intended");
      claim.text = claim.text.replace(/\bsingular\b/gi, "distinctive");
      claim.text = claim.text.replace(/\birreducible\b/gi, "complex");
      claim.text = claim.text.replace(/\bcategory-defining\b/gi, "novel");
      claim.text = claim.text.replace(/\babsolute rigor\b/gi, "intended rigor");
      claim.text = claim.text.replace(/\buncompromisingly verified\b/gi, "designed for verification");
      claim.text = claim.text.replace(/\bmaster complexity\b/gi, "navigate complexity");
      claim.text = claim.text.replace(/\bintellectually obsolete\b/gi, "less effective");
      audit.downgradedClaimCount++;
    }

    claim = enforceCertaintyPolicy(claim, audit);
    claim = enforceSourceCompatibility(claim, audit);
    
    return claim;
  });

  claims = deduplicateSections(claims, audit);

  const composed = composeUserFacingAnswer(claims);

  return { response: composed, audit };
}
