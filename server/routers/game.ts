import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { z } from "zod/v4";
import {
  createGameRound,
  createGameSession,
  getApiKeyByHash,
  getGameById,
  getGameBySlug,
  getGameSessionByToken,
  getRtpConfig,
  listGameRounds,
  listGameSessions,
  listGames,
  updateApiKeyLastUsed,
  updateGameSession,
} from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { generateGemBlitzRound } from "../rtp-engine";
import { encryptPayload, verifyRequestSignature } from "../crypto-utils";

// ─── API Key validation helper ────────────────────────────────────────────────

// Demo key stub: allows guest play without a real API key
const DEMO_KEY_STUB = { id: 0, tenantId: 0, isActive: true, expiresAt: null, rtp: 96, isDemo: true } as any;

async function validateApiKey(apiKey: string) {
  // Allow demo mode for guest play without authentication
  if (apiKey === "demo") return DEMO_KEY_STUB;
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const key = await getApiKeyByHash(keyHash);
  if (!key || !key.isActive) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or inactive API key" });
  }
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "API key has expired" });
  }
  // Update last used timestamp (fire and forget)
  updateApiKeyLastUsed(key.id).catch(() => {});
  return key;
}

// ─── Demo mode rate limiter ───────────────────────────────────────────────────
// Prevents abuse of the demo API (no auth required).
// Keyed by IP address; max 1 playRound per 150ms per IP.

const demoRateMap = new Map<string, number>(); // ip → last call timestamp
const DEMO_MIN_INTERVAL_MS = 150;

function checkDemoRate(ip: string): void {
  const now = Date.now();
  const last = demoRateMap.get(ip) ?? 0;
  if (now - last < DEMO_MIN_INTERVAL_MS) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded. Please slow down." });
  }
  demoRateMap.set(ip, now);
  // Evict old entries to prevent memory leak (keep map small)
  if (demoRateMap.size > 5000) {
    const cutoff = now - 10_000;
    for (const [k, v] of Array.from(demoRateMap.entries())) {
      if (v < cutoff) demoRateMap.delete(k);
    }
  }
}

// ─── Request signature verification ──────────────────────────────────────────
// Optional: only enforced when X-Signature header is present.
// Tenants using real API keys should always send signed requests.

function tryVerifySignature(params: {
  apiKey: string;
  timestamp?: string;
  nonce?: string;
  signature?: string;
  bodyHash?: string;
  isDemo: boolean;
}): void {
  const { apiKey, timestamp, nonce, signature, bodyHash, isDemo } = params;
  // Demo mode: signature is optional (but still verified if present)
  if (!signature && isDemo) return;
  // Real API key: signature is required
  if (!signature && !isDemo) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Request signature required for authenticated API keys" });
  }
  if (!timestamp || !nonce || !bodyHash) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Missing signature headers: X-Timestamp, X-Nonce, X-Body-Hash" });
  }
  const valid = verifyRequestSignature({ apiKey, timestamp, nonce, signature: signature!, bodyHash });
  if (!valid) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired request signature" });
  }
}

// ─── Game Router ──────────────────────────────────────────────────────────────

export const gameRouter = router({
  /** List all published games (public) */
  list: publicProcedure.query(async () => {
    const games = await listGames(true);
    return games.map((g) => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      description: g.description,
      category: g.category,
      gameType: g.gameType,
      thumbnailUrl: g.thumbnailUrl,
      baseRtp: g.baseRtp,
      minBet: g.minBet,
      maxBet: g.maxBet,
      version: g.version,
      tags: g.tags ? g.tags.split(",") : [],
    }));
  }),

  /** Get a single game by slug (public) */
  get: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const game = await getGameBySlug(input.slug);
      if (!game || !game.isPublished) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        ...game,
        tags: game.tags ? game.tags.split(",") : [],
        languages: game.languages ? game.languages.split(",").map((l: string) => l.trim()).filter(Boolean) : [],
        currencies: game.currencies ? game.currencies.split(",").map((c: string) => c.trim()).filter(Boolean) : [],
        specialFeatures: game.specialFeatures ? (() => { try { return JSON.parse(game.specialFeatures!); } catch { return []; } })() : [],
        config: game.config ? JSON.parse(game.config) : {},
      };
    }),

  // ─── Session Management (requires API Key) ──────────────────────────────────

  /** Start a new game session */
  startSession: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        gameSlug: z.string(),
        // playerId must be alphanumeric + underscore/dash only (no injection)
        playerId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_\-]+$/, "playerId must be alphanumeric"),
        metadata: z.record(z.string(), z.unknown()).optional(),
        // Signature headers (optional for demo, required for real keys)
        _sig: z.object({
          timestamp: z.string().optional(),
          nonce: z.string().optional(),
          signature: z.string().optional(),
          bodyHash: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const key = await validateApiKey(input.apiKey);

      // Verify request signature
      tryVerifySignature({
        apiKey: input.apiKey,
        timestamp: input._sig?.timestamp,
        nonce: input._sig?.nonce,
        signature: input._sig?.signature,
        bodyHash: input._sig?.bodyHash,
        isDemo: key.isDemo,
      });

      const game = await getGameBySlug(input.gameSlug);
      if (!game || !game.isPublished) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });

      // Resolve RTP for this tenant + game
      const rtpConfig = await getRtpConfig(key.tenantId, game.id);
      const targetRtp = rtpConfig ? parseFloat(rtpConfig.rtpPercent) : parseFloat(game.baseRtp);

      // Generate session token
      const sessionToken = `sess_${crypto.randomBytes(16).toString("hex")}`;

      // Derive the AES session key and return its hex representation to the client.
      // The client will use this to decrypt encrypted game results.
      // The key is derived server-side and never stored; it is only valid for this session.
      const { deriveSessionKey } = await import("../crypto-utils");
      const sessionKeyHex = deriveSessionKey(sessionToken).toString("hex");

      const sessionId = await createGameSession({
        tenantId: key.tenantId,
        gameId: game.id,
        playerId: input.playerId,
        sessionToken,
        appliedRtp: targetRtp.toFixed(2),
        targetRtp: targetRtp.toFixed(2),
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      });

      return {
        sessionToken,
        sessionId,
        gameSlug: game.slug,
        gameName: game.name,
        targetRtp,
        minBet: parseFloat(game.minBet),
        maxBet: parseFloat(game.maxBet),
        config: game.config ? JSON.parse(game.config) : {},
        // Session encryption key (hex) — client uses this to decrypt playRound results
        sessionKey: sessionKeyHex,
      };
    }),

  /** Play a round in an active session */
  playRound: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
        betAmount: z.number().positive(),
        // Signature headers
        _sig: z.object({
          timestamp: z.string().optional(),
          nonce: z.string().optional(),
          signature: z.string().optional(),
          bodyHash: z.string().optional(),
        }).optional(),
        // Client IP for demo rate limiting (passed from frontend)
        _clientIp: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const key = await validateApiKey(input.apiKey);

      // Demo mode rate limiting
      if (key.isDemo) {
        // Use forwarded IP or a fallback
        const ip = input._clientIp ||
          (ctx as any)?.req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
          (ctx as any)?.req?.socket?.remoteAddress ||
          "unknown";
        checkDemoRate(ip);
      }

      // Verify request signature
      tryVerifySignature({
        apiKey: input.apiKey,
        timestamp: input._sig?.timestamp,
        nonce: input._sig?.nonce,
        signature: input._sig?.signature,
        bodyHash: input._sig?.bodyHash,
        isDemo: key.isDemo,
      });

      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      // Skip tenant check for demo mode
      if (!key.isDemo && session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active" });
      }

      const game = await getGameById(session.gameId);
      if (!game) throw new TRPCError({ code: "NOT_FOUND" });

      // Validate bet amount
      const minBet = parseFloat(game.minBet);
      const maxBet = parseFloat(game.maxBet);
      if (input.betAmount < minBet || input.betAmount > maxBet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bet must be between ${minBet} and ${maxBet}`,
        });
      }

      // Build RTP session state
      const totalWin = parseFloat(session.winAmount);
      const targetRtp = parseFloat(session.targetRtp);

      const rtpState = {
        targetRtp,
        totalBet: parseFloat(session.betAmount),
        totalWin,
        roundCount: session.roundCount,
      };

      // Generate round result using game-specific engine
      const gameConfig = game.config ? JSON.parse(game.config) : { gridSize: 8, gemTypes: 6, minMatch: 3 };
      const roundResult = generateGemBlitzRound(input.betAmount, rtpState, gameConfig as any);

      const newTotalBet = parseFloat(session.betAmount) + input.betAmount;
      const newTotalWin = parseFloat(session.winAmount) + roundResult.winAmount;
      const newAppliedRtp = newTotalBet > 0 ? (newTotalWin / newTotalBet) * 100 : 0;
      const newRoundCount = session.roundCount + 1;

      // Record the round
      await createGameRound({
        sessionId: session.id,
        tenantId: session.tenantId,
        gameId: session.gameId,
        roundNumber: newRoundCount,
        betAmount: input.betAmount.toFixed(2),
        winAmount: roundResult.winAmount.toFixed(2),
        resultData: JSON.stringify({ isWin: roundResult.isWin, cascades: roundResult.cascades }),
        rtpApplied: newAppliedRtp.toFixed(2),
      });

      // Update session totals
      await updateGameSession(session.id, {
        betAmount: newTotalBet.toFixed(2),
        winAmount: newTotalWin.toFixed(2),
        appliedRtp: newAppliedRtp.toFixed(2),
        roundCount: newRoundCount,
      });

      // Sensitive game result (grid, matches, cascades) is AES-256-GCM encrypted.
      // Only the client holding the sessionKey (from startSession) can decrypt it.
      const sensitiveResult = {
        grid: roundResult.grid,
        matches: roundResult.matches,
        cascades: roundResult.cascades,
        multiplier: roundResult.finalMultiplier,
      };
      const encryptedResult = encryptPayload(sensitiveResult, input.sessionToken);

      return {
        roundNumber: newRoundCount,
        betAmount: input.betAmount,
        winAmount: roundResult.winAmount,
        isWin: roundResult.isWin,
        // Encrypted payload — client decrypts with sessionKey
        encryptedResult,
        sessionStats: {
          totalBet: newTotalBet,
          totalWin: newTotalWin,
          appliedRtp: newAppliedRtp,
          roundCount: newRoundCount,
        },
      };
    }),

  /** End a game session */
  endSession: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const key = await validateApiKey(input.apiKey);

      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (!key.isDemo && session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });

      await updateGameSession(session.id, {
        status: "completed",
        completedAt: new Date(),
      });

      return {
        sessionToken: input.sessionToken,
        totalBet: parseFloat(session.betAmount),
        totalWin: parseFloat(session.winAmount),
        appliedRtp: parseFloat(session.appliedRtp),
        roundCount: session.roundCount,
      };
    }),

  /** Get session history for a tenant (requires API key) */
  sessions: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        gameSlug: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const key = await validateApiKey(input.apiKey);

      let gameId: number | undefined;
      if (input.gameSlug) {
        const game = await getGameBySlug(input.gameSlug);
        if (game) gameId = game.id;
      }

      return listGameSessions(key.tenantId, {
        gameId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /** Get rounds for a session */
  rounds: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
      })
    )
    .query(async ({ input }) => {
      const key = await validateApiKey(input.apiKey);
      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });
      return listGameRounds(session.id);
    }),

  // ─── Video Poker: Draw procedure ─────────────────────────────────────────────
  /**
   * videoPokerDraw — Jacks or Better, 9/6 full pay
   *
   * Phase 1 (deal): client sends betAmount, server returns 5-card hand (encrypted).
   * Phase 2 (draw): client sends heldIndices, server replaces non-held cards and
   *                 evaluates the final hand (encrypted result).
   *
   * RTP is controlled server-side via the same APEX algorithm used by Gem Blitz.
   * Target RTP for Video Poker: 99.54% (9/6 Jacks or Better full pay table).
   */
  videoPokerDraw: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
        betAmount: z.number().positive(),
        /** Indices (0-4) of cards the player wants to keep. Empty = deal phase. */
        heldIndices: z.array(z.number().int().min(0).max(4)).max(5),
        /** Phase: 'deal' for initial 5 cards, 'draw' for replacement + evaluation */
        phase: z.enum(["deal", "draw"]),
        _sig: z
          .object({
            timestamp: z.string().optional(),
            nonce: z.string().optional(),
            signature: z.string().optional(),
            bodyHash: z.string().optional(),
          })
          .optional(),
        _clientIp: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const key = await validateApiKey(input.apiKey);

      // Demo rate limiting
      if (key.isDemo) {
        const ip =
          input._clientIp ||
          (ctx as any)?.req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
          (ctx as any)?.req?.socket?.remoteAddress ||
          "unknown";
        checkDemoRate(ip);
      }

      tryVerifySignature({
        apiKey: input.apiKey,
        timestamp: input._sig?.timestamp,
        nonce: input._sig?.nonce,
        signature: input._sig?.signature,
        bodyHash: input._sig?.bodyHash,
        isDemo: key.isDemo,
      });

      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (!key.isDemo && session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active" });
      }

      const game = await getGameById(session.gameId);
      if (!game) throw new TRPCError({ code: "NOT_FOUND" });

      const minBet = parseFloat(game.minBet);
      const maxBet = parseFloat(game.maxBet);
      if (input.betAmount < minBet || input.betAmount > maxBet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bet must be between ${minBet} and ${maxBet}`,
        });
      }

      // ── Deck helpers (server-side) ───────────────────────────────────────────
      const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
      const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A"] as const;
      type Suit = (typeof SUITS)[number];
      type Rank = (typeof RANKS)[number];
      interface ServerCard { suit: Suit; rank: Rank; value: number }

      function rankValue(r: Rank): number {
        if (typeof r === "number") return r;
        return { J: 11, Q: 12, K: 13, A: 14 }[r]!;
      }

      function buildDeck(): ServerCard[] {
        const d: ServerCard[] = [];
        for (const suit of SUITS)
          for (const rank of RANKS)
            d.push({ suit, rank, value: rankValue(rank) });
        return d;
      }

      function shuffle<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }

      // ── Hand evaluator (Jacks or Better 9/6) ────────────────────────────────
      type HandType =
        | "royal_flush" | "straight_flush" | "four_of_a_kind" | "full_house"
        | "flush" | "straight" | "three_of_a_kind" | "two_pair"
        | "jacks_or_better" | "no_win";

      const PAY_TABLE: Record<HandType, number> = {
        royal_flush: 800, straight_flush: 50, four_of_a_kind: 25,
        full_house: 9, flush: 6, straight: 4, three_of_a_kind: 3,
        two_pair: 2, jacks_or_better: 1, no_win: 0,
      };

      function evalHand(cards: ServerCard[]): { handType: HandType; multiplier: number } {
        const vals = cards.map((c) => c.value).sort((a, b) => a - b);
        const suits = cards.map((c) => c.suit);
        const isFlush = suits.every((s) => s === suits[0]);
        const counts: Record<number, number> = {};
        for (const v of vals) counts[v] = (counts[v] || 0) + 1;
        const cVals = Object.values(counts);
        const max = Math.max(...cVals);

        const isStraight =
          (vals[4] - vals[0] === 4 && new Set(vals).size === 5) ||
          (vals[4] === 14 && vals[0] === 2 && vals[1] === 3 && vals[2] === 4 && vals[3] === 5);

        let handType: HandType = "no_win";
        if (isFlush && isStraight && vals[4] === 14 && vals[0] === 10) handType = "royal_flush";
        else if (isFlush && isStraight) handType = "straight_flush";
        else if (max === 4) handType = "four_of_a_kind";
        else if (max === 3 && cVals.includes(2)) handType = "full_house";
        else if (isFlush) handType = "flush";
        else if (isStraight) handType = "straight";
        else if (max === 3) handType = "three_of_a_kind";
        else if (cVals.filter((c) => c === 2).length === 2) handType = "two_pair";
        else if (cVals.filter((c) => c === 2).length === 1) {
          const pairVal = parseInt(Object.entries(counts).find(([, c]) => c === 2)![0]);
          if (pairVal >= 11) handType = "jacks_or_better";
        }
        return { handType, multiplier: PAY_TABLE[handType] };
      }

      // ── RTP-aware hand selection ─────────────────────────────────────────────
      // On the draw phase, if RTP is running hot (above target), we bias toward
      // weaker outcomes by re-shuffling the draw cards up to 3 times and picking
      // the result closest to the target RTP direction.
      const targetRtp = parseFloat(session.targetRtp);
      const currentRtp =
        parseFloat(session.betAmount) > 0
          ? (parseFloat(session.winAmount) / parseFloat(session.betAmount)) * 100
          : targetRtp;

      const deck = shuffle(buildDeck());
      const initialHand = deck.slice(0, 5);
      const remaining = deck.slice(5);

      let finalHand: ServerCard[];
      let winAmount = 0;
      let handType: HandType = "no_win";
      let multiplier = 0;

      if (input.phase === "deal") {
        // Just return the initial hand; no win evaluation yet
        finalHand = initialHand;
      } else {
        // Draw phase: replace non-held cards
        const nonHeld = [0, 1, 2, 3, 4].filter((i) => !input.heldIndices.includes(i));

        // Generate candidate draws
        const candidates: { hand: ServerCard[]; win: number; mult: number; ht: HandType }[] = [];
        for (let attempt = 0; attempt < 4; attempt++) {
          const drawDeck = shuffle(remaining);
          const candidate = [...initialHand];
          nonHeld.forEach((pos, j) => { candidate[pos] = drawDeck[j]; });
          const eval_ = evalHand(candidate);
          candidates.push({
            hand: candidate,
            win: input.betAmount * eval_.multiplier,
            mult: eval_.multiplier,
            ht: eval_.handType,
          });
        }

        // Pick candidate based on RTP direction
        let chosen = candidates[0];
        if (currentRtp > targetRtp + 5) {
          // Running hot: prefer lower win
          chosen = candidates.reduce((a, b) => (a.win <= b.win ? a : b));
        } else if (currentRtp < targetRtp - 5) {
          // Running cold: prefer higher win
          chosen = candidates.reduce((a, b) => (a.win >= b.win ? a : b));
        }
        // Otherwise: use first random draw (unbiased)

        finalHand = chosen.hand;
        winAmount = chosen.win;
        handType = chosen.ht;
        multiplier = chosen.mult;
      }

      // ── Update session stats (only on draw phase) ────────────────────────────
      const newTotalBet = parseFloat(session.betAmount) + (input.phase === "deal" ? input.betAmount : 0);
      const newTotalWin = parseFloat(session.winAmount) + winAmount;
      const newAppliedRtp = newTotalBet > 0 ? (newTotalWin / newTotalBet) * 100 : 0;
      const newRoundCount = input.phase === "draw" ? session.roundCount + 1 : session.roundCount;

      if (input.phase === "draw") {
        await createGameRound({
          sessionId: session.id,
          tenantId: session.tenantId,
          gameId: session.gameId,
          roundNumber: newRoundCount,
          betAmount: input.betAmount.toFixed(2),
          winAmount: winAmount.toFixed(2),
          resultData: JSON.stringify({ handType, multiplier, isWin: winAmount > 0 }),
          rtpApplied: newAppliedRtp.toFixed(2),
        });

        await updateGameSession(session.id, {
          betAmount: newTotalBet.toFixed(2),
          winAmount: newTotalWin.toFixed(2),
          appliedRtp: newAppliedRtp.toFixed(2),
          roundCount: newRoundCount,
        });
      }

      // ── Encrypt and return ───────────────────────────────────────────────────
      const sensitiveResult = {
        hand: finalHand,
        handType: input.phase === "draw" ? handType : null,
        multiplier: input.phase === "draw" ? multiplier : 0,
        winAmount: input.phase === "draw" ? winAmount : 0,
        phase: input.phase,
      };
      const encryptedResult = encryptPayload(sensitiveResult, input.sessionToken);

      return {
        phase: input.phase,
        betAmount: input.betAmount,
        winAmount: input.phase === "draw" ? winAmount : 0,
        isWin: winAmount > 0,
        handType: input.phase === "draw" ? handType : null,
        encryptedResult,
        sessionStats: {
          totalBet: newTotalBet,
          totalWin: newTotalWin,
          appliedRtp: newAppliedRtp,
          roundCount: newRoundCount,
        },
      };
    }),

  // ─── Mines: Start Game ─────────────────────────────────────────────────────
  /**
   * minesStart — Start a Mines game with given bet and mine count.
   * Server generates mine positions and returns encrypted result.
   */
  minesStart: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
        betAmount: z.number().positive(),
        mineCount: z.number().int().min(1).max(24),
        _sig: z
          .object({
            timestamp: z.string().optional(),
            nonce: z.string().optional(),
            signature: z.string().optional(),
            bodyHash: z.string().optional(),
          })
          .optional(),
        _clientIp: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const key = await validateApiKey(input.apiKey);

      if (key.isDemo) {
        const ip =
          input._clientIp ||
          (ctx as any)?.req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
          (ctx as any)?.req?.socket?.remoteAddress ||
          "unknown";
        checkDemoRate(ip);
      }

      tryVerifySignature({
        apiKey: input.apiKey,
        timestamp: input._sig?.timestamp,
        nonce: input._sig?.nonce,
        signature: input._sig?.signature,
        bodyHash: input._sig?.bodyHash,
        isDemo: key.isDemo,
      });

      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (!key.isDemo && session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active" });
      }

      const game = await getGameById(session.gameId);
      if (!game) throw new TRPCError({ code: "NOT_FOUND" });

      const minBet = parseFloat(game.minBet);
      const maxBet = parseFloat(game.maxBet);
      if (input.betAmount < minBet || input.betAmount > maxBet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bet must be between ${minBet} and ${maxBet}`,
        });
      }

      // Generate mine positions (0-24)
      const total = 25;
      const minePositions: number[] = [];
      const available = Array.from({ length: total }, (_, i) => i);
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
      minePositions.push(...available.slice(0, input.mineCount));

      // RTP control
      const targetRtp = parseFloat(session.targetRtp);
      const currentRtp =
        parseFloat(session.betAmount) > 0
          ? (parseFloat(session.winAmount) / parseFloat(session.betAmount)) * 100
          : targetRtp;

      if (currentRtp > targetRtp + 5) {
        // Running hot: shift mines toward early-click cells
        // Re-shuffle to bias toward first few indices
        for (let attempt = 0; attempt < 3; attempt++) {
          const alt: number[] = [];
          const altAvail = Array.from({ length: total }, (_, i) => i);
          for (let i = altAvail.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [altAvail[i], altAvail[j]] = [altAvail[j], altAvail[i]];
          }
          alt.push(...altAvail.slice(0, input.mineCount));
          // Check if more mines are in first 9 cells (3x3 corner)
          const earlyCount = alt.filter((p) => p < 9).length;
          const origEarlyCount = minePositions.filter((p) => p < 9).length;
          if (earlyCount > origEarlyCount) {
            minePositions.length = 0;
            minePositions.push(...alt);
            break;
          }
        }
      }

      // Deduct bet from session
      const newTotalBet = parseFloat(session.betAmount) + input.betAmount;
      await updateGameSession(session.id, {
        betAmount: newTotalBet.toFixed(2),
      });

      // Encrypt mine positions
      const sensitiveResult = {
        minePositions,
        mineCount: input.mineCount,
        betAmount: input.betAmount,
      };
      const encryptedResult = encryptPayload(sensitiveResult, input.sessionToken);

      return {
        encryptedResult,
        mineCount: input.mineCount,
        betAmount: input.betAmount,
      };
    }),

  // ─── Mines: Reveal Cell ────────────────────────────────────────────────────
  /**
   * minesReveal — Reveal a cell. Server returns whether it's a mine or safe.
   */
  minesReveal: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
        cellIndex: z.number().int().min(0).max(24),
        _sig: z
          .object({
            timestamp: z.string().optional(),
            nonce: z.string().optional(),
            signature: z.string().optional(),
            bodyHash: z.string().optional(),
          })
          .optional(),
        _clientIp: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const key = await validateApiKey(input.apiKey);

      if (key.isDemo) {
        const ip =
          input._clientIp ||
          (ctx as any)?.req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
          (ctx as any)?.req?.socket?.remoteAddress ||
          "unknown";
        checkDemoRate(ip);
      }

      tryVerifySignature({
        apiKey: input.apiKey,
        timestamp: input._sig?.timestamp,
        nonce: input._sig?.nonce,
        signature: input._sig?.signature,
        bodyHash: input._sig?.bodyHash,
        isDemo: key.isDemo,
      });

      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (!key.isDemo && session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active" });
      }

      // Decrypt session metadata to get mine positions
      // In demo mode, we use a simpler approach
      const isDemo = key.isDemo;
      const isMine = isDemo
        ? Math.random() < 0.2 // Demo: 20% chance of mine
        : false; // Production would decrypt stored mine positions

      // Calculate multiplier
      const revealedCount = parseInt(session.resultData || "0") + 1;
      const safe = 25 - 5; // default mine count
      let multiplier = 1;
      if (revealedCount > 0 && revealedCount <= safe) {
        let prob = 1;
        for (let i = 0; i < revealedCount; i++) {
          prob *= (safe - i) / (25 - i);
        }
        multiplier = Math.round((0.97 / prob) * 100) / 100;
      }

      const winAmount = isMine ? 0 : parseFloat(session.betAmount) * multiplier;

      if (!isMine) {
        await updateGameSession(session.id, {
          winAmount: (parseFloat(session.winAmount) + winAmount - parseFloat(session.betAmount) * (multiplier - 1) > 0
            ? parseFloat(session.winAmount)
            : parseFloat(session.winAmount)
          ).toFixed(2),
          resultData: String(revealedCount),
        });
      }

      const sensitiveResult = { isMine, cellIndex: input.cellIndex, multiplier };
      const encryptedResult = encryptPayload(sensitiveResult, input.sessionToken);

      return {
        isMine,
        multiplier,
        winAmount,
        encryptedResult,
      };
    }),

  // ─── Mines: Cash Out ───────────────────────────────────────────────────────
  /**
   * minesCashOut — Cash out current winnings in a Mines game.
   */
  minesCashOut: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
        multiplier: z.number().positive(),
        _sig: z
          .object({
            timestamp: z.string().optional(),
            nonce: z.string().optional(),
            signature: z.string().optional(),
            bodyHash: z.string().optional(),
          })
          .optional(),
        _clientIp: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const key = await validateApiKey(input.apiKey);

      tryVerifySignature({
        apiKey: input.apiKey,
        timestamp: input._sig?.timestamp,
        nonce: input._sig?.nonce,
        signature: input._sig?.signature,
        bodyHash: input._sig?.bodyHash,
        isDemo: key.isDemo,
      });

      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (!key.isDemo && session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active" });
      }

      const winAmount = parseFloat(session.betAmount) * input.multiplier;

      const newTotalWin = parseFloat(session.winAmount) + winAmount;
      const newAppliedRtp =
        parseFloat(session.betAmount) > 0
          ? (newTotalWin / parseFloat(session.betAmount)) * 100
          : 0;
      const newRoundCount = session.roundCount + 1;

      await createGameRound({
        sessionId: session.id,
        tenantId: session.tenantId,
        gameId: session.gameId,
        roundNumber: newRoundCount,
        betAmount: parseFloat(session.betAmount).toFixed(2),
        winAmount: winAmount.toFixed(2),
        resultData: JSON.stringify({ cashOut: true, multiplier: input.multiplier }),
        rtpApplied: newAppliedRtp.toFixed(2),
      });

      await updateGameSession(session.id, {
        winAmount: newTotalWin.toFixed(2),
        appliedRtp: newAppliedRtp.toFixed(2),
        roundCount: newRoundCount,
        status: "completed",
        completedAt: new Date(),
      });

      return {
        winAmount,
        multiplier: input.multiplier,
        sessionStats: {
          totalBet: parseFloat(session.betAmount),
          totalWin: newTotalWin,
          appliedRtp: newAppliedRtp,
          roundCount: newRoundCount,
        },
      };
    }),

  // ─── Crash: Start Round ────────────────────────────────────────────────────
  /**
   * crashStart — Start a Crash round. Server determines crash point.
   */
  crashStart: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
        betAmount: z.number().positive(),
        _sig: z
          .object({
            timestamp: z.string().optional(),
            nonce: z.string().optional(),
            signature: z.string().optional(),
            bodyHash: z.string().optional(),
          })
          .optional(),
        _clientIp: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const key = await validateApiKey(input.apiKey);

      if (key.isDemo) {
        const ip =
          input._clientIp ||
          (ctx as any)?.req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
          (ctx as any)?.req?.socket?.remoteAddress ||
          "unknown";
        checkDemoRate(ip);
      }

      tryVerifySignature({
        apiKey: input.apiKey,
        timestamp: input._sig?.timestamp,
        nonce: input._sig?.nonce,
        signature: input._sig?.signature,
        bodyHash: input._sig?.bodyHash,
        isDemo: key.isDemo,
      });

      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (!key.isDemo && session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active" });
      }

      const game = await getGameById(session.gameId);
      if (!game) throw new TRPCError({ code: "NOT_FOUND" });

      const minBet = parseFloat(game.minBet);
      const maxBet = parseFloat(game.maxBet);
      if (input.betAmount < minBet || input.betAmount > maxBet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bet must be between ${minBet} and ${maxBet}`,
        });
      }

      // Generate crash point
      const targetRtp = parseFloat(session.targetRtp);
      const currentRtp =
        parseFloat(session.betAmount) > 0
          ? (parseFloat(session.winAmount) / parseFloat(session.betAmount)) * 100
          : targetRtp;

      // Generate multiple candidates and pick based on RTP
      const candidates: number[] = [];
      for (let i = 0; i < 5; i++) {
        const e = 2.71828;
        const random = Math.random();
        const crashPoint = 0.97 / (1 - random);
        candidates.push(Math.max(1, Math.round(crashPoint * 100) / 100));
      }

      let crashPoint = candidates[0];
      if (currentRtp > targetRtp + 5) {
        crashPoint = Math.min(...candidates);
      } else if (currentRtp < targetRtp - 5) {
        crashPoint = Math.max(...candidates);
      }

      // Deduct bet
      const newTotalBet = parseFloat(session.betAmount) + input.betAmount;
      await updateGameSession(session.id, {
        betAmount: newTotalBet.toFixed(2),
      });

      // Encrypt crash point
      const sensitiveResult = { crashPoint };
      const encryptedResult = encryptPayload(sensitiveResult, input.sessionToken);

      return {
        encryptedResult,
        betAmount: input.betAmount,
      };
    }),

  // ─── Crash: Cash Out ───────────────────────────────────────────────────────
  /**
   * crashCashOut — Cash out at current multiplier before crash.
   */
  crashCashOut: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
        multiplier: z.number().positive(),
        _sig: z
          .object({
            timestamp: z.string().optional(),
            nonce: z.string().optional(),
            signature: z.string().optional(),
            bodyHash: z.string().optional(),
          })
          .optional(),
        _clientIp: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const key = await validateApiKey(input.apiKey);

      tryVerifySignature({
        apiKey: input.apiKey,
        timestamp: input._sig?.timestamp,
        nonce: input._sig?.nonce,
        signature: input._sig?.signature,
        bodyHash: input._sig?.bodyHash,
        isDemo: key.isDemo,
      });

      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (!key.isDemo && session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active" });
      }

      const winAmount = parseFloat(session.betAmount) * input.multiplier;

      const newTotalWin = parseFloat(session.winAmount) + winAmount;
      const newAppliedRtp =
        parseFloat(session.betAmount) > 0
          ? (newTotalWin / parseFloat(session.betAmount)) * 100
          : 0;
      const newRoundCount = session.roundCount + 1;

      await createGameRound({
        sessionId: session.id,
        tenantId: session.tenantId,
        gameId: session.gameId,
        roundNumber: newRoundCount,
        betAmount: parseFloat(session.betAmount).toFixed(2),
        winAmount: winAmount.toFixed(2),
        resultData: JSON.stringify({ cashOut: true, multiplier: input.multiplier }),
        rtpApplied: newAppliedRtp.toFixed(2),
      });

      await updateGameSession(session.id, {
        winAmount: newTotalWin.toFixed(2),
        appliedRtp: newAppliedRtp.toFixed(2),
        roundCount: newRoundCount,
        status: "completed",
        completedAt: new Date(),
      });

      return {
        winAmount,
        multiplier: input.multiplier,
        sessionStats: {
          totalBet: parseFloat(session.betAmount),
          totalWin: newTotalWin,
          appliedRtp: newAppliedRtp,
          roundCount: newRoundCount,
        },
      };
    }),
});
