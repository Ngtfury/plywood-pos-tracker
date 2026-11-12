import { useState, useEffect } from "react";
import { getTransactions, deleteTransactions, Transaction } from "@/lib/db/queries";
import { getBankAccounts } from "@/lib/db/accounting";
import type { BankAccount } from "@/lib/db/erp";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { IosSpinner, IosLoadingView, IosLoadingOverlay } from "@/components/ui/IosSpinner";

export function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  
  const refreshTrigger = useStore(s => s.refreshTrigger);
  const triggerRefresh = useStore(s => s.triggerRefresh);
  const setQuickExpenseOpen = useStore(s => s.setQuickExpenseOpen);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTransactions(), getBankAccounts()])
      .then(([transactionList, bankAccountList]) => {
        setTransactions(transactionList);
        setBankAccounts(bankAccountList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    setSelectedIds(new Set());
  }, [refreshTrigger]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} transaction(s)?`)) return;
    setIsDeleting(true);
    try {
      await deleteTransactions(Array.from(selectedIds));
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete transactions: " + (err?.message || err));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Transactions</h2>
          <p className="text-muted-foreground">
            Manage your incoming and outgoing transactions.
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <span className="flex items-center gap-1.5">
                  <IosSpinner size="sm" className="text-white" />
                  Deleting...
                </span>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedIds.size})
                </>
              )}
            </Button>
          )}
          <button 
            onClick={() => setQuickExpenseOpen(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Transaction
          </button>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto relative min-h-[300px]">
        {isDeleting && <IosLoadingOverlay text="Deleting transactions..." />}

        {loading ? (
          <IosLoadingView text="Loading transactions..." minHeight="300px" />
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300"
                  checked={transactions.length > 0 && selectedIds.size === transactions.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(transactions.map(t => t.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Total Received</TableHead>
              <TableHead>Payment Breakdown</TableHead>
              <TableHead>Credit / Balance</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((txn) => (
                <TableRow 
                  key={txn.id} 
                  style={{ backgroundColor: txn.category_color ? `${txn.category_color}15` : undefined }}
                >
                  <TableCell>
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300"
                      checked={selectedIds.has(txn.id)}
                      onChange={() => toggleSelect(txn.id)}
                    />
                  </TableCell>
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
                    ₹{(txn.type === "IN" ? (txn.total_amount || txn.amount) : txn.amount).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {txn.type === "IN" ? (() => {
                      const payment = txn.custom_data || {};
                      const total = Number(txn.total_amount || txn.amount);
                      const cash = payment.cash_amount != null ? Number(payment.cash_amount) : total;
                      const bank = payment.bank_amount != null ? Number(payment.bank_amount) : 0;
                      const bankAccount = bankAccounts.find((account) => account.id === payment.bank_account_id);
                      const paymentMode = payment.payment_method === "cash_only"
                        ? "Cash Only"
                        : payment.payment_method === "bank_transfer_only"
                          ? "Bank Transfer Only"
                          : payment.payment_method === "cash_and_bank"
                            ? "Cash + Bank Transfer"
                            : bank > 0 && cash > 0
                              ? "Cash + Bank Transfer"
                              : bank > 0 ? "Bank Transfer Only" : "Cash Only";
                      return (
                        <div className="text-xs space-y-0.5 min-w-44">
                          <div className="font-medium">{paymentMode}</div>
                          <div>Cash: ₹{cash.toLocaleString()}</div>
                          <div>Bank Transfer: ₹{bank.toLocaleString()}</div>
                          {bank > 0 && (
                            <div className="text-muted-foreground">
                              Bank: {bankAccount ? `${bankAccount.bank_name} (${bankAccount.account_no})` : (payment.bank_account_id || "—")}
                            </div>
                          )}
                          {payment.payment_reference && (
                            <div className="text-muted-foreground">UTR: {payment.payment_reference}</div>
                          )}
                        </div>
                      );
                    })() : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {txn.balance_due != null && txn.balance_due > 0 ? (
                      <div className="text-xs space-y-0.5">
                        <div className="text-muted-foreground">Bill: ₹{(txn.total_amount || txn.amount).toLocaleString()}</div>
                        <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]">
                          Due: ₹{txn.balance_due.toLocaleString()}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Settled</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {txn.notes || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        )}
      </div>
    </div>
  );
}
