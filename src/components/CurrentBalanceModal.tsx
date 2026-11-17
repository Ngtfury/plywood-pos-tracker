// =========================================================================
// PLYWOOD POS & ERP - COMPANY CURRENT BALANCE MANAGEMENT MODAL
// src/components/CurrentBalanceModal.tsx
// Allows viewing, setting, and adding company-wise current cash balance.
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
import { getBusinessEntities } from "@/lib/db/accounting";
import type { BusinessEntity } from "@/lib/db/erp";
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entities, setEntities] = useState<BusinessEntity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [targetEntityId, setTargetEntityId] = useState<string>("ALL");
  const [openingBalance, setOpeningBalance] = useState<number>(0);

  // Mode: "SET_CURRENT" | "ADD_FUNDS"
  const [mode, setMode] = useState<"SET_CURRENT" | "ADD_FUNDS">("SET_CURRENT");
  const [amountInput, setAmountInput] = useState<string>("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Initialize selected entity
  useEffect(() => {
    if (isOpen) {
      setTargetEntityId(selectedEntityId || "ALL");
      setAmountInput("");
      setFeedback(null);
    }
  }, [isOpen, selectedEntityId]);

  // Load companies & transactions data
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    Promise.all([
      getBusinessEntities(),
      getTransactions(),
      getCompanyOpeningBalance(targetEntityId === "ALL" ? null : targetEntityId),
    ])
      .then(([entList, txnList, opBal]) => {
        setEntities(entList);
        setTransactions(txnList);
        setOpeningBalance(opBal);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, targetEntityId, refreshTrigger]);

  // Live balance calculation
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

    const compId = targetEntityId === "ALL" ? null : targetEntityId;

    try {
      if (mode === "SET_CURRENT") {
        await setCompanyDesiredCurrentBalance(val, transactions, compId);
        setFeedback({
          type: "success",
          text: `Current balance for ${activeCompanyName} successfully set to ₹${val.toLocaleString()}!`,
        });
      } else if (mode === "ADD_FUNDS") {
        if (val <= 0) {
          setFeedback({ type: "error", text: "Amount to add must be greater than zero." });
          setSaving(false);
          return;
        }
        await addFundsToCompanyBalance(val, compId);
        setFeedback({
          type: "success",
          text: `Added ₹${val.toLocaleString()} to ${activeCompanyName}!`,
        });
      }

      triggerRefresh();
      // Reload balance baseline
      const refreshedOp = await getCompanyOpeningBalance(compId);
      setOpeningBalance(refreshedOp);
      setAmountInput("");

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Failed to update balance." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] bg-zinc-900/95 border-zinc-800 text-foreground backdrop-blur-2xl">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white">Company Current Balance</DialogTitle>
              <p className="text-xs text-zinc-400 mt-0.5">
                Manage live cash balance by operating entity.
              </p>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <IosSpinner size="md" className="text-emerald-400" />
            <p className="text-xs text-zinc-400 font-medium">Calculating company cash balance...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 py-1">
            {/* 1. Operating Company Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-emerald-400" /> Select Company
                </span>
                <span className="text-[11px] text-zinc-500">Balances tracked per entity</span>
              </Label>
              <Select value={targetEntityId} onValueChange={handleEntityChange}>
                <SelectTrigger className="h-10 bg-zinc-950/60 border-zinc-800 text-xs">
                  <SelectValue placeholder="Choose company" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-xs">
                  <SelectItem value="ALL" className="font-semibold text-emerald-400">
                    All Companies (Consolidated Balance)
                  </SelectItem>
                  {entities.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} {e.entity_type === "branch" ? "(Branch)" : "(Company)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Current Live Balance Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-950 via-zinc-950/90 to-emerald-950/20 border border-emerald-500/20 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                <span>Current Live Balance</span>
                <span className="font-mono text-[11px] text-emerald-400 font-semibold truncate max-w-[200px]">
                  {activeCompanyName}
                </span>
              </div>
              <div
                className={`text-3xl font-black tracking-tight font-mono ${
                  balanceStats.currentBalance >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                ₹{balanceStats.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>

              {/* Breakdown Pills */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/80 text-[11px]">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="flex items-center gap-1 text-emerald-400/90">
                    <ArrowDownLeft className="h-3.5 w-3.5" /> Got Cash (IN):
                  </span>
                  <span className="font-mono font-medium text-zinc-200">
                    ₹{balanceStats.totalCashIn.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="flex items-center gap-1 text-rose-400/90">
                    <ArrowUpRight className="h-3.5 w-3.5" /> Paid Cash (OUT):
                  </span>
                  <span className="font-mono font-medium text-zinc-200">
                    ₹{balanceStats.totalCashOut.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

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
                  ? "Enter Target Current Balance (₹) *"
                  : "Enter Amount to Add to Current Balance (₹) *"}
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
                      ? balanceStats.currentBalance.toString()
                      : "10000"
                  }
                  required
                  className="pl-8 h-10 bg-zinc-950/60 border-zinc-800 text-sm font-mono tracking-wide"
                />
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {mode === "SET_CURRENT"
                  ? "Directly adjusts the company's live cash balance to match physical cash on hand."
                  : "Adds fresh cash funds directly to the active company's running balance."}
              </p>
            </div>

            {/* 5. Feedback Display */}
            {feedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in ${
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
                  "Update Current Balance"
                ) : (
                  "Add to Balance"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
