import { format, parseISO } from "date-fns";

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

export function todayLabel(): string {
  return format(new Date(), "EEEE, MMMM d");
}

export function formatDateLabel(iso: string): string {
  const today = todayIso();
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  if (iso === addDays(today, -1)) return "Yesterday";
  const d = parseISO(iso);
  const isThisYear = d.getFullYear() === new Date().getFullYear();
  return `${WEEK[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}${isThisYear ? "" : ", " + d.getFullYear()}`;
}

export function shortWeekday(iso: string): string {
  return WEEK[parseISO(iso).getDay()];
}

export function isOverdue(task: { dueDate: string | null; completed: boolean }): boolean {
  return !task.completed && !!task.dueDate && task.dueDate < todayIso();
}

export function isToday(task: { dueDate: string | null }): boolean {
  return task.dueDate != null && task.dueDate === todayIso();
}

/** Compute an absolute "YYYY-MM-DD HH:MM" reminder timestamp. */
export function computeRemindAt(
  dueDate: string | null | undefined,
  dueTime: string | null | undefined,
  minutesBefore: number,
): string | null {
  if (!dueDate) return null;
  const time = dueTime || "09:00";
  const [hh, mm] = time.split(":").map(Number);
  const d = parseISO(dueDate);
  const when = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
  when.setMinutes(when.getMinutes() - minutesBefore);
  return stamp(when);
}

export function stamp(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${dd} ${h}:${mi}`;
}

export function nowStamp(): string {
  return stamp(new Date());
}

export function relativeDue(iso: string): string {
  const diff = Math.round((parseISO(iso).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${-diff} days overdue`;
}

export function parseStamp(s: string): Date {
  const [date, time] = s.split(" ");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (time || "00:00").split(":").map(Number);
  return new Date(y, mo - 1, d, h || 0, mi || 0);
}