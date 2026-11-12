import { useState, useEffect, useMemo } from "react";
import { useStore } from "@/store";
import { BusinessEntitySelector } from "@/components/erp/BusinessEntitySelector";
import { IosLoadingView } from "@/components/ui/IosSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Download, TrendingUp, DollarSign, Package, UserCheck
} from "lucide-react";
import type { StockBalance, ProductionEntry, Voucher, SalaryRecord } from "@/lib/db/erp";
import {
  getStockBalances,
} from "@/lib/db/inventory";
import {
  getProductionEntries,
} from "@/lib/db/production";
import {
  getVouchers,
  getSalaryRecords,
  getPnlSummary,
} from "@/lib/db/accounting";

type ReportCategory = "ACCOUNTING" | "INVENTORY" | "TRANSACTIONS" | "SALARY";

export function Reports() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);

  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ReportCategory>("ACCOUNTING");

  // Date filters
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Data sets
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([]);
  const [productionRuns, setProductionRuns] = useState<ProductionEntry[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  const [pnl, setPnl] = useState<{ totalSales: number; totalPurchase: number; totalExpenses: number; grossProfit: number; netProfit: number }>({
    totalSales: 0,
    totalPurchase: 0,
    totalExpenses: 0,
    grossProfit: 0,
    netProfit: 0,
  });

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getStockBalances(selectedEntityId || undefined),
      getProductionEntries({
        businessEntityId: selectedEntityId || undefined,
        fromDate: fromDate + "T00:00:00Z",
        toDate: toDate + "T23:59:59Z",
      }),
      getVouchers({
        businessEntityId: selectedEntityId || undefined,
        fromDate: fromDate + "T00:00:00Z",
        toDate: toDate + "T23:59:59Z",
      }),
      getSalaryRecords({
        businessEntityId: selectedEntityId || undefined,
      }),
      getPnlSummary({
        businessEntityId: selectedEntityId || undefined,
        fromDate: fromDate + "T00:00:00Z",
        toDate: toDate + "T23:59:59Z",
      }),
    ])
      .then(([sb, pr, vch, sal, pnlRes]) => {
        setStockBalances(sb);
        setProductionRuns(pr);
        setVouchers(vch);
        setSalaryRecords(sal);
        setPnl(pnlRes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [selectedEntityId, fromDate, toDate, refreshTrigger]);

  // Export CSV Helper
  const handleExportCsv = (title: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${title.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const grossProfitMargin = useMemo(() => {
    if (pnl.totalSales <= 0) return 0;
    return Math.round((pnl.grossProfit / pnl.totalSales) * 1000) / 10;
  }, [pnl]);

  const netProfitMargin = useMemo(() => {
    if (pnl.totalSales <= 0) return 0;
    return Math.round((pnl.netProfit / pnl.totalSales) * 1000) / 10;
  }, [pnl]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Business Reports &amp; Financial Statements</h2>
        </div>
        <IosLoadingView text="Compiling financial &amp; inventory reports..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Global Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Business Reports &amp; Financials</h2>
          <p className="text-muted-foreground mt-1">
            Consolidated P&amp;L, Trial Balance, Stock Ledger, Sales/Purchase Registers, and Salary Registers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <div className="flex items-center gap-1.5 bg-card border rounded-lg p-1 text-xs">
            <span className="text-muted-foreground px-1">Period:</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-7 text-xs w-32 border-none bg-muted/40"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-7 text-xs w-32 border-none bg-muted/40"
            />
          </div>
        </div>
      </div>

      {/* Report Categories Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <Button
          size="sm"
          variant={activeCategory === "ACCOUNTING" ? "default" : "outline"}
          onClick={() => setActiveCategory("ACCOUNTING")}
          className="h-8 text-xs cursor-pointer font-medium"
        >
          <TrendingUp className="h-3.5 w-3.5 mr-1.5" /> Profit &amp; Loss &amp; Financials
        </Button>
        <Button
          size="sm"
          variant={activeCategory === "INVENTORY" ? "default" : "outline"}
          onClick={() => setActiveCategory("INVENTORY")}
          className="h-8 text-xs cursor-pointer font-medium"
        >
          <Package className="h-3.5 w-3.5 mr-1.5" /> Inventory &amp; Production
        </Button>
        <Button
          size="sm"
          variant={activeCategory === "TRANSACTIONS" ? "default" : "outline"}
          onClick={() => setActiveCategory("TRANSACTIONS")}
          className="h-8 text-xs cursor-pointer font-medium"
        >
          <DollarSign className="h-3.5 w-3.5 mr-1.5" /> Sales &amp; Purchase Registers
        </Button>
        <Button
          size="sm"
          variant={activeCategory === "SALARY" ? "default" : "outline"}
          onClick={() => setActiveCategory("SALARY")}
          className="h-8 text-xs cursor-pointer font-medium"
        >
          <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Salary &amp; Payroll Register
        </Button>
      </div>

      {/* SECTION 1: ACCOUNTING & P&L */}
      {activeCategory === "ACCOUNTING" && (
        <div className="space-y-6">
          {/* Executive P&L Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Sales Revenue (Gross)</CardTitle>
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-400">₹{pnl.totalSales.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Invoiced sales during selected timeframe</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">COGS (Raw Materials)</CardTitle>
                <span className="text-xs text-rose-400 font-bold">-Purchases</span>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-400">₹{pnl.totalPurchase.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Timber, veneer &amp; resin purchase invoices</p>
              </CardContent>
            </Card>

            <Card className="border-blue-500/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Gross Profit &amp; Margin %</CardTitle>
                <Badge variant="outline" className="border-blue-500/40 text-blue-400 font-bold">
                  {grossProfitMargin}%
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-400">₹{pnl.grossProfit.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Sales minus raw material purchases</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/40 bg-emerald-500/5">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit &amp; Margin %</CardTitle>
                <Badge variant="outline" className={pnl.netProfit >= 0 ? "border-emerald-500 text-emerald-400" : "border-rose-500 text-rose-400"}>
                  {netProfitMargin}%
                </Badge>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${pnl.netProfit >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                  ₹{pnl.netProfit.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Gross profit minus OPEX &amp; salary accruals</p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Statement of Profit & Loss */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Statement of Profit &amp; Loss</CardTitle>
                <CardDescription>Period: {fromDate} to {toDate}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleExportCsv(
                    "Profit_and_Loss",
                    ["Particulars", "Amount (₹)"],
                    [
                      ["Sales Revenue (A)", pnl.totalSales],
                      ["Cost of Goods Sold / Purchases (B)", pnl.totalPurchase],
                      ["Gross Profit (A - B)", pnl.grossProfit],
                      ["Gross Profit Margin %", `${grossProfitMargin}%`],
                      ["Operating Overheads & Salaries (C)", pnl.totalExpenses],
                      ["Net Profit (A - B - C)", pnl.netProfit],
                      ["Net Profit Margin %", `${netProfitMargin}%`],
                    ]
                  )
                }
                className="h-8 text-xs cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export P&amp;L (CSV)
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-xs max-w-2xl font-mono">
                <div className="flex justify-between p-2 rounded bg-muted/40 font-semibold">
                  <span>1. Revenue from Operations (Sales Invoices)</span>
                  <span className="text-emerald-400">₹{pnl.totalSales.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-muted/40 font-semibold">
                  <span>2. Cost of Materials Consumed (Purchases)</span>
                  <span className="text-rose-400">₹{pnl.totalPurchase.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 rounded border border-blue-500/40 bg-blue-500/10 font-bold text-blue-400">
                  <span>GROSS PROFIT (1 - 2)</span>
                  <span>₹{pnl.grossProfit.toLocaleString()} ({grossProfitMargin}%)</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-muted/40 font-semibold">
                  <span>3. Operating Overheads &amp; Employee Salaries</span>
                  <span className="text-amber-400">₹{pnl.totalExpenses.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2.5 rounded border border-emerald-500/40 bg-emerald-500/10 font-bold text-sm text-emerald-400">
                  <span>NET PROFIT BEFORE TAX (1 - 2 - 3)</span>
                  <span>₹{pnl.netProfit.toLocaleString()} ({netProfitMargin}%)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SECTION 2: INVENTORY & PRODUCTION */}
      {activeCategory === "INVENTORY" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Current Stock Position by Variant</CardTitle>
                <CardDescription>Real-time physical inventory balances</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleExportCsv(
                    "Stock_Position",
                    ["Product", "Category", "Size", "Thickness", "Sheets", "Sqft", "Pieces", "Entity"],
                    stockBalances.map((s) => [
                      s.product_name || "",
                      s.product_category || "",
                      s.variant_size || "",
                      s.variant_thickness || "",
                      s.qty_sheets || 0,
                      s.qty_sqft || 0,
                      s.qty_pieces || 0,
                      s.business_entity_name || "",
                    ])
                  )
                }
                className="h-8 text-xs cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export Stock (CSV)
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Size (ft)</TableHead>
                    <TableHead>Thickness</TableHead>
                    <TableHead className="text-right">Sheets</TableHead>
                    <TableHead className="text-right">Total Sq.Ft</TableHead>
                    <TableHead className="text-right">Pieces (Veneer)</TableHead>
                    <TableHead>Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockBalances.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-semibold text-xs">{s.product_name}</TableCell>
                      <TableCell className="text-xs capitalize">{s.product_category?.replace("_", " ")}</TableCell>
                      <TableCell className="text-xs font-mono">{s.variant_size || "—"}</TableCell>
                      <TableCell className="text-xs font-mono">{s.variant_thickness ? `${s.variant_thickness} mm` : "—"}</TableCell>
                      <TableCell className="text-right text-xs font-bold text-blue-400">
                        {Number(s.qty_sheets).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold text-emerald-400">
                        {Number(s.qty_sqft).toLocaleString()} sqft
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold">
                        {Number(s.qty_pieces).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.business_entity_name || "General"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Production Register */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Production &amp; Face Veneer Consumption Register</CardTitle>
                <CardDescription>Period: {fromDate} to {toDate}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleExportCsv(
                    "Production_Register",
                    ["Date", "Plywood", "Size", "Thickness", "Sheets Produced", "Sqft Produced", "Face Veneer Consumed (pcs)"],
                    productionRuns.map((p) => [
                      p.production_date,
                      p.plywood_product_name || "",
                      p.variant_size || "",
                      p.variant_thickness || "",
                      p.sheets_produced,
                      p.sqft_produced,
                      p.face_veneer_consumed,
                    ])
                  )
                }
                className="h-8 text-xs cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Export Production (CSV)
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Plywood Product</TableHead>
                    <TableHead>Dimension</TableHead>
                    <TableHead className="text-right">Sheets Output</TableHead>
                    <TableHead className="text-right">Sq.Ft Output</TableHead>
                    <TableHead className="text-right">Face Veneer Consumed</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productionRuns.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-mono">{new Date(p.production_date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-semibold text-xs">{p.plywood_product_name}</TableCell>
                      <TableCell className="text-xs font-mono">{p.variant_size} • {p.variant_thickness}mm</TableCell>
                      <TableCell className="text-right text-xs font-bold text-blue-400">
                        {Number(p.sheets_produced).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {Number(p.sqft_produced).toLocaleString()} sqft
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold text-emerald-400">
                        {Number(p.face_veneer_consumed).toLocaleString()} pcs
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {p.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SECTION 3: TRANSACTIONS & SALES/PURCHASE REGISTERS */}
      {activeCategory === "TRANSACTIONS" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Voucher Transaction Register</CardTitle>
              <CardDescription>Sales, Purchases, Receipts, and Payments within chosen timeframe.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                handleExportCsv(
                  "Transactions_Register",
                  ["Voucher #", "Type", "Date", "Party", "Total Amount", "Paid Amount", "Balance Due", "Status"],
                  vouchers.map((v) => [
                    v.voucher_number,
                    v.voucher_type,
                    v.voucher_date,
                    v.party_entity_name || "",
                    v.total_amount,
                    v.paid_amount,
                    v.balance_due,
                    v.payment_status,
                  ])
                )
              }
              className="h-8 text-xs cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export Register (CSV)
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Party / Contact</TableHead>
                  <TableHead className="text-right">Total (₹)</TableHead>
                  <TableHead className="text-right">Paid (₹)</TableHead>
                  <TableHead className="text-right">Balance Due (₹)</TableHead>
                  <TableHead>Payment Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs font-bold">{v.voucher_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                        {v.voucher_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{new Date(v.voucher_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs font-medium">{v.party_entity_name || "—"}</TableCell>
                    <TableCell className="text-right text-xs font-bold">
                      ₹{Number(v.total_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs text-emerald-400">
                      ₹{Number(v.paid_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs text-amber-400">
                      ₹{Number(v.balance_due).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {v.payment_status.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* SECTION 4: SALARY & PAYROLL */}
      {activeCategory === "SALARY" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Monthly Salary &amp; Partner Remuneration Register</CardTitle>
              <CardDescription>Accrued liabilities and disbursement audit history</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                handleExportCsv(
                  "Salary_Register",
                  ["Month", "Frequency", "Payee Name", "Type", "Booked Amount", "Paid Amount", "Pending Balance", "Status"],
                  salaryRecords.map((s) => [
                    s.salary_month,
                    s.salary_frequency || "monthly",
                    s.payee_name,
                    s.payee_type,
                    s.booked_amount,
                    s.paid_amount,
                    s.pending_amount,
                    s.status,
                  ])
                )
              }
              className="h-8 text-xs cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export Payroll (CSV)
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salary Month</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Payee Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Booked (₹)</TableHead>
                  <TableHead className="text-right">Paid (₹)</TableHead>
                  <TableHead className="text-right">Pending (₹)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salaryRecords.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs font-semibold">{s.salary_month}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {s.salary_frequency || "monthly"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-semibold">{s.payee_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {s.payee_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">₹{Number(s.booked_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs text-emerald-400 font-bold">
                      ₹{Number(s.paid_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs text-amber-400 font-bold">
                      ₹{Number(s.pending_amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {s.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
