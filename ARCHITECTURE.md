# NOVAPLAY Minigame Hub — 架构说明文档

## 系统概述

NOVAPLAY Minigame Hub 是一个面向运营商（Operator）的多租户在线小游戏平台，支持将游戏以 iframe 或 JS SDK 方式嵌入任意第三方网站，并为每个租户提供独立的 RTP（Return to Player）控制能力。

---

## 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                    minigame.npgslot.com                      │
│                                                             │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │  Platform   │   │  Game Center │   │  Tenant Admin   │  │
│  │  Home /     │   │  /games      │   │  Dashboard      │  │
│  │  Arch Docs  │   │              │   │  /admin         │  │
│  └──────┬──────┘   └──────┬───────┘   └────────┬────────┘  │
│         │                 │                     │           │
│  ┌──────▼─────────────────▼─────────────────────▼────────┐  │
│  │              React 19 + Tailwind CSS 4                 │  │
│  │              tRPC Client (type-safe API)               │  │
│  └──────────────────────────┬─────────────────────────────┘  │
│                             │ HTTPS                          │
│  ┌──────────────────────────▼─────────────────────────────┐  │
│  │              Node.js + Express + tRPC Server           │  │
│  │                                                        │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌───────────────┐  │  │
│  │  │  Tenant    │  │  Game Router │  │  RTP Engine   │  │  │
│  │  │  Router    │  │  (HTTP单线程) │  │  (APEX算法)   │  │  │
│  │  └────────────┘  └──────────────┘  └───────────────┘  │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  API Key Middleware (租户鉴权)                    │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └──────────────────────────┬─────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼─────────────────────────────┐  │
│  │              MySQL 5.7 Database                        │  │
│  │  tenants | api_keys | games | game_sessions            │  │
│  │  rtp_configs | game_rounds | tenant_members            │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 多租户 RTP 分离架构

### 设计原则

每个租户（Tenant）拥有完全隔离的数据空间，RTP 配置互不影响：

| 层级 | 说明 |
|------|------|
| **全局 RTP** | 租户为所有游戏设置的默认 RTP 百分比 |
| **游戏级 RTP** | 针对单款游戏覆盖全局配置 |
| **会话级 RTP** | 游戏启动时从配置快照，会话内保持一致 |

### RTP 控制算法（APEX）

服务端 RTP 引擎采用 **APEX（Adaptive Probability EXpression）** 算法：

1. 每局游戏开始时，读取该租户对该游戏的 `targetRtp` 配置
2. 计算当前会话的实际 RTP：`currentRtp = totalWin / totalBet × 100`
3. 计算偏差：`deviation = currentRtp - targetRtp`
4. 动态调整本局胜率：`winChance = baseRate - deviation × 0.01`
5. 根据胜率决定是否产生赢局，并从权重表中选取倍率

**关键特性：**
- 所有 RTP 计算在服务端完成，客户端不可篡改
- 支持 RTP 档位：50% / 70% / 85% / 92% / 96% / 100% / 120%
- 会话级漂移修正，长期趋向目标 RTP

---

## 数据库设计

### 核心数据表

| 表名 | 说明 |
|------|------|
| `users` | 平台用户（Manus OAuth） |
| `tenants` | 租户信息（名称、slug、状态） |
| `tenant_members` | 用户-租户关联（角色：owner/admin/member） |
| `api_keys` | 租户 API Key（用于游戏嵌入鉴权） |
| `games` | 游戏注册表（slug、名称、类型、配置） |
| `rtp_configs` | 租户级 RTP 配置（全局 + 游戏级） |
| `rtp_tiers` | RTP 档位定义 |
| `game_sessions` | 游戏会话记录（投注、赢取、实际 RTP） |
| `game_rounds` | 每局详细记录（倍率、结果数据） |
| `tenant_stats` | 租户统计快照（每日聚合） |

### 多租户隔离策略

所有业务数据表均包含 `tenantId` 外键，查询时强制过滤：

```sql
-- 示例：查询某租户的游戏会话
SELECT * FROM game_sessions
WHERE tenantId = :tenantId
  AND createdAt >= :startDate
ORDER BY createdAt DESC;
```

---

## API 接入层

### 游戏嵌入方式

#### 方式一：iframe 嵌入

```html
<iframe
  src="https://minigame.npgslot.com/play/gem-blitz?apiKey=YOUR_API_KEY&playerId=PLAYER_123"
  width="480"
  height="720"
  frameborder="0"
  allowfullscreen
></iframe>
```

#### 方式二：tRPC API 调用

```typescript
// 1. 开始游戏会话
POST /api/trpc/game.startSession
{
  "apiKey": "npg_xxxxxxxxxxxx",
  "gameSlug": "gem-blitz",
  "playerId": "player_123",
  "currency": "USD",
  "balance": 1000
}

// 2. 执行一局游戏
POST /api/trpc/game.playRound
{
  "sessionToken": "sess_xxxx",
  "betAmount": 10
}

// 3. 结束会话
POST /api/trpc/game.endSession
{
  "sessionToken": "sess_xxxx"
}
```

### API Key 鉴权流程

```
Client Request
    │
    ▼
API Key Middleware
    │── 验证 apiKey 格式
    │── 查询数据库确认 key 有效且未过期
    │── 加载租户 RTP 配置
    │── 注入 tenantId 到请求上下文
    ▼
Game Router Handler
```

---

## 游戏开发规范

### 单人游戏（HTTP 单线程）

- 通信协议：HTTP REST / tRPC
- 线程模型：单线程 Node.js Event Loop
- 适用游戏：Gem Blitz（消除类）、Slot 类、刮刮乐等

### 多人游戏（Worker Threads 多线程）

- 通信协议：WebSocket
- 线程模型：每个游戏房间分配独立 Worker Thread
- 适用游戏：多人竞技、实时对战类

### 游戏注册

每款游戏需在 `games` 表中注册：

```sql
INSERT INTO games (slug, name, type, description, minBet, maxBet, rtpDefault, status)
VALUES ('gem-blitz', 'Gem Blitz', 'single', '宝石消除游戏', 1, 1000, 96, 'active');
```

---

## 部署架构

```
Internet
    │
    ▼
Nginx (minigame.npgslot.com:443)
    │── SSL Termination (Let's Encrypt)
    │── Gzip Compression
    │── Static Asset Caching
    ▼
Node.js App (127.0.0.1:3001)
    │── PM2 Process Manager
    │── Express + tRPC
    ▼
MySQL 5.7 (127.0.0.1:3306)
```

---

## 快速开始

### 本地开发

```bash
git clone https://github.com/jacksun1983china/minigames
cd minigames
pnpm install
cp deploy/.env.production.example .env
# 编辑 .env 填入数据库连接信息
pnpm dev
```

### 服务器部署

```bash
# 在服务器上执行
bash /var/www/minigame-hub/deploy/deploy.sh
```

详见 `deploy/deploy.sh` 和 `deploy/nginx.conf`。
