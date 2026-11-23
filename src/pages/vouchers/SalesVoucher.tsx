import { useState, useEffect, useCallback, useMemo } from "react";
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
  PlusCircle, Trash2, FileText, XCircle, Truck, MapPin, Building2, Printer, ChevronDown, ChevronUp, Layers, CheckCircle2,
} from "lucide-react";
import type { Voucher, VoucherLine, Product, ProductVariant, BankAccount, BusinessEntity, VoucherTaxSplit } from "@/lib/db/erp";
import {
  getSqftPerSheet, sqftToSqm, SQFT_TO_SQM,
  formatVoucherReference, numberToIndianWords,
  GST_STATES, getStateFromGstin,
} from "@/lib/db/erp";
import {
  getVouchers, insertVoucher, getNextVoucherNumber, cancelVoucher,
  getBankAccounts, getVoucherWithLines, getBusinessEntities,
} from "@/lib/db/accounting";
import { getProducts, getProductVariants } from "@/lib/db/inventory";
import { getEntities } from "@/lib/db/queries";
import type { Entity } from "@/lib/db/queries";

export type RateUnit = "sqft" | "sqm" | "sheets";

// ---- Local line type for the form ----
interface FormLine {
  id: string;
  product_id: string;
  variant_id: string;
  description: string;
  quantity: number;          // Sheet / Pieces count (e.g. 150 NOS)
  rate_unit: RateUnit;       // 'sqft' | 'sqm' | 'sheets'
  quantity_sqft: number;     // Calculated sqft
  quantity_sqm: number;      // Calculated sqm
  rate: number;              // Rate per rate_unit
  tax_percent: number;       // e.g. 18%
  tax_amount: number;
  line_total: number;
}

// Deduplicate products by name, preserving the product with configured variants
function deduplicateProducts(prods: Product[], variants: ProductVariant[]): Product[] {
  const map = new Map<string, Product>();
  for (const p of prods) {
    if (p.is_active === false) continue;
    const key = p.name.trim().toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, p);
    } else {
      const existingVars = variants.filter((v) => v.product_id === existing.id).length;
      const currentVars = variants.filter((v) => v.product_id === p.id).length;
      if (currentVars > existingVars) {
        map.set(key, p);
      }
    }
  }
  return Array.from(map.values());
}

function emptyLine(): FormLine {
  return {
    id: `line_${Date.now()}_${Math.random()}`,
    product_id: "",
    variant_id: "",
    description: "",
    quantity: 1,
    rate_unit: "sqft",
    quantity_sqft: 0,
    quantity_sqm: 0,
    rate: 0,
    tax_percent: 18,
    tax_amount: 0,
    line_total: 0,
  };
}

function recalcLine(line: FormLine, variants: ProductVariant[]): FormLine {
  const variant = variants.find((v) => v.id === line.variant_id);
  const sqft_per_sheet = variant?.sqft_per_sheet ?? getSqftPerSheet(variant?.size ?? "");
  const quantity_sqft = Math.round(line.quantity * (sqft_per_sheet || 0) * 1000) / 1000;
  const quantity_sqm = Math.round(quantity_sqft * SQFT_TO_SQM * 10000) / 10000;

  // Billable quantity depends on rate_unit
  let billableQty = quantity_sqft;
  if (line.rate_unit === "sqm") {
    billableQty = quantity_sqm;
  } else if (line.rate_unit === "sheets") {
    billableQty = line.quantity;
  }

  const baseAmount = Math.round(billableQty * line.rate * 100) / 100;
  const tax_amount = Math.round(((baseAmount * line.tax_percent) / 100) * 100) / 100;
  const line_total = Math.round((baseAmount + tax_amount) * 100) / 100;

  return { ...line, quantity_sqft, quantity_sqm, tax_amount, line_total };
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

  // Form reference data
  const [entities, setEntities] = useState<Entity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bizEntities, setBizEntities] = useState<BusinessEntity[]>([]);

  // Form fields
  const [bizEntityId, setBizEntityId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [voucherNumber, setVoucherNumber] = useState<string>("");
  const [voucherDate, setVoucherDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("");
  const [narration, setNarration] = useState<string>("");
  const [customReference, setCustomReference] = useState<string>("");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  // Tax Split & Place of Supply
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState<string>("32");

  // Round Off Setting
  const [autoRoundOff, setAutoRoundOff] = useState<boolean>(true);

  // Optional Transport Section
  const [showTransport, setShowTransport] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [destination, setDestination] = useState("");
  const [dispatchedThrough, setDispatchedThrough] = useState("Road");
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [lrNumber, setLrNumber] = useState("");
  const [buyerOrderNo, setBuyerOrderNo] = useState("");
  const [buyerOrderDate, setBuyerOrderDate] = useState("");

  // Optional Shipping Address / Consignee Section
  const [showShipping, setShowShipping] = useState(false);
  const [shippingSameAsBuyer, setShippingSameAsBuyer] = useState(true);
  const [consigneeName, setConsigneeName] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingGstin, setShippingGstin] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [shippingStateCode, setShippingStateCode] = useState("");

  // Print / View Invoice Modal
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printVoucher, setPrintVoucher] = useState<Voucher | null>(null);
  const [loadingPrint, setLoadingPrint] = useState(false);

  // Print Entire Sales Register Modal
  const [registerPrintOpen, setRegisterPrintOpen] = useState(false);

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
    const targetBizId = selectedBusinessEntityId ?? "";
    setBizEntityId(targetBizId);
    setCustomerId("");
    setPaymentMethod("cash");
    setSelectedBankAccountId("");
    setNarration("");
    setCustomReference("");
    setPaidAmount(0);
    setAutoRoundOff(true);

    // Reset transport
    setShowTransport(false);
    setVehicleNumber("");
    setDestination("");
    setDispatchedThrough("Road");
    setEwayBillNo("");
    setLrNumber("");
    setBuyerOrderNo("");
    setBuyerOrderDate("");

    // Reset shipping
    setShowShipping(false);
    setShippingSameAsBuyer(true);
    setConsigneeName("");
    setShippingAddress("");
    setShippingGstin("");
    setShippingState("");
    setShippingStateCode("");

    setLines([emptyLine()]);
    setVoucherDate(new Date().toISOString().split("T")[0]);

    // Inspect last saved invoice to generate next sequence safely without mutating DB
    const [ents, prods, variants, banks, bEntities, num] = await Promise.all([
      getEntities(),
      getProducts(),
      getProductVariants(),
      getBankAccounts(targetBizId || undefined),
      getBusinessEntities(),
      getNextVoucherNumber("SAL", targetBizId || undefined),
    ]);

    // Strictly deduplicate products by name, preserving the active product with configured variants
    const cleanedProds = deduplicateProducts(prods, variants);

    setEntities(ents);
    setProducts(cleanedProds);
    setAllVariants(variants);
    setBankAccounts(banks);
    setBizEntities(bEntities);

    // Derive seller state
    const currentBiz = bEntities.find((b) => b.id === targetBizId);
    const sellerSt = getStateFromGstin(currentBiz?.gstin) || { code: "32", name: "Kerala" };
    setPlaceOfSupplyCode(sellerSt.code);

    if (banks.length > 0) {
      setSelectedBankAccountId(banks[0].id);
    }
    setVoucherNumber(num);
  };

  const handleBizEntityChange = async (newId: string) => {
    setBizEntityId(newId);
    const [banks, nextNum] = await Promise.all([
      getBankAccounts(newId || undefined),
      getNextVoucherNumber("SAL", newId || undefined),
    ]);
    setBankAccounts(banks);
    if (banks.length > 0) {
      setSelectedBankAccountId(banks[0].id);
    } else {
      setSelectedBankAccountId("");
    }
    setVoucherNumber(nextNum);

    const currentBiz = bizEntities.find((b) => b.id === newId);
    const sellerSt = getStateFromGstin(currentBiz?.gstin);
    if (sellerSt) {
      // If customer has not overridden supply place, default to seller state
      if (!customerId) setPlaceOfSupplyCode(sellerSt.code);
    }
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
  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  // Current Entities
  const selectedBiz = bizEntities.find((b) => b.id === bizEntityId);
  const sellerState = useMemo(() => {
    return getStateFromGstin(selectedBiz?.gstin) || { code: "32", name: "Kerala" };
  }, [selectedBiz]);

  const selectedCustomer = entities.find((e) => e.id === customerId);

  // Handle Customer Selection -> Auto-detect Place of Supply from customer GSTIN/State
  const handleCustomerChange = (newCustId: string) => {
    setCustomerId(newCustId);
    const cust = entities.find((e) => e.id === newCustId);
    if (cust?.gstin) {
      const custState = getStateFromGstin(cust.gstin);
      if (custState) {
        setPlaceOfSupplyCode(custState.code);
        return;
      }
    }
    // If no GSTIN, default to seller state (Intra-state)
    setPlaceOfSupplyCode(sellerState.code);
  };

  // Active Place of Supply
  const placeOfSupply = useMemo(() => {
    if (!shippingSameAsBuyer) {
      if (shippingStateCode) {
        const found = GST_STATES.find((s) => s.code === shippingStateCode);
        return found || { code: shippingStateCode, name: shippingState || `State (${shippingStateCode})` };
      }
      if (shippingGstin) {
        const found = getStateFromGstin(shippingGstin);
        if (found) return found;
      }
    }
    const found = GST_STATES.find((s) => s.code === placeOfSupplyCode);
    return found || sellerState;
  }, [shippingSameAsBuyer, shippingStateCode, shippingGstin, shippingState, placeOfSupplyCode, sellerState]);

  // ---- Automated Tax Split & Round Off Calculation ----
  const subtotal = lines.reduce((s, l) => {
    let billableQty = l.quantity_sqft;
    if (l.rate_unit === "sqm") billableQty = l.quantity_sqm;
    else if (l.rate_unit === "sheets") billableQty = l.quantity;
    return s + (billableQty * l.rate);
  }, 0);

  const taxTotal = lines.reduce((s, l) => s + l.tax_amount, 0);

  // Intra-State (CGST + SGST) vs Inter-State (IGST)
  const isInterState = sellerState.code !== placeOfSupply.code;
  const avgTaxRate = subtotal > 0 ? Math.round((taxTotal / subtotal) * 100) : 18;

  const taxSplit: VoucherTaxSplit = useMemo(() => {
    if (isInterState) {
      return {
        isInterState: true,
        taxPercent: avgTaxRate,
        cgstPercent: 0,
        cgstAmount: 0,
        sgstPercent: 0,
        sgstAmount: 0,
        igstPercent: avgTaxRate,
        igstAmount: Math.round(taxTotal * 100) / 100,
        sellerStateCode: sellerState.code,
        sellerStateName: sellerState.name,
        placeOfSupplyCode: placeOfSupply.code,
        placeOfSupplyName: placeOfSupply.name,
      };
    } else {
      const halfRate = Math.round((avgTaxRate / 2) * 10) / 10;
      const cgstAmt = Math.round((taxTotal / 2) * 100) / 100;
      const sgstAmt = Math.round((taxTotal - cgstAmt) * 100) / 100;
      return {
        isInterState: false,
        taxPercent: avgTaxRate,
        cgstPercent: halfRate,
        cgstAmount: cgstAmt,
        sgstPercent: halfRate,
        sgstAmount: sgstAmt,
        igstPercent: 0,
        igstAmount: 0,
        sellerStateCode: sellerState.code,
        sellerStateName: sellerState.name,
        placeOfSupplyCode: placeOfSupply.code,
        placeOfSupplyName: placeOfSupply.name,
      };
    }
  }, [isInterState, avgTaxRate, taxTotal, sellerState, placeOfSupply]);

  // Automated Round Off to nearest Rupee
  const exactGrandTotal = Math.round((subtotal + taxTotal) * 100) / 100;
  const grandTotal = autoRoundOff ? Math.round(exactGrandTotal) : exactGrandTotal;
  const roundOff = Math.round((grandTotal - exactGrandTotal) * 100) / 100;

  const balanceDue = Math.max(0, Math.round((grandTotal - paidAmount) * 100) / 100);
  const paymentStatus: "paid" | "partial" | "unpaid" =
    balanceDue <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";

  // ---- Save ----
  const handleSave = async (andPrint: boolean = false) => {
    if (!bizEntityId) return alert("Please select a business entity.");
    if (!customerId) return alert("Please select a customer.");
    if (lines.length === 0) return alert("Please add at least one line item.");
    if (lines.some((l) => !l.product_id)) return alert("All line items must have a product selected.");
    if (lines.some((l) => l.quantity <= 0)) return alert("Line item quantity must be greater than zero.");

    setSaving(true);
    try {
      const voucherLines: Omit<VoucherLine, "id" | "voucher_id">[] = lines.map((l, i) => {
        const prod = products.find((p) => p.id === l.product_id);
        const variant = allVariants.find((v) => v.id === l.variant_id);
        const desc = l.description.trim() ||
          (prod ? `${prod.name}${variant ? ` - ${variant.size || ""} ${variant.thickness ? variant.thickness + "mm" : ""}` : ""}` : null);

        return {
          line_no: i + 1,
          product_id: l.product_id || null,
          variant_id: l.variant_id || null,
          description: desc,
          unit: l.rate_unit,
          quantity: l.quantity,
          quantity_sqft: l.quantity_sqft,
          rate: l.rate,
          tax_percent: l.tax_percent,
          tax_amount: l.tax_amount,
          line_total: l.line_total,
          debit_account_id: null,
          credit_account_id: null,
        };
      });

      const refString = formatVoucherReference({
        transport: {
          vehicleNumber: vehicleNumber.trim() || undefined,
          destination: destination.trim() || undefined,
          dispatchedThrough: dispatchedThrough.trim() || undefined,
          ewayBillNo: ewayBillNo.trim() || undefined,
          lrNumber: lrNumber.trim() || undefined,
          buyerOrderNo: buyerOrderNo.trim() || undefined,
          buyerOrderDate: buyerOrderDate || undefined,
        },
        shipping: shippingSameAsBuyer
          ? { sameAsBuyer: true }
          : {
              sameAsBuyer: false,
              consigneeName: consigneeName.trim() || undefined,
              address: shippingAddress.trim() || undefined,
              gstin: shippingGstin.trim() || undefined,
              state: shippingState.trim() || undefined,
              stateCode: shippingStateCode.trim() || undefined,
            },
        customRef: customReference.trim() || undefined,
        roundOff: autoRoundOff ? roundOff : undefined,
        taxSplit,
      });

      const savedId = await insertVoucher({
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
        bank_account_id: selectedBankAccountId && selectedBankAccountId !== "none" ? selectedBankAccountId : null,
        reference: refString,
        narration: narration || null,
        source_transaction_id: null,
        status: "posted",
        lines: voucherLines,
      });

      setOpen(false);
      triggerRefresh();
      if (andPrint && savedId) {
        handleOpenPrint(savedId);
      }
    } catch (err: any) {
      alert("Error saving voucher: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this voucher?")) return;
    try {
      setVouchers((prev) =>
        prev.map((v) => (v.id === id ? { ...v, status: "cancelled" } : v))
      );
      await cancelVoucher(id);
      triggerRefresh();
      await loadVouchers();
    } catch (err: any) {
      alert("Error cancelling voucher: " + (err?.message || String(err)));
      await loadVouchers();
    }
  };

  const handleOpenPrint = async (voucherId: string) => {
    setLoadingPrint(true);
    setPrintModalOpen(true);
    try {
      const v = await getVoucherWithLines(voucherId);
      setPrintVoucher(v);
    } catch (err) {
      console.error("Failed to load voucher for print:", err);
      alert("Failed to load invoice details for print.");
      setPrintModalOpen(false);
    } finally {
      setLoadingPrint(false);
    }
  };

  // ---- Summary stats ----
  const totalSales = vouchers.reduce((s, v) => s + v.total_amount, 0);
  const totalPaid = vouchers.reduce((s, v) => s + v.paid_amount, 0);
  const totalOutstanding = vouchers.reduce((s, v) => s + v.balance_due, 0);

  // Print voucher tax split resolution
  const printTaxSplit: VoucherTaxSplit = useMemo(() => {
    if (printVoucher?.tax_split) return printVoucher.tax_split;
    // Fallback: deduce from entity vs consignee
    const isInter = Boolean(
      printVoucher?.shipping?.stateCode &&
      printVoucher.shipping.stateCode !== "32"
    );
    const rate = printVoucher && printVoucher.subtotal > 0
      ? Math.round((printVoucher.tax_amount / printVoucher.subtotal) * 100)
      : 18;
    const taxAmt = printVoucher?.tax_amount || 0;
    if (isInter) {
      return {
        isInterState: true,
        taxPercent: rate,
        cgstPercent: 0,
        cgstAmount: 0,
        sgstPercent: 0,
        sgstAmount: 0,
        igstPercent: rate,
        igstAmount: taxAmt,
        sellerStateCode: "32",
        sellerStateName: "Kerala",
        placeOfSupplyCode: printVoucher?.shipping?.stateCode || "23",
        placeOfSupplyName: printVoucher?.shipping?.state || "Madhya Pradesh",
      };
    } else {
      const halfRate = Math.round((rate / 2) * 10) / 10;
      const cgst = Math.round((taxAmt / 2) * 100) / 100;
      return {
        isInterState: false,
        taxPercent: rate,
        cgstPercent: halfRate,
        cgstAmount: cgst,
        sgstPercent: halfRate,
        sgstAmount: Math.round((taxAmt - cgst) * 100) / 100,
        igstPercent: 0,
        igstAmount: 0,
        sellerStateCode: "32",
        sellerStateName: "Kerala",
        placeOfSupplyCode: "32",
        placeOfSupplyName: "Kerala",
      };
    }
  }, [printVoucher]);

  const printRoundOff = useMemo(() => {
    if (printVoucher?.round_off !== undefined) return printVoucher.round_off;
    if (!printVoucher) return 0;
    const exactSum = printVoucher.subtotal + printVoucher.tax_amount;
    return Math.round((printVoucher.total_amount - exactSum) * 100) / 100;
  }, [printVoucher]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Vouchers</h2>
          <p className="text-muted-foreground">Create and manage GST sales invoices with automated tax splitting.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setRegisterPrintOpen(true)}
            className="gap-2"
            disabled={vouchers.length === 0}
          >
            <Printer className="h-4 w-4" />
            Print Sales Register
          </Button>
          <Button onClick={openDialog} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            New Sales Voucher
          </Button>
        </div>
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
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer (Buyer)</TableHead>
                  <TableHead>Vehicle / Transport</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Tax & Split</TableHead>
                  <TableHead className="text-right">Total (Rounded)</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.map((v) => {
                  const hasRound = v.round_off !== undefined && v.round_off !== 0;
                  const isInter = v.tax_split?.isInterState;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs font-semibold">{v.voucher_number}</TableCell>
                      <TableCell className="text-xs">{v.voucher_date?.split("T")[0]}</TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{v.party_entity_name ?? "—"}</div>
                        {v.shipping && !v.shipping.sameAsBuyer && v.shipping.consigneeName && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5 text-amber-500" />
                            Ship: {v.shipping.consigneeName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {v.transport?.vehicleNumber ? (
                          <div className="flex items-center gap-1 font-mono">
                            <Truck className="h-3 w-3 text-primary" />
                            <span>{v.transport.vehicleNumber}</span>
                            {v.transport.destination && <span className="text-[10px] text-muted-foreground">({v.transport.destination})</span>}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">{fmt(v.subtotal)}</TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        <div>{fmt(v.tax_amount)}</div>
                        <div className="text-[10px] text-muted-foreground font-sans">
                          {isInter !== undefined ? (isInter ? "IGST (Inter)" : "CGST+SGST") : "GST 18%"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm font-mono">
                        <div>{fmt(v.total_amount)}</div>
                        {hasRound && (
                          <div className="text-[10px] text-muted-foreground font-normal">
                            Rnd: {v.round_off! > 0 ? `+₹${v.round_off!.toFixed(2)}` : `-₹${Math.abs(v.round_off!).toFixed(2)}`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-emerald-500 font-mono">{fmt(v.paid_amount)}</TableCell>
                      <TableCell className="text-right text-xs text-rose-500 font-mono">{fmt(v.balance_due)}</TableCell>
                      <TableCell>{paymentStatusBadge(v.payment_status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-primary hover:text-primary/80"
                            title="Print / View Tax Invoice"
                            onClick={() => handleOpenPrint(v.id)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose-500 hover:text-rose-600 h-7 px-2"
                            title="Cancel Voucher"
                            onClick={() => handleCancel(v.id)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Sales Voucher Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Sales Voucher</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Header Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Business Entity <span className="text-rose-500">*</span></Label>
                <BusinessEntitySelector
                  includeAll={false}
                  onSelect={(id) => handleBizEntityChange(id ?? "")}
                  className="mt-1"
                />
              </div>

              <div className="space-y-1">
                <Label>Customer (Buyer) <span className="text-rose-500">*</span></Label>
                <Select value={customerId} onValueChange={handleCustomerChange}>
                  <SelectTrigger className="mt-1">
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
                <Input
                  value={voucherNumber}
                  onChange={(e) => setVoucherNumber(e.target.value)}
                  className="mt-1 font-mono font-semibold"
                  placeholder="e.g. SAL-2026-0001 or D74"
                />
              </div>

              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} className="mt-1" />
              </div>

              <div className="space-y-1">
                <Label>Place of Supply (State)</Label>
                <Select value={placeOfSupplyCode} onValueChange={setPlaceOfSupplyCode}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {GST_STATES.map((st) => (
                      <SelectItem key={st.code} value={st.code}>
                        {st.code} - {st.name} {st.code === sellerState.code ? "(Home State)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="credit">Credit / Partial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-3">
                <Label className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Company Bank Account <span className="text-xs text-muted-foreground font-normal">(Optional - prints on invoice)</span>
                </Label>
                <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select bank for invoice print" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None / Cash Only</SelectItem>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bank_name} - {b.account_no} {b.ifsc ? `(${b.ifsc})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Optional Transport Section */}
            <div className="rounded-lg border bg-card/60 overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setShowTransport((prev) => !prev)}
                className="w-full flex items-center justify-between p-2.5 px-3 text-xs font-semibold hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-primary" />
                  <span>Transport & Dispatch Details</span>
                  <Badge variant="outline" className="text-[10px] font-normal py-0 h-4">Optional</Badge>
                  {(vehicleNumber || ewayBillNo || destination) && (
                    <span className="text-xs text-emerald-600 font-normal">
                      • {vehicleNumber || "Vehicle"} {destination ? `→ ${destination}` : ""}
                    </span>
                  )}
                </div>
                {showTransport ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {showTransport && (
                <div className="p-3 pt-1 border-t space-y-3 bg-muted/15">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">e-Way Bill No.</Label>
                      <Input
                        value={ewayBillNo}
                        onChange={(e) => setEwayBillNo(e.target.value)}
                        placeholder="e.g. 572109427355"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Motor Vehicle No.</Label>
                      <Input
                        value={vehicleNumber}
                        onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. TN37EB9150"
                        className="h-8 text-xs font-mono uppercase"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Destination</Label>
                      <Input
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="e.g. Bhopal"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Dispatched Through</Label>
                      <Input
                        value={dispatchedThrough}
                        onChange={(e) => setDispatchedThrough(e.target.value)}
                        placeholder="e.g. Road"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bill of Lading / LR-RR No.</Label>
                      <Input
                        value={lrNumber}
                        onChange={(e) => setLrNumber(e.target.value)}
                        placeholder="e.g. LR-98124"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Buyer Order / PO No.</Label>
                      <Input
                        value={buyerOrderNo}
                        onChange={(e) => setBuyerOrderNo(e.target.value)}
                        placeholder="e.g. PO-8902"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Buyer Order Date</Label>
                      <Input
                        type="date"
                        value={buyerOrderDate}
                        onChange={(e) => setBuyerOrderDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Shipping Address / Consignee Section */}
            <div className="rounded-lg border bg-card/60 overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setShowShipping((prev) => !prev)}
                className="w-full flex items-center justify-between p-2.5 px-3 text-xs font-semibold hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span>Shipping Address / Consignee</span>
                  <Badge variant="outline" className="text-[10px] font-normal py-0 h-4">Optional</Badge>
                  {!shippingSameAsBuyer && consigneeName && (
                    <span className="text-xs text-amber-600 font-normal">
                      • Ship to: {consigneeName}
                    </span>
                  )}
                </div>
                {showShipping ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {showShipping && (
                <div className="p-3 pt-2 border-t space-y-3 bg-muted/15">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="shippingSameAsBuyer"
                      checked={shippingSameAsBuyer}
                      onChange={(e) => setShippingSameAsBuyer(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    />
                    <label htmlFor="shippingSameAsBuyer" className="text-xs font-medium cursor-pointer">
                      Shipping address is the same as Buyer (Bill To)
                    </label>
                  </div>

                  {shippingSameAsBuyer ? (
                    <div className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded border">
                      {selectedCustomer ? (
                        <div>
                          <div className="font-semibold text-foreground">Consignee (Ship To): {selectedCustomer.name}</div>
                          {selectedCustomer.address && <div>{selectedCustomer.address}</div>}
                          {selectedCustomer.gstin && <div>GSTIN/UIN: <span className="font-mono">{selectedCustomer.gstin}</span></div>}
                        </div>
                      ) : (
                        <span>Select a customer above to preview shipping details.</span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Consignee Name</Label>
                          <Input
                            value={consigneeName}
                            onChange={(e) => setConsigneeName(e.target.value)}
                            placeholder="Consignee / receiving firm name"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Consignee GSTIN / UIN</Label>
                          <Input
                            value={shippingGstin}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setShippingGstin(val);
                              if (val.length >= 2) {
                                const stCode = val.slice(0, 2);
                                setShippingStateCode(stCode);
                                setPlaceOfSupplyCode(stCode);
                              }
                            }}
                            placeholder="e.g. 23AENPG0415N1ZM"
                            className="h-8 text-xs font-mono uppercase"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Shipping Address</Label>
                        <Input
                          value={shippingAddress}
                          onChange={(e) => setShippingAddress(e.target.value)}
                          placeholder="Complete physical delivery address"
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">State Name</Label>
                          <Input
                            value={shippingState}
                            onChange={(e) => setShippingState(e.target.value)}
                            placeholder="e.g. Madhya Pradesh"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">State Code</Label>
                          <Input
                            value={shippingStateCode}
                            onChange={(e) => {
                              const code = e.target.value;
                              setShippingStateCode(code);
                              if (code.length === 2) setPlaceOfSupplyCode(code);
                            }}
                            placeholder="e.g. 23"
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">Line Items</Label>
                </div>
                <Button variant="outline" size="sm" onClick={addLine} className="h-7 text-xs gap-1">
                  <PlusCircle className="h-3.5 w-3.5" /> Add Line
                </Button>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-36">Product</TableHead>
                      <TableHead className="w-36">Variant (Size & Thk)</TableHead>
                      <TableHead className="w-20">Qty (Sheets)</TableHead>
                      <TableHead className="w-28">Area (Sq.Ft / Sq.M)</TableHead>
                      <TableHead className="w-28">Rate Unit</TableHead>
                      <TableHead className="w-24">Rate (₹)</TableHead>
                      <TableHead className="w-16">Tax %</TableHead>
                      <TableHead className="w-24 text-right">Tax Amt</TableHead>
                      <TableHead className="w-24 text-right">Line Total</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const lineVariants = allVariants.filter((v) => v.product_id === line.product_id);
                      return (
                        <TableRow key={line.id}>
                          {/* Product */}
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
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name}{p.brand ? ` (${p.brand})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          {/* Variant */}
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

                          {/* Qty Sheets */}
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={(e) => updateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs w-20"
                            />
                          </TableCell>

                          {/* Area (sqft & sqm) */}
                          <TableCell className="p-1 text-[11px] text-muted-foreground whitespace-nowrap">
                            <div className="font-medium text-foreground">{line.quantity_sqft.toFixed(2)} sqft</div>
                            <div className="text-[10px] text-muted-foreground">{line.quantity_sqm.toFixed(4)} sqm</div>
                          </TableCell>

                          {/* Rate Unit */}
                          <TableCell className="p-1">
                            <Select
                              value={line.rate_unit}
                              onValueChange={(val: RateUnit) => updateLine(line.id, { rate_unit: val })}
                            >
                              <SelectTrigger className="h-8 text-xs w-28 font-medium">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sqft">per Sq.Ft</SelectItem>
                                <SelectItem value="sqm">per Sq.M</SelectItem>
                                <SelectItem value="sheets">per Sheet</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>

                          {/* Rate */}
                          <TableCell className="p-1">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={line.rate}
                              onChange={(e) => updateLine(line.id, { rate: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs w-24 font-mono"
                            />
                          </TableCell>

                          {/* Tax % */}
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

                          {/* Tax Amount */}
                          <TableCell className="p-1 text-xs text-right text-muted-foreground font-mono">
                            {fmt(line.tax_amount)}
                          </TableCell>

                          {/* Line Total */}
                          <TableCell className="p-1 text-xs text-right font-semibold font-mono">
                            {fmt(line.line_total)}
                          </TableCell>

                          {/* Delete */}
                          <TableCell className="p-1 text-center">
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

            {/* Narration, References & Settlement Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Narration / Notes</Label>
                  <Input
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    placeholder="Optional remarks or notes"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Custom Reference</Label>
                  <Input
                    value={customReference}
                    onChange={(e) => setCustomReference(e.target.value)}
                    placeholder="e.g. Terms of delivery, project ref"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Tax Breakdown Preview Box */}
                <div className="rounded-md border p-3 bg-muted/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      Automated GST Tax Split
                    </span>
                    {isInterState ? (
                      <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/20 text-[10px]">Inter-State (IGST)</Badge>
                    ) : (
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20 text-[10px]">Intra-State (CGST+SGST)</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    From: {sellerState.name} ({sellerState.code}) → To: {placeOfSupply.name} ({placeOfSupply.code})
                  </div>
                  <div className="space-y-1 pt-1 border-t border-border/60">
                    {isInterState ? (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Integrated Tax (IGST {taxSplit.igstPercent}%):</span>
                        <span className="font-mono font-medium">{fmt(taxSplit.igstAmount)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Central Tax (CGST {taxSplit.cgstPercent}%):</span>
                          <span className="font-mono font-medium">{fmt(taxSplit.cgstAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">State Tax (SGST {taxSplit.sgstPercent}%):</span>
                          <span className="font-mono font-medium">{fmt(taxSplit.sgstAmount)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Settlement Summary */}
              <div className="rounded-md border p-4 space-y-2 bg-muted/20">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Taxable Subtotal</span>
                  <span className="font-mono">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total GST Tax</span>
                  <span className="font-mono">{fmt(taxTotal)}</span>
                </div>

                {/* Automated Round Off */}
                <div className="flex justify-between text-sm items-center py-0.5 border-t border-border/40">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Round Off</span>
                    <label className="text-[10px] text-muted-foreground flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoRoundOff}
                        onChange={(e) => setAutoRoundOff(e.target.checked)}
                        className="h-3 w-3 rounded text-primary focus:ring-primary"
                      />
                      auto
                    </label>
                  </div>
                  <span className={`font-mono text-xs font-semibold ${roundOff >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {roundOff >= 0 ? `+${fmt(roundOff)}` : `-${fmt(Math.abs(roundOff))}`}
                  </span>
                </div>

                <div className="flex justify-between font-semibold text-base border-t pt-2">
                  <span>Grand Total</span>
                  <span className="font-mono text-emerald-600 text-lg">{fmt(grandTotal)}</span>
                </div>

                <div className="text-[11px] text-muted-foreground italic line-clamp-1 pb-1">
                  {numberToIndianWords(grandTotal)}
                </div>

                <div className="flex justify-between items-center text-sm pt-1 border-t border-border/40">
                  <span className="text-muted-foreground">Paid Amount</span>
                  <Input
                    type="number"
                    min={0}
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm w-36 text-right font-mono"
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Balance Due</span>
                  <span className="text-rose-500 font-semibold font-mono">{fmt(balanceDue)}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Payment Status</span>
                  {paymentStatusBadge(paymentStatus)}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 flex flex-wrap gap-2 sm:gap-0 justify-between items-center">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => handleSave(true)}
                disabled={saving}
                className="gap-1.5"
              >
                <Printer className="h-4 w-4" />
                {saving ? "Saving..." : "Save & Print Invoice"}
              </Button>
              <Button onClick={() => handleSave(false)} disabled={saving}>
                {saving ? "Saving..." : "Save Voucher"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tax Invoice Print / View Modal */}
      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-4 sm:p-6 print:p-0 print:border-none">
          <DialogHeader className="print:hidden">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-primary" />
                GST Tax Invoice Preview
              </DialogTitle>
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Print / Save PDF
              </Button>
            </div>
          </DialogHeader>

          {loadingPrint || !printVoucher ? (
            <div className="py-12">
              <IosLoadingView text="Loading invoice..." />
            </div>
          ) : (
            <div id="printable-tax-invoice" className="bg-white text-black p-6 rounded border font-sans text-xs space-y-4 shadow-sm print:border-none print:shadow-none print:p-2">
              {/* Top Title */}
              <div className="text-center border-b pb-2">
                <h1 className="text-base font-bold tracking-wider uppercase">Tax Invoice</h1>
              </div>

              {/* Seller, Buyer & Invoice Header Info */}
              <div className="grid grid-cols-2 border border-black/80">
                {/* Left Side: Seller, Consignee, Buyer */}
                <div className="border-r border-black/80 divide-y divide-black/80">
                  {/* Seller Header */}
                  <div className="p-2 space-y-0.5">
                    <div className="font-bold text-sm tracking-wide">{printVoucher.business_entity_name || "DELUXE PLY & BOARDS"}</div>
                    <div className="text-[11px] text-gray-700">{printVoucher.business_entity_address || "Peruvangal Padi, Asamannoor, Metala, Ernakulam, Kerala"}</div>
                    <div className="text-[11px] font-mono">GSTIN/UIN: {printVoucher.business_entity_gstin || "32AAYFD0732E1ZN"}</div>
                    <div className="text-[11px]">State Name: {printTaxSplit.sellerStateName || "Kerala"}, Code: {printTaxSplit.sellerStateCode || "32"}</div>
                  </div>

                  {/* Consignee (Ship to) */}
                  <div className="p-2 space-y-0.5 bg-gray-50/50">
                    <div className="font-semibold text-[11px] text-gray-600 uppercase">Consignee (Ship to)</div>
                    <div className="font-bold">
                      {printVoucher.shipping && !printVoucher.shipping.sameAsBuyer && printVoucher.shipping.consigneeName
                        ? printVoucher.shipping.consigneeName
                        : printVoucher.party_entity_name || "—"}
                    </div>
                    <div className="text-[11px]">
                      {printVoucher.shipping && !printVoucher.shipping.sameAsBuyer && printVoucher.shipping.address
                        ? printVoucher.shipping.address
                        : printVoucher.party_entity_address || "Buyer Destination Address"}
                    </div>
                    {printVoucher.shipping?.gstin && (
                      <div className="text-[11px] font-mono">GSTIN/UIN: {printVoucher.shipping.gstin}</div>
                    )}
                    {printVoucher.shipping?.state && (
                      <div className="text-[11px]">
                        State Name: {printVoucher.shipping.state} {printVoucher.shipping.stateCode ? `, Code : ${printVoucher.shipping.stateCode}` : ""}
                      </div>
                    )}
                  </div>

                  {/* Buyer (Bill to) */}
                  <div className="p-2 space-y-0.5">
                    <div className="font-semibold text-[11px] text-gray-600 uppercase">Buyer (Bill to)</div>
                    <div className="font-bold">{printVoucher.party_entity_name || "—"}</div>
                    <div className="text-[11px]">{printVoucher.party_entity_address || "Customer Billing Address as registered"}</div>
                    {printVoucher.party_entity_gstin && (
                      <div className="text-[11px] font-mono">GSTIN/UIN: {printVoucher.party_entity_gstin}</div>
                    )}
                    <div className="text-[11px]">State Name: {printTaxSplit.placeOfSupplyName}, Code: {printTaxSplit.placeOfSupplyCode}</div>
                  </div>
                </div>

                {/* Right Side: Dispatch, Transport & Reference Info */}
                <div className="divide-y divide-black/80">
                  <div className="grid grid-cols-2 divide-x divide-black/80">
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">Invoice No.</div>
                      <div className="font-bold font-mono text-sm">{printVoucher.voucher_number}</div>
                    </div>
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">Dated</div>
                      <div className="font-bold">{printVoucher.voucher_date?.split("T")[0]}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-black/80">
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">e-Way Bill No.</div>
                      <div className="font-mono font-semibold">{printVoucher.transport?.ewayBillNo || "—"}</div>
                    </div>
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">Mode/Terms of Payment</div>
                      <div className="font-medium capitalize">{printVoucher.payment_method || "Cash"}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-black/80">
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">Buyer Order No.</div>
                      <div className="font-mono">{printVoucher.transport?.buyerOrderNo || "—"}</div>
                    </div>
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">Order Dated</div>
                      <div>{printVoucher.transport?.buyerOrderDate || "—"}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-black/80">
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">Dispatched through</div>
                      <div className="font-semibold uppercase">{printVoucher.transport?.dispatchedThrough || "ROAD"}</div>
                    </div>
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">Destination</div>
                      <div className="font-semibold uppercase">{printVoucher.transport?.destination || "—"}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-black/80">
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">Bill of Lading / LR-RR No.</div>
                      <div className="font-mono">{printVoucher.transport?.lrNumber || "—"}</div>
                    </div>
                    <div className="p-2 space-y-0.5">
                      <div className="text-[10px] text-gray-500">Motor Vehicle No.</div>
                      <div className="font-mono font-bold uppercase">{printVoucher.transport?.vehicleNumber || "—"}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-black/80">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-black/80 bg-gray-50">
                      <th className="p-1.5 border-r border-black/80 w-8 text-center">SI</th>
                      <th className="p-1.5 border-r border-black/80 text-left">Description of Goods</th>
                      <th className="p-1.5 border-r border-black/80 w-16 text-center">HSN/SAC</th>
                      <th className="p-1.5 border-r border-black/80 w-20 text-right">Alt. Qty</th>
                      <th className="p-1.5 border-r border-black/80 w-24 text-right">Quantity</th>
                      <th className="p-1.5 border-r border-black/80 w-20 text-right">Rate</th>
                      <th className="p-1.5 border-r border-black/80 w-16 text-center">per</th>
                      <th className="p-1.5 text-right w-24">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(printVoucher.lines || []).map((line, idx) => {
                      const unitLabel = line.unit === "sqm" ? "SQM" : line.unit === "sqft" ? "SQFT" : "NOS";
                      const sqmQty = line.quantity_sqft ? sqftToSqm(line.quantity_sqft) : 0;
                      return (
                        <tr key={line.id}>
                          <td className="p-1.5 border-r border-black/80 text-center font-mono">{idx + 1}</td>
                          <td className="p-1.5 border-r border-black/80">
                            <div className="font-semibold uppercase">{line.description || line.product_name}</div>
                            <div className="text-[10px] text-gray-500">
                              {line.variant_size ? `${line.variant_size}` : ""} {line.variant_thickness ? `${line.variant_thickness}mm` : ""}
                            </div>
                          </td>
                          <td className="p-1.5 border-r border-black/80 text-center font-mono">441231</td>
                          <td className="p-1.5 border-r border-black/80 text-right font-mono">{line.quantity} NOS</td>
                          <td className="p-1.5 border-r border-black/80 text-right font-mono">
                            {line.unit === "sqm" ? `${sqmQty.toFixed(4)} SQM` : line.quantity_sqft ? `${line.quantity_sqft.toFixed(2)} SQFT` : `${line.quantity} NOS`}
                          </td>
                          <td className="p-1.5 border-r border-black/80 text-right font-mono">{line.rate.toFixed(2)}</td>
                          <td className="p-1.5 border-r border-black/80 text-center font-semibold">{unitLabel}</td>
                          <td className="p-1.5 text-right font-mono font-semibold">{(line.line_total - line.tax_amount).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {/* Subtotal */}
                    <tr className="border-t border-black/80 font-bold bg-gray-50">
                      <td colSpan={3} className="p-1.5 text-right border-r border-black/80 uppercase">Subtotal</td>
                      <td className="p-1.5 text-right border-r border-black/80 font-mono">
                        {(printVoucher.lines || []).reduce((s, l) => s + l.quantity, 0)} NOS
                      </td>
                      <td colSpan={3} className="p-1.5 border-r border-black/80"></td>
                      <td className="p-1.5 text-right font-mono">{printVoucher.subtotal.toFixed(2)}</td>
                    </tr>

                    {/* Tax Split breakdown (matches D74-1.pdf) */}
                    {printTaxSplit.isInterState ? (
                      <tr className="border-t border-gray-200">
                        <td colSpan={7} className="p-1.5 text-right border-r border-black/80 font-medium">
                          IGST ({printTaxSplit.igstPercent}%)
                        </td>
                        <td className="p-1.5 text-right font-mono font-medium">{printTaxSplit.igstAmount.toFixed(2)}</td>
                      </tr>
                    ) : (
                      <>
                        <tr className="border-t border-gray-200">
                          <td colSpan={7} className="p-1.5 text-right border-r border-black/80 font-medium">
                            CGST ({printTaxSplit.cgstPercent}%)
                          </td>
                          <td className="p-1.5 text-right font-mono font-medium">{printTaxSplit.cgstAmount.toFixed(2)}</td>
                        </tr>
                        <tr className="border-t border-gray-200">
                          <td colSpan={7} className="p-1.5 text-right border-r border-black/80 font-medium">
                            SGST ({printTaxSplit.sgstPercent}%)
                          </td>
                          <td className="p-1.5 text-right font-mono font-medium">{printTaxSplit.sgstAmount.toFixed(2)}</td>
                        </tr>
                      </>
                    )}

                    {/* Round Off (matches D74-1.pdf: ROUND OFF 0.35) */}
                    {printRoundOff !== 0 && (
                      <tr className="border-t border-gray-200">
                        <td colSpan={7} className="p-1.5 text-right border-r border-black/80 font-medium">
                          ROUND OFF
                        </td>
                        <td className="p-1.5 text-right font-mono font-medium">
                          {printRoundOff > 0 ? `+${printRoundOff.toFixed(2)}` : printRoundOff.toFixed(2)}
                        </td>
                      </tr>
                    )}

                    {/* Total Grand */}
                    <tr className="border-t border-black/80 font-bold text-xs bg-gray-100">
                      <td colSpan={7} className="p-2 text-right border-r border-black/80 uppercase tracking-wide">Total</td>
                      <td className="p-2 text-right font-mono text-sm">{printVoucher.total_amount.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Amount Chargeable in Words */}
              <div className="border border-black/80 p-2 space-y-0.5">
                <div className="text-[10px] text-gray-500 uppercase">Amount Chargeable (in words)</div>
                <div className="font-bold text-[11px] tracking-wide">{numberToIndianWords(printVoucher.total_amount)}</div>
              </div>

              {/* HSN/SAC Tax Breakdown Table (Exact match to D74-1.pdf bottom table) */}
              <div className="border border-black/80">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-black/80 bg-gray-50 text-center">
                      <th rowSpan={2} className="p-1.5 border-r border-black/80">HSN/SAC</th>
                      <th rowSpan={2} className="p-1.5 border-r border-black/80 text-right">Taxable Value</th>
                      {printTaxSplit.isInterState ? (
                        <th colSpan={2} className="p-1 border-r border-black/80">Integrated Tax</th>
                      ) : (
                        <>
                          <th colSpan={2} className="p-1 border-r border-black/80">Central Tax</th>
                          <th colSpan={2} className="p-1 border-r border-black/80">State Tax</th>
                        </>
                      )}
                      <th rowSpan={2} className="p-1.5 text-right">Total Tax Amount</th>
                    </tr>
                    <tr className="border-b border-black/80 bg-gray-50 text-[10px]">
                      {printTaxSplit.isInterState ? (
                        <>
                          <th className="p-1 border-r border-black/80 w-16">Rate</th>
                          <th className="p-1 border-r border-black/80 w-24 text-right">Amount</th>
                        </>
                      ) : (
                        <>
                          <th className="p-1 border-r border-black/80 w-14">Rate</th>
                          <th className="p-1 border-r border-black/80 w-20 text-right">Amount</th>
                          <th className="p-1 border-r border-black/80 w-14">Rate</th>
                          <th className="p-1 border-r border-black/80 w-20 text-right">Amount</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-1.5 border-r border-black/80 text-center font-mono">441231</td>
                      <td className="p-1.5 border-r border-black/80 text-right font-mono">{printVoucher.subtotal.toFixed(2)}</td>
                      {printTaxSplit.isInterState ? (
                        <>
                          <td className="p-1.5 border-r border-black/80 text-center font-mono">{printTaxSplit.igstPercent}%</td>
                          <td className="p-1.5 border-r border-black/80 text-right font-mono">{printTaxSplit.igstAmount.toFixed(2)}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-1.5 border-r border-black/80 text-center font-mono">{printTaxSplit.cgstPercent}%</td>
                          <td className="p-1.5 border-r border-black/80 text-right font-mono">{printTaxSplit.cgstAmount.toFixed(2)}</td>
                          <td className="p-1.5 border-r border-black/80 text-center font-mono">{printTaxSplit.sgstPercent}%</td>
                          <td className="p-1.5 border-r border-black/80 text-right font-mono">{printTaxSplit.sgstAmount.toFixed(2)}</td>
                        </>
                      )}
                      <td className="p-1.5 text-right font-mono font-bold">{printVoucher.tax_amount.toFixed(2)}</td>
                    </tr>
                    <tr className="border-t border-black/80 bg-gray-50 font-bold">
                      <td className="p-1.5 border-r border-black/80 text-center uppercase">Total</td>
                      <td className="p-1.5 border-r border-black/80 text-right font-mono">{printVoucher.subtotal.toFixed(2)}</td>
                      {printTaxSplit.isInterState ? (
                        <>
                          <td className="p-1.5 border-r border-black/80 text-center"></td>
                          <td className="p-1.5 border-r border-black/80 text-right font-mono">{printTaxSplit.igstAmount.toFixed(2)}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-1.5 border-r border-black/80 text-center"></td>
                          <td className="p-1.5 border-r border-black/80 text-right font-mono">{printTaxSplit.cgstAmount.toFixed(2)}</td>
                          <td className="p-1.5 border-r border-black/80 text-center"></td>
                          <td className="p-1.5 border-r border-black/80 text-right font-mono">{printTaxSplit.sgstAmount.toFixed(2)}</td>
                        </>
                      )}
                      <td className="p-1.5 text-right font-mono font-bold">{printVoucher.tax_amount.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Tax Amount in Words (Exact match to D74-1.pdf) */}
              <div className="border border-black/80 p-2 space-y-0.5">
                <div className="text-[10px] text-gray-500 uppercase">Tax Amount (in words)</div>
                <div className="font-bold text-[11px] tracking-wide">{numberToIndianWords(printVoucher.tax_amount)}</div>
              </div>

              {/* Bank Details & Signature Section */}
              <div className="grid grid-cols-2 border border-black/80 divide-x divide-black/80">
                <div className="p-3 space-y-1">
                  <div className="font-bold text-[11px] uppercase tracking-wide">Company's Bank Details</div>
                  <div className="text-[11px]">A/c Holder's Name: <span className="font-semibold">{printVoucher.business_entity_name || "DELUXE PLY & BOARDS"}</span></div>
                  <div className="text-[11px]">Bank Name: <span className="font-semibold">{printVoucher.bank_name || "INDIAN OVERSEAS BANK"}</span></div>
                  <div className="text-[11px]">A/c No.: <span className="font-mono font-semibold">{printVoucher.account_no || "006902000001966"}</span></div>
                  <div className="text-[11px]">Branch & IFS Code: <span className="font-mono font-semibold">{printVoucher.bank_branch || "PERUMBAVOOR"} & {printVoucher.bank_ifsc || "IOBA0000069"}</span></div>
                </div>

                <div className="p-3 flex flex-col justify-between text-right">
                  <div className="text-[11px] font-semibold">for {printVoucher.business_entity_name || "DELUXE PLY & BOARDS"}</div>
                  <div className="pt-10">
                    <div className="border-t border-black/40 inline-block pt-1 text-[10px] text-gray-600">Authorised Signatory</div>
                  </div>
                </div>
              </div>

              {/* Footer Note */}
              <div className="text-center text-[10px] text-gray-500 italic pt-1">
                SUBJECT TO LOCAL JURISDICTION • This is a Computer Generated Invoice
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 print:hidden">
            <Button variant="outline" onClick={() => setPrintModalOpen(false)}>Close</Button>
            <Button onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" />
              Print Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sales Voucher Register (All Vouchers) Print Modal */}
      <Dialog open={registerPrintOpen} onOpenChange={setRegisterPrintOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-4 sm:p-6 print:p-0 print:border-none">
          <DialogHeader className="print:hidden">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5 text-primary" />
                Sales Vouchers Register Preview
              </DialogTitle>
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Print Register / Save PDF
              </Button>
            </div>
          </DialogHeader>

          <div id="printable-sales-register" className="bg-white text-black p-6 rounded border font-sans text-xs space-y-4 shadow-sm print:border-none print:shadow-none print:p-2">
            {/* Report Header */}
            <div className="text-center border-b pb-3 space-y-1">
              <h1 className="text-base font-bold tracking-wider uppercase">
                {selectedBiz?.name || "DELUXE PLY & BOARDS"}
              </h1>
              <div className="text-xs text-gray-600 font-semibold uppercase tracking-wider">
                Sales Voucher Register Report
              </div>
              <div className="text-[11px] text-gray-500 flex justify-center gap-4">
                <span>Period: {fromDate || "Beginning"} to {toDate || "Present"}</span>
                <span>•</span>
                <span>Generated: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
            </div>

            {/* Summary KPI Strip */}
            <div className="grid grid-cols-4 border border-black/80 divide-x divide-black/80 text-center py-2 bg-gray-50">
              <div>
                <div className="text-[10px] text-gray-500 uppercase">Total Sales</div>
                <div className="font-bold text-sm font-mono">{fmt(totalSales)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase">Total Paid / Received</div>
                <div className="font-bold text-sm font-mono text-emerald-700">{fmt(totalPaid)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase">Total Outstanding</div>
                <div className="font-bold text-sm font-mono text-rose-700">{fmt(totalOutstanding)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase">Total Vouchers</div>
                <div className="font-bold text-sm">{vouchers.length}</div>
              </div>
            </div>

            {/* Detailed Register Table */}
            <div className="border border-black/80">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-black/80 bg-gray-100 font-bold">
                    <th className="p-1 border-r border-black/80 w-6 text-center">#</th>
                    <th className="p-1 border-r border-black/80 w-24 text-left">Invoice No</th>
                    <th className="p-1 border-r border-black/80 w-16 text-center">Date</th>
                    <th className="p-1 border-r border-black/80 text-left">Customer (Buyer)</th>
                    <th className="p-1 border-r border-black/80 w-24 text-left">Vehicle / Route</th>
                    <th className="p-1 border-r border-black/80 w-20 text-right">Subtotal</th>
                    <th className="p-1 border-r border-black/80 w-16 text-right">Tax (GST)</th>
                    <th className="p-1 border-r border-black/80 w-14 text-right">Round Off</th>
                    <th className="p-1 border-r border-black/80 w-20 text-right">Total</th>
                    <th className="p-1 border-r border-black/80 w-16 text-right">Paid</th>
                    <th className="p-1 border-r border-black/80 w-16 text-right">Balance</th>
                    <th className="p-1 text-center w-14">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {vouchers.map((v, i) => (
                    <tr key={v.id}>
                      <td className="p-1 border-r border-black/80 text-center font-mono">{i + 1}</td>
                      <td className="p-1 border-r border-black/80 font-mono font-semibold">{v.voucher_number}</td>
                      <td className="p-1 border-r border-black/80 text-center font-mono">{v.voucher_date?.split("T")[0]}</td>
                      <td className="p-1 border-r border-black/80 font-medium">{v.party_entity_name || "—"}</td>
                      <td className="p-1 border-r border-black/80 text-[9px] font-mono">
                        {v.transport?.vehicleNumber ? `${v.transport.vehicleNumber}${v.transport.destination ? ` → ${v.transport.destination}` : ""}` : "—"}
                      </td>
                      <td className="p-1 border-r border-black/80 text-right font-mono">{fmt(v.subtotal)}</td>
                      <td className="p-1 border-r border-black/80 text-right font-mono">{fmt(v.tax_amount)}</td>
                      <td className="p-1 border-r border-black/80 text-right font-mono">
                        {v.round_off ? (v.round_off > 0 ? `+${v.round_off.toFixed(2)}` : v.round_off.toFixed(2)) : "0.00"}
                      </td>
                      <td className="p-1 border-r border-black/80 text-right font-mono font-semibold">{fmt(v.total_amount)}</td>
                      <td className="p-1 border-r border-black/80 text-right font-mono text-emerald-700">{fmt(v.paid_amount)}</td>
                      <td className="p-1 border-r border-black/80 text-right font-mono text-rose-700">{fmt(v.balance_due)}</td>
                      <td className="p-1 text-center uppercase text-[9px] font-semibold">{v.payment_status}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-black/80 font-bold bg-gray-100 font-mono">
                    <td colSpan={5} className="p-1.5 text-right border-r border-black/80 uppercase font-sans">Total</td>
                    <td className="p-1 text-right border-r border-black/80">{fmt(vouchers.reduce((s, v) => s + v.subtotal, 0))}</td>
                    <td className="p-1 text-right border-r border-black/80">{fmt(vouchers.reduce((s, v) => s + v.tax_amount, 0))}</td>
                    <td className="p-1 text-right border-r border-black/80">
                      {fmt(vouchers.reduce((s, v) => s + (v.round_off || 0), 0))}
                    </td>
                    <td className="p-1 text-right border-r border-black/80">{fmt(totalSales)}</td>
                    <td className="p-1 text-right border-r border-black/80 text-emerald-700">{fmt(totalPaid)}</td>
                    <td className="p-1 text-right border-r border-black/80 text-rose-700">{fmt(totalOutstanding)}</td>
                    <td className="p-1 text-center font-sans">{vouchers.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-between items-end pt-8 text-[10px] text-gray-500">
              <div>This is a computer-generated sales voucher register report.</div>
              <div className="border-t border-black/40 pt-1 text-right px-6 font-medium text-black">
                Authorized Signatory
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 print:hidden">
            <Button variant="outline" onClick={() => setRegisterPrintOpen(false)}>Close</Button>
            <Button onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" />
              Print Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
