/**
 * Crash.tsx — Crash game page
 *
 * Multiplier rises from 1.00x, crashes at a random point.
 * Cash out before crash to win multiplier × bet.
 * Uses Canvas for the rising curve animation.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { GameLoader, useGameLoader } from "@/components/GameLoader";
import {
  calculateMultiplierAtTime,
  generateCrashPoint,
  calculateWinAmount,
  getTimeForMultiplier,
  formatMultiplier,
} from "@/game/CrashEngine";

const BET_PRESETS = [1, 5, 10, 25, 50, 100];

type GamePhase = 'idle' | 'countdown' | 'running' | 'crashed' | 'cashed_out';

interface SessionInfo {
  sessionToken: string;
  sessionId: number;
  sessionKey?: string;
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function Crash() {
  const urlParams = new URLSearchParams(window.location.search);
  const apiKey = urlParams.get('apiKey') || 'demo';
  const playerId = urlParams.get('playerId') || 'demo_player';

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Game state
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const [crashPoint, setCrashPoint] = useState(0);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [stats, setStats] = useState({ totalBet: 0, totalWin: 0, rounds: 0 });
  const [muted, setMuted] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [countdownValue, setCountdownValue] = useState(3);
  const [gameHistory, setGameHistory] = useState<number[]>([]);

  // Animation refs
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const crashPointRef = useRef<number>(0);

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
      { apiKey, gameSlug: 'crash', playerId },
      {
        onSuccess: (data) => setSession(data as SessionInfo),
        onError: () => setSession({ sessionToken: 'demo_' + Date.now(), sessionId: 0 }),
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameReady]);

  // ── Canvas Drawing ────────────────────────────────────────────────────────
  const drawCurve = useCallback(
    (progress: number, crashed: boolean, cashedOut: boolean, cashOutMult: number = 0) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#1a1a2e');
      bgGrad.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 10; i++) {
        const y = h - (i / 10) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw curve
      const maxMult = Math.max(progress, 2);
      const padding = 40;
      const chartW = w - padding * 2;
      const chartH = h - padding * 2;

      ctx.beginPath();
      ctx.strokeStyle = crashed ? '#ef4444' : cashedOut ? '#22c55e' : '#f5c842';
      ctx.lineWidth = 3;

      const steps = 100;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const elapsedMs = t * (progress > 0 ? getTimeForMultiplier(progress) : 1000);
        const mult = calculateMultiplierAtTime(elapsedMs);
        const x = padding + t * chartW;
        const y = h - padding - ((Math.min(mult, maxMult) - 1) / (maxMult - 1)) * chartH;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Glow effect under curve
      ctx.lineTo(padding + chartW, h - padding);
      ctx.lineTo(padding, h - padding);
      ctx.closePath();
      const glowGrad = ctx.createLinearGradient(0, padding, 0, h - padding);
      if (crashed) {
        glowGrad.addColorStop(0, 'rgba(239,68,68,0.15)');
        glowGrad.addColorStop(1, 'rgba(239,68,68,0)');
      } else {
        glowGrad.addColorStop(0, 'rgba(245,200,66,0.15)');
        glowGrad.addColorStop(1, 'rgba(245,200,66,0)');
      }
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Dot at current position
      if (progress > 1) {
        const dotX = padding + chartW;
        const dotY = h - padding - ((Math.min(progress, maxMult) - 1) / (maxMult - 1)) * chartH;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
        ctx.fillStyle = crashed ? '#ef4444' : cashedOut ? '#22c55e' : '#f5c842';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(dotX, dotY, 12, 0, Math.PI * 2);
        ctx.fillStyle = crashed ? 'rgba(239,68,68,0.3)' : 'rgba(245,200,66,0.3)';
        ctx.fill();
      }

      // Cash out line
      if (cashedOut && cashOutMult > 0) {
        const cashY = h - padding - ((cashOutMult - 1) / (maxMult - 1)) * chartH;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(34,197,94,0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(padding, cashY);
        ctx.lineTo(padding + chartW, cashY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    []
  );

  // ── Start Game ────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    if (balance < bet) { toast.error('Insufficient balance!'); return; }

    setBalance((b) => b - bet);
    setPhase('countdown');
    setCountdownValue(3);

    // Server round for RTP tracking
    if (session) {
      playRoundMut.mutateAsync({
        apiKey, sessionToken: session.sessionToken, betAmount: bet,
        _clientIp: 'demo',
      }).catch(() => { /* demo fallback */ });
    }

    // Countdown
    let count = 3;
    const countInterval = setInterval(() => {
      count--;
      setCountdownValue(count);
      if (count <= 0) {
        clearInterval(countInterval);
        // Generate crash point
        const cp = generateCrashPoint();
        setCrashPoint(cp);
        crashPointRef.current = cp;
        setPhase('running');
        startTimeRef.current = performance.now();

        // Animation loop
        const animate = (time: number) => {
          const elapsed = time - startTimeRef.current;
          const mult = calculateMultiplierAtTime(elapsed);

          if (mult >= crashPointRef.current) {
            // CRASH!
            setCurrentMultiplier(crashPointRef.current);
            drawCurve(crashPointRef.current, true, false);
            setPhase('crashed');
            setGameHistory((prev) => [crashPointRef.current, ...prev].slice(0, 10));
            toast.error(`💥 CRASHED at ${formatMultiplier(crashPointRef.current)}! Lost ${bet.toFixed(2)}`, {
              style: { background: '#1a1a2e', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' },
            });
            return;
          }

          setCurrentMultiplier(mult);
          drawCurve(mult, false, false);
          animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);
      }
    }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance, bet, session, apiKey, playRoundMut, drawCurve]);

  // ── Cash Out ──────────────────────────────────────────────────────────────
  const handleCashOut = useCallback(() => {
    if (phase !== 'running') return;

    cancelAnimationFrame(animFrameRef.current);

    const winAmount = calculateWinAmount(bet, currentMultiplier);
    setBalance((b) => b + winAmount);
    setPhase('cashed_out');
    setGameHistory((prev) => [crashPointRef.current, ...prev].slice(0, 10));
    drawCurve(currentMultiplier, false, true, currentMultiplier);

    toast.success(`💰 Cashed out at ${formatMultiplier(currentMultiplier)}! +${winAmount.toFixed(2)}`, {
      style: { background: '#1a1a2e', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' },
    });
  }, [phase, bet, currentMultiplier, drawCurve]);

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  // ── Resize canvas ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      canvas.width = rect.width;
      canvas.height = rect.height;
      if (phase !== 'idle') {
        drawCurve(
          currentMultiplier,
          phase === 'crashed',
          phase === 'cashed_out',
          phase === 'cashed_out' ? currentMultiplier : 0
        );
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [phase, currentMultiplier, drawCurve]);

  // ── Render Helpers ────────────────────────────────────────────────────────
  const canPlay = phase === 'idle' || phase === 'crashed' || phase === 'cashed_out';

  const PlayBtn = () => (
    <button
      onClick={startGame}
      disabled={!gameReady || !canPlay}
      className="w-full rounded-xl font-black tracking-wider transition-all active:scale-95 shrink-0"
      style={{
        padding: '14px 0',
        background: !canPlay || !gameReady
          ? 'oklch(22% 0.02 260)'
          : 'linear-gradient(135deg, #f5c842 0%, #c8960a 50%, #f5c842 100%)',
        color: !canPlay || !gameReady ? '#555' : '#000',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '1.1rem',
        boxShadow: !canPlay || !gameReady ? 'none' : '0 4px 20px rgba(245,200,66,0.3)',
      }}
    >
      {!canPlay ? 'GAME IN PROGRESS...' : '▶ START GAME'}
    </button>
  );

  const CashOutBtn = () => (
    <button
      onClick={handleCashOut}
      disabled={phase !== 'running'}
      className="w-full rounded-xl font-black tracking-wider transition-all active:scale-95 shrink-0"
      style={{
        padding: '14px 0',
        background: phase !== 'running'
          ? 'oklch(22% 0.02 260)'
          : 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #22c55e 100%)',
        color: phase !== 'running' ? '#555' : '#000',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '1.1rem',
        boxShadow: phase !== 'running' ? 'none' : '0 4px 20px rgba(34,197,94,0.3)',
      }}
    >
      💰 CASH OUT ({formatMultiplier(currentMultiplier)})
    </button>
  );

  const BetButtons = () => (
    <div className="flex gap-1 flex-wrap justify-center">
      <span className="text-gray-500 text-xs self-center mr-1">BET</span>
      {BET_PRESETS.map((preset) => (
        <button
          key={preset}
          onClick={() => setBet(preset)}
          disabled={!canPlay}
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
        <span className="text-white font-bold">🚀 Crash</span>
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

  // ── Game History Bar ──────────────────────────────────────────────────────
  const HistoryBar = () =>
    gameHistory.length > 0 ? (
      <div className="shrink-0 flex gap-1 px-4 py-1.5 overflow-x-auto" style={{ background: 'oklch(11% 0.015 260)' }}>
        {gameHistory.map((cp, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded text-xs font-bold shrink-0"
            style={{
              background: cp >= 2 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: cp >= 2 ? '#22c55e' : '#ef4444',
              border: `1px solid ${cp >= 2 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}
          >
            {formatMultiplier(cp)}
          </span>
        ))}
      </div>
    ) : null;

  // ── Multiplier Display ────────────────────────────────────────────────────
  const MultiplierDisplay = () => {
    let color = '#f5c842';
    let text = formatMultiplier(currentMultiplier);

    if (phase === 'countdown') {
      color = '#888';
      text = countdownValue > 0 ? `${countdownValue}` : 'GO!';
    } else if (phase === 'crashed') {
      color = '#ef4444';
      text = `💥 ${formatMultiplier(crashPoint)}`;
    } else if (phase === 'cashed_out') {
      color = '#22c55e';
      text = `✅ ${formatMultiplier(currentMultiplier)}`;
    }

    return (
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ zIndex: 10 }}
      >
        <div
          className="font-black"
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: isPC ? '4rem' : isLandscape ? '3rem' : '2.5rem',
            color,
            textShadow: `0 0 30px ${color}80`,
          }}
        >
          {text}
        </div>
      </div>
    );
  };

  // ── PC Layout ─────────────────────────────────────────────────────────────
  const PCLayout = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <Header />
      <HistoryBar />
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 relative" style={{ background: 'oklch(10% 0.015 260)' }}>
          <canvas ref={canvasRef} className="w-full h-full" />
          <MultiplierDisplay />
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
          <div className="mt-auto">
            {canPlay && <PlayBtn />}
            {phase === 'running' && <CashOutBtn />}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Mobile Layout ─────────────────────────────────────────────────────────
  const MobileLayout = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <Header />
      <HistoryBar />
      {/* Canvas */}
      <div className="shrink-0 relative" style={{ height: isLandscape ? '50%' : '45%', background: 'oklch(10% 0.015 260)' }}>
        <canvas ref={canvasRef} className="w-full h-full" />
        <MultiplierDisplay />
      </div>
      {/* Controls */}
      <div
        className="flex-1 px-3 pb-3 pt-2 flex flex-col gap-2 overflow-y-auto"
        style={{ background: 'oklch(12% 0.015 260)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <BetButtons />
        {canPlay && <PlayBtn />}
        {phase === 'running' && <CashOutBtn />}
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
          label="Loading Crash..."
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
