// ============================================================
// ACCOUNTING DATABASE QUERIES
// src/lib/db/accounting.ts
// ============================================================
import { getSupabase } from '../supabase';
import { recordAuditLog } from './audit';
import { getBusinessEntities } from './inventory';
export { getBusinessEntities };
import type {
  Account, Voucher, VoucherLine, JournalEntry,
  SalaryRecord, Employee, Partner, BankAccount,
} from './erp';
import { parseVoucherReference } from './erp';

// ---- Accounts (Chart of Accounts) ----

export async function getAccounts(type?: string): Promise<Account[]> {
  const supabase = getSupabase();
  let q = supabase.from('accounts').select('*').order('account_type').order('name');
  if (type) q = q.eq('account_type', type);
  const { data, error } = await q;
  if (error) { console.warn('Error fetching accounts:', error.message); return []; }
  return (data || []) as Account[];
}

export async function upsertAccount(data: Partial<Account>, oldData?: Partial<Account>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `acc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = {
    id,
    name: data.name ? data.name.trim() : 'Unnamed Account',
    account_type: data.account_type!,
    sub_type: data.sub_type || null,
    parent_id: data.parent_id || null,
    is_system: data.is_system != null ? data.is_system : false,
    is_active: data.is_active !== false,
  };
  const { error } = await supabase.from('accounts').upsert([row]);
  if (error) { console.error('Error upserting account:', error); throw error; }

  await recordAuditLog({
    entity_type: 'accounts',
    record_id: id,
    old_values: oldData,
    new_values: row,
    action: data.id ? 'UPDATE' : 'CREATE',
  });

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
      business_entities(name, gstin, address, phone),
      entities(name, type, gstin, address, phone),
      bank_accounts(bank_name, account_no, ifsc, branch_name)
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

  return ((data || []) as any[]).map(r => {
    const meta = parseVoucherReference(r.reference);
    return {
      ...r,
      business_entity_name: r.business_entities?.name ?? undefined,
      party_entity_name: r.entities?.name ?? undefined,
      party_entity_type: r.entities?.type ?? undefined,
      bank_name: r.bank_accounts?.bank_name ?? undefined,
      account_no: r.bank_accounts?.account_no ?? undefined,
      bank_ifsc: r.bank_accounts?.ifsc ?? undefined,
      bank_branch: r.bank_accounts?.branch_name ?? undefined,
      transport: meta.transport,
      shipping: meta.shipping,
      round_off: meta.roundOff,
      tax_split: meta.taxSplit,
    };
  });
}

export async function getVoucherWithLines(voucherId: string): Promise<Voucher | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('vouchers')
    .select(`
      *,
      business_entities(name, gstin, address, phone),
      entities(name, type, gstin, address, phone),
      bank_accounts(bank_name, account_no, ifsc, branch_name),
      voucher_lines(
        *,
        products(name),
        product_variants(size, thickness, sqft_per_sheet)
      )
    `)
    .eq('id', voucherId)
    .single();

  if (error || !data) return null;
  const r = data as any;
  const meta = parseVoucherReference(r.reference);
  return {
    ...r,
    business_entity_name: r.business_entities?.name ?? undefined,
    party_entity_name: r.entities?.name ?? undefined,
    party_entity_type: r.entities?.type ?? undefined,
    bank_name: r.bank_accounts?.bank_name ?? undefined,
    account_no: r.bank_accounts?.account_no ?? undefined,
    bank_ifsc: r.bank_accounts?.ifsc ?? undefined,
    bank_branch: r.bank_accounts?.branch_name ?? undefined,
    transport: meta.transport,
    shipping: meta.shipping,
    round_off: meta.roundOff,
    tax_split: meta.taxSplit,
    lines: (r.voucher_lines || []).map((l: any) => ({
      ...l,
      product_name: l.products?.name ?? undefined,
      variant_size: l.product_variants?.size ?? null,
      variant_thickness: l.product_variants?.thickness ?? null,
    })),
  };
}

export async function getNextVoucherNumber(prefix: string, businessEntityId?: string): Promise<string> {
  const supabase = getSupabase();
  const year = new Date().getFullYear();
  const expectedPrefix = `${prefix}-${year}-`;

  const voucherTypeMap: Record<string, string> = {
    SAL: 'sales',
    PUR: 'purchase',
    PAY: 'payment',
    RCP: 'receipt',
    EXP: 'expense',
  };
  const voucherType = voucherTypeMap[prefix.toUpperCase()];

  try {
    let q = supabase
      .from('vouchers')
      .select('voucher_number, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (voucherType) {
      q = q.eq('voucher_type', voucherType);
    }
    if (businessEntityId) {
      q = q.eq('business_entity_id', businessEntityId);
    }

    const { data, error } = await q;
    if (error) {
      console.warn('Error fetching vouchers for next number:', error.message);
      return `${prefix}-${year}-0001`;
    }

    if (!data || data.length === 0) {
      return `${prefix}-${year}-0001`;
    }

    // 1. Scan for standard format PREFIX-YYYY-XXXX
    let maxStandardSeq = 0;
    let foundStandard = false;

    for (const v of data) {
      const vNum = (v.voucher_number || '').trim();
      if (vNum.startsWith(expectedPrefix)) {
        foundStandard = true;
        const numPart = parseInt(vNum.slice(expectedPrefix.length), 10);
        if (!isNaN(numPart) && numPart > maxStandardSeq) {
          maxStandardSeq = numPart;
        }
      }
    }

    if (foundStandard) {
      const nextSeq = (maxStandardSeq + 1).toString().padStart(4, '0');
      return `${expectedPrefix}${nextSeq}`;
    }

    // 2. If not standard format, inspect the most recently added voucher
    // e.g. "D74" -> "D75", "INV-099" -> "INV-100", etc.
    const latestVoucher = data[0];
    if (latestVoucher?.voucher_number) {
      const trimmed = latestVoucher.voucher_number.trim();
      const match = trimmed.match(/^(.*?)(\d+)$/);
      if (match) {
        const textPrefix = match[1];
        const numStr = match[2];
        const nextNum = (parseInt(numStr, 10) + 1).toString().padStart(numStr.length, '0');
        return `${textPrefix}${nextNum}`;
      }
    }

    return `${prefix}-${year}-0001`;
  } catch (err) {
    console.warn('Error computing next voucher number:', err);
    return `${prefix}-${year}-0001`;
  }
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
  let { data: rpcVoucherId, error: rpcErr } = await supabase.rpc('post_voucher_atomic', {
    p_voucher: voucherRow,
    p_lines: lineRows,
  });

  // If a legacy database constraint chk_vouchers_math (<= 0.05) rejects round-off, retry with exact sum
  if (rpcErr && rpcErr.message && rpcErr.message.includes('chk_vouchers_math')) {
    console.warn('Voucher post triggered strict math constraint; retrying with unrounded sum');
    const exactTotal = Math.round((voucher.subtotal + voucher.tax_amount) * 100) / 100;
    const adjustedDue = Math.max(0, Math.round((exactTotal - voucher.paid_amount) * 100) / 100);
    const retryRow = {
      ...voucherRow,
      total_amount: exactTotal,
      balance_due: adjustedDue,
      payment_status: adjustedDue <= 0 ? 'paid' : voucher.paid_amount > 0 ? 'partial' : 'unpaid',
    };
    const retryRes = await supabase.rpc('post_voucher_atomic', {
      p_voucher: retryRow,
      p_lines: lineRows,
    });
    rpcVoucherId = retryRes.data;
    rpcErr = retryRes.error;
  }

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
  status?: string;
  limit?: number;
}): Promise<JournalEntry[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('journal_entries')
    .select(`*, business_entities(name), journal_lines(*, accounts(name, account_type))`)
    .order('entry_date', { ascending: false });

  if (params.status && params.status !== 'all') {
    q = q.eq('status', params.status);
  }
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

export async function updateJournalEntry(params: {
  id: string;
  entry_date: string;
  reference?: string | null;
  narration: string;
  lines: { account_id: string; debit_amount: number; credit_amount: number; narration?: string }[];
}): Promise<void> {
  const supabase = getSupabase();

  const totalDebit = params.lines.reduce((s, l) => s + (l.debit_amount || 0), 0);
  const totalCredit = params.lines.reduce((s, l) => s + (l.credit_amount || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`Journal entry is unbalanced. Debit: ${totalDebit}, Credit: ${totalCredit}`);
  }

  const { error } = await supabase.rpc('update_journal_entry', {
    p_journal_id: params.id,
    p_entry_date: params.entry_date,
    p_reference: params.reference || null,
    p_narration: params.narration,
    p_lines: params.lines,
  });
  if (error) {
    console.error('Update journal entry failed:', error);
    throw error;
  }
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

export async function upsertEmployee(data: Partial<Employee>, oldData?: Partial<Employee>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `emp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row: Record<string, any> = {
    id,
    name: data.name ? data.name.trim() : 'Unnamed Employee',
    designation: data.designation || null,
    phone: data.phone || null,
    bank_account_no: data.bank_account_no || null,
    ifsc: data.ifsc || null,
    monthly_salary: data.monthly_salary != null ? Number(data.monthly_salary) : 0,
    is_active: data.is_active !== false,
  };
  if (data.join_date) row.join_date = data.join_date;

  const { error } = await supabase.from('employees').upsert([row]);
  if (error) throw error;

  await recordAuditLog({
    entity_type: 'employees',
    record_id: id,
    old_values: oldData,
    new_values: row,
    action: data.id ? 'UPDATE' : 'CREATE',
  });

  return id;
}

// ---- Partners ----

export async function getPartners(): Promise<Partner[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('partners').select('*').order('name');
  if (error) { console.warn('Error fetching partners:', error.message); return []; }
  return (data || []) as Partner[];
}

export async function upsertPartner(data: Partial<Partner>, oldData?: Partial<Partner>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `ptr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = {
    id,
    name: data.name ? data.name.trim() : 'Unnamed Partner',
    phone: data.phone || null,
    address: data.address || null,
    monthly_remun: data.monthly_remun != null ? Number(data.monthly_remun) : 0,
    profit_share_pct: data.profit_share_pct != null ? Number(data.profit_share_pct) : 0,
    is_active: data.is_active !== false,
  };
  const { error } = await supabase.from('partners').upsert([row]);
  if (error) throw error;

  await recordAuditLog({
    entity_type: 'partners',
    record_id: id,
    old_values: oldData,
    new_values: row,
    action: data.id ? 'UPDATE' : 'CREATE',
  });

  return id;
}

// ---- Bank Accounts ----

export async function getBankAccounts(businessEntityId?: string): Promise<BankAccount[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_bank_accounts_with_balances', {
    p_business_entity_id: businessEntityId || null,
  });
  if (error) { console.warn('Error fetching bank_accounts:', error.message); return []; }
  return (data || []) as BankAccount[];
}

export async function upsertBankAccount(data: Partial<BankAccount>, oldData?: Partial<BankAccount>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `bnk_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = {
    id,
    business_entity_id: data.business_entity_id || null,
    bank_name: data.bank_name ? data.bank_name.trim() : 'Unnamed Bank',
    account_no: data.account_no ? data.account_no.trim() : '',
    ifsc: data.ifsc || null,
    branch_name: data.branch_name || null,
    opening_balance: data.opening_balance != null ? Number(data.opening_balance) : 0,
    ...(data.id ? {} : { current_balance: data.opening_balance != null ? Number(data.opening_balance) : 0 }),
    is_active: data.is_active !== false,
  };
  const { error } = await supabase.from('bank_accounts').upsert([row]);
  if (error) throw error;

  const { error: balanceError } = await supabase.rpc('refresh_bank_account_balance', {
    p_bank_account_id: id,
  });
  if (balanceError) throw balanceError;

  await recordAuditLog({
    entity_type: 'bank_accounts',
    record_id: id,
    old_values: oldData,
    new_values: row,
    action: data.id ? 'UPDATE' : 'CREATE',
  });

  return id;
}

export async function deleteBankAccount(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('delete_bank_account', {
    p_bank_account_id: id,
  });
  if (error) {
    console.error('Error deleting bank account:', error);
    throw error;
  }
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
  salary_frequency: 'monthly' | 'weekly';
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
      salary_frequency: params.salary_frequency,
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

export async function updateSalaryBooking(params: {
  id: string;
  voucher_date: string;
  salary_month: string;
  salary_frequency: 'monthly' | 'weekly';
  payee_type: 'employee' | 'partner';
  employee_id?: string | null;
  partner_id?: string | null;
  payee_name: string;
  booked_amount: number;
  narration?: string | null;
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('update_salary_booking', {
    p_record_id: params.id,
    p_voucher_date: params.voucher_date,
    p_salary_month: params.salary_month,
    p_salary_frequency: params.salary_frequency,
    p_payee_type: params.payee_type,
    p_employee_id: params.employee_id || null,
    p_partner_id: params.partner_id || null,
    p_payee_name: params.payee_name,
    p_booked_amount: params.booked_amount,
    p_narration: params.narration || null,
  });
  if (error) {
    console.error('Update salary booking failed:', error);
    throw error;
  }
}

export async function cancelSalaryBooking(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('cancel_salary_booking', {
    p_record_id: id,
  });
  if (error) {
    console.error('Cancel salary booking failed:', error);
    throw error;
  }
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
