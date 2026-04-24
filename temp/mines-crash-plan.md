# Mines & Crash 开发计划

创建时间: 2026-04-25 03:15

## 目标
在现有 NOVAPLAY 平台内开发 Mines 和 Crash 两个新游戏，遵循现有架构规范，不影响其他游戏。

## 架构分析
- 每个游戏有独立页面 (VideoPoker.tsx) + 引擎 (VideoPokerEngine.ts) + 服务端路由
- 游戏通过 `/play/:slug` 或独立路由访问
- 服务端通过 tRPC procedures 处理游戏逻辑，控制 RTP
- GameLoader 用于加载动画
- AES-256-GCM 加密游戏结果

## 步骤

### Mines (扫雷)
- [ ] 1. 创建服务端 minesStart + minesReveal procedures
- [ ] 2. 创建客户端 Mines.tsx 页面
- [ ] 3. 注册游戏到数据库
- [ ] 4. 添加路由

### Crash (碰撞)
- [ ] 5. 创建服务端 crashStart + crashCashOut procedures  
- [ ] 6. 创建客户端 Crash.tsx 页面
- [ ] 7. 注册游戏到数据库
- [ ] 8. 添加路由

### 通用
- [ ] 9. 更新 GameCenter 添加游戏卡片
- [ ] 10. 更新 seed 脚本
- [ ] 11. 构建测试

## 当前进度

- [x] 1. 创建 MinesEngine.ts (游戏引擎)
- [x] 2. 创建 Mines.tsx (游戏页面)
- [x] 3. 创建 CrashEngine.ts (游戏引擎)
- [x] 4. 创建 Crash.tsx (游戏页面)
- [x] 5. 添加服务端路由 (minesStart, minesReveal, minesCashOut, crashStart, crashCashOut)
- [x] 6. 更新 App.tsx 路由 (/play/mines, /play/crash)
- [x] 7. 更新 GameCenter 游戏卡片
- [x] 8. 更新 seed 脚本，注册新游戏
- [x] 9. TypeScript 检查通过
- [x] 10. 完整构建通过 ✅

## 设计要点

### Mines
- 5×5 网格，玩家选择地雷数 (1-24)
- 点击格子，安全则倍数增加，踩雷则输
- 随时 Cash Out 提取赢奖
- 服务端生成地雷位置，带 RTP 控制

### Crash
- 乘数从 1.00x 上升，随机崩溃
- 崩溃前 Cash Out 则赢
- 服务端决定崩溃点，带 RTP 控制
