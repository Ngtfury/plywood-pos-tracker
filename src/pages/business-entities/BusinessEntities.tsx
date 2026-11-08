import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
import { IosLoadingView } from "@/components/ui/IosSpinner";
import { Building2, Plus, Pencil, Power } from "lucide-react";

const EMPTY_FORM: Partial<BusinessEntity> = {
  name: "", entity_type: "company", parent_id: null,
  address: "", phone: "", gstin: "", is_active: true,
};

export function BusinessEntities() {
  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<BusinessEntity>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const load = () => {
    setLoading(true);
    getBusinessEntities().then(setEntities).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(load, [refreshTrigger]);

  const openAdd = () => { setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (e: BusinessEntity) => { setForm({ ...e }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      await upsertBusinessEntity(form);
      triggerRefresh();
      setDialogOpen(false);
    } catch (err: any) {
      alert("Error: " + err.message);
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

  if (loading) return (
    <div className="space-y-6">
      <div><h2 className="text-3xl font-bold tracking-tight">Business Entities</h2></div>
      <IosLoadingView text="Loading business entities..." minHeight="300px" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Business Entities</h2>
          <p className="text-muted-foreground mt-1">Manage companies and branches for multi-entity accounting.</p>
        </div>
        <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-500 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Entity
        </Button>
      </div>

      {entities.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No business entities yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Add your company to start using the ERP modules.</p>
            <Button onClick={openAdd} className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white">
              <Plus className="h-4 w-4 mr-2" /> Add First Entity
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Entities</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{entities.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Companies</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-blue-400">{companies.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Branches</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-purple-400">{branches.length}</div></CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader><CardTitle>All Entities</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entities.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={e.entity_type === "company"
                          ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                          : "border-purple-500/40 text-purple-400 bg-purple-500/10"}>
                          {e.entity_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{e.parent_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm font-mono">{e.gstin || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{e.phone || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={e.is_active
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : "border-zinc-600 text-zinc-400 bg-zinc-800/40"}>
                          {e.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(e)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleToggle(e)}
                            title={e.is_active ? "Deactivate" : "Activate"}
                            className={e.is_active ? "hover:text-rose-400" : "hover:text-emerald-400"}>
                            <Power className="h-4 w-4" />
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
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Business Entity" : "Add Business Entity"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Entity Name *</Label>
                <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. ABC Plywood Industries" />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.entity_type || "company"}
                  onValueChange={(v: "company" | "branch") => setForm({ ...form, entity_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="branch">Branch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.entity_type === "branch" && (
                <div className="space-y-1.5">
                  <Label>Parent Company</Label>
                  <Select value={form.parent_id || "none"}
                    onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Select parent" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 xxxxxxxxxx" />
              </div>
              <div className="space-y-1.5">
                <Label>GSTIN</Label>
                <Input value={form.gstin || ""} onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                  placeholder="22AAAAA0000A1Z5" className="font-mono text-sm" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Address</Label>
                <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Full address" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name?.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white">
              {saving ? "Saving..." : "Save Entity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
