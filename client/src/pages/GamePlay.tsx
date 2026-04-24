import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Volume2, VolumeX, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GemBlitzEngine } from "@/game/GemBlitzEngine";
import { GameLoader } from "@/components/GameLoader";

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

export default function GamePlay() {
  const { slug } = useParams<{ slug: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GemBlitzEngine | null>(null);
  const initDoneRef = useRef(false);

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [stats, setStats] = useState({ totalBet: 0, totalWin: 0, rounds: 0, rtp: 0 });
  const [muted, setMuted] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [gameReady, setGameReady] = useState(false);

  // Loading state
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [loaderProgress, setLoaderProgress] = useState(0);

  const urlParams = new URLSearchParams(window.location.search);
  const apiKey = urlParams.get("apiKey") || "demo";
  const playerId = urlParams.get("playerId") || "demo_player";

  const startSessionMut = trpc.game.startSession.useMutation();
  const playRoundMut = trpc.game.playRound.useMutation();
  const endSessionMut = trpc.game.endSession.useMutation();

  // ── Staged loader progress ───────────────────────────────────────────────────
  useEffect(() => {
    const t1 = setTimeout(() => setLoaderProgress(35), 200);
    const t2 = setTimeout(() => setLoaderProgress(65), 700);
    const t3 = setTimeout(() => setLoaderProgress(85), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // ── Init PixiJS once the canvas wrapper has a real size ──────────────────────
  useEffect(() => {
    if (!canvasWrapRef.current || !canvasRef.current) return;
    let cancelled = false;

    const tryInit = (w: number, h: number) => {
      if (initDoneRef.current || cancelled || w < 10 || h < 10) return;
      initDoneRef.current = true;

      const engine = new GemBlitzEngine(canvasRef.current!, w, h);
      engineRef.current = engine;

      engine.init(canvasRef.current!, w, h).then(() => {
        if (cancelled) { engine.destroy(); return; }
        engine.startIdleAnimation();
        setGameReady(true);
        setLoaderProgress(100);
        setTimeout(() => setLoaderVisible(false), 500);
      }).catch(() => {
        if (!cancelled) {
          setLoaderProgress(100);
          setTimeout(() => setLoaderVisible(false), 500);
        }
      });
    };

    // Use ResizeObserver so we wait until the wrapper actually has layout
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (!initDoneRef.current) {
        tryInit(Math.floor(width), Math.floor(height));
      } else if (engineRef.current) {
        engineRef.current.resize(Math.floor(width), Math.floor(height));
      }
    });
    ro.observe(canvasWrapRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      initDoneRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start game session ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameReady || !slug) return;
    startSessionMut.mutate(
      { apiKey, gameSlug: slug, playerId },
      {
        onSuccess: (data) => setSession(data as SessionInfo),
        onError: () => setSession({
          sessionToken: "demo_" + Date.now(),
          sessionId: 0, gameName: "Gem Blitz", targetRtp: 96,
          minBet: 1, maxBet: 500, config: {},
        }),
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameReady, slug]);

  // ── Play round ───────────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (isPlaying || !session) return;
    if (balance < bet) { toast.error("Insufficient balance!"); return; }
    setIsPlaying(true);
    setLastWin(0);
    setBalance((b) => b - bet);
    try {
      const result = await playRoundMut.mutateAsync({
        apiKey, sessionToken: session.sessionToken, betAmount: bet,
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

  useEffect(() => {
    return () => {
      if (session?.sessionToken && apiKey !== "demo") {
        endSessionMut.mutate({ apiKey, sessionToken: session.sessionToken });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isPlaying) { e.preventDefault(); handlePlay(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePlay, isPlaying]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="w-screen h-screen overflow-hidden"
      style={{
        display: "grid",
        gridTemplateRows: "44px 1fr",
        background: "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 60%), oklch(10% 0.01 260)",
      }}
    >
      {/* Global loader overlay */}
      {loaderVisible && (
        <GameLoader
          progress={loaderProgress}
          label="Loading Gem Blitz..."
          visible={loaderVisible}
          onComplete={() => setLoaderVisible(false)}
        />
      )}

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-3 shrink-0">
        <Link href="/games">
          <button className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Games</span>
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-base" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            {session?.gameName ?? "GEM BLITZ"}
          </span>
          {session && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "rgba(245,200,66,0.1)", color: "#f5c842", border: "1px solid rgba(245,200,66,0.2)" }}>
              RTP {session.targetRtp}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowInfo(!showInfo)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all">
            <Info className="w-4 h-4" />
          </button>
          <button onClick={() => setMuted(!muted)} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Main area: portrait vs landscape ── */}
      <div className="overflow-hidden" style={{ container: "main / size" }}>
        <PortraitOrLandscape
          canvasRef={canvasRef}
          canvasWrapRef={canvasWrapRef}
          balance={balance}
          bet={bet}
          setBet={setBet}
          isPlaying={isPlaying}
          gameReady={gameReady}
          session={session}
          lastWin={lastWin}
          stats={stats}
          showInfo={showInfo}
          setShowInfo={setShowInfo}
          handlePlay={handlePlay}
        />
      </div>
    </div>
  );
}

// ── Layout component that adapts to its container size ──────────────────────
function PortraitOrLandscape({
  canvasRef, canvasWrapRef, balance, bet, setBet,
  isPlaying, gameReady, session, lastWin, stats,
  showInfo, setShowInfo, handlePlay,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasWrapRef: React.RefObject<HTMLDivElement | null>;
  balance: number; bet: number; setBet: (v: number) => void;
  isPlaying: boolean; gameReady: boolean; session: SessionInfo | null;
  lastWin: number; stats: { totalBet: number; totalWin: number; rounds: number; rtp: number };
  showInfo: boolean; setShowInfo: (v: boolean) => void;
  handlePlay: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setLandscape(width > height);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const PlayBtn = () => (
    <button
      onClick={handlePlay}
      disabled={isPlaying || !gameReady || !session}
      className="w-full rounded-xl font-black tracking-wider transition-all active:scale-95 shrink-0"
      style={{
        padding: landscape ? "8px 0" : "12px 0",
        background: isPlaying ? "oklch(22% 0.02 260)" : "linear-gradient(135deg, #f5c842 0%, #c8960a 50%, #f5c842 100%)",
        backgroundSize: "200% 100%",
        color: isPlaying ? "#555" : "#000",
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: landscape ? "0.9rem" : "1.1rem",
        boxShadow: isPlaying ? "none" : "0 4px 20px rgba(245,200,66,0.3)",
      }}
    >
      {isPlaying ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-gray-600 border-t-transparent animate-spin" />
          SPINNING...
        </span>
      ) : `▶ PLAY (${bet})`}
    </button>
  );

  if (landscape) {
    // ── LANDSCAPE: left = square canvas, right = control panel ──────────────
    return (
      <div ref={wrapRef} className="w-full h-full flex gap-2 p-2 overflow-hidden">
        {/* Canvas: square, fills height */}
        <div
          ref={canvasWrapRef}
          className="relative rounded-2xl overflow-hidden shrink-0"
          style={{
            aspectRatio: "1 / 1",
            height: "100%",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 0 60px rgba(139,92,246,0.15)",
          }}
        >
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
          {lastWin > 0 && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="animate-bounce text-3xl font-black"
                style={{ fontFamily: "'Orbitron', sans-serif", color: "#f5c842", textShadow: "0 0 30px rgba(245,200,66,0.8)" }}>
                +{lastWin.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* Right panel: fills remaining width, full height, no overflow */}
        <div className="flex-1 flex flex-col gap-1.5 overflow-hidden min-w-0">
          {/* Balance + Rounds */}
          <div className="shrink-0 rounded-xl px-2 py-1.5 flex justify-between"
            style={{ background: "oklch(14% 0.015 260)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div>
              <div className="text-gray-500 text-xs">BALANCE</div>
              <div className="text-white font-bold text-sm">{balance.toFixed(2)}</div>
            </div>
            {lastWin > 0 && (
              <div className="animate-bounce text-center">
                <div className="text-gray-500 text-xs">WIN</div>
                <div className="font-bold text-sm" style={{ color: "#f5c842" }}>+{lastWin.toFixed(2)}</div>
              </div>
            )}
            <div className="text-right">
              <div className="text-gray-500 text-xs">ROUNDS</div>
              <div className="text-white font-bold text-sm">{stats.rounds}</div>
            </div>
          </div>

          {/* BET label */}
          <div className="shrink-0 text-gray-500 text-xs text-center">BET</div>

          {/* Bet buttons: flex-1, each button flex-1 so they share space equally */}
          <div className="flex-1 flex flex-col gap-1 min-h-0 overflow-hidden">
            {BET_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setBet(preset)}
                className="w-full flex-1 rounded-lg text-sm font-bold transition-all min-h-0"
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

          {/* Play button */}
          <PlayBtn />
        </div>
      </div>
    );
  }

  // ── PORTRAIT: top-down stack ─────────────────────────────────────────────
  return (
    <div ref={wrapRef} className="w-full h-full flex flex-col gap-2 p-2 overflow-hidden">
      {/* Balance row */}
      <div className="shrink-0 flex items-center justify-between rounded-xl px-3 py-2"
        style={{ background: "oklch(14% 0.015 260)", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div>
          <div className="text-gray-500 text-xs">BALANCE</div>
          <div className="text-white font-bold">{balance.toFixed(2)}</div>
        </div>
        {lastWin > 0 && (
          <div className="animate-bounce text-center">
            <div className="text-gray-500 text-xs">WIN</div>
            <div className="font-bold" style={{ color: "#f5c842" }}>+{lastWin.toFixed(2)}</div>
          </div>
        )}
        <div className="text-right">
          <div className="text-gray-500 text-xs">ROUNDS</div>
          <div className="text-white font-bold">{stats.rounds}</div>
        </div>
      </div>

      {/* Canvas: flex-1, square via aspect-ratio, centered */}
      <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden">
        <div
          ref={canvasWrapRef}
          className="relative rounded-2xl overflow-hidden"
          style={{
            aspectRatio: "1 / 1",
            /* Take the smaller of available width and height */
            width: "min(100%, 100cqh - 0px)",
            maxWidth: "100%",
            maxHeight: "100%",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 0 60px rgba(139,92,246,0.15)",
          }}
        >
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
          {lastWin > 0 && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="animate-bounce text-4xl font-black"
                style={{ fontFamily: "'Orbitron', sans-serif", color: "#f5c842", textShadow: "0 0 30px rgba(245,200,66,0.8)" }}>
                +{lastWin.toFixed(2)}
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
      </div>

      {/* Bet row */}
      <div className="shrink-0 flex items-center gap-1.5">
        <span className="text-gray-500 text-xs w-8 shrink-0">BET</span>
        <div className="flex gap-1 flex-1">
          {BET_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => setBet(preset)}
              className="flex-1 py-1.5 rounded-lg text-sm font-bold transition-all"
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

      {/* Play button */}
      <PlayBtn />
    </div>
  );
}
