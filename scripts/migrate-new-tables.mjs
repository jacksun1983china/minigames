import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const tables = [
  {
    name: 'tenants',
    sql: `CREATE TABLE IF NOT EXISTS \`tenants\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`slug\` varchar(64) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`description\` text,
  \`contactEmail\` varchar(320),
  \`status\` enum('active','suspended','pending') NOT NULL DEFAULT 'active',
  \`globalRtp\` decimal(5,2) NOT NULL DEFAULT '96.00',
  \`allowedOrigins\` text,
  \`logoUrl\` text,
  \`websiteUrl\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`tenants_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`tenants_slug_unique\` UNIQUE(\`slug\`)
);`
  },
  {
    name: 'tenant_members',
    sql: `CREATE TABLE IF NOT EXISTS \`tenant_members\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` int NOT NULL,
  \`userId\` int NOT NULL,
  \`role\` enum('owner','admin','viewer') NOT NULL DEFAULT 'viewer',
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \`tenant_members_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`tenant_members_tenant_user_idx\` UNIQUE(\`tenantId\`,\`userId\`)
);`
  },
  {
    name: 'api_keys',
    sql: `CREATE TABLE IF NOT EXISTS \`api_keys\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` int NOT NULL,
  \`keyHash\` varchar(64) NOT NULL,
  \`keyPrefix\` varchar(16) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`scopes\` text,
  \`isActive\` boolean NOT NULL DEFAULT true,
  \`lastUsedAt\` timestamp NULL,
  \`expiresAt\` timestamp NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`api_keys_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`api_keys_keyHash_unique\` UNIQUE(\`keyHash\`)
);`
  },
  {
    name: 'games',
    sql: `CREATE TABLE IF NOT EXISTS \`games\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`slug\` varchar(64) NOT NULL,
  \`name\` varchar(128) NOT NULL,
  \`description\` text,
  \`category\` enum('puzzle','arcade','card','slot','casual','multiplayer') NOT NULL DEFAULT 'casual',
  \`gameType\` enum('single','multiplayer') NOT NULL DEFAULT 'single',
  \`thumbnailUrl\` text,
  \`previewUrl\` text,
  \`baseRtp\` decimal(5,2) NOT NULL DEFAULT '96.00',
  \`minBet\` decimal(10,2) NOT NULL DEFAULT '1.00',
  \`maxBet\` decimal(10,2) NOT NULL DEFAULT '1000.00',
  \`version\` varchar(32) NOT NULL DEFAULT '1.0.0',
  \`isPublished\` boolean NOT NULL DEFAULT true,
  \`tags\` text,
  \`config\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`games_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`games_slug_unique\` UNIQUE(\`slug\`)
);`
  },
  {
    name: 'rtp_configs',
    sql: `CREATE TABLE IF NOT EXISTS \`rtp_configs\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` int NOT NULL,
  \`gameId\` int,
  \`rtpPercent\` decimal(5,2) NOT NULL DEFAULT '96.00',
  \`isActive\` boolean NOT NULL DEFAULT true,
  \`updatedBy\` int,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`rtp_configs_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`rtp_configs_tenant_game_idx\` UNIQUE(\`tenantId\`,\`gameId\`)
);`
  },
  {
    name: 'game_sessions',
    sql: `CREATE TABLE IF NOT EXISTS \`game_sessions\` (
  \`id\` bigint AUTO_INCREMENT NOT NULL,
  \`tenantId\` int NOT NULL,
  \`gameId\` int NOT NULL,
  \`playerId\` varchar(128) NOT NULL,
  \`sessionToken\` varchar(64) NOT NULL,
  \`status\` enum('active','completed','abandoned','error') NOT NULL DEFAULT 'active',
  \`betAmount\` decimal(12,2) NOT NULL DEFAULT '0.00',
  \`winAmount\` decimal(12,2) NOT NULL DEFAULT '0.00',
  \`appliedRtp\` decimal(5,2) NOT NULL,
  \`targetRtp\` decimal(5,2) NOT NULL,
  \`roundCount\` int NOT NULL DEFAULT 0,
  \`metadata\` text,
  \`resultData\` text,
  \`startedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`completedAt\` timestamp NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`game_sessions_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`game_sessions_sessionToken_unique\` UNIQUE(\`sessionToken\`)
);`
  },
  {
    name: 'game_rounds',
    sql: `CREATE TABLE IF NOT EXISTS \`game_rounds\` (
  \`id\` bigint AUTO_INCREMENT NOT NULL,
  \`sessionId\` bigint NOT NULL,
  \`tenantId\` int NOT NULL,
  \`gameId\` int NOT NULL,
  \`roundNumber\` int NOT NULL,
  \`betAmount\` decimal(12,2) NOT NULL,
  \`winAmount\` decimal(12,2) NOT NULL,
  \`resultData\` text,
  \`rtpApplied\` decimal(5,2) NOT NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \`game_rounds_id\` PRIMARY KEY(\`id\`)
);`
  },
  {
    name: 'tenant_games',
    sql: `CREATE TABLE IF NOT EXISTS \`tenant_games\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`tenantId\` int NOT NULL,
  \`gameId\` int NOT NULL,
  \`customName\` varchar(128),
  \`isEnabled\` boolean NOT NULL DEFAULT true,
  \`tags\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`tenant_games_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`tenant_games_tenant_game_idx\` UNIQUE(\`tenantId\`,\`gameId\`)
);`
  }
];

const indexes = [
  `CREATE INDEX IF NOT EXISTS \`tenants_status_idx\` ON \`tenants\` (\`status\`)`,
  `CREATE INDEX IF NOT EXISTS \`tenant_members_tenant_idx\` ON \`tenant_members\` (\`tenantId\`)`,
  `CREATE INDEX IF NOT EXISTS \`tenant_members_user_idx\` ON \`tenant_members\` (\`userId\`)`,
  `CREATE INDEX IF NOT EXISTS \`api_keys_tenant_idx\` ON \`api_keys\` (\`tenantId\`)`,
  `CREATE INDEX IF NOT EXISTS \`games_category_idx\` ON \`games\` (\`category\`)`,
  `CREATE INDEX IF NOT EXISTS \`games_published_idx\` ON \`games\` (\`isPublished\`)`,
  `CREATE INDEX IF NOT EXISTS \`rtp_configs_tenant_idx\` ON \`rtp_configs\` (\`tenantId\`)`,
  `CREATE INDEX IF NOT EXISTS \`game_sessions_tenant_idx\` ON \`game_sessions\` (\`tenantId\`)`,
  `CREATE INDEX IF NOT EXISTS \`game_sessions_game_idx\` ON \`game_sessions\` (\`gameId\`)`,
  `CREATE INDEX IF NOT EXISTS \`game_sessions_player_idx\` ON \`game_sessions\` (\`playerId\`)`,
  `CREATE INDEX IF NOT EXISTS \`game_sessions_status_idx\` ON \`game_sessions\` (\`status\`)`,
  `CREATE INDEX IF NOT EXISTS \`game_sessions_started_idx\` ON \`game_sessions\` (\`startedAt\`)`,
  `CREATE INDEX IF NOT EXISTS \`game_rounds_session_idx\` ON \`game_rounds\` (\`sessionId\`)`,
  `CREATE INDEX IF NOT EXISTS \`game_rounds_tenant_idx\` ON \`game_rounds\` (\`tenantId\`)`,
  `CREATE INDEX IF NOT EXISTS \`game_rounds_created_idx\` ON \`game_rounds\` (\`createdAt\`)`,
  `CREATE INDEX IF NOT EXISTS \`tenant_games_tenant_idx\` ON \`tenant_games\` (\`tenantId\`)`,
];

console.log('🚀 Running migrations...\n');

for (const table of tables) {
  try {
    await conn.execute(table.sql);
    console.log(`✅ Table created: ${table.name}`);
  } catch (err) {
    if (err.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log(`⏭️  Table already exists: ${table.name}`);
    } else {
      console.error(`❌ Error creating ${table.name}:`, err.message);
    }
  }
}

console.log('\n📑 Creating indexes...');
for (const idx of indexes) {
  try {
    await conn.execute(idx);
  } catch (err) {
    // Ignore duplicate index errors
    if (!err.message.includes('Duplicate key name')) {
      console.warn('  Index warning:', err.message);
    }
  }
}

// Seed initial game data
console.log('\n🎮 Seeding initial game...');
await conn.execute(`
  INSERT IGNORE INTO \`games\` 
    (\`slug\`, \`name\`, \`description\`, \`category\`, \`gameType\`, \`baseRtp\`, \`minBet\`, \`maxBet\`, \`version\`, \`isPublished\`, \`tags\`, \`config\`)
  VALUES
    ('gem-blitz', 'Gem Blitz', 'A dazzling match-3 gem puzzle game with cascading combos and multipliers. Place your bet and match gems to win!', 'puzzle', 'single', '96.00', '1.00', '500.00', '1.0.0', true, 'puzzle,match3,gems,featured', '{"gridSize":8,"gemTypes":6,"minMatch":3,"maxMultiplier":10}')
`);
console.log('✅ Game seeded: Gem Blitz');

await conn.end();
console.log('\n✨ Migration complete!');
