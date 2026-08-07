import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { todayIso, addDays } from "../lib/format";

/** iOS-style bottom sheet with backdrop */
export function Sheet({
  open,
  onClose,
  children,
  title,
  nav,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  nav?: ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[55]" aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
        <div
          className={`pointer-events-auto w-full max-w-[620px] overflow-hidden rounded-[1.4rem] bg-[var(--section)] shadow-2xl transition-transform duration-300 ease-out ${
            open ? "translate-y-0" : "translate-y-[110%]"
          }`}
        >
          {title != null && (
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--section-alt)] text-[var(--text-secondary)] active:scale-90 transition-transform"
              >
                <X size={15} />
              </button>
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <span className="flex h-8 w-8 items-center justify-center">{nav}</span>
            </div>
          )}
          <div className="max-h-[78vh] overflow-y-auto pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Simple options picker shown as a nested sheet */
export function OptionsSheet({
  open,
  title,
  options,
  value,
  onSelect,
  onClose,
  extras,
  allowEmpty,
  emptyLabel = "None",
}: {
  open: boolean;
  title: string;
  options: Array<{ value: string; label: string; color?: string }>;
  value?: string | null;
  onSelect: (v: string) => void;
  onClose: () => void;
  extras?: ReactNode;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const all = [
    ...(allowEmpty ? [{ value: "", label: emptyLabel }] : []),
    ...options,
  ];
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="px-5 pt-2">
        <div className="card overflow-hidden">
          {all.map((o, i) => {
            const selected = o.value === (value ?? "");
            return (
              <button
                key={o.value}
                onClick={() => {
                  onSelect(o.value);
                  onClose();
                }}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14.5px] transition-colors ${
                  i > 0 ? "border-t border-[var(--separator)]" : ""
                } ${selected ? "font-medium" : ""}`}
                style={selected ? { color: "var(--accent)" } : {}}
              >
                <span className="flex items-center gap-2.5">
                  {o.color && <span className="h-3 w-3 rounded-full" style={{ background: o.color }} />}
                  {o.label}
                </span>
                {selected && <span className="text-[var(--accent)]">✓</span>}
              </button>
            );
          })}
        </div>
        {extras}
      </div>
    </Sheet>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoOf(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Calendar date picker */
export function DatePickerSheet({
  open,
  onClose,
  onPick,
  value,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (iso: string) => void;
  value: string | null;
}) {
  const now = new Date();
  const [cur, setCur] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() });
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const nav = (dir: number) => {
    setCur((c) => {
      const d = new Date(c.y, c.m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const pickAndClose = (v: string) => {
    onPick(v);
    onClose();
  };

  const firstDow = new Date(cur.y, cur.m, 1).getDay();
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthLabel = new Date(cur.y, cur.m).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <Sheet open={open} onClose={onClose} title="Due date">
      <div className="px-5 pt-2">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => nav(-1)}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--section-alt)]"
          >
            ‹
          </button>
          <p className="text-[14px] font-semibold">{monthLabel}</p>
          <button
            onClick={() => nav(1)}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--section-alt)]"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-[var(--text-tertiary)]">
          {dayNames.map((d) => (
            <span key={d} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 text-center">
          {rows.flat().map((d, i) =>
            d == null ? (
              <span key={`e${i}`} />
            ) : (
              <motion.button
                key={`${cur.y}-${cur.m}-${d}`}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  onPick(isoOf(cur.y, cur.m, d));
                  onClose();
                }}
                className={`mx-auto my-0.5 flex h-9 w-9 items-center justify-center rounded-full text-[13px] transition-colors ${
                  isoOf(cur.y, cur.m, d) === value
                    ? "accent-fill font-semibold"
                    : isoOf(cur.y, cur.m, d) === todayIso()
                      ? "font-semibold text-[var(--accent)]"
                      : isoOf(cur.y, cur.m, d) < todayIso()
                        ? "text-[var(--text-tertiary)]"
                        : "text-[var(--text)] hover:bg-[var(--section-alt)]"
                }`}
              >
                {d}
              </motion.button>
            ),
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <QuickBtn label="Today" active={value === todayIso()} onClick={() => pickAndClose(todayIso())} />
          <QuickBtn label="Tomorrow" active={value === addDays(todayIso(), 1)} onClick={() => pickAndClose(addDays(todayIso(), 1))} />
          <QuickBtn label="No date" active={value === null} onClick={() => pickAndClose("")} />
        </div>
      </div>
    </Sheet>
  );
}

/** Time picker */
export function TimePickerSheet({
  open,
  onClose,
  onPick,
  value,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (t: string) => void;
  value: string | null;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  return (
    <Sheet open={open} onClose={onClose} title="Select time">
      <div className="px-5 pt-2">
        <div className="max-h-[38vh] overflow-y-auto rounded-2xl">
          {hours.map((h) => (
            <div key={h} className="flex items-center border-b border-[var(--separator)] last:border-none">
              <div className="w-12 py-1 text-right font-mono text-[12px] text-[var(--text-secondary)]">{h}:00</div>
              <div className="flex flex-wrap gap-1 py-1">
                {["00", "15", "30", "45"].map((m) => {
                  const t = `${h}:${m}`;
                  const sel = value === t;
                  return (
                    <button
                      key={m}
                      onClick={() => {
                        onPick(t);
                        onClose();
                      }}
                      className={`rounded-full px-2.5 py-1 font-mono text-[12px] transition-colors ${
                        sel ? "accent-fill" : "text-[var(--text)] hover:bg-[var(--section-alt)]"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            onPick("");
            onClose();
          }}
          className="mt-3 w-full rounded-full bg-[var(--danger)]/10 py-2 text-[13px] font-medium text-[var(--danger)]"
        >
          Clear time
        </button>
      </div>
    </Sheet>
  );
}

function QuickBtn({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-full py-2 text-[13px] font-medium transition-colors ${
        active ? "accent-fill" : "bg-[var(--section-alt)] text-[var(--text-secondary)]"
      }`}
    >
      {label}
    </button>
  );
}