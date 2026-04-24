import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, Volume2, VolumeX, ChevronDown, ChevronUp } from "lucide-react";
import { GameLoader, useGameLoader } from "@/components/GameLoader";
import { decryptPayload } from "@/lib/crypto-client";
import {
  createDeck, shuffleDeck, dealHand, evaluateHand,
  PAY_TABLE, suitSymbol, suitColor, rankDisplay,
  type Card, type HandType, type HandResult,
} from "@/game/VideoPokerEngine";

const BET_PRESETS = [1, 5, 10, 25, 50, 100];
const HAND_ORDER: HandType[] = [
  'royal_flush', 'straight_flush', 'four_of_a_kind', 'full_house',
  'flush', 'straight', 'three_of_a_kind', 'two_pair', 'jacks_or_better', 'no_win',
];

type GamePhase = 'idle' | 'dealing' | 'holding' | 'drawing' | 'result';

interface SessionInfo {
  sessionToken: string;
  sessionId: number;
  sessionKey?: string;
}

// ── Card Component ──────────────────────────────────────────────────────────
function PlayingCard({
  card,
  held,
  flipping,
  faceDown,
  onClick,
  size,
}: {
  card: Card | null;
  held: boolean;
  flipping: boolean;
  faceDown: boolean;
  onClick?: () => void;
  size: 'sm' | 'md' | 'lg';
}) {
  const dims = { sm: 'w-14 h-20', md: 'w-20 h-28', lg: 'w-24 h-36' };
  const textSm = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };
  const textLg = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' };

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ perspective: '600px' }}
    >
      {/* HELD badge */}
      <div
        className="absolute -top-6 left-0 right-0 flex justify-center z-10"
        style={{ height: '20px' }}
      >
        {held && (
          <span
            className="px-2 py-0.5 rounded text-xs font-black tracking-widest"
            style={{
              background: 'linear-gradient(135deg, #f5c842, #c8960a)',
              color: '#000',
              fontSize: '10px',
            }}
          >
            HELD
          </span>
        )}
      </div>

      {/* Card body with flip animation */}
      <div
        className={`${dims[size]} rounded-xl cursor-pointer select-none transition-all duration-200`}
        style={{
          transformStyle: 'preserve-3d',
          transform: flipping ? 'rotateY(90deg)' : 'rotateY(0deg)',
          transition: 'transform 0.15s ease-in-out',
          boxShadow: held
            ? '0 0 0 2px #f5c842, 0 4px 16px rgba(245,200,66,0.4)'
            : '0 4px 12px rgba(0,0,0,0.5)',
        }}
        onClick={onClick}
      >
        {faceDown || !card ? (
          // Card back
          <div
            className={`w-full h-full rounded-xl flex items-center justify-center`}
            style={{
              background: 'linear-gradient(135deg, #1a3a6b 0%, #0d1f3c 50%, #1a3a6b 100%)',
              border: '2px solid rgba(255,255,255,0.1)',
            }}
          >
            <div
              className="w-3/4 h-3/4 rounded-lg"
              style={{
                background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 8px)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>
        ) : (
          // Card face
          <div
            className="w-full h-full rounded-xl flex flex-col p-1.5"
            style={{
              background: 'linear-gradient(145deg, #ffffff 0%, #f8f8f8 100%)',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
          >
            {/* Top-left rank+suit */}
            <div className="flex flex-col items-start leading-none" style={{ color: suitColor(card.suit) }}>
              <span className={`${textSm[size]} font-black leading-none`}>{rankDisplay(card.rank)}</span>
              <span className={`${textSm[size]} leading-none`}>{suitSymbol(card.suit)}</span>
            </div>
            {/* Center suit */}
            <div className="flex-1 flex items-center justify-center">
              <span className={`${textLg[size]}`} style={{ color: suitColor(card.suit) }}>
                {suitSymbol(card.suit)}
              </span>
            </div>
            {/* Bottom-right rank+suit (rotated) */}
            <div
              className="flex flex-col items-end leading-none"
              style={{ color: suitColor(card.suit), transform: 'rotate(180deg)' }}
            >
              <span className={`${textSm[size]} font-black leading-none`}>{rankDisplay(card.rank)}</span>
              <span className={`${textSm[size]} leading-none`}>{suitSymbol(card.suit)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pay Table Component ─────────────────────────────────────────────────────
function PayTableRow({
  handType,
  currentHand,
  compact,
}: {
  handType: HandType;
  currentHand: HandType | null;
  compact: boolean;
}) {
  const { multiplier, label } = PAY_TABLE[handType];
  const isActive = currentHand === handType;
  return (
    <div
      className="flex justify-between items-center px-2 py-0.5 rounded transition-all"
      style={{
        background: isActive ? 'linear-gradient(135deg, #f5c842, #c8960a)' : 'transparent',
        color: isActive ? '#000' : multiplier === 0 ? '#555' : '#ccc',
        fontSize: compact ? '11px' : '12px',
      }}
    >
      <span className="font-medium">{label}</span>
      <span className="font-black ml-2">{multiplier > 0 ? `${multiplier}x` : '-'}</span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function VideoPoker() {
  const urlParams = new URLSearchParams(window.location.search);
  const apiKey = urlParams.get('apiKey') || 'demo';
  const playerId = urlParams.get('playerId') || 'demo_player';

  // Game state
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [hand, setHand] = useState<Card[]>([]);
  const [heldIndices, setHeldIndices] = useState<number[]>([]);
  const [flippingIndices, setFlippingIndices] = useState<number[]>([]);
  const [faceDownIndices, setFaceDownIndices] = useState<number[]>([0, 1, 2, 3, 4]);
  const [handResult, setHandResult] = useState<HandResult | null>(null);
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  const [stats, setStats] = useState({ totalBet: 0, totalWin: 0, rounds: 0 });
  const [muted, setMuted] = useState(false);
  const [showPayTable, setShowPayTable] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const deckRef = useRef<Card[]>([]);

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
  const cardSize: 'sm' | 'md' | 'lg' = isPC ? 'lg' : isLandscape ? 'md' : 'md';

  // Loader
  const { loaderVisible, loaderProgress, completeLoading, handleComplete } = useGameLoader();
  const [gameReady, setGameReady] = useState(false);

  // Staged loader
  useEffect(() => {
    const t = setTimeout(() => {
      setGameReady(true);
      completeLoading();
    }, 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tRPC
  const startSessionMut = trpc.game.startSession.useMutation();
  const playRoundMut = trpc.game.playRound.useMutation();

  useEffect(() => {
    if (!gameReady) return;
    startSessionMut.mutate(
      { apiKey, gameSlug: 'video-poker', playerId },
      {
        onSuccess: (data) => setSession(data as SessionInfo),
        onError: () => setSession({ sessionToken: 'demo_' + Date.now(), sessionId: 0 }),
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameReady]);

  // ── Flip animation helper ─────────────────────────────────────────────────
  const flipCards = useCallback(async (indices: number[], newCards: Card[]) => {
    // Phase 1: flip to back
    setFlippingIndices(indices);
    await new Promise((r) => setTimeout(r, 150));
    setFaceDownIndices((prev) => Array.from(new Set([...prev, ...indices])));
    setFlippingIndices([]);
    await new Promise((r) => setTimeout(r, 50));

    // Phase 2: update card values while face down
    setHand((prev) => {
      const next = [...prev];
      indices.forEach((i, j) => { next[i] = newCards[j]; });
      return next;
    });

    // Phase 3: flip to front
    setFlippingIndices(indices);
    await new Promise((r) => setTimeout(r, 150));
    setFaceDownIndices((prev) => prev.filter((i) => !indices.includes(i)));
    setFlippingIndices([]);
  }, []);

  // ── DEAL ──────────────────────────────────────────────────────────────────
  const handleDeal = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'result') return;
    if (balance < bet) { toast.error('Insufficient balance!'); return; }

    setPhase('dealing');
    setHandResult(null);
    setHeldIndices([]);
    setBalance((b) => b - bet);

    // Build fresh deck and deal
    const deck = shuffleDeck(createDeck());
    const { hand: newHand, remaining } = dealHand(deck);
    deckRef.current = remaining;

    // Animate: flip all 5 cards from face-down to face-up one by one
    setHand(newHand);
    setFaceDownIndices([0, 1, 2, 3, 4]);
    await new Promise((r) => setTimeout(r, 100));

    // Reveal cards one by one with stagger
    for (let i = 0; i < 5; i++) {
      setFlippingIndices([i]);
      await new Promise((r) => setTimeout(r, 120));
      setFaceDownIndices((prev) => prev.filter((x) => x !== i));
      setFlippingIndices([]);
      await new Promise((r) => setTimeout(r, 80));
    }

    // Try to get server-validated deal
    if (session) {
      try {
        const result = await playRoundMut.mutateAsync({
          apiKey, sessionToken: session.sessionToken, betAmount: bet,
        }) as { encryptedResult?: string; sessionStats?: { totalBet: number; totalWin: number; roundCount: number } };
        if (result.encryptedResult && (session as SessionInfo & { sessionKey?: string }).sessionKey) {
          // Server can override the hand for RTP control
          try {
            const decrypted = await decryptPayload(
              result.encryptedResult,
              (session as SessionInfo & { sessionKey?: string }).sessionKey!
            ) as { hand?: Card[] };
            if (decrypted.hand) {
              setHand(decrypted.hand);
              deckRef.current = remaining; // keep remaining for draw
            }
          } catch { /* use client-side hand */ }
        }
        if (result.sessionStats) {
          setStats({
            totalBet: result.sessionStats.totalBet,
            totalWin: result.sessionStats.totalWin,
            rounds: result.sessionStats.roundCount,
          });
        }
      } catch { /* use client-side hand */ }
    }

    setPhase('holding');
  }, [phase, balance, bet, session, apiKey, playRoundMut]);

  // ── HOLD toggle ───────────────────────────────────────────────────────────
  const toggleHold = useCallback((index: number) => {
    if (phase !== 'holding') return;
    setHeldIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  }, [phase]);

  // ── DRAW ──────────────────────────────────────────────────────────────────
  const handleDraw = useCallback(async () => {
    if (phase !== 'holding') return;
    setPhase('drawing');

    const nonHeld = [0, 1, 2, 3, 4].filter((i) => !heldIndices.includes(i));
    const newCards = nonHeld.map((_, j) => deckRef.current[j]);

    // Flip non-held cards
    if (nonHeld.length > 0) {
      await flipCards(nonHeld, newCards);
    }

    // Evaluate final hand
    setHand((finalHand) => {
      const result = evaluateHand(finalHand);
      setHandResult(result);
      if (result.multiplier > 0) {
        const winAmount = bet * result.multiplier;
        setBalance((b) => b + winAmount);
        toast.success(`🎉 ${result.label}! +${winAmount.toFixed(2)}`, {
          style: { background: '#1a1a2e', border: '1px solid rgba(245,200,66,0.4)', color: '#f5c842' },
        });
      }
      return finalHand;
    });

    setPhase('result');
  }, [phase, heldIndices, bet, flipCards]);

  const isDealing = phase === 'dealing' || phase === 'drawing';

  // ── Render helpers ────────────────────────────────────────────────────────
  const dealBtnLabel = phase === 'idle' || phase === 'result' ? '▶ DEAL' : 'DRAW';
  const dealBtnAction = phase === 'holding' ? handleDraw : handleDeal;
  const dealBtnDisabled = isDealing || !gameReady;

  const DealBtn = ({ full = true }: { full?: boolean }) => (
    <button
      onClick={dealBtnAction}
      disabled={dealBtnDisabled}
      className={`${full ? 'w-full' : 'px-8'} rounded-xl font-black tracking-wider transition-all active:scale-95 shrink-0`}
      style={{
        padding: '14px 0',
        background: dealBtnDisabled
          ? 'oklch(22% 0.02 260)'
          : 'linear-gradient(135deg, #f5c842 0%, #c8960a 50%, #f5c842 100%)',
        color: dealBtnDisabled ? '#555' : '#000',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '1.1rem',
        boxShadow: dealBtnDisabled ? 'none' : '0 4px 20px rgba(245,200,66,0.3)',
      }}
    >
      {isDealing ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-gray-600 border-t-transparent animate-spin" />
          {phase === 'dealing' ? 'DEALING...' : 'DRAWING...'}
        </span>
      ) : dealBtnLabel}
    </button>
  );

  const BetButtons = ({ vertical = false }: { vertical?: boolean }) => (
    <div className={`flex ${vertical ? 'flex-col gap-1' : 'flex-row gap-1 flex-wrap justify-center'}`}>
      {!vertical && <span className="text-gray-500 text-xs self-center mr-1">BET</span>}
      {BET_PRESETS.map((preset) => (
        <button
          key={preset}
          onClick={() => setBet(preset)}
          disabled={isDealing}
          className={`${vertical ? 'flex-1 w-full' : 'flex-1 min-w-[36px]'} rounded-lg text-sm font-bold transition-all`}
          style={{
            padding: vertical ? '8px 0' : '6px 4px',
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

  const Cards5 = () => (
    <div className="flex gap-2 justify-center items-end mt-6">
      {[0, 1, 2, 3, 4].map((i) => (
        <PlayingCard
          key={i}
          card={hand[i] ?? null}
          held={heldIndices.includes(i)}
          flipping={flippingIndices.includes(i)}
          faceDown={faceDownIndices.includes(i) || hand.length === 0}
          onClick={() => toggleHold(i)}
          size={cardSize}
        />
      ))}
    </div>
  );

  const HandResultBadge = () =>
    handResult && handResult.multiplier > 0 ? (
      <div
        className="text-center py-2 px-4 rounded-xl font-black text-lg animate-bounce"
        style={{
          background: 'linear-gradient(135deg, #f5c842, #c8960a)',
          color: '#000',
          fontFamily: "'Rajdhani', sans-serif",
        }}
      >
        {PAY_TABLE[handResult.handType].label.toUpperCase()} — WIN +{(bet * handResult.multiplier).toFixed(2)}
      </div>
    ) : handResult && phase === 'result' ? (
      <div className="text-center py-2 px-4 rounded-xl text-gray-500 text-sm">
        No Win — Try Again
      </div>
    ) : null;

  // ── Shared header ─────────────────────────────────────────────────────────
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
        <span className="text-white font-bold">Video Poker</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ background: 'rgba(245,200,66,0.15)', color: '#f5c842', border: '1px solid rgba(245,200,66,0.3)' }}
        >
          RTP 99.54%
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
      {/* Pay table row */}
      <div
        className="shrink-0 px-4 py-2 overflow-x-auto"
        style={{ background: 'oklch(11% 0.015 260)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex gap-1 min-w-max">
          {HAND_ORDER.filter((h) => h !== 'no_win').map((ht) => (
            <div
              key={ht}
              className="flex flex-col items-center px-3 py-1 rounded-lg transition-all"
              style={{
                background: handResult?.handType === ht
                  ? 'linear-gradient(135deg, #f5c842, #c8960a)'
                  : 'oklch(16% 0.015 260)',
                color: handResult?.handType === ht ? '#000' : '#aaa',
                minWidth: '80px',
              }}
            >
              <span className="text-xs font-medium whitespace-nowrap">{PAY_TABLE[ht].label}</span>
              <span className="text-sm font-black">{PAY_TABLE[ht].multiplier}x</span>
            </div>
          ))}
        </div>
      </div>
      {/* Cards area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <Cards5 />
        <HandResultBadge />
      </div>
      {/* Controls */}
      <div
        className="shrink-0 px-4 py-3 flex items-center gap-3"
        style={{ background: 'oklch(12% 0.015 260)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className="text-gray-500 text-xs shrink-0">BET</span>
        {BET_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setBet(preset)}
            disabled={isDealing}
            className="flex-1 rounded-lg text-sm font-bold transition-all"
            style={{
              padding: '10px 0',
              background: bet === preset ? 'linear-gradient(135deg, #f5c842, #c8960a)' : 'oklch(18% 0.015 260)',
              color: bet === preset ? '#000' : '#888',
              border: bet === preset ? '1px solid transparent' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {preset}
          </button>
        ))}
        <div className="w-48 shrink-0">
          <DealBtn />
        </div>
      </div>
    </div>
  );

  // ── Portrait Layout ───────────────────────────────────────────────────────
  const PortraitLayout = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <Header />
      {/* Collapsible pay table */}
      <div className="shrink-0" style={{ background: 'oklch(11% 0.015 260)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          className="w-full flex items-center justify-between px-4 py-2 text-gray-400 hover:text-white transition-colors"
          onClick={() => setShowPayTable((v) => !v)}
        >
          <span className="text-xs font-bold">PAY TABLE</span>
          {showPayTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showPayTable && (
          <div className="px-3 pb-2">
            {HAND_ORDER.map((ht) => (
              <PayTableRow key={ht} handType={ht} currentHand={handResult?.handType ?? null} compact />
            ))}
          </div>
        )}
      </div>
      {/* Cards */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-2 overflow-hidden">
        <Cards5 />
        <HandResultBadge />
      </div>
      {/* Controls */}
      <div
        className="shrink-0 px-3 pb-3 pt-2 flex flex-col gap-2"
        style={{ background: 'oklch(12% 0.015 260)', borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <BetButtons />
        <DealBtn />
      </div>
    </div>
  );

  // ── Landscape Layout ──────────────────────────────────────────────────────
  const LandscapeLayout = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Left: cards */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-3 overflow-hidden">
          <Cards5 />
          <HandResultBadge />
        </div>
        {/* Right: pay table + controls */}
        <div
          className="shrink-0 flex flex-col overflow-hidden"
          style={{
            width: '180px',
            background: 'oklch(11% 0.015 260)',
            borderLeft: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Pay table */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {HAND_ORDER.map((ht) => (
              <PayTableRow key={ht} handType={ht} currentHand={handResult?.handType ?? null} compact />
            ))}
          </div>
          {/* BET + DEAL */}
          <div className="shrink-0 px-2 pb-2 flex flex-col gap-1">
            <BetButtons vertical />
            <DealBtn />
          </div>
        </div>
      </div>
    </div>
  );

  // ── Root ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{ background: 'oklch(10% 0.015 260)', fontFamily: "'Rajdhani', sans-serif" }}
    >
      {/* Loader overlay */}
      {loaderVisible && (
      <GameLoader
        progress={loaderProgress}
        label="Loading Video Poker..."
        onComplete={handleComplete}
        visible={loaderVisible}
      />
      )}

      {/* Game content */}
      <div className="w-full h-full" style={{ opacity: loaderVisible ? 0 : 1, transition: 'opacity 0.3s' }}>
        {isPC ? <PCLayout /> : isLandscape ? <LandscapeLayout /> : <PortraitLayout />}
      </div>
    </div>
  );
}
