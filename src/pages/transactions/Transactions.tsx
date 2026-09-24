import { useState, useEffect } from "react";
import { getTransactions, deleteTransactions, Transaction } from "@/lib/db/queries";
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

export function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const refreshTrigger = useStore(s => s.refreshTrigger);
  const triggerRefresh = useStore(s => s.triggerRefresh);
  const setQuickExpenseOpen = useStore(s => s.setQuickExpenseOpen);

  useEffect(() => {
    getTransactions().then(setTransactions).catch(console.error);
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
    await deleteTransactions(Array.from(selectedIds));
    triggerRefresh();
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
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete ({selectedIds.size})
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

      <div className="rounded-md border bg-card overflow-x-auto">
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
              <TableHead>Amount</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
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
