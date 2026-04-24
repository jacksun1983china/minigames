import { describe, it, expect } from "vitest";
import {
  calculateRoundOutcome,
  generateGemBlitzRound,
  isValidRtpTier,
  clampRtpToTier,
  RTP_TIERS,
  type RtpSessionState,
  type GemBlitzConfig,
} from "./rtp-engine";

const DEFAULT_CONFIG: GemBlitzConfig = { gridSize: 8, gemTypes: 6, minMatch: 3 };

// ── calculateRoundOutcome ─────────────────────────────────────────────────────

describe("calculateRoundOutcome", () => {
  it("returns a loss with zero winAmount when isWin=false", () => {
    // Run many rounds to ensure we get at least one loss
    let gotLoss = false;
    for (let i = 0; i < 200; i++) {
      const state: RtpSessionState = { targetRtp: 50, totalBet: 1000, totalWin: 2000, roundCount: i };
      const result = calculateRoundOutcome(100, state, DEFAULT_CONFIG);
      if (!result.isWin) {
        expect(result.winAmount).toBe(0);
        expect(result.multiplier).toBe(0);
        gotLoss = true;
        break;
      }
    }
    // At 50% RTP with over-payment, we should see losses
    expect(gotLoss).toBe(true);
  });

  it("returns positive winAmount when isWin=true", () => {
    // Force a win scenario: current RTP far below target
    let gotWin = false;
    for (let i = 0; i < 200; i++) {
      const state: RtpSessionState = { targetRtp: 96, totalBet: 1000, totalWin: 0, roundCount: i };
      const result = calculateRoundOutcome(100, state, DEFAULT_CONFIG);
      if (result.isWin) {
        expect(result.winAmount).toBeGreaterThan(0);
        expect(result.multiplier).toBeGreaterThan(0);
        gotWin = true;
        break;
      }
    }
    expect(gotWin).toBe(true);
  });

  it("rtpApplied is computed correctly on a win", () => {
    const state: RtpSessionState = { targetRtp: 96, totalBet: 1000, totalWin: 0, roundCount: 10 };
    // Run until we get a win
    for (let i = 0; i < 500; i++) {
      const result = calculateRoundOutcome(100, state, DEFAULT_CONFIG);
      if (result.isWin) {
        const expectedRtp = ((0 + result.winAmount) / (1000 + 100)) * 100;
        expect(result.rtpApplied).toBeCloseTo(expectedRtp, 1);
        return;
      }
    }
  });

  it("adjusts win probability when RTP is far below target", () => {
    // With totalWin=0 and targetRtp=96, win chance should be high
    const state: RtpSessionState = { targetRtp: 96, totalBet: 10000, totalWin: 0, roundCount: 100 };
    let wins = 0;
    const trials = 100;
    for (let i = 0; i < trials; i++) {
      const result = calculateRoundOutcome(100, state, DEFAULT_CONFIG);
      if (result.isWin) wins++;
    }
    // With severe under-payment, win rate should be well above 50%
    expect(wins / trials).toBeGreaterThan(0.5);
  });

  it("suppresses wins when RTP is far above target", () => {
    // With totalWin >> totalBet, win chance should be low
    const state: RtpSessionState = { targetRtp: 50, totalBet: 1000, totalWin: 5000, roundCount: 50 };
    let wins = 0;
    const trials = 100;
    for (let i = 0; i < trials; i++) {
      const result = calculateRoundOutcome(100, state, DEFAULT_CONFIG);
      if (result.isWin) wins++;
    }
    // With severe over-payment at 50% target, win rate should be below 30%
    expect(wins / trials).toBeLessThan(0.3);
  });
});

// ── generateGemBlitzRound ─────────────────────────────────────────────────────

describe("generateGemBlitzRound", () => {
  it("returns a valid 8x8 grid", () => {
    const state: RtpSessionState = { targetRtp: 96, totalBet: 0, totalWin: 0, roundCount: 0 };
    const round = generateGemBlitzRound(100, state, DEFAULT_CONFIG);
    expect(round.grid).toHaveLength(8);
    round.grid.forEach((row) => {
      expect(row).toHaveLength(8);
      row.forEach((cell) => {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThan(6);
      });
    });
  });

  it("winning round has matches array with at least one match", () => {
    // Force a win by running with under-payment
    const state: RtpSessionState = { targetRtp: 96, totalBet: 10000, totalWin: 0, roundCount: 100 };
    for (let i = 0; i < 200; i++) {
      const round = generateGemBlitzRound(100, state, DEFAULT_CONFIG);
      if (round.isWin) {
        expect(round.matches.length).toBeGreaterThan(0);
        expect(round.winAmount).toBeGreaterThan(0);
        expect(round.finalMultiplier).toBeGreaterThan(0);
        return;
      }
    }
  });

  it("losing round has empty matches and zero winAmount", () => {
    const state: RtpSessionState = { targetRtp: 50, totalBet: 1000, totalWin: 5000, roundCount: 50 };
    for (let i = 0; i < 200; i++) {
      const round = generateGemBlitzRound(100, state, DEFAULT_CONFIG);
      if (!round.isWin) {
        expect(round.matches).toHaveLength(0);
        expect(round.winAmount).toBe(0);
        expect(round.cascades).toBe(0);
        return;
      }
    }
  });

  it("cascades are between 0 and 2 on a win", () => {
    const state: RtpSessionState = { targetRtp: 96, totalBet: 10000, totalWin: 0, roundCount: 100 };
    for (let i = 0; i < 500; i++) {
      const round = generateGemBlitzRound(100, state, DEFAULT_CONFIG);
      if (round.isWin) {
        expect(round.cascades).toBeGreaterThanOrEqual(0);
        expect(round.cascades).toBeLessThanOrEqual(2);
        return;
      }
    }
  });
});

// ── RTP Tier validation ───────────────────────────────────────────────────────

describe("RTP Tier Validation", () => {
  it("accepts all valid RTP tiers", () => {
    for (const tier of RTP_TIERS) {
      expect(isValidRtpTier(tier)).toBe(true);
    }
  });

  it("rejects invalid RTP values", () => {
    expect(isValidRtpTier(95)).toBe(false);
    expect(isValidRtpTier(101)).toBe(false);
    expect(isValidRtpTier(0)).toBe(false);
    expect(isValidRtpTier(-1)).toBe(false);
  });

  it("clamps to nearest valid tier", () => {
    expect(clampRtpToTier(94)).toBe(92); // nearest to 92
    expect(clampRtpToTier(97)).toBe(96); // nearest to 96
    expect(clampRtpToTier(60)).toBe(50); // nearest to 50
    expect(clampRtpToTier(120)).toBe(120); // exact match
  });
});
