// ============================================================
// BANKING DATABASE QUERIES & BRS DUPLICATE REVIEW SERVICE
// src/lib/db/banking.ts
// ============================================================
import { getSupabase } from '../supabase';
import { recordAuditLog } from './audit';
import type { BankStatementTransaction } from './erp';
import type { Transaction } from './queries';
import type { ParsedStatementRow } from '../banking/bankCsvParser';

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

  // Fetch matched existing transactions for rows under review or merged
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
      .select('*, categories(name, color)')
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
 * Duplicate Detection Engine:
 * User requirement: "no need cheque only match the date and the cash"
 * Checks if a transaction already exists on the exact same date with the exact same cash amount and direction.
 */
export async function findDuplicateTransaction(params: {
  bankAccountId: string;
  date: string; // ISO "YYYY-MM-DD"
  amount: number;
  type: 'IN' | 'OUT';
}): Promise<Transaction | null> {
  const supabase = getSupabase();

  // Search transactions with exact date substring match and matching type
  // Date timestamp in transactions is e.g. "2026-11-12T12:00:00Z"
  const dayStart = `${params.date}T00:00:00Z`;
  const dayEnd = `${params.date}T23:59:59Z`;

  const { data: txns, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('type', params.type)
    .gte('date', dayStart)
    .lte('date', dayEnd);

  if (error || !txns || txns.length === 0) {
    return null;
  }

  // Filter for matching cash amount (within 0.01 tolerance) and matching bank account
  for (const t of txns) {
    const txnAmount = Number(t.paid_amount != null ? t.paid_amount : t.amount);
    if (Math.abs(txnAmount - params.amount) < 0.01) {
      const bankId = t.custom_data?.bank_account_id;
      // If the transaction is linked to this bank account or has general bank payment
      if (!bankId || bankId === params.bankAccountId) {
        return t as Transaction;
      }
    }
  }

  return null;
}

/**
 * Inserts a single bank statement entry.
 * Safely populates both schema variants (reference & reference_no, balance & balance_after).
 */
let cachedBstColumns: Set<string> | null = null;

/**
 * Discovers what columns actually exist in the remote `bank_statement_transactions` table.
 * Adapts dynamically between legacy schema (`balance_after`, `reference_no`) and modern schema (`balance`, `reference`, etc.).
 */
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
    // If exec_sql not present, we will probe the existing schema dynamically
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
          .select(col, { head: true })
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

  // Safe fallback to baseline schema
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

/**
 * Builds an insert payload for `bank_statement_transactions` containing ONLY columns
 * that actually exist in the remote database schema cache.
 */
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
  const dateFormatted = data.txn_date.includes('T') ? data.txn_date.split('T')[0] : data.txn_date;

  const row: Record<string, any> = {
    id: data.id,
    bank_account_id: data.bank_account_id,
    txn_date: dateFormatted,
    debit_amount: Number(data.debit_amount) || 0,
    credit_amount: Number(data.credit_amount) || 0,
  };

  if (available.has('description')) row.description = data.description || null;
  if (available.has('is_matched')) row.is_matched = data.is_matched;

  // Handle balance vs balance_after
  if (data.balance != null) {
    if (available.has('balance')) {
      row.balance = Number(data.balance);
    } else if (available.has('balance_after')) {
      row.balance_after = Number(data.balance);
    }
  }

  // Handle reference vs reference_no
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

/**
 * Inserts a single bank statement entry.
 * Safely populates supported columns without failing on missing schema variants.
 */
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

/**
 * High-Speed Bulk Statement Ingestion Engine with Full Atomic Rollback.
 * 1. Cleans up orphan transactions from previous interrupted imports.
 * 2. Fetches existing transactions across the batch date range.
 * 3. In-memory exact date & cash duplicate identification.
 * 4. Bulk insert of new transactions.
 * 5. Bulk insert of statement rows matching ONLY available schema columns.
 * 6. ATOMIC ROLLBACK: If any step fails, all inserted records are deleted immediately.
 */
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
  rows: ParsedStatementRow[];
  importBatch?: string;
}): Promise<BatchImportResult> {
  const supabase = getSupabase();

  if (!params.bankAccountId) {
    return {
      totalRows: params.rows?.length || 0,
      autoAddedCount: 0,
      underReviewCount: 0,
      skippedCount: params.rows?.length || 0,
      errorCount: 1,
      errors: ['No bank account selected. Please select or add an active bank account first.'],
    };
  }

  if (!params.rows || params.rows.length === 0) {
    return {
      totalRows: 0,
      autoAddedCount: 0,
      underReviewCount: 0,
      skippedCount: 0,
      errorCount: 0,
      errors: [],
    };
  }

  // 1. Verify bank account exists in DB
  const { data: bAcc, error: bAccErr } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, account_no')
    .eq('id', params.bankAccountId)
    .single();

  if (bAccErr || !bAcc) {
    return {
      totalRows: params.rows.length,
      autoAddedCount: 0,
      underReviewCount: 0,
      skippedCount: params.rows.length,
      errorCount: 1,
      errors: [`Selected bank account (${params.bankAccountId}) does not exist in the database.`],
    };
  }

  // 2. Proactively clean up any orphan transactions from previous failed imports for this bank account
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
        console.info(`Cleaning up ${trueOrphanIds.length} orphan transactions from previous failed imports...`);
        await supabase.from('transactions').delete().in('id', trueOrphanIds);
      }
    }
  } catch (cleanErr) {
    console.warn('Orphan transaction cleanup warning:', cleanErr);
  }

  // 3. Inspect available columns in bank_statement_transactions
  const availableCols = await getAvailableBstColumns();

  // 4. Discover available categories (prefer cat_bank_deposit / cat_bank_charges, fallback to cat_sales / cat_misc)
  const { data: catList } = await supabase.from('categories').select('id');
  const catSet = new Set((catList || []).map((c) => c.id));
  const depositCat = catSet.has('cat_bank_deposit')
    ? 'cat_bank_deposit'
    : catSet.has('cat_sales')
    ? 'cat_sales'
    : (catList?.[0]?.id || null);
  const chargesCat = catSet.has('cat_bank_charges')
    ? 'cat_bank_charges'
    : catSet.has('cat_misc')
    ? 'cat_misc'
    : (catList?.[0]?.id || null);

  // 5. Query existing transactions in date range for duplicate identification
  const sortedDates = params.rows
    .map((r) => (r.date.includes('T') ? r.date.split('T')[0] : r.date))
    .filter(Boolean)
    .sort();
  const minDate = sortedDates[0] || new Date().toISOString().split('T')[0];
  const maxDate = sortedDates[sortedDates.length - 1] || minDate;

  const { data: existingTxns, error: txnsErr } = await supabase
    .from('transactions')
    .select('id, type, amount, paid_amount, total_amount, date, description, notes, custom_data')
    .gte('date', `${minDate}T00:00:00Z`)
    .lte('date', `${maxDate}T23:59:59Z`);

  if (txnsErr) {
    console.warn('Error fetching transactions for duplicate matching:', txnsErr);
  }

  const existingList = existingTxns || [];
  const usedTxnIds = new Set<string>();

  const txnsToInsert: any[] = [];
  const stmtRawRowsToInsert: any[] = [];

  let autoAddedCount = 0;
  let underReviewCount = 0;
  let skippedCount = 0;

  const batchTimestamp = Date.now();
  const batchId = params.importBatch || `import_${batchTimestamp}`;

  for (let i = 0; i < params.rows.length; i++) {
    const row = params.rows[i];
    const formattedDate = row.date.includes('T') ? row.date.split('T')[0] : row.date;
    const isOut = row.withdrawals > 0;
    const type: 'IN' | 'OUT' = isOut ? 'OUT' : 'IN';
    const cashAmount = isOut ? row.withdrawals : row.deposits;

    if (cashAmount <= 0) {
      skippedCount++;
      continue;
    }

    // Match existing transaction on exact date and cash amount
    // User requirement: "no need cheque only match the date and the cash"
    const matchedTxn = existingList.find((t) => {
      if (t.type !== type) return false;
      const tDate = t.date ? (t.date.includes('T') ? t.date.split('T')[0] : t.date) : '';
      if (tDate !== formattedDate) return false;
      const tAmt = Number(t.paid_amount != null ? t.paid_amount : t.amount);
      if (Math.abs(tAmt - cashAmount) >= 0.01) return false;

      const bId = t.custom_data?.bank_account_id;
      if (bId && bId !== params.bankAccountId) return false;

      return true;
    });

    const stmtId = `bst_${batchTimestamp}_${i}_${Math.floor(Math.random() * 1000)}`;
    const ref = row.chequeNo || null;
    const bal = row.balance != null ? row.balance : null;

    if (matchedTxn && !usedTxnIds.has(matchedTxn.id)) {
      usedTxnIds.add(matchedTxn.id);
      underReviewCount++;

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
        potential_duplicate_id: matchedTxn.id,
        duplicate_reason: `Found existing transaction #${matchedTxn.id.slice(-6)} on ${formattedDate} for ₹${cashAmount.toLocaleString()} (${matchedTxn.notes || matchedTxn.description || 'No description'})`,
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
        category_id: type === 'IN' ? depositCat : chargesCat,
        entity_id: null,
        product_id: null,
        quantity: null,
        description: row.particulars || 'Bank Transaction',
        notes: `Bank Statement: ${row.particulars || ''}`,
        reference: ref,
        custom_data: {
          payment_method: 'bank_transfer_only',
          bank_account_id: params.bankAccountId,
          bank_amount: cashAmount,
          cash_amount: 0,
          payment_reference: ref,
          is_statement_imported: true,
          business_entity_id: params.businessEntityId || null,
        },
        business_entity_id: params.businessEntityId || null,
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

  // Filter statement payloads to match ONLY available columns in the database
  const stmtRowsToInsert = stmtRawRowsToInsert.map((r) => buildBstPayload(r, availableCols));

  // 6. ATOMIC INSERTION WITH AUTOMATIC ROLLBACK
  // User Requirement: "also if an error occurs dont insert it to the database"
  const insertedTxnIds: string[] = [];
  const insertedStmtIds: string[] = [];
  const CHUNK_SIZE = 100;

  try {
    // 6.1 Insert Transactions
    if (txnsToInsert.length > 0) {
      for (let c = 0; c < txnsToInsert.length; c += CHUNK_SIZE) {
        const chunk = txnsToInsert.slice(c, c + CHUNK_SIZE);
        const { error: insErr } = await supabase.from('transactions').insert(chunk);
        if (insErr) {
          console.error('Bulk transaction insert error:', insErr);
          if (insErr.message?.includes('category') || insErr.code === '23503') {
            const fallbackChunk = chunk.map((t) => ({ ...t, category_id: null }));
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

    // 6.2 Insert Bank Statement Rows
    if (stmtRowsToInsert.length > 0) {
      for (let c = 0; c < stmtRowsToInsert.length; c += CHUNK_SIZE) {
        const chunk = stmtRowsToInsert.slice(c, c + CHUNK_SIZE);
        const { error: stmtErr } = await supabase.from('bank_statement_transactions').insert(chunk);
        if (stmtErr) {
          console.error('Bulk bank_statement_transactions insert error:', stmtErr);
          throw new Error(`Bank statement rows insert failed: ${stmtErr.message}`);
        } else {
          insertedStmtIds.push(...chunk.map((r) => r.id));
        }
      }
    }
  } catch (operationErr: any) {
    // ATOMIC ROLLBACK: Delete any created records across both tables!
    console.warn('Import failed. Rolling back all created records...');
    if (insertedTxnIds.length > 0) {
      try {
        await supabase.from('transactions').delete().in('id', insertedTxnIds);
      } catch (rbTxnErr) {
        console.error('Rollback of transactions failed:', rbTxnErr);
      }
    }
    if (insertedStmtIds.length > 0) {
      try {
        await supabase.from('bank_statement_transactions').delete().in('id', insertedStmtIds);
      } catch (rbStmtErr) {
        console.error('Rollback of bank statement rows failed:', rbStmtErr);
      }
    }
    throw operationErr;
  }

  // 7. Recalculate Bank Account Balance via RPC
  try {
    await supabase.rpc('refresh_bank_account_balance', {
      p_bank_account_id: params.bankAccountId,
    });
  } catch (refreshErr: any) {
    console.warn('Could not refresh bank account balance via RPC:', refreshErr?.message);
  }

  // 8. Record Audit Log
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

/**
 * Imports a statement row, automatically creating a transaction if unique,
 * or flagging it under review if a matching date & cash transaction already exists.
 */
export async function importBankStatementRow(params: {
  bankAccountId: string;
  businessEntityId?: string | null;
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
  duplicateId?: string;
  duplicateReason?: string;
}> {
  const supabase = getSupabase();
  const type: 'IN' | 'OUT' = params.withdrawals > 0 ? 'OUT' : 'IN';
  const cashAmount = params.withdrawals > 0 ? params.withdrawals : params.deposits;
  const formattedDate = params.date.includes('T') ? params.date.split('T')[0] : params.date;

  // 1. Check for duplicate transaction matching exact date and cash amount
  const duplicateTxn = await findDuplicateTransaction({
    bankAccountId: params.bankAccountId,
    date: formattedDate,
    amount: cashAmount,
    type,
  });

  if (duplicateTxn) {
    const reason = `Found existing transaction #${duplicateTxn.id.slice(-6)} on ${formattedDate} for ₹${cashAmount.toLocaleString()} (${duplicateTxn.notes || duplicateTxn.description || 'No description'})`;
    const stmtId = await insertBankStatementTransaction({
      bank_account_id: params.bankAccountId,
      txn_date: formattedDate,
      description: params.particulars,
      debit_amount: params.withdrawals,
      credit_amount: params.deposits,
      balance: params.balance != null ? params.balance : undefined,
      reference: params.chequeNo,
      import_batch: params.importBatch,
      potential_duplicate_id: duplicateTxn.id,
      duplicate_reason: reason,
      review_status: 'under_review',
    });

    return {
      statementId: stmtId,
      status: 'under_review',
      duplicateId: duplicateTxn.id,
      duplicateReason: reason,
    };
  }

  // 2. No duplicate found -> Automatically create transaction in POS / ERP transactions ledger
  const txnId = `txn_bank_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const defaultCategory = type === 'IN' ? 'cat_bank_deposit' : 'cat_bank_charges';

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
    entity_id: null,
    product_id: null,
    quantity: null,
    description: params.particulars,
    notes: `Bank Statement: ${params.particulars}`,
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
    console.error('Failed to auto-create transaction for bank statement row:', txnErr);
    // If category does not exist, fallback to general categories
    newTxnPayload.category_id = type === 'IN' ? 'cat_sales' : 'cat_misc';
    const { error: retryErr } = await supabase.rpc('post_quick_transaction_atomic', {
      p_transaction: newTxnPayload,
    });
    if (retryErr) {
      console.warn('Fallback to general category failed, inserting transaction directly:', retryErr);
      newTxnPayload.category_id = null as any;
      await supabase.from('transactions').insert([newTxnPayload]);
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

  try {
    await supabase.rpc('refresh_bank_account_balance', { p_bank_account_id: params.bankAccountId });
  } catch {}

  return {
    statementId: stmtId,
    status: 'auto_added',
    transactionId: txnId,
  };
}

/**
 * Merge / Link an under-review statement row with an existing transaction.
 * Confirms that the statement entry is the bank proof of the existing transaction.
 * No duplicate transaction is created!
 */
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

/**
 * Approves an under-review statement row as a genuine new transaction.
 * Creates the transaction in the system and marks the statement row as auto_added.
 */
export async function approveDuplicateAsNewTransaction(
  statement: BankStatementTransaction,
  businessEntityId?: string | null
): Promise<string> {
  const supabase = getSupabase();
  const type: 'IN' | 'OUT' = statement.debit_amount > 0 ? 'OUT' : 'IN';
  const cashAmount = statement.debit_amount > 0 ? statement.debit_amount : statement.credit_amount;
  const txnId = `txn_bank_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const defaultCategory = type === 'IN' ? 'cat_bank_deposit' : 'cat_bank_charges';

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
    entity_id: null,
    product_id: null,
    quantity: null,
    description: statement.description || 'Bank Transaction',
    notes: `Bank Statement: ${statement.description || ''}`,
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
    await supabase.rpc('post_quick_transaction_atomic', {
      p_transaction: newTxnPayload,
    });
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

  try {
    await supabase.rpc('refresh_bank_account_balance', { p_bank_account_id: statement.bank_account_id });
  } catch {}

  return txnId;
}

/**
 * Dismisses an under-review statement row (skips adding to transactions).
 */
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
  oldData?: Partial<BankStatementTransaction>
): Promise<void> {
  const supabase = getSupabase();
  const available = await getAvailableBstColumns();
  const updatePayload: Record<string, any> = {};
  if (data.txn_date !== undefined) {
    updatePayload.txn_date = data.txn_date.includes('T') ? data.txn_date.split('T')[0] : data.txn_date;
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

  await recordAuditLog({
    entity_type: 'bank_statement_transactions',
    record_id: id,
    old_values: oldData,
    new_values: updatePayload,
    action: 'UPDATE',
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

