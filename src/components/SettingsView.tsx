import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { appDataDir } from "@tauri-apps/api/path";
import { useStore } from "../store";
import { api } from "../lib/api";
import { getTheme, setTheme as storeTheme, setAccent as storeAccent, type ThemeMode } from "../lib/theme";
import { ACCENTS } from "../types";
import { Switch, Segmented, Row } from "./ui";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const PIN_HASH_KEY = "pin_hash";

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const refreshSettings = useStore((s) => s.refreshSettings);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getTheme());
  const [notif, setNotif] = useState(true);
  const [autostart, setAutostart] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [accent, setAccent] = useState<string | null>(null);

  useEffect(() => {
    const n = settings["notifications"] !== "false";
    setNotif(n);
    void api
      .autostartEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(false));
  }, [settings]);

  useEffect(() => {
    setAccent(localStorage.getItem("todolite.accent") || "#0A84FF");
  }, []);

  const hasPin = !!settings[PIN_HASH_KEY];

  async function toggleNotifications() {
    const next = !notif;
    setNotif(next);
    await api.setSetting("notifications", next ? "true" : "false");
    await refreshSettings();
  }

  async function toggleAutostart() {
    const next = !autostart;
    setAutostart(next);
    await api.autostartSet(next);
  }

  async function savePin() {
    setPinError("");
    setPinMsg("");
    if (!/^\d{4,6}$/.test(pin)) {
      setPinError("Use 4–6 digits.");
      return;
    }
    if (pin !== pin2) {
      setPinError("Codes do not match.");
      return;
    }
    const hash = await sha256(pin);
    await api.setSetting(PIN_HASH_KEY, hash);
    setPin("");
    setPin2("");
    setPinMsg("Lock PIN enabled ✓");
    await refreshSettings();
  }

  async function removePin() {
    await api.setSetting(PIN_HASH_KEY, "");
    setPin("");
    setPin2("");
    setPinMsg("");
    await refreshSettings();
  }

  function pickTheme(m: ThemeMode) {
    setThemeMode(m);
    storeTheme(m);
  }

  function pickAccent(hex: string) {
    storeAccent(hex);
    setAccent(hex);
  }

  async function openDataFolder() {
    const dir = await appDataDir();
    await openPath(dir).catch(() => {});
  }

  return (
    <div className="h-full overflow-y-auto px-2 pb-10 pt-4">
      <h1 className="px-2 text-[30px] font-bold tracking-tight">Settings</h1>

      <SectionTitle>Appearance</SectionTitle>
      <div className="card overflow-hidden">
        <div className="px-4 py-3">
          <p className="pb-2 text-[13px] font-medium">Theme</p>
          <Segmented
            value={themeMode}
            onChange={(v) => pickTheme(v as ThemeMode)}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "Auto" },
            ]}
          />
        </div>
        <div className="px-4 pb-3 pt-1">
          <p className="pb-2 text-[13px] font-medium">Accent color</p>
          <div className="flex items-center gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                aria-label={a.name}
                onClick={() => pickAccent(a.value)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] text-white transition-transform hover:scale-110"
                style={{
                  background: a.value,
                  boxShadow: accent === a.value ? `0 0 0 2px var(--section), 0 0 0 4px ${a.value}` : undefined,
                }}
              >
                {accent === a.value && "✓"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SectionTitle>Notifications</SectionTitle>
      <div className="card overflow-hidden">
        <Row label="Reminder notifications" trailing={<Switch checked={notif} onChange={toggleNotifications} />} />
        <Row label="Launch TodoLite at Windows startup" trailing={<Switch checked={autostart} onChange={toggleAutostart} />} last />
      </div>

      <SectionTitle>Security</SectionTitle>
      <div className="card overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <ShieldCheck size={15} className="text-[var(--active,var(--accent))]" />
              {hasPin ? "App lock enabled" : "App lock (PIN)"}
            </span>
            {hasPin && (
              <button onClick={removePin} className="rounded-full bg-[var(--danger)]/10 px-3 py-1 text-[12px] text-[var(--danger)]">
                Remove PIN
              </button>
            )}
          </div>
          <p className="pb-2 pt-1 text-[11.5px] text-[var(--text-secondary)]">
            TodoLite encrypts every byte on disk with Windows DPAPI – scoped to your Windows account. An optional PIN
            adds a second lock on launch.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              placeholder="New PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-xl bg-[var(--section-alt)] px-3 py-2 text-[13px] outline-none"
            />
            <input
              type="password"
              inputMode="numeric"
              placeholder="Confirm"
              value={pin2}
              onChange={(e) => setPin2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePin()}
              className="w-full rounded-xl bg-[var(--section-alt)] px-3 py-2 text-[13px] outline-none"
            />
            <button onClick={savePin} className="accent-fill rounded-xl px-4 text-[13px] font-semibold">
              Set
            </button>
          </div>
          {pinError && <p className="pt-2 text-[12px] text-[var(--danger)]">{pinError}</p>}
          {pinMsg && <p className="pt-2 text-[12px] text-[var(--warning)]">{pinMsg}</p>}
        </div>
      </div>

      <SectionTitle>Data</SectionTitle>
      <div className="card overflow-hidden">
        <Row label="Storage" trailing={<span>100% local · encrypted (DPAPI)</span>} />
        <Row
          label="Data folder"
          trailing={
            <button onClick={openDataFolder} className="rounded-full bg-[var(--section-alt)] px-3 py-1 text-[12px]">
              Open
            </button>
          }
          last
        />
      </div>

      <SectionTitle>About</SectionTitle>
      <div className="card overflow-hidden">
        <Row label={<span className="font-semibold">TodoLite</span>} trailing={<span>v1.0.0</span>} />
        <Row label="Developer" trailing={<span>CodeByteVector</span>} />
        <Row label="Rights" trailing={<span>© 2026 CodeByteVector</span>} last />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
      {children}
    </p>
  );
}