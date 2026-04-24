import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Volume2, VolumeX, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GemBlitzEngine } from "@/game/GemBlitzEngine";
import { GameLoader } from "@/components/GameLoader";
import { decryptPayload } from "@/lib/crypto-client";

const BET_PRESETS = [1, 5, 10, 25, 50, 100];

interface SessionInfo {
  sessionToken: string;
  sessionId: number;
  gameName: string;
  targetRtp: number;
  minBet: number;
  maxBet: number;
  config: Record<string, unknown>;
  sessionKey?: string; // AES-256-GCM key (hex) for decrypting game results
}

interface RoundResult {
  roundNumber: number;
  betAmount: number;
  winAmount: number;
  isWin: boolean;
  encryptedResult?: string;
  multiplier?: number;
  grid?: number[][];
  matches?: Array<{ row: number; col: number; gemType: number }[]>;
  cascades?: number;
  sessionStats: {
    totalBet: number;
    totalWin: number;
    appliedRtp: number;
    roundCount: number;
  };
}
interface DecryptedResult {
  grid: number[][];
  matches: Array<{ row: number; col: number; gemType: number }[]>;
  cascades: number;
  multiplier: number;
}

export default function GamePlay() {
  const { slug } = useParams<{ slug: string }>();

  // Canvas ref — this DOM node NEVER changes, engine lives on it permanently
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The single wrapper div that holds the canvas — also never recreated
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

  // Loader: starts at 0, must reach 100 before game is shown
  const [loaderProgress, setLoaderProgress] = useState(0);
  const [loaderDone, setLoaderDone] = useState(false); // true = loader fully gone

  // Viewport dimensions (read from document root — works in iframe)
  const [vp, setVp] = useState(() => ({
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  }));
  const isLandscape = vp.w > vp.h;

  const urlParams = new URLSearchParams(window.location.search);
  const apiKey = urlParams.get("apiKey") || "demo";
  const playerId = urlParams.get("playerId") || "demo_player";

  const startSessionMut = trpc.game.startSession.useMutation();
  const playRoundMut = trpc.game.playRound.useMutation();
  const endSessionMut = trpc.game.endSession.useMutation();

  // ── Viewport resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => setVp({
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight,
    });
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);
    window.addEventListener("orientationchange", update);
    return () => { ro.disconnect(); window.removeEventListener("orientationchange", update); };
  }, []);

  // ── Staged loader progress (simulates asset loading) ─────────────────────────
  // Progress goes 0→30→60→80 automatically; jumps to 100 when engine is ready
  useEffect(() => {
    const t1 = setTimeout(() => setLoaderProgress(30), 300);
    const t2 = setTimeout(() => setLoaderProgress(60), 800);
    const t3 = setTimeout(() => setLoaderProgress(80), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  // ── Init PixiJS once canvas wrapper has real layout ──────────────────────────
  useEffect(() => {
    if (!canvasWrapRef.current || !canvasRef.current) return;
    let cancelled = false;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width < 10 || height < 10) return;

      if (!initDoneRef.current) {
        // First time: initialize engine
        initDoneRef.current = true;
        const w = Math.floor(width);
        const h = Math.floor(height);
        const engine = new GemBlitzEngine(canvasRef.current!, w, h);
        engineRef.current = engine;

        engine.init(canvasRef.current!, w, h).then(() => {
          if (cancelled) { engine.destroy(); return; }
          engine.startIdleAnimation();
          setGameReady(true);
          // Jump to 100 — loader will fade out via onComplete
          setLoaderProgress(100);
        }).catch(() => {
          if (!cancelled) setLoaderProgress(100);
        });
      } else if (engineRef.current) {
        // Subsequent resizes: just resize the engine
        engineRef.current.resize(Math.floor(width), Math.floor(height));
      }
    });

    ro.observe(canvasWrapRef.current);
    return () => {
      cancelled = true;
      ro.disconnect();
      if (engineRef.current) { engineRef.current.destroy(); engineRef.current = null; }
      initDoneRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start session after game is ready ────────────────────────────────────────
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
      // Decrypt the game result if we have a session key
      let decrypted: DecryptedResult | null = null;
      if (result.encryptedResult && session.sessionKey) {
        try {
          decrypted = await decryptPayload(result.encryptedResult, session.sessionKey) as DecryptedResult;
        } catch { /* decryption failed, fall back to demo grid */ }
      }
      const grid = decrypted?.grid ?? result.grid ?? Array.from({ length: 8 }, () =>
        Array.from({ length: 8 }, () => Math.floor(Math.random() * 6))
      );
      const matches = decrypted?.matches ?? result.matches ?? [];
      const cascades = decrypted?.cascades ?? result.cascades ?? 0;
      const multiplier = decrypted?.multiplier ?? result.multiplier ?? 1;
      if (engineRef.current) {
        await new Promise<void>((resolve) => {
          engineRef.current!.applyRoundResult(
            grid, matches, cascades,
            result.isWin, multiplier, resolve
          );
        });
      }
      if (result.isWin) {
        setBalance((b) => b + result.winAmount);
        setLastWin(result.winAmount);
        toast.success(`🎉 WIN! +${result.winAmount.toFixed(2)} (${multiplier}x)`, {
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

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const PlayBtn = ({ compact = false }: { compact?: boolean }) => (
    <button
      onClick={handlePlay}
      disabled={isPlaying || !gameReady || !session}
      className="w-full rounded-xl font-black tracking-wider transition-all active:scale-95 shrink-0"
      style={{
        padding: compact ? "14px 0" : "14px 0",
        background: isPlaying ? "oklch(22% 0.02 260)" : "linear-gradient(135deg, #f5c842 0%, #c8960a 50%, #f5c842 100%)",
        backgroundSize: "200% 100%",
        color: isPlaying ? "#555" : "#000",
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: compact ? "1.1rem" : "1.1rem",
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

  // ── Layout sizes ─────────────────────────────────────────────────────────────
  // We use a single outer container with CSS grid.
  // The canvas wrapper div is ALWAYS rendered at the same DOM position — only its
  // grid area and size change based on orientation.
  const TOPBAR_H = 44;
  const PAD = 8; // px padding around content

  // Available area for the game content
  const contentW = vp.w - PAD * 2;
  const contentH = vp.h - TOPBAR_H - PAD * 2;

  let canvasSize: number;
  let rightPanelW: number = 0;

  if (isLandscape) {
    // Canvas is square, fills available height; right panel gets the rest
    canvasSize = contentH;
    rightPanelW = Math.max(contentW - canvasSize - PAD, 120);
    // If right panel is too narrow, shrink canvas
    if (rightPanelW < 120) {
      canvasSize = contentH - (120 - rightPanelW);
      rightPanelW = 120;
    }
  } else {
    // Canvas is square, fills available width; controls are below
    canvasSize = Math.min(contentW, contentH - 140); // leave ~140px for controls below
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="w-screen h-screen overflow-hidden flex flex-col"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 60%), oklch(10% 0.01 260)",
      }}
    >
      {/* Loader — blocks interaction until progress = 100 */}
      {!loaderDone && (
        <GameLoader
          progress={loaderProgress}
          label="Loading Gem Blitz..."
          visible={!loaderDone}
          onComplete={() => setLoaderDone(true)}
        />
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between px-3 shrink-0" style={{ height: TOPBAR_H }}>
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

      {/* Content area */}
      <div
        className="flex-1 overflow-hidden"
        style={{ padding: PAD }}
      >
        {isLandscape ? (
          // ── LANDSCAPE: side-by-side ──────────────────────────────────────────
          <div className="flex gap-2 h-full overflow-hidden">
            {/* Canvas wrapper — fixed square size */}
            <div
              ref={canvasWrapRef}
              className="relative rounded-2xl overflow-hidden shrink-0"
              style={{
                width: canvasSize,
                height: canvasSize,
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

            {/* Right control panel — fills remaining width, full height */}
            <div
              className="flex flex-col gap-1.5 overflow-hidden"
              style={{ width: rightPanelW, height: canvasSize }}
            >
              {/* Balance */}
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

              {/* Bet buttons — each gets equal share of remaining height */}
              <div className="flex-1 flex flex-col gap-1 min-h-0 overflow-hidden">
                {BET_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setBet(preset)}
                    className="w-full flex-1 rounded-lg text-sm font-bold transition-all min-h-0"
                    style={{
                      background: bet === preset ? "linear-gradient(135deg, #f5c842, #c8960a)" : "oklch(18% 0.015 260)",
                      color: bet === preset ? "#000" : "#888",
                      border: bet === preset ? "1px solid transparent" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Play button */}
              <PlayBtn compact />
            </div>
          </div>
        ) : (
          // ── PORTRAIT: top-down ───────────────────────────────────────────────
          <div className="flex flex-col gap-2 h-full overflow-hidden">
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

            {/* Canvas wrapper — fixed square, centered */}
            <div className="shrink-0 flex justify-center">
              <div
                ref={canvasWrapRef}
                className="relative rounded-2xl overflow-hidden"
                style={{
                  width: canvasSize,
                  height: canvasSize,
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
                      border: bet === preset ? "1px solid transparent" : "1px solid rgba(255,255,255,0.06)",
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
        )}
      </div>
    </div>
  );
}
