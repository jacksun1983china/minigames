# NOVAPLAY Minigame 开发文档

> 版本：v1.0 | 更新日期：2026-04-25 | 适用平台：minigame-hub

---

## 目录

1. [统一加载界面（GameLoader）使用指南](#1-统一加载界面gameloader使用指南)
2. [API 传输安全规范](#2-api-传输安全规范)
3. [新游戏接入流程](#3-新游戏接入流程)
4. [目录结构说明](#4-目录结构说明)

---

## 1. 统一加载界面（GameLoader）使用指南

所有 NOVAPLAY 游戏**必须**使用统一的加载界面，以保持品牌一致性。加载界面显示 NOVAPLAY 金色凤凰 Logo，并包含动态金色进度条。

### 1.1 组件位置

```
client/src/components/GameLoader.tsx
```

该文件导出两个内容：

| 导出名 | 类型 | 说明 |
|--------|------|------|
| `GameLoader` | React 组件 | 全屏加载界面，显示 Logo + 进度条 |
| `useGameLoader` | React Hook | 管理加载状态的辅助 Hook |

---

### 1.2 GameLoader 组件 Props

```typescript
interface GameLoaderProps {
  /** 进度值 0–100，由外部控制。若不传则自动动画到 97% 后停止 */
  progress?: number;
  /** 进度条下方的文字标签，默认 "Loading..." */
  label?: string;
  /** 进度达到 100% 并淡出动画结束后的回调 */
  onComplete?: () => void;
  /** 是否显示加载界面，默认 true */
  visible?: boolean;
}
```

**重要规则**：`onComplete` 在进度条到达 100% 后，经过 **500ms 淡出动画**才会被调用。游戏内容必须在 `onComplete` 触发后才能显示，不允许提前显示游戏画面。

---

### 1.3 useGameLoader Hook

```typescript
const {
  loaderVisible,    // boolean — 是否显示 Loader
  loaderProgress,   // number  — 当前进度值（0–100）
  completeLoading,  // () => void — 游戏资源加载完毕时调用，进度跳至 100%
  done,             // boolean — Loader 完全消失后为 true
  handleComplete,   // () => void — 传给 <GameLoader onComplete={...}>
} = useGameLoader(autoComplete?: boolean);
```

- `autoComplete`（可选，默认 `false`）：若为 `true`，进度条会在约 2.6 秒后自动跳到 100%，适用于不需要等待真实资源加载的场景（如纯演示页面）。

---

### 1.4 标准使用方式（推荐）

以下是在游戏页面中集成 `GameLoader` 的**标准模板**：

```tsx
import { GameLoader, useGameLoader } from "@/components/GameLoader";

export default function MyGame() {
  const { loaderVisible, loaderProgress, completeLoading, handleComplete } = useGameLoader();
  const [gameReady, setGameReady] = useState(false);

  useEffect(() => {
    // 1. 初始化游戏引擎（异步）
    initMyGameEngine().then(() => {
      // 2. 引擎就绪后，调用 completeLoading() 让进度跳到 100%
      completeLoading();
      setGameReady(true);
    });
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      {/* 3. 加载界面覆盖在游戏上方（z-index: 9999） */}
      <GameLoader
        progress={loaderProgress}
        label={`Loading My Game...`}
        visible={loaderVisible}
        onComplete={handleComplete}  // 4. 淡出完成后隐藏 Loader
      />

      {/* 5. 游戏内容（Loader 消失前不可见，但 DOM 已挂载，引擎可以初始化） */}
      <div style={{ opacity: loaderVisible ? 0 : 1 }}>
        {/* 游戏 canvas / 内容 */}
      </div>
    </div>
  );
}
```

**关键点说明**：

游戏内容的 DOM 节点（如 `<canvas>`）应该在 Loader 显示期间就挂载到 DOM 中，这样游戏引擎可以在后台初始化，用户看到的是加载界面，引擎实际上已在运行。通过 `opacity: 0` 隐藏游戏内容，而非 `display: none`，避免引擎因元素不可见而无法获取尺寸。

---

### 1.5 自定义进度控制

如果游戏有多个加载阶段（如：加载资源 → 初始化引擎 → 连接服务器），可以手动控制进度：

```tsx
const [progress, setProgress] = useState(0);
const [loaderVisible, setLoaderVisible] = useState(true);

useEffect(() => {
  async function load() {
    setProgress(20);
    await loadAssets();       // 加载图片、音效等资源

    setProgress(60);
    await initEngine();       // 初始化游戏引擎

    setProgress(90);
    await connectServer();    // 建立服务器连接

    setProgress(100);         // 完成，触发淡出
  }
  load();
}, []);

return (
  <GameLoader
    progress={progress}
    label="Loading assets..."
    visible={loaderVisible}
    onComplete={() => setLoaderVisible(false)}
  />
);
```

---

### 1.6 自动模式（无需等待资源）

适用于纯前端游戏或演示页面：

```tsx
const { loaderVisible, loaderProgress, handleComplete } = useGameLoader(true); // autoComplete = true

return (
  <GameLoader
    progress={loaderProgress}
    visible={loaderVisible}
    onComplete={handleComplete}
  />
);
```

进度条将在约 2.6 秒内自动完成并消失。

---

### 1.7 Logo 资源

Logo 文件位于 `client/public/novaplay-logo.png`，通过 `/novaplay-logo.png` 路径引用。**不允许**修改或替换此文件，所有游戏必须使用同一个 Logo。

---

## 2. API 传输安全规范

### 2.1 安全架构概述

NOVAPLAY 平台采用以下安全机制保护游戏 API：

| 机制 | 算法 | 保护目标 |
|------|------|---------|
| 请求签名 | HMAC-SHA256 | 防止请求篡改和重放攻击 |
| 响应加密 | AES-256-GCM | 防止游戏结果被中间人截获分析 |
| 时间窗口验证 | ±30 秒 | 防止重放攻击 |
| Nonce 去重 | 内存缓存（5 分钟） | 防止同一请求重放 |
| Demo 限速 | 每分钟 30 次 | 防止 Demo 模式滥用 |

### 2.2 服务端工具模块

```
server/crypto-utils.ts
```

提供以下函数：

```typescript
// 验证请求签名（在 tRPC procedure 中调用）
verifyRequestSignature(params: {
  sessionToken: string;
  betAmount: number;
  timestamp: number;
  nonce: string;
  signature: string;
}): boolean

// 加密游戏结果（在 playRound 返回前调用）
encryptGameResult(
  payload: object,    // 需要加密的游戏结果
  sessionKey: string  // 从 startSession 返回的 sessionKey（hex）
): string             // 返回 base64 编码的加密字符串

// 生成 session key（在 startSession 时调用）
generateSessionKey(): string  // 返回 hex 编码的 32 字节随机 key
```

### 2.3 客户端工具模块

```
client/src/lib/crypto-client.ts
```

提供以下函数（基于 Web Crypto API，无需额外依赖）：

```typescript
// 生成请求签名
signRequest(params: {
  sessionToken: string;
  betAmount: number;
  timestamp: number;
  nonce: string;
}): Promise<string>  // 返回 HMAC-SHA256 签名（hex）

// 解密服务端返回的游戏结果
decryptPayload(
  encryptedData: string,  // base64 编码的加密字符串
  sessionKey: string      // hex 编码的 sessionKey
): Promise<object>        // 返回解密后的 JSON 对象
```

### 2.4 新游戏接入安全要求

开发新游戏时，**必须**遵守以下安全规范：

1. **不允许**在 URL 参数中明文传递 `apiKey`（当前 Gem Blitz 的 demo 模式保留此方式，但正式接入需改为 session cookie）
2. **必须**在 `playRound` 请求中携带 HMAC 签名（`timestamp + nonce + signature`）
3. **必须**使用 `sessionKey` 解密服务端返回的游戏结果，不允许直接使用明文结果
4. `sessionKey` 只在 `startSession` 响应中出现一次，客户端应存储在内存中（不允许存入 `localStorage` 或 `sessionStorage`）
5. 游戏结果的关键字段（`grid`、`matches`、`multiplier`）**必须**通过加密通道传输

---

## 3. 新游戏接入流程

### 3.1 文件创建清单

开发一个新游戏需要创建以下文件：

```
client/src/game/MyGameEngine.ts     ← 游戏引擎（PixiJS 或其他）
client/src/pages/MyGamePlay.tsx     ← 游戏页面（集成 GameLoader）
server/routers/game.ts              ← 在现有路由中添加游戏 slug
drizzle/schema.ts                   ← 在 games 表中插入游戏数据
```

### 3.2 GamePlay 页面模板

新游戏页面**必须**按照以下结构组织：

```tsx
// 1. 导入 GameLoader
import { GameLoader, useGameLoader } from "@/components/GameLoader";
import { decryptPayload } from "@/lib/crypto-client";

// 2. 使用 useGameLoader hook
const { loaderVisible, loaderProgress, completeLoading, handleComplete } = useGameLoader();

// 3. 引擎初始化时调用 completeLoading()
engine.init(...).then(() => {
  completeLoading();
});

// 4. 渲染时包含 GameLoader
return (
  <>
    <GameLoader
      progress={loaderProgress}
      label={`Loading ${gameName}...`}
      visible={loaderVisible}
      onComplete={handleComplete}
    />
    {/* 游戏内容 */}
  </>
);
```

### 3.3 自适应布局规范

游戏页面**必须**支持三种显示模式：

| 模式 | 触发条件 | 布局要求 |
|------|---------|---------|
| PC | `width > height && width >= 900px` | 左侧游戏区域（正方形），右侧控制面板 |
| 手机横屏 | `width > height && width < 900px` | 左侧游戏区域（正方形），右侧竖排控制面板 |
| 手机竖屏 | `width <= height` | 上方游戏区域（正方形，填满宽度），下方控制面板 |

**禁止**使用 `window.innerWidth/innerHeight` 检测尺寸（在 iframe 内不准确），应使用 `document.documentElement.clientWidth/clientHeight` 或 `ResizeObserver`。

**禁止**任何模式下出现滚动条或内容被裁切。

---

## 4. 目录结构说明

```
minigame-hub/
├── client/
│   ├── public/
│   │   └── novaplay-logo.png          ← NOVAPLAY Logo（禁止修改）
│   └── src/
│       ├── components/
│       │   └── GameLoader.tsx         ← 统一加载界面（公共框架）
│       ├── game/
│       │   └── GemBlitzEngine.ts      ← Gem Blitz 游戏引擎（参考实现）
│       ├── lib/
│       │   └── crypto-client.ts       ← 客户端加密工具
│       └── pages/
│           ├── GamePlay.tsx           ← 游戏运行页面（/play/:slug）
│           └── GameDetail.tsx         ← 游戏详情页（/game/:slug）
├── server/
│   ├── crypto-utils.ts                ← 服务端加密工具
│   └── routers/
│       └── game.ts                    ← 游戏 API 路由
└── docs/
    └── GAME_DEVELOPMENT_GUIDE.md      ← 本文档
```

---

## 附录：常见问题

**Q：为什么 Loader 必须等到 100% 才消失？**

A：过早消失会让用户看到空白或未初始化的游戏画面，体验很差。`completeLoading()` 只有在引擎的 `init()` Promise 完成后才能调用，确保用户看到的第一帧是完整的游戏画面。

**Q：可以修改 Loader 的样式吗？**

A：不允许。统一的 Loader 样式是 NOVAPLAY 品牌规范的一部分。如有特殊需求，请与设计团队沟通后统一修改 `GameLoader.tsx`。

**Q：游戏引擎初始化失败怎么办？**

A：在 `engine.init()` 的 `catch` 块中也调用 `completeLoading()`，让 Loader 正常消失，然后在游戏区域显示错误提示。不允许让 Loader 永远停留在屏幕上。

**Q：sessionKey 丢失了怎么办？**

A：`sessionKey` 只存在内存中，页面刷新后会丢失。此时客户端无法解密游戏结果，会 fallback 到 Demo 模式（随机 grid）。正常情况下，用户刷新页面会重新调用 `startSession` 获取新的 `sessionKey`。
