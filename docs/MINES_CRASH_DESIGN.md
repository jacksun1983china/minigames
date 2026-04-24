# Mines & Crash — 游戏设计文档

## Mines（扫雷）

### 游戏规则
- 5×5 网格，随机分布地雷（玩家可选择 1-24 颗地雷）
- 玩家点击格子，翻开安全格子获得倍数递增
- 踩到地雷 → 输掉下注
- 可随时 "Cash Out" 提取当前赢奖

### 赔率公式
```
multiplier = C(25 - mines, revealed) / C(25, revealed) * (1 - houseEdge)
简化版：multiplier = (25 / (25 - mines)) ^ revealed * (1 - houseEdge)
```

### 数据结构
```ts
interface MinesState {
  gridSize: 5;
  mineCount: number;       // 1-24
  revealedCells: number[];  // 已翻开的格子索引 (0-24)
  minePositions: number[];  // 地雷位置
  currentMultiplier: number;
  isGameOver: boolean;
  cashOutValue: number;
}
```

### API 接口
- `mines.startGame` — 开始游戏，设置 bet + mineCount
- `mines.revealCell` — 翻开格子，返回结果（加密）
- `mines.cashOut` — 提取赢奖

---

## Crash（碰撞）

### 游戏规则
- 乘数从 1.00x 开始上升，随机时间点 "crash"
- 玩家在 crash 前点击 "Cash Out" 锁定赢奖
- crash 后未退出 → 输掉下注

### Crash Point 生成
```
crashPoint = 0.99 / (1 - random())  // 标准公式
经过 RTP 调整后选择最终 crash point
```

### API 接口
- `crash.startGame` — 开始游戏，返回 crashPoint（加密）
- `crash.cashOut` — 提取赢奖，返回结果

---

## 视觉风格
- 与现有游戏一致：深色背景 + 金色强调
- Mines：格子用 🟩（安全）/ 💣（地雷）样式
- Crash：上升曲线动画 + 爆炸效果
