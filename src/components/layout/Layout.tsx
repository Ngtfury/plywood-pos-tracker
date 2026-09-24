import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { QuickEntryModal } from "../QuickEntryModal";
import { useStore } from "@/store";
import { AnimatePresence, motion } from "framer-motion";

export function Layout() {
  const isQuickIncomeOpen = useStore(s => s.isQuickIncomeOpen);
  const isQuickExpenseOpen = useStore(s => s.isQuickExpenseOpen);
  const setQuickIncomeOpen = useStore(s => s.setQuickIncomeOpen);
  const setQuickExpenseOpen = useStore(s => s.setQuickExpenseOpen);
  const location = useLocation();

  return (
    <div className="flex h-screen w-full bg-background font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden relative">
        <AnimatePresence>
          <motion.div 
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="h-full p-8 w-full absolute top-0 left-0"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      
      <QuickEntryModal 
        type="IN" 
        isOpen={isQuickIncomeOpen} 
        onClose={() => setQuickIncomeOpen(false)} 
      />
      
      <QuickEntryModal 
        type="OUT" 
        isOpen={isQuickExpenseOpen} 
        onClose={() => setQuickExpenseOpen(false)} 
      />
    </div>
  );
}
