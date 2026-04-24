import { useEffect, useState, useRef } from "react";

interface GameLoaderProps {
  /** 0–100, controlled externally. If omitted, auto-animates. */
  progress?: number;
  /** Label shown below progress bar */
  label?: string;
  /** Called when the loader finishes (progress reaches 100) */
  onComplete?: () => void;
  /** Whether to show the loader */
  visible?: boolean;
}

/**
 * Unified game loading screen for all NOVAPLAY minigames.
 * Shows the NOVAPLAY logo, animated gold progress bar, and loading label.
 */
export function GameLoader({
  progress: externalProgress,
  label = "Loading...",
  onComplete,
  visible = true,
}: GameLoaderProps) {
  const [progress, setProgress] = useState(externalProgress ?? 0);
  const [fadeOut, setFadeOut] = useState(false);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const DURATION = 2400; // ms for auto-animation

  // Auto-animate if no external progress provided
  useEffect(() => {
    if (externalProgress !== undefined) {
      setProgress(externalProgress);
      return;
    }
    startTimeRef.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      // Ease-out curve: fast start, slows near 95%
      const t = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 2.5);
      const p = Math.min(eased * 97, 97); // stop at 97 until real complete
      setProgress(p);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [externalProgress]);

  // When progress hits 100, trigger fade-out then onComplete
  useEffect(() => {
    if (progress >= 100) {
      setFadeOut(true);
      const t = setTimeout(() => onComplete?.(), 500);
      return () => clearTimeout(t);
    }
  }, [progress, onComplete]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
      style={{
        background: "radial-gradient(ellipse at 50% 30%, oklch(16% 0.025 270) 0%, oklch(8% 0.01 260) 100%)",
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 0.5s ease",
        pointerEvents: fadeOut ? "none" : "auto",
      }}
    >
      {/* Ambient glow behind logo */}
      <div
        className="absolute rounded-full blur-3xl"
        style={{
          width: 320,
          height: 320,
          background: "radial-gradient(circle, rgba(197,155,60,0.18) 0%, transparent 70%)",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -62%)",
        }}
      />

      {/* Logo */}
      <div className="relative mb-10" style={{ animation: "logoFloat 3s ease-in-out infinite" }}>
        <img
          src="/manus-storage/novaplay-logo_38e90a07.png"
          alt="NOVAPLAY"
          style={{
            width: 180,
            height: "auto",
            filter: "drop-shadow(0 0 24px rgba(197,155,60,0.5)) drop-shadow(0 4px 16px rgba(0,0,0,0.6))",
          }}
        />
      </div>

      {/* Progress bar container */}
      <div className="w-64 sm:w-80">
        {/* Track */}
        <div
          className="relative rounded-full overflow-hidden"
          style={{
            height: 6,
            background: "rgba(255,255,255,0.06)",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)",
          }}
        >
          {/* Fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #8B6914 0%, #C59B3C 35%, #F5C842 65%, #FFE082 85%, #C59B3C 100%)",
              backgroundSize: "200% 100%",
              transition: "width 0.15s ease-out",
              animation: "shimmer 1.8s linear infinite",
              boxShadow: "0 0 10px rgba(245,200,66,0.6), 0 0 20px rgba(245,200,66,0.25)",
            }}
          />
          {/* Shine overlay */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 60%)",
            }}
          />
        </div>

        {/* Percentage + label */}
        <div className="flex items-center justify-between mt-3">
          <span
            className="text-xs tracking-widest font-medium"
            style={{ color: "rgba(197,155,60,0.7)", fontFamily: "'Rajdhani', sans-serif" }}
          >
            {label}
          </span>
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color: "#F5C842", fontFamily: "'Orbitron', sans-serif" }}
          >
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* Decorative dots */}
      <div className="flex gap-2 mt-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: 5,
              height: 5,
              background: "#C59B3C",
              opacity: 0.4,
              animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Keyframes injected via style tag */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}

/**
 * Hook to manage game loading state with staged progress simulation.
 * Usage:
 *   const { loaderVisible, loaderProgress, completeLoading } = useGameLoader();
 */
export function useGameLoader(autoComplete = false) {
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [loaderProgress, setLoaderProgress] = useState(0);
  const [done, setDone] = useState(false);

  // Simulate staged loading: 0→40→70→95 then wait for completeLoading()
  useEffect(() => {
    const stages = [
      { target: 40, delay: 200, duration: 600 },
      { target: 70, delay: 900, duration: 500 },
      { target: 95, delay: 1500, duration: 800 },
    ];
    const timers: ReturnType<typeof setTimeout>[] = [];
    stages.forEach(({ target, delay }) => {
      timers.push(setTimeout(() => setLoaderProgress(target), delay));
    });
    if (autoComplete) {
      timers.push(setTimeout(() => setLoaderProgress(100), 2600));
    }
    return () => timers.forEach(clearTimeout);
  }, [autoComplete]);

  const completeLoading = () => {
    setLoaderProgress(100);
    setTimeout(() => setLoaderVisible(false), 600);
  };

  const handleComplete = () => {
    setLoaderVisible(false);
    setDone(true);
  };

  return { loaderVisible, loaderProgress, completeLoading, done, handleComplete };
}
