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

## Phase 7: 账号密码登录 + 去除 Manus 痕迹
- [ ] 后端：users 表添加 password_hash 字段，实现 register/login/logout tRPC 路由
- [ ] 后端：去除 OAuth 回调路由，改用 JWT session
- [ ] 前端：替换登录页面为账号密码表单
- [ ] 前端：去除所有 Manus 相关文字、链接、logo、OAuth 引用
- [ ] 前端：更新 useAuth hook 使用新的登录 API
- [ ] 构建并部署到服务器
- [x] 修复 game.playRound 返回 401（demo API key 在服务器端不存在）
- [ ] 修复 CSS background/backgroundSize 混用警告

## Phase 8: 游戏详情页重设计
- [x] 第一屏：iframe 展示游戏 + 设备切换按钮（PC宽屏/手机竖屏/手机横屏）
- [x] 第二屏：游戏介绍（游戏图、最大赢奖、波动率、类型、特殊功能、支持语言国旗、支持货币）

## Phase 9: iframe 自适应修复 + 删除下拉框
- [x] 修复 GameDetail iframe 自适应：PC/手机竖屏/手机横屏三种模式均无滚动条，完整显示游戏
- [x] 删除所有侧边栏下拉框（select 元素）
- [x] 删除第二屏的游戏图片卡片（显示 emoji 的那个无意义卡片）

## Phase 10: 安全加固 + Loading 公共框架化
- [x] 客户端安全审查（apiKey 明文 URL、sessionToken 明文传输等风险识别）
- [x] 服务端 HMAC-SHA256 请求签名验证（server/crypto-utils.ts）
- [x] 服务端 AES-256-GCM 游戏结果加密（server/crypto-utils.ts）
- [x] 客户端 Web Crypto API 解密模块（client/src/lib/crypto-client.ts）
- [x] Demo 模式限速（每分钟 30 次）
- [x] GameLoader 公共框架化（useGameLoader hook 逻辑修复，loading 必须到 100% 才消失）
- [x] 游戏开发文档（docs/GAME_DEVELOPMENT_GUIDE.md）
- [x] 构建并部署到服务器
