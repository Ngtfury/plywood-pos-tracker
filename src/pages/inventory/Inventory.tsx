import { useState, useEffect, useMemo } from "react";
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
  Package, AlertTriangle, ArrowUpDown, PlusCircle, Search, Layers
} from "lucide-react";
import type { StockBalance, Product, ProductVariant } from "@/lib/db/erp";
import {
  INVENTORY_CATEGORIES,
  getSqftPerSheet,
  sqftToSqm,
} from "@/lib/db/erp";
import {
  getStockBalances,
  getProducts,
  getProductVariants,
  postStockMovement,
} from "@/lib/db/inventory";

export function Inventory() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<StockBalance[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [unitMode, setUnitMode] = useState<"sqft" | "sqm">("sqft");

  // Adjust / Add Stock Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [movementType, setMovementType] = useState<"purchase" | "adjustment_in" | "adjustment_out">("purchase");
  const [qtySheets, setQtySheets] = useState<string>("");
  const [qtySqft, setQtySqft] = useState<string>("");
  const [qtyPieces, setQtyPieces] = useState<string>("");
  const [qtyOther, setQtyOther] = useState<string>("");
  const [narration, setNarration] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getStockBalances(selectedEntityId || undefined),
      getProducts(),
      getProductVariants(),
    ])
      .then(([stockData, prodData, varData]) => {
        setStock(stockData);
        setProducts(prodData);
        setVariants(varData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedEntityId, refreshTrigger]);

  // When selectedProduct changes in adjust dialog
  const currentProdObj = useMemo(
    () => products.find((p) => p.id === selectedProduct),
    [products, selectedProduct]
  );
  const availableVariants = useMemo(
    () => variants.filter((v) => v.product_id === selectedProduct),
    [variants, selectedProduct]
  );

  // Auto calculate sqft when sheets input changes for plywood
  const handleSheetsChange = (val: string) => {
    setQtySheets(val);
    const num = parseFloat(val) || 0;
    const vObj = variants.find((v) => v.id === selectedVariant);
    if (vObj && vObj.size) {
      const perSheet = vObj.sqft_per_sheet || getSqftPerSheet(vObj.size);
      setQtySqft((num * perSheet).toFixed(2));
    }
  };

  const handleVariantChange = (varId: string) => {
    setSelectedVariant(varId);
    const num = parseFloat(qtySheets) || 0;
    const vObj = variants.find((v) => v.id === varId);
    if (vObj && vObj.size && num > 0) {
      const perSheet = vObj.sqft_per_sheet || getSqftPerSheet(vObj.size);
      setQtySqft((num * perSheet).toFixed(2));
    }
  };

  const handleOpenAdjust = () => {
    if (!selectedEntityId) {
      alert("Please select a specific Operating Business Entity at the top before adjusting stock.");
      return;
    }
    setSelectedProduct("");
    setSelectedVariant("");
    setMovementType("purchase");
    setQtySheets("");
    setQtySqft("");
    setQtyPieces("");
    setQtyOther("");
    setNarration("");
    setDialogOpen(true);
  };

  const handleSaveStockMovement = async () => {
    if (!selectedEntityId) return;
    if (!selectedProduct) {
      alert("Please select a product.");
      return;
    }

    setAdjustSubmitting(true);
    try {
      await postStockMovement({
        business_entity_id: selectedEntityId,
        product_id: selectedProduct,
        variant_id: selectedVariant || null,
        movement_type: movementType,
        qty_sheets: parseFloat(qtySheets) || 0,
        qty_sqft: parseFloat(qtySqft) || 0,
        qty_pieces: parseFloat(qtyPieces) || 0,
        qty_other: parseFloat(qtyOther) || 0,
        narration: narration || "Manual inventory adjustment",
      });
      triggerRefresh();
      setDialogOpen(false);
    } catch (err: any) {
      alert("Failed to post stock movement: " + (err.message || err));
    } finally {
      setAdjustSubmitting(false);
    }
  };

  // Filtered Stock
  const filteredStock = useMemo(() => {
    return stock.filter((item) => {
      if (categoryFilter !== "ALL" && item.product_category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.product_name?.toLowerCase().includes(q);
        const matchesSize = item.variant_size?.toLowerCase().includes(q);
        const matchesThick = item.variant_thickness?.toString().includes(q);
        if (!matchesName && !matchesSize && !matchesThick) return false;
      }
      return true;
    });
  }, [stock, categoryFilter, searchQuery]);

  // Aggregate stats
  const totalSheets = useMemo(() => stock.reduce((acc, s) => acc + (Number(s.qty_sheets) || 0), 0), [stock]);
  const totalSqft = useMemo(() => stock.reduce((acc, s) => acc + (Number(s.qty_sqft) || 0), 0), [stock]);
  const totalPieces = useMemo(() => stock.reduce((acc, s) => acc + (Number(s.qty_pieces) || 0), 0), [stock]);
  const lowStockCount = useMemo(() => {
    return stock.filter((s) => {
      if (s.product_category === "plywood") return (s.qty_sheets || 0) < 50;
      if (s.product_category === "face_veneer") return (s.qty_pieces || 0) < 100;
      return false;
    }).length;
  }, [stock]);

  const getCategoryBadgeClass = (cat?: string) => {
    switch (cat) {
      case "plywood":
        return "border-blue-500/40 text-blue-400 bg-blue-500/10";
      case "wood":
        return "border-amber-500/40 text-amber-400 bg-amber-500/10";
      case "face_veneer":
        return "border-emerald-500/40 text-emerald-400 bg-emerald-500/10";
      case "other_veneer":
        return "border-cyan-500/40 text-cyan-400 bg-cyan-500/10";
      case "gum_resin":
        return "border-orange-500/40 text-orange-400 bg-orange-500/10";
      default:
        return "border-zinc-500/40 text-zinc-400 bg-zinc-500/10";
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory Management</h2>
          <p className="text-muted-foreground mt-1">Stock tracking across business entities, products, sizes, and thicknesses.</p>
        </div>
        <IosLoadingView text="Loading inventory position..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Entity Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory Management</h2>
          <p className="text-muted-foreground mt-1">
            Real-time stock by business entity, size, thickness, with sqft/sqm auto-conversions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <Button onClick={handleOpenAdjust} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <PlusCircle className="h-4 w-4 mr-2" /> Add / Adjust Stock
          </Button>
        </div>
      </div>

      {/* 4 Overview Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Plywood Sheets</CardTitle>
            <Package className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{totalSheets.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {unitMode === "sqft"
                ? `${totalSqft.toLocaleString()} sq.ft total`
                : `${sqftToSqm(totalSqft).toLocaleString()} sq.m total`}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Face Veneer Pieces</CardTitle>
            <Layers className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{totalPieces.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Supports ~{Math.floor(totalPieces / 2).toLocaleString()} plywood sheets production
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Stock SKUs</CardTitle>
            <ArrowUpDown className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stock.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique item & variant balances tracked</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockCount > 0 ? "text-amber-500" : "text-foreground"}`}>
              {lowStockCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Items below standard threshold</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search product, size, mm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 text-xs w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {INVENTORY_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Units Switcher */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto bg-muted/60 p-1 rounded-lg border border-border/60">
          <span className="text-[11px] font-medium text-muted-foreground px-2">Display Unit:</span>
          <Button
            size="sm"
            variant={unitMode === "sqft" ? "default" : "ghost"}
            onClick={() => setUnitMode("sqft")}
            className="h-7 text-xs px-2.5"
          >
            Sq.Ft
          </Button>
          <Button
            size="sm"
            variant={unitMode === "sqm" ? "default" : "ghost"}
            onClick={() => setUnitMode("sqm")}
            className="h-7 text-xs px-2.5"
          >
            Sq.M
          </Button>
        </div>
      </div>

      {/* Inventory Stock Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Size (ft)</TableHead>
                <TableHead>Thickness</TableHead>
                <TableHead className="text-right">Sheets</TableHead>
                <TableHead className="text-right">{unitMode === "sqft" ? "Total Sq.Ft" : "Total Sq.M"}</TableHead>
                <TableHead className="text-right">Pieces</TableHead>
                <TableHead className="text-right">Other Qty</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStock.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                    No stock records match the selected filter. Click "Add / Adjust Stock" to record initial inventory.
                  </TableCell>
                </TableRow>
              ) : (
                filteredStock.map((row) => {
                  const isPlywood = row.product_category === "plywood";
                  const isVeneer = row.product_category === "face_veneer" || row.product_category === "other_veneer";
                  const sqft = Number(row.qty_sqft) || 0;
                  const displayArea = unitMode === "sqft" ? `${sqft.toLocaleString()} sqft` : `${sqftToSqm(sqft).toLocaleString()} sqm`;

                  const isLow = isPlywood ? (Number(row.qty_sheets) || 0) < 50 : isVeneer ? (Number(row.qty_pieces) || 0) < 100 : false;

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold">{row.product_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getCategoryBadgeClass(row.product_category)}>
                          {row.product_category?.replace("_", " ") || "Other"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.variant_size || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.variant_thickness ? `${row.variant_thickness} mm` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {isPlywood ? Number(row.qty_sheets).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-400">
                        {isPlywood ? displayArea : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {isVeneer ? Number(row.qty_pieces).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {!isPlywood && !isVeneer && Number(row.qty_other) > 0 ? Number(row.qty_other).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.business_entity_name || "Consolidated"}
                      </TableCell>
                      <TableCell>
                        {isLow ? (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]">
                            Low Stock
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]">
                            In Stock
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add / Adjust Stock Movement Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Record Stock Addition / Adjustment</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Product *</Label>
                <Select value={selectedProduct} onValueChange={(val) => { setSelectedProduct(val); setSelectedVariant(""); }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Product" />
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

              <div className="space-y-1.5">
                <Label className="text-xs">Action Type</Label>
                <Select value={movementType} onValueChange={(v: any) => setMovementType(v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">Stock Addition (Purchase)</SelectItem>
                    <SelectItem value="adjustment_in">Adjustment (Count Up)</SelectItem>
                    <SelectItem value="adjustment_out">Adjustment (Count Down / Damage)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* If product has variants (like plywood), show variant picker */}
            {availableVariants.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Variant (Size &amp; Thickness) *</Label>
                <Select value={selectedVariant} onValueChange={handleVariantChange}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Size &amp; Thickness" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVariants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.size ? `${v.size} ft` : ""} {v.thickness ? `• ${v.thickness} mm` : ""} ({v.sqft_per_sheet} sqft/sheet)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Inputs based on product category */}
            {currentProdObj?.category === "plywood" && (
              <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Sheets Count *</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 100"
                      value={qtySheets}
                      onChange={(e) => handleSheetsChange(e.target.value)}
                      className="h-8 text-xs"
                      min="1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Calculated Area (Sq.Ft)</Label>
                    <Input
                      type="number"
                      value={qtySqft}
                      onChange={(e) => setQtySqft(e.target.value)}
                      placeholder="Auto computed"
                      className="h-8 text-xs font-semibold"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Area converts automatically: 8x4=32 sqft, 7x4=28 sqft, 6x4=24 sqft, etc.
                </p>
              </div>
            )}

            {(currentProdObj?.category === "face_veneer" || currentProdObj?.category === "other_veneer") && (
              <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-1">
                <Label className="text-xs">Veneer Quantity (Pieces) *</Label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={qtyPieces}
                  onChange={(e) => setQtyPieces(e.target.value)}
                  className="h-8 text-xs"
                  min="1"
                />
              </div>
            )}

            {currentProdObj && currentProdObj.category !== "plywood" && currentProdObj.category !== "face_veneer" && currentProdObj.category !== "other_veneer" && (
              <div className="space-y-1">
                <Label className="text-xs">Quantity ({currentProdObj.unit || "Units"}) *</Label>
                <Input
                  type="number"
                  placeholder="e.g. 50"
                  value={qtyOther}
                  onChange={(e) => setQtyOther(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Narration / Bill Reference</Label>
              <Input
                placeholder="e.g. Received batch #412, invoice #901"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-xs h-8">
              Cancel
            </Button>
            <Button
              onClick={handleSaveStockMovement}
              disabled={adjustSubmitting || !selectedProduct}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 cursor-pointer"
            >
              {adjustSubmitting ? "Posting..." : "Confirm & Save Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
