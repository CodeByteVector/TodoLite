import { create } from "zustand";
import type { ReactNode } from "react";

export interface CtxItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  confirm: string;
  action: () => void | Promise<void>;
}

export interface CtxMenu {
  x: number;
  y: number;
  items: CtxItem[];
}

interface MenuState {
  menu: CtxMenu | null;
  openMenu: (x: number, y: number, items: CtxItem[]) => void;
  closeMenu: () => void;
}

export const useMenu = create<MenuState>((set) => ({
  menu: null,
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null }),
}));