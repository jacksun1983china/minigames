/**
 * Password-based authentication router.
 * Replaces Manus OAuth with username/password login.
 */
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod/v4";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const SALT_ROUNDS = 10;

export const authRouter = router({
  /** Current user info */
  me: publicProcedure.query((opts) => opts.ctx.user),

  /** Register a new account */
  register: publicProcedure
    .input(
      z.object({
        username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
        password: z.string().min(6).max(128),
        name: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if username already exists
      const existing = await db.getUserByUsername(input.username);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already taken" });
      }

      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      // Use username as openId for password-based accounts
      const openId = `pwd_${input.username}`;

      await db.upsertUser({
        openId,
        username: input.username,
        passwordHash,
        name: input.name || input.username,
        loginMethod: "password",
        lastSignedIn: new Date(),
      });

      const user = await db.getUserByOpenId(openId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Auto-login after register
      const sessionToken = await sdk.createSessionToken(openId, {
        name: user.name || input.username,
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      return { success: true, user: { id: user.id, username: user.username, name: user.name, role: user.role } };
    }),

  /** Login with username and password */
  login: publicProcedure
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByUsername(input.username);
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
      }

      // Update last signed in
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || user.username || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      return { success: true, user: { id: user.id, username: user.username, name: user.name, role: user.role } };
    }),

  /** Logout */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  /** Change password (requires login) */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(6).max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByOpenId(ctx.user.openId);
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Password login not set up for this account" });
      }

      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      }

      const newHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.upsertUser({ openId: user.openId, passwordHash: newHash });

      return { success: true };
    }),
});
