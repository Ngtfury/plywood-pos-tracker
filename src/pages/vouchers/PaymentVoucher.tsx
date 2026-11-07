import { useState, useEffect, useMemo } from "react";
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
  ArrowUpFromLine, PlusCircle, Ban, CheckCircle2
} from "lucide-react";
import type { Voucher, BankAccount } from "@/lib/db/erp";
import {
  getVouchers, insertVoucher, getNextVoucherNumber, cancelVoucher, getBankAccounts
} from "@/lib/db/accounting";
import { getEntities, Entity } from "@/lib/db/queries";

export function PaymentVoucher() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [parties, setParties] = useState<Entity[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [openPurchases, setOpenPurchases] = useState<Voucher[]>([]);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voucherNumber, setVoucherNumber] = useState("");
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [payeeId, setPayeeId] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>("none");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"bank" | "cash" | "upi">("bank");
  const [selectedBankId, setSelectedBankId] = useState("");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getVouchers({
        voucherType: "payment",
        businessEntityId: selectedEntityId || undefined,
      }),
      getEntities(),
      getBankAccounts(selectedEntityId || undefined),
      getVouchers({
        voucherType: "purchase",
        businessEntityId: selectedEntityId || undefined,
      }),
    ])
      .then(([payList, entList, bankList, purList]) => {
        setVouchers(payList);
        setParties(entList);
        setBankAccounts(bankList);
        setOpenPurchases(purList.filter((p) => Number(p.balance_due) > 0));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [selectedEntityId, refreshTrigger]);

  const supplierPurchases = useMemo(() => {
    if (!payeeId) return [];
    return openPurchases.filter((p) => p.party_entity_id === payeeId);
  }, [openPurchases, payeeId]);

  const openNewPayment = async () => {
    if (!selectedEntityId) {
      alert("Please select an Operating Business Entity from the top header.");
      return;
    }
    try {
      const nextNum = await getNextVoucherNumber("PAY");
      setVoucherNumber(nextNum);
    } catch {
      setVoucherNumber(`PAY-${new Date().getFullYear()}-0001`);
    }
    setVoucherDate(new Date().toISOString().split("T")[0]);
    setPayeeId("");
    setSelectedPurchaseId("none");
    setAmount("");
    setPaymentMethod("bank");
    setSelectedBankId(bankAccounts[0]?.id || "");
    setReference("");
    setNarration("");
    setDialogOpen(true);
  };

  const handlePurchaseSelect = (invId: string) => {
    setSelectedPurchaseId(invId);
    if (invId !== "none") {
      const p = supplierPurchases.find((i) => i.id === invId);
      if (p) {
        setAmount(p.balance_due.toString());
      }
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) return;
    const payAmount = parseFloat(amount);
    if (!payeeId || !payAmount || payAmount <= 0) {
      alert("Please specify a payee party and a valid amount.");
      return;
    }

    setSaving(true);
    try {
      // 1. Post Payment Accounting Voucher
      await insertVoucher({
        business_entity_id: selectedEntityId,
        voucher_type: "payment",
        voucher_number: voucherNumber,
        voucher_date: voucherDate + "T12:00:00Z",
        party_entity_id: payeeId,
        subtotal: payAmount,
        tax_amount: 0,
        total_amount: payAmount,
        paid_amount: payAmount,
        balance_due: 0,
        payment_status: "paid",
        payment_method: paymentMethod,
        bank_account_id: paymentMethod === "cash" ? null : selectedBankId || null,
        reference: reference || null,
        narration: narration || `Disbursement to supplier/payee (${paymentMethod.toUpperCase()})`,
        source_transaction_id: null,
        status: "posted",
        lines: [
          {
            line_no: 1,
            product_id: null,
            variant_id: null,
            description: selectedPurchaseId !== "none" ? `Settlement against invoice #${supplierPurchases.find(p=>p.id===selectedPurchaseId)?.voucher_number}` : "Payment on-account",
            unit: null,
            quantity: 1,
            quantity_sqft: null,
            rate: payAmount,
            tax_percent: 0,
            tax_amount: 0,
            line_total: payAmount,
            debit_account_id: "acc_payable",
            credit_account_id: paymentMethod === "cash" ? "acc_cash" : "acc_bank",
          },
        ],
      });

      triggerRefresh();
      setDialogOpen(false);
    } catch (err: any) {
      alert("Error posting payment voucher: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (v: Voucher) => {
    if (!window.confirm(`Cancel payment voucher ${v.voucher_number}?`)) return;
    try {
      await cancelVoucher(v.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const totalDisbursed = vouchers.reduce((s, v) => s + (Number(v.total_amount) || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Supplier &amp; Party Payment Vouchers</h2>
        </div>
        <IosLoadingView text="Loading payment vouchers..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Supplier &amp; Party Payment Vouchers</h2>
          <p className="text-muted-foreground mt-1">
            Record disbursements to suppliers, transporters, and vendors. Reduces accounts payable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <Button onClick={openNewPayment} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <PlusCircle className="h-4 w-4 mr-2" /> New Payment Voucher
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payments Disbursed</CardTitle>
            <ArrowUpFromLine className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">₹{totalDisbursed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{vouchers.length} payment vouchers posted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Purchase Invoices</CardTitle>
            <span className="text-xs text-amber-400 font-semibold">{openPurchases.length} open</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              ₹{openPurchases.reduce((s, p) => s + (Number(p.balance_due) || 0), 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total pending supplier payable</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Double-Counting Protection</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Payable Settlement Only</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Payment only decreases payables; does NOT record a second purchase expense.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Disbursement &amp; Payment Journal</CardTitle>
          <CardDescription>Verified supplier settlements and outward payments.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Payee / Supplier</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Disbursed (₹)</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                    No payment vouchers recorded yet. Click "New Payment Voucher" to log disbursements.
                  </TableCell>
                </TableRow>
              ) : (
                vouchers.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono font-bold text-xs">{v.voucher_number}</TableCell>
                    <TableCell className="text-xs">{new Date(v.voucher_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-semibold text-xs">{v.party_entity_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {v.payment_method || "CASH"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{v.reference || "—"}</TableCell>
                    <TableCell className="text-right font-bold text-xs text-rose-400">
                      ₹{Number(v.total_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {v.narration || "—"}
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

      {/* New Payment Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSavePayment}>
            <DialogHeader>
              <DialogTitle>Record Payment / Disbursement Voucher</DialogTitle>
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
                <Label className="text-xs">Payee / Supplier *</Label>
                <Select value={payeeId} onValueChange={(val) => { setPayeeId(val); setSelectedPurchaseId("none"); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Supplier / Party" />
                  </SelectTrigger>
                  <SelectContent>
                    {parties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {supplierPurchases.length > 0 && (
                <div className="space-y-1 p-2.5 rounded bg-muted/40 border">
                  <Label className="text-[11px] font-semibold text-primary">Settle Open Purchase Bill (Optional):</Label>
                  <Select value={selectedPurchaseId} onValueChange={handlePurchaseSelect}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Select bill or on-account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- General / On Account (No specific invoice) --</SelectItem>
                      {supplierPurchases.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.voucher_number} • Due: ₹{Number(inv.balance_due).toLocaleString()} (Date: {new Date(inv.voucher_date).toLocaleDateString()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment Amount (₹) *</Label>
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
                  <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Transfer (NEFT/RTGS)</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cash">Cash in Hand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {paymentMethod !== "cash" && bankAccounts.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Disbursing Bank Account</Label>
                  <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select Bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.bank_name} ({b.account_no})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Bank / UTR Reference</Label>
                <Input
                  placeholder="e.g. UTR #987654321, Cheque #00456"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Narration</Label>
                <Input
                  placeholder="e.g. Timber settlement for Batch #4"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
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
                disabled={saving || !payeeId || parseFloat(amount) <= 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {saving ? "Posting..." : "Confirm & Disburse Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
