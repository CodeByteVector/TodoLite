import { motion } from "motion/react";
import { CalendarDays, CalendarRange, Inbox, ListChecks, SearchX } from "lucide-react";
import type { ViewState } from "../types";

export function EmptyState({ kind }: { kind: ViewState["kind"] }) {
  const map: Record<string, { icon: React.ReactNode; title: string; sub: string }> = {
    today: {
      icon: <CalendarDays size={30} />,
      title: "Nothing due today",
      sub: "Enjoy the calm — or add something with Quick Add below.",
    },
    "7days": {
      icon: <CalendarRange size={30} />,
      title: "No tasks in the next 7 days",
      sub: "Plan ahead and add a due date to see tasks here.",
    },
    overdue: {
      icon: <CalendarDays size={30} />,
      title: "Nothing overdue",
      sub: "You're all caught up. Nice work!",
    },
    all: {
      icon: <ListChecks size={30} />,
      title: "No open tasks",
      sub: "Everything is done. Add your next task below.",
    },
    list: {
      icon: <Inbox size={30} />,
      title: "This list is empty",
      sub: "Add your first task with Quick Add below.",
    },
  };
  const m = map[kind] || map.all;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center"
    >
      <div className="accent-soft flex h-16 w-16 items-center justify-center rounded-full text-[var(--accent)]">
        {m.icon}
      </div>
      <div>
        <p className="text-[16px] font-semibold">{m.title}</p>
        <p className="mx-auto mt-1 max-w-[300px] text-[13px] text-[var(--text-secondary)]">{m.sub}</p>
      </div>
    </motion.div>
  );
}

export function SearchEmpty({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center">
      <div className="accent-soft flex h-16 w-16 items-center justify-center rounded-full text-[var(--accent)]">
        <SearchX size={30} />
      </div>
      <div>
        <p className="text-[16px] font-semibold">No results for “{query}”</p>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">Try a different keyword.</p>
      </div>
    </div>
  );
}