// ============================================================
// BANKING DATABASE QUERIES & BRS DUPLICATE REVIEW SERVICE
// src/lib/db/banking.ts
// ============================================================
import { getSupabase } from '../supabase';
import { recordAuditLog } from './audit';
import type { BankStatementTransaction } from './erp';
import type { ParsedStatementRow } from '../banking/bankCsvParser';

export interface EnrichedParsedStatementRow extends ParsedStatementRow {
  categoryId?: string | null;
  entityId?: string | null;
  businessEntityId?: string | null;
  notes?: string | null;
  skip?: boolean;
}

function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return clean;
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().split('T')[0];
}

function normalizeDateKey(val?: string | null): string {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    return val.slice(0, 10);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

export async function getBankStatementTransactions(params: {
  bankAccountId?: string;
  isMatched?: boolean;
  reviewStatus?: 'auto_added' | 'under_review' | 'merged' | 'dismissed' | 'ALL';
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<BankStatementTransaction[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('bank_statement_transactions')
    .select(`
      *,
      bank_accounts(bank_name, account_no)
    `)
    .order('txn_date', { ascending: false });

  if (params.bankAccountId) q = q.eq('bank_account_id', params.bankAccountId);
  if (params.isMatched !== undefined) q = q.eq('is_matched', params.isMatched);
  if (params.reviewStatus && params.reviewStatus !== 'ALL') {
    q = q.eq('review_status', params.reviewStatus);
  }
  if (params.fromDate) q = q.gte('txn_date', params.fromDate);
  if (params.toDate) q = q.lte('txn_date', params.toDate);
  if (params.limit) q = q.limit(params.limit);

  const { data, error } = await q;
  if (error) {
    console.warn('Error fetching bank_statement_transactions:', error.message);
    return [];
  }

  const rows = ((data || []) as any[]).map((r) => ({
    ...r,
    bank_name: r.bank_accounts?.bank_name ?? undefined,
    account_no: r.bank_accounts?.account_no ?? undefined,
    reference: r.reference || r.reference_no || null,
    balance: r.balance != null ? r.balance : (r.balance_after != null ? r.balance_after : null),
  }));

  // Fetch matched existing transactions (including category & contact/entity) for review/reconciled display
  const duplicateIds = Array.from(
    new Set(
      rows
        .map((r) => r.potential_duplicate_id || r.transaction_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  let duplicateMap: Record<string, any> = {};
  if (duplicateIds.length > 0) {
    const { data: txnData } = await supabase
      .from('transactions')
      .select('*, categories(id, name, color), entities(id, name, type)')
      .in('id', duplicateIds);
    if (txnData) {
      for (const t of txnData) {
        duplicateMap[t.id] = t;
      }
    }
  }

  return rows.map((r) => ({
    ...r,
    matched_transaction:
      (r.potential_duplicate_id && duplicateMap[r.potential_duplicate_id]) ||
      (r.transaction_id && duplicateMap[r.transaction_id]) ||
      null,
  }));
}

/**
 * Cloud Duplicate Detection Engine (Strictly Per-Bank):
 * Checks ONLY records linked to `params.bankAccountId`:
 *  1) Existing cloud `bank_statement_transactions` for THIS bank account
 *     (matching exact date, direction, amount, and particulars/reference).
 *  2) Existing manual ledger `transactions` assigned to THIS bank account
 *     (excluding statement-imported transactions already covered by Check 1,
 *      and NEVER matching Cash-only or other banks' transactions).
 */
export async function findDuplicateTransaction(params: {
  bankAccountId: string;
  date: string; // ISO "YYYY-MM-DD"
  amount: number;
  type: 'IN' | 'OUT';
  particulars?: string;
  reference?: string | null;
}): Promise<{
  transactionId: string | null;
  reason: string;
  source: 'CLOUD_STATEMENT' | 'LEDGER_TXN';
} | null> {
  const supabase = getSupabase();
  const targetDate = normalizeDateKey(params.date);
  const queryStart = shiftIsoDate(targetDate, -1);
  const queryEnd = shiftIsoDate(targetDate, 1);

  // 1. Check cloud bank statements strictly for THIS bank account
  const { data: existingStmts } = await supabase
    .from('bank_statement_transactions')
    .select('id, txn_date, description, reference, reference_no, debit_amount, credit_amount, transaction_id, review_status')
    .eq('bank_account_id', params.bankAccountId)
    .gte('txn_date', queryStart)
    .lte('txn_date', queryEnd);

  if (existingStmts && existingStmts.length > 0) {
    const cleanParticulars = (params.particulars || '').trim().toLowerCase();
    const cleanRef = (params.reference || '').trim().toLowerCase();

    for (const st of existingStmts) {
      const stDate = normalizeDateKey(st.txn_date);
      if (stDate !== targetDate) continue;

      const stIsOut = Number(st.debit_amount) > 0;
      const stType: 'IN' | 'OUT' = stIsOut ? 'OUT' : 'IN';
      if (stType !== params.type) continue;

      const stAmt = stIsOut ? Number(st.debit_amount) : Number(st.credit_amount);
      if (Math.abs(stAmt - params.amount) >= 0.01) continue;

      const stDesc = (st.description || '').trim().toLowerCase();
      const stRef = ((st.reference || st.reference_no) || '').trim().toLowerCase();

      const sameDesc = Boolean(cleanParticulars && stDesc && cleanParticulars === stDesc);
      const sameRef = Boolean(cleanRef && stRef && cleanRef === stRef);
      const bothBlank = !cleanParticulars && !stDesc && !cleanRef && !stRef;

      if (sameDesc || sameRef || bothBlank) {
        return {
          transactionId: st.transaction_id || null,
          source: 'CLOUD_STATEMENT',
          reason: `Already entered in Cloud Bank Statement (${st.description || 'Bank Entry'} on ${targetDate} for ₹${params.amount.toLocaleString()}${stRef ? `, Ref: ${st.reference || st.reference_no}` : ''})`,
        };
      }
    }
  }

  // 2. Check manual ledger transactions assigned specifically to THIS bank account
  const { data: txns, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('type', params.type)
    .eq('custom_data->>bank_account_id', params.bankAccountId)
    .gte('date', `${queryStart}T00:00:00Z`)
    .lte('date', `${queryEnd}T23:59:59Z`);

  if (error || !txns || txns.length === 0) {
    return null;
  }

  for (const t of txns) {
    if (t.custom_data?.is_statement_imported === true) continue;
    const tDate = normalizeDateKey(t.date);
    if (tDate !== targetDate) continue;

    const txnAmount = Number(
      t.custom_data?.bank_amount != null
        ? t.custom_data.bank_amount
        : (t.paid_amount != null ? t.paid_amount : t.amount)
    );
    if (Math.abs(txnAmount - params.amount) < 0.01) {
      return {
        transactionId: t.id,
        source: 'LEDGER_TXN',
        reason: `Matches existing Bank Transaction #${t.id.slice(-6)} on ${targetDate} for ₹${params.amount.toLocaleString()} (${t.notes || t.description || 'No description'})`,
      };
    }
  }

  return null;
}

/**
 * Inserts a single bank statement entry.
 * Safely populates both schema variants (reference & reference_no, balance & balance_after).
 */
let cachedBstColumns: Set<string> | null = null;

export async function getAvailableBstColumns(): Promise<Set<string>> {
  if (cachedBstColumns) return cachedBstColumns;

  const supabase = getSupabase();

  // Try non-destructive DDL additions if exec_sql RPC is available
  try {
    await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS balance NUMERIC(14, 2);
        ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14, 2);
        ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS reference TEXT;
        ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS reference_no TEXT;
        ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS import_batch TEXT;
        ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS transaction_id TEXT;
        ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS potential_duplicate_id TEXT;
        ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;
        ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'auto_added';
        NOTIFY pgrst, 'reload schema';
      `,
    });
  } catch {
    // If exec_sql not present, probe existing schema dynamically
  }

  const candidateCols = [
    'id',
    'bank_account_id',
    'txn_date',
    'description',
    'debit_amount',
    'credit_amount',
    'balance',
    'balance_after',
    'reference',
    'reference_no',
    'is_matched',
    'import_batch',
    'transaction_id',
    'potential_duplicate_id',
    'duplicate_reason',
    'review_status',
    'created_at',
  ];

  const available = new Set<string>();

  await Promise.all(
    candidateCols.map(async (col) => {
      try {
        const { error } = await supabase
          .from('bank_statement_transactions')
          .select(col)
          .limit(1);
        if (!error) {
          available.add(col);
        }
      } catch {
        // Column not in schema cache
      }
    })
  );

  if (available.size > 0) {
    cachedBstColumns = available;
    return available;
  }

  return new Set([
    'id',
    'bank_account_id',
    'txn_date',
    'description',
    'debit_amount',
    'credit_amount',
    'balance_after',
    'reference_no',
    'is_matched',
    'created_at',
  ]);
}

function buildBstPayload(
  data: {
    id: string;
    bank_account_id: string;
    txn_date: string;
    description?: string | null;
    debit_amount: number;
    credit_amount: number;
    balance?: number | null;
    reference?: string | null;
    import_batch?: string | null;
    transaction_id?: string | null;
    potential_duplicate_id?: string | null;
    duplicate_reason?: string | null;
    review_status?: string;
    is_matched: boolean;
  },
  available: Set<string>
): Record<string, any> {
  const dateFormatted = normalizeDateKey(data.txn_date);

  const row: Record<string, any> = {
    id: data.id,
    bank_account_id: data.bank_account_id,
    txn_date: dateFormatted,
    debit_amount: Number(data.debit_amount) || 0,
    credit_amount: Number(data.credit_amount) || 0,
  };

  if (available.has('description')) row.description = data.description || null;
  if (available.has('is_matched')) row.is_matched = data.is_matched;

  if (data.balance != null) {
    if (available.has('balance')) {
      row.balance = Number(data.balance);
    } else if (available.has('balance_after')) {
      row.balance_after = Number(data.balance);
    }
  }

  if (data.reference) {
    if (available.has('reference')) {
      row.reference = data.reference;
    } else if (available.has('reference_no')) {
      row.reference_no = data.reference;
    }
  }

  if (data.import_batch && available.has('import_batch')) {
    row.import_batch = data.import_batch;
  }
  if (data.transaction_id && available.has('transaction_id')) {
    row.transaction_id = data.transaction_id;
  }
  if (data.potential_duplicate_id && available.has('potential_duplicate_id')) {
    row.potential_duplicate_id = data.potential_duplicate_id;
  }
  if (data.duplicate_reason && available.has('duplicate_reason')) {
    row.duplicate_reason = data.duplicate_reason;
  }
  if (data.review_status && available.has('review_status')) {
    row.review_status = data.review_status;
  }

  return row;
}

export async function insertBankStatementTransaction(data: {
  bank_account_id: string;
  txn_date: string;
  description?: string | null;
  debit_amount?: number;
  credit_amount?: number;
  balance?: number;
  reference?: string | null;
  import_batch?: string | null;
  transaction_id?: string | null;
  potential_duplicate_id?: string | null;
  duplicate_reason?: string | null;
  review_status?: 'auto_added' | 'under_review' | 'merged' | 'dismissed';
}): Promise<string> {
  const supabase = getSupabase();
  const id = `bst_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const available = await getAvailableBstColumns();

  const payload = buildBstPayload(
    {
      id,
      bank_account_id: data.bank_account_id,
      txn_date: data.txn_date,
      description: data.description,
      debit_amount: Number(data.debit_amount) || 0,
      credit_amount: Number(data.credit_amount) || 0,
      balance: data.balance != null ? Number(data.balance) : null,
      reference: data.reference,
      import_batch: data.import_batch,
      transaction_id: data.transaction_id,
      potential_duplicate_id: data.potential_duplicate_id,
      duplicate_reason: data.duplicate_reason,
      review_status: data.review_status || 'auto_added',
      is_matched: data.review_status === 'auto_added' || data.review_status === 'merged',
    },
    available
  );

  const { error } = await supabase.from('bank_statement_transactions').insert([payload]);

  if (error) {
    if (error.code === '23505') return 'duplicate';
    console.error('Error inserting bank statement txn:', error);
    throw error;
  }
  return id;
}

async function refreshBankBalanceWithFallback(bankAccountId: string): Promise<void> {
  const supabase = getSupabase();
  try {
    const { error } = await supabase.rpc('refresh_bank_account_balance', {
      p_bank_account_id: bankAccountId,
    });
    if (!error) return;
  } catch {
    // Fallback below
  }

  // Fallback client recalculation so bank_accounts.current_balance stays updated
  try {
    const [{ data: acc }, { data: txns }, { data: vchs }, { data: sals }] = await Promise.all([
      supabase.from('bank_accounts').select('opening_balance').eq('id', bankAccountId).single(),
      supabase
        .from('transactions')
        .select('type, custom_data')
        .eq('custom_data->>bank_account_id', bankAccountId),
      supabase
        .from('vouchers')
        .select('voucher_type, paid_amount, payment_method, status')
        .eq('bank_account_id', bankAccountId)
        .eq('status', 'posted'),
      supabase
        .from('salary_records')
        .select('paid_amount, payment_method, status')
        .eq('bank_account_id', bankAccountId),
    ]);

    if (!acc) return;
    let bal = Number(acc.opening_balance) || 0;
    for (const t of txns || []) {
      const bankAmt = Number(t.custom_data?.bank_amount) || 0;
      if (bankAmt <= 0) continue;
      bal += t.type === 'IN' ? bankAmt : -bankAmt;
    }
    for (const v of vchs || []) {
      if (!['bank', 'cheque', 'upi'].includes(v.payment_method || '')) continue;
      const amt = Number(v.paid_amount) || 0;
      bal += (v.voucher_type === 'sales' || v.voucher_type === 'receipt') ? amt : -amt;
    }
    for (const s of sals || []) {
      if (!['partial', 'paid'].includes(s.status || '')) continue;
      if (!['bank', 'cheque', 'upi'].includes(s.payment_method || '')) continue;
      bal -= Number(s.paid_amount) || 0;
    }

    await supabase
      .from('bank_accounts')
      .update({ current_balance: Math.round(bal * 100) / 100 })
      .eq('id', bankAccountId);
  } catch {
    // Non-blocking
  }
}

export interface BatchImportResult {
  totalRows: number;
  autoAddedCount: number;
  underReviewCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
}

export async function importBankStatementBatch(params: {
  bankAccountId: string;
  businessEntityId?: string | null;
  defaultDepositCategoryId?: string | null;
  defaultWithdrawalCategoryId?: string | null;
  defaultEntityId?: string | null;
  rows: EnrichedParsedStatementRow[];
  importBatch?: string;
}): Promise<BatchImportResult> {
  const supabase = getSupabase();
  const activeRows = (params.rows || []).filter((r) => !r.skip);

  if (!params.bankAccountId) {
    return {
      totalRows: activeRows.length,
      autoAddedCount: 0,
      underReviewCount: 0,
      skippedCount: activeRows.length,
      errorCount: 1,
      errors: ['No bank account selected. Please select or add an active bank account first.'],
    };
  }

  if (activeRows.length === 0) {
    return {
      totalRows: 0,
      autoAddedCount: 0,
      underReviewCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
    };
  }

  // 1. Verify bank account exists
  const { data: bAcc, error: bAccErr } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, account_no')
    .eq('id', params.bankAccountId)
    .single();

  if (bAccErr || !bAcc) {
    return {
      totalRows: activeRows.length,
      autoAddedCount: 0,
      underReviewCount: 0,
      skippedCount: activeRows.length,
      errorCount: 1,
      errors: [`Selected bank account (${params.bankAccountId}) does not exist in the database.`],
    };
  }

  // 2. Clean up orphan transactions from previous failed imports for this bank account
  try {
    const { data: candidates } = await supabase
      .from('transactions')
      .select('id, custom_data, notes')
      .like('notes', 'Bank Statement:%');

    const orphanCandidates = (candidates || []).filter(
      (t) =>
        t.custom_data?.is_statement_imported === true &&
        t.custom_data?.bank_account_id === params.bankAccountId
    );

    if (orphanCandidates.length > 0) {
      const candidateIds = orphanCandidates.map((t) => t.id);
      const { data: linkedRows } = await supabase
        .from('bank_statement_transactions')
        .select('transaction_id')
        .in('transaction_id', candidateIds);

      const linkedIds = new Set((linkedRows || []).map((r) => r.transaction_id));
      const trueOrphanIds = candidateIds.filter((id) => !linkedIds.has(id));

      if (trueOrphanIds.length > 0) {
        await supabase.from('transactions').delete().in('id', trueOrphanIds);
      }
    }
  } catch (cleanErr) {
    console.warn('Orphan transaction cleanup warning:', cleanErr);
  }

  // 3. Inspect available columns & categories
  const availableCols = await getAvailableBstColumns();
  const { data: catList } = await supabase.from('categories').select('id');
  const catSet = new Set((catList || []).map((c) => c.id));
  const fallbackDepositCat =
    (params.defaultDepositCategoryId && catSet.has(params.defaultDepositCategoryId) && params.defaultDepositCategoryId) ||
    (catSet.has('cat_bank_deposit') ? 'cat_bank_deposit' : catSet.has('cat_sales') ? 'cat_sales' : (catList?.[0]?.id || null));
  const fallbackChargesCat =
    (params.defaultWithdrawalCategoryId && catSet.has(params.defaultWithdrawalCategoryId) && params.defaultWithdrawalCategoryId) ||
    (catSet.has('cat_bank_charges') ? 'cat_bank_charges' : catSet.has('cat_misc') ? 'cat_misc' : (catList?.[0]?.id || null));

  // 4. Query existing CLOUD records BEFORE batch insertion (does NOT flag intra-file rows against each other!)
  const sortedDates = activeRows.map((r) => normalizeDateKey(r.date)).filter(Boolean).sort();
  const minDate = shiftIsoDate(sortedDates[0] || new Date().toISOString().split('T')[0], -1);
  const maxDate = shiftIsoDate(sortedDates[sortedDates.length - 1] || minDate, 1);

  const [{ data: existingCloudStmts }, { data: existingTxns }] = await Promise.all([
    supabase
      .from('bank_statement_transactions')
      .select('id, txn_date, description, reference, reference_no, debit_amount, credit_amount, transaction_id, review_status')
      .eq('bank_account_id', params.bankAccountId)
      .gte('txn_date', minDate)
      .lte('txn_date', maxDate),
    supabase
      .from('transactions')
      .select('id, type, amount, paid_amount, total_amount, date, description, notes, custom_data')
      .eq('custom_data->>bank_account_id', params.bankAccountId)
      .gte('date', `${minDate}T00:00:00Z`)
      .lte('date', `${maxDate}T23:59:59Z`),
  ]);

  const cloudStmtsList = existingCloudStmts || [];
  const existingList = (existingTxns || []).filter(
    (t) =>
      t.custom_data?.bank_account_id === params.bankAccountId &&
      t.custom_data?.is_statement_imported !== true
  );

  const txnsToInsert: any[] = [];
  const stmtRawRowsToInsert: any[] = [];

  let autoAddedCount = 0;
  let underReviewCount = 0;
  let skippedCount = (params.rows || []).length - activeRows.length;

  const batchTimestamp = Date.now();
  const batchId = params.importBatch || `import_${batchTimestamp}`;

  for (let i = 0; i < activeRows.length; i++) {
    const row = activeRows[i];
    const formattedDate = normalizeDateKey(row.date);
    const isOut = row.withdrawals > 0;
    const type: 'IN' | 'OUT' = isOut ? 'OUT' : 'IN';
    const cashAmount = isOut ? row.withdrawals : row.deposits;

    if (cashAmount <= 0) {
      skippedCount++;
      continue;
    }

    const rowParticulars = (row.particulars || '').trim().toLowerCase();
    const rowRef = (row.chequeNo || '').trim().toLowerCase();

    // Check 1: Strictly per-bank cloud `bank_statement_transactions` match (same date + amount + particulars/reference)
    const matchedCloudStmt = cloudStmtsList.find((st) => {
      const stDate = normalizeDateKey(st.txn_date);
      if (stDate !== formattedDate) return false;
      const stIsOut = Number(st.debit_amount) > 0;
      const stType: 'IN' | 'OUT' = stIsOut ? 'OUT' : 'IN';
      if (stType !== type) return false;
      const stAmt = stIsOut ? Number(st.debit_amount) : Number(st.credit_amount);
      if (Math.abs(stAmt - cashAmount) >= 0.01) return false;

      const stDesc = (st.description || '').trim().toLowerCase();
      const stRef = ((st.reference || st.reference_no) || '').trim().toLowerCase();
      const sameDesc = Boolean(rowParticulars && stDesc && rowParticulars === stDesc);
      const sameRef = Boolean(rowRef && stRef && rowRef === stRef);
      const bothBlank = !rowParticulars && !stDesc && !rowRef && !stRef;

      return sameDesc || sameRef || bothBlank;
    });

    // Check 2: Strictly per-bank manual Quick Entry / Ledger transaction match (never checks cash or other banks)
    const matchedTxn = existingList.find((t) => {
      if (t.type !== type) return false;
      const tDate = normalizeDateKey(t.date);
      if (tDate !== formattedDate) return false;
      const tAmt = Number(
        t.custom_data?.bank_amount != null
          ? t.custom_data.bank_amount
          : (t.paid_amount != null ? t.paid_amount : t.amount)
      );
      return Math.abs(tAmt - cashAmount) < 0.01;
    });

    const stmtId = `bst_${batchTimestamp}_${i}_${Math.floor(Math.random() * 1000)}`;
    const ref = row.chequeNo || null;
    const bal = row.balance != null ? row.balance : null;
    const rowCategory =
      (row.categoryId && catSet.has(row.categoryId) ? row.categoryId : null) ||
      (type === 'IN' ? fallbackDepositCat : fallbackChargesCat);
    const rowEntityId = row.entityId !== undefined ? (row.entityId || null) : (params.defaultEntityId || null);
    const rowBizEntityId = row.businessEntityId !== undefined ? (row.businessEntityId || null) : (params.businessEntityId || null);
    const rowNotes = row.notes?.trim()
      ? `${row.notes.trim()}${row.particulars ? ` (${row.particulars})` : ''}`
      : `Bank Statement: ${row.particulars || ''}`;

    if (matchedCloudStmt || matchedTxn) {
      underReviewCount++;
      const reason = matchedCloudStmt
        ? `Already entered in Cloud Bank Statement (${matchedCloudStmt.description || 'Bank Entry'} on ${formattedDate} for ₹${cashAmount.toLocaleString()}${(matchedCloudStmt.reference || matchedCloudStmt.reference_no) ? `, Ref: ${matchedCloudStmt.reference || matchedCloudStmt.reference_no}` : ''})`
        : `Matches existing Ledger Transaction #${matchedTxn!.id.slice(-6)} on ${formattedDate} for ₹${cashAmount.toLocaleString()} (${matchedTxn!.notes || matchedTxn!.description || 'No description'})`;

      stmtRawRowsToInsert.push({
        id: stmtId,
        bank_account_id: params.bankAccountId,
        txn_date: formattedDate,
        description: row.particulars || 'Bank Entry',
        debit_amount: row.withdrawals,
        credit_amount: row.deposits,
        balance: bal,
        reference: ref,
        import_batch: batchId,
        potential_duplicate_id: matchedCloudStmt?.transaction_id || matchedTxn?.id || null,
        duplicate_reason: reason,
        review_status: 'under_review',
        is_matched: false,
      });
    } else {
      autoAddedCount++;
      const newTxnId = `txn_bank_${batchTimestamp}_${i}_${Math.floor(Math.random() * 1000)}`;

      txnsToInsert.push({
        id: newTxnId,
        type,
        amount: cashAmount,
        total_amount: cashAmount,
        paid_amount: cashAmount,
        balance_due: 0,
        credit_status: 'PAID',
        due_date: null,
        date: `${formattedDate}T12:00:00Z`,
        category_id: rowCategory,
        entity_id: rowEntityId,
        product_id: null,
        quantity: null,
        description: row.particulars || 'Bank Transaction',
        notes: rowNotes,
        reference: ref,
        custom_data: {
          payment_method: 'bank_transfer_only',
          bank_account_id: params.bankAccountId,
          bank_amount: cashAmount,
          cash_amount: 0,
          payment_reference: ref,
          is_statement_imported: true,
          business_entity_id: rowBizEntityId,
        },
        business_entity_id: rowBizEntityId,
      });

      stmtRawRowsToInsert.push({
        id: stmtId,
        bank_account_id: params.bankAccountId,
        txn_date: formattedDate,
        description: row.particulars || 'Bank Entry',
        debit_amount: row.withdrawals,
        credit_amount: row.deposits,
        balance: bal,
        reference: ref,
        import_batch: batchId,
        transaction_id: newTxnId,
        review_status: 'auto_added',
        is_matched: true,
      });
    }
  }

  const stmtRowsToInsert = stmtRawRowsToInsert.map((r) => buildBstPayload(r, availableCols));
  const insertedTxnIds: string[] = [];
  const insertedStmtIds: string[] = [];
  const CHUNK_SIZE = 100;

  try {
    if (txnsToInsert.length > 0) {
      for (let c = 0; c < txnsToInsert.length; c += CHUNK_SIZE) {
        const chunk = txnsToInsert.slice(c, c + CHUNK_SIZE);
        const { error: insErr } = await supabase.from('transactions').insert(chunk);
        if (insErr) {
          if (insErr.message?.includes('category') || insErr.code === '23503') {
            const fallbackChunk = chunk.map((t) => ({ ...t, category_id: null, entity_id: null }));
            const { error: retryErr } = await supabase.from('transactions').insert(fallbackChunk);
            if (retryErr) {
              throw new Error(`Transactions insert failed: ${retryErr.message}`);
            } else {
              insertedTxnIds.push(...fallbackChunk.map((t) => t.id));
            }
          } else {
            throw new Error(`Transactions insert failed: ${insErr.message}`);
          }
        } else {
          insertedTxnIds.push(...chunk.map((t) => t.id));
        }
      }
    }

    if (stmtRowsToInsert.length > 0) {
      for (let c = 0; c < stmtRowsToInsert.length; c += CHUNK_SIZE) {
        const chunk = stmtRowsToInsert.slice(c, c + CHUNK_SIZE);
        const { error: stmtErr } = await supabase.from('bank_statement_transactions').insert(chunk);
        if (stmtErr) {
          throw new Error(`Bank statement rows insert failed: ${stmtErr.message}`);
        } else {
          insertedStmtIds.push(...chunk.map((r) => r.id));
        }
      }
    }
  } catch (operationErr: any) {
    console.warn('Import failed. Rolling back all created records...');
    if (insertedTxnIds.length > 0) {
      try {
        await supabase.from('transactions').delete().in('id', insertedTxnIds);
      } catch {}
    }
    if (insertedStmtIds.length > 0) {
      try {
        await supabase.from('bank_statement_transactions').delete().in('id', insertedStmtIds);
      } catch {}
    }
    throw operationErr;
  }

  await refreshBankBalanceWithFallback(params.bankAccountId);

  await recordAuditLog({
    entity_type: 'bank_statement_transactions',
    record_id: batchId,
    old_values: null,
    new_values: {
      bank_account_id: params.bankAccountId,
      batch_id: batchId,
      auto_added: autoAddedCount,
      under_review: underReviewCount,
      skipped: skippedCount,
      total_rows: params.rows.length,
    },
    action: 'CREATE',
  });

  return {
    totalRows: params.rows.length,
    autoAddedCount,
    underReviewCount,
    skippedCount,
    errorCount: 0,
    errors: [],
  };
}

export async function importBankStatementRow(params: {
  bankAccountId: string;
  businessEntityId?: string | null;
  categoryId?: string | null;
  entityId?: string | null;
  notes?: string | null;
  date: string; // "YYYY-MM-DD"
  particulars: string;
  chequeNo?: string | null;
  withdrawals: number;
  deposits: number;
  balance?: number | null;
  importBatch?: string;
}): Promise<{
  statementId: string;
  status: 'auto_added' | 'under_review';
  transactionId?: string;
  duplicateId?: string | null;
  duplicateReason?: string;
}> {
  const supabase = getSupabase();
  const type: 'IN' | 'OUT' = params.withdrawals > 0 ? 'OUT' : 'IN';
  const cashAmount = params.withdrawals > 0 ? params.withdrawals : params.deposits;
  const formattedDate = normalizeDateKey(params.date);

  const duplicate = await findDuplicateTransaction({
    bankAccountId: params.bankAccountId,
    date: formattedDate,
    amount: cashAmount,
    type,
    particulars: params.particulars,
    reference: params.chequeNo,
  });

  if (duplicate) {
    const stmtId = await insertBankStatementTransaction({
      bank_account_id: params.bankAccountId,
      txn_date: formattedDate,
      description: params.particulars,
      debit_amount: params.withdrawals,
      credit_amount: params.deposits,
      balance: params.balance != null ? params.balance : undefined,
      reference: params.chequeNo,
      import_batch: params.importBatch,
      potential_duplicate_id: duplicate.transactionId,
      duplicate_reason: duplicate.reason,
      review_status: 'under_review',
    });

    return {
      statementId: stmtId,
      status: 'under_review',
      duplicateId: duplicate.transactionId,
      duplicateReason: duplicate.reason,
    };
  }

  const txnId = `txn_bank_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const defaultCategory = params.categoryId || (type === 'IN' ? 'cat_bank_deposit' : 'cat_bank_charges');

  const newTxnPayload = {
    id: txnId,
    type,
    amount: cashAmount,
    total_amount: cashAmount,
    paid_amount: cashAmount,
    balance_due: 0,
    credit_status: 'PAID',
    due_date: null,
    date: `${formattedDate}T12:00:00Z`,
    category_id: defaultCategory,
    entity_id: params.entityId || null,
    product_id: null,
    quantity: null,
    description: params.particulars,
    notes: params.notes?.trim() ? params.notes.trim() : `Bank Statement: ${params.particulars}`,
    reference: params.chequeNo || null,
    custom_data: {
      payment_method: 'bank_transfer_only',
      bank_account_id: params.bankAccountId,
      bank_amount: cashAmount,
      cash_amount: 0,
      payment_reference: params.chequeNo || null,
      is_statement_imported: true,
      business_entity_id: params.businessEntityId || null,
    },
    business_entity_id: params.businessEntityId || null,
  };

  const { error: txnErr } = await supabase.rpc('post_quick_transaction_atomic', {
    p_transaction: newTxnPayload,
  });

  if (txnErr) {
    if (!params.categoryId) {
      newTxnPayload.category_id = type === 'IN' ? 'cat_sales' : 'cat_misc';
    }
    const { error: retryErr } = await supabase.rpc('post_quick_transaction_atomic', {
      p_transaction: newTxnPayload,
    });
    if (retryErr) {
      newTxnPayload.category_id = null as any;
      const { error: insErr } = await supabase.from('transactions').insert([newTxnPayload]);
      if (insErr) throw insErr;
    }
  }

  const stmtId = await insertBankStatementTransaction({
    bank_account_id: params.bankAccountId,
    txn_date: formattedDate,
    description: params.particulars,
    debit_amount: params.withdrawals,
    credit_amount: params.deposits,
    balance: params.balance != null ? params.balance : undefined,
    reference: params.chequeNo,
    import_batch: params.importBatch,
    transaction_id: txnId,
    review_status: 'auto_added',
  });

  await refreshBankBalanceWithFallback(params.bankAccountId);

  return {
    statementId: stmtId,
    status: 'auto_added',
    transactionId: txnId,
  };
}

export async function mergeStatementWithTransaction(
  statementId: string,
  transactionId: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('bank_statement_transactions')
    .update({
      transaction_id: transactionId,
      potential_duplicate_id: null,
      review_status: 'merged',
      is_matched: true,
    })
    .eq('id', statementId);

  if (error) {
    console.error('Failed to merge statement with transaction:', error);
    throw error;
  }
}

export async function approveDuplicateAsNewTransaction(
  statement: BankStatementTransaction,
  businessEntityId?: string | null,
  overrides?: {
    categoryId?: string | null;
    entityId?: string | null;
    notes?: string | null;
  }
): Promise<string> {
  const supabase = getSupabase();
  const type: 'IN' | 'OUT' = statement.debit_amount > 0 ? 'OUT' : 'IN';
  const cashAmount = statement.debit_amount > 0 ? statement.debit_amount : statement.credit_amount;
  const txnId = `txn_bank_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const defaultCategory = overrides?.categoryId || (type === 'IN' ? 'cat_bank_deposit' : 'cat_bank_charges');

  const newTxnPayload = {
    id: txnId,
    type,
    amount: cashAmount,
    total_amount: cashAmount,
    paid_amount: cashAmount,
    balance_due: 0,
    credit_status: 'PAID',
    due_date: null,
    date: statement.txn_date.includes('T') ? statement.txn_date : `${statement.txn_date}T12:00:00Z`,
    category_id: defaultCategory,
    entity_id: overrides?.entityId || null,
    product_id: null,
    quantity: null,
    description: statement.description || 'Bank Transaction',
    notes: overrides?.notes?.trim() ? overrides.notes.trim() : `Bank Statement: ${statement.description || ''}`,
    reference: statement.reference || statement.reference_no || null,
    custom_data: {
      payment_method: 'bank_transfer_only',
      bank_account_id: statement.bank_account_id,
      bank_amount: cashAmount,
      cash_amount: 0,
      payment_reference: statement.reference || statement.reference_no || null,
      is_statement_imported: true,
      business_entity_id: businessEntityId || null,
    },
    business_entity_id: businessEntityId || null,
  };

  const { error: txnErr } = await supabase.rpc('post_quick_transaction_atomic', {
    p_transaction: newTxnPayload,
  });

  if (txnErr) {
    newTxnPayload.category_id = type === 'IN' ? 'cat_sales' : 'cat_misc';
    const { error: retryErr } = await supabase.rpc('post_quick_transaction_atomic', {
      p_transaction: newTxnPayload,
    });
    if (retryErr) {
      newTxnPayload.category_id = null as any;
      await supabase.from('transactions').insert([newTxnPayload]);
    }
  }

  const { error: stmtErr } = await supabase
    .from('bank_statement_transactions')
    .update({
      transaction_id: txnId,
      potential_duplicate_id: null,
      review_status: 'auto_added',
      is_matched: true,
    })
    .eq('id', statement.id);

  if (stmtErr) throw stmtErr;

  await refreshBankBalanceWithFallback(statement.bank_account_id);

  return txnId;
}

export async function dismissStatement(statementId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('bank_statement_transactions')
    .update({
      review_status: 'dismissed',
      is_matched: false,
    })
    .eq('id', statementId);

  if (error) throw error;
}

export async function updateBankStatementTransaction(
  id: string,
  data: Partial<BankStatementTransaction>,
  oldData?: Partial<BankStatementTransaction>,
  linkedTxnUpdates?: {
    transactionId?: string | null;
    categoryId?: string | null;
    entityId?: string | null;
    businessEntityId?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  const supabase = getSupabase();
  const available = await getAvailableBstColumns();
  const updatePayload: Record<string, any> = {};
  if (data.txn_date !== undefined) {
    updatePayload.txn_date = normalizeDateKey(data.txn_date);
  }
  if (data.description !== undefined && available.has('description')) {
    updatePayload.description = data.description || null;
  }
  if (data.debit_amount !== undefined) updatePayload.debit_amount = Number(data.debit_amount) || 0;
  if (data.credit_amount !== undefined) updatePayload.credit_amount = Number(data.credit_amount) || 0;
  if (data.balance !== undefined) {
    const bal = data.balance != null ? Number(data.balance) : null;
    if (available.has('balance')) updatePayload.balance = bal;
    else if (available.has('balance_after')) updatePayload.balance_after = bal;
  }
  if (data.reference !== undefined) {
    const ref = data.reference || null;
    if (available.has('reference')) updatePayload.reference = ref;
    else if (available.has('reference_no')) updatePayload.reference_no = ref;
  }

  const { error } = await supabase.from('bank_statement_transactions').update(updatePayload).eq('id', id);
  if (error) {
    console.error('Error updating bank statement transaction:', error);
    throw error;
  }

  // Sync changes to linked transaction if present
  const linkedTxnId = linkedTxnUpdates?.transactionId || oldData?.transaction_id;
  if (linkedTxnId) {
    const debit = Number(data.debit_amount ?? oldData?.debit_amount ?? 0);
    const credit = Number(data.credit_amount ?? oldData?.credit_amount ?? 0);
    const type: 'IN' | 'OUT' = debit > 0 ? 'OUT' : 'IN';
    const amount = debit > 0 ? debit : credit;
    const formattedDate = normalizeDateKey(data.txn_date || oldData?.txn_date);

    const { data: existingTxn } = await supabase
      .from('transactions')
      .select('custom_data')
      .eq('id', linkedTxnId)
      .maybeSingle();

    const mergedCustomData = {
      ...(existingTxn?.custom_data || {}),
      bank_amount: amount,
      cash_amount: 0,
      payment_method: 'bank_transfer_only',
      payment_reference: data.reference ?? oldData?.reference ?? null,
      business_entity_id: linkedTxnUpdates?.businessEntityId ?? existingTxn?.custom_data?.business_entity_id ?? null,
    };

    const txnUpdate: Record<string, any> = {
      type,
      amount,
      total_amount: amount,
      paid_amount: amount,
      date: formattedDate ? `${formattedDate}T12:00:00Z` : undefined,
      description: data.description ?? oldData?.description ?? null,
      reference: data.reference ?? oldData?.reference ?? null,
      custom_data: mergedCustomData,
    };
    if (linkedTxnUpdates?.categoryId !== undefined) txnUpdate.category_id = linkedTxnUpdates.categoryId || null;
    if (linkedTxnUpdates?.entityId !== undefined) txnUpdate.entity_id = linkedTxnUpdates.entityId || null;
    if (linkedTxnUpdates?.businessEntityId !== undefined) txnUpdate.business_entity_id = linkedTxnUpdates.businessEntityId || null;
    if (linkedTxnUpdates?.notes !== undefined) txnUpdate.notes = linkedTxnUpdates.notes || null;

    await supabase.from('transactions').update(txnUpdate).eq('id', linkedTxnId);
  }

  const bankId = oldData?.bank_account_id;
  if (bankId) {
    await refreshBankBalanceWithFallback(bankId);
  }

  await recordAuditLog({
    entity_type: 'bank_statement_transactions',
    record_id: id,
    old_values: oldData,
    new_values: { ...updatePayload, ...linkedTxnUpdates },
    action: 'UPDATE',
  });
}

export async function deleteBankStatementTransactions(
  ids: string[],
  deleteLinkedAutoTxns: boolean = true
): Promise<void> {
  if (!ids || ids.length === 0) return;
  const supabase = getSupabase();

  // Fetch metadata first so we can refresh impacted bank balances & audit log
  const { data: stmts } = await supabase
    .from('bank_statement_transactions')
    .select('id, bank_account_id, transaction_id, review_status')
    .in('id', ids);

  const bankIds = Array.from(new Set((stmts || []).map((s: any) => s.bank_account_id).filter(Boolean)));

  const { error: rpcErr } = await supabase.rpc('delete_bank_statement_transactions_atomic', {
    p_ids: ids,
    p_delete_linked_auto_txns: deleteLinkedAutoTxns,
  });

  if (rpcErr) {
    // Fallback if RPC not yet installed
    if (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('not find')) {
      const autoTxnIds = deleteLinkedAutoTxns
        ? (stmts || [])
            .filter((s: any) => s.transaction_id && s.review_status === 'auto_added')
            .map((s: any) => s.transaction_id)
        : [];

      await supabase.from('bank_reconciliation_matches').delete().in('bank_statement_txn_id', ids);
      const { error: delErr } = await supabase.from('bank_statement_transactions').delete().in('id', ids);
      if (delErr) throw delErr;

      if (autoTxnIds.length > 0) {
        await supabase.from('transactions').delete().in('id', autoTxnIds);
      }
    } else {
      throw new Error(rpcErr.message);
    }
  }

  for (const bankId of bankIds) {
    await refreshBankBalanceWithFallback(bankId);
  }

  await recordAuditLog({
    entity_type: 'bank_statement_transactions',
    record_id: ids.join(','),
    old_values: stmts,
    new_values: { deleted_ids: ids, delete_linked_auto_txns: deleteLinkedAutoTxns },
    action: 'DELETE',
  });
}

export async function matchBankTransaction(params: {
  bank_statement_txn_id: string;
  voucher_id?: string | null;
  salary_record_id?: string | null;
  journal_entry_id?: string | null;
  matched_amount: number;
}): Promise<void> {
  const supabase = getSupabase();
  const id = `brm_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const { error: matchErr } = await supabase.from('bank_reconciliation_matches').insert([
    {
      id,
      bank_statement_txn_id: params.bank_statement_txn_id,
      voucher_id: params.voucher_id || null,
      salary_record_id: params.salary_record_id || null,
      journal_entry_id: params.journal_entry_id || null,
      matched_amount: params.matched_amount,
    },
  ]);
  if (matchErr) {
    console.error('Error matching bank transaction:', matchErr);
    throw matchErr;
  }

  await supabase
    .from('bank_statement_transactions')
    .update({ is_matched: true, review_status: 'merged' })
    .eq('id', params.bank_statement_txn_id);
}

export async function unmatchBankTransaction(bankStatementTxnId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('bank_reconciliation_matches').delete().eq('bank_statement_txn_id', bankStatementTxnId);
  await supabase.from('bank_statement_transactions').update({ is_matched: false }).eq('id', bankStatementTxnId);
}
