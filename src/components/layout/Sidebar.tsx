import { NavLink } from "react-router-dom";
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  Users, 
  Tags, 
  BarChart3, 
  Settings,
  PlusCircle,
  MinusCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useStore } from "@/store";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Transactions", href: "/transactions", icon: ArrowRightLeft },
  { name: "Entities", href: "/entities", icon: Users },
  { name: "Categories", href: "/categories", icon: Tags },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const setQuickIncomeOpen = useStore(s => s.setQuickIncomeOpen);
  const setQuickExpenseOpen = useStore(s => s.setQuickExpenseOpen);

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card px-3 py-4">
      <div className="mb-8 px-4">
        <h1 className="text-xl font-bold tracking-tight text-primary">Plywood Tracker</h1>
      </div>
      
      <div className="mb-6 space-y-2">
        <button 
          onClick={() => setQuickIncomeOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          Quick Income
        </button>
        <button 
          onClick={() => setQuickExpenseOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 transition-colors"
        >
          <MinusCircle className="h-4 w-4" />
          Quick Expense
        </button>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
