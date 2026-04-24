/**
 * VideoPokerEngine — Jacks or Better
 * Pure TypeScript, no canvas/PixiJS dependency.
 * All game logic runs client-side; server validates and controls RTP.
 */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  value: number; // 2-14, A=14
}

export type HandType =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'jacks_or_better'
  | 'no_win';

export interface HandResult {
  handType: HandType;
  multiplier: number;
  label: string;
}

// Standard Jacks or Better pay table (9/6 full pay, RTP ≈ 99.54%)
export const PAY_TABLE: Record<HandType, { multiplier: number; label: string }> = {
  royal_flush:     { multiplier: 800, label: 'Royal Flush' },
  straight_flush:  { multiplier: 50,  label: 'Straight Flush' },
  four_of_a_kind:  { multiplier: 25,  label: 'Four of a Kind' },
  full_house:      { multiplier: 9,   label: 'Full House' },
  flush:           { multiplier: 6,   label: 'Flush' },
  straight:        { multiplier: 4,   label: 'Straight' },
  three_of_a_kind: { multiplier: 3,   label: 'Three of a Kind' },
  two_pair:        { multiplier: 2,   label: 'Two Pair' },
  jacks_or_better: { multiplier: 1,   label: 'Jacks or Better' },
  no_win:          { multiplier: 0,   label: 'No Win' },
};

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'];

function rankValue(rank: Rank): number {
  if (typeof rank === 'number') return rank;
  return { J: 11, Q: 12, K: 13, A: 14 }[rank]!;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: rankValue(rank) });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/**
 * Deal initial 5 cards from a shuffled deck.
 * Returns { hand: Card[5], remaining: Card[] }
 */
export function dealHand(deck: Card[]): { hand: Card[]; remaining: Card[] } {
  return { hand: deck.slice(0, 5), remaining: deck.slice(5) };
}

/**
 * Draw replacement cards for non-held positions.
 * heldIndices: array of 0-4 indices to keep.
 */
export function drawCards(
  hand: Card[],
  heldIndices: number[],
  remaining: Card[]
): Card[] {
  const newHand = [...hand];
  let drawIdx = 0;
  for (let i = 0; i < 5; i++) {
    if (!heldIndices.includes(i)) {
      newHand[i] = remaining[drawIdx++];
    }
  }
  return newHand;
}

/**
 * Evaluate a 5-card hand and return the HandResult.
 */
export function evaluateHand(hand: Card[]): HandResult {
  const values = hand.map((c) => c.value).sort((a, b) => a - b);
  const suits = hand.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  const isStraight = checkStraight(values);
  const counts = getCounts(values);
  const maxCount = Math.max(...Object.values(counts));

  // Royal Flush
  if (isFlush && isStraight && values[4] === 14 && values[0] === 10) {
    return result('royal_flush');
  }
  // Straight Flush
  if (isFlush && isStraight) return result('straight_flush');
  // Four of a Kind
  if (maxCount === 4) return result('four_of_a_kind');
  // Full House
  if (maxCount === 3 && Object.values(counts).includes(2)) return result('full_house');
  // Flush
  if (isFlush) return result('flush');
  // Straight
  if (isStraight) return result('straight');
  // Three of a Kind
  if (maxCount === 3) return result('three_of_a_kind');
  // Two Pair
  const pairs = Object.values(counts).filter((c) => c === 2).length;
  if (pairs === 2) return result('two_pair');
  // Jacks or Better (one pair of J, Q, K, or A)
  if (pairs === 1) {
    const pairValue = parseInt(
      Object.entries(counts).find(([, c]) => c === 2)![0]
    );
    if (pairValue >= 11) return result('jacks_or_better');
  }
  return result('no_win');
}

function result(handType: HandType): HandResult {
  return { handType, ...PAY_TABLE[handType] };
}

function checkStraight(sortedValues: number[]): boolean {
  // Normal straight
  const normal = sortedValues[4] - sortedValues[0] === 4 &&
    new Set(sortedValues).size === 5;
  // Ace-low straight: A-2-3-4-5
  const aceLow =
    sortedValues[4] === 14 &&
    sortedValues[0] === 2 &&
    sortedValues[1] === 3 &&
    sortedValues[2] === 4 &&
    sortedValues[3] === 5;
  return normal || aceLow;
}

function getCounts(values: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

/**
 * Get suit symbol for display
 */
export function suitSymbol(suit: Suit): string {
  return { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[suit];
}

export function suitColor(suit: Suit): string {
  return suit === 'hearts' || suit === 'diamonds' ? '#e53e3e' : '#1a202c';
}

export function rankDisplay(rank: Rank): string {
  return String(rank);
}
