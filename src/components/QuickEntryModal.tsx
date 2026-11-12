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
import { getBankAccounts } from "@/lib/db/accounting";
import type { BankAccount } from "@/lib/db/erp";
import { useStore } from "@/store";
import { CreditCard, Calendar, AlertCircle } from "lucide-react";
import { IosSpinner } from "@/components/ui/IosSpinner";

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

  // Credit system fields
  const [isCredit, setIsCredit] = useState(false);
  const [totalBillAmount, setTotalBillAmount] = useState("");
  const [paidNowAmount, setPaidNowAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [bankAmount, setBankAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash_only" | "bank_transfer_only" | "cash_and_bank">("cash_only");

  const [categories, setCategories] = useState<Category[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(false);
  
  const triggerRefresh = useStore(s => s.triggerRefresh);
  const refreshTrigger = useStore(s => s.refreshTrigger);

  useEffect(() => {
    getCategories(type).then(setCategories).catch(console.error);
    getEntities().then(setEntities).catch(console.error);
    getCustomFields().then(setCustomFields).catch(console.error);
    if (type === "IN") {
      getBankAccounts().then(setBankAccounts).catch(console.error);
    }
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
      setIsCredit(false);
      setTotalBillAmount("");
      setPaidNowAmount("");
      setDueDate("");
      setCashAmount("");
      setBankAmount("");
      setBankAccountId("");
      setPaymentReference("");
      setPaymentMode("cash_only");
    }
  }, [isOpen, type, refreshTrigger]);

  useEffect(() => {
    if (type !== "IN" || isCredit) return;
    if (paymentMode === "cash_only") {
      setCashAmount(amount);
      setBankAmount("0");
      setBankAccountId("");
      setPaymentReference("");
    } else if (paymentMode === "bank_transfer_only") {
      setCashAmount("0");
      setBankAmount(amount);
    }
  }, [amount, isCredit, paymentMode, type]);

  const calcTotal = isCredit ? (parseFloat(totalBillAmount) || 0) : (parseFloat(amount) || 0);
  const calcPaid = isCredit ? (parseFloat(paidNowAmount) || 0) : calcTotal;
  const calcBalanceDue = Math.max(0, calcTotal - calcPaid);
  const receivedCash = parseFloat(cashAmount) || 0;
  const receivedBank = parseFloat(bankAmount) || 0;
  const receivedBreakdownTotal = receivedCash + receivedBank;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) return;
    if (!isCredit && !amount) return;
    if (isCredit && (!totalBillAmount || entityId === "none")) return;
    if (type === "IN" && !isCredit) {
      if (Math.abs(receivedBreakdownTotal - (parseFloat(amount) || 0)) > 0.005) {
        alert("Cash Amount and Bank Transfer Amount must equal Total Amount Received.");
        return;
      }
      if (receivedBank > 0 && !bankAccountId) {
        alert("Select the receiving bank account for the bank transfer.");
        return;
      }
    }
    
    setLoading(true);
    try {
      if (isCredit) {
        const total = parseFloat(totalBillAmount) || 0;
        const paid = parseFloat(paidNowAmount) || 0;
        const balance = Math.max(0, total - paid);
        const status = balance <= 0 ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID');

        await addTransaction({
          type,
          amount: paid, // actual immediate cashflow
          total_amount: total,
          paid_amount: paid,
          balance_due: balance,
          credit_status: status,
          due_date: dueDate ? dueDate + "T23:59:59Z" : null,
          date: date + "T12:00:00Z",
          category_id: categoryId,
          entity_id: entityId === "none" ? null : entityId,
          product_id: null,
          quantity: null,
          description: null,
          notes,
          custom_data: customData
        });
      } else {
        const amt = parseFloat(amount) || 0;
        await addTransaction({
          type,
          amount: amt,
          total_amount: amt,
          paid_amount: amt,
          balance_due: 0,
          credit_status: 'PAID',
          due_date: null,
          date: date + "T12:00:00Z",
          category_id: categoryId,
          entity_id: entityId === "none" ? null : entityId,
          product_id: null,
          quantity: null,
          description: null,
          notes,
          custom_data: type === "IN" ? {
            ...customData,
            payment_method: paymentMode,
            cash_amount: receivedCash,
            bank_amount: receivedBank,
            bank_account_id: receivedBank > 0 ? bankAccountId : null,
            payment_reference: paymentReference || null,
          } : customData
        });
      }
      triggerRefresh();
      onClose();
    } catch (error) {
      console.error("Failed to add transaction", error);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = () => {
    if (!categoryId) return false;
    if (isCredit) {
      return (
        parseFloat(totalBillAmount) > 0 &&
        parseFloat(paidNowAmount) >= 0 &&
        entityId !== "none"
      );
    }
    return parseFloat(amount) > 0;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>Quick {type === "IN" ? "Income" : "Expense"}</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-muted font-normal text-muted-foreground">
              {type === "IN" ? "Sales / Cash Receipt" : "Purchase / Bill Payment"}
            </span>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-2">
          
          {/* Credit Toggle Pill */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/40 transition-colors">
            <div className="flex items-center gap-2.5">
              <CreditCard className={`h-5 w-5 ${isCredit ? 'text-primary' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-sm font-semibold leading-none">Credit / Partial Payment</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {type === "IN" ? "Customer will pay remaining amount later" : "We will pay balance to supplier later"}
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={isCredit} 
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsCredit(checked);
                  if (checked && amount && !totalBillAmount) {
                    setTotalBillAmount(amount);
                    setPaidNowAmount(amount);
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* Amount Fields */}
          {!isCredit ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₹) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setAmount(value);
                      if (receivedBank <= 0) setCashAmount(value);
                    }}
                    required
                    min="0.01"
                    step="0.01"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
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
              </div>
              {type === "IN" && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-3">
                  <div className="space-y-2">
                    <Label>Payment Mode</Label>
                    <Select value={paymentMode} onValueChange={(value) => setPaymentMode(value as typeof paymentMode)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash_only">Cash Only</SelectItem>
                        <SelectItem value="bank_transfer_only">Bank Transfer Only</SelectItem>
                        <SelectItem value="cash_and_bank">Cash + Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {paymentMode !== "bank_transfer_only" && (
                    <div className="space-y-2">
                      <Label htmlFor="cashAmount">Cash Amount (₹)</Label>
                      <Input
                        id="cashAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashAmount}
                        readOnly={paymentMode === "cash_only"}
                        onChange={(e) => setCashAmount(e.currentTarget.value)}
                      />
                    </div>
                  )}
                  {paymentMode !== "cash_only" && (
                    <div className="space-y-2">
                      <Label htmlFor="bankAmount">Bank Transfer Amount (₹)</Label>
                      <Input
                        id="bankAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={bankAmount}
                        readOnly={paymentMode === "bank_transfer_only"}
                        onChange={(e) => setBankAmount(e.currentTarget.value)}
                      />
                    </div>
                  )}
                {receivedBank > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Receiving Bank Account *</Label>
                      <Select value={bankAccountId} onValueChange={setBankAccountId}>
                        <SelectTrigger><SelectValue placeholder="Select receiving bank" /></SelectTrigger>
                        <SelectContent>
                          {bankAccounts.filter((bank) => bank.is_active).map((bank) => (
                            <SelectItem key={bank.id} value={bank.id}>
                              {bank.bank_name} ({bank.account_no})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="paymentReference">Bank Reference / UTR (Optional)</Label>
                      <Input
                        id="paymentReference"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.currentTarget.value)}
                      />
                    </div>
                  </div>
                )}
                  <div className={`text-sm font-medium ${Math.abs(receivedBreakdownTotal - (parseFloat(amount) || 0)) <= 0.005 ? "text-emerald-400" : "text-rose-400"}`}>
                    Allocated: ₹{receivedBreakdownTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })} / Received: ₹{(parseFloat(amount) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-3.5 rounded-lg border border-primary/30 bg-primary/5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="totalBillAmount" className="text-sm font-semibold">
                    Total Invoice/Bill Amount (₹) *
                  </Label>
                  <Input 
                    id="totalBillAmount" 
                    type="number" 
                    placeholder="e.g. 100000" 
                    value={totalBillAmount}
                    onChange={(e) => setTotalBillAmount(e.currentTarget.value)}
                    required
                    min="0.01"
                    step="0.01"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paidNowAmount" className="text-sm font-semibold">
                    Amount Paid Upfront (₹) *
                  </Label>
                  <Input 
                    id="paidNowAmount" 
                    type="number" 
                    placeholder="0.00 if fully unpaid" 
                    value={paidNowAmount}
                    onChange={(e) => setPaidNowAmount(e.currentTarget.value)}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Dynamic Balance Banner */}
              <div className="flex flex-wrap items-center justify-between p-2.5 rounded bg-background/80 border text-xs gap-2">
                <div>
                  <span className="text-muted-foreground">Remaining Credit Due: </span>
                  <span className="font-bold text-sm text-amber-500">
                    ₹{calcBalanceDue.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`px-2 py-0.5 rounded font-medium ${
                    calcBalanceDue === 0 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : (calcPaid > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400')
                  }`}>
                    {calcBalanceDue === 0 ? 'FULLY PAID' : (calcPaid > 0 ? 'PARTIAL CREDIT' : 'FULL CREDIT')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dueDate" className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Expected Due Date (Optional)
                  </Label>
                  <Input 
                    id="dueDate" 
                    type="date" 
                    value={dueDate}
                    onChange={(e) => setDueDate(e.currentTarget.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
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
              </div>
            </div>
          )}

          {/* Date & Entity Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Transaction Date *</Label>
              <Input 
                id="date" 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.currentTarget.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="entity" className="flex items-center justify-between">
                <span>Entity {isCredit ? <span className="text-rose-400">*</span> : "(Optional)"}</span>
                {isCredit && entityId === "none" && (
                  <span className="text-xs text-rose-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Required for credit
                  </span>
                )}
              </Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger className={isCredit && entityId === "none" ? "border-rose-500" : ""}>
                  <SelectValue placeholder="Select entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- None --</SelectItem>
                  {entities.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({e.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Notes / Bill Reference</Label>
              <Input 
                id="notes" 
                placeholder="e.g. Invoice #2034, Plywood 18mm batch" 
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
              />
            </div>
          </div>

          {/* Custom Fields Section */}
          {customFields.filter(f => f.apply_to === "BOTH" || f.apply_to === type).length > 0 && (
            <div className="pt-3 border-t space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custom Fields</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {customFields.filter(f => f.apply_to === "BOTH" || f.apply_to === type).map(field => (
                  <div key={field.id} className="space-y-1.5">
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
          
          <DialogFooter className="pt-4 border-t flex sm:justify-between items-center gap-2">
            <div className="text-xs text-muted-foreground hidden sm:block">
              {isCredit ? "Will update customer/supplier credit ledger" : "Standard cashflow entry"}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button 
                type="submit" 
                disabled={loading || !isFormValid()} 
                className={type === "IN" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" />
                    Saving...
                  </span>
                ) : (
                  `Save ${type === "IN" ? "Income" : "Expense"}`
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
