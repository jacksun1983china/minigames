/**
 * RTP Engine — Server-side Return-to-Player control system
 *
 * Architecture:
 * - Each game session has a targetRtp (set from tenant config at session start)
 * - The engine uses a running session balance to decide whether to boost or suppress wins
 * - This is purely server-side; the client never sees raw RTP values
 *
 * Supported RTP tiers: 50, 70, 85, 92, 96, 100, 120
 */

export const RTP_TIERS = [50, 70, 85, 92, 96, 100, 120] as const;
export type RtpTier = (typeof RTP_TIERS)[number];

export interface RtpSessionState {
  targetRtp: number;
  totalBet: number;
  totalWin: number;
  roundCount: number;
}

export interface RoundResult {
  winAmount: number;
  multiplier: number;
  rtpApplied: number;
  isWin: boolean;
  resultData: Record<string, unknown>;
}

/**
 * Calculate the effective win multiplier for a round based on current session RTP state.
 * Uses the APEX algorithm: compare actual running RTP vs target, adjust probability accordingly.
 */
export function calculateRoundOutcome(
  betAmount: number,
  state: RtpSessionState,
  gameConfig: GemBlitzConfig
): RoundResult {
  const { targetRtp, totalBet, totalWin } = state;

  // Current running RTP (avoid division by zero)
  const currentRtp = totalBet > 0 ? (totalWin / totalBet) * 100 : targetRtp;

  // Deviation from target — positive means we're paying out too much, negative means too little
  const rtpDeviation = currentRtp - targetRtp;

  // Adjust win probability based on deviation
  // If paying too much → reduce win chance; if paying too little → increase win chance
  const baseWinChance = targetRtp / 100;
  const adjustedWinChance = Math.max(
    0.05,
    Math.min(0.95, baseWinChance - rtpDeviation * 0.01)
  );

  // Determine if this round is a win
  const isWin = Math.random() < adjustedWinChance;

  if (!isWin) {
    return {
      winAmount: 0,
      multiplier: 0,
      rtpApplied: totalBet > 0 ? (totalWin / (totalBet + betAmount)) * 100 : 0,
      isWin: false,
      resultData: { outcome: "lose" },
    };
  }

  // Calculate win multiplier — higher RTP tiers allow higher multipliers
  const maxMultiplier = getMaxMultiplierForRtp(targetRtp);
  const multiplier = selectWinMultiplier(targetRtp, maxMultiplier, rtpDeviation);
  const winAmount = betAmount * multiplier;

  const newTotalWin = totalWin + winAmount;
  const newTotalBet = totalBet + betAmount;

  return {
    winAmount,
    multiplier,
    rtpApplied: (newTotalWin / newTotalBet) * 100,
    isWin: true,
    resultData: { outcome: "win", multiplier },
  };
}

function getMaxMultiplierForRtp(targetRtp: number): number {
  if (targetRtp >= 120) return 50;
  if (targetRtp >= 100) return 30;
  if (targetRtp >= 96) return 20;
  if (targetRtp >= 92) return 15;
  if (targetRtp >= 85) return 10;
  if (targetRtp >= 70) return 7;
  return 5; // 50% tier
}

function selectWinMultiplier(
  targetRtp: number,
  maxMultiplier: number,
  rtpDeviation: number
): number {
  // Weight distribution: lower multipliers are more common
  // Adjust weights based on RTP deviation to converge toward target
  const multiplierOptions = generateMultiplierTable(maxMultiplier, targetRtp, rtpDeviation);
  return weightedRandom(multiplierOptions);
}

function generateMultiplierTable(
  maxMultiplier: number,
  targetRtp: number,
  rtpDeviation: number
): Array<{ value: number; weight: number }> {
  const table: Array<{ value: number; weight: number }> = [];

  // Generate multiplier steps
  const steps = [1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 50].filter((v) => v <= maxMultiplier);

  for (const step of steps) {
    // Base weight: exponentially decreasing for higher multipliers
    let weight = Math.pow(maxMultiplier / step, 1.5);

    // Adjust for RTP deviation: if we're under-paying, boost mid-range multipliers
    if (rtpDeviation < -5 && step >= 2 && step <= 10) {
      weight *= 1.5;
    }
    // If we're over-paying, suppress high multipliers
    if (rtpDeviation > 5 && step > 5) {
      weight *= 0.5;
    }

    table.push({ value: step, weight });
  }

  return table;
}

function weightedRandom(options: Array<{ value: number; weight: number }>): number {
  const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
  let random = Math.random() * totalWeight;
  for (const option of options) {
    random -= option.weight;
    if (random <= 0) return option.value;
  }
  return options[options.length - 1]?.value ?? 1;
}

// ─── Gem Blitz specific game logic ────────────────────────────────────────────

export interface GemBlitzConfig {
  gridSize: number;
  gemTypes: number;
  minMatch: number;
}

export interface GemBlitzRound {
  grid: number[][];
  matches: Array<{ row: number; col: number; gemType: number }[]>;
  cascades: number;
  baseMultiplier: number;
  finalMultiplier: number;
  winAmount: number;
  isWin: boolean;
}

/**
 * Generate a Gem Blitz round result with RTP control applied.
 * The server generates the grid and determines matches server-side.
 */
export function generateGemBlitzRound(
  betAmount: number,
  state: RtpSessionState,
  config: GemBlitzConfig = { gridSize: 8, gemTypes: 6, minMatch: 3 }
): GemBlitzRound {
  const outcome = calculateRoundOutcome(betAmount, state, config);

  if (!outcome.isWin) {
    // Generate a losing grid (no matches)
    const grid = generateGrid(config, false);
    return {
      grid,
      matches: [],
      cascades: 0,
      baseMultiplier: 0,
      finalMultiplier: 0,
      winAmount: 0,
      isWin: false,
    };
  }

  // Generate a winning grid with the target multiplier
  const grid = generateGrid(config, true);
  const matches = findMatches(grid, config);
  const cascades = Math.floor(Math.random() * 3); // 0-2 cascade levels

  return {
    grid,
    matches,
    cascades,
    baseMultiplier: outcome.multiplier,
    finalMultiplier: outcome.multiplier * (1 + cascades * 0.5),
    winAmount: outcome.winAmount,
    isWin: true,
  };
}

function generateGrid(config: GemBlitzConfig, ensureMatch: boolean): number[][] {
  const { gridSize, gemTypes } = config;
  const grid: number[][] = [];

  for (let r = 0; r < gridSize; r++) {
    const row: number[] = [];
    for (let c = 0; c < gridSize; c++) {
      row.push(Math.floor(Math.random() * gemTypes));
    }
    grid.push(row);
  }

  if (ensureMatch) {
    // Force at least one 3-in-a-row match
    const gemType = Math.floor(Math.random() * gemTypes);
    const row = Math.floor(Math.random() * gridSize);
    const col = Math.floor(Math.random() * (gridSize - 2));
    grid[row][col] = gemType;
    grid[row][col + 1] = gemType;
    grid[row][col + 2] = gemType;
  }

  return grid;
}

function findMatches(
  grid: number[][],
  config: GemBlitzConfig
): Array<{ row: number; col: number; gemType: number }[]> {
  const { gridSize, minMatch } = config;
  const matches: Array<{ row: number; col: number; gemType: number }[]> = [];

  // Horizontal matches
  for (let r = 0; r < gridSize; r++) {
    let c = 0;
    while (c < gridSize) {
      const gemType = grid[r][c];
      let length = 1;
      while (c + length < gridSize && grid[r][c + length] === gemType) length++;
      if (length >= minMatch) {
        const match = [];
        for (let i = 0; i < length; i++) match.push({ row: r, col: c + i, gemType });
        matches.push(match);
      }
      c += length;
    }
  }

  // Vertical matches
  for (let c = 0; c < gridSize; c++) {
    let r = 0;
    while (r < gridSize) {
      const gemType = grid[r][c];
      let length = 1;
      while (r + length < gridSize && grid[r + length][c] === gemType) length++;
      if (length >= minMatch) {
        const match = [];
        for (let i = 0; i < length; i++) match.push({ row: r + i, col: c, gemType });
        matches.push(match);
      }
      r += length;
    }
  }

  return matches;
}

/**
 * Validate that a claimed RTP tier is supported
 */
export function isValidRtpTier(rtp: number): boolean {
  return RTP_TIERS.includes(rtp as RtpTier);
}

/**
 * Get the nearest valid RTP tier
 */
export function clampRtpToTier(rtp: number): RtpTier {
  const sorted = [...RTP_TIERS].sort((a, b) => Math.abs(a - rtp) - Math.abs(b - rtp));
  return sorted[0] as RtpTier;
}
