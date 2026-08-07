import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Clipboard,
  Check,
  ChartNoAxesColumn,
  Copy,
  FilePlus2,
  Pencil,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";
import { initTheme } from "./lib/theme";
import { useStore } from "./store";
import { api } from "./lib/api";
import { useMenu, type CtxItem } from "./lib/menu";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { TaskList } from "./components/TaskList";
import { StatsView } from "./components/StatsView";
import { SettingsView } from "./components/SettingsView";
import { TaskSheet } from "./components/TaskSheet";
import { SplashScreen } from "./components/SplashScreen";
import { LockScreen } from "./components/LockScreen";
import { ContextMenu } from "./components/ContextMenu";
import { Confetti } from "./components/Confetti";
import { ErrorBoundary } from "./components/ErrorBoundary";
import type { Task } from "./types";

import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

initTheme();

async function requestNotifPermissionIfEnabled() {
  const settings = useStore.getState().settings;
  if (settings["notifications"] !== "false") {
    const granted = await isPermissionGranted().catch(() => false);
    if (!granted) {
      await requestPermission().catch(() => {});
    }
  }
}

async function duplicateTask(t: Task) {
  const created = await api.createTask({
    listId: t.listId,
    title: t.title,
    notes: t.notes,
    priority: t.priority,
    dueDate: t.dueDate,
    dueTime: t.dueTime,
    remindAt: t.remindAt,
    repeat: t.repeat,
  });
  if (t.subtasks.length > 0) {
    await api.saveSubtasks(
      created.id,
      t.subtasks.map((s) => ({ id: null, title: s.title, completed: s.completed })),
    );
  }
  if (t.tags.length > 0) {
    await api.setTaskTags(created.id, t.tags.map((g) => g.id));
  }
  await useStore.getState().refreshTasks();
}

export default function App() {
  const bootstrap = useStore((s) => s.bootstrap);
  const selectedTask = useStore((s) => s.selectedTask);
  const openTask = useStore((s) => s.openTask);
  const viewKind = useStore((s) => s.view.kind);
  const viewListId = useStore((s) => s.view.listId);
  const [appLocked, setAppLocked] = useState<boolean | null>(null);
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    (async () => {
      const status = await api.getStatus().catch(() => ({ locked: false, pinConfigured: false }));
      if (!status.locked) {
        await bootstrap();
        await requestNotifPermissionIfEnabled();
      }
      setAppLocked(status.locked);
    })();
  }, [bootstrap]);

  function renderView() {
    switch (viewKind) {
      case "stats":
        return <StatsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <TaskList />;
    }
  }

  async function handleContext(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    e.preventDefault();

    const taskEl = target.closest<HTMLElement>("[data-ctx='task']");
    if (taskEl) {
      const id = Number(taskEl.dataset.taskId);
      const task = useStore.getState().tasks.find((t) => t.id === id);
      if (task) {
        const store = useStore.getState();
        const items: CtxItem[] = [
          {
            label: task.completed ? "Reopen task" : "Complete task",
            icon: <Check size={14} />,
            confirm: "",
            action: async () => {
              await api.toggleTask(task.id);
              await store.refreshTasks();
            },
          },
          {
            label: "Edit task",
            icon: <Pencil size={14} />,
            confirm: "",
            action: () => openTask(task),
          },
          {
            label: "Duplicate",
            icon: <Copy size={14} />,
            confirm: "",
            action: () => duplicateTask(task),
          },
          {
            label: "Copy title",
            icon: <Clipboard size={14} />,
            confirm: "",
            action: async () => {
              try {
                await navigator.clipboard.writeText(task.title);
              } catch {
                /* ignore */
              }
            },
          },
          {
            label: "Delete task",
            icon: <Trash2 size={14} />,
            danger: true,
            confirm: `Delete "${task.title.length > 28 ? task.title.slice(0, 28) + "…" : task.title}"?`,
            action: async () => {
              await api.deleteTask(task.id);
              if (useStore.getState().selectedTask?.id === task.id) openTask(null);
              await useStore.getState().refreshTasks();
            },
          },
        ];
        useMenu.getState().openMenu(e.clientX, e.clientY, items);
        return;
      }
    }

    const s = useStore.getState();
    useMenu.getState().openMenu(e.clientX, e.clientY, [
      {
        label: "New Task",
        icon: <FilePlus2 size={14} />,
        confirm: "",
        action: () => s.openTask(null),
      },
      {
        label: "Statistics",
        icon: <ChartNoAxesColumn size={14} />,
        confirm: "",
        action: () => s.setView({ kind: "stats", listId: null, title: "Statistics" }),
      },
      {
        label: "Settings",
        icon: <Settings size={14} />,
        confirm: "",
        action: () => s.setView({ kind: "settings", listId: null, title: "Settings" }),
      },
      {
        label: "Refresh",
        icon: <RefreshCw size={14} />,
        confirm: "",
        action: async () => {
          await Promise.all([s.refreshLists(), s.refreshTags(), s.refreshStats(), s.refreshTasks()]);
        },
      },
    ]);
  }

  return (
    <div className="flex h-screen flex-col" onContextMenu={handleContext}>
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-hidden pt-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${viewKind}-${viewListId ?? ""}`}
              className="h-full"
              initial={{ opacity: 0, x: 46, scale: 0.99 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -46, scale: 0.99 }}
              transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
            >
              <ErrorBoundary>{renderView()}</ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <TaskSheet task={selectedTask} onClose={() => openTask(null)} />
      <ContextMenu />
      <Confetti />

      {splash && <SplashScreen onDone={() => setSplash(false)} />}

      {appLocked === true && (
        <LockScreen
          onUnlock={async (pin) => {
            try {
              await api.unlock(pin);
              setAppLocked(false);
              await useStore.getState().bootstrap();
              await requestNotifPermissionIfEnabled();
              return true;
            } catch {
              return false;
            }
          }}
          onSkip={() => {
            useStore.getState().hideData();
            setAppLocked(false);
          }}
        />
      )}
    </div>
  );
}