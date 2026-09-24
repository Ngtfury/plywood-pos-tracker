import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardStats, getTransactions, Transaction } from "@/lib/db/queries";
import { useStore } from "@/store";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ChartData {
  date: string;
  in: number;
  out: number;
}

export function Dashboard() {
  const [stats, setStats] = useState({ totalIn: 0, totalOut: 0, netProfit: 0 });
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const refreshTrigger = useStore(s => s.refreshTrigger);

  useEffect(() => {
    getDashboardStats().then(setStats).catch(console.error);
    
    getTransactions().then(txns => {
      // Recent 5
      setRecentTxns(txns.slice(0, 5));

      // Aggregate chart data for the last 30 days
      const dataMap = new Map<string, {in: number, out: number}>();
      
      const now = new Date();
      // Initialize last 30 days with 0
      for(let i=29; i>=0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        dataMap.set(d.toISOString().split('T')[0], {in: 0, out: 0});
      }

      txns.forEach(t => {
        const dStr = t.date.split('T')[0];
        if (dataMap.has(dStr)) {
          const entry = dataMap.get(dStr)!;
          if (t.type === "IN") entry.in += t.amount;
          else entry.out += t.amount;
        }
      });

      const finalData = Array.from(dataMap.entries()).map(([date, val]) => ({
        date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        in: val.in,
        out: val.out
      }));

      setChartData(finalData);
    }).catch(console.error);
  }, [refreshTrigger]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your financial position.
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total IN</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              ₹{stats.totalIn.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total OUT</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-500">
              ₹{stats.totalOut.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.netProfit >= 0 ? "text-foreground" : "text-rose-500"}`}>
              ₹{stats.netProfit.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
        <Card className="md:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle>Cash Flow (Last 30 Days)</CardTitle>
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
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {recentTxns.length === 0 ? (
                <p className="text-muted-foreground text-sm">No recent transactions.</p>
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
