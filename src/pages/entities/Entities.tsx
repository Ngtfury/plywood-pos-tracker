import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getEntities, addEntity, deleteEntities, getEntityCreditLedgers, Entity, EntityCreditLedger } from "@/lib/db/queries";
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
import { Badge } from "@/components/ui/badge";
import { Trash2, HandCoins } from "lucide-react";
import { IosSpinner, IosLoadingView, IosLoadingOverlay } from "@/components/ui/IosSpinner";

export function Entities() {
  const navigate = useNavigate();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [ledgers, setLedgers] = useState<EntityCreditLedger[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("Customer");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const refreshTrigger = useStore(s => s.refreshTrigger);
  const triggerRefresh = useStore(s => s.triggerRefresh);

  useEffect(() => {
    setPageLoading(true);
    Promise.all([
      getEntities().then(setEntities),
      getEntityCreditLedgers('ALL').then(setLedgers)
    ])
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

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} entit(ies)?`)) return;
    setIsDeleting(true);
    try {
      await deleteEntities(Array.from(selectedIds));
      triggerRefresh();
    } catch (err: any) {
      alert("Failed to delete entities: " + (err?.message || err));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!name) return;
    
    setLoading(true);
    try {
      await addEntity({ name, type, phone });
      triggerRefresh();
      setIsOpen(false);
      setName("");
      setPhone("");
    } catch (error: any) {
      console.error(error);
      alert("Error saving entity: " + (error?.message || error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Entities</h2>
          <p className="text-muted-foreground">Manage your customers, suppliers, and other contacts.</p>
        </div>
        <div className="flex gap-2">
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
          <Button onClick={() => setIsOpen(true)}>
            Add Entity
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-card relative min-h-[300px]">
        {isDeleting && <IosLoadingOverlay text="Deleting entities..." />}

        {pageLoading ? (
          <IosLoadingView text="Loading contacts & ledgers..." minHeight="300px" />
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input 
                  type="checkbox" 
                  className="rounded border-gray-300"
                  checked={entities.length > 0 && selectedIds.size === entities.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(entities.map(en => en.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Credit Balance</TableHead>
              <TableHead className="text-right">Ledger</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No entities found.
                </TableCell>
              </TableRow>
            ) : (
              entities.map((ent) => {
                const ledger = ledgers.find(l => l.entity.id === ent.id);
                const rec = ledger ? ledger.totalReceivable : 0;
                const pay = ledger ? ledger.totalPayable : 0;

                return (
                  <TableRow key={ent.id}>
                    <TableCell>
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300"
                        checked={selectedIds.has(ent.id)}
                        onChange={() => toggleSelect(ent.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{ent.name}</TableCell>
                    <TableCell>{ent.type}</TableCell>
                    <TableCell>{ent.phone || "—"}</TableCell>
                    <TableCell>
                      {rec > 0 ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10">
                          To Get: ₹{rec.toLocaleString()}
                        </Badge>
                      ) : pay > 0 ? (
                        <Badge variant="outline" className="border-rose-500/40 text-rose-400 bg-rose-500/10">
                          To Give: ₹{pay.toLocaleString()}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Settled</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate("/credits")}
                        className="h-8 text-xs gap-1 text-primary hover:text-primary"
                      >
                        <HandCoins className="h-3.5 w-3.5" />
                        View Credit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Entity</DialogTitle>
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
              <Label htmlFor="type">Entity Type (e.g. Customer, Supplier)</Label>
              <Input 
                id="type" 
                value={type}
                onChange={(e) => setType(e.currentTarget.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (Optional)</Label>
              <Input 
                id="phone" 
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="button" onClick={handleSave} disabled={loading || !name}>
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" />
                    Saving...
                  </span>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
