import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Zap, Search, Gamepad2, ArrowLeft } from "lucide-react";
import { useState } from "react";

const categoryColors: Record<string, string> = {
  puzzle: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  arcade: "text-orange-400 border-orange-400/30 bg-orange-400/10",
  card: "text-purple-400 border-purple-400/30 bg-purple-400/10",
  slot: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  casual: "text-green-400 border-green-400/30 bg-green-400/10",
  multiplayer: "text-pink-400 border-pink-400/30 bg-pink-400/10",
};

const gameEmojis: Record<string, string> = {
  "gem-blitz": "💎",
};

export default function GameCenter() {
  const { data: games, isLoading } = trpc.game.list.useQuery();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const categories = ["all", "puzzle", "arcade", "card", "slot", "casual", "multiplayer"];

  const filtered = games?.filter((g) => {
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase()) ||
      (g.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || g.category === category;
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen" style={{ background: "oklch(10% 0.01 260)" }}>
      {/* Nav */}
      <nav className="border-b border-white/5 sticky top-0 z-50 backdrop-blur-xl" style={{ background: "oklch(10% 0.01 260 / 0.9)" }}>
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
                <ArrowLeft className="w-4 h-4" /> Home
              </button>
            </Link>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-yellow-400" />
              <span className="font-bold text-white" style={{ fontFamily: "'Rajdhani', sans-serif" }}>Game Center</span>
            </div>
          </div>
          <Link href="/admin">
            <button className="text-sm text-gray-400 hover:text-white transition-colors">Admin →</button>
          </Link>
        </div>
      </nav>

      <div className="container py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-black text-white mb-3" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Game Center
          </h1>
          <p className="text-gray-500">Choose a game and start playing. All games feature server-side RTP control.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Search games..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-yellow-500/50"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className="px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all"
                style={{
                  background: category === cat ? "linear-gradient(135deg, #f5c842, #c8960a)" : "oklch(18% 0.015 260)",
                  color: category === cat ? "#000" : "#888",
                  border: category === cat ? "none" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Games Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border border-white/5 overflow-hidden animate-pulse" style={{ background: "oklch(14% 0.015 260)" }}>
                <div className="aspect-video bg-white/5" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-white/5 rounded w-3/4" />
                  <div className="h-3 bg-white/5 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered && filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((game) => (
              <Link key={game.slug} href={`/game/${game.slug}`}>
                <div className="rounded-xl border border-white/8 overflow-hidden hover:border-yellow-500/40 transition-all group cursor-pointer"
                  style={{ background: "oklch(14% 0.015 260)" }}>
                  {/* Thumbnail */}
                  <div className="aspect-video flex items-center justify-center relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg, oklch(18% 0.04 280), oklch(14% 0.02 260))" }}>
                    <div className="text-7xl group-hover:scale-110 transition-transform duration-300">
                      {gameEmojis[game.slug] ?? "🎮"}
                    </div>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.5)" }}>
                      <div className="px-5 py-2 rounded-full font-bold text-sm text-black"
                        style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}>
                        ▶ Play Now
                      </div>
                    </div>
                    {/* Tags */}
                    <div className="absolute top-2 left-2 flex gap-1">
                      {(game.tags ?? "").includes("featured") && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: "rgba(245,200,66,0.9)", color: "#000" }}>
                          ⭐ Featured
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-white font-bold text-base leading-tight">{game.name}</h3>
                      <Badge className={`text-xs shrink-0 ${categoryColors[game.category] ?? ""}`}>
                        {game.category}
                      </Badge>
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed mb-3 line-clamp-2">{game.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-gray-600">RTP </span>
                        <span className="text-yellow-400 font-bold">{game.baseRtp}%</span>
                      </div>
                      <div className="text-xs text-gray-600">
                        {game.minBet} – {game.maxBet}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <Gamepad2 className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500">No games found</p>
          </div>
        )}
      </div>
    </div>
  );
}
