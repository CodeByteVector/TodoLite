import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Calendar,
  Clock,
  AlarmClock,
  Repeat,
  List as ListIcon,
  Flag,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  X,
} from "lucide-react";
import type { Task } from "../types";
import { PRIORITIES, REPEAT_OPTIONS } from "../types";
import { api } from "../lib/api";
import { useStore } from "../store";
import { Sheet, OptionsSheet, DatePickerSheet, TimePickerSheet } from "./Sheet";
import { formatDateLabel, computeRemindAt } from "../lib/format";
import { CheckCircle } from "./ui";

type OpenPicker = null | "list" | "date" | "time" | "repeat" | "priority" | "tags" | "reminder";

const REMINDERS = [
  { value: "at", label: "At due time" },
  { value: "5", label: "5 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
];

export function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const lists = useStore((s) => s.lists);
  const tagsAll = useStore((s) => s.tags);
  const refreshTasks = useStore((s) => s.refreshTasks);
  const refreshLists = useStore((s) => s.refreshLists);

  const isNew = task == null;
  const [title, setTitle] = useState(isNew ? "" : task.title);
  const [notes, setNotes] = useState(isNew ? "" : task.notes);
  const [listId, setListId] = useState<number | null>(isNew ? null : task.listId);
  const [priority, setPriority] = useState(isNew ? 0 : task.priority);
  const [dueDate, setDueDate] = useState<string | null>(isNew ? null : task.dueDate);
  const [dueTime, setDueTime] = useState<string | null>(isNew ? null : task.dueTime);
  const [repeat, setRepeat] = useState(isNew ? "" : task.repeat);
  const [reminderKey, setReminderKey] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<number[]>(isNew ? [] : task.tags.map((t) => t.id));
  const [subs, setSubs] = useState<SubLine[]>(isNew ? [] : task.subtasks.map((s) => ({ ...s, key: s.id })));
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 260);
  }, []);

  const listNameLabel = (): string => {
    const found = lists.find((l) => l.id === listId);
    return found ? found.name : "No list";
  };

  const reminderLabel = () => {
    if (!reminderKey) return null;
    const rem = REMINDERS.find((r) => r.value === reminderKey);
    return rem?.label ?? null;
  };

  async function handleSave() {
    if (busy) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    const remindAt = computeRemindAt(dueDate, dueTime, Number(reminderMinutes() ?? 0));
    const payload = {
      listId,
      title: trimmed,
      notes,
      priority,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      remindAt,
      repeat,
    };
    if (isNew) {
      await api.createTask(payload);
    } else {
      await api.updateTask(task.id, payload);
      await api.saveSubtasks(task.id, subs.map((s) => ({ id: s.id, title: s.title, completed: s.completed })));
      await api.setTaskTags(task.id, tagIds);
    }
    await refreshTasks();
    await refreshLists();
    setBusy(false);
    onClose();
  }

  async function handleDelete() {
    if (!isNew) {
      await api.deleteTask(task.id);
      await refreshTasks();
    }
    onClose();
  }

  function reminderMinutes(): string | null {
    if (!reminderKey) return null;
    if (reminderKey === "at") return "0";
    return reminderKey;
  }

  async function addTag() {
    const name = newTag.trim();
    if (!name) return;
    const created = await api.createTag(name, "#0A84FF");
    await useStore.getState().refreshTags();
    setTagIds((prev) => [...prev, created.id]);
    setNewTag("");
  }

  const metaRow = (icon: React.ReactNode, label: string, sub: string | null, onClick: () => void, color?: string) => (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-[var(--section-alt)] rounded-xl"
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{
          color: color || "var(--text-secondary)",
          background: color ? `color-mix(in srgb, ${color} 14%, transparent)` : "var(--section-alt)",
        }}
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[12px] text-[var(--text-secondary)]">{sub}</span>
      </span>
      <ChevronRight size={15} className="text-[var(--text-tertiary)]" />
    </button>
  );

  return (
    <Sheet
      open={task != null}
      onClose={onClose}
      title={isNew ? "New Task" : "Task Details"}
      nav={
        <button onClick={handleSave} aria-label="Save" className="flex h-8 w-8 items-center justify-center rounded-full accent-fill active:scale-90 transition-transform">
          <Check size={15} />
        </button>
      }
    >
      <div className="px-5 pt-1">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need to do?"
          className="w-full bg-transparent text-[19px] font-semibold outline-none placeholder:text-[var(--text-tertiary)]"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          rows={2}
          className="mt-1 w-full resize-none bg-transparent text-[13.5px] text-[var(--text-secondary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />

        <div className="mt-4 space-y-1">
          {metaRow(
            <ListIcon size={16} />,
            "List",
            listNameLabel(),
            () => setOpenPicker("list"),
          )}
          {metaRow(
            <Flag size={16} />,
            "Priority",
            PRIORITIES[priority].label,
            () => setOpenPicker("priority"),
            PRIORITIES[priority].color !== "transparent" ? PRIORITIES[priority].color : undefined,
          )}
          {metaRow(
            <Calendar size={16} />,
            "Due date",
            dueDate ? formatDateLabel(dueDate) : "None",
            () => setOpenPicker("date"),
            "var(--accent)",
          )}
          {metaRow(
            <Clock size={16} />,
            "Time",
            dueTime || "None",
            () => setOpenPicker("time"),
            "var(--teal)",
          )}
          {metaRow(
            <AlarmClock size={16} />,
            "Remind me",
            reminderLabel(),
            () => setOpenPicker("reminder"),
            "var(--warning)",
          )}
          {metaRow(
            <Repeat size={16} />,
            "Repeat",
            REPEAT_OPTIONS.find((r) => r.value === repeat)?.label ?? "Does not repeat",
            () => setOpenPicker("repeat"),
            "#5E5CE6",
          )}
        </div>

        <div className="mt-4">
          <div className="px-2 pb-1 text-[12px] font-semibold text-[var(--text-tertiary)]">Tags</div>
          <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1">
            {tagsAll.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setTagIds((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                  className="rounded-full px-2.5 py-1 text-[12px] font-medium transition-all"
                  style={
                    on
                      ? { background: t.color, color: "#fff" }
                      : { background: `color-mix(in srgb, ${t.color} 14%, transparent)`, color: t.color }
                  }
                >
                  {t.name}
                </button>
              );
            })}
            {tagsAll.length === 0 && (
              <span className="text-[12px] text-[var(--text-tertiary)]">No tags yet — add one below.</span>
            )}
            <span className="flex items-center gap-1 rounded-full bg-[var(--section-alt)] px-2 py-0.5">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                placeholder="Add tag…"
                className="w-20 bg-transparent text-[12px] outline-none placeholder:text-[var(--text-tertiary)]"
              />
              <button onClick={addTag} aria-label="Add tag" className="text-[var(--accent)]">
                <Plus size={13} />
              </button>
            </span>
          </div>
        </div>

        <div className="mt-4">
          <p className="px-2 pb-1 text-[12px] font-semibold text-[var(--text-tertiary)]">Subtasks</p>
          <div className="space-y-0.5">
            <AnimatePresence initial={false}>
              {subs.map((s) => (
                <motion.div
                  key={s.key}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="group flex items-center gap-2 px-2 py-1.5"
                >
                  <CheckCircle
                    checked={s.completed}
                    onToggle={() => setSubs((p) => p.map((x) => (x.key === s.key ? { ...x, completed: !x.completed } : x)))}
                  />
                  <input
                    value={s.title}
                    onChange={(e) => setSubs((p) => p.map((x) => (x.key === s.key ? { ...x, title: e.target.value } : x)))}
                    className={`flex-1 bg-transparent text-[13.5px] outline-none ${
                      s.completed ? "text-[var(--text-tertiary)] line-through" : "text-[var(--text)]"
                    }`}
                  />
                  <button
                    onClick={() => setSubs((p) => p.filter((x) => x.key !== s.key))}
                    aria-label="Remove subtask"
                    className="text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-dashed border-[var(--text-tertiary)]/50 text-[var(--text-tertiary)]">
                <Plus size={13} />
              </span>
              <button
                onClick={() => setSubs((p) => [...p, { key: Date.now(), id: null, title: "", completed: false }])}
                className="text-[13.5px] text-[var(--text-secondary)]"
              >
                Add subtask
              </button>
            </div>
          </div>
        </div>

        {!isNew && (
          <button
            onClick={handleDelete}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--danger)]/10 py-3 text-[13.5px] font-medium text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/18"
          >
            <Trash2 size={15} />
            Delete Task
          </button>
        )}
      </div>

      <OptionsSheet
        open={openPicker === "list"}
        title="Move to list"
        options={lists.map((l) => ({ value: String(l.id), label: l.name, color: l.color }))}
        value={listId == null ? "" : String(listId)}
        onSelect={(v) => setListId(v ? Number(v) : null)}
        onClose={() => setOpenPicker(null)}
      />
      <OptionsSheet
        open={openPicker === "priority"}
        title="Priority"
        options={PRIORITIES.filter((p) => p.value !== 0).map((p) => ({
          value: String(p.value),
          label: p.label,
          color: p.color,
        }))}
        value={priority ? String(priority) : ""}
        allowEmpty
        onSelect={(v) => setPriority(v ? Number(v) : 0)}
        onClose={() => setOpenPicker(null)}
        emptyLabel="None"
      />
      <OptionsSheet
        open={openPicker === "repeat"}
        title="Repeat"
        options={REPEAT_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
        value={repeat}
        onSelect={(v) => setRepeat(v)}
        onClose={() => setOpenPicker(null)}
      />
      <OptionsSheet
        open={openPicker === "reminder"}
        title="Reminder"
        options={REMINDERS.map((r) => ({ value: r.value, label: r.label }))}
        value={(reminderKey as string) ?? ""}
        onSelect={(v) => setReminderKey(v === "" ? null : v)}
        onClose={() => setOpenPicker(null)}
        allowEmpty
      />
      <DatePickerSheet
        open={openPicker === "date"}
        onClose={() => setOpenPicker(null)}
        value={dueDate}
        onPick={(d) => setDueDate(d || null)}
      />
      <TimePickerSheet
        open={openPicker === "time"}
        onClose={() => setOpenPicker(null)}
        value={dueTime}
        onPick={(t) => setDueTime(t || null)}
      />
    </Sheet>
  );
}

interface SubLine {
  key: number;
  id: number | null;
  title: string;
  completed: boolean;
}