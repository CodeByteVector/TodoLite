import { useEffect } from "react";
import { motion } from "motion/react";
import { CalendarCheck2, Flame, TrendingUp, CheckCircle2 } from "lucide-react";
import { useStore } from "../store";
import { ProgressRing } from "./ProgressRing";
import { shortWeekday } from "../lib/format";

export function StatsView() {
  const stats = useStore((s) => s.stats);
  const refreshStats = useStore((s) => s.refreshStats);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  if (!stats) {
    return <div className="p-10 text-center text-[var(--text-secondary)]">Loading statistics…</div>;
  }

  const todayProgress = stats.todayOpen + stats.todayDone > 0 ? stats.todayDone / (stats.todayOpen + stats.todayDone) : 0;
  const maxDay = Math.max(1, ...stats.day.map((d) => d.done));

  return (
    <div className="h-full overflow-y-auto px-2 pb-10 pt-4">
      <h1 className="px-2 text-[30px] font-bold tracking-tight">Statistics</h1>
      <p className="px-2 pt-1 text-[13px] text-[var(--text-secondary)]">Your productivity at a glance</p>

      <div className="mt-5 grid grid-cols-2 gap-3 px-1">
        <div className="card flex flex-col items-center gap-3 p-5">
          <ProgressRing progress={todayProgress}>
            <span className="text-[22px] font-bold leading-none">{stats.todayDone}</span>
            <span className="text-[10px] text-[var(--text-secondary)]">done</span>
          </ProgressRing>
          <div className="text-center">
            <p className="text-[13px] font-semibold">Today</p>
            <p className="text-[11.5px] text-[var(--text-secondary)]">
              {stats.todayOpen} still open{stats.todayDone > 0 ? ` · ${stats.todayDone} completed` : ""}
            </p>
          </div>
        </div>

        <div className="card flex flex-col items-center justify-center gap-3 p-5">
          <ProgressRing progress={stats.streak > 0 ? Math.min(1, stats.streak / 30) : 0} color="#ff9f0a">
            <span className="flex items-center gap-1 text-[22px] font-bold leading-none">
              <Flame size={20} className="text-[#ff9f0a]" />
              {stats.streak}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)]">days</span>
          </ProgressRing>
          <div className="text-center">
            <p className="text-[13px] font-semibold">Current streak</p>
            <p className="text-[11.5px] text-[var(--text-secondary)]">Best: {stats.bestStreak} days</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 px-1">
        <MiniStat icon={<CalendarCheck2 size={16} />} label="Open tasks" value={stats.open} />
        <MiniStat icon={<CheckCircle2 size={16} />} label="Completed" value={stats.done} color="#30d158" />
        <MiniStat icon={<TrendingUp size={16} />} label="Total done" value={stats.totalCompletedAllTime} color="#5E5CE6" />
      </div>

      <div className="card mt-3 p-5">
        <p className="text-[14px] font-semibold">Last 14 days</p>
        <p className="pb-3 text-[11.5px] text-[var(--text-secondary)]">Completed tasks per day</p>
        <div className="flex h-[140px] items-end gap-1.5">
          {stats.day.map((d, i) => (
            <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
              <motion.div
                className="w-full rounded-lg accent-fill-2"
                style={{ background: "var(--accent)", borderRadius: 8 }}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, (d.done / maxDay) * 110)}px` }}
                transition={{ delay: i * 0.02, type: "spring", stiffness: 200, damping: 24 }}
              />
              <span className="text-[9px] text-[var(--text-tertiary)]">{shortWeekday(d.day)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-3 p-5">
        <p className="text-[14px] font-semibold">Completion by list</p>
        <div className="mt-3 space-y-3">
          {stats.perList.map((l) => (
            <div key={l.name}>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                  {l.name}
                </span>
                <span className="text-[var(--text-secondary)]">
                  {l.done}/{l.total} · {Math.round(l.doneRate * 100)}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--section-alt)]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: l.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(l.doneRate * 100)}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />
              </div>
            </div>
          ))}
          {stats.perList.length === 0 && (
            <p className="text-[12.5px] text-[var(--text-tertiary)]">No lists yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 p-4">
      <span style={{ color: color || "var(--accent)" }}>{icon}</span>
      <span className="text-[20px] font-bold leading-none">{value}</span>
      <span className="text-[11px] text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}