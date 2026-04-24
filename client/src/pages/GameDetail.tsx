import { useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Maximize2, Monitor, Smartphone, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const DEVICE_CONFIGS: Record<DeviceMode, { label: string; icon: React.ReactNode; width: string; height: string; aspectRatio: string }> = {
  desktop: {
    label: "PC",
    icon: <Monitor className="w-5 h-5" />,
    width: "100%",
    height: "560px",
    aspectRatio: "16/9",
  },
  portrait: {
    label: "手机竖屏",
    icon: <Smartphone className="w-5 h-5" />,
    width: "360px",
    height: "640px",
    aspectRatio: "9/16",
  },
  landscape: {
    label: "手机横屏",
    icon: <RotateCcw className="w-5 h-5" />,
    width: "640px",
    height: "360px",
    aspectRatio: "16/9",
  },
};

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

export default function GameDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { data: game, isLoading } = trpc.game.get.useQuery({ slug: slug ?? "" }, { enabled: !!slug });

  const iframeUrl = `/play/${slug}?apiKey=demo&playerId=guest_preview`;
  const deviceConfig = DEVICE_CONFIGS[device];

  const handleFullscreen = () => {
    window.open(iframeUrl, "_blank");
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
        </div>
      </nav>

      {/* ── Section 1: Game Preview ── */}
      <section className="bg-[#0d0d14] py-8">
        <div className="container">
          {/* Device mode switcher */}
          <div className="flex items-center justify-center gap-3 mb-6">
            {(Object.keys(DEVICE_CONFIGS) as DeviceMode[]).map((mode) => {
              const cfg = DEVICE_CONFIGS[mode];
              return (
                <button
                  key={mode}
                  onClick={() => setDevice(mode)}
                  title={cfg.label}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                    device === mode
                      ? "border-[#f5c842] bg-[#f5c842]/10 text-[#f5c842]"
                      : "border-white/10 bg-white/5 text-gray-400 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {cfg.icon}
                  <span className="text-xs font-medium">{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* iframe container */}
          <div className="flex justify-center">
            <div
              className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black transition-all duration-300"
              style={{
                width: deviceConfig.width,
                maxWidth: "100%",
                height: deviceConfig.height,
              }}
            >
              {/* Top bar */}
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/80 to-transparent">
                <Link href="/games">
                  <button className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to Games
                  </button>
                </Link>
                <button
                  onClick={handleFullscreen}
                  className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Full screen
                </button>
              </div>

              <iframe
                src={iframeUrl}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen"
                title={game.name}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Game Info ── */}
      <section className="py-12">
        <div className="container max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8">
            {/* Left: thumbnail + play button + device icons */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-full max-w-[280px] aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 bg-[#111118]">
                {game.thumbnailUrl ? (
                  <img src={game.thumbnailUrl} alt={game.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-6xl">💎</div>
                )}
              </div>
              <Link href={`/play/${slug}?apiKey=demo&playerId=guest`} className="w-full max-w-[280px]">
                <Button
                  className="w-full py-3 text-base font-bold text-black rounded-xl"
                  style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}
                >
                  Play Now
                </Button>
              </Link>
              {/* Device icons row */}
              <div className="flex items-center gap-3 text-gray-500">
                <span title="Desktop"><Monitor className="w-6 h-6" /></span>
                <span title="Mobile Portrait"><Smartphone className="w-5 h-5" /></span>
                <span title="Mobile Landscape"><RotateCcw className="w-5 h-5" /></span>
              </div>
            </div>

            {/* Right: game details */}
            <div>
              <h1 className="text-4xl font-black text-white mb-4">{game.name}</h1>

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
              <div className="space-y-0 border border-white/8 rounded-xl overflow-hidden">
                {[
                  { label: "Type of game", value: game.category ? game.category.charAt(0).toUpperCase() + game.category.slice(1) : "—" },
                  { label: "Paylines", value: (game as any).paylines || "—" },
                  { label: "Publish Time", value: (game as any).publishTime || "—" },
                  { label: "RTP", value: `${game.baseRtp}%` },
                  { label: "Bet Range", value: `${game.minBet} – ${game.maxBet}` },
                ].map((row, i) => (
                  <div key={i} className={`flex items-start gap-4 px-5 py-4 ${i > 0 ? "border-t border-white/5" : ""} bg-[#111118]`}>
                    <span className="text-[#f5c842] font-semibold w-32 shrink-0 text-sm">{row.label}</span>
                    <span className="text-white text-sm">{row.value}</span>
                  </div>
                ))}

                {specialFeatures.length > 0 && (
                  <div className="flex items-start gap-4 px-5 py-4 border-t border-white/5 bg-[#111118]">
                    <span className="text-[#f5c842] font-semibold w-32 shrink-0 text-sm">Special Features</span>
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
                <div className="mt-6 rounded-xl border border-white/8 bg-[#111118] p-5">
                  <p className="text-center text-sm text-gray-400 mb-4 font-semibold uppercase tracking-wider">Supported Languages</p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {languages.map((lang: string) => {
                      const info = LANGUAGE_MAP[lang];
                      return (
                        <div key={lang} title={info?.name ?? lang} className="flex flex-col items-center gap-1">
                          <span className="text-2xl">{info?.flag ?? "🌐"}</span>
                          <span className="text-xs text-gray-500">{info?.name ?? lang}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Supported Currencies */}
              {currencies.length > 0 && (
                <div className="mt-4 rounded-xl border border-white/8 bg-[#111118] p-5">
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
          </div>
        </div>
      </section>
    </div>
  );
}
