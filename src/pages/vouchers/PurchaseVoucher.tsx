import { useState, useEffect, useCallback } from "react";
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
  PlusCircle, Trash2, ShoppingCart, Clock, XCircle,
} from "lucide-react";
import type { Voucher, Product, ProductVariant } from "@/lib/db/erp";
import { getSqftPerSheet } from "@/lib/db/erp";
import {
  getVouchers, insertVoucher, getNextVoucherNumber, cancelVoucher,
} from "@/lib/db/accounting";
import { getProducts, getProductVariants } from "@/lib/db/inventory";
import { getEntities, Entity } from "@/lib/db/queries";

interface FormLine {
  id: string;
  product_id: string;
  variant_id: string;
  description: string;
  unit: string;
  quantity: number;
  quantity_sqft: number;
  rate: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
}

function emptyLine(): FormLine {
  return {
    id: `line_${Date.now()}_${Math.random()}`,
    product_id: "",
    variant_id: "",
    description: "",
    unit: "sheets",
    quantity: 1,
    quantity_sqft: 0,
    rate: 0,
    tax_percent: 0,
    tax_amount: 0,
    line_total: 0,
  };
}

export function PurchaseVoucher() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [suppliers, setSuppliers] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voucherNumber, setVoucherNumber] = useState("");
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [paidNow, setPaidNow] = useState("0");
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      getVouchers({
        voucherType: "purchase",
        businessEntityId: selectedEntityId || undefined,
      }),
      getProducts(),
      getProductVariants(),
      getEntities(),
    ])
      .then(([vList, pList, varList, eList]) => {
        setVouchers(vList);
        setProducts(pList);
        setVariants(varList);
        setSuppliers(eList.filter((e) => !e.type.toLowerCase().includes("customer")));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedEntityId]);

  useEffect(loadData, [loadData, refreshTrigger]);

  const openNewVoucher = async () => {
    if (!selectedEntityId) {
      alert("Please select a specific Operating Business Entity at the top header.");
      return;
    }
    try {
      const nextNum = await getNextVoucherNumber("PUR");
      setVoucherNumber(nextNum);
    } catch {
      setVoucherNumber(`PUR-${new Date().getFullYear()}-0001`);
    }
    setVoucherDate(new Date().toISOString().split("T")[0]);
    setSupplierId("");
    setPaymentMethod("credit");
    setPaidNow("0");
    setNarration("");
    setReference("");
    setLines([emptyLine()]);
    setDialogOpen(true);
  };

  const updateLine = (id: string, updates: Partial<FormLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...updates };

        const prod = products.find((p) => p.id === updated.product_id);
        const variant = variants.find((v) => v.id === updated.variant_id);

        if (prod?.category === "plywood" && variant?.size) {
          const sqftPerSheet = variant.sqft_per_sheet || getSqftPerSheet(variant.size);
          updated.quantity_sqft = (updated.quantity || 0) * sqftPerSheet;
        }

        const baseAmount =
          prod?.category === "plywood" && updated.quantity_sqft > 0
            ? updated.quantity_sqft * updated.rate
            : updated.quantity * updated.rate;

        const tax = (baseAmount * (updated.tax_percent || 0)) / 100;
        updated.tax_amount = Math.round(tax * 100) / 100;
        updated.line_total = Math.round((baseAmount + tax) * 100) / 100;

        return updated;
      })
    );
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const subtotal = lines.reduce((s, l) => {
    const prod = products.find((p) => p.id === l.product_id);
    const base = prod?.category === "plywood" && l.quantity_sqft > 0 ? l.quantity_sqft * l.rate : l.quantity * l.rate;
    return s + base;
  }, 0);

  const totalTax = lines.reduce((s, l) => s + (l.tax_amount || 0), 0);
  const grandTotal = Math.round((subtotal + totalTax) * 100) / 100;
  const paidAmount = parseFloat(paidNow) || 0;
  const balanceDue = Math.max(0, grandTotal - paidAmount);
  const paymentStatus: "paid" | "partial" | "unpaid" =
    balanceDue === 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  const handleSaveVoucher = async () => {
    if (!selectedEntityId) return;
    if (!supplierId) {
      alert("Please select a supplier.");
      return;
    }
    if (lines.some((l) => !l.product_id || l.quantity <= 0)) {
      alert("Please provide valid products and quantities for all lines.");
      return;
    }

    setSaving(true);
    try {
      // 1. Insert Voucher
      await insertVoucher({
        business_entity_id: selectedEntityId,
        voucher_type: "purchase",
        voucher_number: voucherNumber,
        voucher_date: voucherDate + "T12:00:00Z",
        party_entity_id: supplierId,
        subtotal: Math.round(subtotal * 100) / 100,
        tax_amount: Math.round(totalTax * 100) / 100,
        total_amount: grandTotal,
        paid_amount: paidAmount,
        balance_due: balanceDue,
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        bank_account_id: null,
        reference: reference || null,
        narration: narration || null,
        source_transaction_id: null,
        status: "posted",
        lines: lines.map((l, i) => ({
          line_no: i + 1,
          product_id: l.product_id,
          variant_id: l.variant_id || null,
          description: l.description || null,
          unit: l.unit || null,
          quantity: l.quantity,
          quantity_sqft: l.quantity_sqft || null,
          rate: l.rate,
          tax_percent: l.tax_percent || 0,
          tax_amount: l.tax_amount || 0,
          line_total: l.line_total,
          debit_account_id: "acc_purchase",
          credit_account_id: "acc_payable",
        })),
      });

      triggerRefresh();
      setDialogOpen(false);
    } catch (err: any) {
      alert("Failed to save purchase voucher: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelVoucher = async (v: Voucher) => {
    if (!window.confirm(`Are you sure you want to cancel purchase voucher ${v.voucher_number}?`)) return;
    try {
      await cancelVoucher(v.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const totalPurchases = vouchers.reduce((s, v) => s + (Number(v.total_amount) || 0), 0);
  const totalPaid = vouchers.reduce((s, v) => s + (Number(v.paid_amount) || 0), 0);
  const totalOutstanding = vouchers.reduce((s, v) => s + (Number(v.balance_due) || 0), 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Purchase Invoices &amp; Inward Stock</h2>
        </div>
        <IosLoadingView text="Loading purchase vouchers..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Purchase Invoices &amp; Inward Stock</h2>
          <p className="text-muted-foreground mt-1">
            Record raw material &amp; timber purchases, update inventory stock, and track accounts payable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <Button onClick={openNewVoucher} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <PlusCircle className="h-4 w-4 mr-2" /> New Purchase Invoice
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Purchases</CardTitle>
            <ShoppingCart className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">₹{totalPurchases.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{vouchers.length} invoices recorded</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disbursed / Paid</CardTitle>
            <Clock className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">₹{totalPaid.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Liquid payments completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payable Balance Owed</CardTitle>
            <XCircle className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">₹{totalOutstanding.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending payment to suppliers</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Auto-Stock Inward</CardTitle>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">Enabled</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Immediate Stock Addition</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Increments timber, veneer, resin stock balances</p>
          </CardContent>
        </Card>
      </div>

      {/* Vouchers Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total (₹)</TableHead>
                <TableHead className="text-right">Paid (₹)</TableHead>
                <TableHead className="text-right">Balance Due (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                    No purchase vouchers found. Click "New Purchase Invoice" to record supplier bills.
                  </TableCell>
                </TableRow>
              ) : (
                vouchers.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono font-bold text-xs">{v.voucher_number}</TableCell>
                    <TableCell className="text-xs">{new Date(v.voucher_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-semibold text-xs">{v.party_entity_name || "—"}</TableCell>
                    <TableCell className="text-right text-xs">₹{Number(v.subtotal).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs">₹{Number(v.tax_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold text-xs text-rose-400">
                      ₹{Number(v.total_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs text-emerald-400">
                      ₹{Number(v.paid_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-xs text-amber-400">
                      ₹{Number(v.balance_due).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          v.payment_status === "paid"
                            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                            : v.payment_status === "partial"
                            ? "border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]"
                            : "border-rose-500/40 text-rose-400 bg-rose-500/10 text-[10px]"
                        }
                      >
                        {v.payment_status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {v.status === "posted" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelVoucher(v)}
                          className="h-7 text-xs text-muted-foreground hover:text-rose-400"
                        >
                          Cancel
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

      {/* New Purchase Invoice Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Voucher / Supplier Invoice</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Invoice # *</Label>
                <Input
                  value={voucherNumber}
                  onChange={(e) => setVoucherNumber(e.target.value)}
                  className="h-8 text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Invoice Date *</Label>
                <Input
                  type="date"
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                  className="h-8 text-xs"
                  required
                />
              </div>

              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Supplier (Contact) *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Purchased Items / Raw Materials
                </span>
                <Button size="sm" variant="outline" onClick={addLine} className="h-7 text-xs">
                  <PlusCircle className="h-3.5 w-3.5 mr-1" /> Add Line
                </Button>
              </div>

              <div className="space-y-2">
                {lines.map((line) => {
                  const prod = products.find((p) => p.id === line.product_id);
                  const pVariants = variants.filter((v) => v.product_id === line.product_id);
                  const isPlywood = prod?.category === "plywood";

                  return (
                    <div
                      key={line.id}
                      className="p-3 rounded-lg border border-border/80 bg-muted/30 grid grid-cols-12 gap-2 items-end"
                    >
                      <div className="col-span-12 sm:col-span-3 space-y-1">
                        <Label className="text-[10px]">Product / Material *</Label>
                        <Select
                          value={line.product_id}
                          onValueChange={(val) => {
                            const pObj = products.find((p) => p.id === val);
                            updateLine(line.id, {
                              product_id: val,
                              variant_id: "",
                              unit: pObj?.unit || "sheets",
                            });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select Item" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} ({p.category})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {pVariants.length > 0 && (
                        <div className="col-span-12 sm:col-span-2 space-y-1">
                          <Label className="text-[10px]">Variant *</Label>
                          <Select
                            value={line.variant_id}
                            onValueChange={(val) => updateLine(line.id, { variant_id: val })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Size / mm" />
                            </SelectTrigger>
                            <SelectContent>
                              {pVariants.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  {v.size} {v.thickness ? `• ${v.thickness}mm` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="col-span-4 sm:col-span-2 space-y-1">
                        <Label className="text-[10px]">
                          Qty ({isPlywood ? "Sheets" : prod?.unit || "Units"}) *
                        </Label>
                        <Input
                          type="number"
                          value={line.quantity || ""}
                          onChange={(e) => updateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                          min="0.1"
                          step="any"
                          className="h-8 text-xs font-semibold"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2 space-y-1">
                        <Label className="text-[10px]">Rate / Unit (₹) *</Label>
                        <Input
                          type="number"
                          value={line.rate || ""}
                          onChange={(e) => updateLine(line.id, { rate: parseFloat(e.target.value) || 0 })}
                          min="0"
                          step="0.01"
                          className="h-8 text-xs font-semibold"
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-2 space-y-1">
                        <Label className="text-[10px]">Line Total (₹)</Label>
                        <div className="h-8 rounded border bg-background/80 px-2 flex items-center font-bold text-xs">
                          ₹{line.line_total.toLocaleString()}
                        </div>
                      </div>

                      <div className="col-span-1 flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.id)}
                          disabled={lines.length <= 1}
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Financial Summary & Payment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-3">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">Full Credit (Pay Later)</SelectItem>
                      <SelectItem value="cash">Cash in Hand</SelectItem>
                      <SelectItem value="bank">Bank Transfer (NEFT/RTGS)</SelectItem>
                      <SelectItem value="upi">UPI / Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Amount Paid Upfront (₹)</Label>
                  <Input
                    type="number"
                    value={paidNow}
                    onChange={(e) => setPaidNow(e.target.value)}
                    min="0"
                    step="0.01"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Supplier Reference / Notes</Label>
                  <Input
                    placeholder="e.g. Timber batch #3, Lorry #KA01AB1234"
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border/80 bg-muted/40 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-semibold">₹{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax Total:</span>
                  <span>₹{totalTax.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t pt-1 text-rose-400">
                  <span>Grand Total:</span>
                  <span>₹{grandTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-1 border-t text-muted-foreground">
                  <span>Paid Now:</span>
                  <span className="text-emerald-400 font-semibold">₹{paidAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-amber-400">
                  <span>Payable Balance Due:</span>
                  <span>₹{balanceDue.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              onClick={handleSaveVoucher}
              disabled={saving || !supplierId || grandTotal <= 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
            >
              {saving ? "Posting..." : "Confirm & Post Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
