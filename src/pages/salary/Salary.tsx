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
  UserCheck, PlusCircle, CreditCard, ShieldCheck,
} from "lucide-react";
import type { SalaryRecord, Employee, Partner, BankAccount } from "@/lib/db/erp";
import {
  getSalaryRecords,
  bookSalary,
  paySalary,
  getEmployees,
  getPartners,
  getBankAccounts,
} from "@/lib/db/accounting";

export function Salary() {
  const selectedEntityId = useStore((s) => s.selectedBusinessEntityId);
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Filter
  const [filterType, setFilterType] = useState<"ALL" | "employee" | "partner">("ALL");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Booking Modal
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [bookSubmitting, setBookSubmitting] = useState(false);
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [salaryMonth, setSalaryMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [payeeType, setPayeeType] = useState<"employee" | "partner">("employee");
  const [payeeId, setPayeeId] = useState("");
  const [bookedAmount, setBookedAmount] = useState("");
  const [narration, setNarration] = useState("");

  // Payment Modal
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [activeRecord, setActiveRecord] = useState<SalaryRecord | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "bank" | "upi">("bank");
  const [payBankId, setPayBankId] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [payRef, setPayRef] = useState("");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getSalaryRecords({
        businessEntityId: selectedEntityId || undefined,
        salaryMonth: selectedMonth || undefined,
      }),
      getEmployees(),
      getPartners(),
      getBankAccounts(selectedEntityId || undefined),
    ])
      .then(([recList, empList, ptrList, bankList]) => {
        setRecords(recList);
        setEmployees(empList);
        setPartners(ptrList);
        setBankAccounts(bankList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [selectedEntityId, selectedMonth, refreshTrigger]);

  const handleOpenBook = () => {
    if (!selectedEntityId) {
      alert("Please select an Operating Business Entity from the top header.");
      return;
    }
    setVoucherDate(new Date().toISOString().split("T")[0]);
    setSalaryMonth(selectedMonth);
    setPayeeType("employee");
    setPayeeId(employees[0]?.id || "");
    setBookedAmount(employees[0]?.monthly_salary ? employees[0].monthly_salary.toString() : "");
    setNarration("");
    setBookDialogOpen(true);
  };

  const handlePayeeTypeChange = (val: "employee" | "partner") => {
    setPayeeType(val);
    if (val === "employee") {
      const first = employees[0];
      setPayeeId(first?.id || "");
      setBookedAmount(first?.monthly_salary ? first.monthly_salary.toString() : "");
    } else {
      const first = partners[0];
      setPayeeId(first?.id || "");
      setBookedAmount("");
    }
  };

  const handlePayeeSelect = (id: string) => {
    setPayeeId(id);
    if (payeeType === "employee") {
      const emp = employees.find((e) => e.id === id);
      if (emp?.monthly_salary) {
        setBookedAmount(emp.monthly_salary.toString());
      }
    }
  };

  const handleBookSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) return;
    const amountNum = parseFloat(bookedAmount);
    if (!payeeId || !amountNum || amountNum <= 0) {
      alert("Please choose a valid payee and salary amount.");
      return;
    }

    setBookSubmitting(true);
    try {
      let payeeName = "Staff";
      if (payeeType === "employee") {
        payeeName = employees.find((e) => e.id === payeeId)?.name || "Employee";
      } else {
        payeeName = partners.find((p) => p.id === payeeId)?.name || "Partner";
      }

      await bookSalary({
        business_entity_id: selectedEntityId,
        voucher_date: voucherDate + "T12:00:00Z",
        salary_month: salaryMonth,
        payee_type: payeeType,
        employee_id: payeeType === "employee" ? payeeId : null,
        partner_id: payeeType === "partner" ? payeeId : null,
        payee_name: payeeName,
        booked_amount: amountNum,
        expense_account_id: payeeType === "employee" ? "acc_salary_expense" : "acc_partner_remun",
        payable_account_id: payeeType === "employee" ? "acc_salary_payable" : "acc_partner_payable",
        narration: narration || `Salary accrued for ${payeeName} (${salaryMonth})`,
      });

      triggerRefresh();
      setBookDialogOpen(false);
    } catch (err: any) {
      alert("Error booking salary: " + (err.message || err));
    } finally {
      setBookSubmitting(false);
    }
  };

  const handleOpenPay = (rec: SalaryRecord) => {
    setActiveRecord(rec);
    setPayAmount(rec.pending_amount.toString());
    setPayMethod("bank");
    setPayBankId(bankAccounts[0]?.id || "");
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayRef("");
    setPayDialogOpen(true);
  };

  const handlePaySalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecord) return;
    const pAmt = parseFloat(payAmount);
    if (!pAmt || pAmt <= 0) {
      alert("Please specify a valid payment amount.");
      return;
    }
    if (pAmt > activeRecord.pending_amount) {
      alert(`Amount exceeds pending salary balance (₹${activeRecord.pending_amount}).`);
      return;
    }

    setPaySubmitting(true);
    try {
      await paySalary({
        salary_record_id: activeRecord.id,
        pay_amount: pAmt,
        payment_method: payMethod,
        bank_account_id: payMethod !== "cash" ? payBankId || null : null,
        payment_reference: payRef || null,
        payment_date: payDate + "T12:00:00Z",
        cash_account_id: payMethod === "cash" ? "acc_cash" : "acc_bank",
      });

      triggerRefresh();
      setPayDialogOpen(false);
    } catch (err: any) {
      alert("Error processing payment: " + (err.message || err));
    } finally {
      setPaySubmitting(false);
    }
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (filterType !== "ALL" && r.payee_type !== filterType) return false;
      return true;
    });
  }, [records, filterType]);

  // Aggregate stats
  const totalBooked = useMemo(() => records.reduce((s, r) => s + (Number(r.booked_amount) || 0), 0), [records]);
  const totalPaid = useMemo(() => records.reduce((s, r) => s + (Number(r.paid_amount) || 0), 0), [records]);
  const totalPending = useMemo(() => records.reduce((s, r) => s + (Number(r.pending_amount) || 0), 0), [records]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Salary &amp; Remuneration Journal</h2>
        </div>
        <IosLoadingView text="Loading salary register..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Salary &amp; Remuneration Journal</h2>
          <p className="text-muted-foreground mt-1">
            Book monthly salaries and record subsequent disbursements without double-expensing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BusinessEntitySelector />
          <Button onClick={handleOpenBook} className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer">
            <PlusCircle className="h-4 w-4 mr-2" /> Book Salary / Accrual
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Salary Booked (Expense)</CardTitle>
            <UserCheck className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">₹{totalBooked.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Single P&amp;L expense charge</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disbursed (Paid Out)</CardTitle>
            <CreditCard className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">₹{totalPaid.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Reduces payable liability</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payable Balance</CardTitle>
            <span className="text-xs font-semibold text-amber-400">Owed</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">₹{totalPending.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting employee disbursement</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Accounting Integrity</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Strict Double-Entry</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Accrual: Dr Salary Exp / Cr Payable. Payment: Dr Payable / Cr Cash.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Tab controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border">
          <Button
            size="sm"
            variant={filterType === "ALL" ? "default" : "ghost"}
            onClick={() => setFilterType("ALL")}
            className="h-7 text-xs"
          >
            All Payees
          </Button>
          <Button
            size="sm"
            variant={filterType === "employee" ? "default" : "ghost"}
            onClick={() => setFilterType("employee")}
            className="h-7 text-xs"
          >
            Employees Only
          </Button>
          <Button
            size="sm"
            variant={filterType === "partner" ? "default" : "ghost"}
            onClick={() => setFilterType("partner")}
            className="h-7 text-xs"
          >
            Partners Only
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Month:</Label>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-8 text-xs w-40"
          />
        </div>
      </div>

      {/* Salary Register Table */}
      <Card>
        <CardHeader>
          <CardTitle>Salary Register &amp; Ledger ({selectedMonth})</CardTitle>
          <CardDescription>Individual payees, accrued amounts, payments, and balances.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher Date</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Payee Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Booked (₹)</TableHead>
                <TableHead className="text-right">Paid (₹)</TableHead>
                <TableHead className="text-right">Pending (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                    No salary records logged for {selectedMonth}. Click "Book Salary / Accrual" to add payroll.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.voucher_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{r.salary_month}</TableCell>
                    <TableCell className="font-semibold text-xs">{r.payee_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          r.payee_type === "employee"
                            ? "border-blue-500/40 text-blue-400 bg-blue-500/10 text-[10px]"
                            : "border-purple-500/40 text-purple-400 bg-purple-500/10 text-[10px]"
                        }
                      >
                        {r.payee_type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-xs">
                      ₹{Number(r.booked_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-emerald-400">
                      ₹{Number(r.paid_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-amber-400">
                      ₹{Number(r.pending_amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          r.status === "paid"
                            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]"
                            : r.status === "partial"
                            ? "border-blue-500/40 text-blue-400 bg-blue-500/10 text-[10px]"
                            : "border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]"
                        }
                      >
                        {r.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(r.pending_amount) > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPay(r)}
                          className="h-7 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                        >
                          <CreditCard className="h-3 w-3 mr-1" /> Pay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Book Salary Modal */}
      <Dialog open={bookDialogOpen} onOpenChange={setBookDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleBookSalarySubmit}>
            <DialogHeader>
              <DialogTitle>Book / Accrue Salary (Expense Recognition)</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Voucher Date *</Label>
                  <Input
                    type="date"
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Salary Month *</Label>
                  <Input
                    type="month"
                    value={salaryMonth}
                    onChange={(e) => setSalaryMonth(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payee Type *</Label>
                  <Select value={payeeType} onValueChange={(v: any) => handlePayeeTypeChange(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee / Staff</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Select Individual *</Label>
                  <Select value={payeeId} onValueChange={handlePayeeSelect}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select Payee" />
                    </SelectTrigger>
                    <SelectContent>
                      {payeeType === "employee"
                        ? employees.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name} ({e.designation || "Staff"})
                            </SelectItem>
                          ))
                        : partners.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} (Partner)
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Salary Amount (₹) *</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={bookedAmount}
                  onChange={(e) => setBookedAmount(e.target.value)}
                  required
                  min="1"
                  step="0.01"
                  className="h-8 text-xs font-bold text-blue-400"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Narration</Label>
                <Input
                  placeholder="e.g. October monthly salary"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="p-2.5 rounded bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
                Accounting: Dr {payeeType === "employee" ? "Salary Expense" : "Partner Remuneration"} / Cr {payeeType === "employee" ? "Salary Payable" : "Partner Payable"}.
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBookDialogOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={bookSubmitting || parseFloat(bookedAmount) <= 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {bookSubmitting ? "Accruing..." : "Book Salary"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disburse Salary Payment Modal */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handlePaySalarySubmit}>
            <DialogHeader>
              <DialogTitle>Disburse Salary Payment</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              <div className="p-3 rounded-lg border bg-muted/40 space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Payee:</span>
                  <span>{activeRecord?.payee_name}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Month:</span>
                  <span>{activeRecord?.salary_month}</span>
                </div>
                <div className="flex justify-between font-bold text-amber-400 pt-1 border-t">
                  <span>Pending Balance:</span>
                  <span>₹{activeRecord ? activeRecord.pending_amount.toLocaleString() : "0"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment Amount (₹) *</Label>
                  <Input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    required
                    min="1"
                    max={activeRecord?.pending_amount}
                    step="0.01"
                    className="h-8 text-xs font-bold text-emerald-400"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Payment Date *</Label>
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    required
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment Mode</Label>
                  <Select value={payMethod} onValueChange={(v: any) => setPayMethod(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cash">Cash in Hand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {payMethod !== "cash" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Bank Account</Label>
                    <Select value={payBankId} onValueChange={setPayBankId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select Bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.bank_name} ({b.account_no})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Bank / UPI / UTR Reference</Label>
                <Input
                  placeholder="e.g. UTR #098124, IMPS ref"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                Payment only discharges the payable liability. It does NOT register an additional expense.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayDialogOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={paySubmitting || parseFloat(payAmount) <= 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer"
              >
                {paySubmitting ? "Disbursing..." : "Confirm & Pay Salary"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
