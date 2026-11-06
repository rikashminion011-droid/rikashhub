import { create } from "zustand";

interface UiState {
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

/** Client-only UI state. Server data lives in the database and TanStack Query, never here. */
export const useUiStore = create<UiState>((set) => ({
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}));
