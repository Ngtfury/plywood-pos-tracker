import { useState, useEffect } from "react";
import { getTransactions, getCategories, getEntities, Transaction, Category, Entity } from "@/lib/db/queries";
import { useStore } from "@/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Filter, X, Download } from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

export function Analytics() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  
  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const refreshTrigger = useStore(s => s.refreshTrigger);

  useEffect(() => {
    getTransactions().then(setTransactions).catch(console.error);
    getCategories().then(setCategories).catch(console.error);
    getEntities().then(setEntities).catch(console.error);
  }, [refreshTrigger]);

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("ALL");
    setCategoryFilter("ALL");
    setEntityFilter("ALL");
    setFromDate("");
    setToDate("");
  };

  // Count active filters for the badge
  const activeFiltersCount = 
    (typeFilter !== "ALL" ? 1 : 0) +
    (categoryFilter !== "ALL" ? 1 : 0) +
    (entityFilter !== "ALL" ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0);

  const filteredTransactions = transactions.filter(t => {
    // 1. Search Notes
    if (search && !t.notes?.toLowerCase().includes(search.toLowerCase()) && !t.amount.toString().includes(search)) {
      return false;
    }
    // 2. Type filter
    if (typeFilter !== "ALL" && t.type !== typeFilter) return false;
    // 3. Category Filter
    if (categoryFilter !== "ALL" && t.category_id !== categoryFilter) return false;
    // 4. Entity Filter
    if (entityFilter !== "ALL" && t.entity_id !== entityFilter) return false;
    // 5. Date Filter
    if (fromDate && new Date(t.date) < new Date(fromDate + "T00:00:00Z")) return false;
    if (toDate && new Date(t.date) > new Date(toDate + "T23:59:59Z")) return false;
    
    return true;
  });

  const totalIn = filteredTransactions.filter(t => t.type === "IN").reduce((acc, t) => acc + t.amount, 0);
  const totalOut = filteredTransactions.filter(t => t.type === "OUT").reduce((acc, t) => acc + t.amount, 0);

  const exportToCsv = () => {
    if (filteredTransactions.length === 0) {
      alert("No data to export.");
      return;
    }
    
    // CSV Header
    const headers = ["Date", "Type", "Category", "Entity", "Amount", "Notes"];
    
    // CSV Rows
    const rows = filteredTransactions.map(t => [
      new Date(t.date).toLocaleDateString(),
      t.type,
      `"${t.category_name || ""}"`,
      `"${t.entity_name || ""}"`,
      t.amount,
      `"${t.notes ? t.notes.replace(/"/g, '""') : ""}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics & Search</h2>
          <p className="text-muted-foreground">Filter your transactions deeply to analyze your data.</p>
        </div>
        <Button variant="outline" onClick={exportToCsv}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card border rounded-md p-2">
        <div className="relative flex-1 w-full">
          <Input 
            placeholder="Search notes or amount..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border-0 focus-visible:ring-0 shadow-none text-lg"
          />
        </div>
        
        <div className="hidden sm:block h-8 w-px bg-border"></div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          {activeFiltersCount > 0 && (
            <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="relative w-full sm:w-auto">
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-primary/20 hover:bg-primary/30 text-primary">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Advanced Filters</SheetTitle>
                <SheetDescription>
                  Refine your transaction list by applying the filters below.
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-6 py-6">
                <div className="space-y-2">
                  <Label>Transaction Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All</SelectItem>
                      <SelectItem value="IN">Income (IN)</SelectItem>
                      <SelectItem value="OUT">Expense (OUT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Category</Label>
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
                
                <div className="space-y-2">
                  <Label>Entity</Label>
                  <Select value={entityFilter} onValueChange={setEntityFilter}>
                    <SelectTrigger><SelectValue placeholder="All Entities" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Entities</SelectItem>
                      {entities.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>From Date</Label>
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                </div>
                
                <div className="space-y-2">
                  <Label>To Date</Label>
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
              </div>
              
              <div className="mt-4 pt-4 border-t">
                <Button variant="outline" className="w-full" onClick={clearFilters} disabled={activeFiltersCount === 0}>
                  Reset All Filters
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 pt-2">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Filtered IN</div>
            <div className="text-2xl font-bold text-emerald-500">₹{totalIn.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Filtered OUT</div>
            <div className="text-2xl font-bold text-rose-500">₹{totalOut.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Filtered Count</div>
            <div className="text-2xl font-bold">{filteredTransactions.length} results</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No transactions match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    {new Date(txn.date).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={txn.type === "IN" ? "default" : "destructive"}>
                      {txn.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{txn.category_name || "—"}</TableCell>
                  <TableCell>{txn.entity_name || "—"}</TableCell>
                  <TableCell className="font-medium">
                    ₹{txn.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {txn.notes || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
