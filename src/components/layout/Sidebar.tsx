import { useState, useEffect } from "react";
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
import {
  getTransactions,
  getCompanyOpeningBalance,
  calculateCompanyCurrentBalance,
} from "@/lib/db/queries";
import { getBusinessEntities, getBankAccounts } from "@/lib/db/accounting";
import type { BankAccount } from "@/lib/db/erp";

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
  const setBalanceModalOpen = useStore((s) => s.setBalanceModalOpen);
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const { lock } = useUserAuth();

  const [currentBal, setCurrentBal] = useState<number>(0);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [companyLabel, setCompanyLabel] = useState<string>("Cash in Hand");

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

  useEffect(() => {
    let isSubscribed = true;
    Promise.all([
      getBusinessEntities(),
      getTransactions(),
      getCompanyOpeningBalance(selectedEntityId),
      getBankAccounts(selectedEntityId || undefined),
    ])
      .then(([entities, txns, opBal, banks]) => {
        if (!isSubscribed) return;
        if (selectedEntityId) {
          const found = entities.find((e: any) => e.id === selectedEntityId);
          setCompanyLabel(found ? `${found.name} Cash` : "Cash in Hand");
        } else {
          setCompanyLabel("Cash in Hand");
        }
        const bal = calculateCompanyCurrentBalance(txns, opBal, selectedEntityId);
        setCurrentBal(bal.currentBalance);
        setBankAccounts(banks.filter((b) => b.is_active !== false));
      })
      .catch(console.error);

    return () => {
      isSubscribed = false;
    };
  }, [selectedEntityId, refreshTrigger]);

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-border/50">
        <h1 className="text-lg font-bold tracking-tight text-primary">Plywood ERP</h1>
        <p className="text-[10px] text-muted-foreground mt-0.5">Production Management System</p>
      </div>

      {/* Quick Action Buttons & Current Balance */}
      <div className="px-3 py-3 space-y-2 border-b border-border/50">
        <button
          onClick={() => setQuickIncomeOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors shadow-sm"
        >
          <PlusCircle className="h-4 w-4" />
          Quick Income
        </button>
        <button
          onClick={() => setQuickExpenseOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 transition-colors shadow-sm"
        >
          <MinusCircle className="h-4 w-4" />
          Quick Expense
        </button>
        <button
          onClick={() => setBalanceModalOpen(true)}
          className="flex w-full items-center justify-between rounded-md bg-secondary/80 border border-border/80 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-all hover:border-primary/50 group cursor-pointer"
          title="Click to view, set or add Cash in Hand balance"
        >
          <span className="flex items-center gap-2 truncate pr-2">
            <Wallet className="h-4 w-4 text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="truncate max-w-[95px] text-left">{companyLabel}</span>
          </span>
          <span
            className={cn(
              "font-mono font-bold text-xs shrink-0",
              currentBal >= 0 ? "text-emerald-500" : "text-rose-500"
            )}
          >
            ₹{currentBal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        </button>

        {/* Separate Live Bank Balances */}
        <button
          onClick={() => setBalanceModalOpen(true)}
          className="flex flex-col w-full gap-1 rounded-md bg-blue-950/20 border border-blue-500/20 px-3 py-2 text-xs text-foreground hover:bg-blue-950/35 transition-all hover:border-blue-500/40 cursor-pointer"
          title="Click to view, set or add Bank Account balances"
        >
          <div className="flex w-full items-center justify-between font-semibold">
            <span className="flex items-center gap-2 text-[11px] text-blue-300">
              <Landmark className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              <span>Bank Balances</span>
            </span>
            <span className="font-mono font-bold text-xs text-blue-400">
              ₹{bankAccounts.reduce((s, b) => s + (Number(b.current_balance) || 0), 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>
          {bankAccounts.length > 0 && (
            <div className="w-full space-y-0.5 pt-1 border-t border-blue-500/15">
              {bankAccounts.slice(0, 3).map((b) => (
                <div key={b.id} className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="truncate max-w-[100px] text-left">{b.bank_name}</span>
                  <span className="font-mono font-medium text-blue-300">
                    ₹{Number(b.current_balance || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          )}
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
