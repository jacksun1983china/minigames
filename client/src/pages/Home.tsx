import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Zap, Shield, BarChart3, Code2, Globe, Layers, ChevronRight } from "lucide-react";

// ── Architecture SVG Diagram ──────────────────────────────────────────────────
function ArchDiagram() {
  return (
    <svg viewBox="0 0 900 480" className="w-full max-w-4xl mx-auto" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      <defs>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5c842" stopOpacity="1" />
          <stop offset="100%" stopColor="#c8960a" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="1" />
          <stop offset="100%" stopColor="#6d28d9" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="1" />
          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="1" />
          <stop offset="100%" stopColor="#059669" stopOpacity="1" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#f5c842" opacity="0.7" />
        </marker>
      </defs>

      {/* Background */}
      <rect width="900" height="480" fill="#0d0d1a" rx="12" />
      <rect width="900" height="480" fill="url(#bgGrad)" rx="12" opacity="0.3" />

      {/* Title */}
      <text x="450" y="32" textAnchor="middle" fill="#f5c842" fontSize="16" fontWeight="700" letterSpacing="2">
        MINIGAME HUB — MULTI-TENANT ARCHITECTURE
      </text>

      {/* ── Layer 1: Tenants (left) ── */}
      <g transform="translate(20, 60)">
        <rect width="160" height="340" rx="10" fill="#1a1a2e" stroke="#f5c842" strokeWidth="1" strokeOpacity="0.4" />
        <text x="80" y="22" textAnchor="middle" fill="#f5c842" fontSize="11" fontWeight="700">TENANTS</text>
        {[
          { y: 45, label: "Tenant A", color: "#3b82f6" },
          { y: 105, label: "Tenant B", color: "#8b5cf6" },
          { y: 165, label: "Tenant C", color: "#10b981" },
          { y: 225, label: "Tenant D", color: "#f59e0b" },
        ].map(({ y, label, color }) => (
          <g key={label} transform={`translate(15, ${y})`}>
            <rect width="130" height="48" rx="8" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1" strokeOpacity="0.6" />
            <text x="65" y="18" textAnchor="middle" fill={color} fontSize="11" fontWeight="600">{label}</text>
            <text x="65" y="34" textAnchor="middle" fill="#888" fontSize="9">API Key + RTP Config</text>
          </g>
        ))}
        <rect x="15" y="285" width="130" height="40" rx="8" fill="#ffffff" fillOpacity="0.05" stroke="#555" strokeWidth="1" strokeDasharray="4,3" />
        <text x="80" y="309" textAnchor="middle" fill="#666" fontSize="10">+ More Tenants</text>
      </g>

      {/* ── Arrows: Tenants → API Gateway ── */}
      {[83, 143, 203, 263].map((y) => (
        <line key={y} x1="182" y1={y} x2="270" y2={y} stroke="#f5c842" strokeWidth="1.5" strokeOpacity="0.5" markerEnd="url(#arrow)" />
      ))}

      {/* ── Layer 2: API Gateway ── */}
      <g transform="translate(270, 80)">
        <rect width="160" height="280" rx="10" fill="#1a1a2e" stroke="#f5c842" strokeWidth="1.5" filter="url(#glow)" />
        <rect width="160" height="36" rx="10" fill="url(#goldGrad)" />
        <text x="80" y="23" textAnchor="middle" fill="#0d0d1a" fontSize="12" fontWeight="700">API GATEWAY</text>

        {[
          { y: 55, icon: "🔑", label: "API Key Auth" },
          { y: 95, icon: "🛡️", label: "Rate Limiting" },
          { y: 135, icon: "🌐", label: "CORS Validation" },
          { y: 175, icon: "📊", label: "Session Mgmt" },
          { y: 215, icon: "⚡", label: "tRPC Router" },
        ].map(({ y, icon, label }) => (
          <g key={label} transform={`translate(12, ${y})`}>
            <rect width="136" height="32" rx="6" fill="#ffffff" fillOpacity="0.05" stroke="#333" strokeWidth="1" />
            <text x="20" y="21" fill="#ccc" fontSize="12">{icon}</text>
            <text x="40" y="21" fill="#ccc" fontSize="10" fontWeight="500">{label}</text>
          </g>
        ))}
      </g>

      {/* ── Arrows: Gateway → Core ── */}
      <line x1="432" y1="180" x2="490" y2="180" stroke="#f5c842" strokeWidth="1.5" strokeOpacity="0.5" markerEnd="url(#arrow)" />

      {/* ── Layer 3: Core Engine ── */}
      <g transform="translate(490, 60)">
        <rect width="180" height="340" rx="10" fill="#1a1a2e" stroke="#8b5cf6" strokeWidth="1.5" />
        <text x="90" y="22" textAnchor="middle" fill="#a78bfa" fontSize="11" fontWeight="700">CORE ENGINE</text>

        {[
          { y: 40, label: "RTP Engine", sub: "APEX Algorithm", color: "#f5c842" },
          { y: 110, label: "Game Sessions", sub: "HTTP Single-thread", color: "#3b82f6" },
          { y: 180, label: "Round Logic", sub: "Server-side Control", color: "#10b981" },
          { y: 250, label: "Stats Engine", sub: "Real-time Analytics", color: "#f59e0b" },
        ].map(({ y, label, sub, color }) => (
          <g key={label} transform={`translate(12, ${y})`}>
            <rect width="156" height="58" rx="8" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1" strokeOpacity="0.5" />
            <text x="78" y="22" textAnchor="middle" fill={color} fontSize="11" fontWeight="700">{label}</text>
            <text x="78" y="40" textAnchor="middle" fill="#888" fontSize="9">{sub}</text>
          </g>
        ))}
      </g>

      {/* ── Arrows: Core → DB ── */}
      <line x1="672" y1="220" x2="730" y2="220" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.5" markerEnd="url(#arrow)" />

      {/* ── Layer 4: Database ── */}
      <g transform="translate(730, 80)">
        <rect width="150" height="280" rx="10" fill="#1a1a2e" stroke="#10b981" strokeWidth="1.5" />
        <text x="75" y="22" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="700">DATABASE</text>
        <text x="75" y="38" textAnchor="middle" fill="#666" fontSize="9">MySQL 5.7</text>

        {[
          { y: 55, label: "tenants" },
          { y: 95, label: "api_keys" },
          { y: 135, label: "games" },
          { y: 175, label: "rtp_configs" },
          { y: 215, label: "game_sessions" },
          { y: 245, label: "game_rounds" },
        ].map(({ y, label }) => (
          <g key={label} transform={`translate(12, ${y})`}>
            <rect width="126" height="28" rx="5" fill="#10b981" fillOpacity="0.1" stroke="#10b981" strokeWidth="1" strokeOpacity="0.3" />
            <text x="63" y="19" textAnchor="middle" fill="#6ee7b7" fontSize="9" fontFamily="monospace">{label}</text>
          </g>
        ))}
      </g>

      {/* ── Bottom: RTP Tiers ── */}
      <g transform="translate(20, 420)">
        <text x="0" y="14" fill="#f5c842" fontSize="10" fontWeight="700">RTP TIERS:</text>
        {[50, 70, 85, 92, 96, 100, 120].map((tier, i) => (
          <g key={tier} transform={`translate(${90 + i * 110}, 0)`}>
            <rect width="100" height="24" rx="5" fill="#f5c842" fillOpacity={0.05 + tier / 1200} stroke="#f5c842" strokeWidth="1" strokeOpacity="0.4" />
            <text x="50" y="16" textAnchor="middle" fill="#f5c842" fontSize="10" fontWeight="600">{tier}%</text>
          </g>
        ))}
      </g>

      {/* ── Legend ── */}
      <text x="450" y="465" textAnchor="middle" fill="#444" fontSize="9">
        Single-player: HTTP · Multi-player: Worker Threads · All RTP controlled server-side
      </text>
    </svg>
  );
}

// ── Feature Cards ─────────────────────────────────────────────────────────────
const features = [
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Multi-Tenant Isolation",
    desc: "Each tenant has fully isolated API keys, RTP configs, and game session data. Zero cross-tenant data leakage.",
    color: "text-yellow-400",
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: "APEX RTP Control",
    desc: "7 precision RTP tiers (50%–120%) with real-time adjustment. Server-side only — clients never see raw values.",
    color: "text-purple-400",
  },
  {
    icon: <Code2 className="w-6 h-6" />,
    title: "Universal API",
    desc: "Standard REST + tRPC API. Embed games via iframe or JS SDK into any website with a single API key.",
    color: "text-blue-400",
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "PixiJS Engine",
    desc: "WebGL-powered game rendering at 60fps. Particle effects, cascading animations, responsive to any screen.",
    color: "text-green-400",
  },
  {
    icon: <Globe className="w-6 h-6" />,
    title: "Anywhere Embeddable",
    desc: "Games run on minigame.npgslot.com. Tenants embed with 2 lines of code. CORS whitelisting per tenant.",
    color: "text-orange-400",
  },
  {
    icon: <Layers className="w-6 h-6" />,
    title: "Real-time Analytics",
    desc: "Per-tenant dashboards with session stats, daily trends, game-level RTP reporting and round history.",
    color: "text-pink-400",
  },
];

// ── RTP Tier Badge ────────────────────────────────────────────────────────────
const rtpTiers = [50, 70, 85, 92, 96, 100, 120];

export default function Home() {
  const { data: games } = trpc.game.list.useQuery();

  return (
    <div className="min-h-screen" style={{ background: "radial-gradient(ellipse at 20% 30%, rgba(139,92,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(245,200,66,0.06) 0%, transparent 50%), oklch(10% 0.01 260)" }}>

      {/* ── Nav ── */}
      <nav className="border-b border-white/5 sticky top-0 z-50 backdrop-blur-xl" style={{ background: "oklch(10% 0.01 260 / 0.85)" }}>
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src="/novaplay-logo.png" alt="NOVAPLAY" className="h-9 w-auto" style={{ filter: "drop-shadow(0 0 8px rgba(197,155,60,0.4))" }} />
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
            <Link href="/games" className="hover:text-white transition-colors">Games</Link>
            <Link href="/docs" className="hover:text-white transition-colors">API Docs</Link>
            <Link href="/admin" className="hover:text-white transition-colors">Dashboard</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/setup">
              <Button size="sm" variant="outline" className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10">
                Create Tenant
              </Button>
            </Link>
            <Link href="/games">
              <Button size="sm" style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)", color: "#000" }}>
                Play Now
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="container pt-20 pb-16 text-center">
        <Badge className="mb-6 text-xs px-3 py-1 border-yellow-500/30 text-yellow-400" style={{ background: "rgba(245,200,66,0.08)" }}>
          Multi-Tenant · RTP Controlled · API-First
        </Badge>
        <h1 className="text-5xl md:text-7xl font-black mb-6 leading-none tracking-tight" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
          <span className="text-white">The Game Engine</span>
          <br />
          <span style={{ background: "linear-gradient(135deg, #f5c842, #c8960a, #f5c842)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Built for Operators
          </span>
        </h1>
        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Deploy casino-grade minigames with full RTP control. Each tenant gets isolated data, custom RTP tiers, and a universal API to embed games anywhere.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link href="/games">
            <Button size="lg" className="gap-2 text-black font-bold" style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}>
              Browse Games <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/docs">
            <Button size="lg" variant="outline" className="gap-2 border-white/20 text-white hover:bg-white/5">
              API Documentation <Code2 className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* RTP Tiers */}
        <div className="flex flex-wrap gap-2 justify-center mt-10">
          <span className="text-gray-500 text-sm self-center mr-2">RTP Tiers:</span>
          {rtpTiers.map((tier) => (
            <span key={tier} className="px-3 py-1 rounded-full text-xs font-bold border"
              style={{
                background: tier >= 100 ? "rgba(245,200,66,0.15)" : "rgba(245,200,66,0.05)",
                borderColor: "rgba(245,200,66,0.3)",
                color: tier >= 100 ? "#f5c842" : "#a0855a"
              }}>
              {tier}%
            </span>
          ))}
        </div>
      </section>

      {/* ── Architecture Diagram ── */}
      <section className="container py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-white mb-3">System Architecture</h2>
          <p className="text-gray-500">Multi-tenant isolation with server-side RTP control at every layer</p>
        </div>
        <div className="rounded-2xl border border-white/10 overflow-hidden p-4" style={{ background: "oklch(12% 0.012 260)" }}>
          <ArchDiagram />
        </div>
      </section>

      {/* ── Features ── */}
      <section className="container py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">Platform Features</h2>
          <p className="text-gray-500">Everything an operator needs to run a premium gaming experience</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl p-6 border border-white/5 hover:border-white/10 transition-all group"
              style={{ background: "oklch(14% 0.015 260)" }}>
              <div className={`mb-4 ${f.color}`}>{f.icon}</div>
              <h3 className="text-white font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Games Preview ── */}
      {games && games.length > 0 && (
        <section className="container py-16">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">Available Games</h2>
              <p className="text-gray-500">Ready to embed in your platform</p>
            </div>
            <Link href="/games">
              <Button variant="outline" className="gap-2 border-white/20 text-white hover:bg-white/5">
                View All <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {games.slice(0, 3).map((game) => (
              <Link key={game.slug} href={`/game/${game.slug}`}>
                <div className="rounded-xl border border-white/10 overflow-hidden hover:border-yellow-500/30 transition-all group cursor-pointer"
                  style={{ background: "oklch(14% 0.015 260)" }}>
                  <div className="aspect-video flex items-center justify-center relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg, oklch(18% 0.03 280), oklch(14% 0.02 260))" }}>
                    <div className="text-6xl group-hover:scale-110 transition-transform">💎</div>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      style={{ background: "rgba(245,200,66,0.1)" }}>
                      <Button size="sm" style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)", color: "#000" }}>
                        Play Now
                      </Button>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white font-bold">{game.name}</h3>
                      <Badge className="text-xs" style={{ background: "rgba(245,200,66,0.1)", color: "#f5c842", border: "1px solid rgba(245,200,66,0.3)" }}>
                        {game.category}
                      </Badge>
                    </div>
                    <p className="text-gray-500 text-sm mb-3 line-clamp-2">{game.description}</p>
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>Base RTP: {game.baseRtp}%</span>
                      <span>Bet: {game.minBet}–{game.maxBet}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── CTA ── */}
      <section className="container py-20">
        <div className="rounded-2xl p-10 text-center border border-yellow-500/20 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, oklch(14% 0.02 260), oklch(16% 0.03 280))" }}>
          <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse at center, rgba(245,200,66,0.3) 0%, transparent 70%)" }} />
          <div className="relative">
            <h2 className="text-4xl font-black text-white mb-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
              Ready to Integrate?
            </h2>
            <p className="text-gray-400 mb-8 max-w-lg mx-auto">
              Create your tenant account, get your API key, and embed games in minutes.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/setup">
                <Button size="lg" className="font-bold text-black" style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}>
                  Get Started Free
                </Button>
              </Link>
              <Link href="/docs">
                <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/5">
                  Read the Docs
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-gray-500 text-sm">Minigame Hub © 2025 · minigame.npgslot.com</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-600">
            <Link href="/games" className="hover:text-gray-400 transition-colors">Games</Link>
            <Link href="/docs" className="hover:text-gray-400 transition-colors">API</Link>
            <Link href="/admin" className="hover:text-gray-400 transition-colors">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
