import { invoke } from "@tauri-apps/api/core";
import type { Stats, SubTask, Tag, Task, TaskList } from "../types";

export const api = {
  getLists: () => invoke<TaskList[]>("get_lists"),
  listTasks: (filter: string, listId: number | null, search: string) =>
    invoke<Task[]>("list_tasks", { filter, listId, search }),
  getStats: () => invoke<Stats>("get_stats"),

  createList: (name: string, icon: string, color: string) =>
    invoke<TaskList[]>("create_list", { name, icon, color }),
  updateList: (id: number, name: string, icon: string, color: string) =>
    invoke("update_list", { id, name, icon, color }),
  deleteList: (id: number) => invoke("delete_list", { id }),
  reorderLists: (ids: number[]) => invoke("reorder_lists", { ids }),

  createTask: (t: {
    listId: number | null;
    title: string;
    notes: string;
    priority: number;
    dueDate: string | null;
    dueTime: string | null;
    remindAt: string | null;
    repeat: string;
  }) =>
    invoke<Task>("create_task", {
      listId: t.listId,
      title: t.title,
      notes: t.notes,
      priority: t.priority,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      remindAt: t.remindAt,
      repeat: t.repeat,
    }),
  updateTask: (id: number, data: {
    listId: number | null;
    title: string;
    notes: string;
    priority: number;
    dueDate: string | null;
    dueTime: string | null;
    remindAt: string | null;
    repeat: string;
  }) =>
    invoke<Task>("update_task", {
      id,
      ...data,
    }),
  deleteTask: (id: number) => invoke("delete_task", { id }),
  toggleTask: (id: number) => invoke<Task>("toggle_task", { id }),
  reorderTasks: (ids: number[]) => invoke("reorder_tasks", { ids }),

  saveSubtasks: (taskId: number, items: Array<{ id: number | null; title: string; completed: boolean }>) =>
    invoke<SubTask[]>("save_subtasks", { taskId, items }),

  getTags: () => invoke<Tag[]>("get_tags"),
  createTag: (name: string, color: string) => invoke<Tag>("create_tag", { name, color }),
  setTaskTags: (taskId: number, tagIds: number[]) => invoke("set_task_tags", { taskId, tagIds }),

  getSettings: () => invoke<Record<string, string>>("get_settings"),
  getSetting: (key: string) => invoke<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) => invoke("set_setting", { key, value }),

  autostartEnabled: () => invoke<boolean>("autostart_is_enabled"),
  autostartSet: (enabled: boolean) => invoke("autostart_set", { enabled }),

  getStatus: () => invoke<{ locked: boolean; pinConfigured: boolean }>("get_status"),
  unlock: (pin: string) => invoke("unlock", { pin }),
  setPin: (current: string | null, pin: string) => invoke("set_pin", { current, newPin: pin }),
  removePin: (current: string) => invoke("remove_pin", { current }),
};