import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { z } from "zod/v4";
import {
  addTenantMember,
  createApiKey,
  createTenant,
  getDailyStats,
  getGameStats,
  getTenantById,
  getTenantBySlug,
  getTenantMember,
  getTenantStats,
  getUserByOpenId,
  getUserTenants,
  listApiKeys,
  listGameSessions,
  listRtpConfigs,
  revokeApiKey,
  updateTenant,
  upsertRtpConfig,
} from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { clampRtpToTier, RTP_TIERS } from "../rtp-engine";

// ─── Tenant Router ────────────────────────────────────────────────────────────

export const tenantRouter = router({
  /** Create a new tenant and make the current user the owner */
  create: protectedProcedure
    .input(
      z.object({
        slug: z.string().min(3).max(64).regex(/^[a-z0-9-]+$/),
        name: z.string().min(2).max(128),
        description: z.string().optional(),
        contactEmail: z.string().email().optional(),
        websiteUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getTenantBySlug(input.slug);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" });

      const tenantId = await createTenant({
        slug: input.slug,
        name: input.name,
        description: input.description,
        contactEmail: input.contactEmail,
        websiteUrl: input.websiteUrl,
      });

      await addTenantMember({ tenantId, userId: ctx.user.id, role: "owner" });

      // Create default global RTP config
      await upsertRtpConfig({ tenantId, gameId: null, rtpPercent: "96.00", updatedBy: ctx.user.id });

      return { tenantId, slug: input.slug };
    }),

  /** List all tenants the current user belongs to */
  myTenants: protectedProcedure.query(async ({ ctx }) => {
    return getUserTenants(ctx.user.id);
  }),

  /** Get a single tenant by slug (must be a member) */
  get: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const tenant = await getTenantBySlug(input.slug);
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND" });

      const member = await getTenantMember(tenant.id, ctx.user.id);
      if (!member && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      return { tenant, memberRole: member?.role ?? "viewer" };
    }),

  /** Update tenant settings */
  update: protectedProcedure
    .input(
      z.object({
        tenantId: z.number(),
        name: z.string().min(2).max(128).optional(),
        description: z.string().optional(),
        contactEmail: z.string().email().optional(),
        websiteUrl: z.string().url().optional(),
        allowedOrigins: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await getTenantMember(input.tenantId, ctx.user.id);
      if (!member || (member.role !== "owner" && member.role !== "admin")) {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { tenantId, allowedOrigins, ...rest } = input;
      await updateTenant(tenantId, {
        ...rest,
        allowedOrigins: allowedOrigins ? JSON.stringify(allowedOrigins) : undefined,
      });
      return { success: true };
    }),

  // ─── API Keys ───────────────────────────────────────────────────────────────

  /** Create a new API key for a tenant */
  createApiKey: protectedProcedure
    .input(
      z.object({
        tenantId: z.number(),
        name: z.string().min(1).max(128),
        scopes: z.array(z.string()).default(["game:play", "session:read"]),
        expiresAt: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await getTenantMember(input.tenantId, ctx.user.id);
      if (!member || member.role === "viewer") {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Generate a secure random API key
      const rawKey = `mgk_${crypto.randomBytes(24).toString("hex")}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 12);

      await createApiKey({
        tenantId: input.tenantId,
        keyHash,
        keyPrefix,
        name: input.name,
        scopes: input.scopes.join(","),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      });

      // Return the raw key ONCE — it won't be shown again
      return { rawKey, keyPrefix };
    }),

  /** List API keys for a tenant */
  listApiKeys: protectedProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await getTenantMember(input.tenantId, ctx.user.id);
      if (!member && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const keys = await listApiKeys(input.tenantId);
      // Never return keyHash
      return keys.map(({ keyHash: _h, ...k }) => k);
    }),

  /** Revoke an API key */
  revokeApiKey: protectedProcedure
    .input(z.object({ tenantId: z.number(), keyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const member = await getTenantMember(input.tenantId, ctx.user.id);
      if (!member || member.role === "viewer") {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      }
      await revokeApiKey(input.keyId, input.tenantId);
      return { success: true };
    }),

  // ─── RTP Config ─────────────────────────────────────────────────────────────

  /** Get all RTP configs for a tenant */
  listRtpConfigs: protectedProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await getTenantMember(input.tenantId, ctx.user.id);
      if (!member && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return listRtpConfigs(input.tenantId);
    }),

  /** Set RTP for a tenant (global or per-game) */
  setRtp: protectedProcedure
    .input(
      z.object({
        tenantId: z.number(),
        gameId: z.number().optional(),
        rtpPercent: z.number().refine((v) => RTP_TIERS.includes(v as any), {
          message: `RTP must be one of: ${RTP_TIERS.join(", ")}`,
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await getTenantMember(input.tenantId, ctx.user.id);
      if (!member || member.role === "viewer") {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      }

      await upsertRtpConfig({
        tenantId: input.tenantId,
        gameId: input.gameId ?? null,
        rtpPercent: input.rtpPercent.toFixed(2),
        updatedBy: ctx.user.id,
      });

      return { success: true };
    }),

  // ─── Stats ──────────────────────────────────────────────────────────────────

  /** Get tenant overview stats */
  stats: protectedProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await getTenantMember(input.tenantId, ctx.user.id);
      if (!member && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const [overview, daily, byGame] = await Promise.all([
        getTenantStats(input.tenantId),
        getDailyStats(input.tenantId, 7),
        getGameStats(input.tenantId),
      ]);
      return { overview, daily, byGame };
    }),

  /** Get available RTP tiers */
  rtpTiers: publicProcedure.query(() => RTP_TIERS),

  /** List sessions for a tenant (admin/owner only) */
  sessions: protectedProcedure
    .input(z.object({ tenantId: z.number(), limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const member = await getTenantMember(input.tenantId, ctx.user.id);
      if (!member && ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const sessions = await listGameSessions(input.tenantId, { limit: input.limit });
      return { sessions };
    }),
});
