import { getSupabase } from '../supabase';

/**
 * Completely wipes ALL ERP & POS data from Supabase.
 * Calls the atomic SECURITY DEFINER RPC `wipe_all_erp_data` first (which bypasses
 * ledger zero-DELETE RLS constraints safely on the server), with exec_sql and
 * multi-table client fallbacks.
 */
export async function clearDb(keepCategories: boolean = false): Promise<void> {
  const supabase = getSupabase();

  // 1. Primary atomic wipe via SECURITY DEFINER RPC
  try {
    const { error: rpcErr } = await supabase.rpc('wipe_all_erp_data', {
      p_keep_categories: keepCategories,
    });
    if (!rpcErr) {
      return;
    }
    // If any other unexpected RPC error occurred (not missing function), surface or fall back
    if (rpcErr.code !== 'PGRST202' && !rpcErr.message?.includes('not find')) {
      console.warn('wipe_all_erp_data RPC error, trying exec_sql fallback:', rpcErr.message);
    }
  } catch (e) {
    console.warn('wipe_all_erp_data call failed, trying fallbacks:', e);
  }

  // 2. Fallback: Use exec_sql RPC if installed
  try {
    const catDelete = keepCategories ? '' : 'DELETE FROM public.categories;';
    const { error: execErr } = await supabase.rpc('exec_sql', {
      query: `
        DELETE FROM public.edit_audit_logs;
        DELETE FROM public.bank_reconciliation_matches;
        DELETE FROM public.bank_statement_transactions;
        DELETE FROM public.credit_payments;
        DELETE FROM public.voucher_lines;
        DELETE FROM public.vouchers;
        DELETE FROM public.salary_records;
        DELETE FROM public.journal_lines;
        DELETE FROM public.journal_entries;
        DELETE FROM public.production_entries;
        DELETE FROM public.stock_movements;
        DELETE FROM public.stock_balances;
        DELETE FROM public.transactions;
        DELETE FROM public.product_variants;
        DELETE FROM public.products;
        DELETE FROM public.bank_accounts;
        DELETE FROM public.employees;
        DELETE FROM public.partners;
        DELETE FROM public.business_entities;
        DELETE FROM public.custom_fields;
        DELETE FROM public.entities;
        ${catDelete}
        DELETE FROM public.erp_settings;
        DELETE FROM public.voucher_sequences;
        DELETE FROM public.accounts WHERE COALESCE(is_system, false) = false;
        DELETE FROM public.units_of_measurement
        WHERE id NOT IN ('uom_sheets', 'uom_pieces', 'uom_sqft', 'uom_sqm', 'uom_kg', 'uom_litre');
      `,
    });
    if (!execErr) {
      return;
    }
  } catch {
    // Proceed to direct PostgREST fallback
  }

  // 3. Direct PostgREST multi-table wipe in FK cascade order
  const idTables = [
    'edit_audit_logs',
    'bank_reconciliation_matches',
    'bank_statement_transactions',
    'credit_payments',
    'voucher_lines',
    'vouchers',
    'salary_records',
    'journal_lines',
    'journal_entries',
    'production_entries',
    'stock_movements',
    'stock_balances',
    'transactions',
    'product_variants',
    'products',
    'bank_accounts',
    'employees',
    'partners',
    'business_entities',
    'custom_fields',
    'entities',
    ...(keepCategories ? [] : ['categories']),
    'voucher_sequences',
  ];

  const failures: string[] = [];
  for (const tbl of idTables) {
    try {
      const { error } = await supabase.from(tbl).delete().neq('id', '___none___');
      if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
        failures.push(`${tbl}: ${error.message}`);
      }
    } catch (err: any) {
      failures.push(`${tbl}: ${err?.message || err}`);
    }
  }

  // Settings uses 'key' PK
  try {
    const { error } = await supabase.from('erp_settings').delete().neq('key', '___none___');
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
      failures.push(`erp_settings: ${error.message}`);
    }
  } catch {}

  // Custom accounts & custom units
  try {
    await supabase.from('accounts').delete().eq('is_system', false);
  } catch {}
  try {
    await supabase
      .from('units_of_measurement')
      .delete()
      .not('id', 'in', '("uom_sheets","uom_pieces","uom_sqft","uom_sqm","uom_kg","uom_litre")');
  } catch {}

  if (failures.length > 0) {
    throw new Error(
      `Some tables could not be wiped directly (${failures.join('; ')}). Please run "Auto-Sync Master Schema" once to install wipe_all_erp_data RPC.`
    );
  }
}
