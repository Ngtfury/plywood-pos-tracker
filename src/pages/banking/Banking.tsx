import { useState, useEffect, useMemo, useRef } from "react";
import { useStore } from "@/store";
import { BusinessEntitySelector } from "@/components/erp/BusinessEntitySelector";
import { IosLoadingView } from "@/components/ui/IosSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Landmark, PlusCircle, Upload, CheckCircle2, Link2, Unlink
} from "lucide-react";
import type { BankAccount, BankStatementTransaction, Voucher, SalaryRecord } from "@/lib/db/erp";
import {
  getBankAccounts,
  getVouchers,
  getSalaryRecords,
} from "@/lib/db/accounting";
import {
  getBankStatementTransactions,
  insertBankStatementTransaction,
  matchBankTransaction,
  unmatchBankTransaction,
} from "@/lib/db/banking";

export function Banking() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [statements, setStatements] = useState<BankStatementTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<"ALL" | "UNMATCHED" | "MATCHED">("UNMATCHED");

  // Vouchers and Salary records available for matching
  const [paymentVouchers, setPaymentVouchers] = useState<Voucher[]>([]);
  const [receiptVouchers, setReceiptVouchers] = useState<Voucher[]>([]);
  const [paidSalaries, setPaidSalaries] = useState<SalaryRecord[]>([]);

  // Manual Statement Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [savingStmt, setSavingStmt] = useState(false);
  const [stmtDate, setStmtDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [stmtDesc, setStmtDesc] = useState("");
  const [stmtDebit, setStmtDebit] = useState("");
  const [stmtCredit, setStmtCredit] = useState("");
  const [stmtBalance, setStmtBalance] = useState("");
  const [stmtRef, setStmtRef] = useState("");

  // Match Modal
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchingItem, setMatchingItem] = useState<BankStatementTransaction | null>(null);
  const [matchingSubmitting, setMatchingSubmitting] = useState(false);
  const [selectedMatchVoucherId, setSelectedMatchVoucherId] = useState<string>("none");
  const [selectedMatchSalaryId, setSelectedMatchSalaryId] = useState<string>("none");

  // CSV file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getBankAccounts(selectedEntityId || undefined),
      getVouchers({ voucherType: "payment", businessEntityId: selectedEntityId || undefined }),
      getVouchers({ voucherType: "receipt", businessEntityId: selectedEntityId || undefined }),
      getSalaryRecords({ status: "paid", businessEntityId: selectedEntityId || undefined }),
    ])
      .then(([bList, pList, rList, sList]) => {
        setBankAccounts(bList);
        setPaymentVouchers(pList);
        setReceiptVouchers(rList);
        setPaidSalaries(sList);

        if (!selectedBankId && bList.length > 0) {
          setSelectedBankId(bList[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [selectedEntityId, refreshTrigger]);

  // Load statement transactions whenever selectedBankId changes
  useEffect(() => {
    if (!selectedBankId) {
      setStatements([]);
      return;
    }
    getBankStatementTransactions({ bankAccountId: selectedBankId })
      .then(setStatements)
      .catch(console.error);
  }, [selectedBankId, refreshTrigger]);

  const activeAccount = useMemo(
    () => bankAccounts.find((b) => b.id === selectedBankId),
    [bankAccounts, selectedBankId]
  );

  const filteredStatements = useMemo(() => {
    return statements.filter((s) => {
      if (activeTab === "UNMATCHED") return !s.is_matched;
      if (activeTab === "MATCHED") return s.is_matched;
      return true;
    });
  }, [statements, activeTab]);

  const handleManualAddStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankId) {
      alert("Please select a bank account first.");
      return;
    }
    const debit = parseFloat(stmtDebit) || 0;
    const credit = parseFloat(stmtCredit) || 0;
    if (debit <= 0 && credit <= 0) {
      alert("Please enter either a Debit (withdrawal) or Credit (deposit) amount.");
      return;
    }

    setSavingStmt(true);
    try {
      await insertBankStatementTransaction({
        bank_account_id: selectedBankId,
        txn_date: stmtDate + "T12:00:00Z",
        description: stmtDesc.trim() || null,
        debit_amount: debit,
        credit_amount: credit,
        balance: stmtBalance ? parseFloat(stmtBalance) : undefined,
        reference: stmtRef.trim() || null,
      });

      triggerRefresh();
      setAddModalOpen(false);
      setStmtDesc("");
      setStmtDebit("");
      setStmtCredit("");
      setStmtBalance("");
      setStmtRef("");
    } catch (err: any) {
      alert("Error adding statement row: " + (err.message || err));
    } finally {
      setSavingStmt(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBankId) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length <= 1) {
        alert("CSV file is empty or only contains a header.");
        return;
      }

      // Expected columns: Date, Description, Debit, Credit, Balance, Reference
      const batchId = `import_${Date.now()}`;
      let importedCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
        if (cols.length < 3) continue;

        const dateStr = cols[0];
        const desc = cols[1];
        const debit = parseFloat(cols[2]) || 0;
        const credit = parseFloat(cols[3]) || 0;
        const bal = cols[4] ? parseFloat(cols[4]) : undefined;
        const ref = cols[5] || "";

        try {
          const res = await insertBankStatementTransaction({
            bank_account_id: selectedBankId,
            txn_date: dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00Z`,
            description: desc,
            debit_amount: debit,
            credit_amount: credit,
            balance: bal,
            reference: ref,
            import_batch: batchId,
          });
          if (res !== "duplicate") importedCount++;
        } catch (err) {
          console.warn("Row import skipped:", err);
        }
      }

      alert(`CSV Import Complete: ${importedCount} transactions imported (duplicates automatically skipped).`);
      triggerRefresh();
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    reader.readAsText(file);
  };

  const handleOpenMatch = (stmt: BankStatementTransaction) => {
    setMatchingItem(stmt);
    setSelectedMatchVoucherId("none");
    setSelectedMatchSalaryId("none");
    setMatchModalOpen(true);
  };

  const handleConfirmMatch = async () => {
    if (!matchingItem) return;
    if (selectedMatchVoucherId === "none" && selectedMatchSalaryId === "none") {
      alert("Please select a voucher or salary record to match against.");
      return;
    }

    setMatchingSubmitting(true);
    try {
      const amt = Number(matchingItem.debit_amount) > 0 ? Number(matchingItem.debit_amount) : Number(matchingItem.credit_amount);
      await matchBankTransaction({
        bank_statement_txn_id: matchingItem.id,
        voucher_id: selectedMatchVoucherId !== "none" ? selectedMatchVoucherId : null,
        salary_record_id: selectedMatchSalaryId !== "none" ? selectedMatchSalaryId : null,
        matched_amount: amt,
      });

      triggerRefresh();
      setMatchModalOpen(false);
    } catch (err: any) {
      alert("Error matching transaction: " + (err.message || err));
    } finally {
      setMatchingSubmitting(false);
    }
  };

  const handleUnmatch = async (stmt: BankStatementTransaction) => {
    if (!window.confirm("Are you sure you want to unmatch this statement transaction?")) return;
    try {
      await unmatchBankTransaction(stmt.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Aggregates for Bank Reconciliation Statement (BRS)
  const totalDebits = useMemo(() => statements.reduce((s, t) => s + (Number(t.debit_amount) || 0), 0), [statements]);
  const totalCredits = useMemo(() => statements.reduce((s, t) => s + (Number(t.credit_amount) || 0), 0), [statements]);
  const matchedCount = useMemo(() => statements.filter((s) => s.is_matched).length, [statements]);
  const unmatchedCount = useMemo(() => statements.filter((s) => !s.is_matched).length, [statements]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bank Reconciliation Statement (BRS)</h2>
        </div>
        <IosLoadingView text="Loading bank statements..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bank Reconciliation Statement (BRS)</h2>
          <p className="text-muted-foreground mt-1">
            Import statements, match bank entries with payment/receipt vouchers, and verify bank balances.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleCsvUpload}
            accept=".csv"
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedBankId}
            className="cursor-pointer text-xs h-9"
          >
            <Upload className="h-4 w-4 mr-1.5" /> Import CSV Statement
          </Button>
          <Button
            onClick={() => setAddModalOpen(true)}
            disabled={!selectedBankId}
            className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer text-xs h-9"
          >
            <PlusCircle className="h-4 w-4 mr-1.5" /> Add Statement Entry
          </Button>
        </div>
      </div>

      {/* Account Selector Bar */}
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
        <Landmark className="h-5 w-5 text-emerald-400 shrink-0" />
        <div className="flex-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold">Active Bank Account:</Label>
            <Select value={selectedBankId} onValueChange={setSelectedBankId}>
              <SelectTrigger className="h-8 text-xs w-64">
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
          </div>

          {activeAccount && (
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="text-muted-foreground">IFSC: {activeAccount.ifsc || "—"}</span>
              <span className="text-muted-foreground">Branch: {activeAccount.branch_name || "—"}</span>
              <span className="font-bold text-emerald-400">
                Opening Balance: ₹{Number(activeAccount.opening_balance).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* BRS Summary Statistics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Inward (Credits)</CardTitle>
            <span className="text-xs text-emerald-400 font-bold">+Deposit</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">₹{totalCredits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Receipts deposited into bank</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Outward (Debits)</CardTitle>
            <span className="text-xs text-rose-400 font-bold">-Withdrawal</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">₹{totalDebits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Payments disbursed via bank</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reconciled Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{matchedCount} / {statements.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {statements.length > 0 ? `${Math.round((matchedCount / statements.length) * 100)}% reconciled` : "No entries"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unmatched Statements</CardTitle>
            <Badge variant="outline" className="border-amber-500/40 text-amber-400">{unmatchedCount} pending</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{unmatchedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting match with vouchers</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Filter */}
      <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border w-fit">
        <Button
          size="sm"
          variant={activeTab === "UNMATCHED" ? "default" : "ghost"}
          onClick={() => setActiveTab("UNMATCHED")}
          className="h-7 text-xs"
        >
          Unmatched ({unmatchedCount})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "MATCHED" ? "default" : "ghost"}
          onClick={() => setActiveTab("MATCHED")}
          className="h-7 text-xs"
        >
          Matched ({matchedCount})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "ALL" ? "default" : "ghost"}
          onClick={() => setActiveTab("ALL")}
          className="h-7 text-xs"
        >
          All Statement Rows ({statements.length})
        </Button>
      </div>

      {/* Statements Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Withdrawal / Debit (₹)</TableHead>
                <TableHead className="text-right">Deposit / Credit (₹)</TableHead>
                <TableHead className="text-right">Balance (₹)</TableHead>
                <TableHead>Match Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStatements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    No bank statement entries found for this filter. Click "Add Statement Entry" or "Import CSV Statement".
                  </TableCell>
                </TableRow>
              ) : (
                filteredStatements.map((stmt) => (
                  <TableRow key={stmt.id}>
                    <TableCell className="text-xs font-mono">{new Date(stmt.txn_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs font-semibold max-w-[260px] truncate">{stmt.description || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{stmt.reference || "—"}</TableCell>
                    <TableCell className="text-right text-xs font-bold text-rose-400">
                      {Number(stmt.debit_amount) > 0 ? `₹${Number(stmt.debit_amount).toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold text-emerald-400">
                      {Number(stmt.credit_amount) > 0 ? `₹${Number(stmt.credit_amount).toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono text-muted-foreground">
                      {stmt.balance != null ? `₹${Number(stmt.balance).toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell>
                      {stmt.is_matched ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]">
                          MATCHED
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]">
                          UNMATCHED
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {stmt.is_matched ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnmatch(stmt)}
                          className="h-7 text-xs text-muted-foreground hover:text-rose-400"
                        >
                          <Unlink className="h-3 w-3 mr-1" /> Unmatch
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenMatch(stmt)}
                          className="h-7 text-xs border-blue-500/40 text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                        >
                          <Link2 className="h-3 w-3 mr-1" /> Match
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Manual Statement Entry Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleManualAddStatement}>
            <DialogHeader>
              <DialogTitle>Add Manual Bank Statement Entry</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Transaction Date *</Label>
                <Input
                  type="date"
                  value={stmtDate}
                  onChange={(e) => setStmtDate(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Description / Narration *</Label>
                <Input
                  placeholder="e.g. NEFT INWARD - ACME CORP"
                  value={stmtDesc}
                  onChange={(e) => setStmtDesc(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Withdrawal / Debit (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={stmtDebit}
                    onChange={(e) => setStmtDebit(e.target.value)}
                    min="0"
                    step="0.01"
                    className="h-8 text-xs font-bold text-rose-400"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Deposit / Credit (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={stmtCredit}
                    onChange={(e) => setStmtCredit(e.target.value)}
                    min="0"
                    step="0.01"
                    className="h-8 text-xs font-bold text-emerald-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Closing Balance (₹)</Label>
                  <Input
                    type="number"
                    placeholder="Optional"
                    value={stmtBalance}
                    onChange={(e) => setStmtBalance(e.target.value)}
                    step="0.01"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cheque / UTR #</Label>
                  <Input
                    placeholder="Optional"
                    value={stmtRef}
                    onChange={(e) => setStmtRef(e.target.value)}
                    className="h-8 text-xs font-mono"
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
                disabled={savingStmt || (!stmtDebit && !stmtCredit)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {savingStmt ? "Saving..." : "Add Statement Row"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Match Transaction Modal */}
      <Dialog open={matchModalOpen} onOpenChange={setMatchModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Match Statement Transaction</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {matchingItem && (
              <div className="p-3 rounded-lg border bg-muted/40 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Statement Description:</span>
                  <span className="truncate max-w-[240px]">{matchingItem.description}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Date:</span>
                  <span>{new Date(matchingItem.txn_date).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t">
                  <span>Amount:</span>
                  <span className={Number(matchingItem.credit_amount) > 0 ? "text-emerald-400" : "text-rose-400"}>
                    {Number(matchingItem.credit_amount) > 0
                      ? `+₹${Number(matchingItem.credit_amount).toLocaleString()} (Deposit)`
                      : `-₹${Number(matchingItem.debit_amount).toLocaleString()} (Disbursement)`}
                  </span>
                </div>
              </div>
            )}

            {matchingItem && Number(matchingItem.credit_amount) > 0 ? (
              // Credit -> Match with Customer Receipt Vouchers
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Match Against Customer Receipt Voucher:</Label>
                <Select value={selectedMatchVoucherId} onValueChange={setSelectedMatchVoucherId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Choose Matching Receipt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Select Matching Receipt Voucher --</SelectItem>
                    {receiptVouchers.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.voucher_number} • ₹{Number(v.total_amount).toLocaleString()} • {v.party_entity_name || "Customer"} ({new Date(v.voucher_date).toLocaleDateString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              // Debit -> Match with Supplier Payment Vouchers OR Salary Records
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Option A: Match Against Supplier Payment Voucher</Label>
                  <Select
                    value={selectedMatchVoucherId}
                    onValueChange={(val) => {
                      setSelectedMatchVoucherId(val);
                      if (val !== "none") setSelectedMatchSalaryId("none");
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose Matching Payment Voucher" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None (Not a supplier payment) --</SelectItem>
                      {paymentVouchers.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.voucher_number} • ₹{Number(v.total_amount).toLocaleString()} • {v.party_entity_name || "Payee"} ({new Date(v.voucher_date).toLocaleDateString()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Option B: Match Against Disbursed Salary Payment</Label>
                  <Select
                    value={selectedMatchSalaryId}
                    onValueChange={(val) => {
                      setSelectedMatchSalaryId(val);
                      if (val !== "none") setSelectedMatchVoucherId("none");
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Choose Matching Salary Payment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None (Not a salary payment) --</SelectItem>
                      {paidSalaries.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.payee_name} • ₹{Number(s.paid_amount).toLocaleString()} • {s.salary_month} ({s.payment_date ? new Date(s.payment_date).toLocaleDateString() : ""})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchModalOpen(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmMatch}
              disabled={matchingSubmitting || (selectedMatchVoucherId === "none" && selectedMatchSalaryId === "none")}
              className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
            >
              {matchingSubmitting ? "Linking..." : "Confirm Reconciliation Match"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
