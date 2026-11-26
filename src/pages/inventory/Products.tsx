import { useState, useEffect, useMemo } from "react";
import { useStore } from "@/store";
import { IosLoadingView, IosSpinner } from "@/components/ui/IosSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  PlusCircle, Layers, Sparkles, ChevronDown, ChevronRight, Pencil, Search, Trash2,
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
  deleteProduct,
  getProductVariants,
  upsertProductVariant,
  deleteProductVariant,
} from "@/lib/db/inventory";

export function Products() {
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Add / Edit Product Dialog
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodName, setProdName] = useState("");
  const [prodCategory, setProdCategory] = useState<Product["category"]>("plywood");
  const [prodUnit, setProdUnit] = useState("sheets");
  const [prodSku, setProdSku] = useState("");
  const [prodBrand, setProdBrand] = useState("");
  const [prodGrade, setProdGrade] = useState("");
  const [prodPurchasePrice, setProdPurchasePrice] = useState("");
  const [prodSellingPrice, setProdSellingPrice] = useState("");
  const [prodWholesalePrice, setProdWholesalePrice] = useState("");
  const [prodMinStock, setProdMinStock] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodActive, setProdActive] = useState(true);
  const [savingProduct, setSavingProduct] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);

  // Auto-generate Variants Dialog
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(["8x4", "7x4", "6x4"]);
  const [selectedThicknesses, setSelectedThicknesses] = useState<number[]>([18, 12, 16, 9]);
  const [generatingVariants, setGeneratingVariants] = useState(false);

  // Edit Single Variant Dialog
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [variantProductId, setVariantProductId] = useState("");
  const [variantSize, setVariantSize] = useState("");
  const [variantThickness, setVariantThickness] = useState("");
  const [variantSqft, setVariantSqft] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantUnit, setVariantUnit] = useState("sheets");
  const [variantPurchasePrice, setVariantPurchasePrice] = useState("");
  const [variantSellingPrice, setVariantSellingPrice] = useState("");
  const [variantWholesalePrice, setVariantWholesalePrice] = useState("");
  const [variantGrade, setVariantGrade] = useState("");
  const [variantMinStock, setVariantMinStock] = useState("");
  const [variantActive, setVariantActive] = useState(true);
  const [savingVariant, setSavingVariant] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);

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

  const openAddProductModal = () => {
    setEditingProduct(null);
    setProdName("");
    setProdCategory("plywood");
    setProdUnit("sheets");
    setProdSku("");
    setProdBrand("");
    setProdGrade("");
    setProdPurchasePrice("");
    setProdSellingPrice("");
    setProdWholesalePrice("");
    setProdMinStock("");
    setProdDesc("");
    setProdActive(true);
    setProdError(null);
    setProductDialogOpen(true);
  };

  const openEditProductModal = (p: Product) => {
    setEditingProduct(p);
    setProdName(p.name);
    setProdCategory(p.category);
    setProdUnit(p.unit);
    setProdSku(p.sku || "");
    setProdBrand(p.brand || "");
    setProdGrade(p.grade || "");
    setProdPurchasePrice(p.purchase_price != null ? String(p.purchase_price) : "");
    setProdSellingPrice(p.selling_price != null ? String(p.selling_price) : "");
    setProdWholesalePrice(p.wholesale_price != null ? String(p.wholesale_price) : "");
    setProdMinStock(p.min_stock_level != null ? String(p.min_stock_level) : "");
    setProdDesc(p.description || "");
    setProdActive(p.is_active !== false);
    setProdError(null);
    setProductDialogOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim()) {
      setProdError("Product Name is required.");
      return;
    }

    setSavingProduct(true);
    setProdError(null);
    try {
      const payload: Partial<Product> = {
        name: prodName.trim(),
        category: prodCategory,
        unit: prodUnit,
        sku: prodSku.trim() || null,
        brand: prodBrand.trim() || null,
        grade: prodGrade.trim() || null,
        purchase_price: prodPurchasePrice.trim() ? parseFloat(prodPurchasePrice) : null,
        selling_price: prodSellingPrice.trim() ? parseFloat(prodSellingPrice) : null,
        wholesale_price: prodWholesalePrice.trim() ? parseFloat(prodWholesalePrice) : null,
        min_stock_level: prodMinStock.trim() ? parseFloat(prodMinStock) : null,
        description: prodDesc.trim() || null,
        is_active: prodActive,
      };

      if (editingProduct) {
        payload.id = editingProduct.id;
        await upsertProduct(payload, editingProduct);
      } else {
        const newId = await upsertProduct(payload);
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
      }

      setProductDialogOpen(false);
      setEditingProduct(null);
      triggerRefresh();
    } catch (err: any) {
      console.error(err);
      setProdError("Error saving product: " + (err.message || err));
    } finally {
      setSavingProduct(false);
    }
  };

  // Open single variant edit dialog
  const openEditVariantModal = (v: ProductVariant) => {
    setEditingVariant(v);
    setVariantProductId(v.product_id);
    setVariantSize(v.size || "");
    setVariantThickness(v.thickness != null ? String(v.thickness) : "");
    setVariantSqft(v.sqft_per_sheet != null ? String(v.sqft_per_sheet) : "");
    setVariantSku(v.sku || "");
    setVariantUnit(v.unit || "sheets");
    setVariantPurchasePrice(v.purchase_price != null ? String(v.purchase_price) : "");
    setVariantSellingPrice(v.selling_price != null ? String(v.selling_price) : "");
    setVariantWholesalePrice(v.wholesale_price != null ? String(v.wholesale_price) : "");
    setVariantGrade(v.grade || "");
    setVariantMinStock(v.min_stock_level != null ? String(v.min_stock_level) : "");
    setVariantActive(v.is_active !== false);
    setVariantError(null);
    setVariantDialogOpen(true);
  };

  const openAddVariantModal = (productId: string) => {
    const parentProd = products.find(p => p.id === productId);
    setEditingVariant(null);
    setVariantProductId(productId);
    setVariantSize("8x4");
    setVariantThickness("18");
    setVariantSqft("32");
    setVariantSku(parentProd ? `${parentProd.name.substring(0, 3).toUpperCase()}-8x4-18MM` : "");
    setVariantUnit(parentProd?.unit || "sheets");
    setVariantPurchasePrice("");
    setVariantSellingPrice("");
    setVariantWholesalePrice("");
    setVariantGrade(parentProd?.grade || "");
    setVariantMinStock("");
    setVariantActive(true);
    setVariantError(null);
    setVariantDialogOpen(true);
  };

  const handleSaveVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVariant(true);
    setVariantError(null);

    try {
      const payload: Partial<ProductVariant> = {
        product_id: variantProductId,
        size: variantSize || null,
        thickness: variantThickness ? parseFloat(variantThickness) : null,
        sqft_per_sheet: variantSqft ? parseFloat(variantSqft) : null,
        sku: variantSku.trim() || null,
        unit: variantUnit || "sheets",
        purchase_price: variantPurchasePrice ? parseFloat(variantPurchasePrice) : null,
        selling_price: variantSellingPrice ? parseFloat(variantSellingPrice) : null,
        wholesale_price: variantWholesalePrice ? parseFloat(variantWholesalePrice) : null,
        grade: variantGrade.trim() || null,
        min_stock_level: variantMinStock ? parseFloat(variantMinStock) : null,
        is_active: variantActive,
      };

      if (editingVariant) {
        payload.id = editingVariant.id;
        await upsertProductVariant(payload, editingVariant);
      } else {
        await upsertProductVariant(payload);
      }

      setVariantDialogOpen(false);
      setEditingVariant(null);
      triggerRefresh();
      // Ensure parent product is expanded
      setExpandedProducts(prev => ({ ...prev, [variantProductId]: true }));
    } catch (err: any) {
      console.error(err);
      setVariantError("Error saving variant: " + (err.message || err));
    } finally {
      setSavingVariant(false);
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
      for (const size of selectedSizes) {
        const sizeObj = PLYWOOD_SIZES.find((s) => s.value === size);
        const sqft = sizeObj ? sizeObj.sqft : 0;
        for (const thick of selectedThicknesses) {
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
      setExpandedProducts((prev) => ({ ...prev, [targetProduct.id]: true }));
    } catch (err: any) {
      alert("Error creating variants: " + (err.message || err));
    } finally {
      setGeneratingVariants(false);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (!window.confirm(`Delete product "${p.name}" and its variants?`)) return;
    try {
      await deleteProduct(p.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete product (it may be referenced by existing vouchers/stock): " + (err?.message || err));
    }
  };

  const handleDeleteVariant = async (v: ProductVariant) => {
    if (!window.confirm(`Delete variant "${v.size || "Standard"} ${v.thickness ? `${v.thickness}mm` : ""}"?`)) return;
    try {
      await deleteProductVariant(v.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete variant: " + (err?.message || err));
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

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (categoryFilter !== "ALL" && p.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchBrand = p.brand?.toLowerCase().includes(q);
        const matchGrade = p.grade?.toLowerCase().includes(q);
        const matchSku = p.sku?.toLowerCase().includes(q);
        return matchName || matchBrand || matchGrade || matchSku;
      }
      return true;
    });
  }, [products, categoryFilter, searchQuery]);

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
            Maintain catalog of plywood grades, timber, face veneer, resin, pricing models, and dimensional sizes.
          </p>
        </div>
        <Button
          onClick={openAddProductModal}
          className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
        >
          <PlusCircle className="h-4 w-4 mr-2" /> Add Product
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by product name, brand, grade, or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Category Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {INVENTORY_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalog of Products &amp; Raw Materials</CardTitle>
          <CardDescription>
            Click any row to expand sizes &amp; thickness variations. Use the edit button to adjust pricing, grades, and SKU.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand &amp; Grade</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Price (Sell / Cost)</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    {searchQuery ? "No products matching your search query." : "No products defined yet. Click 'Add Product' to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((prod) => {
                  const pVariants = productVariantsMap.get(prod.id) || [];
                  const isExpanded = Boolean(expandedProducts[prod.id]);

                  return (
                    <>
                      <TableRow 
                        key={prod.id} 
                        className="hover:bg-muted/40 cursor-pointer" 
                        onClick={() => toggleExpand(prod.id)}
                      >
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-xs">{prod.name}</div>
                          {prod.sku && <div className="text-[11px] font-mono text-muted-foreground">SKU: {prod.sku}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize text-[11px]">
                            {prod.category.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {prod.brand || prod.grade ? (
                            <div>
                              <span className="font-medium">{prod.brand || "Standard"}</span>
                              {prod.grade && <span className="text-muted-foreground"> • {prod.grade}</span>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs uppercase font-mono">{prod.unit}</TableCell>
                        <TableCell className="text-right text-xs">
                          {prod.selling_price != null ? (
                            <div>
                              <span className="font-bold text-emerald-400">₹{Number(prod.selling_price).toLocaleString()}</span>
                              {prod.purchase_price != null && (
                                <span className="text-muted-foreground text-[11px]"> (₹{Number(prod.purchase_price).toLocaleString()})</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{pVariants.length} configured</span>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditProductModal(prod)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Edit product details & pricing"
                            >
                              <Pencil className="h-3.5 w-3.5 text-blue-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteProduct(prod)}
                              className="h-8 w-8 text-muted-foreground hover:text-rose-400 cursor-pointer"
                              title="Delete product"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>

                            {prod.category === "plywood" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenVariantGenerator(prod)}
                                className="h-7 text-xs border-blue-500/40 text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                              >
                                <Sparkles className="h-3 w-3 mr-1" /> Sizes
                              </Button>
                            )}

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAddVariantModal(prod.id)}
                              className="h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                              title="Add custom variant combination"
                            >
                              <PlusCircle className="h-3 w-3 mr-1" /> +Variant
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Variants Sub-table */}
                      {isExpanded && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={8} className="p-4">
                            <div className="rounded-lg border border-border/80 bg-background/50 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <Layers className="h-3.5 w-3.5" />
                                  <span>Variants for {prod.name} ({pVariants.length})</span>
                                </h4>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAddVariantModal(prod.id)}
                                  className="h-6 text-[11px] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                                >
                                  <PlusCircle className="h-3 w-3 mr-1" /> Add Variant
                                </Button>
                              </div>

                              {pVariants.length === 0 ? (
                                <div className="text-center py-4 text-xs text-muted-foreground">
                                  No variants added yet. Click "+Variant" or "Sizes" above to add combinations.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
                                  {pVariants.map((v) => (
                                    <div
                                      key={v.id}
                                      className="p-2.5 rounded-lg border border-border/60 bg-muted/40 text-xs flex flex-col justify-between space-y-2 hover:border-border transition-colors"
                                    >
                                      <div className="flex items-center justify-between font-semibold">
                                        <span className="text-foreground">{v.size || "Standard"}</span>
                                        <Badge variant="outline" className="text-[10px] text-primary border-primary/40 font-mono">
                                          {v.thickness ? `${v.thickness}mm` : v.unit || "unit"}
                                        </Badge>
                                      </div>

                                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                                        {v.sqft_per_sheet && (
                                          <div>Area: <span className="font-semibold text-foreground">{v.sqft_per_sheet} sqft</span></div>
                                        )}
                                        {v.sku && (
                                          <div className="font-mono text-[10px] truncate">SKU: {v.sku}</div>
                                        )}
                                        {v.selling_price != null && (
                                          <div>Sell: <span className="font-semibold text-emerald-400">₹{Number(v.selling_price).toLocaleString()}</span></div>
                                        )}
                                      </div>

                                      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px]">
                                        <span className={v.is_active ? "text-emerald-400 font-medium" : "text-muted-foreground"}>
                                          {v.is_active ? "ACTIVE" : "INACTIVE"}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openEditVariantModal(v);
                                            }}
                                            className="h-6 px-1.5 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
                                          >
                                            <Pencil className="h-3 w-3 mr-1" /> Edit
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteVariant(v);
                                            }}
                                            className="h-6 w-6 text-muted-foreground hover:text-rose-400 cursor-pointer"
                                            title="Delete variant"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
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

      {/* Add / Edit Product Modal */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSaveProduct}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-emerald-400" />
                {editingProduct ? `Edit Product: ${editingProduct.name}` : "Add New Product"}
              </DialogTitle>
              <DialogDescription>
                Configure master product specifications, grade, brand, and baseline pricing. Changes do not rewrite historical transactions.
              </DialogDescription>
            </DialogHeader>

            {prodError && (
              <div className="p-3 my-2 text-xs bg-rose-950/40 border border-rose-800 text-rose-300 rounded-md">
                {prodError}
              </div>
            )}

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="prodName">Product Name *</Label>
                  <Input
                    id="prodName"
                    placeholder="e.g. Commercial MR Grade Plywood"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    required
                    className="h-8 text-xs"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodSku">SKU / Code</Label>
                  <Input
                    id="prodSku"
                    placeholder="e.g. PLY-MR-COM"
                    value={prodSku}
                    onChange={(e) => setProdSku(e.target.value.toUpperCase())}
                    className="h-8 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category *</Label>
                  <Select value={prodCategory} onValueChange={(v: any) => setProdCategory(v)}>
                    <SelectTrigger className="h-8 text-xs">
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
                  <Label>Primary Unit of Measurement *</Label>
                  <Select value={prodUnit} onValueChange={setProdUnit}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sheets">Sheets</SelectItem>
                      <SelectItem value="pieces">Pieces</SelectItem>
                      <SelectItem value="sqft">Sq.Ft</SelectItem>
                      <SelectItem value="sqm">Sq.M</SelectItem>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                      <SelectItem value="litre">Litres</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prodBrand">Brand / Manufacturer</Label>
                  <Input
                    id="prodBrand"
                    placeholder="e.g. Century, Greenply, In-House"
                    value={prodBrand}
                    onChange={(e) => setProdBrand(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prodGrade">Grade Specification</Label>
                  <Input
                    id="prodGrade"
                    placeholder="e.g. BWR, BWP Marine, Calibrated"
                    value={prodGrade}
                    onChange={(e) => setProdGrade(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Pricing & Stock Thresholds */}
              <div className="p-3 rounded-lg border border-border/80 bg-muted/30 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Standard Pricing &amp; Stock Levels</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="prodSellingPrice">Selling Price (₹)</Label>
                    <Input
                      id="prodSellingPrice"
                      type="number"
                      placeholder="e.g. 2400"
                      value={prodSellingPrice}
                      onChange={(e) => setProdSellingPrice(e.target.value)}
                      min="0"
                      step="0.01"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prodWholesalePrice">Wholesale Price (₹)</Label>
                    <Input
                      id="prodWholesalePrice"
                      type="number"
                      placeholder="e.g. 2100"
                      value={prodWholesalePrice}
                      onChange={(e) => setProdWholesalePrice(e.target.value)}
                      min="0"
                      step="0.01"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prodPurchasePrice">Purchase / Cost (₹)</Label>
                    <Input
                      id="prodPurchasePrice"
                      type="number"
                      placeholder="e.g. 1800"
                      value={prodPurchasePrice}
                      onChange={(e) => setProdPurchasePrice(e.target.value)}
                      min="0"
                      step="0.01"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prodMinStock">Minimum Stock Alert Level</Label>
                  <Input
                    id="prodMinStock"
                    type="number"
                    placeholder="e.g. 50 (alert threshold)"
                    value={prodMinStock}
                    onChange={(e) => setProdMinStock(e.target.value)}
                    min="0"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prodDesc">Description &amp; Quality Notes</Label>
                <Input
                  id="prodDesc"
                  placeholder="e.g. Gurjan face veneer, calibrated core, waterproof"
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={savingProduct || !prodName.trim()} 
                className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                {savingProduct ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" />
                    Saving...
                  </span>
                ) : (
                  editingProduct ? "Save Changes" : "Create Product"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Single Variant Modal */}
      <Dialog open={variantDialogOpen} onOpenChange={setVariantDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSaveVariant}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-blue-400" />
                {editingVariant ? `Edit Variant (${editingVariant.size} ${editingVariant.thickness}mm)` : "Add Product Variant"}
              </DialogTitle>
              <DialogDescription>
                Configure dimensional size, thickness, calculated sqft per sheet, SKU, and variant pricing.
              </DialogDescription>
            </DialogHeader>

            {variantError && (
              <div className="p-3 my-2 text-xs bg-rose-950/40 border border-rose-800 text-rose-300 rounded-md">
                {variantError}
              </div>
            )}

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sheet Size (ft)</Label>
                  <Select 
                    value={variantSize} 
                    onValueChange={(val) => {
                      setVariantSize(val);
                      const sObj = PLYWOOD_SIZES.find(s => s.value === val);
                      if (sObj) setVariantSqft(String(sObj.sqft));
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select standard size" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLYWOOD_SIZES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                      <SelectItem value="custom">Custom Size</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Thickness (mm)</Label>
                  <Select 
                    value={variantThickness} 
                    onValueChange={setVariantThickness}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Thickness mm" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLYWOOD_THICKNESSES.map(t => (
                        <SelectItem key={t} value={String(t)}>{t} mm</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sq.Ft per Sheet (Calculation)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 32"
                    value={variantSqft}
                    onChange={(e) => setVariantSqft(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Variant SKU</Label>
                  <Input
                    placeholder="e.g. PLY-8X4-18MM"
                    value={variantSku}
                    onChange={(e) => setVariantSku(e.target.value.toUpperCase())}
                    className="h-8 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Variant Selling Price (₹)</Label>
                  <Input
                    type="number"
                    placeholder="Leave blank for parent price"
                    value={variantSellingPrice}
                    onChange={(e) => setVariantSellingPrice(e.target.value)}
                    min="0"
                    step="0.01"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Variant Cost Price (₹)</Label>
                  <Input
                    type="number"
                    placeholder="Leave blank for parent cost"
                    value={variantPurchasePrice}
                    onChange={(e) => setVariantPurchasePrice(e.target.value)}
                    min="0"
                    step="0.01"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Variant Specific Grade Notes</Label>
                <Input
                  placeholder="e.g. Calibrated 2-side sanded"
                  value={variantGrade}
                  onChange={(e) => setVariantGrade(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setVariantDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={savingVariant}
                className="bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
              >
                {savingVariant ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" />
                    Saving...
                  </span>
                ) : (
                  editingVariant ? "Save Variant Changes" : "Add Variant"
                )}
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
              Select standard plywood dimensions and thicknesses. All combinations will be created with calculated sqft surface areas.
            </p>

            <div className="space-y-2">
              <Label className="font-semibold">Dimensions (Length × Width)</Label>
              <div className="grid grid-cols-3 gap-2">
                {PLYWOOD_SIZES.map((s) => {
                  const isChecked = selectedSizes.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => {
                        setSelectedSizes((prev) =>
                          isChecked ? prev.filter((x) => x !== s.value) : [...prev, s.value]
                        );
                      }}
                      className={`p-2 rounded border text-left text-xs transition-colors flex items-center justify-between cursor-pointer ${
                        isChecked
                          ? "bg-blue-500/15 border-blue-500/50 text-blue-300 font-medium"
                          : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{s.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{s.sqft} sqft</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Thicknesses (mm)</Label>
              <div className="grid grid-cols-6 gap-2">
                {PLYWOOD_THICKNESSES.map((t) => {
                  const isChecked = selectedThicknesses.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setSelectedThicknesses((prev) =>
                          isChecked ? prev.filter((x) => x !== t) : [...prev, t]
                        );
                      }}
                      className={`p-2 rounded border text-center text-xs transition-colors cursor-pointer ${
                        isChecked
                          ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-semibold"
                          : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t} mm
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 rounded bg-muted/40 border border-border/60 text-[11px] text-muted-foreground">
              Will generate up to <span className="font-bold text-foreground">{selectedSizes.length * selectedThicknesses.length}</span> variant combinations for inventory tracking.
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
              {generatingVariants ? "Generating..." : `Create ${selectedSizes.length * selectedThicknesses.length} Variants`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
