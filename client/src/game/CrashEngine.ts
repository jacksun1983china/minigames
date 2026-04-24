/**
 * CrashEngine — Game logic for Crash game
 *
 * Multiplier starts at 1.00x and increases exponentially.
 * Player must cash out before the crash point to win.
 * 
 * Pure client-side logic. Server determines crash point for RTP control.
 */

/**
 * Calculate current multiplier at a given time (seconds).
 * Uses exponential growth: multiplier = e^(rate × time)
 */
export function calculateMultiplierAtTime(elapsedMs: number, rate: number = 0.0006): number {
  const seconds = elapsedMs / 1000;
  const raw = Math.exp(rate * seconds * 10); // scale factor for visual appeal
  return Math.max(1.0, Math.round(raw * 100) / 100);
}

/**
 * Generate a crash point based on a provably fair formula.
 * Uses: crashPoint = 0.97 / (1 - random)
 * This gives a distribution where lower multipliers are more common.
 * House edge is built in (the 0.97 factor = 3% house edge).
 */
export function generateCrashPoint(seed?: number): number {
  const random = seed ?? Math.random();
  // crashPoint = houseEdge / (1 - random), minimum 1.00
  const houseEdge = 0.97;
  const crashPoint = houseEdge / (1 - random);
  return Math.max(1.0, Math.round(crashPoint * 100) / 100);
}

/**
 * Generate crash point with RTP control.
 * If RTP is hot, generate a lower crash point; if cold, generate higher.
 */
export function generateCrashPointWithRTP(
  targetRtp: number,
  currentRtp: number,
  candidates: number = 5
): number {
  const options: number[] = [];
  for (let i = 0; i < candidates; i++) {
    options.push(generateCrashPoint());
  }

  // Pick based on RTP direction
  let chosen = options[0];
  if (currentRtp > targetRtp + 5) {
    // Running hot: prefer lower crash points
    chosen = Math.min(...options);
  } else if (currentRtp < targetRtp - 5) {
    // Running cold: prefer higher crash points
    chosen = Math.max(...options);
  }
  // Otherwise: use first random (unbiased)

  return chosen;
}

/**
 * Calculate win amount for a given bet and cash-out multiplier
 */
export function calculateWinAmount(betAmount: number, multiplier: number): number {
  return Math.round(betAmount * multiplier * 100) / 100;
}

/**
 * Determine if a cash-out at a given multiplier is successful
 * (i.e., the crash point hasn't been reached yet)
 */
export function isCashOutSuccessful(cashOutMultiplier: number, crashPoint: number): boolean {
  return cashOutMultiplier < crashPoint;
}

/**
 * Calculate the time (in ms) to reach a given multiplier
 * Inverse of calculateMultiplierAtTime
 */
export function getTimeForMultiplier(targetMultiplier: number, rate: number = 0.0006): number {
  if (targetMultiplier <= 1) return 0;
  // t = ln(multiplier) / (rate * 10) * 1000
  return (Math.log(targetMultiplier) / (rate * 10)) * 1000;
}

/**
 * Format multiplier for display (e.g., 2.34x)
 */
export function formatMultiplier(m: number): string {
  return `${m.toFixed(2)}x`;
}
