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

// ─── API Key validation helper ────────────────────────────────────────────────

async function validateApiKey(apiKey: string) {
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
        playerId: z.string().min(1).max(128),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const key = await validateApiKey(input.apiKey);

      const game = await getGameBySlug(input.gameSlug);
      if (!game || !game.isPublished) throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars

      // Resolve RTP for this tenant + game
      const rtpConfig = await getRtpConfig(key.tenantId, game.id);
      const targetRtp = rtpConfig ? parseFloat(rtpConfig.rtpPercent) : parseFloat(game.baseRtp);

      // Generate session token
      const sessionToken = `sess_${crypto.randomBytes(16).toString("hex")}`;

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
      };
    }),

  /** Play a round in an active session */
  playRound: publicProcedure
    .input(
      z.object({
        apiKey: z.string(),
        sessionToken: z.string(),
        betAmount: z.number().positive(),
      })
    )
    .mutation(async ({ input }) => {
      const key = await validateApiKey(input.apiKey);

      const session = await getGameSessionByToken(input.sessionToken);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });
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
      const totalBet = parseFloat(session.betAmount) + input.betAmount;
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

      return {
        roundNumber: newRoundCount,
        betAmount: input.betAmount,
        winAmount: roundResult.winAmount,
        isWin: roundResult.isWin,
        multiplier: roundResult.finalMultiplier,
        grid: roundResult.grid,
        matches: roundResult.matches,
        cascades: roundResult.cascades,
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
      if (session.tenantId !== key.tenantId) throw new TRPCError({ code: "FORBIDDEN" });

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
