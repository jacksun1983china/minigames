import { Link } from "wouter";
import { ArrowLeft, Code2, Key, Gamepad2, BarChart3, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const CodeBlock = ({ code, lang = "bash" }: { code: string; lang?: string }) => (
  <pre className="rounded-xl p-4 text-sm overflow-x-auto" style={{ background: "oklch(8% 0.01 260)", border: "1px solid rgba(255,255,255,0.06)" }}>
    <code className="text-green-300 font-mono">{code}</code>
  </pre>
);

const Section = ({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <section id={id} className="mb-16">
    <div className="flex items-center gap-3 mb-6">
      <div className="text-yellow-400">{icon}</div>
      <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Rajdhani', sans-serif" }}>{title}</h2>
    </div>
    {children}
  </section>
);

export default function ApiDocs() {
  return (
    <div className="min-h-screen" style={{ background: "oklch(10% 0.01 260)" }}>
      <nav className="border-b border-white/5 h-16 flex items-center sticky top-0 z-50 backdrop-blur-xl" style={{ background: "oklch(10% 0.01 260 / 0.9)" }}>
        <div className="container flex items-center gap-4">
          <Link href="/">
            <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" /> Home
            </button>
          </Link>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-yellow-400" />
            <span className="font-bold text-white" style={{ fontFamily: "'Rajdhani', sans-serif" }}>API Documentation</span>
          </div>
        </div>
      </nav>

      <div className="container py-12 max-w-4xl">
        <div className="mb-12">
          <Badge className="mb-4 text-xs" style={{ background: "rgba(245,200,66,0.1)", color: "#f5c842", border: "1px solid rgba(245,200,66,0.3)" }}>
            v1.0 · REST + tRPC
          </Badge>
          <h1 className="text-5xl font-black text-white mb-4" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Minigame Hub API
          </h1>
          <p className="text-gray-400 text-lg">
            Integrate casino-grade minigames into any platform. All endpoints require an API key for tenant authentication.
          </p>
          <div className="mt-4 p-4 rounded-xl border border-yellow-500/20" style={{ background: "rgba(245,200,66,0.05)" }}>
            <p className="text-yellow-400 text-sm font-mono">Base URL: <span className="text-white">https://minigame.npgslot.com/api/trpc</span></p>
          </div>
        </div>

        <Section id="auth" icon={<Key className="w-6 h-6" />} title="Authentication">
          <p className="text-gray-400 mb-4">All game API calls require an API key in the request body. Create keys from your tenant dashboard.</p>
          <div className="space-y-3">
            <p className="text-gray-300 text-sm font-medium">API Key format:</p>
            <CodeBlock code={`mgk_<48-character-hex-string>\n\nExample: mgk_a1b2c3d4e5f6...`} />
            <p className="text-gray-500 text-sm">⚠️ API keys are shown only once at creation. Store them securely.</p>
          </div>
        </Section>

        <Section id="games" icon={<Gamepad2 className="w-6 h-6" />} title="Game Endpoints">
          <div className="space-y-8">
            {/* List Games */}
            <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "oklch(13% 0.012 260)" }}>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
                <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">GET</Badge>
                <code className="text-white text-sm font-mono">game.list</code>
                <span className="text-gray-600 text-xs ml-auto">Public</span>
              </div>
              <div className="p-5">
                <p className="text-gray-400 text-sm mb-4">Returns all published games with metadata.</p>
                <CodeBlock lang="js" code={`// tRPC client
const games = await trpc.game.list.query();

// REST equivalent
GET /api/trpc/game.list`} />
              </div>
            </div>

            {/* Start Session */}
            <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "oklch(13% 0.012 260)" }}>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
                <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">POST</Badge>
                <code className="text-white text-sm font-mono">game.startSession</code>
                <span className="text-gray-600 text-xs ml-auto">Requires API Key</span>
              </div>
              <div className="p-5">
                <p className="text-gray-400 text-sm mb-4">Start a new game session for a player. Returns session token and game config.</p>
                <CodeBlock lang="js" code={`const session = await trpc.game.startSession.mutate({
  apiKey: "mgk_your_api_key",
  gameSlug: "gem-blitz",
  playerId: "player_123",        // Your platform's player ID
  metadata: { currency: "USD" }  // Optional
});

// Response:
{
  sessionToken: "sess_abc123...",
  sessionId: 42,
  gameName: "Gem Blitz",
  targetRtp: 96,          // Configured RTP for your tenant
  minBet: 1,
  maxBet: 500,
  config: { gridSize: 8, gemTypes: 6 }
}`} />
              </div>
            </div>

            {/* Play Round */}
            <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "oklch(13% 0.012 260)" }}>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
                <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">POST</Badge>
                <code className="text-white text-sm font-mono">game.playRound</code>
                <span className="text-gray-600 text-xs ml-auto">Requires API Key</span>
              </div>
              <div className="p-5">
                <p className="text-gray-400 text-sm mb-4">Play one round. Server generates result with RTP control applied.</p>
                <CodeBlock lang="js" code={`const result = await trpc.game.playRound.mutate({
  apiKey: "mgk_your_api_key",
  sessionToken: "sess_abc123...",
  betAmount: 10
});

// Response:
{
  roundNumber: 1,
  betAmount: 10,
  winAmount: 25,        // 0 if no win
  isWin: true,
  multiplier: 2.5,
  grid: [[...], ...],   // 8x8 gem grid
  matches: [...],       // Matched positions
  cascades: 1,
  sessionStats: {
    totalBet: 10,
    totalWin: 25,
    appliedRtp: 98.2,
    roundCount: 1
  }
}`} />
              </div>
            </div>

            {/* End Session */}
            <div className="rounded-xl border border-white/8 overflow-hidden" style={{ background: "oklch(13% 0.012 260)" }}>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
                <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30">POST</Badge>
                <code className="text-white text-sm font-mono">game.endSession</code>
                <span className="text-gray-600 text-xs ml-auto">Requires API Key</span>
              </div>
              <div className="p-5">
                <p className="text-gray-400 text-sm mb-4">End a session and get final stats.</p>
                <CodeBlock lang="js" code={`const summary = await trpc.game.endSession.mutate({
  apiKey: "mgk_your_api_key",
  sessionToken: "sess_abc123..."
});

// Response:
{
  sessionToken: "sess_abc123...",
  totalBet: 100,
  totalWin: 96.5,
  appliedRtp: 96.5,
  roundCount: 10
}`} />
              </div>
            </div>
          </div>
        </Section>

        <Section id="rtp" icon={<Zap className="w-6 h-6" />} title="RTP Configuration">
          <p className="text-gray-400 mb-6">RTP is configured per-tenant and optionally per-game. All control is server-side.</p>
          <div className="grid grid-cols-7 gap-2 mb-6">
            {[50, 70, 85, 92, 96, 100, 120].map((tier) => (
              <div key={tier} className="text-center p-3 rounded-xl border border-yellow-500/20"
                style={{ background: "rgba(245,200,66,0.05)" }}>
                <div className="text-yellow-400 font-bold text-lg">{tier}%</div>
                <div className="text-gray-600 text-xs mt-1">
                  {tier < 70 ? "High House" : tier < 92 ? "Standard" : tier < 100 ? "Player Friendly" : tier === 100 ? "Break Even" : "Bonus Mode"}
                </div>
              </div>
            ))}
          </div>
          <CodeBlock lang="js" code={`// Set global RTP for your tenant (all games)
await trpc.tenant.setRtp.mutate({
  tenantId: 1,
  rtpPercent: 96  // One of: 50, 70, 85, 92, 96, 100, 120
});

// Set per-game RTP override
await trpc.tenant.setRtp.mutate({
  tenantId: 1,
  gameId: 1,
  rtpPercent: 85  // Override for this game only
});`} />
        </Section>

        <Section id="embed" icon={<Code2 className="w-6 h-6" />} title="Embedding Games">
          <p className="text-gray-400 mb-6">Embed any game in your website with a single iframe or JS snippet.</p>
          <div className="space-y-6">
            <div>
              <p className="text-gray-300 text-sm font-medium mb-3">iframe embed:</p>
              <CodeBlock lang="html" code={`<iframe
  src="https://minigame.npgslot.com/play/gem-blitz?apiKey=mgk_xxx&playerId=player_123"
  width="420"
  height="780"
  frameborder="0"
  allow="fullscreen"
/>`} />
            </div>
            <div>
              <p className="text-gray-300 text-sm font-medium mb-3">JavaScript SDK (coming soon):</p>
              <CodeBlock lang="js" code={`import { MinigameHub } from 'minigame-hub-sdk';

const hub = new MinigameHub({ apiKey: 'mgk_xxx' });
hub.launch('gem-blitz', {
  container: '#game-container',
  playerId: 'player_123',
  onWin: (amount) => updateBalance(amount),
  onBet: (amount) => deductBalance(amount),
});`} />
            </div>
          </div>
        </Section>

        <Section id="stats" icon={<BarChart3 className="w-6 h-6" />} title="Analytics">
          <CodeBlock lang="js" code={`// Get tenant overview stats
const stats = await trpc.tenant.stats.query({ tenantId: 1 });

// Response:
{
  overview: {
    totalSessions: 1250,
    totalBet: "125000.00",
    totalWin: "120000.00",
    avgRtp: "96.00",
    completedSessions: 1200
  },
  daily: [
    { date: "2025-01-01", sessions: 45, totalBet: "4500", totalWin: "4320" },
    ...
  ],
  byGame: [
    { gameSlug: "gem-blitz", sessions: 1250, totalBet: "125000", avgRtp: "96.00" }
  ]
}`} />
        </Section>
      </div>
    </div>
  );
}
