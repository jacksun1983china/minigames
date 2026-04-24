# Minigame Hub - Project TODO

## Phase 1: Database Schema
- [x] Design and write drizzle/schema.ts (tenants, api_keys, games, game_sessions, rtp_configs, game_rounds, tenant_members, tenant_stats, rtp_tiers)
- [x] Generate migration SQL via drizzle-kit
- [x] Apply migration via manual migration script (MySQL 5.7 compatible)
- [x] Add DB query helpers in server/db.ts
- [x] Seed initial game data (Gem Blitz)

## Phase 2: Backend tRPC Routes
- [x] Tenant CRUD procedures (register, list, get, stats)
- [x] API Key management procedures (create, revoke, validate)
- [x] RTP config procedures (get, set global, set per-game, tiers)
- [x] Game session procedures (start, playRound, end, list)
- [x] Game management procedures (list, get by slug)
- [x] Public game API endpoint (iframe/SDK entry with API Key auth)
- [x] RTP engine (server-side win calculation with drift correction)
- [x] Tenant sessions query route

## Phase 3: Platform Homepage & Game Center
- [x] Global CSS theme (dark elegant style, gold accents, Rajdhani/Orbitron fonts)
- [x] App.tsx routing setup (Home, GameCenter, GamePlay, Dashboard, TenantSetup, ApiDocs)
- [x] Landing page with animated architecture diagram (SVG)
- [x] API documentation page
- [x] Multi-tenant RTP explanation section
- [x] Game center page with game cards grid
- [x] Game card component (preview, RTP badge, launch button)
- [x] NOVAPLAY logo in navigation

## Phase 4: First Minigame - "Gem Blitz" (PixiJS 消除类)
- [x] PixiJS v8 + gsap installed
- [x] GemBlitzEngine.ts (gem grid, GSAP animations, particles, win effects)
- [x] Responsive canvas (portrait/landscape adaptive)
- [x] Gem types (6 colors), match animations
- [x] Score & bet system with server-side RTP control
- [x] Win/lose animations (GSAP powered)
- [x] Game HUD (balance, bet presets, win display, stats)
- [x] Game session API integration (startSession, playRound, endSession)
- [x] Embed mode (iframe-friendly, ?apiKey=&playerId= params)
- [x] NOVAPLAY GameLoader (logo + gold progress bar)

## Phase 5: Tenant Admin Dashboard
- [x] Dashboard layout with tab navigation
- [x] Overview stats (total sessions, revenue, actual RTP)
- [x] RTP configuration panel (global + per-game sliders)
- [x] API Key management (create, copy, revoke)
- [x] Game session report table

## Phase 6: Testing & Delivery
- [x] Vitest unit tests for RTP calculation logic (8 tests)
- [x] Vitest tests for tenant/API key validation (9 tests)
- [x] Vitest tests for auth logout (1 test)
- [x] All 18 tests passing
- [x] Save checkpoint
- [x] Generate Nginx + PM2 deployment config
- [x] Push code to GitHub (jacksun1983china/minigames)
- [x] Deploy to server 108.165.255.110
- [x] Configure domain minigame.npgslot.com with SSL
- [x] Fix tRPC API on Node 16 (CJS bundle + @whatwg-node/fetch polyfill)
