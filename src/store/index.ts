import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  isQuickIncomeOpen: boolean;
  isQuickExpenseOpen: boolean;
  isBalanceModalOpen: boolean;
  setQuickIncomeOpen: (open: boolean) => void;
  setQuickExpenseOpen: (open: boolean) => void;
  setBalanceModalOpen: (open: boolean) => void;

  // A simple counter to trigger refetches in components when data changes
  refreshTrigger: number;
  triggerRefresh: () => void;

  // ERP: selected business entity (persisted across sessions)
  selectedBusinessEntityId: string | null;
  setSelectedBusinessEntityId: (id: string | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      isQuickIncomeOpen: false,
      isQuickExpenseOpen: false,
      isBalanceModalOpen: false,
      setQuickIncomeOpen: (open) => set({ isQuickIncomeOpen: open }),
      setQuickExpenseOpen: (open) => set({ isQuickExpenseOpen: open }),
      setBalanceModalOpen: (open) => set({ isBalanceModalOpen: open }),

      refreshTrigger: 0,
      triggerRefresh: () => set((state) => ({ refreshTrigger: state.refreshTrigger + 1 })),

      selectedBusinessEntityId: null,
      setSelectedBusinessEntityId: (id) => set({ selectedBusinessEntityId: id }),
    }),
    {
      name: 'plywood-erp-store',
      // Only persist the business entity selection, not modal states
      partialize: (state) => ({ selectedBusinessEntityId: state.selectedBusinessEntityId }),
    }
  )
);
