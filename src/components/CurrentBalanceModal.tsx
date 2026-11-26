// =========================================================================
// PLYWOOD POS & ERP - CASH IN HAND & BANK BALANCE MANAGEMENT MODAL
// src/components/CurrentBalanceModal.tsx
// Separates Cash-in-Hand (physical cash) from per-Bank Account balances,
// allowing viewing, setting, adding, and updating both independently.
// =========================================================================

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Wallet,
  Building2,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useStore } from "@/store";
import {
  getTransactions,
  Transaction,
  getCompanyOpeningBalance,
  calculateCompanyCurrentBalance,
  setCompanyDesiredCurrentBalance,
  addFundsToCompanyBalance,
} from "@/lib/db/queries";
import {
  getBusinessEntities,
  getBankAccounts,
  getBankAccountBalanceBreakdown,
  setBankAccountDesiredCurrentBalance,
  addFundsToBankAccountBalance,
} from "@/lib/db/accounting";
import type { BusinessEntity, BankAccount } from "@/lib/db/erp";
import { IosSpinner } from "@/components/ui/IosSpinner";

interface CurrentBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CurrentBalanceModal({ isOpen, onClose }: CurrentBalanceModalProps) {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const setSelectedEntityId = useStore((s) => s.setSelectedBusinessEntityId);
  const triggerRefresh = useStore((s) => s.triggerRefresh);
  const refreshTrigger = useStore((s) => s.refreshTrigger);

  const [balanceScope, setBalanceScope] = useState<"CASH" | "BANK">("CASH");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [targetEntityId, setTargetEntityId] = useState<string>("ALL");
  const [openingBalance, setOpeningBalance] = useState<number>(0);

  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [targetBankId, setTargetBankId] = useState<string>("");
  const [bankBreakdown, setBankBreakdown] = useState({
    openingBalance: 0,
    bankInflow: 0,
    bankOutflow: 0,
    currentBalance: 0,
  });

  // Action Mode: "SET_CURRENT" | "ADD_FUNDS"
  const [mode, setMode] = useState<"SET_CURRENT" | "ADD_FUNDS">("SET_CURRENT");
  const [amountInput, setAmountInput] = useState<string>("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTargetEntityId(selectedEntityId || "ALL");
      setAmountInput("");
      setFeedback(null);
    }
  }, [isOpen, selectedEntityId]);

  // Load companies, transactions, and bank accounts
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    Promise.all([
      getBusinessEntities(),
      getTransactions(),
      getCompanyOpeningBalance(targetEntityId === "ALL" ? null : targetEntityId),
      getBankAccounts(targetEntityId === "ALL" ? undefined : targetEntityId),
    ])
      .then(([entList, txnList, opBal, bList]) => {
        setEntities(entList);
        setTransactions(txnList);
        setOpeningBalance(opBal);
        setBankAccounts(bList);
        if (bList.length > 0 && (!targetBankId || !bList.some((b) => b.id === targetBankId))) {
          setTargetBankId(bList[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, targetEntityId, refreshTrigger]);

  // Load selected bank account breakdown
  useEffect(() => {
    if (!isOpen || !targetBankId) return;
    getBankAccountBalanceBreakdown(targetBankId)
      .then(setBankBreakdown)
      .catch(console.error);
  }, [isOpen, targetBankId, refreshTrigger]);

  const balanceStats = useMemo(() => {
    return calculateCompanyCurrentBalance(
      transactions,
      openingBalance,
      targetEntityId === "ALL" ? null : targetEntityId
    );
  }, [transactions, openingBalance, targetEntityId]);

  const activeCompanyName = useMemo(() => {
    if (targetEntityId === "ALL") return "All Companies / Global";
    return entities.find((e) => e.id === targetEntityId)?.name || "Selected Company";
  }, [entities, targetEntityId]);

  const activeBank = useMemo(
    () => bankAccounts.find((b) => b.id === targetBankId) || null,
    [bankAccounts, targetBankId]
  );

  const handleEntityChange = async (val: string) => {
    setTargetEntityId(val);
    setAmountInput("");
    setFeedback(null);
    if (val !== "ALL") {
      setSelectedEntityId(val);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountInput);
    if (isNaN(val)) {
      setFeedback({ type: "error", text: "Please enter a valid numeric amount." });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      if (balanceScope === "CASH") {
        const compId = targetEntityId === "ALL" ? null : targetEntityId;
        if (mode === "SET_CURRENT") {
          await setCompanyDesiredCurrentBalance(val, transactions, compId);
          setFeedback({
            type: "success",
            text: `Cash in Hand for ${activeCompanyName} updated to ₹${val.toLocaleString()}!`,
          });
        } else {
          if (val <= 0) {
            setFeedback({ type: "error", text: "Amount to add must be greater than zero." });
            setSaving(false);
            return;
          }
          await addFundsToCompanyBalance(val, compId);
          setFeedback({
            type: "success",
            text: `Added ₹${val.toLocaleString()} to Cash in Hand (${activeCompanyName})!`,
          });
        }
        const refreshedOp = await getCompanyOpeningBalance(compId);
        setOpeningBalance(refreshedOp);
      } else {
        if (!targetBankId || !activeBank) {
          setFeedback({ type: "error", text: "Please select a bank account first." });
          setSaving(false);
          return;
        }
        if (mode === "SET_CURRENT") {
          const updated = await setBankAccountDesiredCurrentBalance(targetBankId, val);
          setFeedback({
            type: "success",
            text: `${activeBank.bank_name} balance set to ₹${updated.toLocaleString()}!`,
          });
        } else {
          if (val <= 0) {
            setFeedback({ type: "error", text: "Amount to add must be greater than zero." });
            setSaving(false);
            return;
          }
          const updated = await addFundsToBankAccountBalance(targetBankId, val);
          setFeedback({
            type: "success",
            text: `Added ₹${val.toLocaleString()} to ${activeBank.bank_name} (New Bal: ₹${updated.toLocaleString()})!`,
          });
        }
        setBankBreakdown(await getBankAccountBalanceBreakdown(targetBankId));
      }

      triggerRefresh();
      setAmountInput("");
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Failed to update balance." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px] bg-zinc-900/95 border-zinc-800 text-foreground backdrop-blur-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              {balanceScope === "CASH" ? <Wallet className="h-5 w-5" /> : <Landmark className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white">
                {balanceScope === "CASH" ? "Cash in Hand Balance" : "Bank Account Balances"}
              </DialogTitle>
              <p className="text-xs text-zinc-400 mt-0.5">
                Cash in Hand updates from Cash entries; Bank Balances track each bank separately.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Top Switcher: Cash in Hand vs Bank Balances */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-950/90 border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              setBalanceScope("CASH");
              setAmountInput("");
              setFeedback(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              balanceScope === "CASH"
                ? "bg-emerald-600 text-white shadow-sm font-semibold"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            }`}
          >
            <Wallet className="h-3.5 w-3.5" />
            Cash in Hand
          </button>
          <button
            type="button"
            onClick={() => {
              setBalanceScope("BANK");
              setAmountInput("");
              setFeedback(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              balanceScope === "BANK"
                ? "bg-blue-600 text-white shadow-sm font-semibold"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
            }`}
          >
            <Landmark className="h-3.5 w-3.5" />
            Bank Balances ({bankAccounts.length})
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <IosSpinner size="md" className="text-emerald-400" />
            <p className="text-xs text-zinc-400 font-medium">Calculating live balances...</p>
          </div>
        ) : balanceScope === "BANK" && bankAccounts.length === 0 ? (
          <div className="py-10 text-center space-y-2 text-xs text-zinc-400">
            <Landmark className="h-8 w-8 mx-auto text-zinc-500" />
            <p className="font-semibold text-zinc-200">No Bank Accounts Added Yet</p>
            <p>Add a commercial bank account in Bank Reconciliation or Masters Setup to manage its balance here.</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 py-1">
            {balanceScope === "CASH" ? (
              <>
                {/* 1. Operating Company Selection */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-emerald-400" /> Select Company
                    </span>
                    <span className="text-[11px] text-zinc-500">Excludes bank statement imports</span>
                  </Label>
                  <Select value={targetEntityId} onValueChange={handleEntityChange}>
                    <SelectTrigger className="h-10 bg-zinc-950/60 border-zinc-800 text-xs">
                      <SelectValue placeholder="Choose company" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-xs">
                      <SelectItem value="ALL" className="font-semibold text-emerald-400">
                        All Companies (Consolidated Cash)
                      </SelectItem>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} {e.entity_type === "branch" ? "(Branch)" : "(Company)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Live Cash in Hand Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-950 via-zinc-950/90 to-emerald-950/20 border border-emerald-500/20 shadow-lg">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Cash in Hand (Live Balance)</span>
                    <span className="font-mono text-[11px] text-emerald-400 font-semibold truncate max-w-[200px]">
                      {activeCompanyName}
                    </span>
                  </div>
                  <div
                    className={`text-3xl font-black tracking-tight font-mono ${
                      balanceStats.currentBalance >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    ₹{balanceStats.currentBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/80 text-[11px]">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="flex items-center gap-1 text-emerald-400/90">
                        <ArrowDownLeft className="h-3.5 w-3.5" /> Physical Cash (IN):
                      </span>
                      <span className="font-mono font-medium text-zinc-200">
                        ₹{balanceStats.totalCashIn.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="flex items-center gap-1 text-rose-400/90">
                        <ArrowUpRight className="h-3.5 w-3.5" /> Physical Cash (OUT):
                      </span>
                      <span className="font-mono font-medium text-zinc-200">
                        ₹{balanceStats.totalCashOut.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* 1. Bank Account Selection */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Landmark className="h-3.5 w-3.5 text-blue-400" /> Select Bank Account
                    </span>
                    <span className="text-[11px] text-zinc-500">Tracked per bank independently</span>
                  </Label>
                  <Select
                    value={targetBankId}
                    onValueChange={(v) => {
                      setTargetBankId(v);
                      setAmountInput("");
                      setFeedback(null);
                    }}
                  >
                    <SelectTrigger className="h-10 bg-zinc-950/60 border-zinc-800 text-xs">
                      <SelectValue placeholder="Choose bank account" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-xs">
                      {bankAccounts.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.bank_name} • {b.account_no} (₹{Number(b.current_balance || 0).toLocaleString()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. Live Bank Balance Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-950 via-zinc-950/90 to-blue-950/20 border border-blue-500/20 shadow-lg">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>Bank Live Balance</span>
                    <span className="font-mono text-[11px] text-blue-400 font-semibold truncate max-w-[200px]">
                      {activeBank?.bank_name} ({activeBank?.account_no})
                    </span>
                  </div>
                  <div
                    className={`text-3xl font-black tracking-tight font-mono ${
                      bankBreakdown.currentBalance >= 0 ? "text-blue-400" : "text-rose-400"
                    }`}
                  >
                    ₹{bankBreakdown.currentBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/80 text-[11px]">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="flex items-center gap-1 text-emerald-400/90">
                        <ArrowDownLeft className="h-3.5 w-3.5" /> Bank Credits (IN):
                      </span>
                      <span className="font-mono font-medium text-zinc-200">
                        ₹{bankBreakdown.bankInflow.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="flex items-center gap-1 text-rose-400/90">
                        <ArrowUpRight className="h-3.5 w-3.5" /> Bank Debits (OUT):
                      </span>
                      <span className="font-mono font-medium text-zinc-200">
                        ₹{bankBreakdown.bankOutflow.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 3. Action Mode Tabs */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Choose Action</Label>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode("SET_CURRENT");
                    setFeedback(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    mode === "SET_CURRENT"
                      ? "bg-emerald-600 text-white shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                  }`}
                >
                  Set Current Balance
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("ADD_FUNDS");
                    setFeedback(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    mode === "ADD_FUNDS"
                      ? "bg-emerald-600 text-white shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                  }`}
                >
                  Add Balance
                </button>
              </div>
            </div>

            {/* 4. Amount Input */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">
                {mode === "SET_CURRENT"
                  ? `Enter Target ${balanceScope === "CASH" ? "Cash" : "Bank"} Balance (₹) *`
                  : `Enter Amount to Add to ${balanceScope === "CASH" ? "Cash" : "Bank"} (₹) *`}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 font-mono">
                  ₹
                </span>
                <Input
                  type="number"
                  step="any"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder={
                    mode === "SET_CURRENT"
                      ? String(balanceScope === "CASH" ? balanceStats.currentBalance : bankBreakdown.currentBalance)
                      : "10000"
                  }
                  required
                  className="pl-8 h-10 bg-zinc-950/60 border-zinc-800 text-sm font-mono tracking-wide"
                />
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {balanceScope === "CASH"
                  ? mode === "SET_CURRENT"
                    ? "Directly sets physical Cash in Hand to match actual cash available."
                    : "Adds physical cash capital directly to Cash in Hand."
                  : mode === "SET_CURRENT"
                  ? "Directly sets the selected bank account's available balance without affecting Cash in Hand."
                  : "Adds funds directly to the selected bank account without affecting Cash in Hand."}
              </p>
            </div>

            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  feedback.type === "success"
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                }`}
              >
                {feedback.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="h-10 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300"
              >
                Close
              </Button>
              <Button
                type="submit"
                disabled={saving || !amountInput}
                className="h-10 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 cursor-pointer"
              >
                {saving ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" />
                    Updating...
                  </span>
                ) : mode === "SET_CURRENT" ? (
                  `Update ${balanceScope === "CASH" ? "Cash" : "Bank"} Balance`
                ) : (
                  `Add to ${balanceScope === "CASH" ? "Cash" : "Bank"}`
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
