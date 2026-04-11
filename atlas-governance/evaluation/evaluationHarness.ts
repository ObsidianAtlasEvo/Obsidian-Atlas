/**
 * Atlas Evaluation Harness
 * Phase 2 Governance
 *
 * Regression detection, improvement attribution, and trend analysis.
 * Answers: Did this mutation improve output? Did personalization degrade truth?
 */

import { AtlasEventBus } from '../infrastructure/eventBus';

export type EvaluationDimension =
  | 'depth'
  | 'truth_consistency'
  | 'personalization_accuracy'
  | 'crucible_sharpness'
  | 'resonance_accuracy'
  | 'response_latency'
  | 'uncertainty_calibration';

export interface EvaluationSample {
  id: string;
  userId: string;
  timestamp: string;
  prompt: string;
  response: string;
  dimensions: Record<EvaluationDimension, number>; // 0–1 scores
  mutationIds: string[]; // which mutations were active during this sample
  modelIds: string[]; // which models contributed
  tags: string[];
}

export interface RegressionReport {
  detected: boolean;
  dimension: EvaluationDimension;
  deltaScore: number; // negative = regression
  triggeringMutationIds: string[];
  severity: 'minor' | 'major' | 'critical';
  recommendation: string;
}

export interface ImprovementReport {
  detected: boolean;
  dimension: EvaluationDimension;
  deltaScore: number; // positive = improvement
  attributedMutationIds: string[];
  confidence: number;
}

export interface EvaluationTrend {
  dimension: EvaluationDimension;
  direction: 'improving' | 'stable' | 'declining';
  averageScore: number;
  recentScore: number;
  sampleCount: number;
}

// Regression threshold — decline this large in a window triggers a report
const REGRESSION_THRESHOLDS: Record<EvaluationDimension, number> = {
  depth: 0.1,
  truth_consistency: 0.05, // truth is very sensitive
  personalization_accuracy: 0.15,
  crucible_sharpness: 0.12,
  resonance_accuracy: 0.1,
  response_latency: 0.2,
  uncertainty_calibration: 0.08,
};

const sampleStore: Map<string, EvaluationSample[]> = new Map();

function getUserSamples(userId: string): EvaluationSample[] {
  if (!sampleStore.has(userId)) sampleStore.set(userId, []);
  return sampleStore.get(userId)!;
}

export function recordSample(
  userId: string,
  prompt: string,
  response: string,
  dimensions: Record<EvaluationDimension, number>,
  mutationIds: string[],
  modelIds: string[],
  tags: string[] = []
): EvaluationSample {
  const sample: EvaluationSample = {
    id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    timestamp: new Date().toISOString(),
    prompt,
    response,
    dimensions,
    mutationIds,
    modelIds,
    tags,
  };

  getUserSamples(userId).push(sample);

  // Auto-check for regression after each sample
  const regressions = detectRegressions(userId);
  for (const r of regressions) {
    if (r.detected) {
      AtlasEventBus.emit('REGRESSION_DETECTED', userId, r, 'evaluationHarness');
    }
  }

  return sample;
}

/**
 * Detect regressions by comparing recent window to prior window.
 */
export function detectRegressions(
  userId: string,
  windowSize = 5
): RegressionReport[] {
  const samples = getUserSamples(userId);
  if (samples.length < windowSize * 2) return [];

  const recent = samples.slice(-windowSize);
  const prior = samples.slice(-windowSize * 2, -windowSize);

  const dimensions: EvaluationDimension[] = [
    'depth', 'truth_consistency', 'personalization_accuracy',
    'crucible_sharpness', 'resonance_accuracy', 'response_latency', 'uncertainty_calibration',
  ];

  const reports: RegressionReport[] = [];

  for (const dim of dimensions) {
    const recentAvg = recent.reduce((s, x) => s + (x.dimensions[dim] ?? 0), 0) / recent.length;
    const priorAvg = prior.reduce((s, x) => s + (x.dimensions[dim] ?? 0), 0) / prior.length;
    const delta = recentAvg - priorAvg;

    if (delta < -REGRESSION_THRESHOLDS[dim]) {
      const triggeringMutationIds = [...new Set(recent.flatMap((s) => s.mutationIds))];
      const severity: RegressionReport['severity'] =
        Math.abs(delta) > 0.25 ? 'critical' :
        Math.abs(delta) > 0.15 ? 'major' : 'minor';

      reports.push({
        detected: true,
        dimension: dim,
        deltaScore: Math.round(delta * 1000) / 1000,
        triggeringMutationIds,
        severity,
        recommendation:
          dim === 'truth_consistency'
            ? 'Review recent mutations for over-personalization of factual claims.'
            : `Check recent mutations in ${triggeringMutationIds.slice(0, 3).join(', ')} for degrading ${dim}.`,
      });
    }
  }

  return reports;
}

/**
 * Attribute improvements to specific mutations.
 */
export function detectImprovements(
  userId: string,
  windowSize = 5
): ImprovementReport[] {
  const samples = getUserSamples(userId);
  if (samples.length < windowSize * 2) return [];

  const recent = samples.slice(-windowSize);
  const prior = samples.slice(-windowSize * 2, -windowSize);

  const dimensions: EvaluationDimension[] = [
    'depth', 'truth_consistency', 'personalization_accuracy',
    'crucible_sharpness', 'resonance_accuracy',
  ];

  const reports: ImprovementReport[] = [];

  for (const dim of dimensions) {
    const recentAvg = recent.reduce((s, x) => s + (x.dimensions[dim] ?? 0), 0) / recent.length;
    const priorAvg = prior.reduce((s, x) => s + (x.dimensions[dim] ?? 0), 0) / prior.length;
    const delta = recentAvg - priorAvg;

    if (delta > 0.05) {
      const newMutations = [...new Set(recent.flatMap((s) => s.mutationIds))].filter(
        (id) => !prior.flatMap((s) => s.mutationIds).includes(id)
      );

      reports.push({
        detected: true,
        dimension: dim,
        deltaScore: Math.round(delta * 1000) / 1000,
        attributedMutationIds: newMutations,
        confidence: Math.min(0.9, delta * 3),
      });

      AtlasEventBus.emit('IMPROVEMENT_DETECTED', userId, reports[reports.length - 1], 'evaluationHarness');
    }
  }

  return reports;
}

export function getTrends(userId: string): EvaluationTrend[] {
  const samples = getUserSamples(userId);
  if (samples.length < 3) return [];

  const dimensions: EvaluationDimension[] = [
    'depth', 'truth_consistency', 'personalization_accuracy',
    'crucible_sharpness', 'resonance_accuracy', 'uncertainty_calibration',
  ];

  return dimensions.map((dim) => {
    const scores = samples.map((s) => s.dimensions[dim] ?? 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const recent = scores.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const direction: EvaluationTrend['direction'] =
      recent > avg + 0.05 ? 'improving' :
      recent < avg - 0.05 ? 'declining' : 'stable';

    return {
      dimension: dim,
      direction,
      averageScore: Math.round(avg * 100) / 100,
      recentScore: Math.round(recent * 100) / 100,
      sampleCount: scores.length,
    };
  });
}

export function getEvaluationSamples(userId: string, limit = 20): EvaluationSample[] {
  return getUserSamples(userId).slice(-limit);
}
