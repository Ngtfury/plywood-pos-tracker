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
import { 
  getCategories, 
  getEntities, 
  addTransaction, 
  updateTransaction, 
  getCustomFields, 
  getTransactions,
  getCompanyOpeningBalance,
  calculateCompanyCurrentBalance,
  Category, 
  Entity, 
  CustomFieldDef, 
  Transaction 
} from "@/lib/db/queries";
import { getBankAccounts } from "@/lib/db/accounting";
import type { BankAccount } from "@/lib/db/erp";
import { useStore } from "@/store";
import { CreditCard, Calendar, AlertCircle, Wallet } from "lucide-react";
import { IosSpinner } from "@/components/ui/IosSpinner";

interface QuickEntryModalProps {
  type: "IN" | "OUT";
  isOpen: boolean;
  onClose: () => void;
  initialTransaction?: Transaction | null;
}

export function QuickEntryModal({ type, isOpen, onClose, initialTransaction = null }: QuickEntryModalProps) {
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
  const [validationError, setValidationError] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash_only" | "bank_transfer_only" | "cash_and_bank">("cash_only");

  const [categories, setCategories] = useState<Category[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(false);
  
  const triggerRefresh = useStore(s => s.triggerRefresh);
  const refreshTrigger = useStore(s => s.refreshTrigger);
  const selectedEntityId = useStore(s => s.selectedBusinessEntityId);
  const [currentCompanyBalance, setCurrentCompanyBalance] = useState<number>(0);

  useEffect(() => {
    getCategories(type).then(setCategories).catch(console.error);
    getEntities().then(setEntities).catch(console.error);
    getCustomFields().then(setCustomFields).catch(console.error);
    getBankAccounts().then(setBankAccounts).catch(console.error);
  }, [type, refreshTrigger]);

  // Load active company's live current balance
  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      getTransactions(),
      getCompanyOpeningBalance(selectedEntityId),
    ])
      .then(([txns, opBal]) => {
        const bal = calculateCompanyCurrentBalance(txns, opBal, selectedEntityId);
        setCurrentCompanyBalance(bal.currentBalance);
      })
      .catch(console.error);
  }, [isOpen, selectedEntityId, refreshTrigger]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const payment = initialTransaction?.custom_data || {};
      const initialAmount = initialTransaction ? String(initialTransaction.amount) : "";
      setAmount(initialAmount);
      setCategoryId(initialTransaction?.category_id || "");
      setEntityId(initialTransaction?.entity_id || "none");
      setDate(initialTransaction?.date ? initialTransaction.date.slice(0, 10) : new Date().toISOString().split('T')[0]);
      setNotes(initialTransaction?.notes || "");
      setCustomData(initialTransaction?.custom_data || {});
      setIsCredit(false);
      setTotalBillAmount("");
      setPaidNowAmount("");
      setDueDate("");
      setCashAmount(initialTransaction ? String(payment.cash_amount ?? initialTransaction.amount) : "");
      setBankAmount(initialTransaction ? String(payment.bank_amount ?? 0) : "");
      setBankAccountId(payment.bank_account_id || "");
      setPaymentReference(payment.payment_reference || initialTransaction?.reference || "");
      setValidationError("");
      if (initialTransaction) {
        setPaymentMode(payment.payment_method || (Number(payment.bank_amount) > 0 ? "bank_transfer_only" : "cash_only"));
        setIsCredit((initialTransaction.balance_due || 0) > 0);
        setTotalBillAmount(String(initialTransaction.total_amount ?? initialTransaction.amount));
        setPaidNowAmount(String(initialTransaction.paid_amount ?? initialTransaction.amount));
        setDueDate(initialTransaction.due_date ? initialTransaction.due_date.slice(0, 10) : "");
      } else {
        setPaymentMode("cash_only");
      }
    }
  }, [isOpen, type, refreshTrigger, initialTransaction]);

  useEffect(() => {
    if (isCredit) return;
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
  const selectedBankAccount = bankAccounts.find((bank) => bank.id === bankAccountId);

  // Live balance calculation
  const actualCashFlow = isCredit ? (parseFloat(paidNowAmount) || 0) : (parseFloat(amount) || 0);
  const projectedBalance = type === "IN"
    ? currentCompanyBalance + actualCashFlow
    : currentCompanyBalance - actualCashFlow;

  const handleBankAccountChange = async (id: string) => {
    setBankAccountId(id);
    try {
      setBankAccounts(await getBankAccounts());
    } catch (error) {
      console.error("Failed to refresh bank account balance", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");
    if (!categoryId) {
      setValidationError("Select a category.");
      return;
    }
    if (!isCredit && (!amount || parseFloat(amount) <= 0)) {
      setValidationError("Amount must be greater than zero.");
      return;
    }
    if (isCredit && (!totalBillAmount || entityId === "none")) {
      setValidationError("Enter the bill amount and select an entity.");
      return;
    }
    if (!isCredit) {
      if (Math.abs(receivedBreakdownTotal - (parseFloat(amount) || 0)) > 0.005) {
        alert("Cash Amount and Bank Transfer Amount must equal Total Amount Received.");
        return;
      }
      if (receivedBank > 0 && !bankAccountId) {
        setValidationError(`Select the ${type === "IN" ? "receiving" : "paying"} bank account for the bank transfer.`);
        return;
      }
      if (type === "OUT" && receivedBank > Number(selectedBankAccount?.current_balance || 0)) {
        setValidationError("Expense exceeds the selected bank account's available balance.");
        return;
      }
    }
    
    setLoading(true);
    try {
      if (isCredit) {
        const total = parseFloat(totalBillAmount) || 0;
        const paid = parseFloat(paidNowAmount) || 0;
        const balance = Math.max(0, total - paid);
        const status: 'PAID' | 'PARTIAL' | 'UNPAID' = balance <= 0 ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID');

        const transaction = {
          id: initialTransaction?.id,
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
          business_entity_id: selectedEntityId || initialTransaction?.business_entity_id || null,
          product_id: null,
          quantity: null,
          description: null,
          notes,
          custom_data: customData,
        };
        if (initialTransaction) {
          await updateTransaction({ ...initialTransaction, ...transaction } as Transaction);
        } else {
          await addTransaction(transaction);
        }
      } else {
        const amt = parseFloat(amount) || 0;
        const transaction = {
          id: initialTransaction?.id,
          type,
          amount: amt,
          total_amount: amt,
          paid_amount: amt,
          balance_due: 0,
          credit_status: 'PAID' as const,
          due_date: null,
          date: date + "T12:00:00Z",
          category_id: categoryId,
          entity_id: entityId === "none" ? null : entityId,
          business_entity_id: selectedEntityId || initialTransaction?.business_entity_id || null,
          product_id: null,
          quantity: null,
          description: null,
          notes,
          custom_data: {
            ...customData,
            payment_method: paymentMode,
            cash_amount: receivedCash,
            bank_amount: receivedBank,
            bank_account_id: receivedBank > 0 ? bankAccountId : null,
            payment_reference: paymentReference || null,
          }
        };
        if (initialTransaction) {
          await updateTransaction({ ...initialTransaction, ...transaction } as Transaction);
        } else {
          await addTransaction(transaction);
        }
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
            <span>{initialTransaction ? "Edit" : "Quick"} {type === "IN" ? "Income" : "Expense"}</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-muted font-normal text-muted-foreground">
              {type === "IN" ? "Sales / Cash Receipt" : "Purchase / Bill Payment"}
            </span>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          
          {/* Live Company Current Balance Indicator */}
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-border/80 bg-muted/30 text-xs">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground font-medium">Company Balance:</span>
              <span
                className={`font-mono font-bold ${
                  currentCompanyBalance >= 0 ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                ₹{currentCompanyBalance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>
            {actualCashFlow > 0 && (
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className={type === "IN" ? "text-emerald-500 font-semibold" : "text-rose-500 font-semibold"}>
                  {type === "IN" ? "+" : "-"}₹{actualCashFlow.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className={`font-bold ${projectedBalance >= 0 ? "text-foreground" : "text-rose-500"}`}>
                  ₹{projectedBalance.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
          </div>

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
              {!isCredit && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-3">
                  <div className="space-y-2">
                    <Label>{type === "IN" ? "Receipt Mode" : "Payment Mode"}</Label>
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
                      <Label htmlFor="cashAmount">{type === "IN" ? "Cash Amount (₹)" : "Cash Paid (₹)"}</Label>
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
                      <Label htmlFor="bankAmount">{type === "IN" ? "Bank Transfer Amount (₹)" : "Bank Paid (₹)"}</Label>
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
                      <Label>{type === "IN" ? "Deposit Bank Account *" : "Bank Account *"}</Label>
                      <Select value={bankAccountId} onValueChange={handleBankAccountChange}>
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${type === "IN" ? "receiving" : "paying"} bank`} />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccounts.filter((bank) => bank.is_active).map((bank) => (
                            <SelectItem key={bank.id} value={bank.id}>
                              {bank.bank_name} ({bank.account_no})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {bankAccountId && (
                      <div className="rounded-md border bg-background/70 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Available Balance</span>
                          <span className="font-semibold">
                            ₹{Number(selectedBankAccount?.current_balance || 0)
                              .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        {type === "OUT" && (
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-muted-foreground">Balance After Expense</span>
                            <span className="font-semibold text-emerald-400">
                              ₹{(Number(selectedBankAccount?.current_balance || 0) - receivedBank)
                                .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {validationError && <p className="text-sm text-rose-400">{validationError}</p>}
                      </div>
                    )}
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
