import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowRightLeft,
  HandCoins,
  Users,
  Tags,
  BarChart3,
  Settings,
  PlusCircle,
  MinusCircle,
  Lock,
  Building2,
  Package,
  Factory,
  Receipt,
  BookOpen,
  Landmark,
  FileText,
  ChevronDown,
  ChevronRight,
  Wallet,
  ShoppingCart,
  ArrowDownToLine,
  ArrowUpFromLine,
  DollarSign,
  UserCheck,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { useUserAuth } from "@/auth/UserAuthContext";

interface NavGroup {
  label: string;
  items: { name: string; href: string; icon: React.ElementType }[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Sales & Credits",
    items: [
      { name: "Transactions", href: "/transactions", icon: ArrowRightLeft },
      { name: "Credits", href: "/credits", icon: HandCoins },
    ],
  },
  {
    label: "Inventory",
    items: [
      { name: "Stock Overview", href: "/inventory", icon: Package },
      { name: "Products", href: "/inventory/products", icon: Layers },
      { name: "Production", href: "/production", icon: Factory },
    ],
  },
  {
    label: "Accounting",
    items: [
      { name: "Sales Voucher", href: "/vouchers/sales", icon: ArrowDownToLine },
      { name: "Purchase Voucher", href: "/vouchers/purchase", icon: ShoppingCart },
      { name: "Receipt Voucher", href: "/vouchers/receipt", icon: Wallet },
      { name: "Payment Voucher", href: "/vouchers/payment", icon: ArrowUpFromLine },
      { name: "Expense Voucher", href: "/vouchers/expense", icon: DollarSign },
      { name: "Salary Journal", href: "/salary", icon: UserCheck },
      { name: "General Journal", href: "/journal", icon: BookOpen },
    ],
  },
  {
    label: "Banking",
    items: [
      { name: "Bank Reconciliation", href: "/banking", icon: Landmark },
    ],
  },
  {
    label: "Reports",
    items: [
      { name: "Reports", href: "/reports", icon: FileText },
    ],
  },
  {
    label: "Masters",
    items: [
      { name: "Business Entities", href: "/business-entities", icon: Building2 },
      { name: "Contacts", href: "/entities", icon: Users },
      { name: "Categories", href: "/categories", icon: Tags },
      { name: "Masters Setup", href: "/masters", icon: Receipt },
    ],
  },
  {
    label: "System",
    items: [
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const setQuickIncomeOpen = useStore((s) => s.setQuickIncomeOpen);
  const setQuickExpenseOpen = useStore((s) => s.setQuickExpenseOpen);
  const { lock } = useUserAuth();

  // Track which groups are collapsed (collapsed by default for Accounting/Banking/Reports)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    "Accounting": false,
    "Banking": false,
    "Reports": false,
    "Masters": false,
    "System": false,
  });

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-border/50">
        <h1 className="text-lg font-bold tracking-tight text-primary">Plywood ERP</h1>
        <p className="text-[10px] text-muted-foreground mt-0.5">Production Management System</p>
      </div>

      {/* Quick Action Buttons */}
      <div className="px-3 py-3 space-y-2 border-b border-border/50">
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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {navGroups.map((group) => {
          const isCollapsed = collapsed[group.label] ?? false;
          const hasMultiple = group.items.length > 1;

          return (
            <div key={group.label} className="mb-1">
              {/* Group Header */}
              <button
                onClick={() => hasMultiple && toggleGroup(group.label)}
                className={cn(
                  "flex w-full items-center justify-between px-2 py-1 mb-0.5",
                  "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70",
                  hasMultiple ? "hover:text-muted-foreground cursor-pointer" : "cursor-default"
                )}
              >
                <span>{group.label}</span>
                {hasMultiple && (
                  isCollapsed
                    ? <ChevronRight className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />
                )}
              </button>

              {/* Group Items */}
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      end={item.href === "/"}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Lock Application Footer */}
      <div className="px-3 py-3 border-t border-border/60">
        <button
          onClick={lock}
          className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-rose-400 transition-colors cursor-pointer"
          title="Lock ERP Application"
        >
          <Lock className="h-4 w-4" />
          <span>Lock Application</span>
        </button>
      </div>
    </div>
  );
}
