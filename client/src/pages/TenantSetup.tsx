import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Zap, CheckCircle2 } from "lucide-react";

export default function TenantSetup() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ slug: "", name: "", description: "", contactEmail: "", websiteUrl: "" });
  const [created, setCreated] = useState<{ tenantId: number; slug: string } | null>(null);

  const createTenant = trpc.tenant.create.useMutation({
    onSuccess: (data) => {
      setCreated(data);
      toast.success("Tenant created successfully!");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

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
          <h2 className="text-2xl font-bold text-white mb-3">Sign In Required</h2>
          <p className="text-gray-500 mb-6">You need to sign in to create a tenant account.</p>
          <a href="/login">
            <Button className="w-full font-bold text-black" style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}>
              Sign In
            </Button>
          </a>
        </div>
      </div>
    );
  }

  if (created) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(10% 0.01 260)" }}>
        <div className="text-center max-w-md p-8 rounded-2xl border border-green-500/20" style={{ background: "oklch(14% 0.015 260)" }}>
          <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-3xl font-black text-white mb-3" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Tenant Created!
          </h2>
          <p className="text-gray-400 mb-2">Your tenant <span className="text-yellow-400 font-bold">{created.slug}</span> is ready.</p>
          <p className="text-gray-500 text-sm mb-8">Go to the dashboard to create API keys and configure RTP settings.</p>
          <div className="flex gap-3">
            <Button onClick={() => navigate(`/admin/${created.slug}`)} className="flex-1 font-bold text-black"
              style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}>
              Open Dashboard
            </Button>
            <Link href="/games">
              <Button variant="outline" className="border-white/20 text-white hover:bg-white/5">
                Browse Games
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "oklch(10% 0.01 260)" }}>
      <nav className="border-b border-white/5 h-16 flex items-center">
        <div className="container flex items-center gap-4">
          <Link href="/">
            <button className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </Link>
          <div className="w-px h-4 bg-white/10" />
          <span className="text-white font-bold" style={{ fontFamily: "'Rajdhani', sans-serif" }}>Create Tenant</span>
        </div>
      </nav>

      <div className="container py-12 max-w-lg">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-white mb-3" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            Create Your Tenant
          </h1>
          <p className="text-gray-500">Set up your operator account to access API keys and RTP controls.</p>
        </div>

        <div className="rounded-2xl border border-white/8 p-8 space-y-6" style={{ background: "oklch(14% 0.015 260)" }}>
          <div className="space-y-2">
            <Label className="text-gray-300">Tenant Slug <span className="text-red-400">*</span></Label>
            <Input
              placeholder="my-casino"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
            />
            <p className="text-xs text-gray-600">Lowercase letters, numbers, and hyphens only. Used in API calls.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Display Name <span className="text-red-400">*</span></Label>
            <Input
              placeholder="My Casino Platform"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Description</Label>
            <Input
              placeholder="Brief description of your platform"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Contact Email</Label>
            <Input
              type="email"
              placeholder="admin@yourcasino.com"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Website URL</Label>
            <Input
              placeholder="https://yourcasino.com"
              value={form.websiteUrl}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
              className="bg-white/5 border-white/10 text-white placeholder:text-gray-600"
            />
          </div>

          <Button
            className="w-full font-bold text-black text-base py-6"
            style={{ background: "linear-gradient(135deg, #f5c842, #c8960a)" }}
            disabled={!form.slug || !form.name || createTenant.isPending}
            onClick={() => createTenant.mutate(form)}
          >
            {createTenant.isPending ? "Creating..." : "Create Tenant Account"}
          </Button>
        </div>
      </div>
    </div>
  );
}
