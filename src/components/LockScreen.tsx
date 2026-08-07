import { useState } from "react";
import { motion } from "motion/react";
import { LockKeyhole } from "lucide-react";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function LockScreen({
  hash,
  onUnlock,
  onSkip,
}: {
  hash: string;
  onUnlock: () => void;
  onSkip: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  async function submit() {
    const h = await sha256(code);
    if (h === hash) {
      onUnlock();
    } else {
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
        onKeyDown={(e) => e.key === "Enter" && code.length >= 4 && submit()}
        className="w-56 rounded-2xl bg-[var(--section)] px-4 py-3 text-center text-[20px] font-semibold tracking-[0.4em] outline-none shadow-sm placeholder:text-[var(--text-tertiary)]"
      />
      {error && <p className="text-[12px] text-[var(--danger)]">Incorrect PIN, try again</p>}
      <button onClick={onSkip} className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
        Skip for now
      </button>
    </motion.div>
  );
}