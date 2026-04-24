/**
 * MinesEngine — Game logic for Mines (5×5 grid, configurable mines)
 *
 * Pure TypeScript, no canvas/PixiJS dependency.
 * All game logic runs client-side; server validates and controls RTP.
 */

export type CellState = 'hidden' | 'safe' | 'mine';

export interface MinesState {
  mineCount: number;
  cells: CellState[]; // 25 cells, flat array index 0-24
  revealedCount: number;
  currentMultiplier: number;
  isGameOver: boolean;
  hitMine: boolean;
}

/**
 * Calculate multiplier: houseEdge / P(all revealed are safe)
 * P = C(25-mineCount, revealedCount) / C(25, revealedCount)
 */
export function calculateMultiplier(mineCount: number, revealedCount: number): number {
  if (revealedCount === 0) return 1.0;
  const total = 25;
  const safe = total - mineCount;
  if (revealedCount > safe) return 0;

  let prob = 1;
  for (let i = 0; i < revealedCount; i++) {
    prob *= (safe - i) / (total - i);
  }
  const houseEdge = 0.97;
  return Math.round((houseEdge / prob) * 100) / 100;
}

/**
 * Create initial state with server-provided mine positions.
 */
export function createInitialState(mineCount: number, minePositions: number[]): MinesState {
  const cells: CellState[] = Array(25).fill('hidden');
  for (const pos of minePositions) cells[pos] = 'mine';
  return {
    mineCount,
    cells,
    revealedCount: 0,
    currentMultiplier: 1.0,
    isGameOver: false,
    hitMine: false,
  };
}

/**
 * Reveal a cell. Server determines if it's a mine or safe.
 */
export function revealCell(state: MinesState, cellIndex: number, isMine: boolean): MinesState {
  if (state.isGameOver) return state;
  if (cellIndex < 0 || cellIndex >= 25) return state;
  if (state.cells[cellIndex] !== 'hidden') return state;

  const newCells = [...state.cells];

  if (isMine) {
    newCells[cellIndex] = 'mine';
    // Reveal all mines on game over
    for (let i = 0; i < 25; i++) {
      if (state.cells[i] === 'mine' && i !== cellIndex) newCells[i] = 'mine';
    }
    return { ...state, cells: newCells, isGameOver: true, hitMine: true };
  }

  newCells[cellIndex] = 'safe';
  const newRevealed = state.revealedCount + 1;
  const newMultiplier = calculateMultiplier(state.mineCount, newRevealed);
  const maxSafe = 25 - state.mineCount;

  return {
    ...state,
    cells: newCells,
    revealedCount: newRevealed,
    currentMultiplier: newMultiplier,
    isGameOver: newRevealed >= maxSafe,
    hitMine: false,
  };
}

/**
 * Get next potential multiplier (for UI preview)
 */
export function getNextMultiplier(state: MinesState): number {
  return calculateMultiplier(state.mineCount, state.revealedCount + 1);
}

/**
 * Cash-out value for a given bet
 */
export function getCashOutValue(betAmount: number, state: MinesState): number {
  if (state.revealedCount === 0) return 0;
  return Math.round(betAmount * state.currentMultiplier * 100) / 100;
}

/**
 * Generate demo mine positions (client-side only, for testing)
 */
export function generateDemoMines(mineCount: number, exclude: number[] = []): number[] {
  const positions: number[] = [];
  const available = Array.from({ length: 25 }, (_, i) => i).filter((i) => !exclude.includes(i));
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, mineCount);
}
