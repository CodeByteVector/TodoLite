import { create } from "zustand";
import { api } from "./lib/api";
import type { Stats, Tag, Task, TaskList, ViewState } from "./types";

interface StoreState {
  ready: boolean;
  dataVisible: boolean;
  lists: TaskList[];
  tasks: Task[];
  tags: Tag[];
  stats: Stats | null;
  settings: Record<string, string>;
  view: ViewState;
  search: string;
  selectedTask: Task | null;

  bootstrap: () => Promise<void>;
  refreshLists: () => Promise<void>;
  refreshTags: () => Promise<void>;
  refreshTasks: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshSettings: () => Promise<void>;

  hideData: () => void;

  setView: (v: ViewState) => void;
  setSearch: (s: string) => void;
  openTask: (t: Task | null) => void;
}

function filterFor(view: ViewState): string {
  return view.kind === "list" ? "" : view.kind;
}

function titleFor(view: ViewState): string {
  if (view.kind === "list") return view.title || "Tasks";
  switch (view.kind) {
    case "today":
      return "Today";
    case "planned":
      return "Planned";
    case "overdue":
      return "Overdue";
    case "7days":
      return "Next 7 Days";
    case "all":
      return "All Tasks";
    default:
      return "Tasks";
  }
}

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  dataVisible: true,
  lists: [],
  tasks: [],
  tags: [],
  stats: null,
  settings: {},
  view: { kind: "today", listId: null, title: "Today" },
  search: "",
  selectedTask: null,

  bootstrap: async () => {
    const [lists, tags, settings, stats] = await Promise.all([
      api.getLists(),
      api.getTags(),
      api.getSettings(),
      api.getStats().catch(() => null),
    ]);
    const view = get().view;
    const tasks = await api.listTasks(filterFor(view), view.listId, "").catch(() => []);
    set({
      ready: true,
      lists,
      tags,
      settings,
      stats,
      tasks,
      view: { ...view, title: titleFor(view) },
    });
  },

  refreshLists: async () => {
    if (!get().dataVisible) {
      set({ lists: [] });
      return;
    }
    const lists = await api.getLists();
    set({ lists });
  },

  refreshTags: async () => {
    if (!get().dataVisible) {
      set({ tags: [] });
      return;
    }
    const tags = await api.getTags();
    set({ tags });
  },

  refreshTasks: async () => {
    if (!get().dataVisible) {
      set({ tasks: [] });
      return;
    }
    const { view, search } = get();
    const filter = filterFor(view);
    const listId = view.kind === "list" ? view.listId : null;
    const tasks = await api.listTasks(filter, listId, search);
    set({ tasks });
  },

  refreshStats: async () => {
    if (!get().dataVisible) {
      set({ stats: null });
      return;
    }
    const stats = await api.getStats();
    set({ stats });
  },

  refreshSettings: async () => {
    const settings = await api.getSettings();
    set({ settings });
  },

  hideData: () => {
    set({
      dataVisible: false,
      tasks: [],
      lists: [],
      tags: [],
      stats: null,
      selectedTask: null,
      search: "",
    });
  },

  setView: (v) => {
    set({ view: { ...v, title: titleFor(v) } });
    void get().refreshTasks();
  },

  setSearch: (s) => {
    set({ search: s });
    void get().refreshTasks();
  },

  openTask: (t) => set({ selectedTask: t }),
}));