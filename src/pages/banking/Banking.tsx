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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Landmark,
  Upload,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Pencil,
  Trash2,
  Sparkles,
  XCircle,
  ShieldAlert,
  Plus,
  Wallet,
} from "lucide-react";
import type { BankAccount, BankStatementTransaction, BusinessEntity } from "@/lib/db/erp";
import {
  getBankAccounts,
  upsertBankAccount,
  deleteBankAccount,
  getBusinessEntities,
  setBankAccountDesiredCurrentBalance,
  addFundsToBankAccountBalance,
} from "@/lib/db/accounting";
import {
  getCategories,
  getEntities,
  Category,
  Entity,
} from "@/lib/db/queries";
import {
  getBankStatementTransactions,
  importBankStatementRow,
  importBankStatementBatch,
  mergeStatementWithTransaction,
  approveDuplicateAsNewTransaction,
  dismissStatement,
  updateBankStatementTransaction,
  deleteBankStatementTransactions,
  EnrichedParsedStatementRow,
} from "@/lib/db/banking";
import {
  parseBankStatementCsv,
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

  // Master Reference Lists for Full Transaction Linking
  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [contacts, setContacts] = useState<Entity[]>([]);

  // Bulk Statement Selection for Delete
  const [selectedStmtIds, setSelectedStmtIds] = useState<Set<string>>(new Set());
  const [deletingStmts, setDeletingStmts] = useState(false);

  // Add / Edit Bank Account Modal State
  const [addBankModalOpen, setAddBankModalOpen] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [editingBankOldData, setEditingBankOldData] = useState<BankAccount | undefined>(undefined);
  const [savingBank, setSavingBank] = useState(false);
  const [bankForm, setBankForm] = useState({
    bank_name: "",
    account_no: "",
    branch_name: "",
    ifsc: "",
    opening_balance: "0",
    business_entity_id: "",
  });

  // Set / Add Bank Balance Modal
  const [bankBalModalOpen, setBankBalModalOpen] = useState(false);
  const [bankBalTarget, setBankBalTarget] = useState<BankAccount | null>(null);
  const [bankBalMode, setBankBalMode] = useState<"SET_CURRENT" | "ADD_FUNDS">("SET_CURRENT");
  const [bankBalAmount, setBankBalAmount] = useState("");
  const [savingBankBal, setSavingBankBal] = useState(false);

  // CSV Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvPreviewOpen, setCsvPreviewOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<EnrichedParsedStatementRow[]>([]);
  const [csvDefaultBizId, setCsvDefaultBizId] = useState<string>("none");
  const [csvDefaultDepositCatId, setCsvDefaultDepositCatId] = useState<string>("auto");
  const [csvDefaultWithdrawalCatId, setCsvDefaultWithdrawalCatId] = useState<string>("auto");
  const [csvDefaultContactId, setCsvDefaultContactId] = useState<string>("none");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Manual Statement Modal (with full linking)
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [stmtDate, setStmtDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [stmtParticulars, setStmtParticulars] = useState("");
  const [stmtChequeNo, setStmtChequeNo] = useState("");
  const [stmtWithdrawal, setStmtWithdrawal] = useState("");
  const [stmtDeposit, setStmtDeposit] = useState("");
  const [stmtBalance, setStmtBalance] = useState("");
  const [stmtBizEntityId, setStmtBizEntityId] = useState("none");
  const [stmtCategoryId, setStmtCategoryId] = useState("auto");
  const [stmtContactId, setStmtContactId] = useState("none");
  const [stmtNotes, setStmtNotes] = useState("");

  // Edit Statement Modal (syncs linked transaction too)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStmt, setEditingStmt] = useState<BankStatementTransaction | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDebit, setEditDebit] = useState("");
  const [editCredit, setEditCredit] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editBizEntityId, setEditBizEntityId] = useState("none");
  const [editCategoryId, setEditCategoryId] = useState("none");
  const [editContactId, setEditContactId] = useState("none");
  const [editNotes, setEditNotes] = useState("");

  // Under Review Inline Overrides (per statement id)
  const [reviewOverrides, setReviewOverrides] = useState<
    Record<string, { categoryId?: string; entityId?: string; businessEntityId?: string }>
  >({});

  // Action busy state for duplicate review cards
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Load bank accounts
  const loadAccounts = () => {
    setLoading(true);
    getBankAccounts(selectedEntityId || undefined)
      .then(async (bList) => {
        let finalAccounts = bList;
        if (finalAccounts.length === 0 && selectedEntityId) {
          try {
            const allList = await getBankAccounts();
            if (allList.length > 0) finalAccounts = allList;
          } catch {}
        }

        setBankAccounts(finalAccounts);
        if (finalAccounts.length > 0) {
          if (!selectedBankId || !finalAccounts.some((b) => b.id === selectedBankId)) {
            setSelectedBankId(finalAccounts[0].id);
          }
        } else {
          setSelectedBankId("");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadAccounts, [selectedEntityId, refreshTrigger]);

  // Load master reference lists
  useEffect(() => {
    Promise.all([
      getBusinessEntities(),
      getCategories(),
      getEntities(),
    ])
      .then(([beList, catList, entList]) => {
        setEntities(beList);
        setCategories(catList);
        setContacts(entList);
      })
      .catch(console.error);
  }, [refreshTrigger]);

  // Load statement transactions for active bank
  const loadStatements = () => {
    setSelectedStmtIds(new Set());
    if (!selectedBankId) {
      setStatements([]);
      return;
    }
    getBankStatementTransactions({ bankAccountId: selectedBankId })
      .then((data) => {
        setStatements(data);
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

  const depositCategories = useMemo(
    () => categories.filter((c) => c.type === "IN" || c.type === "BOTH"),
    [categories]
  );

  const withdrawalCategories = useMemo(
    () => categories.filter((c) => c.type === "OUT" || c.type === "BOTH"),
    [categories]
  );

  // ==========================================
  // BANK ACCOUNT ADD / EDIT / DELETE / BALANCE
  // ==========================================
  const openAddBankModal = () => {
    setEditingBankId(null);
    setEditingBankOldData(undefined);
    setBankForm({
      bank_name: "",
      account_no: "",
      branch_name: "",
      ifsc: "",
      opening_balance: "0",
      business_entity_id: selectedEntityId || "",
    });
    setAddBankModalOpen(true);
  };

  const openEditBankModal = (bank: BankAccount) => {
    setEditingBankId(bank.id);
    setEditingBankOldData(bank);
    setBankForm({
      bank_name: bank.bank_name || "",
      account_no: bank.account_no || "",
      branch_name: bank.branch_name || "",
      ifsc: bank.ifsc || "",
      opening_balance: String(bank.opening_balance ?? 0),
      business_entity_id: bank.business_entity_id || "",
    });
    setAddBankModalOpen(true);
  };

  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.bank_name.trim() || !bankForm.account_no.trim()) {
      alert("Please enter both Bank Name and Account Number.");
      return;
    }

    setSavingBank(true);
    try {
      const savedId = await upsertBankAccount(
        {
          id: editingBankId || undefined,
          bank_name: bankForm.bank_name.trim(),
          account_no: bankForm.account_no.trim(),
          branch_name: bankForm.branch_name.trim() || undefined,
          ifsc: bankForm.ifsc.trim() || undefined,
          opening_balance: parseFloat(bankForm.opening_balance) || 0,
          business_entity_id: bankForm.business_entity_id || selectedEntityId || undefined,
        },
        editingBankOldData
      );

      setAddBankModalOpen(false);
      setEditingBankId(null);
      setEditingBankOldData(undefined);

      let bList = await getBankAccounts(selectedEntityId || undefined);
      if (!bList.some((b) => b.id === savedId)) {
        bList = await getBankAccounts();
      }
      setBankAccounts(bList);
      setSelectedBankId(savedId);
      triggerRefresh();
      alert(editingBankId ? "Bank account updated successfully!" : "Bank account created and selected successfully!");
    } catch (err: any) {
      alert("Failed to save bank account: " + (err.message || err));
    } finally {
      setSavingBank(false);
    }
  };

  const handleDeleteBankAccount = async (bank: BankAccount) => {
    if (!window.confirm(`Delete bank account "${bank.bank_name} (${bank.account_no})"?`)) return;
    try {
      await deleteBankAccount(bank.id, false);
      triggerRefresh();
    } catch (err: any) {
      const forceConfirm = window.confirm(
        `${err?.message || "This bank account has financial history."}\n\nDo you want to FORCE DELETE this bank account and remove its imported bank statements?`
      );
      if (!forceConfirm) return;
      try {
        await deleteBankAccount(bank.id, true);
        triggerRefresh();
      } catch (forceErr: any) {
        alert("Failed to delete bank account: " + (forceErr?.message || forceErr));
      }
    }
  };

  const openBankBalanceModal = (bank: BankAccount) => {
    setBankBalTarget(bank);
    setBankBalMode("SET_CURRENT");
    setBankBalAmount(String(bank.current_balance ?? 0));
    setBankBalModalOpen(true);
  };

  const handleSaveBankBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankBalTarget) return;
    const val = parseFloat(bankBalAmount);
    if (isNaN(val)) {
      alert("Please enter a valid amount.");
      return;
    }

    setSavingBankBal(true);
    try {
      if (bankBalMode === "SET_CURRENT") {
        await setBankAccountDesiredCurrentBalance(bankBalTarget.id, val);
      } else {
        if (val <= 0) {
          alert("Amount to add must be greater than zero.");
          setSavingBankBal(false);
          return;
        }
        await addFundsToBankAccountBalance(bankBalTarget.id, val);
      }
      setBankBalModalOpen(false);
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to update bank balance: " + (err.message || err));
    } finally {
      setSavingBankBal(false);
    }
  };

  // ==========================================
  // CSV FILE UPLOAD & INTERACTIVE LINKING
  // ==========================================
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedBankId) {
      alert("Please select or add a bank account before importing a statement.");
      openAddBankModal();
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

      const defaultBiz = activeAccount?.business_entity_id || selectedEntityId || "none";
      setCsvDefaultBizId(defaultBiz);
      setCsvDefaultDepositCatId("auto");
      setCsvDefaultWithdrawalCatId("auto");
      setCsvDefaultContactId("none");

      setParsedRows(
        parsed.rows.map((r) => ({
          ...r,
          categoryId: null,
          entityId: null,
          businessEntityId: defaultBiz !== "none" ? defaultBiz : null,
          notes: null,
          skip: false,
        }))
      );
      setCsvPreviewOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const updateCsvRow = (idx: number, patch: Partial<EnrichedParsedStatementRow>) => {
    setParsedRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleConfirmCsvImport = async () => {
    if (!selectedBankId) {
      alert("Please select or add a bank account first.");
      openAddBankModal();
      return;
    }
    const activeRows = parsedRows.filter((r) => !r.skip);
    if (activeRows.length === 0) {
      alert("Please include at least one row to import.");
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: activeRows.length });

    const batchId = `import_${Date.now()}`;

    try {
      const res = await importBankStatementBatch({
        bankAccountId: selectedBankId,
        businessEntityId: csvDefaultBizId !== "none" ? csvDefaultBizId : (activeAccount?.business_entity_id || selectedEntityId || null),
        defaultDepositCategoryId: csvDefaultDepositCatId !== "auto" ? csvDefaultDepositCatId : null,
        defaultWithdrawalCategoryId: csvDefaultWithdrawalCatId !== "auto" ? csvDefaultWithdrawalCatId : null,
        defaultEntityId: csvDefaultContactId !== "none" ? csvDefaultContactId : null,
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
          `Statement Bulk Import Complete!\n\n• ${res.autoAddedCount} unique transactions added to Transactions Ledger\n• ${res.underReviewCount} flagged Under Review (already in cloud / duplicate)\n• Total rows processed: ${res.totalRows}`
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
  // MANUAL STATEMENT ENTRY (WITH FULL LINKING)
  // ==========================================
  const openManualAddModal = () => {
    if (!selectedBankId) {
      alert("Please select or add a bank account first.");
      openAddBankModal();
      return;
    }
    setStmtDate(new Date().toISOString().split("T")[0]);
    setStmtParticulars("");
    setStmtChequeNo("");
    setStmtWithdrawal("");
    setStmtDeposit("");
    setStmtBalance("");
    setStmtBizEntityId(activeAccount?.business_entity_id || selectedEntityId || "none");
    setStmtCategoryId("auto");
    setStmtContactId("none");
    setStmtNotes("");
    setAddModalOpen(true);
  };

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
        businessEntityId: stmtBizEntityId !== "none" ? stmtBizEntityId : (activeAccount?.business_entity_id || selectedEntityId || null),
        categoryId: stmtCategoryId !== "auto" ? stmtCategoryId : null,
        entityId: stmtContactId !== "none" ? stmtContactId : null,
        notes: stmtNotes.trim() || null,
        date: stmtDate,
        particulars: stmtParticulars.trim() || "Bank Entry",
        chequeNo: stmtChequeNo.trim() || null,
        withdrawals: w,
        deposits: d,
        balance: stmtBalance ? parseFloat(stmtBalance) : undefined,
      });

      triggerRefresh();
      setAddModalOpen(false);

      if (res.status === "under_review") {
        alert("This statement matches an existing cloud statement or transaction! Placed Under Review for your approval.");
        setActiveTab("UNDER_REVIEW");
      } else {
        alert("Statement entry recorded and transaction linked successfully!");
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
    if (!stmt.potential_duplicate_id) {
      alert("This entry already matches an existing statement in the cloud. Delete the duplicate copy or click 'Add as New Transaction' if it is a separate entry.");
      return;
    }
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
    const ovr = reviewOverrides[stmt.id] || {};
    try {
      await approveDuplicateAsNewTransaction(
        stmt,
        ovr.businessEntityId !== undefined
          ? (ovr.businessEntityId === "none" ? null : ovr.businessEntityId)
          : (activeAccount?.business_entity_id || selectedEntityId || null),
        {
          categoryId: ovr.categoryId && ovr.categoryId !== "auto" ? ovr.categoryId : null,
          entityId: ovr.entityId && ovr.entityId !== "none" ? ovr.entityId : null,
        }
      );
      triggerRefresh();
    } catch (err: any) {
      alert("Error approving new transaction: " + (err.message || err));
    } finally {
      setResolvingId(null);
    }
  };

  const handleDismissDuplicate = async (stmt: BankStatementTransaction) => {
    if (!window.confirm("Ignore this statement entry without adding to transactions?")) return;
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
  // DELETE STATEMENT ENTRIES
  // ==========================================
  const toggleSelectStmt = (id: string) => {
    const next = new Set(selectedStmtIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStmtIds(next);
  };

  const handleDeleteStatement = async (stmt: BankStatementTransaction) => {
    const hasAutoTxn = Boolean(stmt.transaction_id && stmt.review_status === "auto_added");
    const msg = hasAutoTxn
      ? `Delete statement "${stmt.description || "Bank Entry"}" and its auto-created Transaction from the ledger?`
      : `Permanently delete statement row "${stmt.description || "Bank Entry"}"?`;
    if (!window.confirm(msg)) return;

    setResolvingId(stmt.id);
    try {
      await deleteBankStatementTransactions([stmt.id], true);
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete statement entry: " + (err?.message || err));
    } finally {
      setResolvingId(null);
    }
  };

  const handleBulkDeleteStatements = async () => {
    if (selectedStmtIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedStmtIds.size} selected statement row(s) and their auto-created transactions?`)) {
      return;
    }
    setDeletingStmts(true);
    try {
      await deleteBankStatementTransactions(Array.from(selectedStmtIds), true);
      setSelectedStmtIds(new Set());
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete selected statement entries: " + (err?.message || err));
    } finally {
      setDeletingStmts(false);
    }
  };

  // ==========================================
  // EDIT STATEMENT ENTRY (SYNCS TRANSACTION)
  // ==========================================
  const handleOpenEdit = (stmt: BankStatementTransaction) => {
    const linked = stmt.matched_transaction;
    setEditingStmt(stmt);
    setEditDate(stmt.txn_date ? stmt.txn_date.split("T")[0] : "");
    setEditDesc(stmt.description || "");
    setEditDebit(stmt.debit_amount ? String(stmt.debit_amount) : "");
    setEditCredit(stmt.credit_amount ? String(stmt.credit_amount) : "");
    setEditBalance(stmt.balance != null ? String(stmt.balance) : "");
    setEditRef(stmt.reference || stmt.reference_no || "");
    setEditBizEntityId(linked?.business_entity_id || linked?.custom_data?.business_entity_id || activeAccount?.business_entity_id || "none");
    setEditCategoryId(linked?.category_id || "none");
    setEditContactId(linked?.entity_id || "none");
    setEditNotes(linked?.notes || "");
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
          balance: editBalance ? parseFloat(editBalance) : null,
          reference: editRef.trim() || null,
        },
        editingStmt,
        editingStmt.transaction_id
          ? {
              transactionId: editingStmt.transaction_id,
              categoryId: editCategoryId !== "none" ? editCategoryId : null,
              entityId: editContactId !== "none" ? editContactId : null,
              businessEntityId: editBizEntityId !== "none" ? editBizEntityId : null,
              notes: editNotes.trim() || null,
            }
          : undefined
      );
      setEditModalOpen(false);
      setEditingStmt(null);
      triggerRefresh();
    } catch (err: any) {
      alert("Error updating entry: " + (err.message || err));
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
        <IosLoadingView text="Loading bank accounts & statements..." minHeight="360px" />
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
            Track live balances per bank, import statements with category &amp; entity linking, and manage cloud duplicates.
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
            onClick={openAddBankModal}
            className="cursor-pointer text-xs h-9 bg-card hover:bg-muted"
          >
            <Landmark className="h-4 w-4 mr-1.5 text-primary" /> + Add Bank Account
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!selectedBankId) {
                alert("Please select or add a bank account first.");
                openAddBankModal();
              } else {
                fileInputRef.current?.click();
              }
            }}
            className="cursor-pointer text-xs h-9 bg-card hover:bg-muted"
          >
            <Upload className="h-4 w-4 mr-1.5 text-primary" /> Import CSV Statement
          </Button>
          <Button
            onClick={openManualAddModal}
            className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer text-xs h-9 shadow-sm"
          >
            <PlusCircle className="h-4 w-4 mr-1.5" /> Add Statement Entry
          </Button>
        </div>
      </div>

      {/* Per-Bank Live Balance Cards + Reconciliation Summary */}
      {bankAccounts.length === 0 ? (
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">No Bank Account Found</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Connect your commercial bank account to import statements, detect cloud duplicates, and manage separate bank balances.
              </p>
            </div>
          </div>
          <Button
            onClick={openAddBankModal}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-9 font-medium cursor-pointer shadow-sm shrink-0"
          >
            <PlusCircle className="h-4 w-4 mr-1.5" /> + Add Bank Account
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Individual Bank Live Balance Grid (shows balance per bank, NOT total inflow/outflow) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bankAccounts.map((bank) => {
              const isSelected = bank.id === selectedBankId;
              return (
                <Card
                  key={bank.id}
                  onClick={() => setSelectedBankId(bank.id)}
                  className={`cursor-pointer transition-all shadow-sm ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "hover:border-border bg-card"
                  }`}
                >
                  <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <CardTitle className="text-sm font-bold flex items-center gap-1.5 truncate">
                        <Landmark className={`h-4 w-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="truncate">{bank.bank_name}</span>
                        {isSelected && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[9px] ml-1 shrink-0">
                            ACTIVE
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">
                        A/c: {bank.account_no} • {bank.business_entity_name || "General"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-emerald-400 hover:text-emerald-300"
                        title="Set / Add Bank Balance"
                        onClick={() => openBankBalanceModal(bank)}
                      >
                        <Wallet className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-blue-400 hover:text-blue-300"
                        title="Edit Bank Account"
                        onClick={() => openEditBankModal(bank)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-rose-400"
                        title="Delete Bank Account"
                        onClick={() => handleDeleteBankAccount(bank)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] text-muted-foreground">Live Bank Balance</span>
                      <span
                        className={`text-2xl font-bold font-mono ${
                          Number(bank.current_balance) >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        ₹{Number(bank.current_balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border/50">
                      <span>Opening: ₹{Number(bank.opening_balance || 0).toLocaleString()}</span>
                      <span>{bank.ifsc ? `IFSC: ${bank.ifsc}` : (bank.branch_name || "Active")}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Active Bank Selector + Reconciliation Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Reconciliation Account</CardTitle>
                <Landmark className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Select Bank Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bank_name} • {b.account_no} (₹{Number(b.current_balance || 0).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeAccount && (
                  <div className="flex items-center justify-between text-[11px]">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openBankBalanceModal(activeAccount)}
                      className="h-7 text-[11px] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                    >
                      <Wallet className="h-3 w-3 mr-1" /> Set / Update Balance
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={openAddBankModal}
                      className="h-7 text-[11px] cursor-pointer"
                    >
                      <Plus className="h-3 w-3 mr-1" /> New Bank
                    </Button>
                  </div>
                )}
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
                <CardTitle className="text-sm font-medium text-muted-foreground">Under Review (Duplicates)</CardTitle>
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
                      Cloud Matches
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Statements already in cloud or matching transactions</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Reconciled Entries</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-400">{reconciledStatements.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Statement rows linked &amp; synced to selected bank</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tabs Filter Bar + Bulk Delete Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        {selectedStmtIds.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            disabled={deletingStmts}
            onClick={handleBulkDeleteStatements}
            className="h-8 text-xs cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {deletingStmts ? "Deleting..." : `Delete Selected (${selectedStmtIds.size})`}
          </Button>
        )}
      </div>

      {/* ======================================================== */}
      {/* TAB 1: UNDER REVIEW / CLOUD DUPLICATES */}
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
                  When an imported statement matches an entry already stored in the cloud (same date, parameters, or transaction),
                  it will be flagged here so you can review, add, or delete it.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <strong>Cloud Duplicate Check:</strong> {underReviewStatements.length} statement entries matched an existing
                  cloud bank statement or ledger transaction. Review and choose whether to add, link, or delete them.
                </span>
              </div>

              {underReviewStatements.map((stmt) => {
                const amount = stmt.debit_amount > 0 ? stmt.debit_amount : stmt.credit_amount;
                const isOut = stmt.debit_amount > 0;
                const matchedTxn = stmt.matched_transaction;
                const isBusy = resolvingId === stmt.id;
                const ovr = reviewOverrides[stmt.id] || {};
                const availableCats = isOut ? withdrawalCategories : depositCategories;

                return (
                  <Card key={stmt.id} className="border-amber-500/30 bg-card/80 shadow-md">
                    <CardContent className="p-4 space-y-3">
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
                            POSSIBLE DUPLICATE
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {stmt.duplicate_reason?.includes("Cloud Bank Statement")
                              ? "Already in Cloud Statements"
                              : "Matches Cloud Transaction"}
                          </span>
                        </div>

                        {/* Existing Cloud Record (Right) */}
                        <div className="lg:col-span-5 p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              Cloud Date:{" "}
                              {matchedTxn?.date
                                ? new Date(matchedTxn.date).toLocaleDateString()
                                : new Date(stmt.txn_date).toLocaleDateString()}
                            </span>
                            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-[10px]">
                              Existing in Cloud
                            </Badge>
                          </div>
                          <div className="font-semibold text-foreground text-sm truncate">
                            {matchedTxn?.notes || matchedTxn?.description || stmt.description || "Cloud Record"}
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-border/60">
                            <span className="text-muted-foreground text-[11px]">
                              {matchedTxn?.categories?.name ? `Cat: ${matchedTxn.categories.name}` : "Matched on Cloud"}
                              {matchedTxn?.entities?.name ? ` • ${matchedTxn.entities.name}` : ""}
                            </span>
                            <span className="text-base font-bold font-mono text-primary">
                              ₹{matchedTxn?.amount ? Number(matchedTxn.amount).toLocaleString() : amount.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Optional Linking selectors if adding as new */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-border/50 text-xs">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Category (if adding as new)</Label>
                          <Select
                            value={ovr.categoryId || "auto"}
                            onValueChange={(v) =>
                              setReviewOverrides((prev) => ({
                                ...prev,
                                [stmt.id]: { ...prev[stmt.id], categoryId: v },
                              }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Default Bank Category</SelectItem>
                              {availableCats.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Contact / Party (if adding as new)</Label>
                          <Select
                            value={ovr.entityId || "none"}
                            onValueChange={(v) =>
                              setReviewOverrides((prev) => ({
                                ...prev,
                                [stmt.id]: { ...prev[stmt.id], entityId: v },
                              }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— None —</SelectItem>
                              {contacts.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Operating Entity</Label>
                          <Select
                            value={ovr.businessEntityId || activeAccount?.business_entity_id || selectedEntityId || "none"}
                            onValueChange={(v) =>
                              setReviewOverrides((prev) => ({
                                ...prev,
                                [stmt.id]: { ...prev[stmt.id], businessEntityId: v },
                              }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— General / All —</SelectItem>
                              {entities.map((e) => (
                                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Action Buttons Row */}
                      <div className="pt-2 border-t border-border/70 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground italic max-w-xl">
                          {stmt.duplicate_reason || "Matches an existing record in the cloud."}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => handleDeleteStatement(stmt)}
                            variant="destructive"
                            className="h-8 text-xs cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          </Button>
                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => handleDismissDuplicate(stmt)}
                            variant="ghost"
                            className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
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
                          {stmt.potential_duplicate_id && (
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
                              Merge / Link
                            </Button>
                          )}
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
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={reconciledStatements.length > 0 && reconciledStatements.every((s) => selectedStmtIds.has(s.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedStmtIds(new Set(reconciledStatements.map((s) => s.id)));
                        else setSelectedStmtIds(new Set());
                      }}
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Category &amp; Contact</TableHead>
                  <TableHead>Ref No</TableHead>
                  <TableHead className="text-right">Withdrawal (₹)</TableHead>
                  <TableHead className="text-right">Deposit (₹)</TableHead>
                  <TableHead className="text-right">Stmt Bal (₹)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciledStatements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                      No reconciled statements found. Import a CSV statement or add an entry manually.
                    </TableCell>
                  </TableRow>
                ) : (
                  reconciledStatements.map((stmt) => {
                    const linked = stmt.matched_transaction;
                    return (
                      <TableRow key={stmt.id} className="hover:bg-muted/40">
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedStmtIds.has(stmt.id)}
                            onChange={() => toggleSelectStmt(stmt.id)}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {new Date(stmt.txn_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-medium text-xs max-w-[240px] truncate">
                          {stmt.description || "Bank Entry"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="space-y-0.5">
                            {linked?.categories?.name && (
                              <Badge variant="outline" className="text-[10px]">
                                {linked.categories.name}
                              </Badge>
                            )}
                            {linked?.entities?.name && (
                              <div className="text-[11px] text-muted-foreground">{linked.entities.name}</div>
                            )}
                            {!linked?.categories?.name && !linked?.entities?.name && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
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
                            {stmt.review_status === "merged" ? "LINKED" : "AUTO ADDED"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(stmt)}
                              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Edit statement & linked transaction"
                            >
                              <Pencil className="h-3.5 w-3.5 text-blue-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteStatement(stmt)}
                              className="h-7 w-7 text-muted-foreground hover:text-rose-400 cursor-pointer"
                              title="Delete statement entry"
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
          </CardContent>
        </Card>
      )}

      {/* ======================================================== */}
      {/* TAB 3: ALL STATEMENTS LEDGER */}
      {/* ======================================================== */}
      {activeTab === "ALL" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={statements.length > 0 && statements.every((s) => selectedStmtIds.has(s.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedStmtIds(new Set(statements.map((s) => s.id)));
                        else setSelectedStmtIds(new Set());
                      }}
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Category &amp; Contact</TableHead>
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
                    <TableCell colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                      No statement rows found for this bank account.
                    </TableCell>
                  </TableRow>
                ) : (
                  statements.map((stmt) => {
                    const linked = stmt.matched_transaction;
                    return (
                      <TableRow key={stmt.id} className="hover:bg-muted/40">
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedStmtIds.has(stmt.id)}
                            onChange={() => toggleSelectStmt(stmt.id)}
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {new Date(stmt.txn_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-medium text-xs max-w-[240px] truncate">
                          {stmt.description || "Bank Entry"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="space-y-0.5">
                            {linked?.categories?.name && (
                              <Badge variant="outline" className="text-[10px]">
                                {linked.categories.name}
                              </Badge>
                            )}
                            {linked?.entities?.name && (
                              <div className="text-[11px] text-muted-foreground">{linked.entities.name}</div>
                            )}
                            {!linked?.categories?.name && !linked?.entities?.name && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
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
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEdit(stmt)}
                              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5 text-blue-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteStatement(stmt)}
                              className="h-7 w-7 text-muted-foreground hover:text-rose-400 cursor-pointer"
                              title="Delete"
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
          </CardContent>
        </Card>
      )}

      {/* ======================================================== */}
      {/* CSV IMPORT PREVIEW & LINKING MODAL */}
      {/* ======================================================== */}
      <Dialog open={csvPreviewOpen} onOpenChange={setCsvPreviewOpen}>
        <DialogContent className="sm:max-w-[960px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <span>Import Bank Statement &amp; Link Categories / Entities / Contacts</span>
            </DialogTitle>
            <DialogDescription>
              Link each bank transaction to an operating entity, category, and contact. Duplicates already stored in the cloud are flagged for review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Batch Defaults */}
            <div className="p-3 rounded-xl border bg-muted/30 space-y-3">
              <div className="font-semibold text-primary flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> Batch Defaults (Applied unless customized per row)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Operating Entity</Label>
                  <Select value={csvDefaultBizId} onValueChange={setCsvDefaultBizId}>
                    <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— General / All —</SelectItem>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Default Deposit Category (IN)</Label>
                  <Select value={csvDefaultDepositCatId} onValueChange={setCsvDefaultDepositCatId}>
                    <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (Bank Deposit)</SelectItem>
                      {depositCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Default Withdrawal Category (OUT)</Label>
                  <Select value={csvDefaultWithdrawalCatId} onValueChange={setCsvDefaultWithdrawalCatId}>
                    <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (Bank Charges / Misc)</SelectItem>
                      {withdrawalCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Default Contact / Party</Label>
                  <Select value={csvDefaultContactId} onValueChange={setCsvDefaultContactId}>
                    <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg border bg-muted/40 text-center">
              <div>
                <div className="text-muted-foreground text-[11px]">Selected Rows</div>
                <div className="text-lg font-bold font-mono">{parsedRows.filter((r) => !r.skip).length} / {parsedRows.length}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-[11px]">Withdrawals</div>
                <div className="text-lg font-bold font-mono text-rose-400">
                  ₹{parsedRows.filter((r) => !r.skip).reduce((s, r) => s + r.withdrawals, 0).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-[11px]">Deposits</div>
                <div className="text-lg font-bold font-mono text-emerald-400">
                  ₹{parsedRows.filter((r) => !r.skip).reduce((s, r) => s + r.deposits, 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Interactive Per-Row Linking Table */}
            <div className="rounded-lg border max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-8 text-[11px] sticky top-0 bg-card z-10">
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        checked={parsedRows.every((r) => !r.skip)}
                        onChange={(e) => {
                          const keep = e.target.checked;
                          setParsedRows((prev) => prev.map((r) => ({ ...r, skip: !keep })));
                        }}
                      />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Particulars</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-40">Category</TableHead>
                    <TableHead className="w-40">Contact / Party</TableHead>
                    <TableHead className="w-36">Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((r, i) => {
                    const rowCats = r.type === "OUT" ? withdrawalCategories : depositCategories;
                    return (
                      <TableRow key={i} className={`text-xs ${r.skip ? "opacity-40" : ""}`}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={!r.skip}
                            onChange={(e) => updateCsvRow(i, { skip: !e.target.checked })}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-[11px] whitespace-nowrap">{r.date}</TableCell>
                        <TableCell className="max-w-[180px] truncate" title={r.particulars}>
                          {r.particulars}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold whitespace-nowrap">
                          <span className={r.type === "OUT" ? "text-rose-400" : "text-emerald-400"}>
                            {r.type === "OUT" ? "-" : "+"}₹{r.amount.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.categoryId || "default"}
                            onValueChange={(v) => updateCsvRow(i, { categoryId: v === "default" ? null : v })}
                          >
                            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Batch Default</SelectItem>
                              {rowCats.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.entityId || "default"}
                            onValueChange={(v) => updateCsvRow(i, { entityId: v === "default" ? null : v })}
                          >
                            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Batch Default</SelectItem>
                              {contacts.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r.businessEntityId || "none"}
                            onValueChange={(v) => updateCsvRow(i, { businessEntityId: v === "none" ? null : v })}
                          >
                            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">General</SelectItem>
                              {entities.map((e) => (
                                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {isImporting && (
              <div className="p-3 rounded-lg border bg-background space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Ingesting transactions into bank ledger...</span>
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
      {/* MANUAL STATEMENT ENTRY MODAL (FULL TRANSACTION LINKING) */}
      {/* ======================================================== */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleManualAddSubmit}>
            <DialogHeader>
              <DialogTitle>Add Bank Statement Entry</DialogTitle>
              <DialogDescription>
                Records entry in Bank Reconciliation and links it to your bank ledger without altering Cash-in-Hand.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs">
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

              {/* Linking section: Operating Entity, Category, Contact */}
              <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                <div className="text-[11px] font-semibold text-primary">Link Transaction Details</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Select value={stmtCategoryId} onValueChange={setStmtCategoryId}>
                      <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (Default Bank Category)</SelectItem>
                        {((parseFloat(stmtWithdrawal) || 0) > 0 ? withdrawalCategories : depositCategories).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Contact / Party (Optional)</Label>
                    <Select value={stmtContactId} onValueChange={setStmtContactId}>
                      <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {contacts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Operating Entity</Label>
                    <Select value={stmtBizEntityId} onValueChange={setStmtBizEntityId}>
                      <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— General / All Entities —</SelectItem>
                        {entities.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes (Optional)</Label>
                  <Input
                    placeholder="Additional notes..."
                    value={stmtNotes}
                    onChange={(e) => setStmtNotes(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
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
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle>Edit Bank Statement Entry</DialogTitle>
              <DialogDescription>
                Updates statement row and linked transaction details, then recalculates the bank balance.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs">
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

              <div className="grid grid-cols-3 gap-3">
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
                <div className="space-y-1">
                  <Label className="text-xs">Stmt Balance (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              {editingStmt?.transaction_id && (
                <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                  <div className="text-[11px] font-semibold text-primary">Linked Transaction Settings</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Uncategorized —</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Contact / Party</Label>
                      <Select value={editContactId} onValueChange={setEditContactId}>
                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {contacts.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Operating Entity</Label>
                    <Select value={editBizEntityId} onValueChange={setEditBizEntityId}>
                      <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— General / All Entities —</SelectItem>
                        {entities.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Transaction Notes</Label>
                    <Input
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}
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
      {/* ADD / EDIT BANK ACCOUNT MODAL */}
      {/* ======================================================== */}
      <Dialog open={addBankModalOpen} onOpenChange={setAddBankModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSaveBankAccount}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <span>{editingBankId ? "Edit Bank Account" : "Add Bank Account"}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Company / Business Entity</Label>
                <Select
                  value={bankForm.business_entity_id || "none"}
                  onValueChange={(val) => setBankForm((prev) => ({ ...prev, business_entity_id: val === "none" ? "" : val }))}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Select Business Entity (or General)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— General / All Entities —</SelectItem>
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
                  Initial balance prior to bank statement and voucher flows.
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
                    <IosSpinner size="sm" className="text-white" /> Saving...
                  </span>
                ) : (
                  editingBankId ? "Save Changes" : "Create Bank Account"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* SET / ADD / UPDATE BANK BALANCE MODAL */}
      {/* ======================================================== */}
      <Dialog open={bankBalModalOpen} onOpenChange={setBankBalModalOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <form onSubmit={handleSaveBankBalance}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-400" />
                <span>Manage Bank Balance: {bankBalTarget?.bank_name}</span>
              </DialogTitle>
              <DialogDescription>
                Account: {bankBalTarget?.account_no} • Current Balance: ₹{Number(bankBalTarget?.current_balance || 0).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted border">
                <button
                  type="button"
                  onClick={() => setBankBalMode("SET_CURRENT")}
                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    bankBalMode === "SET_CURRENT"
                      ? "bg-emerald-600 text-white shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Set Current Balance
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBankBalMode("ADD_FUNDS");
                    setBankBalAmount("");
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    bankBalMode === "ADD_FUNDS"
                      ? "bg-emerald-600 text-white shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Add Bank Funds
                </button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  {bankBalMode === "SET_CURRENT" ? "Target Current Bank Balance (₹)" : "Amount to Add to Bank (₹)"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={bankBalAmount}
                  onChange={(e) => setBankBalAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="h-9 text-sm font-mono font-bold"
                />
                <p className="text-[11px] text-muted-foreground">
                  {bankBalMode === "SET_CURRENT"
                    ? "Directly sets this bank's live available balance without affecting Cash-in-Hand."
                    : "Adds funds directly to this bank's available balance."}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBankBalModalOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingBankBal || !bankBalAmount}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {savingBankBal ? "Updating..." : bankBalMode === "SET_CURRENT" ? "Update Bank Balance" : "Add to Bank"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
