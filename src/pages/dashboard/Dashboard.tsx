import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTransactions, Transaction } from "@/lib/db/queries";
import { useStore } from "@/store";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { IosLoadingView } from "@/components/ui/IosSpinner";
import { ArrowDownLeft, ArrowUpRight, HandCoins, ArrowRight, Calendar } from "lucide-react";

interface ChartData {
  date: string;
  in: number;
  out: number;
}

interface MonthItem {
  key: string;       // "YYYY-MM", e.g. "2026-10"
  label: string;     // "Oct 2026"
  year: number;
  month: number;     // 1-12
  count: number;
}

export function Dashboard() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const refreshTrigger = useStore(s => s.refreshTrigger);

  useEffect(() => {
    setLoading(true);
    getTransactions()
      .then(txns => {
        setAllTransactions(txns);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshTrigger]);

  // Extract unique months present in entered transaction data
  const availableMonths = useMemo<MonthItem[]>(() => {
    const monthMap = new Map<string, MonthItem>();

    for (const t of allTransactions) {
      if (!t.date) continue;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) continue;

      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); // e.g. "Oct 2026"

      if (!monthMap.has(key)) {
        monthMap.set(key, {
          key,
          label,
          year: y,
          month: m,
          count: 1
        });
      } else {
        monthMap.get(key)!.count += 1;
      }
    }

    // Sort chronologically (earliest to latest)
    return Array.from(monthMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [allTransactions]);

  // Filter transactions according to selected month
  const displayedTxns = useMemo<Transaction[]>(() => {
    if (selectedMonth === "ALL") return allTransactions;
    return allTransactions.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      if (isNaN(d.getTime())) return false;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === selectedMonth;
    });
  }, [allTransactions, selectedMonth]);

  // Compute financial statistics for the selected timeframe
  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let pureCashIn = 0;
    let pureCashOut = 0;
    let creditCollectedIn = 0;
    let creditDisbursedOut = 0;
    let totalReceivable = 0;
    let totalPayable = 0;

    for (const t of displayedTxns) {
      const amt = Number(t.amount) || 0;
      const bal = Number(t.balance_due) || 0;

      if (t.type === 'IN') {
        totalIn += amt;
        if (t.custom_data?.is_credit_settlement) {
          creditCollectedIn += amt;
        } else {
          pureCashIn += amt;
        }
        totalReceivable += bal;
      } else {
        totalOut += amt;
        if (t.custom_data?.is_credit_settlement) {
          creditDisbursedOut += amt;
        } else {
          pureCashOut += amt;
        }
        totalPayable += bal;
      }
    }

    const netProfitExcludingCredits = totalIn - totalOut;
    const pureCashProfit = pureCashIn - pureCashOut;
    const netCredit = totalReceivable - totalPayable;
    const totalProfitWithCredits = netProfitExcludingCredits + netCredit;

    return {
      totalIn,
      totalOut,
      pureCashIn,
      pureCashOut,
      pureCashProfit,
      creditCollectedIn,
      creditDisbursedOut,
      netProfitExcludingCredits,
      totalProfitWithCredits,
      creditStats: {
        totalReceivable,
        totalPayable,
        netCredit
      }
    };
  }, [displayedTxns]);

  // Compute Chart Data for AreaChart
  const chartData = useMemo<ChartData[]>(() => {
    if (displayedTxns.length === 0) return [];

    if (selectedMonth !== "ALL") {
      // Month-specific daily view
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const daysInMonth = new Date(year, month, 0).getDate();

      const dayMap = new Map<number, { in: number; out: number }>();
      for (let day = 1; day <= daysInMonth; day++) {
        dayMap.set(day, { in: 0, out: 0 });
      }

      displayedTxns.forEach(t => {
        const d = new Date(t.date);
        const day = d.getDate();
        if (dayMap.has(day)) {
          const entry = dayMap.get(day)!;
          if (t.type === "IN") entry.in += Number(t.amount) || 0;
          else entry.out += Number(t.amount) || 0;
        }
      });

      const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
      return Array.from(dayMap.entries()).map(([day, val]) => ({
        date: `${monthName} ${day}`,
        in: val.in,
        out: val.out
      }));
    } else {
      // All Time view (last 30 days)
      const dataMap = new Map<string, { in: number; out: number }>();
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        dataMap.set(d.toISOString().split('T')[0], { in: 0, out: 0 });
      }

      allTransactions.forEach(t => {
        const dStr = t.date.split('T')[0];
        if (dataMap.has(dStr)) {
          const entry = dataMap.get(dStr)!;
          if (t.type === "IN") entry.in += Number(t.amount) || 0;
          else entry.out += Number(t.amount) || 0;
        }
      });

      return Array.from(dataMap.entries()).map(([date, val]) => ({
        date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        in: val.in,
        out: val.out
      }));
    }
  }, [displayedTxns, allTransactions, selectedMonth]);

  const recentTxns = useMemo(() => {
    return displayedTxns.slice(0, 5);
  }, [displayedTxns]);

  const activeMonthLabel = useMemo(() => {
    if (selectedMonth === "ALL") return "All Time";
    return availableMonths.find(m => m.key === selectedMonth)?.label || selectedMonth;
  }, [selectedMonth, availableMonths]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your financial position.</p>
        </div>
        <IosLoadingView text="Loading financial overview..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Heading & Dynamic Month Filter Buttons */}
      <div className="space-y-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Overview of your financial position and cash flow metrics.
          </p>
        </div>

        {/* Dynamic Month Selector Buttons - Only for months present in data */}
        {availableMonths.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">
              <Calendar className="h-3.5 w-3.5 text-emerald-400" />
              <span>Month:</span>
            </div>

            <Button
              key="all"
              size="sm"
              variant={selectedMonth === "ALL" ? "default" : "outline"}
              onClick={() => setSelectedMonth("ALL")}
              className={`h-8 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                selectedMonth === "ALL"
                  ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All Time
            </Button>

            {availableMonths.map((m) => (
              <Button
                key={m.key}
                size="sm"
                variant={selectedMonth === m.key ? "default" : "outline"}
                onClick={() => setSelectedMonth(m.key)}
                className={`h-8 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                  selectedMonth === m.key
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* 4-Card Executive Financial Summary with Distinguished Credit Box */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* CARD 1: Total Cash IN */}
        <Card className="hover:border-emerald-500/30 transition-all shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Cash IN</CardTitle>
              <span className="text-[10px] text-muted-foreground font-normal">{activeMonthLabel}</span>
            </div>
            <div className="p-1.5 rounded-full bg-emerald-500/10 text-emerald-500">
              <ArrowDownLeft className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              ₹{stats.totalIn.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
              <span>Pure Inflow:</span>
              <span className="font-medium text-foreground">₹{stats.pureCashIn.toLocaleString()}</span>
            </p>
          </CardContent>
        </Card>

        {/* CARD 2: Total Cash OUT */}
        <Card className="hover:border-rose-500/30 transition-all shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Cash OUT</CardTitle>
              <span className="text-[10px] text-muted-foreground font-normal">{activeMonthLabel}</span>
            </div>
            <div className="p-1.5 rounded-full bg-rose-500/10 text-rose-500">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-500">
              ₹{stats.totalOut.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
              <span>Pure Outflow:</span>
              <span className="font-medium text-foreground">₹{stats.pureCashOut.toLocaleString()}</span>
            </p>
          </CardContent>
        </Card>

        {/* CARD 3: Net Profit (Excluding Credits) with Distinguished Credit Box Inside */}
        <Card className="hover:border-primary/40 transition-all shadow-sm border-primary/20 relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <div>
              <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
              <span className="text-[10px] text-muted-foreground font-normal">Excluding open credits</span>
            </div>
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[10px] py-0 px-1.5">
              Cash Liquid
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className={`text-2xl font-bold ${stats.netProfitExcludingCredits >= 0 ? "text-foreground" : "text-rose-500"}`}>
              ₹{stats.netProfitExcludingCredits.toLocaleString()}
            </div>

            {/* Distinguished Credit Box WITHIN Net Profit */}
            <div className="p-2 rounded-md bg-muted/60 border border-border/80 space-y-1 text-xs">
              <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                <span>Credits Net Impact:</span>
                <span className={`font-semibold ${stats.creditStats.netCredit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {stats.creditStats.netCredit >= 0 ? "+" : ""}₹{stats.creditStats.netCredit.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t text-[11px] font-medium">
                <span className="text-foreground">Total Incl. Credits:</span>
                <span className={`font-bold ${stats.totalProfitWithCredits >= 0 ? "text-primary" : "text-rose-400"}`}>
                  ₹{stats.totalProfitWithCredits.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CARD 4: Distinguished Credit Balance Box Card */}
        <Card className="hover:border-amber-500/40 transition-all shadow-sm border-amber-500/30 bg-gradient-to-br from-card via-card to-amber-500/5 relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <div>
              <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
              <span className="text-[10px] text-muted-foreground font-normal">Receivables vs Payables</span>
            </div>
            <div className="p-1.5 rounded-full bg-amber-500/10 text-amber-500">
              <HandCoins className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className={`text-2xl font-bold flex items-center justify-between ${
              stats.creditStats.netCredit >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}>
              <span>
                {stats.creditStats.netCredit >= 0 ? "+" : ""}₹{stats.creditStats.netCredit.toLocaleString()}
              </span>
              <Badge variant="outline" className={stats.creditStats.netCredit >= 0 ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]" : "border-rose-500/40 text-rose-400 bg-rose-500/10 text-[10px]"}>
                {stats.creditStats.netCredit >= 0 ? "Net To Get" : "Net To Give"}
              </Badge>
            </div>

            {/* Distinguished Breakdown */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-xs">
              <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <p className="text-[10px] opacity-80">To Get (Cust)</p>
                <p className="font-bold text-xs truncate">₹{stats.creditStats.totalReceivable.toLocaleString()}</p>
              </div>
              <div className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <p className="text-[10px] opacity-80">To Give (Supp)</p>
                <p className="font-bold text-xs truncate">₹{stats.creditStats.totalPayable.toLocaleString()}</p>
              </div>
            </div>

            <div className="pt-0.5">
              <Link 
                to="/credits" 
                className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium transition-colors"
              >
                <span>Open Credits Dashboard</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Chart & Recent Activity */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
        <Card className="md:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle>
              Cash Flow ({selectedMonth === "ALL" ? "Last 30 Days" : activeMonthLabel})
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `₹${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="in" stroke="#10b981" fillOpacity={1} fill="url(#colorIn)" />
                  <Area type="monotone" dataKey="out" stroke="#f43f5e" fillOpacity={1} fill="url(#colorOut)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity ({activeMonthLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {recentTxns.length === 0 ? (
                <p className="text-muted-foreground text-sm">No transactions found for this period.</p>
              ) : (
                recentTxns.map(txn => (
                  <div key={txn.id} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {txn.category_name || "Uncategorized"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {txn.entity_name ? `With ${txn.entity_name}` : (txn.notes || "No notes")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`font-bold ${txn.type === "IN" ? "text-emerald-500" : "text-rose-500"}`}>
                        {txn.type === "IN" ? "+" : "-"}₹{txn.amount.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
