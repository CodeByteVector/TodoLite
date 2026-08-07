import { motion } from "motion/react";
import { GripVertical, Repeat } from "lucide-react";
import { useRef } from "react";
import type { Task } from "../types";
import { useStore } from "../store";
import { api } from "../lib/api";
import { useConfetti } from "../lib/confetti";
import { CheckCircle } from "./ui";
import { formatDateLabel, isOverdue, todayIso } from "../lib/format";

export function TaskRow({
  task,
  onDragStart,
  onDrop,
  index,
}: {
  task: Task;
  onDragStart?: (e: React.DragEvent, id: number) => void;
  onDrop?: (e: React.DragEvent, targetId: number) => void;
  index?: number;
}) {
  const openTask = useStore((s) => s.openTask);
  const refreshTasks = useStore((s) => s.refreshTasks);
  const rowRef = useRef<HTMLDivElement>(null);

  const subTotal = task.subtasks.length;
  const subDone = task.subtasks.filter((s) => s.completed).length;

  async function toggle() {
    const wasCompleted = task.completed;
    await api.toggleTask(task.id);
    await refreshTasks();
    if (!wasCompleted) {
      const rect = rowRef.current?.getBoundingClientRect();
      useConfetti.getState().celebrate(
        rect ? rect.left + rect.width / 2 : undefined,
        rect ? rect.top + rect.height / 2 : undefined,
      );
    }
  }

  const overdue = isOverdue(task);
  const dueLabel =
    task.dueDate && !task.completed
      ? `${formatDateLabel(task.dueDate)}${task.dueTime ? ` · ${task.dueTime}` : ""}`
      : task.dueDate
        ? formatDateLabel(task.dueDate)
        : null;

  const dueColor = overdue
    ? "var(--danger)"
    : task.dueDate === todayIso() && task.dueDate
      ? "var(--accent)"
      : "var(--text-secondary)";
  const canDrag = index !== undefined && !task.completed;

  return (
    <motion.div
      layout="position"
      data-ctx="task"
      data-task-id={task.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ layout: { type: "spring", stiffness: 500, damping: 40 }, opacity: { duration: 0.25 }, y: { duration: 0.25, delay: index ? index * 0.025 : 0 } }}
    >
      <div
        ref={rowRef}
        draggable={canDrag}
        onDragStart={onDragStart ? (e: React.DragEvent) => onDragStart(e, task.id) : undefined}
        onDragOver={(e: React.DragEvent) => {
          if (onDrop) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={onDrop ? (e: React.DragEvent) => onDrop(e, task.id) : undefined}
        onClick={() => openTask(task)}
        className="group relative flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-150 hover:bg-[var(--section-alt)]"
      >
        {canDrag && (
          <span className="mt-1 opacity-0 transition-opacity group-hover:opacity-60 text-[var(--text-tertiary)]">
            <GripVertical size={14} />
          </span>
        )}
        <CheckCircle checked={task.completed} onToggle={toggle} color={priorityColor(task.priority)} />
        <div className="min-w-0 flex-1">
          <p
            className={`text-[14px] leading-snug transition-all duration-300 ${
              task.completed ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text)]"
            }`}
          >
            {task.title}
          </p>
          {(dueLabel || subTotal > 0 || task.tags.length > 0 || task.repeat || task.remindAt) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {dueLabel && (
                <span className="text-[11.5px] font-medium" style={{ color: dueColor }}>
                  {overdue && "● "}
                  {dueLabel}
                </span>
              )}
              {task.repeat && !task.completed && (
                <span className="flex items-center gap-0.5 text-[11px] text-[var(--text-tertiary)]">
                  <Repeat size={10} /> {task.repeat.toLowerCase()}
                </span>
              )}
              {subTotal > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                  <span
                    className="flex h-[13px] w-[13px] items-center justify-center rounded-[3px] text-[8px] font-bold text-white"
                    style={{ background: subDone === subTotal ? "#30d158" : "var(--text-tertiary)" }}
                  >
                    ✓
                  </span>
                  {subDone}/{subTotal}
                </span>
              )}
              {task.tags.slice(0, 3).map((t) => (
                <span
                  key={t.id}
                  className="rounded-full px-1.5 py-[1px] text-[10.5px] font-medium"
                  style={{ background: `color-mix(in srgb, ${t.color} 16%, transparent)`, color: t.color }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function priorityColor(p: number): string | undefined {
  switch (p) {
    case 1:
      return "#30d158";
    case 2:
      return "#ff9f0a";
    case 3:
      return "#ff3b30";
    default:
      return undefined;
  }
}