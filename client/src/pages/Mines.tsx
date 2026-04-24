/**
 * Mines.tsx — Mines (Minesweeper) game page
 * 
 * 5×5 grid, configurable mine count (1-24).
 * Reveal safe cells to increase multiplier.
 * Hit a mine → lose bet. Cash out anytime → win current multiplier × bet.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { GameLoader, useGameLoader } from "@/components/GameLoader";
import { decryptPayload } from "@/lib/crypto-client";
import {
  calculateMultiplier,
  createInitialState,
  revealCell,
  getNextMultiplier,
  getCashOutValue,
  generateDemoMines,
  type MinesState,
  type CellState,
} from "@/game/MinesEngine";

const BET_PRESETS = [1, 5, 10, 25, 50, 100];
const MINE_COUNT_OPTIONS = [1, 3, 5, 7, 10, 15, 20, 24];

type GamePhase = 'idle' | 'playing' | 'revealing' | 'gameover';

interface SessionInfo {
  sessionToken: string;
  sessionId: number;
  sessionKey?: string;
}

interface EncryptedMinesResult {
  minePositions: number[];
  isMine: boolean;
  winAmount: number;
  multiplier: number;
  revealedCount: number;
  isGameOver: boolean;
}

// ── Cell Component ──────────────────────────────────────────────────────────
function GridCell({
  cellState,
  index,
  onClick,
  disabled,
  isLatest,
}: {
  cellState: CellState;
  index: number;
  onClick: () => void;
  disabled: boolean;
  isLatest: boolean;
}) {
  const bgColor =
    cellState === 'mine'
      ? 'linear-gradient(135deg, #dc2626, #991b1b)'
      : cellState === 'safe'
        ? 'linear-gradient(135deg, #16a34a, #15803d)'
        : 'linear-gradient(135deg, oklch(22% 0.02 260), oklch(18% 0.02 260))';

  const glow = isLatest
    ? cellState === 'mine'
      ? '0 0 20px rgba(220,38,38,0.8)'
      : '0 0 20px rgba(22,163,74,0.8)'
    : '0 2px 8px rgba(0,0,0,0.3)';

  return (
    <button
      onClick={onClick}
      disabled={disabled || cellState !== 'hidden'}
      className="relative aspect-square rounded-xl transition-all duration-200 flex items-center justify-center"
      style={{
        background: bgColor,
        boxShadow: glow,
        border: cellState === 'hidden' ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
        opacity: cellState === 'hidden' ? 1 : 0.95,
        transform: cellState !== 'hidden' ? 'scale(0.95)' : 'scale(1)',
        cursor: disabled || cellState !== 'hidden' ? 'default' : 'pointer',
      }}
    >
      {cellState === 'mine' && (
        <span className="text-2xl sm:text-3xl">💣</span>
      )}
      {cellState === 'safe' && (
        <span className="text-lg sm:text-2xl">💎</span>
      )}
      {cellState === 'hidden' && (
        <span className="text-gray-600 text-lg sm:text-xl font-bold">?</span>
      )}
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function Mines() {
  const urlParams = new URLSearchParams(window.location.search);
  const apiKey = urlParams.get('apiKey') || 'demo';
  const playerId = urlParams.get('playerId') || 'demo_player';

  // Game state
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [gameState, setGameState] = useState<MinesState | null>(null);
  const [latestReveal, setLatestReveal] = useState<number | null>(null);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [mineCount, setMineCount] = useState(5);
  const [stats, setStats] = useState({ totalBet: 0, totalWin: 0, rounds: 0 });
  const [muted, setMuted] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);

  // Viewport
  const [vp, setVp] = useState(() => ({
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  }));
  useEffect(() => {
    const update = () => setVp({
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight,
    });
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);
    window.addEventListener('orientationchange', update);
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', update); };
  }, []);

  const isLandscape = vp.w > vp.h;
  const isPC = vp.w >= 768;

  // Loader
  const { loaderVisible, loaderProgress, completeLoading, handleComplete } = useGameLoader();
  const [gameReady, setGameReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setGameReady(true);
      completeLoading();
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tRPC
  const startSessionMut = trpc.game.startSession.useMutation();
  const playRoundMut = trpc.game.playRound.useMutation();

  useEffect(() => {
    if (!gameReady) return;
    startSessionMut.mutate(
      { apiKey, gameSlug: 'mines', playerId },
      {
        onSuccess: (data) => setSession(data as SessionInfo),
        onError: () => setSession({ sessionToken: 'demo_' + Date.now(), sessionId: 0 }),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameReady]);

  // ── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    if (balance < bet) { toast.error('Insufficient balance!'); return; }

    setBalance((b) => b - bet);
    setPhase('playing');
    setLatestReveal(null);

    // Demo: generate client-side mines
    const demoMines = generateDemoMines(mineCount);
    const initialState = createInitialState(mineCount, demoMines);
    setGameState(initialState);

    // Server round for RTP tracking
    if (session) {
      playRoundMut.mutateAsync({
        apiKey, sessionToken: session.sessionToken, betAmount: bet,
        _clientIp: 'demo',
      }).catch(() => { /* demo fallback */ });
    }
  }, [balance, bet, mineCount, session, apiKey, playRoundMut]);

  // ── Reveal Cell ───────────────────────────────────────────────────────────
  const revealCellHandler = useCallback((cellIndex: number) => {
    if (!gameState || phase !== 'playing') return;

    setPhase('revealing');
    setLatestReveal(cellIndex);

    const isMine = gameState.cells[cellIndex] === 'mine';
    const newState = revealCell(gameState, cellIndex, isMine);
    setGameState(newState);

    if (isMine) {
      setPhase('gameover');
      toast.error(`💣 BOOM! You hit a mine! Lost ${bet.toFixed(2)}`, {
        style: { background: '#1a1a2e', border: '1px solid rgba(220,38,38,0.4)', color: '#ef4444' },
      });
    } else if (newState.isGameOver) {
      // All safe cells revealed — auto win!
      const winAmount = getCashOutValue(bet, newState);
      setBalance((b) => b + winAmount);
      setPhase('gameover');
      toast.success(`🎉 PERFECT! All safe cells found! +${winAmount.toFixed(2)}`, {
        style: { background: '#1a1a2e', border: '1px solid rgba(22,163,74,0.4)', color: '#22c55e' },
      });
    } else {
      setPhase('playing');
    }
  }, [gameState, phase, bet]);

  // ── Cash Out ──────────────────────────────────────────────────────────────
  const cashOut = useCallback(() => {
    if (!gameState || phase !== 'playing' || gameState.revealedCount === 0) return;

    const winAmount = getCashOutValue(bet, gameState);
    setBalance((b) => b + winAmount);
    setPhase('gameover');

    // Reveal all mines
    const revealedState = {
      ...gameState,
      cells: gameState.cells.map((c) => c === 'mine' ? 'mine' as const : c === 'hidden' ? 'safe' as const : c),
      isGameOver: true,
    };
    setGameState(revealedState);

    toast.success(`💰 Cash Out! +${winAmount.toFixed(2)} (${gameState.currentMultiplier}x)`, {
      style: { background: '#1a1a2e', border: '1px solid rgba(245,200,66,0.4)', color: '#f5c842' },
    });
  }, [gameState, phase, bet]);

  // ── Render Helpers ────────────────────────────────────────────────────────
  const canPlay = phase === 'idle' || phase === 'gameover';
  const isPlaying = phase === 'playing' || phase === 'revealing';

  const PlayBtn = () => (
    <button
      onClick={startGame}
      disabled={!gameReady || isPlaying}
      className="w-full rounded-xl font-black tracking-wider transition-all active:scale-95 shrink-0"
      style={{
        padding: '14px 0',
        background: isPlaying || !gameReady
          ? 'oklch(22% 0.02 260)'
          : 'linear-gradient(135deg, #f5c842 0%, #c8960a 50%, #f5c842 100%)',
        color: isPlaying || !gameReady ? '#555' : '#000',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '1.1rem',
        boxShadow: isPlaying || !gameReady ? 'none' : '0 4px 20px rgba(245,200,66,0.3)',
      }}
    >
      {isPlaying ? 'PLAYING...' : '▶ START GAME'}
    </button>
  );

  const CashOutBtn = () => (
    <button
      onClick={cashOut}
      disabled={phase !== 'playing' || !gameState || gameState.revealedCount === 0}
      className="w-full rounded-xl font-black tracking-wider transition-all active:scale-95 shrink-0"
      style={{
        padding: '14px 0',
        background: phase !== 'playing' || !gameState || gameState.revealedCount === 0
          ? 'oklch(22% 0.02 260)'
          : 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #22c55e 100%)',
        color: phase !== 'playing' || !gameState || gameState.revealedCount === 0 ? '#555' : '#000',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '1.1rem',
        boxShadow: phase !== 'playing' || !gameState || gameState.revealedCount === 0 ? 'none' : '0 4px 20px rgba(34,197,94,0.3)',
      }}
    >
      {gameState ? `💰 CASH OUT ${getCashOutValue(bet, gameState).toFixed(2)}` : 'CASH OUT'}
    </button>
  );

  const BetButtons = () => (
    <div className="flex gap-1 flex-wrap justify-center">
      <span className="text-gray-500 text-xs self-center mr-1">BET</span>
      {BET_PRESETS.map((preset) => (
        <button
          key={preset}
          onClick={() => setBet(preset)}
          disabled={isPlaying}
          className="flex-1 min-w-[36px] rounded-lg text-sm font-bold transition-all"
          style={{
            padding: '6px 4px',
            background: bet === preset ? 'linear-gradient(135deg, #f5c842, #c8960a)' : 'oklch(18% 0.015 260)',
            color: bet === preset ? '#000' : '#888',
            border: bet === preset ? '1px solid transparent' : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {preset}
        </button>
      ))}
    </div>
  );

  const MineCountSelector = () => (
    <div className="flex gap-1 flex-wrap justify-center">
      <span className="text-gray-500 text-xs self-center mr-1">MINES</span>
      {MINE_COUNT_OPTIONS.map((count) => (
        <button
          key={count}
          onClick={() => setMineCount(count)}
          disabled={isPlaying}
          className="flex-1 min-w-[32px] rounded-lg text-sm font-bold transition-all"
          style={{
            padding: '6px 4px',
            background: mineCount === count ? 'linear-gradient(135deg, #f5c842, #c8960a)' : 'oklch(18% 0.015 260)',
            color: mineCount === count ? '#000' : '#888',
            border: mineCount === count ? '1px solid transparent' : '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {count}
        </button>
      ))}
    </div>
  );

  const Grid5x5 = () => (
    <div
      className="grid grid-cols-5 gap-1.5 sm:gap-2 mx-auto"
      style={{
        maxWidth: isPC ? '360px' : isLandscape ? '280px' : 'min(80vw, 360px)',
      }}
    >
      {gameState?.cells.map((cell, i) => (
        <GridCell
          key={i}
          cellState={cell}
          index={i}
          onClick={() => revealCellHandler(i)}
          disabled={phase !== 'playing'}
          isLatest={i === latestReveal}
        />
      ))}
      {!gameState && Array.from({ length: 25 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-xl"
          style={{
            background: 'linear-gradient(135deg, oklch(22% 0.02 260), oklch(18% 0.02 260))',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        />
      ))}
    </div>
  );

  const MultiplierBadge = () => {
    if (!gameState) return null;
    const nextMult = getNextMultiplier(gameState);
    return (
      <div className="flex gap-3 justify-center">
        <div className="text-center px-3 py-1 rounded-lg" style={{ background: 'oklch(16% 0.015 260)' }}>
          <div className="text-gray-500 text-xs">MULTIPLIER</div>
          <div className="font-black text-lg" style={{ color: '#f5c842' }}>{gameState.currentMultiplier}x</div>
        </div>
        {gameState.revealedCount > 0 && (
          <div className="text-center px-3 py-1 rounded-lg" style={{ background: 'oklch(16% 0.015 260)' }}>
            <div className="text-gray-500 text-xs">NEXT</div>
            <div className="font-black text-lg" style={{ color: '#22c55e' }}>{nextMult}x</div>
          </div>
        )}
        <div className="text-center px-3 py-1 rounded-lg" style={{ background: 'oklch(16% 0.015 260)' }}>
          <div className="text-gray-500 text-xs">REVEALED</div>
          <div className="font-black text-lg text-white">{gameState.revealedCount}</div>
        </div>
      </div>
    );
  };

  // ── Shared Header ─────────────────────────────────────────────────────────
  const Header = () => (
    <div
      className="shrink-0 flex items-center justify-between px-4 py-2"
      style={{ background: 'oklch(12% 0.015 260)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex items-center gap-3">
        <Link href="/games">
          <button className="text-gray-400 hover:text-white transition-colors flex items-center gap-1 text-sm">
            <ArrowLeft size={16} /> Games
          </button>
        </Link>
        <span className="text-white font-bold">💣 Mines</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ background: 'rgba(245,200,66,0.15)', color: '#f5c842', border: '1px solid rgba(245,200,66,0.3)' }}
        >
          RTP 97%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-gray-500 text-xs">BALANCE</div>
          <div className="text-white font-bold text-sm">{balance.toFixed(2)}</div>
        </div>
        <div className="text-right">
          <div className="text-gray-500 text-xs">ROUNDS</div>
          <div className="text-white font-bold text-sm">{stats.rounds}</div>
        </div>
        <button onClick={() => setMuted((m) => !m)} className="text-gray-400 hover:text-white transition-colors">
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>
    </div>
  );

  // ── PC Layout ─────────────────────────────────────────────────────────────
  const PCLayout = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <Header />
      {/* Grid + Controls side by side */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Grid */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
          <MultiplierBadge />
          <Grid5x5 />
        </div>
        {/* Right: Controls */}
        <div
          className="shrink-0 flex flex-col gap-3 p-4 overflow-y-auto"
          style={{ width: '200px', background: 'oklch(12% 0.015 260)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div>
            <div className="text-gray-500 text-xs mb-1">BET</div>
            <BetButtons />
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-1">MINE COUNT</div>
            <MineCountSelector />
          </div>
          <div className="mt-auto">
            {canPlay && <PlayBtn />}
            {!canPlay && gameState && gameState.revealedCount > 0 && <CashOutBtn />}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Mobile Layout ─────────────────────────────────────────────────────────
  const MobileLayout = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <Header />
      {/* Grid */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-2 overflow-hidden">
        <MultiplierBadge />
        <Grid5x5 />
      </div>
      {/* Controls */}
      <div
        className="shrink-0 px-3 pb-3 pt-2 flex flex-col gap-2"
        style={{ background: 'oklch(12% 0.015 260)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <BetButtons />
        <MineCountSelector />
        {canPlay && <PlayBtn />}
        {!canPlay && gameState && gameState.revealedCount > 0 && <CashOutBtn />}
      </div>
    </div>
  );

  // ── Root ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{ background: 'oklch(10% 0.015 260)', fontFamily: "'Rajdhani', sans-serif" }}
    >
      {loaderVisible && (
        <GameLoader
          progress={loaderProgress}
          label="Loading Mines..."
          onComplete={handleComplete}
          visible={loaderVisible}
        />
      )}

      <div className="w-full h-full" style={{ opacity: loaderVisible ? 0 : 1, transition: 'opacity 0.3s' }}>
        {isPC ? <PCLayout /> : <MobileLayout />}
      </div>
    </div>
  );
}
