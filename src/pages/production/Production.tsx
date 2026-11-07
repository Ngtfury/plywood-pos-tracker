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
  Factory, PlusCircle, AlertCircle, Layers, Calendar, Ban, CheckCircle2
} from "lucide-react";
import type { ProductionEntry, Product, ProductVariant, StockBalance } from "@/lib/db/erp";
import { getSqftPerSheet } from "@/lib/db/erp";
import {
  getProductionEntries,
  postProductionEntry,
  cancelProductionEntry,
} from "@/lib/db/production";
import {
  getProducts,
  getProductVariants,
  getStockBalances,
  getErpSettings,
} from "@/lib/db/inventory";

export function Production() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [plywoodProducts, setPlywoodProducts] = useState<Product[]>([]);
  const [faceVeneerProducts, setFaceVeneerProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([]);
  const [defaultRatio, setDefaultRatio] = useState<number>(2);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Fields
  const [prodDate, setProdDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedPlywoodId, setSelectedPlywoodId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [sheetsProduced, setSheetsProduced] = useState<string>("");
  const [selectedVeneerId, setSelectedVeneerId] = useState("");
  const [ratio, setRatio] = useState<number>(2);
  const [notes, setNotes] = useState("");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getProductionEntries({ businessEntityId: selectedEntityId || undefined }),
      getProducts("plywood"),
      getProducts("face_veneer"),
      getProductVariants(),
      getStockBalances(selectedEntityId || undefined),
      getErpSettings(),
    ])
      .then(([pEntries, plyList, venList, varList, stockList, settings]) => {
        setEntries(pEntries);
        setPlywoodProducts(plyList);
        setFaceVeneerProducts(venList);
        setVariants(varList);
        setStockBalances(stockList);
        if (settings.face_veneer_ratio) {
          const r = parseFloat(settings.face_veneer_ratio);
          if (r > 0) setDefaultRatio(r);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [selectedEntityId, refreshTrigger]);

  // Filter variants for currently chosen plywood product
  const currentVariants = useMemo(
    () => variants.filter((v) => v.product_id === selectedPlywoodId),
    [variants, selectedPlywoodId]
  );

  const selectedVariantObj = useMemo(
    () => variants.find((v) => v.id === selectedVariantId),
    [variants, selectedVariantId]
  );

  // Auto calculate sqft: sheets * sqft_per_sheet
  const calculatedSqft = useMemo(() => {
    const sheets = parseFloat(sheetsProduced) || 0;
    if (!selectedVariantObj || !selectedVariantObj.size) return 0;
    const perSheet = selectedVariantObj.sqft_per_sheet || getSqftPerSheet(selectedVariantObj.size);
    return Math.round(sheets * perSheet * 100) / 100;
  }, [sheetsProduced, selectedVariantObj]);

  // Auto calculate face veneer pieces consumed: sheets * ratio
  const calculatedVeneerPieces = useMemo(() => {
    const sheets = parseFloat(sheetsProduced) || 0;
    return Math.round(sheets * (ratio || 2));
  }, [sheetsProduced, ratio]);

  // Available stock of selected face veneer
  const availableVeneerStock = useMemo(() => {
    if (!selectedVeneerId) return 0;
    const item = stockBalances.find((s) => s.product_id === selectedVeneerId);
    return item ? Number(item.qty_pieces) || 0 : 0;
  }, [stockBalances, selectedVeneerId]);

  const hasInsufficientVeneer = useMemo(() => {
    if (!selectedVeneerId || calculatedVeneerPieces <= 0) return false;
    return availableVeneerStock < calculatedVeneerPieces;
  }, [selectedVeneerId, availableVeneerStock, calculatedVeneerPieces]);

  const handleOpenNewEntry = () => {
    if (!selectedEntityId) {
      alert("Please select a specific Operating Business Entity at top header first.");
      return;
    }
    setProdDate(new Date().toISOString().split("T")[0]);
    setSelectedPlywoodId(plywoodProducts[0]?.id || "");
    setSelectedVariantId("");
    setSheetsProduced("");
    setSelectedVeneerId(faceVeneerProducts[0]?.id || "");
    setRatio(defaultRatio);
    setNotes("");
    setErrorMessage(null);
    setDialogOpen(true);
  };

  const handlePostProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) {
      setErrorMessage("Please select a business entity.");
      return;
    }
    const sheets = parseFloat(sheetsProduced);
    if (!sheets || sheets <= 0) {
      setErrorMessage("Sheets count must be greater than 0.");
      return;
    }
    if (!selectedPlywoodId || !selectedVariantId) {
      setErrorMessage("Please select plywood product and variant (size & thickness).");
      return;
    }
    if (!selectedVeneerId) {
      setErrorMessage("Please select the face veneer product.");
      return;
    }
    if (hasInsufficientVeneer) {
      setErrorMessage(
        `Insufficient face veneer stock! Available: ${availableVeneerStock} pcs, Required: ${calculatedVeneerPieces} pcs.`
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await postProductionEntry({
        business_entity_id: selectedEntityId,
        production_date: prodDate + "T12:00:00Z",
        plywood_product_id: selectedPlywoodId,
        plywood_variant_id: selectedVariantId,
        sheets_produced: sheets,
        sqft_produced: calculatedSqft,
        face_veneer_product_id: selectedVeneerId,
        face_veneer_ratio: ratio,
        face_veneer_consumed: calculatedVeneerPieces,
        notes: notes.trim() || null,
      });

      triggerRefresh();
      setDialogOpen(false);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to record production.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEntry = async (entry: ProductionEntry) => {
    if (!window.confirm(`Are you sure you want to cancel production entry on ${new Date(entry.production_date).toLocaleDateString()}?`)) {
      return;
    }
    try {
      await cancelProductionEntry(entry.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Error cancelling entry: " + err.message);
    }
  };

  // Aggregates
  const totalSheetsProduced = useMemo(() => {
    return entries
      .filter((e) => e.status === "posted")
      .reduce((sum, e) => sum + (Number(e.sheets_produced) || 0), 0);
  }, [entries]);

  const totalSqftProduced = useMemo(() => {
    return entries
      .filter((e) => e.status === "posted")
      .reduce((sum, e) => sum + (Number(e.sqft_produced) || 0), 0);
  }, [entries]);

  const totalVeneerConsumed = useMemo(() => {
    return entries
      .filter((e) => e.status === "posted")
      .reduce((sum, e) => sum + (Number(e.face_veneer_consumed) || 0), 0);
  }, [entries]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Production Management</h2>
          <p className="text-muted-foreground mt-1">Daily batch logs and automatic face veneer consumption.</p>
        </div>
        <IosLoadingView text="Loading production records..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Production Management</h2>
          <p className="text-muted-foreground mt-1">
            Produce finished plywood sheets with atomic, automated face veneer consumption.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <Button onClick={handleOpenNewEntry} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <PlusCircle className="h-4 w-4 mr-2" /> New Production Batch
          </Button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Plywood Sheets Produced</CardTitle>
            <Factory className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{totalSheetsProduced.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{totalSqftProduced.toLocaleString()} sq.ft output</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Face Veneer Consumed</CardTitle>
            <Layers className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{totalVeneerConsumed.toLocaleString()} pcs</div>
            <p className="text-xs text-muted-foreground mt-1">Standard 2 pcs per sheet ratio</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Production Runs</CardTitle>
            <Calendar className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{entries.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Total batches logged</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm bg-muted/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Automatic Consumption Rule</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">1 Sheet = 2 Face Veneer</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Applied atomically across all thicknesses</p>
          </CardContent>
        </Card>
      </div>

      {/* Production Register Table */}
      <Card>
        <CardHeader>
          <CardTitle>Production Register &amp; Material Consumption</CardTitle>
          <CardDescription>
            Audit log of all completed plywood production runs and associated inventory deductions.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Plywood Product</TableHead>
                <TableHead>Size (ft)</TableHead>
                <TableHead>Thickness</TableHead>
                <TableHead className="text-right">Sheets</TableHead>
                <TableHead className="text-right">Sq.Ft Output</TableHead>
                <TableHead>Face Veneer Used</TableHead>
                <TableHead className="text-right">Veneer Consumed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                    No production entries found for this entity. Click "New Production Batch" to record factory output.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {new Date(item.production_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-semibold">{item.plywood_product_name || "Plywood"}</TableCell>
                    <TableCell className="font-mono text-xs">{item.variant_size || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.variant_thickness ? `${item.variant_thickness} mm` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-bold text-blue-400">
                      {Number(item.sheets_produced).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {Number(item.sqft_produced).toLocaleString()} sqft
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.face_veneer_product_name || "Face Veneer"} (Ratio: {item.face_veneer_ratio}x)
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-400">
                      {Number(item.face_veneer_consumed).toLocaleString()} pcs
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          item.status === "posted"
                            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                            : "border-zinc-500 text-zinc-400 bg-zinc-800/40 text-[10px]"
                        }
                      >
                        {item.status === "posted" ? "POSTED" : "CANCELLED"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.status === "posted" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelEntry(item)}
                          className="h-7 text-xs text-muted-foreground hover:text-rose-400"
                          title="Cancel Batch"
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" /> Cancel
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

      {/* Production Entry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[580px]">
          <form onSubmit={handlePostProduction}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5 text-emerald-400" />
                <span>Record New Production Batch</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              {errorMessage && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Production Date *</Label>
                  <Input
                    type="date"
                    value={prodDate}
                    onChange={(e) => setProdDate(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Plywood Grade / Product *</Label>
                  <Select
                    value={selectedPlywoodId}
                    onValueChange={(val) => {
                      setSelectedPlywoodId(val);
                      setSelectedVariantId("");
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select Plywood" />
                    </SelectTrigger>
                    <SelectContent>
                      {plywoodProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Variant Picker (Size & Thickness) */}
              <div className="space-y-1">
                <Label className="text-xs">Plywood Dimension &amp; Thickness *</Label>
                <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Size and Thickness" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentVariants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.size} ft • {v.thickness} mm ({v.sqft_per_sheet} sqft per sheet)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sheets and SqFt Calculation Box */}
              <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Sheets Produced *</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 100"
                      value={sheetsProduced}
                      onChange={(e) => setSheetsProduced(e.target.value)}
                      required
                      min="1"
                      className="h-8 text-xs font-bold"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Auto-Calculated Output (Sq.Ft)</Label>
                    <div className="h-8 rounded border border-border/80 bg-background/80 px-3 flex items-center font-bold text-blue-400">
                      {calculatedSqft.toLocaleString()} sq.ft
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Area converts accurately using stored size multipliers: 8x4=32 sqft, 7x4=28 sqft, 6x4=24 sqft, etc.
                </p>
              </div>

              {/* Automatic Consumption Box: Face Veneer */}
              <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-emerald-400">
                    <Layers className="h-3.5 w-3.5" />
                    <span>Automatic Face Veneer Deduction</span>
                  </Label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Available Stock: {availableVeneerStock.toLocaleString()} pcs
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-[11px]">Face Veneer Product *</Label>
                    <Select value={selectedVeneerId} onValueChange={setSelectedVeneerId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select Veneer" />
                      </SelectTrigger>
                      <SelectContent>
                        {faceVeneerProducts.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px]">Ratio (pcs/sheet)</Label>
                    <Input
                      type="number"
                      value={ratio}
                      onChange={(e) => setRatio(parseFloat(e.target.value) || 2)}
                      step="0.1"
                      min="0.1"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="p-2 rounded bg-background/90 border flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground">Required Face Veneer: </span>
                    <span className="font-bold text-emerald-400">{calculatedVeneerPieces.toLocaleString()} pieces</span>
                  </div>
                  <div>
                    {hasInsufficientVeneer ? (
                      <Badge variant="outline" className="border-rose-500 text-rose-400 bg-rose-500/10 text-[10px]">
                        Insufficient Stock!
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500 text-emerald-400 bg-emerald-500/10 text-[10px]">
                        Stock Sufficient
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Batch Notes / Press Line</Label>
                <Input
                  placeholder="e.g. Press #1, Shift A, Operator: Ramesh"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                disabled={submitting || !sheetsProduced || !selectedVariantId || hasInsufficientVeneer}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {submitting ? "Posting Atomically..." : "Post Production & Update Stock"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
