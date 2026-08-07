import { create } from "zustand";

export interface Burst {
  id: number;
  x: number;
  y: number;
}

interface ConfettiState {
  bursts: Burst[];
  celebrate: (x?: number, y?: number) => void;
  done: (id: number) => void;
}

let idc = 0;

export const useConfetti = create<ConfettiState>((set) => ({
  bursts: [],
  celebrate: (x = -1, y = -1) =>
    set((s) => ({
      bursts: [
        ...s.bursts,
        {
          id: ++idc,
          x: x < 0 ? window.innerWidth / 2 : x,
          y: y < 0 ? window.innerHeight / 2 - 40 : y,
        },
      ],
    })),
  done: (id) => set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) })),
}));