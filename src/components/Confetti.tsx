import { useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { useConfetti, type Burst } from "../lib/confetti";

const PALETTE = ["#FFD60A", "#FF9F0A", "#30D158", "#64D2FF", "#5E5CE6", "#FF2D55", "#FF3B30", "#BF5AF2"];

function Burst({ burst, onDone }: { burst: Burst; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 1700);
    return () => window.clearTimeout(t);
  }, [onDone]);

  const parts = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => {
        const angle = (i / 44) * Math.PI * 2 + Math.random() * 0.6 - 0.3;
        const dist = 60 + Math.random() * 140;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.85 + 26,
          size: 4 + Math.random() * 6,
          rot: (Math.random() - 0.5) * 680,
          dur: 0.85 + Math.random() * 0.55,
          color: PALETTE[i % PALETTE.length],
          delay: Math.random() * 0.06,
          round: i % 3 === 0,
        };
      }),
    [],
  );

  return (
    <div className="pointer-events-none fixed z-[140]" style={{ left: burst.x, top: burst.y }}>
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{ width: p.size, height: p.size, background: p.color, borderRadius: p.round ? "50%" : "2px" }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.x, y: p.y, rotate: p.rot, opacity: [1, 1, 0], scale: [1, 1, 0.7] }}
          transition={{ duration: p.dur, delay: p.delay, ease: [0.1, 0.9, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

export function Confetti() {
  const bursts = useConfetti((s) => s.bursts);
  const done = useConfetti((s) => s.done);
  return (
    <div className="pointer-events-none fixed inset-0 z-[140]">
      {bursts.map((b) => (
        <Burst key={b.id} burst={b} onDone={() => done(b.id)} />
      ))}
    </div>
  );
}