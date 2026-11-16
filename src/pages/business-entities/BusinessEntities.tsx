import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getBusinessEntities, upsertBusinessEntity, toggleBusinessEntityActive } from "@/lib/db/inventory";
import { useStore } from "@/store";
import type { BusinessEntity } from "@/lib/db/erp";
import { IosLoadingView, IosSpinner } from "@/components/ui/IosSpinner";
import { Building2, Plus, Pencil, Power } from "lucide-react";

const EMPTY_FORM: Partial<BusinessEntity> = {
  name: "",
  entity_type: "company",
  parent_id: null,
  location: "",
  address: "",
  phone: "",
  gstin: "",
  description: "",
  is_active: true,
};

export function BusinessEntities() {
  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<BusinessEntity>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const load = () => {
    setLoading(true);
    getBusinessEntities()
      .then(setEntities)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshTrigger]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setErrorMsg(null);
    setDialogOpen(true);
  };

  const openEdit = (e: BusinessEntity) => {
    setForm({
      id: e.id,
      name: e.name || "",
      entity_type: e.entity_type || "company",
      parent_id: e.parent_id || null,
      location: e.location || "",
      address: e.address || "",
      phone: e.phone || "",
      gstin: e.gstin || "",
      description: e.description || "",
      is_active: e.is_active !== false,
    });
    setErrorMsg(null);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      setErrorMsg("Entity / Warehouse Name is required.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const existing = entities.find(x => x.id === form.id);
      await upsertBusinessEntity(form, existing);
      triggerRefresh();
      setDialogOpen(false);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Error: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (e: BusinessEntity) => {
    if (!window.confirm(`${e.is_active ? "Deactivate" : "Activate"} "${e.name}"?`)) return;
    await toggleBusinessEntityActive(e.id, !e.is_active);
    triggerRefresh();
  };

  const companies = entities.filter((e) => e.entity_type === "company");
  const branches = entities.filter((e) => e.entity_type === "branch");
  const warehouses = entities.filter((e) => e.entity_type === "warehouse");

  if (loading) return (
    <div className="space-y-6">
      <div><h2 className="text-3xl font-bold tracking-tight">Business Entities &amp; Warehouses</h2></div>
      <IosLoadingView text="Loading operating entities and warehouses..." minHeight="300px" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Business Entities &amp; Warehouses</h2>
          <p className="text-muted-foreground mt-1">
            Manage and edit operating companies, factories, branch depots, and inventory stock warehouses.
          </p>
        </div>
        <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
          <Plus className="h-4 w-4 mr-2" /> Add Entity / Warehouse
        </Button>
      </div>

      {entities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No business entities or warehouses registered yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Add your company or warehouse location to start tracking operations.</p>
            <Button onClick={openAdd} className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
              <Plus className="h-4 w-4 mr-2" /> Add First Entity
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Units</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{entities.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Companies</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-blue-400">{companies.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Branches / Factories</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-purple-400">{branches.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Stock Warehouses</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-amber-400">{warehouses.length}</div></CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>Operating Locations &amp; Warehouses</CardTitle>
              <CardDescription>
                Companies hold financial accounts; branches and warehouses manage stock balances.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity / Warehouse Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Parent Company</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Contact Phone</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entities.map((e) => (
                    <TableRow key={e.id} className="hover:bg-muted/40">
                      <TableCell className="font-semibold text-xs">{e.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          e.entity_type === "company"
                            ? "border-blue-500/40 text-blue-400 bg-blue-500/10 text-[11px]"
                            : e.entity_type === "warehouse"
                            ? "border-amber-500/40 text-amber-400 bg-amber-500/10 text-[11px]"
                            : "border-purple-500/40 text-purple-400 bg-purple-500/10 text-[11px]"
                        }>
                          {e.entity_type === "company" ? "Company" : e.entity_type === "warehouse" ? "Warehouse" : "Branch"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.location || e.address || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{e.parent_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">{e.gstin || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{e.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs truncate max-w-xs">{e.description || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={e.is_active
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                          : "border-zinc-600 text-zinc-400 bg-zinc-800/40 text-[10px]"}>
                          {e.is_active ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openEdit(e)} 
                            title="Edit Entity / Warehouse Details"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5 text-blue-400" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleToggle(e)}
                            title={e.is_active ? "Deactivate" : "Activate"}
                            className={`h-8 w-8 ${e.is_active ? "hover:text-rose-400" : "hover:text-emerald-400"} cursor-pointer`}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-emerald-400" />
                {form.id ? `Edit ${form.entity_type === "warehouse" ? "Warehouse" : "Business Entity"}: ${form.name}` : "Add Entity or Warehouse"}
              </DialogTitle>
              <DialogDescription>
                Configure location, tax identification, and parent operational relationships.
              </DialogDescription>
            </DialogHeader>

            {errorMsg && (
              <div className="p-3 my-2 text-xs bg-rose-950/40 border border-rose-800 text-rose-300 rounded-md">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Name *</Label>
                  <Input 
                    value={form.name || ""} 
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Factory Depot #1 or ABC Plywood Industries" 
                    required
                    className="h-8 text-xs"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Operational Role *</Label>
                  <Select 
                    value={form.entity_type || "company"}
                    onValueChange={(v: "company" | "branch" | "warehouse") => setForm({ ...form, entity_type: v })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">Head Company</SelectItem>
                      <SelectItem value="branch">Branch / Factory</SelectItem>
                      <SelectItem value="warehouse">Stock Warehouse</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.entity_type !== "company" && (
                <div className="space-y-1.5">
                  <Label>Parent Operating Company</Label>
                  <Select 
                    value={form.parent_id || "none"}
                    onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select parent company" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Independent)</SelectItem>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Physical Location / Area</Label>
                  <Input 
                    value={form.location || ""} 
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Industrial Area Phase 2, Yamunanagar" 
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone Number</Label>
                  <Input 
                    value={form.phone || ""} 
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 9876543210" 
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>GSTIN / Tax Registration</Label>
                  <Input 
                    value={form.gstin || ""} 
                    onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                    placeholder="06AAAAA0000A1Z5" 
                    className="h-8 text-xs font-mono uppercase" 
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input 
                    value={form.address || ""} 
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Street address, city, state" 
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description / Capacity Notes</Label>
                <Input 
                  value={form.description || ""} 
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Primary pressing and storage facility for raw veneer" 
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button 
                type="submit" 
                disabled={saving || !form.name?.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                {saving ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" />
                    Saving...
                  </span>
                ) : (
                  form.id ? "Save Changes" : "Create Entity"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
