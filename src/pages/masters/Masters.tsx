import { useState, useEffect } from "react";
import { useStore } from "@/store";
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
  Users, Landmark, BookOpen, PlusCircle, Lock, Pencil
} from "lucide-react";
import type { Employee, Partner, BankAccount, Account, BusinessEntity } from "@/lib/db/erp";
import {
  getEmployees,
  upsertEmployee,
  getPartners,
  upsertPartner,
  getBankAccounts,
  upsertBankAccount,
  getAccounts,
  upsertAccount,
} from "@/lib/db/accounting";
import { getBusinessEntities } from "@/lib/db/inventory";

type MasterTab = "EMPLOYEES" | "PARTNERS" | "BANKS" | "ACCOUNTS";

export function Masters() {
  const refreshTrigger = useStore((s) => s.refreshTrigger);
  const triggerRefresh = useStore((s) => s.triggerRefresh);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MasterTab>("EMPLOYEES");

  // Data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [businessEntities, setBusinessEntities] = useState<BusinessEntity[]>([]);

  // Employee Dialog
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empForm, setEmpForm] = useState<Partial<Employee>>({});
  const [empSaving, setEmpSaving] = useState(false);

  // Partner Dialog
  const [ptrModalOpen, setPtrModalOpen] = useState(false);
  const [ptrForm, setPtrForm] = useState<Partial<Partner>>({});
  const [ptrSaving, setPtrSaving] = useState(false);

  // Bank Dialog
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankForm, setBankForm] = useState<Partial<BankAccount>>({});
  const [bankSaving, setBankSaving] = useState(false);

  // Account Dialog
  const [accModalOpen, setAccModalOpen] = useState(false);
  const [accForm, setAccForm] = useState<Partial<Account>>({});
  const [accSaving, setAccSaving] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getEmployees(),
      getPartners(),
      getBankAccounts(),
      getAccounts(),
      getBusinessEntities(),
    ])
      .then(([empList, ptrList, bnkList, accList, beList]) => {
        setEmployees(empList);
        setPartners(ptrList);
        setBankAccounts(bnkList);
        setAccounts(accList);
        setBusinessEntities(beList);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadData, [refreshTrigger]);

  // Employee Handlers
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.name?.trim()) return;
    setEmpSaving(true);
    try {
      await upsertEmployee(empForm);
      triggerRefresh();
      setEmpModalOpen(false);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setEmpSaving(false);
    }
  };

  // Partner Handlers
  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ptrForm.name?.trim()) return;
    setPtrSaving(true);
    try {
      await upsertPartner(ptrForm);
      triggerRefresh();
      setPtrModalOpen(false);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setPtrSaving(false);
    }
  };

  // Bank Handlers
  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankForm.bank_name?.trim() || !bankForm.account_no?.trim()) return;
    setBankSaving(true);
    try {
      await upsertBankAccount(bankForm);
      triggerRefresh();
      setBankModalOpen(false);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setBankSaving(false);
    }
  };

  // Account Handlers
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accForm.name?.trim() || !accForm.account_type) return;
    setAccSaving(true);
    try {
      await upsertAccount(accForm);
      triggerRefresh();
      setAccModalOpen(false);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setAccSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Enterprise Masters Setup</h2>
        </div>
        <IosLoadingView text="Loading master configurations..." minHeight="360px" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Enterprise Masters Setup</h2>
          <p className="text-muted-foreground mt-1">
            Maintain employee rosters, partners, commercial bank accounts, and Chart of Accounts.
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <Button
          size="sm"
          variant={activeTab === "EMPLOYEES" ? "default" : "outline"}
          onClick={() => setActiveTab("EMPLOYEES")}
          className="h-8 text-xs cursor-pointer font-medium"
        >
          <Users className="h-3.5 w-3.5 mr-1.5" /> Employees &amp; Staff ({employees.length})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "PARTNERS" ? "default" : "outline"}
          onClick={() => setActiveTab("PARTNERS")}
          className="h-8 text-xs cursor-pointer font-medium"
        >
          <Users className="h-3.5 w-3.5 mr-1.5" /> Partners &amp; Directors ({partners.length})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "BANKS" ? "default" : "outline"}
          onClick={() => setActiveTab("BANKS")}
          className="h-8 text-xs cursor-pointer font-medium"
        >
          <Landmark className="h-3.5 w-3.5 mr-1.5" /> Bank Accounts ({bankAccounts.length})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "ACCOUNTS" ? "default" : "outline"}
          onClick={() => setActiveTab("ACCOUNTS")}
          className="h-8 text-xs cursor-pointer font-medium"
        >
          <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Chart of Accounts ({accounts.length})
        </Button>
      </div>

      {/* 1. EMPLOYEES TAB */}
      {activeTab === "EMPLOYEES" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Employee Roster</CardTitle>
              <CardDescription>Salary payees and designations for factory and office payroll.</CardDescription>
            </div>
            <Button
              onClick={() => {
                setEmpForm({ name: "", designation: "", phone: "", monthly_salary: 0, is_active: true });
                setEmpModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer h-8 text-xs"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Add Employee
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Bank Account No</TableHead>
                  <TableHead>IFSC</TableHead>
                  <TableHead className="text-right">Monthly Salary (₹)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-semibold text-xs">{emp.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{emp.designation || "Staff"}</TableCell>
                    <TableCell className="text-xs">{emp.phone || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{emp.bank_account_no || "—"}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{emp.ifsc || "—"}</TableCell>
                    <TableCell className="text-right text-xs font-bold text-blue-400">
                      ₹{Number(emp.monthly_salary).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={emp.is_active ? "border-emerald-500 text-emerald-400" : ""}>
                        {emp.is_active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEmpForm({ ...emp });
                          setEmpModalOpen(true);
                        }}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 2. PARTNERS TAB */}
      {activeTab === "PARTNERS" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Partners &amp; Directors Master</CardTitle>
              <CardDescription>Capital accounts, remuneration, and partner drawings.</CardDescription>
            </div>
            <Button
              onClick={() => {
                setPtrForm({ name: "", phone: "", address: "", is_active: true });
                setPtrModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer h-8 text-xs"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Add Partner
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((ptr) => (
                  <TableRow key={ptr.id}>
                    <TableCell className="font-semibold text-xs">{ptr.name}</TableCell>
                    <TableCell className="text-xs">{ptr.phone || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ptr.address || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ptr.is_active ? "border-purple-500 text-purple-400" : ""}>
                        {ptr.is_active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPtrForm({ ...ptr });
                          setPtrModalOpen(true);
                        }}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 3. BANK ACCOUNTS TAB */}
      {activeTab === "BANKS" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Commercial Bank Accounts</CardTitle>
              <CardDescription>Accounts linked to business entities for statement reconciliation.</CardDescription>
            </div>
            <Button
              onClick={() => {
                setBankForm({
                  bank_name: "",
                  account_no: "",
                  ifsc: "",
                  branch_name: "",
                  opening_balance: 0,
                  business_entity_id: businessEntities[0]?.id || null,
                  is_active: true,
                });
                setBankModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer h-8 text-xs"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Add Bank Account
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank Name</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>IFSC Code</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Operating Entity</TableHead>
                  <TableHead className="text-right">Opening Balance (₹)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-semibold text-xs">{b.bank_name}</TableCell>
                    <TableCell className="font-mono text-xs">{b.account_no}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{b.ifsc || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.branch_name || "—"}</TableCell>
                    <TableCell className="text-xs">{b.business_entity_name || "All Entities"}</TableCell>
                    <TableCell className="text-right text-xs font-bold text-emerald-400">
                      ₹{Number(b.opening_balance).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={b.is_active ? "border-emerald-500 text-emerald-400" : ""}>
                        {b.is_active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setBankForm({ ...b });
                          setBankModalOpen(true);
                        }}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 4. CHART OF ACCOUNTS TAB */}
      {activeTab === "ACCOUNTS" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Chart of Accounts (General Ledger)</CardTitle>
              <CardDescription>Asset, Liability, Equity, Income, and Expense classifications.</CardDescription>
            </div>
            <Button
              onClick={() => {
                setAccForm({ name: "", account_type: "expense", sub_type: "opex", is_active: true });
                setAccModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer h-8 text-xs"
            >
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Add Account
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Category / Type</TableHead>
                  <TableHead>Sub-Type</TableHead>
                  <TableHead>System Account</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-semibold text-xs flex items-center gap-2">
                      {acc.is_system && <Lock className="h-3 w-3 text-muted-foreground" />}
                      <span>{acc.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          acc.account_type === "asset"
                            ? "border-blue-500 text-blue-400"
                            : acc.account_type === "liability"
                            ? "border-rose-500 text-rose-400"
                            : acc.account_type === "income"
                            ? "border-emerald-500 text-emerald-400"
                            : "border-amber-500 text-amber-400"
                        }
                      >
                        {acc.account_type.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{acc.sub_type || "—"}</TableCell>
                    <TableCell>
                      {acc.is_system ? (
                        <span className="text-[10px] text-muted-foreground">Protected Core</span>
                      ) : (
                        <span className="text-[10px] text-emerald-400">Custom Account</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={acc.is_active ? "border-emerald-500 text-emerald-400" : ""}>
                        {acc.is_active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Employee Modal */}
      <Dialog open={empModalOpen} onOpenChange={setEmpModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleSaveEmployee}>
            <DialogHeader>
              <DialogTitle>{empForm.id ? "Edit Employee" : "Add Employee"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Full Name *</Label>
                <Input
                  value={empForm.name || ""}
                  onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                  required
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Designation</Label>
                  <Input
                    placeholder="e.g. Press Operator"
                    value={empForm.designation || ""}
                    onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={empForm.phone || ""}
                    onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Monthly Fixed Salary (₹)</Label>
                <Input
                  type="number"
                  value={empForm.monthly_salary || ""}
                  onChange={(e) => setEmpForm({ ...empForm, monthly_salary: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Bank Account #</Label>
                  <Input
                    value={empForm.bank_account_no || ""}
                    onChange={(e) => setEmpForm({ ...empForm, bank_account_no: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IFSC Code</Label>
                  <Input
                    value={empForm.ifsc || ""}
                    onChange={(e) => setEmpForm({ ...empForm, ifsc: e.target.value })}
                    className="h-8 text-xs font-mono uppercase"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEmpModalOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={empSaving || !empForm.name?.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer">
                {empSaving ? "Saving..." : "Save Employee"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Partner Modal */}
      <Dialog open={ptrModalOpen} onOpenChange={setPtrModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleSavePartner}>
            <DialogHeader>
              <DialogTitle>{ptrForm.id ? "Edit Partner" : "Add Partner"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Partner Name *</Label>
                <Input
                  value={ptrForm.name || ""}
                  onChange={(e) => setPtrForm({ ...ptrForm, name: e.target.value })}
                  required
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={ptrForm.phone || ""}
                  onChange={(e) => setPtrForm({ ...ptrForm, phone: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Address</Label>
                <Input
                  value={ptrForm.address || ""}
                  onChange={(e) => setPtrForm({ ...ptrForm, address: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPtrModalOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={ptrSaving || !ptrForm.name?.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer">
                {ptrSaving ? "Saving..." : "Save Partner"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bank Account Modal */}
      <Dialog open={bankModalOpen} onOpenChange={setBankModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleSaveBank}>
            <DialogHeader>
              <DialogTitle>{bankForm.id ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Operating Entity</Label>
                <Select
                  value={bankForm.business_entity_id || "none"}
                  onValueChange={(val) => setBankForm({ ...bankForm, business_entity_id: val === "none" ? null : val })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Entity (Optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- General / All Entities --</SelectItem>
                    {businessEntities.map((be) => (
                      <SelectItem key={be.id} value={be.id}>
                        {be.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Bank Name *</Label>
                  <Input
                    placeholder="e.g. HDFC Bank"
                    value={bankForm.bank_name || ""}
                    onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                    required
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Account No *</Label>
                  <Input
                    value={bankForm.account_no || ""}
                    onChange={(e) => setBankForm({ ...bankForm, account_no: e.target.value })}
                    required
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">IFSC Code</Label>
                  <Input
                    value={bankForm.ifsc || ""}
                    onChange={(e) => setBankForm({ ...bankForm, ifsc: e.target.value })}
                    className="h-8 text-xs font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Branch Name</Label>
                  <Input
                    value={bankForm.branch_name || ""}
                    onChange={(e) => setBankForm({ ...bankForm, branch_name: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Opening Balance (₹)</Label>
                <Input
                  type="number"
                  value={bankForm.opening_balance || ""}
                  onChange={(e) => setBankForm({ ...bankForm, opening_balance: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs font-bold text-emerald-400"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBankModalOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={bankSaving || !bankForm.bank_name?.trim() || !bankForm.account_no?.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer">
                {bankSaving ? "Saving..." : "Save Bank Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Account Modal */}
      <Dialog open={accModalOpen} onOpenChange={setAccModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleSaveAccount}>
            <DialogHeader>
              <DialogTitle>Add Ledger Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs">Account Name *</Label>
                <Input
                  placeholder="e.g. Factory Boiler Fuel"
                  value={accForm.name || ""}
                  onChange={(e) => setAccForm({ ...accForm, name: e.target.value })}
                  required
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Account Type *</Label>
                  <Select
                    value={accForm.account_type || "expense"}
                    onValueChange={(val: any) => setAccForm({ ...accForm, account_type: val })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asset">Asset</SelectItem>
                      <SelectItem value="liability">Liability</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="equity">Equity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sub-Type Tag</Label>
                  <Input
                    placeholder="e.g. opex, cogs"
                    value={accForm.sub_type || ""}
                    onChange={(e) => setAccForm({ ...accForm, sub_type: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAccModalOpen(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={accSaving || !accForm.name?.trim()} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs cursor-pointer">
                {accSaving ? "Saving..." : "Save Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
