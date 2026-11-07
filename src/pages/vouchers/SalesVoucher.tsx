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
  PlusCircle, Trash2, FileText, XCircle,
} from "lucide-react";
import type { Voucher, VoucherLine, Product, ProductVariant } from "@/lib/db/erp";
import { getSqftPerSheet } from "@/lib/db/erp";
import {
  getVouchers, insertVoucher, getNextVoucherNumber, cancelVoucher,
} from "@/lib/db/accounting";
import { getProducts, getProductVariants } from "@/lib/db/inventory";
import { getEntities } from "@/lib/db/queries";
import type { Entity } from "@/lib/db/queries";

// ---- Local line type for the form ----
interface FormLine {
  id: string;
  product_id: string;
  variant_id: string;
  description: string;
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
    quantity: 1,
    quantity_sqft: 0,
    rate: 0,
    tax_percent: 18,
    tax_amount: 0,
    line_total: 0,
  };
}

function recalcLine(line: FormLine, variants: ProductVariant[]): FormLine {
  const variant = variants.find((v) => v.id === line.variant_id);
  const sqft_per_sheet = variant?.sqft_per_sheet ?? getSqftPerSheet(variant?.size ?? "");
  const quantity_sqft = line.quantity * (sqft_per_sheet || 0);
  const baseAmount = quantity_sqft * line.rate;
  const tax_amount = (baseAmount * line.tax_percent) / 100;
  const line_total = baseAmount + tax_amount;
  return { ...line, quantity_sqft, tax_amount, line_total };
}

function paymentStatusBadge(status: string) {
  if (status === "paid")
    return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">Paid</Badge>;
  if (status === "partial")
    return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/20">Partial</Badge>;
  return <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/20">Unpaid</Badge>;
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SalesVoucher() {
  const { selectedBusinessEntityId, triggerRefresh, refreshTrigger } = useStore();

  // List state
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Dialog state
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [entities, setEntities] = useState<Entity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);

  const [bizEntityId, setBizEntityId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [voucherNumber, setVoucherNumber] = useState<string>("");
  const [voucherDate, setVoucherDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [narration, setNarration] = useState<string>("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  // ---- Load vouchers ----
  const loadVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVouchers({
        businessEntityId: selectedBusinessEntityId ?? undefined,
        voucherType: "sales",
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setVouchers(data);
    } finally {
      setLoading(false);
    }
  }, [selectedBusinessEntityId, fromDate, toDate, refreshTrigger]);

  useEffect(() => { loadVouchers(); }, [loadVouchers]);

  // ---- Open dialog ----
  const openDialog = async () => {
    setOpen(true);
    setBizEntityId(selectedBusinessEntityId ?? "");
    setCustomerId("");
    setPaymentMethod("cash");
    setNarration("");
    setLines([emptyLine()]);
    setVoucherDate(new Date().toISOString().split("T")[0]);

    const [ents, prods, variants, num] = await Promise.all([
      getEntities(),
      getProducts(),
      getProductVariants(),
      getNextVoucherNumber("SAL"),
    ]);
    setEntities(ents);
    setProducts(prods);
    setAllVariants(variants);
    setVoucherNumber(num);
  };

  // ---- Line helpers ----
  const updateLine = (id: string, patch: Partial<FormLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch };
        return recalcLine(updated, allVariants);
      })
    );
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  // ---- Totals ----
  const subtotal = lines.reduce((s, l) => s + (l.quantity_sqft * l.rate), 0);
  const taxTotal = lines.reduce((s, l) => s + l.tax_amount, 0);
  const grandTotal = subtotal + taxTotal;
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const balanceDue = Math.max(0, grandTotal - paidAmount);
  const paymentStatus: "paid" | "partial" | "unpaid" =
    balanceDue <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  // ---- Save ----
  const handleSave = async () => {
    if (!bizEntityId) return alert("Please select a business entity.");
    if (!customerId) return alert("Please select a customer.");
    if (lines.some((l) => !l.product_id)) return alert("All line items must have a product selected.");

    setSaving(true);
    try {
      const voucherLines: Omit<VoucherLine, "id" | "voucher_id">[] = lines.map((l, i) => ({
        line_no: i + 1,
        product_id: l.product_id || null,
        variant_id: l.variant_id || null,
        description: l.description || null,
        unit: "sqft",
        quantity: l.quantity,
        quantity_sqft: l.quantity_sqft,
        rate: l.rate,
        tax_percent: l.tax_percent,
        tax_amount: l.tax_amount,
        line_total: l.line_total,
        debit_account_id: null,
        credit_account_id: null,
      }));

      await insertVoucher({
        business_entity_id: bizEntityId,
        voucher_type: "sales",
        voucher_number: voucherNumber,
        voucher_date: voucherDate,
        party_entity_id: customerId,
        subtotal,
        tax_amount: taxTotal,
        total_amount: grandTotal,
        paid_amount: paidAmount,
        balance_due: balanceDue,
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        bank_account_id: null,
        reference: null,
        narration: narration || null,
        source_transaction_id: null,
        status: "posted",
        lines: voucherLines,
      });

      setOpen(false);
      triggerRefresh();
    } catch (err: any) {
      alert("Error saving voucher: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this voucher?")) return;
    await cancelVoucher(id);
    triggerRefresh();
  };

  // ---- Summary stats ----
  const totalSales = vouchers.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid = vouchers.reduce((s, v) => s + v.paid_amount, 0);
  const totalOutstanding = vouchers.reduce((s, v) => s + v.balance_due, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Vouchers</h2>
          <p className="text-muted-foreground">Create and manage sales invoices.</p>
        </div>
        <Button onClick={openDialog} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          New Sales Voucher
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <BusinessEntitySelector includeAll />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            {(fromDate || toDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Total Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{fmt(totalSales)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{fmt(totalPaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-500">{fmt(totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Vouchers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vouchers.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <IosLoadingView text="Loading sales vouchers..." />
          ) : vouchers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <FileText className="h-10 w-10 opacity-30" />
              <p className="text-sm">No sales vouchers found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.voucher_number}</TableCell>
                    <TableCell className="text-xs">{v.voucher_date}</TableCell>
                    <TableCell className="text-sm">{v.party_entity_name ?? "—"}</TableCell>
                    <TableCell className="text-right text-xs">{fmt(v.subtotal)}</TableCell>
                    <TableCell className="text-right text-xs">{fmt(v.tax_amount)}</TableCell>
                    <TableCell className="text-right font-semibold text-sm">{fmt(v.total_amount)}</TableCell>
                    <TableCell className="text-right text-xs text-emerald-500">{fmt(v.paid_amount)}</TableCell>
                    <TableCell className="text-right text-xs text-rose-500">{fmt(v.balance_due)}</TableCell>
                    <TableCell>{paymentStatusBadge(v.payment_status)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-500 hover:text-rose-600 h-7 px-2"
                        onClick={() => handleCancel(v.id)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Sales Voucher Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Sales Voucher</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Header Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Business Entity <span className="text-rose-500">*</span></Label>
                <Select value={bizEntityId} onValueChange={setBizEntityId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select business entity" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* populated from BusinessEntitySelector's data via getBusinessEntities */}
                    {/* We use separate state here for the dialog */}
                    {bizEntityId === "" && <SelectItem value="">Select...</SelectItem>}
                  </SelectContent>
                </Select>
                {/* Use an inline selector for business entity inside dialog */}
                <BusinessEntitySelector
                  includeAll={false}
                  onSelect={(id) => setBizEntityId(id ?? "")}
                  className="mt-1"
                />
              </div>

              <div className="space-y-1">
                <Label>Customer <span className="text-rose-500">*</span></Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {entities
                      .filter((e) => e.type?.toLowerCase().includes("customer") || e.type?.toLowerCase().includes("client"))
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    {entities
                      .filter((e) => !e.type?.toLowerCase().includes("customer") && !e.type?.toLowerCase().includes("client"))
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name} ({e.type})</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Invoice Number</Label>
                <Input value={voucherNumber} onChange={(e) => setVoucherNumber(e.target.value)} className="font-mono" />
              </div>

              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Narration</Label>
                <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="Optional note" />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="gap-1">
                  <PlusCircle className="h-4 w-4" /> Add Line
                </Button>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-36">Product</TableHead>
                      <TableHead className="w-36">Variant</TableHead>
                      <TableHead className="w-20">Qty (Sheets)</TableHead>
                      <TableHead className="w-20">Sq.Ft</TableHead>
                      <TableHead className="w-24">Rate/sqft</TableHead>
                      <TableHead className="w-16">Tax %</TableHead>
                      <TableHead className="w-24">Tax Amt</TableHead>
                      <TableHead className="w-24">Line Total</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const lineVariants = allVariants.filter((v) => v.product_id === line.product_id);
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="p-1">
                            <Select
                              value={line.product_id}
                              onValueChange={(val) => updateLine(line.id, { product_id: val, variant_id: "" })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Product" />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-1">
                            <Select
                              value={line.variant_id}
                              onValueChange={(val) => updateLine(line.id, { variant_id: val })}
                              disabled={!line.product_id || lineVariants.length === 0}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Variant" />
                              </SelectTrigger>
                              <SelectContent>
                                {lineVariants.map((v) => (
                                  <SelectItem key={v.id} value={v.id}>
                                    {v.size ?? ""} {v.thickness ? `${v.thickness}mm` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min={0}
                              value={line.quantity}
                              onChange={(e) => updateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs w-20"
                            />
                          </TableCell>
                          <TableCell className="p-1 text-xs text-muted-foreground">
                            {line.quantity_sqft.toFixed(2)}
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={line.rate}
                              onChange={(e) => updateLine(line.id, { rate: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs w-24"
                            />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={line.tax_percent}
                              onChange={(e) => updateLine(line.id, { tax_percent: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs w-16"
                            />
                          </TableCell>
                          <TableCell className="p-1 text-xs text-muted-foreground">
                            {fmt(line.tax_amount)}
                          </TableCell>
                          <TableCell className="p-1 text-xs font-medium">
                            {fmt(line.line_total)}
                          </TableCell>
                          <TableCell className="p-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-rose-500"
                              onClick={() => removeLine(line.id)}
                              disabled={lines.length === 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-md border p-4 space-y-2 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax Total</span>
                <span>{fmt(taxTotal)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base border-t pt-2">
                <span>Grand Total</span>
                <span>{fmt(grandTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-1">
                <span className="text-muted-foreground">Paid Amount</span>
                <Input
                  type="number"
                  min={0}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                  className="h-8 text-sm w-36 text-right"
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance Due</span>
                <span className="text-rose-500 font-semibold">{fmt(balanceDue)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Payment Status</span>
                {paymentStatusBadge(paymentStatus)}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
