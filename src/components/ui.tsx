import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";

/** iOS-style switch */
export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${checked ? "accent-fill" : "bg-[var(--text-tertiary)]/40 disabled:opacity-50"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow"
        style={{ left: checked ? "calc(100% - 26px)" : "2px" }}
      />
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  accent,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150 active:scale-90 ${
        accent ? "accent-soft text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--separator)]"
      }`}
    >
      {children}
    </button>
  );
}

/** Circle checkbox used on task rows */
export function CheckCircle({
  checked,
  color,
  onToggle,
  className,
}: {
  checked: boolean;
  color?: string;
  onToggle: () => void;
  className?: string;
}) {
  const stroke = (color as string) || "var(--accent)";
  return (
    <motion.button
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.85 }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={checked ? "Mark as not done" : "Mark as done"}
      className={`relative flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${className || ""}`}
      style={{
        borderColor: checked ? "transparent" : stroke,
        background: checked ? stroke : "transparent",
        color: "#fff",
      }}
    >
      {checked && (
        <motion.span
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          className="flex items-center justify-center"
        >
          <Check size={14} strokeWidth={3.5} />
        </motion.span>
      )}
    </motion.button>
  );
}

/** Small colored dot + label chip */
export function Chip({ text, color, onMouseDown }: { text: string; color?: string; onMouseDown?: (e: ReactMouseEvent) => void }) {
  return (
    <span
      onMouseDown={onMouseDown}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: color ? `color-mix(in srgb, ${color} 15%, transparent)` : "var(--section-alt)",
        color: color || "var(--text-secondary)",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}

export function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-full bg-[var(--section-alt)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`relative rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
            value === o.value ? "text-[var(--text)]" : "text-[var(--text-secondary)]"
          }`}
        >
          {value === o.value && (
            <motion.span
              layoutId="segmented"
              className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-[#3a3a3c]"
            />
          )}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Row used inside grouped iOS-style settings */
export function Row({
  label,
  trailing,
  onMouseDown,
  last,
}: {
  label: ReactNode;
  trailing?: ReactNode;
  onMouseDown?: (e: ReactMouseEvent) => void;
  last?: boolean;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`flex items-center justify-between px-4 py-3 ${last ? "" : "border-b border-[var(--separator)]"}`}
    >
      <span className="text-[14px]">{label}</span>
      <span className="flex items-center gap-2 text-[14px] text-[var(--text-secondary)]">{trailing}</span>
    </div>
  );
}

export function SegmentedGroup({ children }: { children: ReactNode }) {
  return <div className="card overflow-hidden">{children}</div>;
}