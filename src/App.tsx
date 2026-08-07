import { useEffect, useState } from "react";
import { initTheme } from "./lib/theme";
import { useStore } from "./store";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { TaskList } from "./components/TaskList";
import { StatsView } from "./components/StatsView";
import { SettingsView } from "./components/SettingsView";
import { TaskSheet } from "./components/TaskSheet";
import { LockScreen } from "./components/LockScreen";
import { api } from "./lib/api";

import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";

initTheme();

export default function App() {
  const ready = useStore((s) => s.ready);
  const bootstrap = useStore((s) => s.bootstrap);
  const selectedTask = useStore((s) => s.selectedTask);
  const openTask = useStore((s) => s.openTask);
  const viewKind = useStore((s) => s.view.kind);
  const [pinHash, setPinHash] = useState("");
  const [checkedPin, setCheckedPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    (async () => {
      const hash = await api.getSetting("pin_hash").catch(() => null);
      setPinHash(hash || "");
      setCheckedPin(true);
      if (!hash) setUnlocked(true);
      const settings = useStore.getState().settings;
      if (settings["notifications"] !== "false") {
        const granted = await isPermissionGranted().catch(() => false);
        if (!granted) {
          await requestPermission().catch(() => {});
        }
      }
    })();
  }, []);

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

  return (
    <div className="flex h-screen flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 pt-2">{renderView()}</main>
      </div>

      <TaskSheet task={selectedTask} onClose={() => openTask(null)} />

      {ready && checkedPin && pinHash && !unlocked && (
        <LockScreen
          hash={pinHash}
          onUnlock={() => setUnlocked(true)}
          onSkip={() => setUnlocked(true)}
        />
      )}
    </div>
  );
}