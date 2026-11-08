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
  Wallet, PlusCircle, ArrowDownLeft, Ban
} from "lucide-react";
import type { Voucher } from "@/lib/db/erp";
import {
  getVouchers, insertVoucher, getNextVoucherNumber, cancelVoucher,
} from "@/lib/db/accounting";
import { getEntities, Entity } from "@/lib/db/queries";

export function ReceiptVoucher() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [customers, setCustomers] = useState<Entity[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Voucher[]>([]);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voucherNumber, setVoucherNumber] = useState("");
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [customerId, setCustomerId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("none");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getVouchers({
        voucherType: "receipt",
        businessEntityId: selectedEntityId || undefined,
      }),
      getEntities(),
      getVouchers({
        voucherType: "sales",
        businessEntityId: selectedEntityId || undefined,
      }),
    ])
      .then(([rcpList, entList, salesList]) => {
        setVouchers(rcpList);
        setCustomers(entList.filter((e) => e.type.toLowerCase().includes("customer") || e.type.toLowerCase().includes("client")));
        setOpenInvoices(salesList.filter((s) => Number(s.balance_due) > 0));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [selectedEntityId, refreshTrigger]);

  // When customer changes, filter open invoices for this customer
  const customerInvoices = useMemo(() => {
    if (!customerId) return [];
    return openInvoices.filter((inv) => inv.party_entity_id === customerId);
  }, [openInvoices, customerId]);

  const openNewReceipt = async () => {
    if (!selectedEntityId) {
      alert("Please select an Operating Business Entity from the top header.");
      return;
    }
    try {
      const nextNum = await getNextVoucherNumber("RCP");
      setVoucherNumber(nextNum);
    } catch {
      setVoucherNumber(`RCP-${new Date().getFullYear()}-0001`);
    }
    setVoucherDate(new Date().toISOString().split("T")[0]);
    setCustomerId("");
    setSelectedInvoiceId("none");
    setAmount("");
    setPaymentMethod("bank");
    setReference("");
    setNarration("");
    setDialogOpen(true);
  };

  const handleInvoiceSelect = (invId: string) => {
    setSelectedInvoiceId(invId);
    if (invId !== "none") {
      const inv = customerInvoices.find((i) => i.id === invId);
      if (inv) {
        setAmount(inv.balance_due.toString());
      }
    }
  };

  const handleSaveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) return;
    const recAmount = parseFloat(amount);
    if (!customerId || !recAmount || recAmount <= 0) {
      alert("Please specify a customer and valid amount.");
      return;
    }

    setSaving(true);
    try {
      // 1. Post Receipt Accounting Voucher
      await insertVoucher({
        business_entity_id: selectedEntityId,
        voucher_type: "receipt",
        voucher_number: voucherNumber,
        voucher_date: voucherDate + "T12:00:00Z",
        party_entity_id: customerId,
        subtotal: recAmount,
        tax_amount: 0,
        total_amount: recAmount,
        paid_amount: recAmount,
        balance_due: 0,
        payment_status: "paid",
        payment_method: paymentMethod,
        bank_account_id: null,
        reference: reference || null,
        narration: narration || `Customer payment received (${paymentMethod.toUpperCase()})`,
        source_transaction_id: null,
        status: "posted",
        lines: [
          {
            line_no: 1,
            product_id: null,
            variant_id: null,
            description: selectedInvoiceId !== "none" ? `Receipt against invoice #${customerInvoices.find(i=>i.id===selectedInvoiceId)?.voucher_number}` : "On-account receipt",
            unit: null,
            quantity: 1,
            quantity_sqft: null,
            rate: recAmount,
            tax_percent: 0,
            tax_amount: 0,
            line_total: recAmount,
            debit_account_id: paymentMethod === "cash" ? "acc_cash" : "acc_bank",
            credit_account_id: "acc_receivable",
          },
        ],
      });

      triggerRefresh();
      setDialogOpen(false);
    } catch (err: any) {
      alert("Error recording receipt voucher: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (v: Voucher) => {
    if (!window.confirm(`Cancel receipt voucher ${v.voucher_number}?`)) return;
    try {
      await cancelVoucher(v.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const totalReceipts = vouchers.reduce((s, v) => s + (Number(v.total_amount) || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Customer Receipt Vouchers</h2>
        </div>
        <IosLoadingView text="Loading customer receipt vouchers..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Customer Receipt Vouchers</h2>
          <p className="text-muted-foreground mt-1">
            Record payments collected from customers, settle open invoices, and update receivables.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <Button onClick={openNewReceipt} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <PlusCircle className="h-4 w-4 mr-2" /> New Receipt Voucher
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Receipts Collected</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">₹{totalReceipts.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{vouchers.length} receipt vouchers logged</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Invoices Pending</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{openInvoices.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Unsettled sales bills awaiting collection</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dual Integration</CardTitle>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">Sync Active</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Realized Cashflow</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Updates customer ledger balance without duplicating sales revenue.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer Receipt Journal</CardTitle>
          <CardDescription>Verified inward payments credited to cash or bank accounts.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                    No receipt vouchers recorded yet. Click "New Receipt Voucher" to log collections.
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
                    <TableCell className="text-right font-bold text-xs text-emerald-400">
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

      {/* New Receipt Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSaveReceipt}>
            <DialogHeader>
              <DialogTitle>Record Customer Receipt Voucher</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Receipt # *</Label>
                  <Input
                    value={voucherNumber}
                    onChange={(e) => setVoucherNumber(e.target.value)}
                    required
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Receipt Date *</Label>
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
                <Label className="text-xs">Customer (Party Entity) *</Label>
                <Select value={customerId} onValueChange={(val) => { setCustomerId(val); setSelectedInvoiceId("none"); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {customerInvoices.length > 0 && (
                <div className="space-y-1 p-2.5 rounded bg-muted/40 border">
                  <Label className="text-[11px] font-semibold text-primary">Settle Against Sales Invoice (Optional):</Label>
                  <Select value={selectedInvoiceId} onValueChange={handleInvoiceSelect}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Select open bill or on-account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- General / On Account (No specific invoice) --</SelectItem>
                      {customerInvoices.map((inv) => (
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
                  <Label className="text-xs">Receipt Amount (₹) *</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    min="0.01"
                    step="0.01"
                    className="h-8 text-xs font-bold text-emerald-400"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Transfer (NEFT/IMPS)</SelectItem>
                      <SelectItem value="upi">UPI / QR Code</SelectItem>
                      <SelectItem value="cash">Cash in Hand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Bank / UPI Reference / UTR Number</Label>
                <Input
                  placeholder="e.g. UTR #123456789, Cheque #000123"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Narration</Label>
                <Input
                  placeholder="e.g. Partial payment for October order"
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
                disabled={saving || !customerId || parseFloat(amount) <= 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {saving ? "Posting..." : "Save Receipt Voucher"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
