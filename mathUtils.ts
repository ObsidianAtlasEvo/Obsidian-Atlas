/**
 * Utility functions for mathematical operations used in the resonance system.
 */

/**
 * Clamps a value between a minimum and maximum.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linearly interpolates between two values.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Calculates a weighted average of two values.
 */
export function weightedAverage(a: number, b: number, weightA: number, weightB: number): number {
  const totalWeight = weightA + weightB;
  if (totalWeight === 0) return (a + b) / 2;
  return (a * weightA + b * weightB) / totalWeight;
}

/**
 * Smoothstep function for non-linear interpolation.
 */
export function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Calculates a decay factor based on time elapsed.
 */
export function calculateDecayFactor(elapsedSeconds: number, halfLifeSeconds: number): number {
  return Math.pow(0.5, elapsedSeconds / halfLifeSeconds);
}
