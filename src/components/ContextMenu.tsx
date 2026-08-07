import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { TriangleAlert } from "lucide-react";
import { useMenu } from "../lib/menu";

export function ContextMenu() {
  const menu = useMenu((s) => s.menu);
  const close = useMenu((s) => s.closeMenu);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
        setConfirmIdx(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        setConfirmIdx(null);
      }
    };
const onBlur = () => {
      close();
      setConfirmIdx(null);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [menu, close]);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.max(6, Math.min(menu.x, window.innerWidth - r.width - 10)),
      y: Math.max(6, Math.min(menu.y, window.innerHeight - r.height - 10)),
    });
    setConfirmIdx(null);
  }, [menu]);

  if (!menu) return null;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.94, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[120] min-w-52 max-w-64 overflow-hidden rounded-lg border border-[var(--separator)] bg-[var(--section)] p-1 shadow-2xl"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {menu.items.map((it, i) => {
        const confirming = confirmIdx === i;
        return (
          <button
            key={i}
            onMouseEnter={() => confirming || setConfirmIdx(null)}
            onClick={async (e) => {
              e.stopPropagation();
              if (it.confirm && !confirming) {
                setConfirmIdx(i);
                return;
              }
              close();
              setConfirmIdx(null);
              try {
                await it.action();
              } catch {
                /* ignore */
              }
            }}
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${
              confirming
                ? "text-white"
                : it.danger
                  ? "text-[var(--danger)] hover:bg-[var(--danger)]/10"
                  : "text-[var(--text)] hover:bg-[var(--section-alt)]"
            } ${confirming ? "bg-[var(--danger)]" : ""}`}
          >
            <span className="flex w-4 items-center justify-center">
              {confirming ? <TriangleAlert size={14} /> : it.icon}
            </span>
            <span className="flex-1 leading-snug">
              {confirming ? it.confirm : it.label}
            </span>
            {it.confirm && (
              <span className={`text-[10px] ${it.danger ? "opacity-70" : "text-[var(--text-tertiary)]"}`}>
                {confirming ? "again to confirm" : ""}
              </span>
            )}
          </button>
        );
      })}
    </motion.div>
  );
}