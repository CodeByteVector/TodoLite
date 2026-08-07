import { motion } from "motion/react";
import {
  CalendarDays,
  CalendarRange,
  Layers,
  Plus,
  Settings,
  Moon,
  Sun,
  Check,
  ChartNoAxesColumn,
} from "lucide-react";
import { useState } from "react";
import { useStore } from "../store";
import type { ViewState } from "../types";
import { initTheme, getTheme, setTheme, type ThemeMode } from "../lib/theme";
import { api } from "../lib/api";
import { iconMap } from "../lib/icons";

function NavItem({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      layout
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-colors duration-150 ${
        active ? "accent-soft" : "hover:bg-[var(--separator)]"
      }`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 ${
          active ? "accent-fill scale-105 rounded-full" : ""
        }`}
      >
        <span className={active ? "text-white" : "text-[var(--text-secondary)]"}>{icon}</span>
      </span>
      <span className={`flex-1 text-[13.5px] font-medium ${active ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
        {label}
      </span>
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-[var(--section-alt)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
          {badge}
        </span>
      )}
    </motion.button>
  );
}

export function Sidebar() {
  const lists = useStore((s) => s.lists);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const stats = useStore((s) => s.stats);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const overdueCount = lists.reduce((a, l) => a + l.overdue, 0);
  const todayCount = lists.reduce((a, l) => a + l.today, 0);

  const go = (kind: ViewState["kind"], listId: number | null = null, title = "") => {
    setView({ kind, listId, title });
  };

  const isActive = (kind: ViewState["kind"], listId?: number | null) =>
    view.kind === kind && (kind !== "list" || view.listId === listId);

  async function addList() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await api.createList(trimmed, "list", "#5E5CE6");
    await useStore.getState().refreshLists();
    setName("");
    setAdding(false);
  }

  async function cycleTheme() {
    const t = getTheme();
    const next: ThemeMode = t === "dark" ? "light" : t === "light" ? "system" : "dark";
    setTheme(next);
    initTheme();
  }

  return (
    <div className="flex h-full w-[248px] shrink-0 flex-col justify-between py-3 pl-3">
      <div className="flex-1 overflow-y-auto pr-1">
        <p className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          My Tasks
        </p>
        <nav className="space-y-0.5">
          <NavItem
            icon={<CalendarDays size={16} />}
            label="Today"
            badge={todayCount}
            active={isActive("today")}
            onClick={() => go("today")}
          />
          <NavItem
            icon={<CalendarRange size={16} />}
            label="Upcoming (7 days)"
            active={isActive("7days")}
            onClick={() => go("7days")}
          />
          <NavItem
            icon={<AlertIcon />}
            label="Overdue"
            badge={overdueCount}
            active={isActive("overdue")}
            onClick={() => go("overdue")}
          />
          <NavItem
            icon={<Layers size={16} />}
            label="All Tasks"
            active={isActive("all")}
            onClick={() => go("all")}
          />
        </nav>

        <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Lists
        </p>
        <nav className="space-y-0.5">
          {lists.map((l) => (
            <NavItem
              key={l.id}
              icon={<ListIcon name={l.icon} color={l.color} />}
              label={l.name}
              badge={l.overdue > 0 ? l.overdue : l.open > 0 ? l.open : undefined}
              active={isActive("list", l.id)}
              onClick={() => go("list", l.id, l.name)}
            />
          ))}
        </nav>

        <div className="px-2 pt-1">
          {!adding ? (
            <button
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[13.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--separator)] hover:text-[var(--accent)]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--accent)]">
                <Plus size={17} />
              </span>
              New List
            </button>
          ) : (
            <div className="mx-2 mt-1 flex items-center gap-1 rounded-2xl bg-[var(--section)] p-1.5 shadow-sm">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addList()}
                onBlur={() => !name.trim() && setAdding(false)}
                placeholder="List name"
                className="flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-[var(--text-tertiary)]"
              />
              <button
                onClick={addList}
                className="flex h-7 w-7 items-center justify-center rounded-lg accent-fill"
                aria-label="Create list"
              >
                <Check size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-0.5 pr-1">
        <NavItem
          icon={<ChartNoAxesColumn size={17} />}
          label="Statistics"
          active={view.kind === "stats"}
          onClick={() => setView({ kind: "stats", listId: null, title: "Statistics" })}
        />
        <NavItem
          icon={<Settings size={17} />}
          label="Settings"
          active={view.kind === "settings"}
          onClick={() => setView({ kind: "settings", listId: null, title: "Settings" })}
        />
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-[12px] text-[var(--text-tertiary)]">
            {stats?.streak != null && stats.streak > 0 ? `🔥 ${stats.streak} day streak` : "TodoLite"}
          </span>
          <button
            onClick={cycleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--separator)]"
            aria-label="Toggle theme"
          >
            {getTheme() === "dark" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertIcon() {
  return (
    <span className="flex h-[17px] w-[17px] items-center justify-center rounded-full bg-[var(--warning)] text-white">
      <span className="text-[10px] font-bold leading-none">!</span>
    </span>
  );
}

function ListIcon({ name, color }: { name: string; color: string }) {
  const IconComp = iconMap[name] || iconMap["list"];
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: color }}>
      <IconComp size={16} />
    </span>
  );
}