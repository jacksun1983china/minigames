import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  bigint,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─────────────────────────────────────────────
// Users (platform admin / tenant owners)
// ─────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─────────────────────────────────────────────
// Tenants — multi-tenant isolation root
// ─────────────────────────────────────────────
export const tenants = mysqlTable(
  "tenants",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    contactEmail: varchar("contactEmail", { length: 320 }),
    status: mysqlEnum("status", ["active", "suspended", "pending"]).default("active").notNull(),
    globalRtp: decimal("globalRtp", { precision: 5, scale: 2 }).default("96.00").notNull(),
    /** JSON array of allowed origins — stored as TEXT for MySQL 5.7 compat */
    allowedOrigins: text("allowedOrigins"),
    logoUrl: text("logoUrl"),
    websiteUrl: text("websiteUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("tenants_slug_idx").on(t.slug),
    statusIdx: index("tenants_status_idx").on(t.status),
  })
);

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

// ─────────────────────────────────────────────
// Tenant Members
// ─────────────────────────────────────────────
export const tenantMembers = mysqlTable(
  "tenant_members",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", ["owner", "admin", "viewer"]).default("viewer").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    tenantUserIdx: uniqueIndex("tenant_members_tenant_user_idx").on(t.tenantId, t.userId),
    tenantIdx: index("tenant_members_tenant_idx").on(t.tenantId),
    userIdx: index("tenant_members_user_idx").on(t.userId),
  })
);

export type TenantMember = typeof tenantMembers.$inferSelect;
export type InsertTenantMember = typeof tenantMembers.$inferInsert;

// ─────────────────────────────────────────────
// API Keys
// ─────────────────────────────────────────────
export const apiKeys = mysqlTable(
  "api_keys",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    keyHash: varchar("keyHash", { length: 64 }).notNull().unique(),
    keyPrefix: varchar("keyPrefix", { length: 16 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    /** Comma-separated scopes for MySQL 5.7 compat */
    scopes: text("scopes"),
    isActive: boolean("isActive").default(true).notNull(),
    lastUsedAt: timestamp("lastUsedAt"),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("api_keys_tenant_idx").on(t.tenantId),
    keyHashIdx: uniqueIndex("api_keys_hash_idx").on(t.keyHash),
  })
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// ─────────────────────────────────────────────
// Games
// ─────────────────────────────────────────────
export const games = mysqlTable(
  "games",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    category: mysqlEnum("category", ["puzzle", "arcade", "card", "slot", "casual", "multiplayer"])
      .default("casual")
      .notNull(),
    gameType: mysqlEnum("gameType", ["single", "multiplayer"]).default("single").notNull(),
    thumbnailUrl: text("thumbnailUrl"),
    previewUrl: text("previewUrl"),
    baseRtp: decimal("baseRtp", { precision: 5, scale: 2 }).default("96.00").notNull(),
    minBet: decimal("minBet", { precision: 10, scale: 2 }).default("1.00").notNull(),
    maxBet: decimal("maxBet", { precision: 10, scale: 2 }).default("1000.00").notNull(),
    version: varchar("version", { length: 32 }).default("1.0.0").notNull(),
    isPublished: boolean("isPublished").default(true).notNull(),
    /** Comma-separated tags */
    tags: text("tags"),
    /** JSON config stored as TEXT */
    config: text("config"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("games_slug_idx").on(t.slug),
    categoryIdx: index("games_category_idx").on(t.category),
    publishedIdx: index("games_published_idx").on(t.isPublished),
  })
);

export type Game = typeof games.$inferSelect;
export type InsertGame = typeof games.$inferInsert;

// ─────────────────────────────────────────────
// RTP Configs
// ─────────────────────────────────────────────
export const rtpConfigs = mysqlTable(
  "rtp_configs",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    /** NULL = global config for tenant */
    gameId: int("gameId"),
    rtpPercent: decimal("rtpPercent", { precision: 5, scale: 2 }).default("96.00").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    updatedBy: int("updatedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    tenantGameIdx: uniqueIndex("rtp_configs_tenant_game_idx").on(t.tenantId, t.gameId),
    tenantIdx: index("rtp_configs_tenant_idx").on(t.tenantId),
  })
);

export type RtpConfig = typeof rtpConfigs.$inferSelect;
export type InsertRtpConfig = typeof rtpConfigs.$inferInsert;

// ─────────────────────────────────────────────
// Game Sessions
// ─────────────────────────────────────────────
export const gameSessions = mysqlTable(
  "game_sessions",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    gameId: int("gameId").notNull(),
    playerId: varchar("playerId", { length: 128 }).notNull(),
    sessionToken: varchar("sessionToken", { length: 64 }).notNull().unique(),
    status: mysqlEnum("status", ["active", "completed", "abandoned", "error"])
      .default("active")
      .notNull(),
    betAmount: decimal("betAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
    winAmount: decimal("winAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
    appliedRtp: decimal("appliedRtp", { precision: 5, scale: 2 }).notNull(),
    targetRtp: decimal("targetRtp", { precision: 5, scale: 2 }).notNull(),
    roundCount: int("roundCount").default(0).notNull(),
    /** JSON stored as TEXT */
    metadata: text("metadata"),
    resultData: text("resultData"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("game_sessions_tenant_idx").on(t.tenantId),
    gameIdx: index("game_sessions_game_idx").on(t.gameId),
    playerIdx: index("game_sessions_player_idx").on(t.playerId),
    tenantGameIdx: index("game_sessions_tenant_game_idx").on(t.tenantId, t.gameId),
    statusIdx: index("game_sessions_status_idx").on(t.status),
    tokenIdx: uniqueIndex("game_sessions_token_idx").on(t.sessionToken),
    startedAtIdx: index("game_sessions_started_idx").on(t.startedAt),
  })
);

export type GameSession = typeof gameSessions.$inferSelect;
export type InsertGameSession = typeof gameSessions.$inferInsert;

// ─────────────────────────────────────────────
// Game Rounds
// ─────────────────────────────────────────────
export const gameRounds = mysqlTable(
  "game_rounds",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    sessionId: bigint("sessionId", { mode: "number" }).notNull(),
    tenantId: int("tenantId").notNull(),
    gameId: int("gameId").notNull(),
    roundNumber: int("roundNumber").notNull(),
    betAmount: decimal("betAmount", { precision: 12, scale: 2 }).notNull(),
    winAmount: decimal("winAmount", { precision: 12, scale: 2 }).notNull(),
    resultData: text("resultData"),
    rtpApplied: decimal("rtpApplied", { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index("game_rounds_session_idx").on(t.sessionId),
    tenantIdx: index("game_rounds_tenant_idx").on(t.tenantId),
    createdAtIdx: index("game_rounds_created_idx").on(t.createdAt),
  })
);

export type GameRound = typeof gameRounds.$inferSelect;
export type InsertGameRound = typeof gameRounds.$inferInsert;

// ─────────────────────────────────────────────
// Tenant Games
// ─────────────────────────────────────────────
export const tenantGames = mysqlTable(
  "tenant_games",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull(),
    gameId: int("gameId").notNull(),
    customName: varchar("customName", { length: 128 }),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    tags: text("tags"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    tenantGameIdx: uniqueIndex("tenant_games_tenant_game_idx").on(t.tenantId, t.gameId),
    tenantIdx: index("tenant_games_tenant_idx").on(t.tenantId),
  })
);

export type TenantGame = typeof tenantGames.$inferSelect;
export type InsertTenantGame = typeof tenantGames.$inferInsert;
