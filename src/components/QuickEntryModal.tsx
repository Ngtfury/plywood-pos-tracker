import { useState, useEffect } from "react";
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
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCategories, getEntities, addTransaction, getCustomFields, Category, Entity, CustomFieldDef } from "@/lib/db/queries";
import { useStore } from "@/store";

interface QuickEntryModalProps {
  type: "IN" | "OUT";
  isOpen: boolean;
  onClose: () => void;
}

export function QuickEntryModal({ type, isOpen, onClose }: QuickEntryModalProps) {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState("");
  const [customData, setCustomData] = useState<Record<string, string>>({});

  const [categories, setCategories] = useState<Category[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(false);
  
  const triggerRefresh = useStore(s => s.triggerRefresh);
  const refreshTrigger = useStore(s => s.refreshTrigger);

  useEffect(() => {
    getCategories(type).then(setCategories).catch(console.error);
    getEntities().then(setEntities).catch(console.error);
    getCustomFields().then(setCustomFields).catch(console.error);
  }, [type, refreshTrigger]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setCategoryId("");
      setEntityId("none");
      setDate(new Date().toISOString().split('T')[0]);
      setNotes("");
      setCustomData({});
    }
  }, [isOpen, type, refreshTrigger]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !categoryId) return;
    
    setLoading(true);
    try {
      await addTransaction({
        type,
        amount: parseFloat(amount),
        date: date + "T12:00:00Z", // Append arbitrary time so it parses correctly
        category_id: categoryId,
        entity_id: entityId === "none" ? null : entityId,
        product_id: null,
        quantity: null,
        description: null,
        notes,
        custom_data: customData
      });
      triggerRefresh();
      onClose();
    } catch (error) {
      console.error("Failed to add transaction", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Quick {type === "IN" ? "Income" : "Expense"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-6 py-4">
          
          {/* Main Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input 
                id="amount" 
                type="number" 
                placeholder="0.00" 
                value={amount}
                onChange={(e) => setAmount(e.currentTarget.value)}
                required
                min="0.01"
                step="0.01"
                autoFocus
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input 
                id="date" 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.currentTarget.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="entity">Entity (Optional)</Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- None --</SelectItem>
                  {entities.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input 
                id="notes" 
                placeholder="Brief description..." 
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
              />
            </div>
          </div>

          {/* Custom Fields Section (Bottom) */}
          {customFields.filter(f => f.apply_to === "BOTH" || f.apply_to === type).length > 0 && (
            <div className="pt-4 border-t space-y-4">
              <p className="text-sm font-medium text-muted-foreground">Custom Fields</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {customFields.filter(f => f.apply_to === "BOTH" || f.apply_to === type).map(field => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={`custom_${field.id}`}>{field.name}</Label>
                    <Input 
                      id={`custom_${field.id}`}
                      type={field.type === "number" ? "number" : "text"}
                      value={customData[field.id] || ""}
                      onChange={(e) => setCustomData({ ...customData, [field.id]: e.currentTarget.value })}
                      placeholder={`Enter ${field.name.toLowerCase()}...`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading || !amount || !categoryId} className={type === "IN" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}>
              Save {type === "IN" ? "Income" : "Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
