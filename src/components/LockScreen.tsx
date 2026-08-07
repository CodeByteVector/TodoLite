import { useState } from "react";
import { motion } from "motion/react";
import { LockKeyhole } from "lucide-react";

export function LockScreen({
  onUnlock,
  onSkip,
}: {
  onUnlock: (pin: string) => Promise<boolean>;
  onSkip: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const ok = await onUnlock(code);
    setBusy(false);
    if (!ok) {
      setError(true);
      setCode("");
      setTimeout(() => setError(false), 600);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4"
      style={{ background: "var(--canvas)" }}
    >
      <motion.div
        initial={{ scale: 0.8, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="flex flex-col items-center gap-3"
      >
        <div className="accent-soft flex h-20 w-20 items-center justify-center rounded-[1.6rem] text-[var(--accent)] shadow-lg">
          <LockKeyhole size={40} strokeWidth={1.6} />
        </div>
        <div className="text-center">
          <p className="text-[22px] font-bold">TodoLite</p>
          <p className="text-[13px] text-[var(--text-secondary)]">Enter your PIN to unlock</p>
        </div>
      </motion.div>

      <motion.input
        key={code}
        animate={error ? { x: [-8, 8, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        autoFocus
        type="password"
        inputMode="numeric"
        placeholder="••••"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, ""));
          setError(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && code.length >= 4 && void submit()}
        className="w-56 rounded-2xl bg-[var(--section)] px-4 py-3 text-center text-[20px] font-semibold tracking-[0.4em] outline-none shadow-sm placeholder:text-[var(--text-tertiary)] disabled:opacity-60"
        disabled={busy}
      />
      {error && <p className="text-[12px] text-[var(--danger)]">Incorrect PIN, try again</p>}
      <button onClick={onSkip} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
        Skip for now · only an empty view
      </button>
    </motion.div>
  );
}