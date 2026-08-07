import { useEffect, useState } from "react";
import { motion } from "motion/react";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [exit, setExit] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setExit(true), 1600);
    const t2 = window.setTimeout(onDone, 2400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "var(--canvas)" }}
      initial={{ opacity: 1 }}
      animate={{ opacity: exit ? 0 : 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="absolute h-[360px] w-[360px] rounded-full"
        style={{
          background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 28%, transparent) 0%, transparent 65%)",
        }}
        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute left-1/2 top-1/2 h-[64px] w-[10px] -translate-x-1/2"
        style={{ background: "linear-gradient(to top, transparent, var(--accent))" }}
        initial={{ rotate: 0 }}
        animate={exit ? { opacity: 0 } : { rotate: 360 }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
      />

      <motion.div
        initial={{ scale: 0.3, y: 48, opacity: 0 }}
        animate={
          exit
            ? { scale: 3.2, y: 0, opacity: 0, rotate: 12 }
            : { scale: [0.3, 1.08, 1], y: 0, opacity: 1 }
        }
        transition={
          exit
            ? { duration: 0.5, ease: [0.45, 0, 1, 1] }
            : { duration: 0.65, times: [0, 0.75, 1], ease: [0.22, 1, 0.36, 1] }
        }
        className="relative z-10"
      >
        <img src="/todolite.png" alt="TodoLite" draggable={false} className="h-28 w-28 rounded-[2rem] shadow-2xl" />
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: exit ? 0 : 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="pt-5 text-[15px] font-semibold tracking-tight text-[var(--text-secondary)]"
      >
        TodoLite
      </motion.p>

      <div className="absolute bottom-10 left-1/2 h-1 w-44 -translate-x-1/2 overflow-hidden rounded-full bg-[var(--section-alt)]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "var(--accent)" }}
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}