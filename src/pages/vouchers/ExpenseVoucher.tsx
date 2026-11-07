import { useState, useEffect } from "react";
import { useStore } from "@/store";
import { BusinessEntitySelector } from "@/components/erp/BusinessEntitySelector";
import { IosLoadingView } from "@/components/ui/IosSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  DollarSign, PlusCircle, Ban
} from "lucide-react";
import type { Voucher } from "@/lib/db/erp";
import {
  getVouchers, insertVoucher, getNextVoucherNumber, cancelVoucher,
} from "@/lib/db/accounting";
import { getCategories, Category } from "@/lib/db/queries";

export function ExpenseVoucher() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voucherNumber, setVoucherNumber] = useState("");
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getVouchers({
        voucherType: "expense",
        businessEntityId: selectedEntityId || undefined,
      }),
      getCategories("OUT"),
    ])
      .then(([expList, catList]) => {
        setVouchers(expList);
        setCategories(catList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [selectedEntityId, refreshTrigger]);

  const openNewExpense = async () => {
    if (!selectedEntityId) {
      alert("Please select an Operating Business Entity from top header.");
      return;
    }
    try {
      const nextNum = await getNextVoucherNumber("EXP");
      setVoucherNumber(nextNum);
    } catch {
      setVoucherNumber(`EXP-${new Date().getFullYear()}-0001`);
    }
    setVoucherDate(new Date().toISOString().split("T")[0]);
    setCategoryId(categories[0]?.id || "");
    setAmount("");
    setPaymentMethod("cash");
    setReference("");
    setNarration("");
    setDialogOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) return;
    const expAmount = parseFloat(amount);
    if (!expAmount || expAmount <= 0) {
      alert("Please specify a valid expense amount.");
      return;
    }
    if (!narration.trim()) {
      alert("Mandatory narration is required for accounting audit compliance.");
      return;
    }

    setSaving(true);
    try {
      const selectedCat = categories.find((c) => c.id === categoryId);

      // Determine corresponding debit account
      let debitAcc = "acc_misc_expense";
      if (categoryId.includes("transport")) debitAcc = "acc_transport";
      else if (categoryId.includes("labour")) debitAcc = "acc_labour";
      else if (categoryId.includes("utilities")) debitAcc = "acc_utilities";

      await insertVoucher({
        business_entity_id: selectedEntityId,
        voucher_type: "expense",
        voucher_number: voucherNumber,
        voucher_date: voucherDate + "T12:00:00Z",
        party_entity_id: null,
        subtotal: expAmount,
        tax_amount: 0,
        total_amount: expAmount,
        paid_amount: expAmount,
        balance_due: 0,
        payment_status: "paid",
        payment_method: paymentMethod,
        bank_account_id: null,
        reference: reference || null,
        narration: narration.trim(),
        source_transaction_id: null,
        status: "posted",
        lines: [
          {
            line_no: 1,
            product_id: null,
            variant_id: null,
            description: selectedCat ? selectedCat.name : "Operating Expense",
            unit: null,
            quantity: 1,
            quantity_sqft: null,
            rate: expAmount,
            tax_percent: 0,
            tax_amount: 0,
            line_total: expAmount,
            debit_account_id: debitAcc,
            credit_account_id: paymentMethod === "cash" ? "acc_cash" : "acc_bank",
          },
        ],
      });

      triggerRefresh();
      setDialogOpen(false);
    } catch (err: any) {
      alert("Error saving expense voucher: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (v: Voucher) => {
    if (!window.confirm(`Cancel expense voucher ${v.voucher_number}?`)) return;
    try {
      await cancelVoucher(v.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const totalExpense = vouchers.reduce((s, v) => s + (Number(v.total_amount) || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Operating Expense Vouchers</h2>
        </div>
        <IosLoadingView text="Loading expense vouchers..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Operating Expense Vouchers</h2>
          <p className="text-muted-foreground mt-1">
            Track factory overheads, transport freight, electricity, and miscellaneous business expenditures.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <Button onClick={openNewExpense} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <PlusCircle className="h-4 w-4 mr-2" /> New Expense Voucher
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Operating Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">₹{totalExpense.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{vouchers.length} vouchers logged</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expense Categories</CardTitle>
            <Badge variant="outline">{categories.length} active</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Freight, Labour, Utilities, Rent</div>
            <p className="text-xs text-muted-foreground mt-0.5">Fully categorized overhead tracking</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profit &amp; Loss Impact</CardTitle>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">P&amp;L Linked</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Immediate OPEX Deduction</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Accurately computes Net Profit % from accounting entries</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense Voucher Register</CardTitle>
          <CardDescription>Verified disbursements with mandatory audit narration.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Narration / Description</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    No expense vouchers recorded yet. Click "New Expense Voucher" to log overheads.
                  </TableCell>
                </TableRow>
              ) : (
                vouchers.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono font-bold text-xs">{v.voucher_number}</TableCell>
                    <TableCell className="text-xs">{new Date(v.voucher_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs font-semibold max-w-[240px] truncate">{v.narration || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {v.payment_method || "CASH"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{v.reference || "—"}</TableCell>
                    <TableCell className="text-right font-bold text-xs text-rose-400">
                      ₹{Number(v.total_amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          v.status === "posted"
                            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                            : "border-zinc-500 text-zinc-400 bg-zinc-800/40 text-[10px]"
                        }
                      >
                        {v.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {v.status === "posted" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(v)}
                          className="h-7 text-xs text-muted-foreground hover:text-rose-400"
                        >
                          <Ban className="h-3 w-3 mr-1" /> Cancel
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

      {/* New Expense Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSaveExpense}>
            <DialogHeader>
              <DialogTitle>Record Operating Expense Voucher</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Voucher # *</Label>
                  <Input
                    value={voucherNumber}
                    onChange={(e) => setVoucherNumber(e.target.value)}
                    required
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Date *</Label>
                  <Input
                    type="date"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Expense Category *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Expense Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Amount (₹) *</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    min="0.01"
                    step="0.01"
                    className="h-8 text-xs font-bold text-rose-400"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Payment Mode</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash in Hand</SelectItem>
                      <SelectItem value="bank">Bank Account</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Reference (Bill / Receipt #)</Label>
                <Input
                  placeholder="e.g. EB Bill #90214, Diesel Receipt #41"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Mandatory Narration *</Label>
                <Input
                  placeholder="e.g. Factory generator diesel 50 litres"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || parseFloat(amount) <= 0 || !narration.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {saving ? "Posting..." : "Save Expense Voucher"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
