import { useState, useEffect } from "react";
import { getCategories, addCategory, deleteCategories, Category } from "@/lib/db/queries";
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
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"IN" | "OUT" | "BOTH">("OUT");
  const [color, setColor] = useState("#94a3b8");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const refreshTrigger = useStore(s => s.refreshTrigger);
  const triggerRefresh = useStore(s => s.triggerRefresh);

  useEffect(() => {
    getCategories().then(setCategories).catch(console.error);
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

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} category(s)?`)) return;
    await deleteCategories(Array.from(selectedIds));
    triggerRefresh();
  };

  const handleSave = async () => {
    if (!name) return;
    
    setLoading(true);
    try {
      await addCategory({ name, type, color });
      triggerRefresh();
      setIsOpen(false);
      setName("");
      setType("OUT");
      setColor("#94a3b8");
    } catch (error: any) {
      console.error(error);
      alert("Error saving category: " + (error?.message || error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Categories</h2>
          <p className="text-muted-foreground">Manage your transaction categories.</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => setIsOpen(true)}>
            Add Category
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
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
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Color</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No categories found.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    <input 
                      type="checkbox" 
                      className="rounded border-gray-300"
                      checked={selectedIds.has(cat.id)}
                      onChange={() => toggleSelect(cat.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell>
                    <Badge variant={cat.type === "IN" ? "default" : cat.type === "OUT" ? "destructive" : "secondary"}>
                      {cat.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input 
                id="name" 
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Transaction Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUT">Expense (OUT)</SelectItem>
                  <SelectItem value="IN">Income (IN)</SelectItem>
                  <SelectItem value="BOTH">Both (IN & OUT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex items-center gap-4">
                <input 
                  type="color" 
                  id="color" 
                  value={color}
                  onChange={(e) => setColor(e.currentTarget.value)}
                  className="w-12 h-12 p-1 rounded cursor-pointer"
                />
                <span className="text-sm text-muted-foreground uppercase">{color}</span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={loading || !name}>Save</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
