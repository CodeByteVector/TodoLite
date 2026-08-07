// Shared data types mirroring the Rust DTOs.

export interface SubTask {
  id: number;
  title: string;
  completed: boolean;
  sortOrder: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Task {
  id: number;
  listId: number | null;
  title: string;
  notes: string;
  priority: number; // 0 none, 1 low, 2 medium, 3 high
  dueDate: string | null; // YYYY-MM-DD
  dueTime: string | null; // HH:MM
  remindAt: string | null; // "YYYY-MM-DD HH:MM"
  repeat: string; // "" | DAILY | WEEKLY | MONTHLY | YEARLY
  completed: boolean;
  completedAt: string | null;
  sortOrder: number;
  subtasks: SubTask[];
  tags: Tag[];
}

export interface TaskList {
  id: number;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  total: number;
  open: number;
  overdue: number;
  today: number;
}

export interface DayCount {
  day: string;
  done: number;
  created: number;
}

export interface PerList {
  name: string;
  color: string;
  total: number;
  done: number;
  doneRate: number;
}

export interface Stats {
  open: number;
  done: number;
  overdue: number;
  todayDone: number;
  todayOpen: number;
  day: DayCount[];
  streak: number;
  bestStreak: number;
  perList: PerList[];
  totalCompletedAllTime: number;
}

export type ViewFilter = "today" | "planned" | "overdue" | "7days" | "all" | "list";
export type AppView = ViewFilter | "stats" | "settings";

export interface ViewState {
  kind: AppView;
  listId: number | null;
  title: string;
}

export const PRIORITIES = [
  { value: 0, label: "None", color: "transparent" },
  { value: 1, label: "Low", color: "#30d158" },
  { value: 2, label: "Medium", color: "#ff9f0a" },
  { value: 3, label: "High", color: "#ff3b30" },
];

export const REPEAT_OPTIONS = [
  { value: "", label: "Does not repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

export const ACCENTS = [
  { name: "Blue", value: "#0A84FF" },
  { name: "Purple", value: "#5E5CE6" },
  { name: "Pink", value: "#FF2D55" },
  { name: "Red", value: "#FF3B30" },
  { name: "Orange", value: "#FF9F0A" },
  { name: "Yellow", value: "#FFD60A" },
  { name: "Green", value: "#30D158" },
  { name: "Teal", value: "#64D2FF" },
  { name: "Graphite", value: "#636366" },
];

export const ICON_OPTIONS = [
  "inbox",
  "briefcase",
  "user",
  "star",
  "heart",
  "book",
  "shopping-cart",
  "plane",
  "dumbbell",
  "home",
  "sprout",
  "code",
  "graduation-cap",
  "car",
  "gamepad",
  "music",
  "palette",
  "coffee",
  "idea",
  "list",
];