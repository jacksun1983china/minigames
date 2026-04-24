import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Maximize2, Monitor, Smartphone, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GemBlitzEngine } from "@/game/GemBlitzEngine";
import { GameLoader, useGameLoader } from "@/components/GameLoader";

// Language code → flag emoji + name
const LANGUAGE_MAP: Record<string, { flag: string; name: string }> = {
  en: { flag: "🇬🇧", name: "English" },
  zh: { flag: "🇨🇳", name: "中文" },
  th: { flag: "🇹🇭", name: "ภาษาไทย" },
  id: { flag: "🇮🇩", name: "Indonesia" },
  vi: { flag: "🇻🇳", name: "Tiếng Việt" },
  ja: { flag: "🇯🇵", name: "日本語" },
  pt: { flag: "🇧🇷", name: "Português" },
  es: { flag: "🇪🇸", name: "Español" },
  ko: { flag: "🇰🇷", name: "한국어" },
  ms: { flag: "🇲🇾", name: "Melayu" },
  my: { flag: "🇲🇲", name: "မြန်မာ" },
  hi: { flag: "🇮🇳", name: "हिन्दी" },
  ar: { flag: "🇸🇦", name: "العربية" },
  ru: { flag: "🇷🇺", name: "Русский" },
  de: { flag: "🇩🇪", name: "Deutsch" },
  fr: { flag: "🇫🇷", name: "Français" },
};

// Currency code → symbol
const CURRENCY_MAP: Record<string, { symbol: string; name: string }> = {
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "€", name: "Euro" },
  THB: { symbol: "฿", name: "Thai Baht" },
  IDR: { symbol: "Rp", name: "Indonesian Rupiah" },
  VND: { symbol: "₫", name: "Vietnamese Dong" },
  JPY: { symbol: "¥", name: "Japanese Yen" },
  BRL: { symbol: "R$", name: "Brazilian Real" },
  KRW: { symbol: "₩", name: "Korean Won" },
  MYR: { symbol: "RM", name: "Malaysian Ringgit" },
  PHP: { symbol: "₱", name: "Philippine Peso" },
  CNY: { symbol: "¥", name: "Chinese Yuan" },
  SGD: { symbol: "S$", name: "Singapore Dollar" },
  HKD: { symbol: "HK$", name: "Hong Kong Dollar" },
  INR: { symbol: "₹", name: "Indian Rupee" },
  GBP: { symbol: "£", name: "British Pound" },
  AUD: { symbol: "A$", name: "Australian Dollar" },
  CAD: { symbol: "C$", name: "Canadian Dollar" },
  MMK: { symbol: "K", name: "Myanmar Kyat" },
};

type DeviceMode = "desktop" | "portrait" | "landscape";

function VolatilityDots({ level }: { level: string }) {
  const levels: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const filled = levels[level?.toLowerCase()] ?? 2;
  return (
    <div className="flex items-center gap-1">
      <span className="text-[#f5c842] font-bold uppercase text-sm mr-1">{level?.toUpperCase() ?? "MED"}</span>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`text-lg ${i <= filled ? "text-[#f5c842]" : "text-[#444]"}`}>🌶️</span>
      ))}
    </div>
  );
}

/**
 * Inline game preview — renders GemBlitzEngine directly in the page.
 * Adapts canvas size to the chosen device mode, filling the available width.
 */
function InlineGamePreview({ slug, mode }: { slug: string; mode: DeviceMode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GemBlitzEngine | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const { loaderVisible, loaderProgress, completeLoading, handleComplete } = useGameLoader();

  // Calculate canvas size based on mode and available container width
  const calcDims = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return null;
    const availW = el.clientWidth;
    if (availW === 0) return null;

    if (mode === "desktop") {
      // 16:9, fill available width, cap height at 70vh
      const maxH = Math.floor(window.innerHeight * 0.70);
      const wByH = Math.floor(maxH * 16 / 9);
      const w = Math.min(availW, wByH);
      const h = Math.floor(w * 9 / 16);
      return { w, h };
    } else if (mode === "portrait") {
      // 9:16 (phone portrait), cap width at 390px and height at 80vh
      const maxH = Math.floor(window.innerHeight * 0.80);
      const maxW = Math.min(availW, 390);
      const hByW = Math.floor(maxW * 16 / 9);
      const h = Math.min(hByW, maxH);
      const w = Math.floor(h * 9 / 16);
      return { w, h };
    } else {
      // landscape: 16:9, cap width at 720px and height at 65vh
      const maxH = Math.floor(window.innerHeight * 0.65);
      const maxW = Math.min(availW, 720);
      const hByW = Math.floor(maxW * 9 / 16);
      const h = Math.min(hByW, maxH);
      const w = Math.floor(h * 16 / 9);
      return { w, h };
    }
  }, [mode]);

  // Observe container resize
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setDims(calcDims());
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [calcDims]);

  // Init / reinit engine whenever dims change
  useEffect(() => {
    if (!dims || !canvasRef.current) return;
    // Destroy previous engine
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }
    const engine = new GemBlitzEngine(canvasRef.current, dims.w, dims.h);
    engineRef.current = engine;
    engine.init(canvasRef.current, dims.w, dims.h).then(() => {
      engine.startIdleAnimation();
      completeLoading();
    });
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims?.w, dims?.h]);

  return (
    <div ref={wrapRef} className="w-full flex justify-center">
      {dims && (
        <div
          className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black"
          style={{ width: dims.w, height: dims.h }}
        >
          <canvas ref={canvasRef} style={{ display: "block", width: dims.w, height: dims.h }} />
          <GameLoader
            progress={loaderProgress}
            label={`Loading ${slug}...`}
            visible={loaderVisible}
            onComplete={handleComplete}
          />
        </div>
      )}
    </div>
  );
}

export default function GameDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [device, setDevice] = useState<DeviceMode>("desktop");

  const { data: game, isLoading } = trpc.game.get.useQuery({ slug: slug ?? "" }, { enabled: !!slug });

  const handleFullscreen = () => {
    window.open(`/play/${slug}?apiKey=demo&playerId=guest_preview`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[#f5c842] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-2xl font-bold mb-4">Game not found</p>
          <Link href="/games"><Button variant="outline">Back to Games</Button></Link>
        </div>
      </div>
    );
  }

  const languages = (game.languages as string[]) ?? [];
  const currencies = (game.currencies as string[]) ?? [];
  const specialFeatures = (game.specialFeatures as string[]) ?? [];

  const DEVICE_BUTTONS: { mode: DeviceMode; label: string; icon: React.ReactNode }[] = [
    { mode: "desktop",   label: "PC",      icon: <Monitor className="w-5 h-5" /> },
    { mode: "portrait",  label: "手机竖屏", icon: <Smartphone className="w-5 h-5" /> },
    { mode: "landscape", label: "手机横屏", icon: <RotateCcw className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f]" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Nav */}
      <nav className="border-b border-white/5 h-14 flex items-center sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-sm">
        <div className="container flex items-center gap-4">
          <Link href="/games">
            <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" /> Back to Games
            </button>
          </Link>
          <div className="w-px h-4 bg-white/10" />
          <span className="text-white font-bold text-lg">{game.name}</span>
          {game.baseRtp && (
            <span className="text-xs bg-[#f5c842]/15 text-[#f5c842] border border-[#f5c842]/30 rounded px-2 py-0.5 font-bold">
              RTP {game.baseRtp}%
            </span>
          )}
          <div className="ml-auto">
            <button
              onClick={handleFullscreen}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
            >
              <Maximize2 className="w-4 h-4" /> Full screen
            </button>
          </div>
        </div>
      </nav>

      {/* ── Section 1: Game Preview ── */}
      <section className="bg-[#0d0d14] py-6">
        <div className="container">
          {/* Device mode switcher */}
          <div className="flex items-center justify-center gap-3 mb-5">
            {DEVICE_BUTTONS.map(({ mode, label, icon }) => (
              <button
                key={mode}
                onClick={() => setDevice(mode)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                  device === mode
                    ? "border-[#f5c842] bg-[#f5c842]/10 text-[#f5c842]"
                    : "border-white/10 bg-white/5 text-gray-400 hover:border-white/30 hover:text-white"
                }`}
              >
                {icon}
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>

          {/* Inline game preview — no iframe, no scrollbar */}
          <InlineGamePreview key={device} slug={slug ?? ""} mode={device} />
        </div>
      </section>

      {/* ── Section 2: Game Info ── */}
      <section className="py-12">
        <div className="container max-w-4xl">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-4xl font-black text-white">{game.name}</h1>
              {game.description && (
                <p className="text-gray-400 mt-2 text-sm max-w-xl">{game.description}</p>
              )}
            </div>
            <Link href={`/play/${slug}?apiKey=demo&playerId=guest`}>
              <Button
                className="px-8 py-3 text-base font-bold text-black rounded-xl"
                style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}
              >
                Play Now
              </Button>
            </Link>
          </div>

          {/* Max win + Volatility */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-xl border border-white/10 bg-[#111118] p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">MAX WIN</p>
              <p className="text-2xl font-black text-[#f5c842]">
                {(game as any).maxWin ? `${((game as any).maxWin as number).toLocaleString()}x` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#111118] p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">VOLATILITY</p>
              <VolatilityDots level={(game as any).volatility ?? "medium"} />
            </div>
          </div>

          {/* Details table */}
          <div className="border border-white/8 rounded-xl overflow-hidden mb-6">
            {[
              { label: "Type of game", value: game.category ? game.category.charAt(0).toUpperCase() + game.category.slice(1) : "—" },
              { label: "Paylines", value: (game as any).paylines || "—" },
              { label: "Publish Time", value: (game as any).publishTime || "—" },
              { label: "RTP", value: `${game.baseRtp}%` },
              { label: "Bet Range", value: `${game.minBet} – ${game.maxBet}` },
            ].map((row, i) => (
              <div key={i} className={`flex items-start gap-4 px-5 py-4 ${i > 0 ? "border-t border-white/5" : ""} bg-[#111118]`}>
                <span className="text-[#f5c842] font-semibold w-36 shrink-0 text-sm">{row.label}</span>
                <span className="text-white text-sm">{row.value}</span>
              </div>
            ))}

            {specialFeatures.length > 0 && (
              <div className="flex items-start gap-4 px-5 py-4 border-t border-white/5 bg-[#111118]">
                <span className="text-[#f5c842] font-semibold w-36 shrink-0 text-sm">Special Features</span>
                <ul className="text-white text-sm space-y-1">
                  {specialFeatures.map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#f5c842] mt-0.5">●</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Supported Languages */}
          {languages.length > 0 && (
            <div className="rounded-xl border border-white/8 bg-[#111118] p-5 mb-4">
              <p className="text-center text-sm text-gray-400 mb-4 font-semibold uppercase tracking-wider">Supported Languages</p>
              <div className="flex flex-wrap justify-center gap-4">
                {languages.map((lang: string) => {
                  const info = LANGUAGE_MAP[lang];
                  return (
                    <div key={lang} className="flex flex-col items-center gap-1">
                      <span className="text-2xl">{info?.flag ?? "🌐"}</span>
                      <span className="text-xs text-gray-400">{info?.name ?? lang}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Supported Currencies */}
          {currencies.length > 0 && (
            <div className="rounded-xl border border-white/8 bg-[#111118] p-5">
              <p className="text-center text-sm text-gray-400 mb-4 font-semibold uppercase tracking-wider">Supported Currencies</p>
              <div className="flex flex-wrap justify-center gap-2">
                {currencies.map((cur: string) => {
                  const info = CURRENCY_MAP[cur];
                  return (
                    <div
                      key={cur}
                      title={info?.name ?? cur}
                      className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5"
                    >
                      <span className="text-[#f5c842] font-bold text-sm">{info?.symbol ?? cur}</span>
                      <span className="text-gray-300 text-xs">{cur}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
