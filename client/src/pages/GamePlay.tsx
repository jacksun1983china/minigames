import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Volume2, VolumeX, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GemBlitzEngine } from "@/game/GemBlitzEngine";
import { GameLoader, useGameLoader } from "@/components/GameLoader";

const BET_PRESETS = [1, 5, 10, 25, 50, 100];

interface SessionInfo {
  sessionToken: string;
  sessionId: number;
  gameName: string;
  targetRtp: number;
  minBet: number;
  maxBet: number;
  config: Record<string, unknown>;
}

interface RoundResult {
  roundNumber: number;
  betAmount: number;
  winAmount: number;
  isWin: boolean;
  multiplier: number;
  grid: number[][];
  matches: Array<{ row: number; col: number; gemType: number }[]>;
  cascades: number;
  sessionStats: {
    totalBet: number;
    totalWin: number;
    appliedRtp: number;
    roundCount: number;
  };
}

// Use document dimensions — works correctly both standalone and inside an iframe
function getViewport() {
  return {
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  };
}

export default function GamePlay() {
  const { slug } = useParams<{ slug: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GemBlitzEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [stats, setStats] = useState({ totalBet: 0, totalWin: 0, rounds: 0, rtp: 0 });
  const [muted, setMuted] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [gameReady, setGameReady] = useState(false);

  // Calculate canvas size based on actual document viewport (works in iframe too)
  const calcGameSize = useCallback(() => {
    const { w: vw, h: vh } = getViewport();
    const isPortrait = vh > vw;
    if (isPortrait) {
      // Portrait: square canvas, fit width
      const size = Math.min(vw - 8, 480);
      return { w: size, h: size, isPortrait };
    } else {
      // Landscape: square canvas, fit height minus UI chrome (~120px for header+hud+controls)
      const size = Math.min(vh - 120, vw - 16, 520);
      return { w: size, h: size, isPortrait };
    }
  }, []);

  const [gameSize, setGameSize] = useState(calcGameSize);

  const { loaderVisible, loaderProgress, completeLoading, handleComplete } = useGameLoader();

  const urlParams = new URLSearchParams(window.location.search);
  const apiKey = urlParams.get("apiKey") || "demo";
  const playerId = urlParams.get("playerId") || "demo_player";

  const startSessionMut = trpc.game.startSession.useMutation();
  const playRoundMut = trpc.game.playRound.useMutation();
  const endSessionMut = trpc.game.endSession.useMutation();

  // Init PixiJS once
  useEffect(() => {
    if (!canvasRef.current) return;
    const { w, h } = calcGameSize();
    const engine = new GemBlitzEngine(canvasRef.current, w, h);
    engineRef.current = engine;
    engine.init(canvasRef.current, w, h).then(() => {
      engine.startIdleAnimation();
      setGameReady(true);
      completeLoading();
    });
    return () => { engine.destroy(); engineRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start session after game is ready
  useEffect(() => {
    if (!gameReady || !slug) return;
    startSessionMut.mutate(
      { apiKey, gameSlug: slug, playerId },
      {
        onSuccess: (data) => setSession(data as SessionInfo),
        onError: () => setSession({
          sessionToken: "demo_" + Date.now(),
          sessionId: 0,
          gameName: "Gem Blitz",
          targetRtp: 96,
          minBet: 1,
          maxBet: 500,
          config: {},
        }),
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameReady, slug]);

  // Resize handler — uses ResizeObserver on the page root so it works in iframe
  useEffect(() => {
    const el = pageRef.current ?? document.documentElement;
    const handleResize = () => {
      const next = calcGameSize();
      setGameSize(next);
      engineRef.current?.resize(next.w, next.h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(el);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [calcGameSize]);

  // Play round
  const handlePlay = useCallback(async () => {
    if (isPlaying || !session) return;
    if (balance < bet) { toast.error("Insufficient balance!"); return; }
    setIsPlaying(true);
    setLastWin(0);
    setBalance((b) => b - bet);
    try {
      const result = await playRoundMut.mutateAsync({
        apiKey,
        sessionToken: session.sessionToken,
        betAmount: bet,
      }) as RoundResult;

      if (engineRef.current) {
        await new Promise<void>((resolve) => {
          engineRef.current!.applyRoundResult(
            result.grid, result.matches, result.cascades,
            result.isWin, result.multiplier, resolve
          );
        });
      }
      if (result.isWin) {
        setBalance((b) => b + result.winAmount);
        setLastWin(result.winAmount);
        toast.success(`🎉 WIN! +${result.winAmount.toFixed(2)} (${result.multiplier}x)`, {
          style: { background: "#1a1a2e", border: "1px solid rgba(245,200,66,0.4)", color: "#f5c842" },
        });
      }
      setStats({
        totalBet: result.sessionStats.totalBet,
        totalWin: result.sessionStats.totalWin,
        rounds: result.sessionStats.roundCount,
        rtp: result.sessionStats.appliedRtp,
      });
    } catch {
      const demoGrid = Array.from({ length: 8 }, () =>
        Array.from({ length: 8 }, () => Math.floor(Math.random() * 6))
      );
      const isWin = Math.random() < 0.4;
      const winAmount = isWin ? bet * (1 + Math.random() * 4) : 0;
      if (engineRef.current) {
        await new Promise<void>((resolve) => {
          engineRef.current!.applyRoundResult(demoGrid, [], 0, isWin, winAmount / bet, resolve);
        });
      }
      if (isWin) {
        setBalance((b) => b + winAmount);
        setLastWin(winAmount);
        toast.success(`🎉 WIN! +${winAmount.toFixed(2)}`);
      }
    } finally {
      setIsPlaying(false);
    }
  }, [isPlaying, session, balance, bet, apiKey, playRoundMut]);

  // End session on unmount
  useEffect(() => {
    return () => {
      if (session?.sessionToken && apiKey !== "demo") {
        endSessionMut.mutate({ apiKey, sessionToken: session.sessionToken });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isPlaying) { e.preventDefault(); handlePlay(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePlay, isPlaying]);

  const { w: gameW, h: gameH, isPortrait } = gameSize;

  return (
    <div
      ref={pageRef}
      className="w-screen h-screen flex flex-col items-center overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 60%), oklch(10% 0.01 260)" }}
    >
      {/* Top Bar */}
      <div className="w-full flex items-center justify-between px-4 py-2 shrink-0" style={{ maxWidth: Math.max(gameW, 320) }}>
        <Link href="/games">
          <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Games</span>
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-base" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            {session?.gameName ?? "GEM BLITZ"}
          </span>
          {session && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(245,200,66,0.1)", color: "#f5c842", border: "1px solid rgba(245,200,66,0.2)" }}>
              RTP {session.targetRtp}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowInfo(!showInfo)} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all">
            <Info className="w-4 h-4" />
          </button>
          <button onClick={() => setMuted(!muted)} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Balance Bar */}
      <div className="w-full px-3 mb-2 shrink-0" style={{ maxWidth: Math.max(gameW, 320) }}>
        <div className="flex items-center justify-between rounded-xl px-4 py-2 border border-white/5"
          style={{ background: "oklch(14% 0.015 260)" }}>
          <div>
            <div className="text-gray-500 text-xs">BALANCE</div>
            <div className="text-white font-bold text-base">{balance.toFixed(2)}</div>
          </div>
          <div className="text-center">
            {lastWin > 0 && (
              <div className="animate-bounce">
                <div className="text-gray-500 text-xs">LAST WIN</div>
                <div className="font-bold text-base" style={{ color: "#f5c842" }}>+{lastWin.toFixed(2)}</div>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-gray-500 text-xs">ROUNDS</div>
            <div className="text-white font-bold text-base">{stats.rounds}</div>
          </div>
        </div>
      </div>

      {/* Game Canvas */}
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden border border-white/8 shrink-0"
        style={{ width: gameW, height: gameH, boxShadow: "0 0 60px rgba(139,92,246,0.15)" }}
      >
        <canvas ref={canvasRef} style={{ display: "block" }} />
        <GameLoader
          progress={loaderProgress}
          label="Loading Gem Blitz..."
          visible={loaderVisible}
          onComplete={handleComplete}
        />
        {lastWin > 0 && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="text-center animate-bounce">
              <div className="text-4xl font-black" style={{ fontFamily: "'Orbitron', sans-serif", color: "#f5c842", textShadow: "0 0 30px rgba(245,200,66,0.8)" }}>
                +{lastWin.toFixed(2)}
              </div>
            </div>
          </div>
        )}
        {showInfo && (
          <div className="absolute inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
            <div className="text-center max-w-xs">
              <h3 className="text-white font-bold text-xl mb-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>Gem Blitz</h3>
              <div className="space-y-2 text-sm text-gray-400 text-left mb-6">
                <p>• Match 3+ gems in a row or column to win</p>
                <p>• Cascading matches multiply your winnings</p>
                <p>• Higher bets = higher potential wins</p>
                <p>• RTP is controlled server-side per tenant</p>
                <p>• Press <kbd className="px-1 rounded bg-white/10 text-white">Space</kbd> to play quickly</p>
              </div>
              <Button onClick={() => setShowInfo(false)} className="text-black font-bold"
                style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}>
                Got it!
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="w-full px-3 mt-2 shrink-0" style={{ maxWidth: Math.max(gameW, 320) }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-gray-500 text-xs w-8">BET</span>
          <div className="flex gap-1.5 flex-1 flex-wrap">
            {BET_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setBet(preset)}
                className="flex-1 min-w-[36px] py-1.5 rounded-lg text-sm font-bold transition-all"
                style={{
                  background: bet === preset ? "linear-gradient(135deg, #f5c842, #c8960a)" : "oklch(18% 0.015 260)",
                  color: bet === preset ? "#000" : "#888",
                  border: bet === preset ? "none" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handlePlay}
          disabled={isPlaying || !gameReady || !session}
          className="w-full py-3 rounded-xl font-black text-lg tracking-wider transition-all active:scale-95"
          style={{
            background: isPlaying ? "oklch(22% 0.02 260)" : "linear-gradient(135deg, #f5c842 0%, #c8960a 50%, #f5c842 100%)",
            backgroundSize: "200% 100%",
            color: isPlaying ? "#555" : "#000",
            fontFamily: "'Rajdhani', sans-serif",
            boxShadow: isPlaying ? "none" : "0 4px 20px rgba(245,200,66,0.3)",
          }}
        >
          {isPlaying ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 rounded-full border-2 border-gray-600 border-t-transparent animate-spin" />
              SPINNING...
            </span>
          ) : (
            `▶  PLAY  (BET ${bet})`
          )}
        </button>
        {stats.rounds > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Total Bet", value: stats.totalBet.toFixed(0) },
              { label: "Total Win", value: stats.totalWin.toFixed(0) },
              { label: "Session RTP", value: `${stats.rtp.toFixed(1)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg py-2 px-2" style={{ background: "oklch(14% 0.015 260)" }}>
                <div className="text-gray-600 text-xs">{label}</div>
                <div className="text-white text-sm font-bold">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
