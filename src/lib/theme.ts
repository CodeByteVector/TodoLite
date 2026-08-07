import { ACCENTS } from "../types";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "todolite.theme";
const ACCENT_KEY = "todolite.accent";

export function applyAccent(hex: string) {
  document.documentElement.style.setProperty("--accent", hex);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", hex);
}

export function getAccent(): string {
  const saved = localStorage.getItem(ACCENT_KEY);
  if (saved && ACCENTS.some((a) => a.value === saved)) return saved;
  return "#0A84FF";
}

export function setAccent(hex: string) {
  localStorage.setItem(ACCENT_KEY, hex);
  applyAccent(hex);
}

export function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function getTheme(): ThemeMode {
  return (localStorage.getItem(THEME_KEY) as ThemeMode) || "system";
}

export function setTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}

export function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function initTheme() {
  applyAccent(getAccent());
  applyTheme(getTheme());
}