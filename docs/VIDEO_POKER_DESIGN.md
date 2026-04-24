# Video Poker — 游戏设计文档

## 1. 游戏规则（Jacks or Better）

标准 5 张牌 Video Poker，规则与 Las Vegas 原版一致：

### 流程
1. 玩家下注（BET）
2. 发 5 张牌（初始手牌）
3. 玩家选择锁定（HOLD）任意张牌
4. 翻拍（DRAW）：未锁定的牌替换为新牌
5. 判断最终手牌，按赔率表结算

### 赔率表（Jacks or Better 标准版，RTP ≈ 99.54%）

| 手牌类型 | 英文 | 赔率（1x bet） |
|---------|------|--------------|
| 皇家同花顺 | Royal Flush | 800x |
| 同花顺 | Straight Flush | 50x |
| 四条 | Four of a Kind | 25x |
| 葫芦 | Full House | 9x |
| 同花 | Flush | 6x |
| 顺子 | Straight | 4x |
| 三条 | Three of a Kind | 3x |
| 两对 | Two Pair | 2x |
| 一对J或更高 | Jacks or Better | 1x |
| 其他 | No Win | 0x |

## 2. RTP 隔离机制

与 Gem Blitz 相同，通过服务端 `targetRtp` 控制：

- **96% 档**：降低高倍手牌（Royal Flush、Straight Flush）的概率
- **99.54% 档**：标准赔率，完全随机
- **实现方式**：服务端在 DRAW 阶段根据 `targetRtp` 调整替换牌的权重

### RTP 档位映射
```
50%  → 极低，大量 No Win
70%  → 低，减少 Jacks or Better 概率
85%  → 中低
92%  → 中
96%  → 标准（默认）
99.54% → 原版标准
```

## 3. 数据结构

### 牌的表示
```ts
interface Card {
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';  // ♠♥♦♣
  rank: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A';
  value: number;  // 2-14 (A=14)
}
```

### 手牌结果
```ts
interface PokerHandResult {
  handType: HandType;
  multiplier: number;
  winAmount: number;
  cards: Card[];
  heldIndices: number[];
}

type HandType =
  | 'royal_flush' | 'straight_flush' | 'four_of_a_kind'
  | 'full_house' | 'flush' | 'straight' | 'three_of_a_kind'
  | 'two_pair' | 'jacks_or_better' | 'no_win';
```

### API 接口

#### startSession（复用现有）
- 输入：`{ apiKey, gameSlug: 'video-poker', playerId }`
- 输出：`{ sessionToken, sessionKey, ... }`

#### dealCards（新增）
- 输入：`{ apiKey, sessionToken, betAmount }`
- 输出：`{ encryptedCards: string }` → 解密后得到 `{ cards: Card[], deckSeed: string }`

#### drawCards（新增）
- 输入：`{ apiKey, sessionToken, heldIndices: number[] }`
- 输出：`{ encryptedResult: string }` → 解密后得到 `{ finalCards: Card[], handType, multiplier, winAmount }`

## 4. 布局设计

### 竖屏（手机竖屏，宽 < 高）
```
┌─────────────────────────┐
│  Header: 游戏名 + 余额   │
├─────────────────────────┤
│                         │
│    5张牌区域（居中）      │
│  [♠A] [♥K] [♦Q] [♣J] [♠10] │
│  HOLD  HOLD  HOLD  HOLD  HOLD │
│                         │
├─────────────────────────┤
│  赔率表（可折叠）         │
├─────────────────────────┤
│  BET: [1][5][10][25][50] │
│  [DEAL / DRAW]          │
└─────────────────────────┘
```

### 横屏（手机横屏，宽 > 高）
```
┌────────────────────────────────────────┐
│  Header: 游戏名 + 余额 + RTP           │
├──────────────────────┬─────────────────┤
│                      │  赔率表          │
│  5张牌区域            │  Royal: 800x    │
│  [♠A][♥K][♦Q][♣J][♠10] │  Str.Flush: 50x │
│  HOLD×5              │  ...            │
│                      │  BET: [1][5][10] │
│                      │  [DEAL / DRAW]  │
└──────────────────────┴─────────────────┘
```

### PC（宽 > 768px）
```
┌────────────────────────────────────────────────┐
│  Header: 游戏名 + 余额 + ROUNDS + RTP           │
├────────────────────────────────────────────────┤
│         赔率表（横排，高亮当前手牌类型）           │
├────────────────────────────────────────────────┤
│                                                │
│     5张牌（大尺寸，居中）                        │
│   [♠A] [♥K] [♦Q] [♣J] [♠10]                  │
│   HOLD  HOLD  HOLD  HOLD  HOLD                │
│                                                │
├────────────────────────────────────────────────┤
│  BET: [1] [5] [10] [25] [50] [100]  [DEAL/DRAW] │
└────────────────────────────────────────────────┘
```

## 5. 视觉风格

- 背景：深色（`oklch(10% 0.015 260)`），与 Gem Blitz 一致
- 牌面：白底圆角卡片，花色用标准颜色（红/黑）
- HOLD 标签：金色高亮，卡片上方显示
- DEAL 按钮：金色渐变（与 Gem Blitz PLAY 按钮一致）
- 赢牌动画：卡片金色发光 + 胜利文字浮现
- 翻牌动画：CSS 3D flip（Y轴旋转）
