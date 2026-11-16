import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  getEntities, 
  addEntity, 
  updateEntity, 
  deleteEntities, 
  getEntityCreditLedgers, 
  Entity, 
  EntityCreditLedger 
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
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Trash2, HandCoins, Pencil, PlusCircle, Search } from "lucide-react";
import { IosSpinner, IosLoadingView, IosLoadingOverlay } from "@/components/ui/IosSpinner";

const INITIAL_FORM: Partial<Entity> = {
  name: "",
  type: "Customer",
  phone: "",
  alt_phone: "",
  email: "",
  address: "",
  gstin: "",
  contact_person: "",
  payment_terms: "",
  credit_limit: undefined,
  credit_period: undefined,
  credit_terms: "",
  notes: ""
};

export function Entities() {
  const navigate = useNavigate();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [ledgers, setLedgers] = useState<EntityCreditLedger[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  
  // Dialog state
  const [isOpen, setIsOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [formData, setFormData] = useState<Partial<Entity>>(INITIAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Loading states
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

  const openAddModal = () => {
    setEditingEntity(null);
    setFormData({ ...INITIAL_FORM, type: typeFilter !== "ALL" ? typeFilter : "Customer" });
    setFormError(null);
    setIsOpen(true);
  };

  const openEditModal = (ent: Entity) => {
    setEditingEntity(ent);
    setFormData({
      id: ent.id,
      name: ent.name || "",
      type: ent.type || "Customer",
      phone: ent.phone || "",
      alt_phone: ent.alt_phone || "",
      email: ent.email || "",
      address: ent.address || "",
      gstin: ent.gstin || "",
      contact_person: ent.contact_person || "",
      payment_terms: ent.payment_terms || "",
      credit_limit: ent.credit_limit != null ? ent.credit_limit : undefined,
      credit_period: ent.credit_period != null ? ent.credit_period : undefined,
      credit_terms: ent.credit_terms || "",
      notes: ent.notes || ""
    });
    setFormError(null);
    setIsOpen(true);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name?.trim()) {
      setFormError("Entity Name is required.");
      return;
    }

    if (formData.credit_limit != null && Number(formData.credit_limit) < 0) {
      setFormError("Credit Limit cannot be negative.");
      return;
    }

    if (formData.credit_period != null && Number(formData.credit_period) < 0) {
      setFormError("Credit Period (days) cannot be negative.");
      return;
    }

    setLoading(true);
    try {
      if (editingEntity) {
        await updateEntity(editingEntity.id, formData, editingEntity);
      } else {
        await addEntity(formData);
      }
      triggerRefresh();
      setIsOpen(false);
      setEditingEntity(null);
      setFormData(INITIAL_FORM);
    } catch (error: any) {
      console.error(error);
      setFormError(error?.message || "Failed to save entity changes.");
    } finally {
      setLoading(false);
    }
  };

  // Filtered entities
  const filteredEntities = entities.filter(ent => {
    if (typeFilter !== "ALL" && ent.type.toLowerCase() !== typeFilter.toLowerCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = ent.name.toLowerCase().includes(q);
      const matchPhone = ent.phone?.toLowerCase().includes(q);
      const matchGstin = ent.gstin?.toLowerCase().includes(q);
      const matchContact = ent.contact_person?.toLowerCase().includes(q);
      return matchName || matchPhone || matchGstin || matchContact;
    }
    return true;
  });

  const isCustomerType = formData.type?.toLowerCase() === "customer";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Entities Master</h2>
          <p className="text-muted-foreground mt-1">
            Manage and edit customers, suppliers, transporters, contractors, and credit profiles.
          </p>
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
            Add Entity
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, phone, contact person, or GSTIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="Customer">Customers</SelectItem>
              <SelectItem value="Supplier">Suppliers</SelectItem>
              <SelectItem value="Transporter">Transporters</SelectItem>
              <SelectItem value="Contractor">Contractors</SelectItem>
              <SelectItem value="Other">Other Contacts</SelectItem>
            </SelectContent>
          </Select>
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
                  checked={filteredEntities.length > 0 && selectedIds.size === filteredEntities.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(filteredEntities.map(en => en.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                />
              </TableHead>
              <TableHead>Entity Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Contact / Phone</TableHead>
              <TableHead>GSTIN / Tax ID</TableHead>
              <TableHead>Credit Limit / Terms</TableHead>
              <TableHead>Outstanding Balance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {searchQuery ? "No entities matching your search criteria." : "No entities registered yet."}
                </TableCell>
              </TableRow>
            ) : (
              filteredEntities.map((ent) => {
                const ledger = ledgers.find(l => l.entity.id === ent.id);
                const rec = ledger ? ledger.totalReceivable : 0;
                const pay = ledger ? ledger.totalPayable : 0;

                return (
                  <TableRow key={ent.id} className="hover:bg-muted/40">
                    <TableCell>
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300"
                        checked={selectedIds.has(ent.id)}
                        onChange={() => toggleSelect(ent.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-xs">{ent.name}</div>
                      {ent.contact_person && (
                        <div className="text-[11px] text-muted-foreground">Attn: {ent.contact_person}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-[11px]">
                        {ent.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{ent.phone || "—"}</div>
                      {ent.email && <div className="text-[11px] text-muted-foreground">{ent.email}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {ent.gstin || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {ent.credit_limit ? (
                        <div>
                          <span className="font-semibold text-primary">Limit: ₹{Number(ent.credit_limit).toLocaleString()}</span>
                          {ent.credit_period ? <span className="text-[11px] text-muted-foreground"> ({ent.credit_period}d)</span> : null}
                        </div>
                      ) : ent.payment_terms ? (
                        <span className="text-muted-foreground">{ent.payment_terms}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {rec > 0 ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-xs">
                          To Get: ₹{rec.toLocaleString()}
                        </Badge>
                      ) : pay > 0 ? (
                        <Badge variant="outline" className="border-rose-500/40 text-rose-400 bg-rose-500/10 text-xs">
                          To Give: ₹{pay.toLocaleString()}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Settled (₹0)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => openEditModal(ent)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Edit entity details & credit settings"
                        >
                          <Pencil className="h-3.5 w-3.5 text-blue-400" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => navigate("/credits")}
                          className="h-8 text-xs gap-1 text-primary hover:text-primary cursor-pointer"
                        >
                          <HandCoins className="h-3.5 w-3.5" />
                          Credit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        )}
      </div>

      {/* Edit / Add Entity Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-emerald-400" />
                {editingEntity ? `Edit Entity: ${editingEntity.name}` : "Add New Entity"}
              </DialogTitle>
              <DialogDescription>
                {editingEntity 
                  ? "Update contact info, GSTIN, and credit configurations. Modifying details preserves all historical transactions and balances." 
                  : "Register a customer, supplier, contractor, or commercial contact."}
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <div className="p-3 my-2 text-xs bg-rose-950/40 border border-rose-800 text-rose-300 rounded-md">
                {formError}
              </div>
            )}

            <div className="space-y-4 py-3 text-xs">
              {/* Basic Information */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="entName" className="text-xs">Entity / Trade Name *</Label>
                  <Input 
                    id="entName" 
                    placeholder="e.g. Balaji Timber Works or Rahul Sharma"
                    value={formData.name || ""}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="h-8 text-xs"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entType" className="text-xs">Entity Type *</Label>
                  <Select 
                    value={formData.type || "Customer"} 
                    onValueChange={(val) => setFormData({ ...formData, type: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Customer">Customer</SelectItem>
                      <SelectItem value="Supplier">Supplier</SelectItem>
                      <SelectItem value="Transporter">Transporter</SelectItem>
                      <SelectItem value="Contractor">Contractor</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entPhone" className="text-xs">Primary Phone</Label>
                  <Input 
                    id="entPhone" 
                    placeholder="+91 9876543210"
                    value={formData.phone || ""}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entAltPhone" className="text-xs">Alternate Phone</Label>
                  <Input 
                    id="entAltPhone" 
                    placeholder="Optional backup phone"
                    value={formData.alt_phone || ""}
                    onChange={(e) => setFormData({ ...formData, alt_phone: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entEmail" className="text-xs">Email Address</Label>
                  <Input 
                    id="entEmail" 
                    type="email"
                    placeholder="accounts@example.com"
                    value={formData.email || ""}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Address and Tax / GSTIN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entAddress" className="text-xs">Billing & Delivery Address</Label>
                  <Input 
                    id="entAddress" 
                    placeholder="Shop/Factory address, city, state"
                    value={formData.address || ""}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entGstin" className="text-xs">GSTIN / Tax ID</Label>
                  <Input 
                    id="entGstin" 
                    placeholder="22AAAAA0000A1Z5"
                    value={formData.gstin || ""}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                    className="h-8 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              {/* Specific fields: Supplier / Contractor Contact Person */}
              {(!isCustomerType || formData.contact_person) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="entContact" className="text-xs">Contact Person / Manager</Label>
                    <Input 
                      id="entContact" 
                      placeholder="e.g. Mr. Rajesh (Sales Manager)"
                      value={formData.contact_person || ""}
                      onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="entPayTerms" className="text-xs">Supplier Payment Terms</Label>
                    <Input 
                      id="entPayTerms" 
                      placeholder="e.g. Net 30, Against Delivery, 50% Advance"
                      value={formData.payment_terms || ""}
                      onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Customer Credit Settings Box */}
              <div className="p-3 rounded-lg border border-border/80 bg-muted/30 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <HandCoins className="h-3.5 w-3.5" />
                  <span>Credit Policy & Limits</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="entCreditLimit" className="text-xs">Credit Limit (₹)</Label>
                    <Input 
                      id="entCreditLimit" 
                      type="number"
                      placeholder="e.g. 500000"
                      value={formData.credit_limit ?? ""}
                      onChange={(e) => setFormData({ ...formData, credit_limit: e.target.value ? parseFloat(e.target.value) : undefined })}
                      min="0"
                      step="1000"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="entCreditPeriod" className="text-xs">Credit Period (Days)</Label>
                    <Input 
                      id="entCreditPeriod" 
                      type="number"
                      placeholder="e.g. 30"
                      value={formData.credit_period ?? ""}
                      onChange={(e) => setFormData({ ...formData, credit_period: e.target.value ? parseInt(e.target.value) : undefined })}
                      min="0"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="entCreditTerms" className="text-xs">Credit Terms / Notes</Label>
                    <Input 
                      id="entCreditTerms" 
                      placeholder="e.g. Strict 15 days, 2% interest post-due"
                      value={formData.credit_terms || ""}
                      onChange={(e) => setFormData({ ...formData, credit_terms: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Note: Editing credit limits or terms updates master configuration and does not rewrite existing invoices, payments, or ledger balances.
                </p>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="entNotes" className="text-xs">Internal Notes / Remarks</Label>
                <Input 
                  id="entNotes" 
                  placeholder="Additional delivery instructions or notes"
                  value={formData.notes || ""}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
                disabled={loading || !formData.name?.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" />
                    Saving Changes...
                  </span>
                ) : (
                  editingEntity ? "Save Changes" : "Create Entity"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
