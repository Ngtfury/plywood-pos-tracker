import { useState, useEffect } from "react";
import { getTransactions, getCategories, getEntities, Transaction, Category, Entity } from "@/lib/db/queries";
import { useStore } from "@/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Filter, X, Download, ArrowDownLeft, ArrowUpRight, HandCoins, Wallet, Search } from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { IosLoadingView } from "@/components/ui/IosSpinner";

export function Analytics() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [creditFilter, setCreditFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const refreshTrigger = useStore(s => s.refreshTrigger);

  useEffect(() => {
    setPageLoading(true);
    Promise.all([
      getTransactions().then(setTransactions),
      getCategories().then(setCategories),
      getEntities().then(setEntities)
    ])
      .catch(console.error)
      .finally(() => setPageLoading(false));
  }, [refreshTrigger]);

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("ALL");
    setCategoryFilter("ALL");
    setEntityFilter("ALL");
    setCreditFilter("ALL");
    setFromDate("");
    setToDate("");
  };

  // Count active filters for the badge
  const activeFiltersCount = 
    (typeFilter !== "ALL" ? 1 : 0) +
    (categoryFilter !== "ALL" ? 1 : 0) +
    (entityFilter !== "ALL" ? 1 : 0) +
    (creditFilter !== "ALL" ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);

  const filteredTransactions = transactions.filter(t => {
    // 1. Search Notes, Amount, Entity, or Category
    if (search) {
      const q = search.toLowerCase();
      const matchNotes = t.notes?.toLowerCase().includes(q);
      const matchEntity = t.entity_name?.toLowerCase().includes(q);
      const matchCategory = t.category_name?.toLowerCase().includes(q);
      const matchAmount = t.amount.toString().includes(q);
      const matchTotal = t.total_amount?.toString().includes(q);
      const matchBalance = t.balance_due?.toString().includes(q);
      if (!matchNotes && !matchEntity && !matchCategory && !matchAmount && !matchTotal && !matchBalance) {
        return false;
      }
    }

    // 2. Type filter (IN or OUT)
    if (typeFilter !== "ALL" && t.type !== typeFilter) return false;

    // 3. Category Filter
    if (categoryFilter !== "ALL" && t.category_id !== categoryFilter) return false;

    // 4. Entity Filter
    if (entityFilter !== "ALL" && t.entity_id !== entityFilter) return false;

    // 5. Credit Filter
    const balanceDue = Number(t.balance_due) || 0;
    const isCreditTxn = balanceDue > 0 || 
      t.credit_status === 'UNPAID' || 
      t.credit_status === 'PARTIAL' || 
      Boolean(t.custom_data?.is_credit_initial) || 
      Boolean(t.custom_data?.is_credit_settlement);

    if (creditFilter === "CASH_ONLY") {
      if (isCreditTxn) return false;
    } else if (creditFilter === "ALL_CREDIT") {
      if (!isCreditTxn) return false;
    } else if (creditFilter === "OPEN_CREDIT") {
      if (balanceDue <= 0 && t.credit_status !== 'UNPAID' && t.credit_status !== 'PARTIAL') return false;
    } else if (creditFilter === "CREDIT_RECEIVABLE") {
      if (t.type !== 'IN' || (!isCreditTxn && balanceDue <= 0)) return false;
    } else if (creditFilter === "CREDIT_PAYABLE") {
      if (t.type !== 'OUT' || (!isCreditTxn && balanceDue <= 0)) return false;
    } else if (creditFilter === "SETTLED_CREDIT") {
      const isSettled = t.credit_status === 'PAID' && (
        Boolean(t.custom_data?.is_credit_initial) || 
        Boolean(t.custom_data?.is_credit_settlement) || 
        (t.total_amount != null && t.total_amount > t.amount)
      );
      if (!isSettled) return false;
    }

    // 6. Date Filter
    if (fromDate && new Date(t.date) < new Date(fromDate + "T00:00:00Z")) return false;
    if (toDate && new Date(t.date) > new Date(toDate + "T23:59:59Z")) return false;
    
    return true;
  });

  // Financial aggregates across filtered results
  const totalIn = filteredTransactions
    .filter(t => t.type === "IN")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const totalOut = filteredTransactions
    .filter(t => t.type === "OUT")
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  // Filtered Credit breakdown
  const filteredReceivableDue = filteredTransactions
    .filter(t => t.type === "IN")
    .reduce((acc, t) => acc + (Number(t.balance_due) || 0), 0);

  const filteredPayableDue = filteredTransactions
    .filter(t => t.type === "OUT")
    .reduce((acc, t) => acc + (Number(t.balance_due) || 0), 0);

  const totalCreditDue = filteredTransactions
    .reduce((acc, t) => acc + (Number(t.balance_due) || 0), 0);

  const openCreditCount = filteredTransactions
    .filter(t => (Number(t.balance_due) || 0) > 0).length;

  const exportToCsv = () => {
    if (filteredTransactions.length === 0) {
      alert("No data to export.");
      return;
    }
    
    // CSV Header with Credit attributes
    const headers = [
      "Date", 
      "Type", 
      "Category", 
      "Entity", 
      "Cash Paid (Amount)", 
      "Total Bill", 
      "Balance Due", 
      "Credit Status", 
      "Notes"
    ];
    
    // CSV Rows
    const rows = filteredTransactions.map(t => [
      new Date(t.date).toLocaleDateString(),
      t.type,
      `"${t.category_name || ""}"`,
      `"${t.entity_name || ""}"`,
      t.amount,
      t.total_amount != null ? t.total_amount : t.amount,
      t.balance_due != null ? t.balance_due : 0,
      t.credit_status || "PAID",
      `"${t.notes ? t.notes.replace(/"/g, '""') : ""}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `export_analytics_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics & Search</h2>
          <p className="text-muted-foreground mt-1">Deep analysis across transactions, cash flows, and credit ledgers.</p>
        </div>
        <Button variant="outline" onClick={exportToCsv} className="self-start sm:self-auto cursor-pointer">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filter Control Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card border rounded-xl p-2 shadow-sm">
        <div className="relative flex-1 w-full flex items-center pl-2">
          <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
          <Input 
            placeholder="Search notes, contacts, categories, amounts..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border-0 focus-visible:ring-0 shadow-none text-sm placeholder:text-muted-foreground"
          />
        </div>
        
        <div className="hidden sm:block h-8 w-px bg-border"></div>
        
        <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center">
          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground text-xs hover:text-foreground cursor-pointer">
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear Filters
            </Button>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="relative w-full sm:w-auto cursor-pointer">
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary border-primary/30">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Advanced Filters</SheetTitle>
                <SheetDescription>
                  Filter transactions across cash flow types, categories, entities, and credit parameters.
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-5 py-6">
                {/* 1. Transaction Type */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Cashflow Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Cashflows</SelectItem>
                      <SelectItem value="IN">Income / Cash IN</SelectItem>
                      <SelectItem value="OUT">Expense / Cash OUT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Credit & Payment Filter */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Credit &amp; Payment Status</Label>
                  <Select value={creditFilter} onValueChange={setCreditFilter}>
                    <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All (Cash &amp; Credit)</SelectItem>
                      <SelectItem value="CASH_ONLY">Pure Cash Only (No Credit)</SelectItem>
                      <SelectItem value="ALL_CREDIT">All Credit Records (Open &amp; Settled)</SelectItem>
                      <SelectItem value="OPEN_CREDIT">Open Credit Only (Unpaid / Partial)</SelectItem>
                      <SelectItem value="CREDIT_RECEIVABLE">Customer Receivables (To Get - IN)</SelectItem>
                      <SelectItem value="CREDIT_PAYABLE">Supplier Payables (To Give - OUT)</SelectItem>
                      <SelectItem value="SETTLED_CREDIT">Settled Credit (Fully Paid)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* 3. Category Filter */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Category</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Categories</SelectItem>
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* 4. Entity Filter */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Contact / Entity</Label>
                  <Select value={entityFilter} onValueChange={setEntityFilter}>
                    <SelectTrigger><SelectValue placeholder="All Entities" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Contacts</SelectItem>
                      {entities.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name} ({e.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* 5. Date Range */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">From Date</Label>
                    <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 text-xs" />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">To Date</Label>
                    <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 text-xs" />
                  </div>
                </div>
              </div>
              
              <div className="mt-2 pt-4 border-t space-y-2">
                <Button variant="outline" className="w-full text-xs" onClick={clearFilters} disabled={activeFiltersCount === 0}>
                  Reset All Filters
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Quick Credit Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Quick Credit:</span>
        <Button 
          size="sm" 
          variant={creditFilter === "ALL" ? "default" : "outline"}
          onClick={() => setCreditFilter("ALL")}
          className={`h-7 text-xs rounded-full cursor-pointer ${creditFilter === "ALL" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          All
        </Button>
        <Button 
          size="sm" 
          variant={creditFilter === "CASH_ONLY" ? "default" : "outline"}
          onClick={() => setCreditFilter("CASH_ONLY")}
          className={`h-7 text-xs rounded-full cursor-pointer ${creditFilter === "CASH_ONLY" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          Cash Only
        </Button>
        <Button 
          size="sm" 
          variant={creditFilter === "OPEN_CREDIT" ? "default" : "outline"}
          onClick={() => setCreditFilter("OPEN_CREDIT")}
          className={`h-7 text-xs rounded-full cursor-pointer ${creditFilter === "OPEN_CREDIT" ? "bg-amber-600 text-white hover:bg-amber-500" : "text-amber-400 border-amber-500/30"}`}
        >
          Open Credit
        </Button>
        <Button 
          size="sm" 
          variant={creditFilter === "CREDIT_RECEIVABLE" ? "default" : "outline"}
          onClick={() => setCreditFilter("CREDIT_RECEIVABLE")}
          className={`h-7 text-xs rounded-full cursor-pointer ${creditFilter === "CREDIT_RECEIVABLE" ? "bg-emerald-600 text-white hover:bg-emerald-500" : "text-emerald-400 border-emerald-500/30"}`}
        >
          Receivables (To Get)
        </Button>
        <Button 
          size="sm" 
          variant={creditFilter === "CREDIT_PAYABLE" ? "default" : "outline"}
          onClick={() => setCreditFilter("CREDIT_PAYABLE")}
          className={`h-7 text-xs rounded-full cursor-pointer ${creditFilter === "CREDIT_PAYABLE" ? "bg-rose-600 text-white hover:bg-rose-500" : "text-rose-400 border-rose-500/30"}`}
        >
          Payables (To Give)
        </Button>
      </div>

      {/* 4 Analytics Summary Cards: Filtered IN, Filtered OUT, Filtered Credit, Filtered Net */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-1">
        {/* Card 1: Filtered IN */}
        <Card className="hover:border-emerald-500/30 transition-all shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtered IN</span>
              <div className="p-1 rounded bg-emerald-500/10 text-emerald-400">
                <ArrowDownLeft className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-500">₹{totalIn.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Realized cash inflow</p>
          </CardContent>
        </Card>

        {/* Card 2: Filtered OUT */}
        <Card className="hover:border-rose-500/30 transition-all shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtered OUT</span>
              <div className="p-1 rounded bg-rose-500/10 text-rose-400">
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-500">₹{totalOut.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Realized cash outflow</p>
          </CardContent>
        </Card>

        {/* Card 3: Filtered Credit */}
        <Card className="hover:border-amber-500/30 transition-all shadow-sm border-amber-500/20 bg-gradient-to-br from-card via-card to-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtered Credit</span>
              <div className="p-1 rounded bg-amber-500/10 text-amber-400">
                <HandCoins className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-500">₹{totalCreditDue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {openCreditCount > 0 ? (
                <span>₹{filteredReceivableDue.toLocaleString()} to get • ₹{filteredPayableDue.toLocaleString()} to give</span>
              ) : (
                <span>No pending credit balance</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Filtered Net Cash & Count */}
        <Card className="hover:border-primary/30 transition-all shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtered Net Cash</span>
              <div className="p-1 rounded bg-primary/10 text-primary">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <div className={`text-2xl font-bold ${totalIn - totalOut >= 0 ? "text-foreground" : "text-rose-400"}`}>
              ₹{(totalIn - totalOut).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredTransactions.length} transaction{filteredTransactions.length === 1 ? "" : "s"} matched
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtered Transactions Table with Credit Details */}
      <div className="rounded-xl border bg-card relative min-h-[300px] overflow-hidden shadow-sm">
        {pageLoading ? (
          <IosLoadingView text="Loading transaction analytics..." minHeight="300px" />
        ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead className="w-[80px]">Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Contact / Entity</TableHead>
                <TableHead className="text-right">Cash Moved</TableHead>
                <TableHead className="text-right">Credit Due</TableHead>
                <TableHead className="w-[110px]">Credit Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No transactions match the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((txn) => {
                  const bal = Number(txn.balance_due) || 0;
                  const total = txn.total_amount != null ? Number(txn.total_amount) : Number(txn.amount);
                  const isSettlement = Boolean(txn.custom_data?.is_credit_settlement);

                  return (
                    <TableRow key={txn.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {new Date(txn.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={txn.type === "IN" ? "default" : "destructive"} 
                          className={`text-[10px] font-semibold ${
                            txn.type === "IN" 
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20" 
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20"
                          }`}
                        >
                          {txn.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-xs">
                        {txn.category_name || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {txn.entity_name ? (
                          <span className="font-medium text-foreground">{txn.entity_name}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className="font-bold">₹{txn.amount.toLocaleString()}</div>
                        {total > txn.amount && (
                          <div className="text-[10px] text-muted-foreground">
                            Bill: ₹{total.toLocaleString()}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {bal > 0 ? (
                          <span className="font-bold text-amber-400">₹{bal.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">₹0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {bal > 0 ? (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]">
                            {txn.credit_status === 'UNPAID' ? 'Unpaid' : 'Partial'}
                          </Badge>
                        ) : isSettlement ? (
                          <Badge variant="outline" className="border-blue-500/40 text-blue-400 bg-blue-500/10 text-[10px]">
                            Settlement
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]">
                            Paid
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={txn.notes || ""}>
                        {txn.notes || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        )}
      </div>
    </div>
  );
}
