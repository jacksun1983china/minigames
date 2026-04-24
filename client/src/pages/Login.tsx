import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Mode = "login" | "register";

export default function Login() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Login successful");
      navigate("/admin");
    },
    onError: (err) => {
      toast.error(err.message || "Login failed");
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      toast.success("Account created successfully");
      navigate("/admin");
    },
    onError: (err) => {
      toast.error(err.message || "Registration failed");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await loginMutation.mutateAsync({ username: username.trim(), password });
      } else {
        await registerMutation.mutateAsync({ username: username.trim(), password, name: name.trim() || undefined });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#c59b3c]/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/novaplay-logo.png" alt="NOVAPLAY" className="h-14 w-auto mb-4" style={{ filter: "drop-shadow(0 0 12px rgba(197,155,60,0.5))" }} />
          <h1 className="text-2xl font-bold text-white tracking-wide">NOVAPLAY</h1>
          <p className="text-[#888] text-sm mt-1">Game Platform Management</p>
        </div>

        {/* Card */}
        <div className="bg-[#111118] border border-[#2a2a3a] rounded-2xl p-8 shadow-2xl">
          {/* Mode tabs */}
          <div className="flex bg-[#0a0a0f] rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-[#c59b3c] text-black"
                  : "text-[#888] hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "register"
                  ? "bg-[#c59b3c] text-black"
                  : "text-[#888] hover:text-white"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[#aaa] text-sm">Display Name (optional)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your display name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white placeholder:text-[#444] focus:border-[#c59b3c] focus:ring-[#c59b3c]/20"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-[#aaa] text-sm">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="bg-[#0a0a0f] border-[#2a2a3a] text-white placeholder:text-[#444] focus:border-[#c59b3c] focus:ring-[#c59b3c]/20"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#aaa] text-sm">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === "register" ? "At least 6 characters" : "Enter password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                className="bg-[#0a0a0f] border-[#2a2a3a] text-white placeholder:text-[#444] focus:border-[#c59b3c] focus:ring-[#c59b3c]/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#c59b3c] hover:bg-[#d4aa4a] text-black font-semibold py-2.5 rounded-lg transition-all mt-2"
            >
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <p className="text-center text-[#555] text-xs mt-6">
            &copy; {new Date().getFullYear()} NOVAPLAY. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
