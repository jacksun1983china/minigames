import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  apiKeys,
  gameRounds,
  gameSessions,
  games,
  rtpConfigs,
  tenantGames,
  tenantMembers,
  tenants,
  users,
  type ApiKey,
  type Game,
  type GameRound,
  type GameSession,
  type InsertApiKey,
  type InsertGameRound,
  type InsertGameSession,
  type InsertRtpConfig,
  type InsertTenant,
  type InsertTenantMember,
  type RtpConfig,
  type Tenant,
  type TenantMember,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod", "username", "passwordHash"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result[0];
}

// ─── Tenants ──────────────────────────────────────────────────────────────────

export async function createTenant(data: InsertTenant): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(tenants).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return result[0];
}

export async function getTenantById(id: number): Promise<Tenant | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return result[0];
}

export async function listTenants(): Promise<Tenant[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tenants).orderBy(desc(tenants.createdAt));
}

export async function updateTenant(id: number, data: Partial<InsertTenant>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(tenants).set(data).where(eq(tenants.id, id));
}

// ─── Tenant Members ───────────────────────────────────────────────────────────

export async function addTenantMember(data: InsertTenantMember): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(tenantMembers).values(data).onDuplicateKeyUpdate({ set: { role: data.role } });
}

export async function getTenantMember(
  tenantId: number,
  userId: number
): Promise<TenantMember | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)))
    .limit(1);
  return result[0];
}

export async function getUserTenants(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ tenant: tenants, member: tenantMembers })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(eq(tenantMembers.userId, userId));
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export async function createApiKey(data: InsertApiKey): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(apiKeys).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
    .limit(1);
  return result[0];
}

export async function listApiKeys(tenantId: number): Promise<ApiKey[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(id: number, tenantId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId)));
}

export async function updateApiKeyLastUsed(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
}

// ─── Games ────────────────────────────────────────────────────────────────────

export async function listGames(publishedOnly = true): Promise<Game[]> {
  const db = await getDb();
  if (!db) return [];
  if (publishedOnly) {
    return db.select().from(games).where(eq(games.isPublished, true)).orderBy(games.name);
  }
  return db.select().from(games).orderBy(games.name);
}

export async function getGameBySlug(slug: string): Promise<Game | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(games).where(eq(games.slug, slug)).limit(1);
  return result[0];
}

export async function getGameById(id: number): Promise<Game | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(games).where(eq(games.id, id)).limit(1);
  return result[0];
}

// ─── RTP Configs ──────────────────────────────────────────────────────────────

export async function getRtpConfig(
  tenantId: number,
  gameId?: number
): Promise<RtpConfig | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  if (gameId !== undefined) {
    // Try game-specific config first
    const gameSpecific = await db
      .select()
      .from(rtpConfigs)
      .where(
        and(
          eq(rtpConfigs.tenantId, tenantId),
          eq(rtpConfigs.gameId, gameId),
          eq(rtpConfigs.isActive, true)
        )
      )
      .limit(1);
    if (gameSpecific[0]) return gameSpecific[0];
  }

  // Fall back to global config (gameId IS NULL)
  const global = await db
    .select()
    .from(rtpConfigs)
    .where(
      and(
        eq(rtpConfigs.tenantId, tenantId),
        isNull(rtpConfigs.gameId),
        eq(rtpConfigs.isActive, true)
      )
    )
    .limit(1);
  return global[0];
}

export async function upsertRtpConfig(data: InsertRtpConfig): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(rtpConfigs).values(data).onDuplicateKeyUpdate({
    set: {
      rtpPercent: data.rtpPercent,
      isActive: data.isActive ?? true,
      updatedBy: data.updatedBy,
    },
  });
}

export async function listRtpConfigs(tenantId: number): Promise<RtpConfig[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(rtpConfigs)
    .where(eq(rtpConfigs.tenantId, tenantId))
    .orderBy(rtpConfigs.gameId);
}

// ─── Game Sessions ────────────────────────────────────────────────────────────

export async function createGameSession(data: InsertGameSession): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(gameSessions).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function getGameSessionByToken(token: string): Promise<GameSession | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(gameSessions)
    .where(eq(gameSessions.sessionToken, token))
    .limit(1);
  return result[0];
}

export async function updateGameSession(
  id: number,
  data: Partial<InsertGameSession>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(gameSessions).set(data).where(eq(gameSessions.id, id));
}

export async function listGameSessions(
  tenantId: number,
  options: { gameId?: number; limit?: number; offset?: number } = {}
): Promise<GameSession[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(gameSessions.tenantId, tenantId)];
  if (options.gameId) conditions.push(eq(gameSessions.gameId, options.gameId));
  return db
    .select()
    .from(gameSessions)
    .where(and(...conditions))
    .orderBy(desc(gameSessions.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);
}

// ─── Game Rounds ──────────────────────────────────────────────────────────────

export async function createGameRound(data: InsertGameRound): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(gameRounds).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function listGameRounds(sessionId: number): Promise<GameRound[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(gameRounds)
    .where(eq(gameRounds.sessionId, sessionId))
    .orderBy(gameRounds.roundNumber);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getTenantStats(tenantId: number) {
  const db = await getDb();
  if (!db) return null;

  const [stats] = await db
    .select({
      totalSessions: sql<number>`COUNT(*)`,
      totalBet: sql<string>`COALESCE(SUM(betAmount), 0)`,
      totalWin: sql<string>`COALESCE(SUM(winAmount), 0)`,
      avgRtp: sql<string>`COALESCE(AVG(appliedRtp), 0)`,
      completedSessions: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
    })
    .from(gameSessions)
    .where(eq(gameSessions.tenantId, tenantId));

  return stats;
}

export async function getDailyStats(tenantId: number, days = 7) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      date: sql<string>`DATE(createdAt)`,
      sessions: sql<number>`COUNT(*)`,
      totalBet: sql<string>`COALESCE(SUM(betAmount), 0)`,
      totalWin: sql<string>`COALESCE(SUM(winAmount), 0)`,
    })
    .from(gameSessions)
    .where(
      and(
        eq(gameSessions.tenantId, tenantId),
        sql`createdAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`
      )
    )
    .groupBy(sql`DATE(createdAt)`)
    .orderBy(sql`DATE(createdAt)`);
}

export async function getGameStats(tenantId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      gameId: gameSessions.gameId,
      gameName: games.name,
      gameSlug: games.slug,
      sessions: sql<number>`COUNT(*)`,
      totalBet: sql<string>`COALESCE(SUM(${gameSessions.betAmount}), 0)`,
      totalWin: sql<string>`COALESCE(SUM(${gameSessions.winAmount}), 0)`,
      avgRtp: sql<string>`COALESCE(AVG(${gameSessions.appliedRtp}), 0)`,
    })
    .from(gameSessions)
    .innerJoin(games, eq(gameSessions.gameId, games.id))
    .where(eq(gameSessions.tenantId, tenantId))
    .groupBy(gameSessions.gameId, games.name, games.slug);
}

export async function listTenantGames(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ tenantGame: tenantGames, game: games })
    .from(tenantGames)
    .innerJoin(games, eq(tenantGames.gameId, games.id))
    .where(and(eq(tenantGames.tenantId, tenantId), eq(tenantGames.isEnabled, true)));
}
