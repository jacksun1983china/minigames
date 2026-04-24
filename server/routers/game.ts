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
});
