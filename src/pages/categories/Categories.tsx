import { useState, useEffect } from "react";
import { 
  getCategories, 
  addCategory, 
  updateCategory, 
  deleteCategories, 
  Category 
} from "@/lib/db/queries";
import { useStore } from "@/store";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Pencil, PlusCircle } from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { IosSpinner, IosLoadingView, IosLoadingOverlay } from "@/components/ui/IosSpinner";

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"IN" | "OUT" | "BOTH">("OUT");
  const [color, setColor] = useState("#94a3b8");
  const [description, setDescription] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const refreshTrigger = useStore(s => s.refreshTrigger);
  const triggerRefresh = useStore(s => s.triggerRefresh);

  useEffect(() => {
    setPageLoading(true);
    getCategories()
      .then(setCategories)
      .catch(console.error)
      .finally(() => setPageLoading(false));
    setSelectedIds(new Set());
  }, [refreshTrigger]);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const openAddModal = () => {
    setEditingCategory(null);
    setName("");
    setType("OUT");
    setColor("#94a3b8");
    setDescription("");
    setErrorMsg(null);
    setIsOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setType(cat.type);
    setColor(cat.color || "#94a3b8");
    setDescription(cat.description || "");
    setErrorMsg(null);
    setIsOpen(true);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} category(s)? Transactions linked to these will remain safe.`)) return;
    setIsDeleting(true);
    try {
      await deleteCategories(Array.from(selectedIds));
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete categories: " + (err?.message || err));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Category name is required.");
      return;
    }
    
    setLoading(true);
    setErrorMsg(null);
    try {
      if (editingCategory) {
        await updateCategory(
          editingCategory.id, 
          { name: name.trim(), type, color, description: description.trim() || null },
          editingCategory
        );
      } else {
        await addCategory({ 
          name: name.trim(), 
          type, 
          color, 
          description: description.trim() || null 
        });
      }
      triggerRefresh();
      setIsOpen(false);
      setEditingCategory(null);
    } catch (error: any) {
      console.error(error);
      setErrorMsg("Error saving category: " + (error?.message || error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Transaction Categories</h2>
          <p className="text-muted-foreground mt-1">Manage and edit income, expense, and shared ledger categories.</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <span className="flex items-center gap-1.5">
                  <IosSpinner size="sm" className="text-white" />
                  Deleting...
                </span>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedIds.size})
                </>
              )}
            </Button>
          )}
          <Button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card relative min-h-[300px]">
        {isDeleting && <IosLoadingOverlay text="Deleting categories..." />}

        {pageLoading ? (
          <IosLoadingView text="Loading categories..." minHeight="300px" />
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300"
                  checked={categories.length > 0 && selectedIds.size === categories.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(categories.map(c => c.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                />
              </TableHead>
              <TableHead>Category Name</TableHead>
              <TableHead>Flow Type</TableHead>
              <TableHead>Color Indicator</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No categories found. Click "Add Category" to create your first category.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id} className="hover:bg-muted/40">
                  <TableCell>
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300"
                      checked={selectedIds.has(cat.id)}
                      onChange={() => toggleSelect(cat.id)}
                    />
                  </TableCell>
                  <TableCell className="font-semibold text-xs">{cat.name}</TableCell>
                  <TableCell>
                    <Badge variant={cat.type === "IN" ? "default" : cat.type === "OUT" ? "destructive" : "secondary"} className="text-[11px]">
                      {cat.type === "IN" ? "Income (IN)" : cat.type === "OUT" ? "Expense (OUT)" : "Both (IN & OUT)"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full border border-border/60" style={{ backgroundColor: cat.color }} />
                      <span className="text-xs font-mono uppercase text-muted-foreground">{cat.color}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {cat.description || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditModal(cat)}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Edit Category"
                    >
                      <Pencil className="h-3.5 w-3.5 text-blue-400" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-emerald-400" />
                {editingCategory ? `Edit Category: ${editingCategory.name}` : "Add Category"}
              </DialogTitle>
              <DialogDescription>
                {editingCategory 
                  ? "Update category name, flow type, color, or description. Preserves historical transaction associations." 
                  : "Create a new classification for revenue or operating expenditures."}
              </DialogDescription>
            </DialogHeader>

            {errorMsg && (
              <div className="p-3 my-2 text-xs bg-rose-950/40 border border-rose-800 text-rose-300 rounded-md">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4 py-3 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="catName">Category Name *</Label>
                <Input 
                  id="catName" 
                  placeholder="e.g. Freight & Logistics or Raw Timber"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-8 text-xs"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type">Transaction Flow Type *</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OUT">Expense (OUT)</SelectItem>
                    <SelectItem value="IN">Income (IN)</SelectItem>
                    <SelectItem value="BOTH">Both (IN & OUT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="color">Badge & Graph Color</Label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    id="color" 
                    value={color}
                    onChange={(e) => setColor(e.currentTarget.value)}
                    className="w-10 h-8 p-0.5 rounded border border-border cursor-pointer bg-background"
                  />
                  <Input 
                    value={color} 
                    onChange={(e) => setColor(e.target.value)}
                    className="w-28 h-8 text-xs font-mono uppercase"
                  />
                  <div className="flex gap-1.5">
                    {["#10b981", "#3b82f6", "#f59e0b", "#f43f5e", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        style={{ backgroundColor: c }}
                        className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform cursor-pointer"
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="catDesc">Description / Notes</Label>
                <Input 
                  id="catDesc" 
                  placeholder="Optional brief description of this category"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading || !name.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" />
                    Saving...
                  </span>
                ) : (
                  editingCategory ? "Save Changes" : "Create Category"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
