import { getCurrentWindow } from "@tauri-apps/api/window";
import { Square, X } from "lucide-react";

export function TitleBar() {
  const win = getCurrentWindow();

  const btn =
    "no-drag flex h-10 w-11 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--separator)] hover:text-[var(--text)] active:bg-black/10";

  return (
    <div className="drag flex h-10 shrink-0 items-center justify-between border-b border-[var(--separator)] px-3 bg-transparent">
      <div className="flex items-center gap-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />
          <span className="text-[13px] font-semibold tracking-tight">TodoLite</span>
        </div>
      </div>
      <div className="flex items-center gap-1 pr-0">
        <button aria-label="Maximize" className={btn} onClick={() => win.toggleMaximize()}>
          <Square size={12} strokeWidth={2.2} />
        </button>
        <button
          aria-label="Close"
          className="no-drag flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--danger)] hover:text-white"
          style={{ marginLeft: 4 }}
          onClick={() => win.close()}
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}