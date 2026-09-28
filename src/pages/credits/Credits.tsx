import { useState, useEffect, useMemo } from "react";
import { 
  getCreditDashboardStats, 
  getEntityCreditLedgers, 
  recordCreditPayment,
  addCreditRecord,
  deleteCreditTransaction,
  deleteCreditPayment,
  deleteEntityCredits,
  getCategories,
  getEntities,
  EntityCreditLedger,
  Category,
  Entity
} from "@/lib/db/queries";
import { useStore } from "@/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogDescription
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  HandCoins, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Scale, 
  AlertTriangle, 
  Search, 
  History, 
  PlusCircle, 
  CheckCircle2, 
  Clock, 
  FileText,
  Trash2
} from "lucide-react";
import { IosSpinner, IosLoadingView, IosLoadingOverlay } from "@/components/ui/IosSpinner";

export function Credits() {
  const [stats, setStats] = useState({
    totalReceivable: 0,
    totalPayable: 0,
    netCredit: 0,
    overdueCount: 0,
    activeCustomersCount: 0,
    activeSuppliersCount: 0,
    totalPendingAccounts: 0
  });

  // Client-side all ledgers: single source of truth, ZERO lag on tab clicks!
  const [allLedgers, setAllLedgers] = useState<EntityCreditLedger[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"CUSTOMER" | "SUPPLIER" | "ALL">("CUSTOMER");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DUE" | "OVERDUE" | "SETTLED">("ALL");

  // Loading states with Apple iOS rotating animation
  const [pageLoading, setPageLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Passbook Modal state
  const [selectedLedger, setSelectedLedger] = useState<EntityCreditLedger | null>(null);
  const [passbookOpen, setPassbookOpen] = useState(false);

  // Payment Recording Modal state (Disburse / Collect)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentEntityId, setPaymentEntityId] = useState<string>("");
  const [paymentType, setPaymentType] = useState<"IN" | "OUT">("IN");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentBillId, setPaymentBillId] = useState<string>("fifo");
  const [paymentLoading, setPaymentLoading] = useState(false);

  // New Credit Modal state ("Add To Give" / "Add To Get")
  const [addCreditOpen, setAddCreditOpen] = useState(false);
  const [addCreditDirection, setAddCreditDirection] = useState<"TO_GIVE" | "TO_GET">("TO_GIVE");
  const [addCreditEntityId, setAddCreditEntityId] = useState<string>("");
  const [addCreditCategoryId, setAddCreditCategoryId] = useState<string>("");
  const [addCreditTotal, setAddCreditTotal] = useState<string>("");
  const [addCreditPaidUpfront, setAddCreditPaidUpfront] = useState<string>("0");
  const [addCreditDueDate, setAddCreditDueDate] = useState<string>("");
  const [addCreditDate, setAddCreditDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [addCreditNotes, setAddCreditNotes] = useState<string>("");
  const [addCreditLoading, setAddCreditLoading] = useState(false);

  const refreshTrigger = useStore(s => s.refreshTrigger);
  const triggerRefresh = useStore(s => s.triggerRefresh);

  // Load all ledgers, entities & categories
  useEffect(() => {
    setPageLoading(true);
    Promise.all([
      getCreditDashboardStats().then(setStats),
      getEntityCreditLedgers('ALL').then(setAllLedgers),
      getCategories().then(setCategories),
      getEntities().then(setEntities)
    ])
      .catch(console.error)
      .finally(() => setPageLoading(false));
  }, [refreshTrigger]);

  // Keep passbook view updated reactively
  useEffect(() => {
    if (selectedLedger && passbookOpen) {
      const updated = allLedgers.find(l => l.entity.id === selectedLedger.entity.id);
      if (updated) setSelectedLedger(updated);
    }
  }, [allLedgers, passbookOpen, selectedLedger]);

  // Instantaneous, zero-lag client-side tab filtering
  // Only shows entities that have credit activity or open balances
  const currentTabLedgers = useMemo(() => {
    const activeLedgers = allLedgers.filter(l => 
      l.creditTransactions.length > 0 || 
      l.paymentHistory.length > 0 || 
      l.totalBilled > 0 || 
      l.totalReceivable > 0 || 
      l.totalPayable > 0
    );

    if (activeTab === "CUSTOMER") {
      return activeLedgers.filter(l => l.totalReceivable > 0 || l.totalReceivableBilled > 0 || l.entity.type.toLowerCase().includes("customer"));
    }
    if (activeTab === "SUPPLIER") {
      return activeLedgers.filter(l => l.totalPayable > 0 || l.totalPayableBilled > 0 || !l.entity.type.toLowerCase().includes("customer"));
    }
    return activeLedgers;
  }, [allLedgers, activeTab]);

  // Instantaneous search and status filtering
  const filteredLedgers = useMemo(() => {
    return currentTabLedgers.filter(ledger => {
      const hasActivity = ledger.creditTransactions.length > 0 || ledger.paymentHistory.length > 0 || ledger.totalBilled > 0 || ledger.totalReceivable > 0 || ledger.totalPayable > 0;
      if (!hasActivity) return false;

      // 1. Search filter
      if (search) {
        const q = search.toLowerCase();
        const matchName = ledger.entity.name.toLowerCase().includes(q);
        const matchPhone = ledger.entity.phone?.toLowerCase().includes(q);
        if (!matchName && !matchPhone) return false;
      }

      const currentDue = activeTab === "SUPPLIER" 
        ? ledger.totalPayable 
        : (activeTab === "CUSTOMER" ? ledger.totalReceivable : (ledger.totalReceivable + ledger.totalPayable));

      // 2. Status filter
      if (statusFilter === "DUE" && currentDue <= 0) return false;
      if (statusFilter === "SETTLED" && currentDue > 0) return false;
      if (statusFilter === "OVERDUE" && ledger.overdueBillsCount === 0) return false;

      return true;
    });
  }, [currentTabLedgers, search, statusFilter, activeTab]);

  // Current entity selected in payment modal
  const selectedPaymentLedger = useMemo(() => {
    return allLedgers.find(l => l.entity.id === paymentEntityId) || null;
  }, [allLedgers, paymentEntityId]);

  const openPassbook = (ledger: EntityCreditLedger) => {
    setSelectedLedger(ledger);
    setPassbookOpen(true);
  };

  // Open Disburse or Collect Payment modal directly for an entity
  const openPaymentModal = (targetLedger?: EntityCreditLedger, preferredType?: "IN" | "OUT") => {
    const pType = preferredType || (activeTab === "SUPPLIER" ? "OUT" : "IN");
    setPaymentType(pType);

    let defaultEntity: EntityCreditLedger | null = targetLedger || null;
    if (!defaultEntity) {
      if (pType === "OUT") {
        defaultEntity = allLedgers.find(l => l.totalPayable > 0) || 
                        allLedgers.find(l => !l.entity.type.toLowerCase().includes("customer")) || 
                        allLedgers[0] || null;
      } else {
        defaultEntity = allLedgers.find(l => l.totalReceivable > 0) || 
                        allLedgers.find(l => l.entity.type.toLowerCase().includes("customer")) || 
                        allLedgers[0] || null;
      }
    }

    if (defaultEntity) {
      setPaymentEntityId(defaultEntity.entity.id);
      const balance = pType === "IN" ? defaultEntity.totalReceivable : defaultEntity.totalPayable;
      setPaymentAmount(balance > 0 ? balance.toString() : "");
    } else {
      setPaymentEntityId("");
      setPaymentAmount("");
    }

    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentNotes("");
    setPaymentBillId("fifo");
    setPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentEntityId || !paymentAmount || parseFloat(paymentAmount) <= 0) return;

    setPaymentLoading(true);
    try {
      await recordCreditPayment({
        entity_id: paymentEntityId,
        amount: parseFloat(paymentAmount),
        payment_type: paymentType,
        transaction_id: paymentBillId === "fifo" ? null : paymentBillId,
        payment_date: paymentDate + "T12:00:00Z",
        notes: paymentNotes
      });

      triggerRefresh();
      setPaymentModalOpen(false);
    } catch (err: any) {
      console.error("Failed to record payment:", err);
      alert("Error recording payment: " + (err?.message || err));
    } finally {
      setPaymentLoading(false);
    }
  };

  // Handle "+ Add Credit" (Directly add To Give or To Get credit)
  const openAddCreditModal = (direction: "TO_GIVE" | "TO_GET") => {
    setAddCreditDirection(direction);
    if (direction === "TO_GIVE") {
      const sup = entities.find(e => !e.type.toLowerCase().includes("customer")) || entities[0];
      setAddCreditEntityId(sup ? sup.id : "");
    } else {
      const cust = entities.find(e => e.type.toLowerCase().includes("customer")) || entities[0];
      setAddCreditEntityId(cust ? cust.id : "");
    }
    setAddCreditCategoryId("");
    setAddCreditTotal("");
    setAddCreditPaidUpfront("0");
    setAddCreditDueDate("");
    setAddCreditDate(new Date().toISOString().split('T')[0]);
    setAddCreditNotes("");
    setAddCreditOpen(true);
  };

  const handleSaveNewCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(addCreditTotal);
    const paid = parseFloat(addCreditPaidUpfront) || 0;
    if (!addCreditEntityId || isNaN(total) || total <= 0) {
      alert("Please select a contact and enter a valid total amount.");
      return;
    }

    setAddCreditLoading(true);
    try {
      await addCreditRecord({
        entity_id: addCreditEntityId,
        direction: addCreditDirection,
        total_amount: total,
        paid_amount: paid,
        category_id: addCreditCategoryId && addCreditCategoryId !== "none" ? addCreditCategoryId : null,
        due_date: addCreditDueDate || null,
        date: addCreditDate,
        notes: addCreditNotes
      });

      triggerRefresh();
      setAddCreditOpen(false);
    } catch (err: any) {
      console.error("Failed to add credit record:", err);
      alert("Error saving credit: " + (err?.message || err));
    } finally {
      setAddCreditLoading(false);
    }
  };

  // Delete handlers with smooth iOS loading indicator
  const handleDeleteBill = async (txnId: string) => {
    if (!window.confirm("Are you sure you want to delete this credit bill? This will also remove any payments tied to it.")) return;
    setActionLoading("Deleting bill...");
    try {
      await deleteCreditTransaction(txnId);
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete bill: " + (err?.message || err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm("Are you sure you want to delete this payment installment? The amount will be restored to the open bill balance.")) return;
    setActionLoading("Deleting payment...");
    try {
      await deleteCreditPayment(paymentId);
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete payment: " + (err?.message || err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteEntityCredits = async (entityId: string, entityName: string) => {
    if (!window.confirm(`Are you sure you want to completely delete all credit transactions and payment history for ${entityName}?`)) return;
    setActionLoading(`Deleting credits for ${entityName}...`);
    try {
      await deleteEntityCredits(entityId);
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete credits: " + (err?.message || err));
    } finally {
      setActionLoading(null);
    }
  };

  // Calculation for Add Credit modal preview
  const newCreditTotalNum = parseFloat(addCreditTotal) || 0;
  const newCreditPaidNum = parseFloat(addCreditPaidUpfront) || 0;
  const newCreditBalanceDue = Math.max(0, newCreditTotalNum - newCreditPaidNum);

  // Calculation for Payment modal preview
  const curOpenBalance = selectedPaymentLedger 
    ? (paymentType === "OUT" ? selectedPaymentLedger.totalPayable : selectedPaymentLedger.totalReceivable)
    : 0;
  const curPayAmountNum = parseFloat(paymentAmount) || 0;
  const curRemainingAfterPayment = Math.max(0, curOpenBalance - curPayAmountNum);

  return (
    <div className="space-y-6">
      {/* Top Header: ONLY "Add Credit" at top as requested */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-3xl font-bold tracking-tight">Credits</h2>
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 font-medium">
              Receivables & Payables
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Track receivables (money to get) from customers and payables (money to give) to suppliers.
          </p>
        </div>

        {/* Top Action Button: ONLY Add Credit */}
        <div className="flex items-center gap-2.5">
          <Button 
            onClick={() => openAddCreditModal(activeTab === "SUPPLIER" ? "TO_GIVE" : "TO_GET")}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow"
          >
            <PlusCircle className="h-4 w-4 mr-1.5" />
            Add Credit
          </Button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-emerald-500/20 bg-emerald-950/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-400">
              Credits to Get (Receivables)
            </CardTitle>
            <ArrowDownLeft className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              ₹{stats.totalReceivable.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From {stats.activeCustomersCount} pending customer account(s)
            </p>
          </CardContent>
        </Card>

        <Card className="border-rose-500/20 bg-rose-950/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-rose-400">
              Credits to Give (Payables)
            </CardTitle>
            <ArrowUpRight className="h-5 w-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">
              ₹{stats.totalPayable.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Owed to {stats.activeSuppliersCount} supplier/transporter account(s)
            </p>
          </CardContent>
        </Card>

        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Net Credit Position
            </CardTitle>
            <Scale className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.netCredit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {stats.netCredit >= 0 ? "+" : ""}₹{stats.netCredit.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.netCredit >= 0 ? "Net asset (More to get than give)" : "Net liability (More to give than get)"}
            </p>
          </CardContent>
        </Card>

        <Card className={`shadow-sm ${stats.overdueCount > 0 ? "border-amber-500/30 bg-amber-950/10" : ""}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-amber-400">
              Overdue Invoices
            </CardTitle>
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {stats.overdueCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.overdueCount > 0 ? "Bills past their expected due date" : "All payments are within due date"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        {/* Navigation Tabs - Client-side instant switching */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg border max-w-fit">
          <button
            onClick={() => setActiveTab("CUSTOMER")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${
              activeTab === "CUSTOMER" 
                ? "bg-background text-foreground shadow-sm font-semibold" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            To Get (Customers)
          </button>
          <button
            onClick={() => setActiveTab("SUPPLIER")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${
              activeTab === "SUPPLIER" 
                ? "bg-background text-foreground shadow-sm font-semibold" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            To Give (Suppliers)
          </button>
          <button
            onClick={() => setActiveTab("ALL")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${
              activeTab === "ALL" 
                ? "bg-background text-foreground shadow-sm font-semibold" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Contacts
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search contact or phone..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="DUE">Pending Due</SelectItem>
              <SelectItem value="OVERDUE">Overdue Only</SelectItem>
              <SelectItem value="SETTLED">Fully Settled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="rounded-md border bg-card overflow-hidden relative min-h-[300px]">
        {actionLoading && <IosLoadingOverlay text={actionLoading} />}

        {pageLoading ? (
          <IosLoadingView text="Loading credit ledgers..." minHeight="300px" />
        ) : (
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              {activeTab === "SUPPLIER" ? (
                <>
                  <TableHead>Total Owed / Purchased</TableHead>
                  <TableHead>Disbursed So Far</TableHead>
                  <TableHead>Balance to Give</TableHead>
                </>
              ) : activeTab === "CUSTOMER" ? (
                <>
                  <TableHead>Total Invoiced</TableHead>
                  <TableHead>Collected So Far</TableHead>
                  <TableHead>Balance to Get</TableHead>
                </>
              ) : (
                <>
                  <TableHead>Total Billed</TableHead>
                  <TableHead>Total Settled</TableHead>
                  <TableHead>Net Balance</TableHead>
                </>
              )}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLedgers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  <HandCoins className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No credit accounts found. Click <strong>"Add Credit"</strong> above to record a credit!
                </TableCell>
              </TableRow>
            ) : (
              filteredLedgers.map((ledger) => {
                const isSupplierTab = activeTab === "SUPPLIER";
                const isCustomerTab = activeTab === "CUSTOMER";
                
                const dueAmount = isSupplierTab 
                  ? ledger.totalPayable 
                  : (isCustomerTab ? ledger.totalReceivable : (ledger.totalReceivable > 0 ? ledger.totalReceivable : ledger.totalPayable));

                const billedAmount = isSupplierTab ? ledger.totalPayableBilled : (isCustomerTab ? ledger.totalReceivableBilled : ledger.totalBilled);
                const paidAmount = isSupplierTab ? ledger.totalPayablePaid : (isCustomerTab ? ledger.totalReceivablePaid : ledger.totalPaid);
                const isOverdue = ledger.overdueBillsCount > 0;

                return (
                  <TableRow key={ledger.entity.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          {ledger.entity.name}
                          <Badge variant="outline" className="text-xs font-normal">
                            {ledger.entity.type}
                          </Badge>
                        </div>
                        {ledger.entity.notes && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">
                            {ledger.entity.notes}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {ledger.entity.phone || "—"}
                    </TableCell>

                    <TableCell className="font-medium">
                      ₹{billedAmount.toLocaleString()}
                    </TableCell>

                    <TableCell className="text-emerald-500 font-medium">
                      ₹{paidAmount.toLocaleString()}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-base font-bold ${
                          dueAmount === 0 
                            ? "text-muted-foreground" 
                            : (isSupplierTab || (!isCustomerTab && ledger.totalPayable > 0) ? "text-rose-400" : "text-amber-400")
                        }`}>
                          ₹{dueAmount.toLocaleString()}
                        </span>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {dueAmount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
                          <Clock className="h-3 w-3" /> {ledger.openBillsCount} pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Completed
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => openPassbook(ledger)}
                          className="h-8 text-xs gap-1.5"
                          title="View statement & bills"
                        >
                          <History className="h-3.5 w-3.5 text-muted-foreground" />
                          History
                        </Button>

                        {/* Context-aware payment button right near the row */}
                        {isSupplierTab || (!isCustomerTab && ledger.totalPayable > 0) ? (
                          <Button 
                            size="sm"
                            onClick={() => openPaymentModal(ledger, "OUT")}
                            className="h-8 text-xs gap-1 bg-rose-600 hover:bg-rose-700 text-white"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Disburse
                          </Button>
                        ) : (
                          <Button 
                            size="sm"
                            onClick={() => openPaymentModal(ledger, "IN")}
                            className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                            Collect
                          </Button>
                        )}

                        {/* Delete Entity Credits */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteEntityCredits(ledger.entity.id, ledger.entity.name)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete all credits for this contact"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        )}
      </div>

      {/* ========================================================= */}
      {/* 1. ADD CREDIT MODAL (DIRECTLY ADD "TO GIVE" / "TO GET")    */}
      {/* ========================================================= */}
      <Dialog open={addCreditOpen} onOpenChange={setAddCreditOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" />
              Add Credit Entry
            </DialogTitle>
            <DialogDescription>
              Record a credit obligation (To Give to supplier/vendor or To Get from customer).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveNewCredit} className="space-y-4 py-2">
            {/* Direction Selector Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg border">
              <button
                type="button"
                onClick={() => setAddCreditDirection("TO_GIVE")}
                className={`py-2 text-xs font-semibold rounded transition-colors cursor-pointer ${
                  addCreditDirection === "TO_GIVE"
                    ? "bg-rose-600 text-white shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                To Give (We Owe - Payable)
              </button>
              <button
                type="button"
                onClick={() => setAddCreditDirection("TO_GET")}
                className={`py-2 text-xs font-semibold rounded transition-colors cursor-pointer ${
                  addCreditDirection === "TO_GET"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                To Get (Customer Owes - Receivable)
              </button>
            </div>

            {/* Select Entity */}
            <div className="space-y-1.5">
              <Label>Contact / Entity *</Label>
              <Select value={addCreditEntityId} onValueChange={setAddCreditEntityId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select contact or supplier..." />
                </SelectTrigger>
                <SelectContent>
                  {entities.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({e.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category (Optional) */}
            <div className="space-y-1.5">
              <Label>Category (Optional)</Label>
              <Select value={addCreditCategoryId || "none"} onValueChange={(val) => setAddCreditCategoryId(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Default category based on direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Default --</SelectItem>
                  {categories
                    .filter(c => c.type === "BOTH" || (addCreditDirection === "TO_GIVE" ? c.type === "OUT" : c.type === "IN"))
                    .map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            {/* Amounts Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="addTotal">Total Credit Amount (₹) *</Label>
                <Input 
                  id="addTotal"
                  type="number"
                  placeholder="e.g. 100000"
                  value={addCreditTotal}
                  onChange={e => setAddCreditTotal(e.target.value)}
                  required
                  min="0.01"
                  step="0.01"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="addPaid">Initial Paid Upfront (₹)</Label>
                <Input 
                  id="addPaid"
                  type="number"
                  placeholder="0.00 if fully on credit"
                  value={addCreditPaidUpfront}
                  onChange={e => setAddCreditPaidUpfront(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {/* Dynamic Balance Banner */}
            <div className="p-3 rounded-lg border bg-muted/40 flex items-center justify-between text-xs">
              <div>
                <span className="text-muted-foreground">
                  {addCreditDirection === "TO_GIVE" ? "Remaining Balance to Give: " : "Remaining Balance to Get: "}
                </span>
                <span className={`font-bold text-sm ${addCreditDirection === "TO_GIVE" ? "text-rose-400" : "text-amber-400"}`}>
                  ₹{newCreditBalanceDue.toLocaleString()}
                </span>
              </div>
              <Badge variant="outline" className={addCreditDirection === "TO_GIVE" ? "border-rose-500/40 text-rose-400" : "border-emerald-500/40 text-emerald-400"}>
                {addCreditDirection === "TO_GIVE" ? "Supplier Payable" : "Customer Receivable"}
              </Badge>
            </div>

            {/* Date and Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="addDate">Date *</Label>
                <Input 
                  id="addDate"
                  type="date"
                  value={addCreditDate}
                  onChange={e => setAddCreditDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="addDue">Target Due Date (Optional)</Label>
                <Input 
                  id="addDue"
                  type="date"
                  value={addCreditDueDate}
                  onChange={e => setAddCreditDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="addNotes">Description / Bill Reference</Label>
              <Input 
                id="addNotes"
                placeholder="e.g. 500 Plywood sheets batch #4, Freight charges"
                value={addCreditNotes}
                onChange={e => setAddCreditNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setAddCreditOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={addCreditLoading || !addCreditEntityId || !addCreditTotal}
                className={addCreditDirection === "TO_GIVE" ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
              >
                {addCreditLoading ? (
                  <span className="flex items-center gap-2">
                    <IosSpinner size="sm" className="text-white" />
                    Saving...
                  </span>
                ) : (
                  "Save Credit Entry"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* 2. RECORD PAYMENT MODAL (DISBURSE OR COLLECT)              */}
      {/* ========================================================= */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-primary" />
              {paymentType === "OUT" ? "Disburse Payment (To Give)" : "Collect Payment (To Get)"}
            </DialogTitle>
            <DialogDescription>
              {paymentType === "OUT" 
                ? "Record a payment disbursed to a supplier or transporter until balance completion." 
                : "Record an installment or full recovery payment collected from a customer."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordPayment} className="space-y-4 py-2">
            {/* Direction Toggle inside modal for full flexibility */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg border">
              <button
                type="button"
                onClick={() => {
                  setPaymentType("OUT");
                  if (selectedPaymentLedger) {
                    setPaymentAmount(selectedPaymentLedger.totalPayable > 0 ? selectedPaymentLedger.totalPayable.toString() : "");
                  }
                }}
                className={`py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                  paymentType === "OUT"
                    ? "bg-rose-600 text-white shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Disburse to Supplier (OUT)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentType("IN");
                  if (selectedPaymentLedger) {
                    setPaymentAmount(selectedPaymentLedger.totalReceivable > 0 ? selectedPaymentLedger.totalReceivable.toString() : "");
                  }
                }}
                className={`py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer ${
                  paymentType === "IN"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Collect from Customer (IN)
              </button>
            </div>

            {/* Entity Selector (Contains all contacts with their balances) */}
            <div className="space-y-1.5">
              <Label>Select Contact *</Label>
              <Select 
                value={paymentEntityId} 
                onValueChange={(id) => {
                  setPaymentEntityId(id);
                  const found = allLedgers.find(l => l.entity.id === id);
                  if (found) {
                    const bal = paymentType === "OUT" ? found.totalPayable : found.totalReceivable;
                    setPaymentAmount(bal > 0 ? bal.toString() : "");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contact..." />
                </SelectTrigger>
                <SelectContent>
                  {allLedgers.map(l => {
                    const bal = paymentType === "OUT" ? l.totalPayable : l.totalReceivable;
                    return (
                      <SelectItem key={l.entity.id} value={l.entity.id}>
                        {l.entity.name} ({l.entity.type}) {bal > 0 ? `— Due: ₹${bal.toLocaleString()}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Balance Overview Card */}
            {selectedPaymentLedger && (
              <div className="p-3 rounded-lg border bg-muted/40 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current Open Balance:</span>
                  <span className={`font-bold text-sm ${paymentType === "OUT" ? "text-rose-400" : "text-amber-400"}`}>
                    ₹{curOpenBalance.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t">
                  <span className="text-muted-foreground">Remaining After This Payment:</span>
                  <span className={`font-semibold ${curRemainingAfterPayment === 0 ? "text-emerald-400" : "text-foreground"}`}>
                    ₹{curRemainingAfterPayment.toLocaleString()}
                    {curRemainingAfterPayment === 0 && curOpenBalance > 0 && " (Fully Completed!)"}
                  </span>
                </div>
              </div>
            )}

            {/* Payment Amount & Quick Chips */}
            <div className="space-y-1.5">
              <Label htmlFor="payAmount">Payment Amount (₹) *</Label>
              <Input 
                id="payAmount"
                type="number"
                placeholder="e.g. 20000"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                required
                min="0.01"
                step="0.01"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[5000, 10000, 25000, 50000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPaymentAmount(val.toString())}
                    className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors border cursor-pointer"
                  >
                    +₹{val.toLocaleString()}
                  </button>
                ))}
                {curOpenBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(curOpenBalance.toString())}
                    className="text-xs px-2 py-0.5 rounded bg-primary/20 hover:bg-primary/30 text-primary font-medium transition-colors border border-primary/40 cursor-pointer"
                  >
                    Pay Full (₹{curOpenBalance.toLocaleString()})
                  </button>
                )}
              </div>
            </div>

            {/* Date and Allocation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="payDate">Payment Date *</Label>
                <Input 
                  id="payDate"
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Allocation</Label>
                <Select value={paymentBillId} onValueChange={setPaymentBillId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fifo">Auto (Oldest bills first)</SelectItem>
                    {selectedPaymentLedger?.creditTransactions
                      .filter(t => (t.balance_due || 0) > 0 && (paymentType === "OUT" ? t.type === "OUT" : t.type === "IN"))
                      .map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          Bill: ₹{(t.balance_due || 0).toLocaleString()} due ({new Date(t.date).toLocaleDateString()})
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="payNotes">Payment Reference / Notes</Label>
              <Input 
                id="payNotes"
                placeholder="e.g. Month 1 installment, UPI Ref #9042, Cheque"
                value={paymentNotes}
                onChange={e => setPaymentNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={paymentLoading || !paymentEntityId || !paymentAmount}
                className={paymentType === "OUT" ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
              >
                {paymentLoading ? (
                  <span className="flex items-center gap-2">
                    <IosSpinner size="sm" className="text-white" />
                    Recording...
                  </span>
                ) : (
                  `Confirm ${paymentType === "OUT" ? "Disbursement" : "Collection"}`
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* 3. ENTITY PASSBOOK / STATEMENT MODAL                      */}
      {/* ========================================================= */}
      <Dialog open={passbookOpen} onOpenChange={setPassbookOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[88vh] overflow-y-auto">
          {actionLoading && <IosLoadingOverlay text={actionLoading} />}
          {selectedLedger && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-4">
                  <div>
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      {selectedLedger.entity.name}
                    </DialogTitle>
                    <DialogDescription className="mt-0.5">
                      {selectedLedger.entity.type} • Contact: {selectedLedger.entity.phone || "No phone"}
                    </DialogDescription>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => {
                      setPassbookOpen(false);
                      openPaymentModal(selectedLedger);
                    }}
                    className={selectedLedger.totalPayable > 0 ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                  >
                    {selectedLedger.totalPayable > 0 ? "Disburse Payment" : "Collect Payment"}
                  </Button>
                </div>
              </DialogHeader>

              {/* Passbook Balance Header Card */}
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-lg border bg-muted/30 text-center my-2">
                <div>
                  <p className="text-xs text-muted-foreground">Total Invoiced / Owed</p>
                  <p className="text-lg font-bold">₹{selectedLedger.totalBilled.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Settled / Paid</p>
                  <p className="text-lg font-bold text-emerald-400">₹{selectedLedger.totalPaid.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {selectedLedger.totalPayable > 0 ? "Remaining to Give" : "Remaining to Get"}
                  </p>
                  <p className={`text-lg font-bold ${selectedLedger.totalPayable > 0 ? "text-rose-400" : "text-amber-400"}`}>
                    ₹{(selectedLedger.totalReceivable + selectedLedger.totalPayable).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* SECTION A: INVOICES / BILLS (With Delete Option) */}
              <div className="space-y-2 mt-4">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Credit Invoices & Bills
                </h4>
                <div className="rounded border overflow-x-auto max-h-[220px]">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Total Bill</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead>Balance Due</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLedger.creditTransactions.filter(t => !t.custom_data?.is_credit_settlement).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                            No bills found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedLedger.creditTransactions
                          .filter(t => !t.custom_data?.is_credit_settlement)
                          .map(txn => {
                            const total = txn.total_amount != null ? txn.total_amount : txn.amount;
                            const paid = txn.paid_amount != null ? txn.paid_amount : txn.amount;
                            const bal = txn.balance_due != null ? txn.balance_due : Math.max(0, total - paid);
                            const isOverdue = txn.due_date && new Date(txn.due_date) < new Date() && bal > 0;

                            return (
                              <TableRow key={txn.id}>
                                <TableCell>{new Date(txn.date).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={txn.type === "IN" ? "text-emerald-400 border-emerald-500/30" : "text-rose-400 border-rose-500/30"}>
                                    {txn.type === "IN" ? "To Get" : "To Give"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-medium">₹{total.toLocaleString()}</TableCell>
                                <TableCell className="text-emerald-500">₹{paid.toLocaleString()}</TableCell>
                                <TableCell className={`font-bold ${bal > 0 ? (txn.type === "OUT" ? "text-rose-400" : "text-amber-400") : "text-muted-foreground"}`}>
                                  ₹{bal.toLocaleString()}
                                </TableCell>
                                <TableCell className={isOverdue ? "text-rose-400 font-semibold" : "text-muted-foreground"}>
                                  {txn.due_date ? new Date(txn.due_date).toLocaleDateString() : "—"}
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-[10px] ${
                                      bal === 0 
                                        ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" 
                                        : (isOverdue ? "border-rose-500/40 text-rose-400 bg-rose-500/10" : "border-amber-500/40 text-amber-400 bg-amber-500/10")
                                    }`}
                                  >
                                    {bal === 0 ? "COMPLETED" : (isOverdue ? "OVERDUE" : "PARTIAL")}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteBill(txn.id)}
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    title="Delete this bill"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* SECTION B: INSTALLMENT PAYMENTS TIMELINE (With Delete Option) */}
              <div className="space-y-2 mt-4">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Installment Repayment History
                </h4>
                <div className="rounded border overflow-x-auto max-h-[180px]">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLedger.paymentHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                            No installment repayments logged yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedLedger.paymentHistory.map(p => (
                          <TableRow key={p.id}>
                            <TableCell>{new Date(p.payment_date).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={p.payment_type === "IN" ? "text-emerald-400 border-emerald-500/30" : "text-rose-400 border-rose-500/30"}>
                                {p.payment_type === "IN" ? "Collected" : "Disbursed"}
                              </Badge>
                            </TableCell>
                            <TableCell className={`font-bold ${p.payment_type === "OUT" ? "text-rose-400" : "text-emerald-400"}`}>
                              ₹{p.amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.notes || "Credit settlement installment"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeletePayment(p.id)}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Delete payment (restores bill balance)"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <DialogFooter className="mt-4 pt-3 border-t">
                <Button variant="outline" onClick={() => setPassbookOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
