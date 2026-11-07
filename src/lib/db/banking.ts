// ============================================================
// BANKING DATABASE QUERIES
// src/lib/db/banking.ts
// ============================================================
import { getSupabase } from '../supabase';
import type { BankStatementTransaction } from './erp';

export async function getBankStatementTransactions(params: {
  bankAccountId?: string;
  isMatched?: boolean;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<BankStatementTransaction[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('bank_statement_transactions')
    .select(`
      *,
      bank_accounts(bank_name, account_no),
      bank_reconciliation_matches(*)
    `)
    .order('txn_date', { ascending: false });

  if (params.bankAccountId) q = q.eq('bank_account_id', params.bankAccountId);
  if (params.isMatched !== undefined) q = q.eq('is_matched', params.isMatched);
  if (params.fromDate) q = q.gte('txn_date', params.fromDate);
  if (params.toDate) q = q.lte('txn_date', params.toDate);
  if (params.limit) q = q.limit(params.limit);

  const { data, error } = await q;
  if (error) { console.warn('Error fetching bank_statement_transactions:', error.message); return []; }

  return ((data || []) as any[]).map(r => ({
    ...r,
    bank_name: r.bank_accounts?.bank_name ?? undefined,
    account_no: r.bank_accounts?.account_no ?? undefined,
    match: r.bank_reconciliation_matches?.[0] ?? null,
  }));
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
}): Promise<string> {
  const supabase = getSupabase();
  const id = `bst_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const { error } = await supabase.from('bank_statement_transactions').insert([{
    id,
    bank_account_id: data.bank_account_id,
    txn_date: data.txn_date,
    description: data.description || null,
    debit_amount: data.debit_amount || 0,
    credit_amount: data.credit_amount || 0,
    balance: data.balance ?? null,
    reference: data.reference || null,
    import_batch: data.import_batch || null,
    is_matched: false,
  }]);
  if (error) {
    // Duplicate import protection — skip on unique conflict
    if (error.code === '23505') return 'duplicate';
    console.error('Error inserting bank statement txn:', error); throw error;
  }
  return id;
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

  const { error: matchErr } = await supabase.from('bank_reconciliation_matches').insert([{
    id,
    bank_statement_txn_id: params.bank_statement_txn_id,
    voucher_id: params.voucher_id || null,
    salary_record_id: params.salary_record_id || null,
    journal_entry_id: params.journal_entry_id || null,
    matched_amount: params.matched_amount,
  }]);
  if (matchErr) { console.error('Error matching bank transaction:', matchErr); throw matchErr; }

  // Mark statement row as matched
  const { error: upErr } = await supabase
    .from('bank_statement_transactions')
    .update({ is_matched: true })
    .eq('id', params.bank_statement_txn_id);
  if (upErr) throw upErr;
}

export async function unmatchBankTransaction(bankStatementTxnId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from('bank_reconciliation_matches').delete().eq('bank_statement_txn_id', bankStatementTxnId);
  await supabase.from('bank_statement_transactions').update({ is_matched: false }).eq('id', bankStatementTxnId);
}
