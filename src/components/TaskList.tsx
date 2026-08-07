import { AnimatePresence, motion } from "motion/react";
import { Search, X, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { TaskRow } from "./TaskRow";
import { api } from "../lib/api";
import { todayLabel, addDays, todayIso } from "../lib/format";
import { EmptyState } from "./EmptyState";

export function TaskList() {
  const tasks = useStore((s) => s.tasks);
  const view = useStore((s) => s.view);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const refreshTasks = useStore((s) => s.refreshTasks);
  const dragFrom = useRef<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const subtitle = useMemo(() => {
    if (search) return `${tasks.length} result${tasks.length === 1 ? "" : "s"} for “${search}”`;
    switch (view.kind) {
      case "today":
        return todayLabel();
      case "7days":
        return `${todayLabel()} – ${addDays(todayIso(), 6)}`;
      case "overdue":
        return "Past due and still open";
      case "all":
      case "list":
        return `${tasks.length} open task${tasks.length === 1 ? "" : "s"}`;
      default:
        return "";
    }
  }, [view, tasks.length, search]);

  async function handleDrop(e: React.DragEvent, targetId: number) {
    e.preventDefault();
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from == null || from === targetId) return;
    const next = [...tasks];
    const fromIdx = next.findIndex((t) => t.id === from);
    const toIdx = next.findIndex((t) => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    await api.reorderTasks(next.filter((t) => !t.completed).map((t) => t.id));
    await refreshTasks();
  }

  async function add() {
    const title = draft.trim();
    if (!title) return;
    const listId = view.kind === "list" ? view.listId : null;
    await api.createTask({
      listId,
      title,
      notes: "",
      priority: 0,
      dueDate: view.kind === "today" ? todayIso() : null,
      dueTime: null,
      remindAt: null,
      repeat: "",
    });
    setDraft("");
    setAdding(false);
    await refreshTasks();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-2 pt-4">
        <div className="px-2">
          <h1 className="text-[30px] font-bold leading-none tracking-tight">{view.title}</h1>
          <p className="mt-1.5 text-[13px] text-[var(--text-secondary)]">{subtitle}</p>
        </div>
        <div className="px-2 pt-4">
          <SearchBar value={search} onChange={setSearch} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 pt-2">
        <AnimatePresence mode="popLayout">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onDragStart={(e, id) => {
                dragFrom.current = id;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDrop={handleDrop}
            />
          ))}
        </AnimatePresence>
        {tasks.length === 0 && <EmptyState kind={view.kind} />}
      </div>

      <div className="shrink-0 px-4 pb-4 pt-1">
        {!adding ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-[14px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--section-alt)] hover:text-[var(--accent)]"
          >
            <Plus size={18} />
            Quick Add Task…
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="flex items-center gap-2 rounded-2xl bg-[var(--section)] p-2 shadow-sm"
          >
            <Plus size={17} className="ml-1 text-[var(--accent)]" />
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              onBlur={() => {
                setTimeout(() => {
                  setAdding(false);
                  setDraft("");
                }, 120);
              }}
              placeholder={view.kind === "today" ? "Add a task for today" : "Add a task…"}
              className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-tertiary)]"
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-[var(--section-alt)] px-3 py-2 transition-shadow focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)]">
      <Search size={15} className="shrink-0 text-[var(--text-tertiary)]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search tasks"
        className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-tertiary)]"
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search" className="text-[var(--text-tertiary)]">
          <X size={14} />
        </button>
      )}
    </div>
  );
}