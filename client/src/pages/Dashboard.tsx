import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Key, Settings, Gamepad2, ArrowLeft, Zap,
  Copy, Eye, EyeOff, RefreshCw, TrendingUp, TrendingDown,
  Users, DollarSign, Activity, ChevronRight, Plus, Trash2
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

// ── Sidebar nav items ─────────────────────────────────────────────────────────
type Tab = "overview" | "rtp" | "apikeys" | "sessions" | "games";
const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart3 className="w-4 h-4" /> },
  { id: "rtp", label: "RTP Config", icon: <Settings className="w-4 h-4" /> },
  { id: "apikeys", label: "API Keys", icon: <Key className="w-4 h-4" /> },
  { id: "sessions", label: "Sessions", icon: <Activity className="w-4 h-4" /> },
  { id: "games", label: "Games", icon: <Gamepad2 className="w-4 h-4" /> },
];

const RTP_TIERS = [50, 70, 85, 92, 96, 100, 120];
const RTP_LABELS: Record<string, string> = {
  50: "High House Edge",
  70: "Standard House",
  85: "Balanced",
  92: "Player Friendly",
  96: "High Return",
  100: "Break Even",
  120: "Bonus Mode",
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="rounded-xl p-5 border border-white/5" style={{ background: "oklch(14% 0.015 260)" }}>
      <div className="flex items-start justify-between mb-3">
        <div className="text-gray-500">{icon}</div>
        {trend && (
          <span className={trend === "up" ? "text-green-400" : trend === "down" ? "text-red-400" : "text-gray-500"}>
            {trend === "up" ? <TrendingUp className="w-4 h-4" /> : trend === "down" ? <TrendingDown className="w-4 h-4" /> : null}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-gray-500 text-sm">{label}</div>
      {sub && <div className="text-gray-600 text-xs mt-1">{sub}</div>}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ tenantId }: { tenantId: number }) {
  const { data: stats } = trpc.tenant.stats.useQuery({ tenantId });

  const dailyData = stats?.daily?.slice(-14).map((d: { date: string; sessions: number; totalBet: string; totalWin: string }) => ({
    date: d.date.slice(5),
    sessions: d.sessions,
    bet: parseFloat(d.totalBet),
    win: parseFloat(d.totalWin),
  })) ?? [];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Sessions" value={stats?.overview?.totalSessions?.toString() ?? "0"}
          icon={<Users className="w-5 h-5" />} trend="up" />
        <StatCard label="Total Wagered" value={`${parseFloat(stats?.overview?.totalBet ?? "0").toFixed(0)}`}
          sub="All time" icon={<DollarSign className="w-5 h-5" />} trend="up" />
        <StatCard label="Total Paid Out" value={`${parseFloat(stats?.overview?.totalWin ?? "0").toFixed(0)}`}
          icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard label="Avg Session RTP" value={`${parseFloat(stats?.overview?.avgRtp ?? "0").toFixed(1)}%`}
          icon={<Activity className="w-5 h-5" />} trend="neutral" />
      </div>

      {/* Charts */}
      {dailyData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl p-5 border border-white/5" style={{ background: "oklch(14% 0.015 260)" }}>
            <h3 className="text-white font-bold mb-4 text-sm">Daily Sessions (14d)</h3>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f5c842" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f5c842" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} />
                <Area type="monotone" dataKey="sessions" stroke="#f5c842" fill="url(#sessGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl p-5 border border-white/5" style={{ background: "oklch(14% 0.015 260)" }}>
            <h3 className="text-white font-bold mb-4 text-sm">Bet vs Win (14d)</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dailyData}>
                <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} />
                <Bar dataKey="bet" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="win" fill="#f5c842" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* By game */}
      {stats?.byGame && stats.byGame.length > 0 && (
        <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: "oklch(14% 0.015 260)" }}>
          <div className="px-5 py-3 border-b border-white/5">
            <h3 className="text-white font-bold text-sm">Performance by Game</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-600 text-xs">
                <th className="px-5 py-2 text-left">Game</th>
                <th className="px-5 py-2 text-right">Sessions</th>
                <th className="px-5 py-2 text-right">Total Bet</th>
                <th className="px-5 py-2 text-right">Avg RTP</th>
              </tr>
            </thead>
            <tbody>
              {stats.byGame.map((g: { gameSlug: string; sessions: number; totalBet: string; avgRtp: string }) => (
                <tr key={g.gameSlug} className="border-t border-white/5 hover:bg-white/2">
                  <td className="px-5 py-3 text-white font-medium">{g.gameSlug}</td>
                  <td className="px-5 py-3 text-right text-gray-400">{g.sessions}</td>
                  <td className="px-5 py-3 text-right text-gray-400">{parseFloat(g.totalBet).toFixed(0)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-yellow-400 font-bold">{parseFloat(g.avgRtp).toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── RTP Config Tab ────────────────────────────────────────────────────────────
function RtpTab({ tenantId }: { tenantId: number }) {
  const { data: rtpConfigs } = trpc.tenant.listRtpConfigs.useQuery({ tenantId });
  const { data: games } = trpc.game.list.useQuery();
  const setRtp = trpc.tenant.setRtp.useMutation({
    onSuccess: () => toast.success("RTP updated!"),
    onError: (e) => toast.error(e.message),
  });

  const globalRtp = rtpConfigs?.find((r: { gameId: number | null }) => !r.gameId)?.rtpPercent ?? 96;

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-6 border border-yellow-500/20" style={{ background: "rgba(245,200,66,0.03)" }}>
        <h3 className="text-white font-bold mb-1">Global RTP Setting</h3>
        <p className="text-gray-500 text-sm mb-5">Applies to all games unless overridden per-game below.</p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {RTP_TIERS.map((tier) => (
            <button
              key={tier}
              onClick={() => setRtp.mutate({ tenantId, rtpPercent: tier })}
              className="py-3 rounded-xl text-center transition-all border"
              style={{
                background: globalRtp === tier ? "linear-gradient(135deg, #f5c842, #c8960a)" : "oklch(18% 0.015 260)",
                borderColor: globalRtp === tier ? "transparent" : "rgba(255,255,255,0.06)",
                color: globalRtp === tier ? "#000" : "#888",
              }}
            >
              <div className="font-black text-lg">{tier}%</div>
              <div className="text-xs mt-0.5 opacity-70">{RTP_LABELS[tier]?.split(" ")[0]}</div>
            </button>
          ))}
        </div>
        <p className="text-gray-600 text-xs mt-3">Current: <span className="text-yellow-400 font-bold">{globalRtp}%</span> — {RTP_LABELS[globalRtp]}</p>
      </div>

      {/* Per-game overrides */}
      <div>
        <h3 className="text-white font-bold mb-4">Per-Game Overrides</h3>
        <div className="space-y-3">
          {games?.map((game) => {
            const override = rtpConfigs?.find((r: { gameId: number | null }) => r.gameId === game.id);
            const currentRtp = override?.rtpPercent ?? globalRtp;
            return (
              <div key={game.id} className="rounded-xl p-4 border border-white/5 flex items-center gap-4"
                style={{ background: "oklch(14% 0.015 260)" }}>
                <div className="flex-1">
                  <div className="text-white font-medium text-sm">{game.name}</div>
                  <div className="text-gray-600 text-xs">{game.slug}</div>
                </div>
                <div className="flex gap-1.5">
                  {RTP_TIERS.map((tier) => (
                    <button
                      key={tier}
                      onClick={() => setRtp.mutate({ tenantId, gameId: game.id, rtpPercent: tier })}
                      className="w-9 h-8 rounded-lg text-xs font-bold transition-all"
                      style={{
                        background: currentRtp === tier && override ? "linear-gradient(135deg, #f5c842, #c8960a)" : "oklch(20% 0.02 260)",
                        color: currentRtp === tier && override ? "#000" : "#666",
                        border: currentRtp === tier && !override ? "1px solid rgba(245,200,66,0.3)" : "1px solid transparent",
                      }}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
                <Badge className="text-xs" style={{
                  background: override ? "rgba(245,200,66,0.1)" : "rgba(255,255,255,0.05)",
                  color: override ? "#f5c842" : "#666",
                  border: override ? "1px solid rgba(245,200,66,0.2)" : "1px solid rgba(255,255,255,0.06)",
                }}>
                  {currentRtp}% {override ? "override" : "global"}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── API Keys Tab ──────────────────────────────────────────────────────────────
function ApiKeysTab({ tenantId }: { tenantId: number }) {
  const { data: keys, refetch } = trpc.tenant.listApiKeys.useQuery({ tenantId });
  const createKey = trpc.tenant.createApiKey.useMutation({
    onSuccess: () => { refetch(); toast.success("API key created!"); },
    onError: (e) => toast.error(e.message),
  });
  const revokeKey = trpc.tenant.revokeApiKey.useMutation({
    onSuccess: () => { refetch(); toast.success("Key revoked"); },
  });

  const [keyName, setKeyName] = useState("");
  const [showKey, setShowKey] = useState<Record<number, boolean>>({});
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Create key */}
      <div className="rounded-xl p-5 border border-white/8" style={{ background: "oklch(14% 0.015 260)" }}>
        <h3 className="text-white font-bold mb-4">Create New API Key</h3>
        <div className="flex gap-3">
          <Input
            placeholder="Key name (e.g. production, staging)"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
          />
          <Button
            onClick={() => {
              if (!keyName.trim()) return;
              createKey.mutate({ tenantId, name: keyName }, {
                onSuccess: (data) => {
                  setNewKeyValue((data as { rawKey: string }).rawKey);
                  setKeyName("");
                },
              });
            }}
            disabled={!keyName.trim() || createKey.isPending}
            className="shrink-0 text-black font-bold"
            style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}
          >
            <Plus className="w-4 h-4 mr-1" /> Create
          </Button>
        </div>

        {newKeyValue && (
          <div className="mt-4 p-4 rounded-xl border border-green-500/30" style={{ background: "rgba(16,185,129,0.05)" }}>
            <p className="text-green-400 text-sm font-medium mb-2">⚠️ Copy this key now — it won't be shown again!</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-white bg-black/30 px-3 py-2 rounded-lg break-all">{newKeyValue}</code>
              <button onClick={() => { navigator.clipboard.writeText(newKeyValue); toast.success("Copied!"); }}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Key list */}
      <div className="space-y-3">
        {keys?.map((k: { id: number; name: string; keyPrefix: string; isActive: boolean; lastUsedAt: Date | null; createdAt: Date }) => (
          <div key={k.id} className="rounded-xl p-4 border border-white/5 flex items-center gap-4"
            style={{ background: "oklch(14% 0.015 260)" }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-medium text-sm">{k.name}</span>
                <Badge className={`text-xs ${k.isActive ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                  {k.isActive ? "Active" : "Revoked"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-gray-500">
                  {showKey[k.id] ? k.keyPrefix + "..." : k.keyPrefix.slice(0, 12) + "••••••••••••"}
                </code>
                <button onClick={() => setShowKey((s) => ({ ...s, [k.id]: !s[k.id] }))}
                  className="text-gray-600 hover:text-gray-400 transition-colors">
                  {showKey[k.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
              <div className="text-xs text-gray-700 mt-1">
                Created {new Date(k.createdAt).toLocaleDateString()}
                {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
              </div>
            </div>
            {k.isActive && (
              <button
                onClick={() => revokeKey.mutate({ tenantId, keyId: k.id })}
                className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {(!keys || keys.length === 0) && (
          <div className="text-center py-12 text-gray-600">
            <Key className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No API keys yet. Create one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────
function SessionsTab({ tenantId }: { tenantId: number }) {
  const { data } = trpc.tenant.sessions.useQuery({ tenantId, limit: 50 });

  return (
    <div className="rounded-xl border border-white/5 overflow-hidden" style={{ background: "oklch(14% 0.015 260)" }}>
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-white font-bold text-sm">Recent Sessions</h3>
        <span className="text-gray-600 text-xs">{data?.sessions?.length ?? 0} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-600 text-xs border-b border-white/5">
              <th className="px-4 py-2 text-left">Player</th>
              <th className="px-4 py-2 text-left">Game</th>
              <th className="px-4 py-2 text-right">Bet</th>
              <th className="px-4 py-2 text-right">Win</th>
              <th className="px-4 py-2 text-right">RTP</th>
              <th className="px-4 py-2 text-right">Rounds</th>
              <th className="px-4 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.sessions?.map((s) => {
              const rtp = parseFloat(s.appliedRtp ?? "0");
              return (
                <tr key={s.id} className="border-t border-white/3 hover:bg-white/2">
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{s.playerId.slice(0, 12)}...</td>
                  <td className="px-4 py-2.5 text-white text-xs">{s.gameId}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{parseFloat(s.betAmount ?? "0").toFixed(1)}</td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    <span className={parseFloat(s.winAmount ?? "0") > 0 ? "text-green-400" : "text-gray-600"}>
                      {parseFloat(s.winAmount ?? "0").toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    <span className={rtp >= 95 ? "text-yellow-400" : rtp >= 80 ? "text-blue-400" : "text-gray-500"}>
                      {rtp.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{s.roundCount}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Badge className={`text-xs ${s.status === "completed" ? "bg-green-500/10 text-green-400" : "bg-blue-500/10 text-blue-400"}`}>
                      {s.status}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(!data?.sessions || data.sessions.length === 0) && (
          <div className="text-center py-12 text-gray-600">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No sessions yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { user, isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: rawTenants } = trpc.tenant.myTenants.useQuery(undefined, { enabled: isAuthenticated });
  const tenants = rawTenants?.map((r) => ({ ...r.tenant, memberRole: r.member.role }));
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  useEffect(() => {
    if (tenants && tenants.length > 0) {
        if (tenantSlug) {
        const found = tenants.find((t) => t.slug === tenantSlug);
        setSelectedTenantId(found?.id ?? tenants[0]?.id ?? null);
      } else {
        setSelectedTenantId(tenants[0]?.id ?? null);
      }
    }
  }, [tenants, tenantSlug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(10% 0.01 260)" }}>
        <div className="w-8 h-8 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(10% 0.01 260)" }}>
        <div className="text-center max-w-sm">
          <Zap className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Admin Dashboard</h2>
          <p className="text-gray-500 mb-6">Sign in to access your tenant dashboard.</p>
          <a href={getLoginUrl()}>
            <Button className="w-full font-bold text-black" style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}>
              Sign In
            </Button>
          </a>
        </div>
      </div>
    );
  }

  if (!tenants || tenants.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(10% 0.01 260)" }}>
        <div className="text-center max-w-sm">
          <Gamepad2 className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">No Tenants Yet</h2>
          <p className="text-gray-500 mb-6">Create your first tenant to get started.</p>
          <Link href="/setup">
            <Button className="font-bold text-black" style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}>
              Create Tenant
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const selectedTenant = tenants?.find((t) => t.id === selectedTenantId) ?? tenants?.[0];

  return (
    <div className="min-h-screen flex" style={{ background: "oklch(10% 0.01 260)" }}>
      {/* ── Sidebar ── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40 w-64 flex flex-col border-r border-white/5 transition-transform
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `} style={{ background: "oklch(12% 0.012 260)" }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}>
            <Zap className="w-3.5 h-3.5 text-black" />
          </div>
          <span className="font-bold text-white text-sm" style={{ fontFamily: "'Rajdhani', sans-serif" }}>MINIGAME HUB</span>
        </div>

        {/* Tenant selector */}
        <div className="px-3 py-3 border-b border-white/5">
          <p className="text-gray-600 text-xs px-2 mb-2">TENANT</p>
          {tenants?.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTenantId(t.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all mb-1"
              style={{
                background: selectedTenantId === t.id ? "rgba(245,200,66,0.1)" : "transparent",
                color: selectedTenantId === t.id ? "#f5c842" : "#888",
              }}
            >
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                style={{ background: selectedTenantId === t.id ? "rgba(245,200,66,0.2)" : "rgba(255,255,255,0.05)" }}>
                {t.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.name}</div>
                <div className="text-xs text-gray-600 truncate">{t.slug}</div>
              </div>
              {selectedTenantId === t.id && <ChevronRight className="w-3 h-3 shrink-0" />}
            </button>
          ))}
          <Link href="/setup">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:text-gray-400 text-sm transition-colors mt-1">
              <Plus className="w-4 h-4" /> Add Tenant
            </button>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all mb-1"
              style={{
                background: activeTab === item.id ? "rgba(245,200,66,0.1)" : "transparent",
                color: activeTab === item.id ? "#f5c842" : "#666",
              }}
            >
              {item.icon}
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="px-5 py-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 text-sm font-bold">
              {user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user?.name ?? "User"}</div>
              <div className="text-gray-600 text-xs truncate">{user?.email ?? ""}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 h-16 border-b border-white/5" style={{ background: "oklch(12% 0.012 260)" }}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-400 hover:text-white">
              ☰
            </button>
            <div>
              <h1 className="text-white font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                {NAV.find((n) => n.id === activeTab)?.label}
              </h1>
              {selectedTenant && (
                <p className="text-gray-600 text-xs">{selectedTenant.name} · {selectedTenant.slug}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/games">
              <Button size="sm" variant="outline" className="border-white/10 text-gray-400 hover:text-white hover:bg-white/5 text-xs">
                <Gamepad2 className="w-3 h-3 mr-1" /> Games
              </Button>
            </Link>
            <Link href="/">
              <button className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-sm transition-colors">
                <ArrowLeft className="w-3 h-3" /> Home
              </button>
            </Link>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 p-6 overflow-auto">
          {selectedTenantId && (
            <>
              {activeTab === "overview" && <OverviewTab tenantId={selectedTenantId} />}
              {activeTab === "rtp" && <RtpTab tenantId={selectedTenantId} />}
              {activeTab === "apikeys" && <ApiKeysTab tenantId={selectedTenantId} />}
              {activeTab === "sessions" && <SessionsTab tenantId={selectedTenantId} />}
              {activeTab === "games" && (
                <div className="text-center py-20 text-gray-600">
                  <Gamepad2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Game management coming soon</p>
                  <Link href="/games">
                    <Button variant="outline" className="mt-4 border-white/10 text-gray-400">Browse Games</Button>
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
