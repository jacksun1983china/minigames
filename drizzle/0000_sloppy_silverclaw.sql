CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`keyHash` varchar(64) NOT NULL,
	`keyPrefix` varchar(16) NOT NULL,
	`name` varchar(128) NOT NULL,
	`scopes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastUsedAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_keyHash_unique` UNIQUE(`keyHash`),
	CONSTRAINT `api_keys_hash_idx` UNIQUE(`keyHash`)
);
--> statement-breakpoint
CREATE TABLE `game_rounds` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`sessionId` bigint NOT NULL,
	`tenantId` int NOT NULL,
	`gameId` int NOT NULL,
	`roundNumber` int NOT NULL,
	`betAmount` decimal(12,2) NOT NULL,
	`winAmount` decimal(12,2) NOT NULL,
	`resultData` text,
	`rtpApplied` decimal(5,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `game_rounds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `game_sessions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`gameId` int NOT NULL,
	`playerId` varchar(128) NOT NULL,
	`sessionToken` varchar(64) NOT NULL,
	`status` enum('active','completed','abandoned','error') NOT NULL DEFAULT 'active',
	`betAmount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`winAmount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`appliedRtp` decimal(5,2) NOT NULL,
	`targetRtp` decimal(5,2) NOT NULL,
	`roundCount` int NOT NULL DEFAULT 0,
	`metadata` text,
	`resultData` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_sessions_sessionToken_unique` UNIQUE(`sessionToken`),
	CONSTRAINT `game_sessions_token_idx` UNIQUE(`sessionToken`)
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`category` enum('puzzle','arcade','card','slot','casual','multiplayer') NOT NULL DEFAULT 'casual',
	`gameType` enum('single','multiplayer') NOT NULL DEFAULT 'single',
	`thumbnailUrl` text,
	`previewUrl` text,
	`baseRtp` decimal(5,2) NOT NULL DEFAULT '96.00',
	`minBet` decimal(10,2) NOT NULL DEFAULT '1.00',
	`maxBet` decimal(10,2) NOT NULL DEFAULT '1000.00',
	`version` varchar(32) NOT NULL DEFAULT '1.0.0',
	`isPublished` boolean NOT NULL DEFAULT true,
	`tags` text,
	`config` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `games_id` PRIMARY KEY(`id`),
	CONSTRAINT `games_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `games_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `rtp_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`gameId` int,
	`rtpPercent` decimal(5,2) NOT NULL DEFAULT '96.00',
	`isActive` boolean NOT NULL DEFAULT true,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rtp_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `rtp_configs_tenant_game_idx` UNIQUE(`tenantId`,`gameId`)
);
--> statement-breakpoint
CREATE TABLE `tenant_games` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`gameId` int NOT NULL,
	`customName` varchar(128),
	`isEnabled` boolean NOT NULL DEFAULT true,
	`tags` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_games_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_games_tenant_game_idx` UNIQUE(`tenantId`,`gameId`)
);
--> statement-breakpoint
CREATE TABLE `tenant_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','viewer') NOT NULL DEFAULT 'viewer',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_members_tenant_user_idx` UNIQUE(`tenantId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`contactEmail` varchar(320),
	`status` enum('active','suspended','pending') NOT NULL DEFAULT 'active',
	`globalRtp` decimal(5,2) NOT NULL DEFAULT '96.00',
	`allowedOrigins` text,
	`logoUrl` text,
	`websiteUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenants_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `tenants_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `api_keys_tenant_idx` ON `api_keys` (`tenantId`);--> statement-breakpoint
CREATE INDEX `game_rounds_session_idx` ON `game_rounds` (`sessionId`);--> statement-breakpoint
CREATE INDEX `game_rounds_tenant_idx` ON `game_rounds` (`tenantId`);--> statement-breakpoint
CREATE INDEX `game_rounds_created_idx` ON `game_rounds` (`createdAt`);--> statement-breakpoint
CREATE INDEX `game_sessions_tenant_idx` ON `game_sessions` (`tenantId`);--> statement-breakpoint
CREATE INDEX `game_sessions_game_idx` ON `game_sessions` (`gameId`);--> statement-breakpoint
CREATE INDEX `game_sessions_player_idx` ON `game_sessions` (`playerId`);--> statement-breakpoint
CREATE INDEX `game_sessions_tenant_game_idx` ON `game_sessions` (`tenantId`,`gameId`);--> statement-breakpoint
CREATE INDEX `game_sessions_status_idx` ON `game_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `game_sessions_started_idx` ON `game_sessions` (`startedAt`);--> statement-breakpoint
CREATE INDEX `games_category_idx` ON `games` (`category`);--> statement-breakpoint
CREATE INDEX `games_published_idx` ON `games` (`isPublished`);--> statement-breakpoint
CREATE INDEX `rtp_configs_tenant_idx` ON `rtp_configs` (`tenantId`);--> statement-breakpoint
CREATE INDEX `tenant_games_tenant_idx` ON `tenant_games` (`tenantId`);--> statement-breakpoint
CREATE INDEX `tenant_members_tenant_idx` ON `tenant_members` (`tenantId`);--> statement-breakpoint
CREATE INDEX `tenant_members_user_idx` ON `tenant_members` (`userId`);--> statement-breakpoint
CREATE INDEX `tenants_status_idx` ON `tenants` (`status`);