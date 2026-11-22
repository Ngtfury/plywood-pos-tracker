// =========================================================================
// PLYWOOD POS & ERP - BANK RECONCILIATION STATEMENT (BRS)
// src/pages/banking/Banking.tsx
// Statement ingestion, auto-transaction generation, and duplicate review.
// =========================================================================

import { useState, useEffect, useMemo, useRef } from "react";
import { useStore } from "@/store";
import { BusinessEntitySelector } from "@/components/erp/BusinessEntitySelector";
import { IosLoadingView, IosSpinner } from "@/components/ui/IosSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  TableRow,
} from "@/components/ui/table";
import {
  Landmark,
  PlusCircle,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Pencil,
  ShieldAlert,
  Sparkles,
  XCircle,
  Plus,
} from "lucide-react";
import type { BankAccount, BankStatementTransaction, BusinessEntity } from "@/lib/db/erp";
import { getBankAccounts, upsertBankAccount, getBusinessEntities } from "@/lib/db/accounting";
import {
  getBankStatementTransactions,
  importBankStatementRow,
  importBankStatementBatch,
  mergeStatementWithTransaction,
  approveDuplicateAsNewTransaction,
  dismissStatement,
  updateBankStatementTransaction,
} from "@/lib/db/banking";
import {
  parseBankStatementCsv,
  ParsedStatementRow,
} from "@/lib/banking/bankCsvParser";

export function Banking() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [statements, setStatements] = useState<BankStatementTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<"UNDER_REVIEW" | "RECONCILED" | "ALL">("UNDER_REVIEW");

  // Business Entities (for Bank Account Company assignment)
  const [entities, setEntities] = useState<BusinessEntity[]>([]);

  // Add Bank Account Modal State
  const [addBankModalOpen, setAddBankModalOpen] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [bankForm, setBankForm] = useState({
    bank_name: "",
    account_no: "",
    branch_name: "",
    ifsc: "",
    opening_balance: "0",
    business_entity_id: "",
  });

  // CSV Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedStatementRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Manual Statement Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [stmtDate, setStmtDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [stmtParticulars, setStmtParticulars] = useState("");
  const [stmtChequeNo, setStmtChequeNo] = useState("");
  const [stmtWithdrawal, setStmtWithdrawal] = useState("");
  const [stmtDeposit, setStmtDeposit] = useState("");
  const [stmtBalance, setStmtBalance] = useState("");

  // Edit Statement Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStmt, setEditingStmt] = useState<BankStatementTransaction | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDebit, setEditDebit] = useState("");
  const [editCredit, setEditCredit] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editRef, setEditRef] = useState("");

  // Action busy state for duplicate review cards
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Load bank accounts
  const loadAccounts = () => {
    setLoading(true);
    getBankAccounts(selectedEntityId || undefined)
      .then((bList) => {
        setBankAccounts(bList);
        if (bList.length > 0) {
          if (!selectedBankId || !bList.some((b) => b.id === selectedBankId)) {
            setSelectedBankId(bList[0].id);
          }
        } else {
          setSelectedBankId("");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadAccounts, [selectedEntityId, refreshTrigger]);

  // Load statement transactions for active bank
  const loadStatements = () => {
    if (!selectedBankId) {
      setStatements([]);
      return;
    }
    getBankStatementTransactions({ bankAccountId: selectedBankId })
      .then((data) => {
        setStatements(data);
        // If there are rows under review, automatically show the Under Review tab!
        const reviewCount = data.filter((s) => s.review_status === "under_review").length;
        if (reviewCount > 0) {
          setActiveTab("UNDER_REVIEW");
        } else if (activeTab === "UNDER_REVIEW") {
          setActiveTab("RECONCILED");
        }
      })
      .catch(console.error);
  };

  useEffect(loadStatements, [selectedBankId, refreshTrigger]);

  const activeAccount = useMemo(
    () => bankAccounts.find((b) => b.id === selectedBankId),
    [bankAccounts, selectedBankId]
  );

  // Categorized Statement Buckets
  const underReviewStatements = useMemo(
    () => statements.filter((s) => s.review_status === "under_review"),
    [statements]
  );

  const reconciledStatements = useMemo(
    () => statements.filter((s) => s.review_status === "auto_added" || s.review_status === "merged"),
    [statements]
  );

  // Totals
  const totalInward = useMemo(
    () => statements.reduce((s, t) => s + (Number(t.credit_amount) || 0), 0),
    [statements]
  );
  const totalOutward = useMemo(
    () => statements.reduce((s, t) => s + (Number(t.debit_amount) || 0), 0),
    [statements]
  );

  // Load Business Entities for company selection
  useEffect(() => {
    getBusinessEntities()
      .then(setEntities)
      .catch(console.error);
  }, [refreshTrigger]);

  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.bank_name.trim() || !bankForm.account_no.trim()) {
      alert("Please enter both Bank Name and Account Number.");
      return;
    }

    setSavingBank(true);
    try {
      const newId = await upsertBankAccount({
        bank_name: bankForm.bank_name.trim(),
        account_no: bankForm.account_no.trim(),
        branch_name: bankForm.branch_name.trim() || undefined,
        ifsc: bankForm.ifsc.trim() || undefined,
        opening_balance: parseFloat(bankForm.opening_balance) || 0,
        business_entity_id: bankForm.business_entity_id || selectedEntityId || undefined,
      });

      setBankForm({
        bank_name: "",
        account_no: "",
        branch_name: "",
        ifsc: "",
        opening_balance: "0",
        business_entity_id: selectedEntityId || "",
      });
      setAddBankModalOpen(false);

      const bList = await getBankAccounts(selectedEntityId || undefined);
      setBankAccounts(bList);
      setSelectedBankId(newId);
      triggerRefresh();
      alert("Bank account created and selected successfully!");
    } catch (err: any) {
      alert("Failed to create bank account: " + (err.message || err));
    } finally {
      setSavingBank(false);
    }
  };

  // ==========================================
  // CSV FILE UPLOAD & PREVIEW
  // ==========================================
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedBankId) {
      alert("Please select or add a bank account before importing a statement.");
      setAddBankModalOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) {
        alert("The selected file is empty.");
        return;
      }

      const parsed = parseBankStatementCsv(text);
      if (!parsed.success || parsed.rows.length === 0) {
        alert(`Failed to parse bank statement CSV: ${parsed.error || "No valid rows detected"}`);
        return;
      }

      setParsedRows(parsed.rows);
      setCsvPreviewOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleConfirmCsvImport = async () => {
    if (!selectedBankId) {
      alert("Please select or add a bank account first.");
      setAddBankModalOpen(true);
      return;
    }
    if (parsedRows.length === 0) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: parsedRows.length });

    const batchId = `import_${Date.now()}`;

    try {
      // High-Speed Bulk Statement Ingestion (reduces 100+ API calls to just 3-4 DB queries)
      const res = await importBankStatementBatch({
        bankAccountId: selectedBankId,
        businessEntityId: activeAccount?.business_entity_id || selectedEntityId || null,
        rows: parsedRows,
        importBatch: batchId,
      });

      setIsImporting(false);
      setCsvPreviewOpen(false);
      triggerRefresh();

      if (res.errors.length > 0) {
        alert(
          `Statement Import completed with warnings:\n${res.errors.join("\n")}\n\nSummary:\n• ${res.autoAddedCount} transactions auto-added to Ledger\n• ${res.underReviewCount} flagged Under Review`
        );
      } else {
        alert(
          `Statement Bulk Import Complete!\n\n• ${res.autoAddedCount} unique transactions added to Transactions Ledger\n• ${res.underReviewCount} flagged Under Review (exact date & cash duplicates)\n• Total rows processed: ${res.totalRows}`
        );
      }

      if (res.underReviewCount > 0) {
        setActiveTab("UNDER_REVIEW");
      } else {
        setActiveTab("RECONCILED");
      }
    } catch (err: any) {
      setIsImporting(false);
      console.error("Bulk statement import failed:", err);
      alert(
        `Statement Import Failed:\n${err.message || err}\n\nAll operations were automatically rolled back. No records were added to your database.`
      );
    }
  };

  // ==========================================
  // MANUAL STATEMENT ENTRY
  // ==========================================
  const handleManualAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankId) {
      alert("Please select a bank account first.");
      return;
    }

    const w = parseFloat(stmtWithdrawal) || 0;
    const d = parseFloat(stmtDeposit) || 0;
    if (w <= 0 && d <= 0) {
      alert("Please enter either a Withdrawal (Debit) or Deposit (Credit) amount.");
      return;
    }

    setSavingManual(true);
    try {
      const res = await importBankStatementRow({
        bankAccountId: selectedBankId,
        businessEntityId: activeAccount?.business_entity_id || selectedEntityId || null,
        date: stmtDate,
        particulars: stmtParticulars.trim() || "Bank Entry",
        chequeNo: stmtChequeNo.trim() || null,
        withdrawals: w,
        deposits: d,
        balance: stmtBalance ? parseFloat(stmtBalance) : undefined,
      });

      triggerRefresh();
      setAddModalOpen(false);
      setStmtParticulars("");
      setStmtChequeNo("");
      setStmtWithdrawal("");
      setStmtDeposit("");
      setStmtBalance("");

      if (res.status === "under_review") {
        alert("A transaction with the exact same date and cash amount already exists! The statement has been placed Under Review for your approval.");
        setActiveTab("UNDER_REVIEW");
      } else {
        alert("Statement entry recorded and transaction created successfully!");
        setActiveTab("RECONCILED");
      }
    } catch (err: any) {
      alert("Error adding statement: " + (err.message || err));
    } finally {
      setSavingManual(false);
    }
  };

  // ==========================================
  // RESOLUTION ACTIONS (DUPLICATE MANAGEMENT)
  // ==========================================
  const handleMergeDuplicate = async (stmt: BankStatementTransaction) => {
    if (!stmt.potential_duplicate_id) return;
    setResolvingId(stmt.id);
    try {
      await mergeStatementWithTransaction(stmt.id, stmt.potential_duplicate_id);
      triggerRefresh();
    } catch (err: any) {
      alert("Error linking statement: " + (err.message || err));
    } finally {
      setResolvingId(null);
    }
  };

  const handleApproveAsNew = async (stmt: BankStatementTransaction) => {
    setResolvingId(stmt.id);
    try {
      await approveDuplicateAsNewTransaction(stmt, activeAccount?.business_entity_id || selectedEntityId || null);
      triggerRefresh();
    } catch (err: any) {
      alert("Error approving new transaction: " + (err.message || err));
    } finally {
      setResolvingId(null);
    }
  };

  const handleDismissDuplicate = async (stmt: BankStatementTransaction) => {
    if (!window.confirm("Ignore this statement entry? It will not be added to Transactions.")) return;
    setResolvingId(stmt.id);
    try {
      await dismissStatement(stmt.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Error dismissing statement: " + (err.message || err));
    } finally {
      setResolvingId(null);
    }
  };

  // ==========================================
  // EDIT STATEMENT ENTRY
  // ==========================================
  const handleOpenEdit = (stmt: BankStatementTransaction) => {
    setEditingStmt(stmt);
    setEditDate(stmt.txn_date ? stmt.txn_date.split("T")[0] : "");
    setEditDesc(stmt.description || "");
    setEditDebit(stmt.debit_amount ? String(stmt.debit_amount) : "");
    setEditCredit(stmt.credit_amount ? String(stmt.credit_amount) : "");
    setEditBalance(stmt.balance != null ? String(stmt.balance) : "");
    setEditRef(stmt.reference || stmt.reference_no || "");
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStmt) return;
    const debit = parseFloat(editDebit) || 0;
    const credit = parseFloat(editCredit) || 0;
    if (debit <= 0 && credit <= 0) {
      alert("Please enter either a Withdrawal (Debit) or Deposit (Credit) amount.");
      return;
    }

    setSavingEdit(true);
    try {
      await updateBankStatementTransaction(
        editingStmt.id,
        {
          txn_date: editDate + "T12:00:00Z",
          description: editDesc.trim() || null,
          debit_amount: debit,
          credit_amount: credit,
          balance: editBalance ? parseFloat(editBalance) : undefined,
          reference: editRef.trim() || null,
        },
        editingStmt
      );

      triggerRefresh();
      setEditModalOpen(false);
      setEditingStmt(null);
    } catch (err: any) {
      alert("Error updating statement: " + (err.message || err));
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bank Reconciliation Statement (BRS)</h2>
        </div>
        <IosLoadingView text="Loading bank statement registers..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bank Reconciliation Statement (BRS)</h2>
          <p className="text-muted-foreground mt-1">
            Import statements, auto-generate transactions, and review potential duplicate entries.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BusinessEntitySelector />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv, .txt"
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => {
              setBankForm((prev) => ({
                ...prev,
                business_entity_id: selectedEntityId || prev.business_entity_id || "",
              }));
              setAddBankModalOpen(true);
            }}
            className="cursor-pointer text-xs h-9 bg-card hover:bg-muted"
          >
            <Landmark className="h-4 w-4 mr-1.5 text-primary" /> + Add Bank Account
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!selectedBankId) {
                alert("Please select or add a bank account first.");
                setAddBankModalOpen(true);
              } else {
                fileInputRef.current?.click();
              }
            }}
            className="cursor-pointer text-xs h-9 bg-card hover:bg-muted"
          >
            <Upload className="h-4 w-4 mr-1.5 text-primary" /> Import CSV Statement
          </Button>
          <Button
            onClick={() => {
              if (!selectedBankId) {
                alert("Please select or add a bank account first.");
                setAddBankModalOpen(true);
              } else {
                setAddModalOpen(true);
              }
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer text-xs h-9 shadow-sm"
          >
            <PlusCircle className="h-4 w-4 mr-1.5" /> Add Statement Entry
          </Button>
        </div>
      </div>

      {/* Active Bank Account Bar */}
      {bankAccounts.length === 0 ? (
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">No Bank Account Found</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                To import bank statements, match potential duplicates, and track live balances, connect your bank account.
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setBankForm((prev) => ({
                ...prev,
                business_entity_id: selectedEntityId || prev.business_entity_id || "",
              }));
              setAddBankModalOpen(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-9 font-medium cursor-pointer shadow-sm shrink-0"
          >
            <PlusCircle className="h-4 w-4 mr-1.5" /> + Add Bank Account
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/80 bg-card shadow-sm">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Landmark className="h-5 w-5" />
          </div>
          <div className="flex-1 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold text-muted-foreground">Active Bank Account:</Label>
              <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                <SelectTrigger className="h-8 text-xs w-64 bg-background">
                  <SelectValue placeholder="Select Bank Account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bank_name} • {b.account_no} ({b.business_entity_name || "General"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBankForm((prev) => ({
                    ...prev,
                    business_entity_id: selectedEntityId || prev.business_entity_id || "",
                  }));
                  setAddBankModalOpen(true);
                }}
                className="h-8 text-xs border-dashed cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 mr-1 text-primary" /> Add Account
              </Button>
            </div>

            {activeAccount && (
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-muted-foreground">IFSC: {activeAccount.ifsc || "—"}</span>
                <span className="text-muted-foreground">Branch: {activeAccount.branch_name || "—"}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Available Bank Balance:</span>
                  <span className="font-bold text-emerald-400">
                    ₹{Number(activeAccount.current_balance).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Inflow (Deposits)</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">₹{totalInward.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Cash received into bank</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Outflow (Withdrawals)</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">₹{totalOutward.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Payments disbursed via bank</p>
          </CardContent>
        </Card>

        <Card
          className={`shadow-sm transition-all ${
            underReviewStatements.length > 0
              ? "border-amber-500/50 bg-amber-500/5"
              : "border-border/80"
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Under Review</CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${
                underReviewStatements.length > 0 ? "text-amber-400 animate-pulse" : "text-muted-foreground"
              }`}
            />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span
                className={`text-2xl font-bold ${
                  underReviewStatements.length > 0 ? "text-amber-400" : "text-foreground"
                }`}
              >
                {underReviewStatements.length}
              </span>
              {underReviewStatements.length > 0 && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]">
                  Potential Duplicates
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Exact date &amp; cash matches requiring review</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reconciled Transactions</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{reconciledStatements.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Directly added or linked to POS transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Filter Bar */}
      <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border w-fit">
        <Button
          size="sm"
          variant={activeTab === "UNDER_REVIEW" ? "default" : "ghost"}
          onClick={() => setActiveTab("UNDER_REVIEW")}
          className={`h-8 text-xs font-medium rounded-lg transition-all ${
            activeTab === "UNDER_REVIEW"
              ? underReviewStatements.length > 0
                ? "bg-amber-600 hover:bg-amber-500 text-white shadow-sm font-semibold"
                : "bg-primary text-primary-foreground shadow-sm font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          Under Review ({underReviewStatements.length})
        </Button>

        <Button
          size="sm"
          variant={activeTab === "RECONCILED" ? "default" : "ghost"}
          onClick={() => setActiveTab("RECONCILED")}
          className="h-8 text-xs font-medium rounded-lg"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
          Reconciled ({reconciledStatements.length})
        </Button>

        <Button
          size="sm"
          variant={activeTab === "ALL" ? "default" : "ghost"}
          onClick={() => setActiveTab("ALL")}
          className="h-8 text-xs font-medium rounded-lg"
        >
          All Statement Rows ({statements.length})
        </Button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: UNDER REVIEW / POTENTIAL DUPLICATES */}
      {/* ======================================================== */}
      {activeTab === "UNDER_REVIEW" && (
        <div className="space-y-4">
          {underReviewStatements.length === 0 ? (
            <Card className="border-dashed border-2 border-border/80">
              <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 mb-3">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-base">Zero Duplicates Under Review</h3>
                <p className="text-xs text-muted-foreground max-w-md mt-1">
                  All imported bank statements are reconciled and added to your transactions ledger. When a statement
                  matches an existing transaction date and cash amount, it will appear here for one-click review.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <strong>Review Needed:</strong> {underReviewStatements.length} statement entries matched an existing
                  transaction with the exact same date and cash amount. Choose whether to link them or add as new.
                </span>
              </div>

              {underReviewStatements.map((stmt) => {
                const amount = stmt.debit_amount > 0 ? stmt.debit_amount : stmt.credit_amount;
                const isOut = stmt.debit_amount > 0;
                const matchedTxn = stmt.matched_transaction;
                const isBusy = resolvingId === stmt.id;

                return (
                  <Card key={stmt.id} className="border-amber-500/30 bg-card/80 shadow-md">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                        {/* Statement Line (Left) */}
                        <div className="lg:col-span-5 p-3 rounded-xl border border-border/80 bg-muted/40 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              Statement Date: {new Date(stmt.txn_date).toLocaleDateString()}
                            </span>
                            <Badge
                              variant="outline"
                              className={
                                isOut
                                  ? "border-rose-500/40 text-rose-400 bg-rose-500/10 text-[10px]"
                                  : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                              }
                            >
                              {isOut ? "WITHDRAWAL (OUT)" : "DEPOSIT (IN)"}
                            </Badge>
                          </div>
                          <div className="font-semibold text-foreground text-sm truncate">
                            {stmt.description || "Bank Entry"}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/60">
                            <span className="text-muted-foreground font-mono">
                              Ref: {stmt.reference || stmt.reference_no || "—"}
                            </span>
                            <span
                              className={`text-base font-bold font-mono ${
                                isOut ? "text-rose-400" : "text-emerald-400"
                              }`}
                            >
                              {isOut ? "-" : "+"}₹{amount.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Match Indicator (Center) */}
                        <div className="lg:col-span-2 flex flex-col items-center justify-center text-center gap-1">
                          <Badge variant="outline" className="border-amber-500 text-amber-400 bg-amber-500/10 text-[10px]">
                            POTENTIAL DUPLICATE
                          </Badge>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            Exact Date &amp; Cash Match
                          </span>
                        </div>

                        {/* Existing Transaction (Right) */}
                        <div className="lg:col-span-5 p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              Transaction Date:{" "}
                              {matchedTxn?.date ? new Date(matchedTxn.date).toLocaleDateString() : "—"}
                            </span>
                            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[10px]">
                              Existing in Ledger
                            </Badge>
                          </div>
                          <div className="font-semibold text-foreground text-sm truncate">
                            {matchedTxn?.notes || matchedTxn?.description || "Recorded Transaction"}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/60">
                            <span className="text-muted-foreground text-[11px]">
                              Category: {matchedTxn?.categories?.name || "General"}
                            </span>
                            <span className="text-base font-bold font-mono text-primary">
                              ₹{matchedTxn?.amount ? Number(matchedTxn.amount).toLocaleString() : amount.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons Row */}
                      <div className="mt-4 pt-3 border-t border-border/70 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground italic">
                          {stmt.duplicate_reason || "Exact date and cash amount matches an existing transaction."}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => handleDismissDuplicate(stmt)}
                            variant="ghost"
                            className="h-8 text-xs text-muted-foreground hover:text-rose-400 cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Dismiss
                          </Button>
                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => handleApproveAsNew(stmt)}
                            variant="outline"
                            className="h-8 text-xs border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
                          >
                            <PlusCircle className="h-3.5 w-3.5 mr-1" /> Add as New Transaction
                          </Button>
                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => handleMergeDuplicate(stmt)}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer shadow-sm"
                          >
                            {isBusy ? (
                              <IosSpinner size="sm" className="text-white" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            )}
                            Merge / Link (Duplicate)
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: RECONCILED TRANSACTIONS */}
      {/* ======================================================== */}
      {activeTab === "RECONCILED" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Cheque / Ref No</TableHead>
                  <TableHead className="text-right">Withdrawal (₹)</TableHead>
                  <TableHead className="text-right">Deposit (₹)</TableHead>
                  <TableHead className="text-right">Balance (₹)</TableHead>
                  <TableHead>Ledger Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciledStatements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                      No reconciled statements found. Import a CSV statement to auto-generate and reconcile transactions.
                    </TableCell>
                  </TableRow>
                ) : (
                  reconciledStatements.map((stmt) => (
                    <TableRow key={stmt.id} className="hover:bg-muted/40">
                      <TableCell className="text-xs font-mono">
                        {new Date(stmt.txn_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium text-xs max-w-[280px] truncate">
                        {stmt.description || "Bank Entry"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {stmt.reference || stmt.reference_no || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-rose-400">
                        {Number(stmt.debit_amount) > 0 ? `₹${Number(stmt.debit_amount).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-emerald-400">
                        {Number(stmt.credit_amount) > 0 ? `₹${Number(stmt.credit_amount).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {stmt.balance != null ? `₹${Number(stmt.balance).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            stmt.review_status === "merged"
                              ? "border-blue-500/40 text-blue-400 bg-blue-500/10 text-[10px]"
                              : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                          }
                        >
                          {stmt.review_status === "merged" ? "LINKED TO TRANSACTION" : "AUTO ADDED"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(stmt)}
                          className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ======================================================== */}
      {/* TAB 3: ALL STATEMENTS LEDGER */}
      {/* ======================================================== */}
      {activeTab === "ALL" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Withdrawal (₹)</TableHead>
                  <TableHead className="text-right">Deposit (₹)</TableHead>
                  <TableHead className="text-right">Balance (₹)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                      No statement rows found for this bank account.
                    </TableCell>
                  </TableRow>
                ) : (
                  statements.map((stmt) => (
                    <TableRow key={stmt.id} className="hover:bg-muted/40">
                      <TableCell className="text-xs font-mono">
                        {new Date(stmt.txn_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium text-xs max-w-[280px] truncate">
                        {stmt.description || "Bank Entry"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {stmt.reference || stmt.reference_no || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-rose-400">
                        {Number(stmt.debit_amount) > 0 ? `₹${Number(stmt.debit_amount).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-emerald-400">
                        {Number(stmt.credit_amount) > 0 ? `₹${Number(stmt.credit_amount).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {stmt.balance != null ? `₹${Number(stmt.balance).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            stmt.review_status === "under_review"
                              ? "border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]"
                              : stmt.review_status === "dismissed"
                              ? "border-zinc-500 text-zinc-400 bg-zinc-800/40 text-[10px]"
                              : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                          }
                        >
                          {(stmt.review_status || "auto_added").replace("_", " ").toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(stmt)}
                          className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ======================================================== */}
      {/* CSV IMPORT PREVIEW MODAL */}
      {/* ======================================================== */}
      <Dialog open={csvPreviewOpen} onOpenChange={setCsvPreviewOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <span>Confirm Bank Statement Ingestion</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 space-y-1">
              <div className="font-semibold text-primary flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> Smart Transaction Generator
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Unique statement entries will be automatically added to your Transactions ledger. Any row matching an
                existing transaction with the exact same date and cash amount will be routed to <strong>Under Review</strong> for
                your confirmation.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg border bg-muted/40 text-center">
              <div>
                <div className="text-muted-foreground text-[11px]">Total Rows Parsed</div>
                <div className="text-lg font-bold font-mono">{parsedRows.length}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-[11px]">Total Outflow</div>
                <div className="text-lg font-bold font-mono text-rose-400">
                  ₹{parsedRows.reduce((s, r) => s + r.withdrawals, 0).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-[11px]">Total Inflow</div>
                <div className="text-lg font-bold font-mono text-emerald-400">
                  ₹{parsedRows.reduce((s, r) => s + r.deposits, 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Statement Rows Preview (First 5 entries):</Label>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="h-7 text-[11px]">
                      <TableHead>Date</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 5).map((r, i) => (
                      <TableRow key={i} className="h-8 text-xs">
                        <TableCell className="font-mono text-[11px]">{r.date}</TableCell>
                        <TableCell className="truncate max-w-[260px]">{r.particulars}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              r.type === "OUT"
                                ? "border-rose-500/40 text-rose-400 text-[9px]"
                                : "border-emerald-500/40 text-emerald-400 text-[9px]"
                            }
                          >
                            {r.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          ₹{r.amount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {isImporting && (
              <div className="p-3 rounded-lg border bg-background space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Ingesting transactions into ledger...</span>
                  <span className="font-mono">
                    {importProgress.current} / {importProgress.total}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2 transition-all duration-200"
                    style={{
                      width: `${(importProgress.current / Math.max(1, importProgress.total)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isImporting}
              onClick={() => setCsvPreviewOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isImporting}
              onClick={handleConfirmCsvImport}
              className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs font-medium cursor-pointer shadow-sm"
            >
              {isImporting ? (
                <span className="flex items-center gap-1.5">
                  <IosSpinner size="sm" className="text-white" /> Ingesting...
                </span>
              ) : (
                "Confirm & Ingest Statements"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MANUAL STATEMENT ENTRY MODAL */}
      {/* ======================================================== */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleManualAddSubmit}>
            <DialogHeader>
              <DialogTitle>Add Bank Statement Entry</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date *</Label>
                  <Input
                    type="date"
                    value={stmtDate}
                    onChange={(e) => setStmtDate(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cheque / Ref No (Optional)</Label>
                  <Input
                    placeholder="e.g. UTR-098234, CHQ# 1234"
                    value={stmtChequeNo}
                    onChange={(e) => setStmtChequeNo(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Particulars / Description *</Label>
                <Input
                  placeholder="e.g. NEFT to Supplier or Customer Payment"
                  value={stmtParticulars}
                  onChange={(e) => setStmtParticulars(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Withdrawal / Debit (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={stmtWithdrawal}
                    onChange={(e) => {
                      setStmtWithdrawal(e.target.value);
                      if (e.target.value) setStmtDeposit("");
                    }}
                    className="h-8 text-xs font-bold text-rose-400"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Deposit / Credit (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={stmtDeposit}
                    onChange={(e) => {
                      setStmtDeposit(e.target.value);
                      if (e.target.value) setStmtWithdrawal("");
                    }}
                    className="h-8 text-xs font-bold text-emerald-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Balance After (Optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 54200.00"
                  value={stmtBalance}
                  onChange={(e) => setStmtBalance(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                Note: A corresponding transaction will be created automatically. If an existing transaction has the
                same date and cash amount, this entry will be flagged for duplicate review.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingManual || (!stmtWithdrawal && !stmtDeposit)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {savingManual ? "Saving..." : "Save Entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* EDIT STATEMENT ENTRY MODAL */}
      {/* ======================================================== */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle>Edit Statement Entry</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date *</Label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reference #</Label>
                  <Input
                    value={editRef}
                    onChange={(e) => setEditRef(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Particulars</Label>
                <Input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Withdrawal (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editDebit}
                    onChange={(e) => setEditDebit(e.target.value)}
                    className="h-8 text-xs font-bold text-rose-400"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Deposit (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editCredit}
                    onChange={(e) => setEditCredit(e.target.value)}
                    className="h-8 text-xs font-bold text-emerald-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Balance (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editBalance}
                  onChange={(e) => setEditBalance(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingEdit}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {savingEdit ? "Updating..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* ADD BANK ACCOUNT MODAL */}
      {/* ======================================================== */}
      <Dialog open={addBankModalOpen} onOpenChange={setAddBankModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSaveBankAccount}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <span>Add Bank Account</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Company / Business Entity</Label>
                <Select
                  value={bankForm.business_entity_id}
                  onValueChange={(val) => setBankForm((prev) => ({ ...prev, business_entity_id: val }))}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Select Business Entity (or General)" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} ({e.entity_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Bank Name *</Label>
                  <Input
                    placeholder="e.g. HDFC Bank, SBI, ICICI"
                    value={bankForm.bank_name}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, bank_name: e.target.value }))}
                    required
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account Number *</Label>
                  <Input
                    placeholder="e.g. 5010023456789"
                    value={bankForm.account_no}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, account_no: e.target.value }))}
                    required
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Branch Name</Label>
                  <Input
                    placeholder="e.g. MG Road, Industrial Area"
                    value={bankForm.branch_name}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, branch_name: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IFSC Code</Label>
                  <Input
                    placeholder="e.g. HDFC0001234"
                    value={bankForm.ifsc}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, ifsc: e.target.value.toUpperCase() }))}
                    className="h-8 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Opening Balance (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={bankForm.opening_balance}
                  onChange={(e) => setBankForm((prev) => ({ ...prev, opening_balance: e.target.value }))}
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Initial balance of the bank account prior to statement ingestion.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddBankModalOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingBank}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer shadow-sm"
              >
                {savingBank ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" /> Creating...
                  </span>
                ) : (
                  "Create Bank Account"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
