import { create } from 'zustand';

interface AppState {
  isQuickIncomeOpen: boolean;
  isQuickExpenseOpen: boolean;
  setQuickIncomeOpen: (open: boolean) => void;
  setQuickExpenseOpen: (open: boolean) => void;
  
  // A simple counter to trigger refetches in components when data changes
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const useStore = create<AppState>((set) => ({
  isQuickIncomeOpen: false,
  isQuickExpenseOpen: false,
  setQuickIncomeOpen: (open) => set({ isQuickIncomeOpen: open }),
  setQuickExpenseOpen: (open) => set({ isQuickExpenseOpen: open }),
  
  refreshTrigger: 0,
  triggerRefresh: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),
}));
