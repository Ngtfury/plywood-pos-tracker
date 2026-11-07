import { useState, useEffect, useMemo } from "react";
import { useStore } from "@/store";
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
  PlusCircle, Layers, Sparkles, ChevronDown, ChevronRight, CheckCircle2,
} from "lucide-react";
import type { Product, ProductVariant } from "@/lib/db/erp";
import {
  INVENTORY_CATEGORIES,
  PLYWOOD_SIZES,
  PLYWOOD_THICKNESSES,
} from "@/lib/db/erp";
import {
  getProducts,
  upsertProduct,
  getProductVariants,
  upsertProductVariant,
} from "@/lib/db/inventory";

export function Products() {
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  // Add Product Dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [prodName, setProdName] = useState("");
  const [prodCategory, setProdCategory] = useState<Product["category"]>("plywood");
  const [prodUnit, setProdUnit] = useState("sheets");
  const [prodDesc, setProdDesc] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);

  // Auto-generate Variants Dialog
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["8x4", "7x4", "6x4"]);
  const [selectedThicknesses, setSelectedThicknesses] = useState<number[]>([18, 12, 16, 9]);
  const [generatingVariants, setGeneratingVariants] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([getProducts(), getProductVariants()])
      .then(([pList, vList]) => {
        setProducts(pList);
        setVariants(vList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [refreshTrigger]);

  const toggleExpand = (id: string) => {
    setExpandedProducts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) return;
    setSavingProduct(true);
    try {
      const newId = await upsertProduct({
        name: prodName.trim(),
        category: prodCategory,
        unit: prodUnit,
        description: prodDesc.trim() || null,
        is_active: true,
      });

      // If plywood, auto prompt for variants
      setProductDialogOpen(false);
      setProdName("");
      setProdDesc("");
      triggerRefresh();

      if (prodCategory === "plywood") {
        setTargetProduct({
          id: newId,
          name: prodName.trim(),
          category: prodCategory,
          unit: prodUnit,
          description: prodDesc.trim() || null,
          is_active: true,
        });
        setVariantModalOpen(true);
      }
    } catch (err: any) {
      alert("Error saving product: " + (err.message || err));
    } finally {
      setSavingProduct(false);
    }
  };

  const handleOpenVariantGenerator = (p: Product) => {
    setTargetProduct(p);
    setSelectedSizes(["8x4", "7x4", "6x4", "6x3", "5x4", "5x3"]);
    setSelectedThicknesses([25, 18, 16, 12, 9, 6]);
    setVariantModalOpen(true);
  };

  const handleGenerateVariants = async () => {
    if (!targetProduct) return;
    setGeneratingVariants(true);
    try {
      // Generate combinations
      for (const size of selectedSizes) {
        const sizeObj = PLYWOOD_SIZES.find((s) => s.value === size);
        const sqft = sizeObj ? sizeObj.sqft : 0;
        for (const thick of selectedThicknesses) {
          // Check if variant already exists
          const exists = variants.some(
            (v) => v.product_id === targetProduct.id && v.size === size && v.thickness === thick
          );
          if (!exists) {
            await upsertProductVariant({
              product_id: targetProduct.id,
              size,
              thickness: thick,
              sqft_per_sheet: sqft,
              sku: `${targetProduct.name.substring(0, 3).toUpperCase()}-${size}-${thick}MM`,
              unit: "sheets",
              is_active: true,
            });
          }
        }
      }
      triggerRefresh();
      setVariantModalOpen(false);
      // expand this product to reveal
      setExpandedProducts((prev) => ({ ...prev, [targetProduct.id]: true }));
    } catch (err: any) {
      alert("Error creating variants: " + (err.message || err));
    } finally {
      setGeneratingVariants(false);
    }
  };

  const productVariantsMap = useMemo(() => {
    const map = new Map<string, ProductVariant[]>();
    for (const v of variants) {
      if (!map.has(v.product_id)) {
        map.set(v.product_id, []);
      }
      map.get(v.product_id)!.push(v);
    }
    return map;
  }, [variants]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products &amp; Variants Master</h2>
          <p className="text-muted-foreground mt-1">Configure products, plywood grades, sizes, and thicknesses.</p>
        </div>
        <IosLoadingView text="Loading product catalog..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products &amp; Variants Master</h2>
          <p className="text-muted-foreground mt-1">
            Standard plywood sizes (8x4, 7x4, 6x4, 6x3, 5x4, 5x3) and thicknesses (25, 18, 16, 12, 9, 6 mm).
          </p>
        </div>
        <Button
          onClick={() => {
            setProdName("");
            setProdCategory("plywood");
            setProdUnit("sheets");
            setProdDesc("");
            setProductDialogOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
        >
          <PlusCircle className="h-4 w-4 mr-2" /> Add Product
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalog of Products &amp; Raw Materials</CardTitle>
          <CardDescription>
            Click on any plywood row to expand and view its size and thickness variations.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Default Unit</TableHead>
                <TableHead>Variants Count</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    No products defined yet. Click "Add Product" to create your first plywood or raw material item.
                  </TableCell>
                </TableRow>
              ) : (
                products.map((prod) => {
                  const pVariants = productVariantsMap.get(prod.id) || [];
                  const isExpanded = Boolean(expandedProducts[prod.id]);

                  return (
                    <>
                      <TableRow key={prod.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => toggleExpand(prod.id)}>
                        <TableCell>
                          {pVariants.length > 0 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">{prod.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {prod.category.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs uppercase">{prod.unit}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{pVariants.length} variants</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{prod.description || "—"}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {prod.category === "plywood" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenVariantGenerator(prod)}
                              className="h-7 text-xs border-blue-500/40 text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                            >
                              <Sparkles className="h-3 w-3 mr-1.5" /> Auto-Generate Sizes
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded Variants Sub-table */}
                      {isExpanded && pVariants.length > 0 && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={7} className="p-4">
                            <div className="rounded-lg border border-border/80 bg-background/50 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <Layers className="h-3.5 w-3.5" />
                                  <span>Variants for {prod.name}</span>
                                </h4>
                                <span className="text-xs text-muted-foreground">{pVariants.length} combinations configured</span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-1">
                                {pVariants.map((v) => (
                                  <div
                                    key={v.id}
                                    className="p-2 rounded border border-border/60 bg-muted/40 text-xs flex flex-col justify-between"
                                  >
                                    <div className="flex items-center justify-between font-semibold">
                                      <span>{v.size || "Standard"}</span>
                                      <span className="text-primary">{v.thickness ? `${v.thickness}mm` : ""}</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
                                      <span>{v.sqft_per_sheet ? `${v.sqft_per_sheet} sqft` : ""}</span>
                                      <span className="font-mono text-[9px] truncate max-w-[70px]">{v.sku}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Product Modal */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSaveProduct}>
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="prodName">Product Name *</Label>
                <Input
                  id="prodName"
                  placeholder="e.g. Commercial MR Grade Plywood"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category *</Label>
                  <Select value={prodCategory} onValueChange={(v: any) => setProdCategory(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVENTORY_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Primary Unit *</Label>
                  <Select value={prodUnit} onValueChange={setProdUnit}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sheets">Sheets</SelectItem>
                      <SelectItem value="pieces">Pieces</SelectItem>
                      <SelectItem value="sqft">Sq.Ft</SelectItem>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                      <SelectItem value="litre">Litres</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prodDesc">Description / Grade Notes</Label>
                <Input
                  id="prodDesc"
                  placeholder="e.g. Calibrated, Gurjan core, waterproof"
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingProduct || !prodName.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
                {savingProduct ? "Saving..." : "Save Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Auto-generate Standard Variants Modal */}
      <Dialog open={variantModalOpen} onOpenChange={setVariantModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-400" />
              <span>Generate Size &amp; Thickness Variants for {targetProduct?.name}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <p className="text-muted-foreground">
              Select standard plywood dimensions to automatically create SKU variations and square-footage conversion constants:
            </p>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Select Standard Sizes (ft):</Label>
              <div className="grid grid-cols-3 gap-2">
                {PLYWOOD_SIZES.map((size) => {
                  const isChecked = selectedSizes.includes(size.value);
                  return (
                    <button
                      key={size.value}
                      type="button"
                      onClick={() => {
                        if (isChecked) setSelectedSizes(selectedSizes.filter((s) => s !== size.value));
                        else setSelectedSizes([...selectedSizes, size.value]);
                      }}
                      className={`p-2.5 rounded-lg border text-left flex items-center justify-between cursor-pointer transition-colors ${
                        isChecked
                          ? "border-blue-500 bg-blue-500/10 text-foreground font-semibold"
                          : "border-border hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <span>{size.label}</span>
                      <span className="text-[11px] opacity-75">{size.sqft} sqft</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Select Standard Thicknesses (mm):</Label>
              <div className="grid grid-cols-6 gap-2">
                {PLYWOOD_THICKNESSES.map((th) => {
                  const isChecked = selectedThicknesses.includes(th);
                  return (
                    <button
                      key={th}
                      type="button"
                      onClick={() => {
                        if (isChecked) setSelectedThicknesses(selectedThicknesses.filter((t) => t !== th));
                        else setSelectedThicknesses([...selectedThicknesses, th]);
                      }}
                      className={`p-2 rounded-lg border text-center cursor-pointer transition-colors ${
                        isChecked
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold"
                          : "border-border hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      {th} mm
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
              <span>
                Will create up to <strong>{selectedSizes.length * selectedThicknesses.length}</strong> unique SKU combinations.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerateVariants}
              disabled={generatingVariants || selectedSizes.length === 0 || selectedThicknesses.length === 0}
              className="bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
            >
              {generatingVariants ? "Generating..." : "Generate Variants"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
