// ============================================================
// ACCOUNTING DATABASE QUERIES
// src/lib/db/accounting.ts
// ============================================================
import { getSupabase } from '../supabase';
import type {
  Account, Voucher, VoucherLine, JournalEntry,
  SalaryRecord, Employee, Partner, BankAccount,
} from './erp';

// ---- Accounts (Chart of Accounts) ----

export async function getAccounts(type?: string): Promise<Account[]> {
  const supabase = getSupabase();
  let q = supabase.from('accounts').select('*').order('account_type').order('name');
  if (type) q = q.eq('account_type', type);
  const { data, error } = await q;
  if (error) { console.warn('Error fetching accounts:', error.message); return []; }
  return (data || []) as Account[];
}

export async function upsertAccount(data: Partial<Account>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `acc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = {
    id, name: data.name!, account_type: data.account_type!, sub_type: data.sub_type || null,
    parent_id: data.parent_id || null, is_system: false, is_active: data.is_active !== false,
  };
  const { error } = await supabase.from('accounts').upsert([row]);
  if (error) { console.error('Error upserting account:', error); throw error; }
  return id;
}

// ---- Vouchers ----

export async function getVouchers(params: {
  businessEntityId?: string;
  voucherType?: string;
  partyEntityId?: string;
  fromDate?: string;
  toDate?: string;
  paymentStatus?: string;
  limit?: number;
}): Promise<Voucher[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('vouchers')
    .select(`
      *,
      business_entities(name),
      entities(name, type)
    `)
    .eq('status', 'posted')
    .order('voucher_date', { ascending: false });

  if (params.businessEntityId) q = q.eq('business_entity_id', params.businessEntityId);
  if (params.voucherType) q = q.eq('voucher_type', params.voucherType);
  if (params.partyEntityId) q = q.eq('party_entity_id', params.partyEntityId);
  if (params.fromDate) q = q.gte('voucher_date', params.fromDate);
  if (params.toDate) q = q.lte('voucher_date', params.toDate);
  if (params.paymentStatus) q = q.eq('payment_status', params.paymentStatus);
  if (params.limit) q = q.limit(params.limit);

  const { data, error } = await q;
  if (error) { console.warn('Error fetching vouchers:', error.message); return []; }

  return ((data || []) as any[]).map(r => ({
    ...r,
    business_entity_name: r.business_entities?.name ?? undefined,
    party_entity_name: r.entities?.name ?? undefined,
    party_entity_type: r.entities?.type ?? undefined,
  }));
}

export async function getVoucherWithLines(voucherId: string): Promise<Voucher | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('vouchers')
    .select(`
      *,
      business_entities(name),
      entities(name, type),
      voucher_lines(
        *,
        products(name),
        product_variants(size, thickness)
      )
    `)
    .eq('id', voucherId)
    .single();

  if (error || !data) return null;
  const r = data as any;
  return {
    ...r,
    business_entity_name: r.business_entities?.name ?? undefined,
    party_entity_name: r.entities?.name ?? undefined,
    party_entity_type: r.entities?.type ?? undefined,
    lines: (r.voucher_lines || []).map((l: any) => ({
      ...l,
      product_name: l.products?.name ?? undefined,
      variant_size: l.product_variants?.size ?? null,
      variant_thickness: l.product_variants?.thickness ?? null,
    })),
  };
}

export async function getNextVoucherNumber(prefix: string): Promise<string> {
  const supabase = getSupabase();
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc('get_next_voucher_number', {
    p_prefix: prefix,
    p_year: year,
  });
  if (error) { console.error('Error getting voucher number:', error); throw error; }
  return data as string;
}

export async function insertVoucher(voucher: Omit<Voucher, 'id' | 'created_at' | 'lines'> & { lines: Omit<VoucherLine, 'id' | 'voucher_id' | 'created_at'>[] }): Promise<string> {
  const supabase = getSupabase();
  const id = `vch_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const voucherRow = {
    id,
    business_entity_id: voucher.business_entity_id,
    voucher_type: voucher.voucher_type,
    voucher_number: voucher.voucher_number,
    voucher_date: voucher.voucher_date,
    party_entity_id: voucher.party_entity_id || null,
    subtotal: voucher.subtotal,
    tax_amount: voucher.tax_amount,
    total_amount: voucher.total_amount,
    paid_amount: voucher.paid_amount,
    balance_due: voucher.balance_due,
    payment_status: voucher.payment_status,
    payment_method: voucher.payment_method || null,
    bank_account_id: voucher.bank_account_id || null,
    reference: voucher.reference || null,
    narration: voucher.narration || null,
    source_transaction_id: voucher.source_transaction_id || null,
    status: 'posted',
  };

  const lineRows = (voucher.lines || []).map((l, i) => ({
    id: `vl_${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`,
    voucher_id: id,
    line_no: l.line_no || i + 1,
    product_id: l.product_id || null,
    variant_id: l.variant_id || null,
    description: l.description || null,
    unit: l.unit || null,
    quantity: l.quantity,
    quantity_sqft: l.quantity_sqft || null,
    rate: l.rate,
    tax_percent: l.tax_percent || 0,
    tax_amount: l.tax_amount || 0,
    line_total: l.line_total,
    debit_account_id: l.debit_account_id || null,
    credit_account_id: l.credit_account_id || null,
  }));

  // All formal vouchers must be posted by the database transaction.
  const { data: rpcVoucherId, error: rpcErr } = await supabase.rpc('post_voucher_atomic', {
    p_voucher: voucherRow,
    p_lines: lineRows,
  });

  if (!rpcErr && rpcVoucherId) {
    return rpcVoucherId as string;
  }

  if (rpcErr) {
    console.error('Atomic voucher posting failed:', rpcErr);
    throw new Error(rpcErr.message);
  }
  if (!rpcVoucherId) throw new Error('Atomic voucher posting returned no voucher ID.');
  return rpcVoucherId as string;
}

export async function cancelVoucher(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error: rpcErr } = await supabase.rpc('cancel_voucher_atomic', { p_voucher_id: id });
  if (!rpcErr) return;

  throw new Error(rpcErr.message);
}

// ---- Journal Entries ----

export async function getJournalEntries(params: {
  businessEntityId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<JournalEntry[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('journal_entries')
    .select(`*, business_entities(name), journal_lines(*, accounts(name, account_type))`)
    .eq('status', 'posted')
    .order('entry_date', { ascending: false });

  if (params.businessEntityId) q = q.eq('business_entity_id', params.businessEntityId);
  if (params.fromDate) q = q.gte('entry_date', params.fromDate);
  if (params.toDate) q = q.lte('entry_date', params.toDate);
  if (params.limit) q = q.limit(params.limit);

  const { data, error } = await q;
  if (error) { console.warn('Error fetching journal_entries:', error.message); return []; }

  return ((data || []) as any[]).map(r => ({
    ...r,
    business_entity_name: r.business_entities?.name ?? undefined,
    lines: (r.journal_lines || []).map((l: any) => ({
      ...l,
      account_name: l.accounts?.name ?? undefined,
      account_type: l.accounts?.account_type ?? undefined,
    })),
  }));
}

export async function insertJournalEntry(params: {
  business_entity_id: string;
  entry_date: string;
  reference?: string | null;
  narration: string;
  lines: { account_id: string; debit_amount: number; credit_amount: number; narration?: string }[];
}): Promise<string> {
  const supabase = getSupabase();

  const totalDebit = params.lines.reduce((s, l) => s + (l.debit_amount || 0), 0);
  const totalCredit = params.lines.reduce((s, l) => s + (l.credit_amount || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Journal entry is unbalanced. Debit: ${totalDebit}, Credit: ${totalCredit}`);
  }

  const { data, error } = await supabase.rpc('post_journal_entry', {
    p_business_entity_id: params.business_entity_id,
    p_entry_date: params.entry_date,
    p_reference: params.reference || null,
    p_narration: params.narration,
    p_lines: params.lines,
  });
  if (error) { console.error('Atomic journal posting failed:', error); throw error; }
  return data as string;
}

export async function cancelJournalEntry(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error: rpcErr } = await supabase.rpc('cancel_journal_entry_atomic', { p_journal_id: id });
  if (!rpcErr) return;

  throw new Error(rpcErr.message);
}

// ---- Employees ----

export async function getEmployees(): Promise<Employee[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('employees').select('*').order('name');
  if (error) { console.warn('Error fetching employees:', error.message); return []; }
  return (data || []) as Employee[];
}

export async function upsertEmployee(data: Partial<Employee>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `emp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = { id, name: data.name!, designation: data.designation || null,
    phone: data.phone || null, bank_account_no: data.bank_account_no || null,
    ifsc: data.ifsc || null, monthly_salary: data.monthly_salary || 0,
    is_active: data.is_active !== false };
  const { error } = await supabase.from('employees').upsert([row]);
  if (error) throw error;
  return id;
}

// ---- Partners ----

export async function getPartners(): Promise<Partner[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('partners').select('*').order('name');
  if (error) { console.warn('Error fetching partners:', error.message); return []; }
  return (data || []) as Partner[];
}

export async function upsertPartner(data: Partial<Partner>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `ptr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = { id, name: data.name!, phone: data.phone || null, address: data.address || null,
    is_active: data.is_active !== false };
  const { error } = await supabase.from('partners').upsert([row]);
  if (error) throw error;
  return id;
}

// ---- Bank Accounts ----

export async function getBankAccounts(businessEntityId?: string): Promise<BankAccount[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('bank_accounts')
    .select('*, business_entities(name)')
    .order('bank_name');
  if (businessEntityId) q = q.eq('business_entity_id', businessEntityId);
  const { data, error } = await q;
  if (error) { console.warn('Error fetching bank_accounts:', error.message); return []; }
  return ((data || []) as any[]).map(r => ({
    ...r, business_entity_name: r.business_entities?.name ?? undefined,
  }));
}

export async function upsertBankAccount(data: Partial<BankAccount>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `bnk_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = { id, business_entity_id: data.business_entity_id || null,
    bank_name: data.bank_name!, account_no: data.account_no!,
    ifsc: data.ifsc || null, branch_name: data.branch_name || null,
    opening_balance: data.opening_balance || 0, is_active: data.is_active !== false };
  const { error } = await supabase.from('bank_accounts').upsert([row]);
  if (error) throw error;
  return id;
}

// ---- Salary Records ----

export async function getSalaryRecords(params: {
  businessEntityId?: string;
  salaryMonth?: string;
  status?: string;
  employeeId?: string;
  partnerId?: string;
  limit?: number;
}): Promise<SalaryRecord[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('salary_records')
    .select('*, business_entities(name)')
    .order('voucher_date', { ascending: false });

  if (params.businessEntityId) q = q.eq('business_entity_id', params.businessEntityId);
  if (params.salaryMonth) q = q.eq('salary_month', params.salaryMonth);
  if (params.status) q = q.eq('status', params.status);
  if (params.employeeId) q = q.eq('employee_id', params.employeeId);
  if (params.partnerId) q = q.eq('partner_id', params.partnerId);
  if (params.limit) q = q.limit(params.limit);

  const { data, error } = await q;
  if (error) { console.warn('Error fetching salary_records:', error.message); return []; }
  return ((data || []) as any[]).map(r => ({
    ...r, business_entity_name: r.business_entities?.name ?? undefined,
  }));
}

export async function bookSalary(params: {
  business_entity_id: string;
  voucher_date: string;
  salary_month: string;
  payee_type: 'employee' | 'partner';
  employee_id?: string | null;
  partner_id?: string | null;
  payee_name: string;
  booked_amount: number;
  expense_account_id: string;
  payable_account_id: string;
  narration?: string | null;
}): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('post_salary_booking', {
    p_record: {
      business_entity_id: params.business_entity_id,
      voucher_date: params.voucher_date,
      salary_month: params.salary_month,
      payee_type: params.payee_type,
      employee_id: params.employee_id || null,
      partner_id: params.partner_id || null,
      payee_name: params.payee_name,
      booked_amount: params.booked_amount,
      expense_account_id: params.expense_account_id,
      payable_account_id: params.payable_account_id,
      narration: params.narration || null,
    },
  });
  if (error) throw error;
  return data as string;
}

export async function paySalary(params: {
  salary_record_id: string;
  pay_amount: number;
  payment_method: 'cash' | 'bank' | 'upi';
  bank_account_id?: string | null;
  payment_reference?: string | null;
  payment_date: string;
  cash_account_id: string;
}): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.rpc('post_salary_payment', {
    p_record_id: params.salary_record_id,
    p_amount: params.pay_amount,
    p_method: params.payment_method,
    p_bank_id: params.bank_account_id || null,
    p_reference: params.payment_reference || null,
    p_date: params.payment_date,
    p_cash_account: params.cash_account_id,
  });
  if (error) throw error;
}

// ---- P&L Summary from vouchers ----
export async function getPnlSummary(params: {
  businessEntityId?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<{ totalSales: number; totalPurchase: number; totalExpenses: number; grossProfit: number; netProfit: number }> {
  const supabase = getSupabase();

  let q = supabase
    .from('vouchers')
    .select('voucher_type, total_amount')
    .eq('status', 'posted');
  if (params.businessEntityId) q = q.eq('business_entity_id', params.businessEntityId);
  if (params.fromDate) q = q.gte('voucher_date', params.fromDate);
  if (params.toDate) q = q.lte('voucher_date', params.toDate);

  const { data } = await q;
  const rows = (data || []) as any[];

  let totalSales = 0;
  let totalPurchase = 0;
  let totalExpenses = 0;

  for (const r of rows) {
    const amt = Number(r.total_amount) || 0;
    if (r.voucher_type === 'sales') totalSales += amt;
    else if (r.voucher_type === 'purchase') totalPurchase += amt;
    else if (r.voucher_type === 'expense') totalExpenses += amt;
  }

  // Salary from salary_records
  let q2 = supabase.from('salary_records').select('booked_amount').eq('status', 'paid');
  if (params.businessEntityId) q2 = q2.eq('business_entity_id', params.businessEntityId);
  if (params.fromDate) q2 = q2.gte('voucher_date', params.fromDate);
  if (params.toDate) q2 = q2.lte('voucher_date', params.toDate);
  const { data: salData } = await q2;
  const totalSalary = ((salData || []) as any[]).reduce((s, r) => s + Number(r.booked_amount), 0);

  const grossProfit = totalSales - totalPurchase;
  const netProfit = grossProfit - totalExpenses - totalSalary;

  return { totalSales, totalPurchase, totalExpenses: totalExpenses + totalSalary, grossProfit, netProfit };
}
