import { useState, useEffect, useMemo } from "react";
import { useStore } from "@/store";
import { BusinessEntitySelector } from "@/components/erp/BusinessEntitySelector";
import { IosLoadingView } from "@/components/ui/IosSpinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BookOpen, PlusCircle, Trash2, CheckCircle2, AlertCircle, Ban, ChevronDown, ChevronRight
} from "lucide-react";
import type { JournalEntry, Account } from "@/lib/db/erp";
import {
  getJournalEntries,
  insertJournalEntry,
  cancelJournalEntry,
  getAccounts,
} from "@/lib/db/accounting";

interface FormJournalLine {
  id: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  narration: string;
}

function emptyDebitLine(): FormJournalLine {
  return {
    id: `jl_${Date.now()}_1`,
    account_id: "",
    debit_amount: 0,
    credit_amount: 0,
    narration: "",
  };
}

function emptyCreditLine(): FormJournalLine {
  return {
    id: `jl_${Date.now()}_2`,
    account_id: "",
    debit_amount: 0,
    credit_amount: 0,
    narration: "",
  };
}

export function Journal() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  // Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<FormJournalLine[]>([emptyDebitLine(), emptyCreditLine()]);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getJournalEntries({ businessEntityId: selectedEntityId || undefined }),
      getAccounts(),
    ])
      .then(([jList, accList]) => {
        setEntries(jList);
        setAccounts(accList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [selectedEntityId, refreshTrigger]);

  const toggleExpand = (id: string) => {
    setExpandedEntries((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openNewJournal = () => {
    if (!selectedEntityId) {
      alert("Please select an Operating Business Entity from the top header.");
      return;
    }
    setEntryDate(new Date().toISOString().split("T")[0]);
    setReference("");
    setNarration("");
    setLines([emptyDebitLine(), emptyCreditLine()]);
    setDialogOpen(true);
  };

  const updateLine = (id: string, updates: Partial<FormJournalLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `jl_${Date.now()}_${Math.random()}`,
        account_id: "",
        debit_amount: 0,
        credit_amount: 0,
        narration: "",
      },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const totalDebit = useMemo(() => {
    return Math.round(lines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0) * 100) / 100;
  }, [lines]);

  const totalCredit = useMemo(() => {
    return Math.round(lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0) * 100) / 100;
  }, [lines]);

  const isBalanced = useMemo(() => {
    return totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;
  }, [totalDebit, totalCredit]);

  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) return;
    if (!isBalanced) {
      alert(`Journal entry is not balanced! Total Debit (₹${totalDebit}) must equal Total Credit (₹${totalCredit}).`);
      return;
    }
    if (!narration.trim()) {
      alert("Mandatory narration is required.");
      return;
    }
    if (lines.some((l) => !l.account_id)) {
      alert("Please select an account for every journal line.");
      return;
    }

    setSaving(true);
    try {
      await insertJournalEntry({
        business_entity_id: selectedEntityId,
        entry_date: entryDate + "T12:00:00Z",
        reference: reference.trim() || null,
        narration: narration.trim(),
        lines: lines.map((l) => ({
          account_id: l.account_id,
          debit_amount: Number(l.debit_amount) || 0,
          credit_amount: Number(l.credit_amount) || 0,
          narration: l.narration.trim() || undefined,
        })),
      });

      triggerRefresh();
      setDialogOpen(false);
    } catch (err: any) {
      alert("Failed to post journal entry: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (j: JournalEntry) => {
    if (!window.confirm("Are you sure you want to cancel this journal entry?")) return;
    try {
      await cancelJournalEntry(j.id);
      triggerRefresh();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const totalPostedDebit = useMemo(() => {
    return entries.reduce((s, e) => s + (Number(e.total_debit) || 0), 0);
  }, [entries]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">General Journal</h2>
        </div>
        <IosLoadingView text="Loading general journal entries..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">General Journal</h2>
          <p className="text-muted-foreground mt-1">
            Raw material adjustments, transfers, year-end provisions, and double-entry adjustments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <Button onClick={openNewJournal} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <PlusCircle className="h-4 w-4 mr-2" /> New Journal Entry
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Journal Entries</CardTitle>
            <BookOpen className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{entries.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Posted double-entry adjustments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Turnover Debited</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">₹{totalPostedDebit.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Balanced with credit entries</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Balance Enforcement</CardTitle>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">Strict = 0</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Zero-Sum Ledger Rule</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Entries cannot be saved unless Debits match Credits exactly.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Journal Entry Register</CardTitle>
          <CardDescription>Click any row to view its line-by-line debit and credit accounts.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Narration</TableHead>
                <TableHead className="text-right">Debit Total (₹)</TableHead>
                <TableHead className="text-right">Credit Total (₹)</TableHead>
                <TableHead>Balanced</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                    No journal entries recorded. Click "New Journal Entry" to log manual accounting adjustments.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((j) => {
                  const isExpanded = Boolean(expandedEntries[j.id]);
                  return (
                    <>
                      <TableRow
                        key={j.id}
                        className="hover:bg-muted/40 cursor-pointer"
                        onClick={() => toggleExpand(j.id)}
                      >
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{new Date(j.entry_date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{j.reference || "—"}</TableCell>
                        <TableCell className="text-xs font-semibold max-w-[260px] truncate">{j.narration}</TableCell>
                        <TableCell className="text-right font-bold text-xs">
                          ₹{Number(j.total_debit).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs">
                          ₹{Number(j.total_credit).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]">
                            BALANCED
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              j.status === "posted"
                                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                                : "border-zinc-500 text-zinc-400 bg-zinc-800/40 text-[10px]"
                            }
                          >
                            {j.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {j.status === "posted" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(j)}
                              className="h-7 text-xs text-muted-foreground hover:text-rose-400"
                            >
                              <Ban className="h-3.5 w-3.5 mr-1" /> Cancel
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded Sub-table */}
                      {isExpanded && j.lines && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={9} className="p-4">
                            <div className="rounded-lg border border-border/80 bg-background/60 p-3 space-y-2">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Journal Breakdown Lines
                              </h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Account Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Debit (Dr)</TableHead>
                                    <TableHead className="text-right">Credit (Cr)</TableHead>
                                    <TableHead>Line Note</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {j.lines.map((l) => (
                                    <TableRow key={l.id}>
                                      <TableCell className="font-semibold text-xs">{l.account_name || l.account_id}</TableCell>
                                      <TableCell className="text-xs text-muted-foreground capitalize">{l.account_type}</TableCell>
                                      <TableCell className="text-right text-xs font-mono font-bold text-blue-400">
                                        {Number(l.debit_amount) > 0 ? `₹${Number(l.debit_amount).toLocaleString()}` : "—"}
                                      </TableCell>
                                      <TableCell className="text-right text-xs font-mono font-bold text-purple-400">
                                        {Number(l.credit_amount) > 0 ? `₹${Number(l.credit_amount).toLocaleString()}` : "—"}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">{l.narration || "—"}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Journal Entry Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSaveJournal}>
            <DialogHeader>
              <DialogTitle>Post General Journal Entry</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Entry Date *</Label>
                  <Input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reference # (Optional)</Label>
                  <Input
                    placeholder="e.g. ADJ-001, JV/2026/04"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Mandatory Narration *</Label>
                <Input
                  placeholder="e.g. Raw material transfer from timber to veneer clearing account"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  required
                  className="h-8 text-xs"
                />
              </div>

              {/* Journal Lines */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Debit &amp; Credit Ledger Lines
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={addLine} className="h-7 text-xs">
                    <PlusCircle className="h-3.5 w-3.5 mr-1" /> Add Line
                  </Button>
                </div>

                <div className="space-y-2">
                  {lines.map((l) => (
                    <div
                      key={l.id}
                      className="p-2.5 rounded-lg border border-border/80 bg-muted/30 grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-5 space-y-1">
                        <Label className="text-[10px]">Account *</Label>
                        <Select
                          value={l.account_id}
                          onValueChange={(val) => updateLine(l.id, { account_id: val })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select Account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                {acc.name} ({acc.account_type})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Debit (₹)</Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={l.debit_amount || ""}
                          onChange={(e) =>
                            updateLine(l.id, {
                              debit_amount: parseFloat(e.target.value) || 0,
                              credit_amount: 0,
                            })
                          }
                          min="0"
                          step="0.01"
                          className="h-8 text-xs font-bold text-blue-400"
                        />
                      </div>

                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Credit (₹)</Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={l.credit_amount || ""}
                          onChange={(e) =>
                            updateLine(l.id, {
                              credit_amount: parseFloat(e.target.value) || 0,
                              debit_amount: 0,
                            })
                          }
                          min="0"
                          step="0.01"
                          className="h-8 text-xs font-bold text-purple-400"
                        />
                      </div>

                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(l.id)}
                          disabled={lines.length <= 2}
                          className="h-8 w-8 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Running Balance Banner */}
              <div className="p-3 rounded-lg border bg-background flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">Total Debit: </span>
                  <span className="font-bold text-blue-400">₹{totalDebit.toLocaleString()}</span>
                  <span className="mx-2 text-muted-foreground">•</span>
                  <span className="text-muted-foreground">Total Credit: </span>
                  <span className="font-bold text-purple-400">₹{totalCredit.toLocaleString()}</span>
                </div>
                <div>
                  {isBalanced ? (
                    <Badge variant="outline" className="border-emerald-500 text-emerald-400 bg-emerald-500/10">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> BALANCED
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-rose-500 text-rose-400 bg-rose-500/10">
                      <AlertCircle className="h-3 w-3 mr-1" /> UNBALANCED (Diff: ₹{Math.abs(totalDebit - totalCredit).toLocaleString()})
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !isBalanced || !narration.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {saving ? "Posting..." : "Confirm & Post Journal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
