// =========================================================================
// PLYWOOD POS & ERP - DATABASE SCHEMA HEALTH & AUTO-SYNC ENGINE
// src/lib/db/schemaSync.ts
// =========================================================================

import { getSupabase } from '../supabase';
import { MASTER_SCHEMA_SQL } from './masterSchemaSql';

export interface SchemaHealthResult {
  isFit: boolean;
  missingTables: string[];
  missingColumns: string[];
  missingFunctions: string[];
  totalTables: number;
  verifiedTablesCount: number;
  totalColumns: number;
  verifiedColumnsCount: number;
  connectionError?: string;
  summary: string;
  checkedAt: string;
}

export const ALL_REQUIRED_TABLES = [
  'categories',
  'entities',
  'custom_fields',
  'transactions',
  'credit_payments',
  'business_entities',
  'accounts',
  'products',
  'product_variants',
  'employees',
  'partners',
  'bank_accounts',
  'stock_balances',
  'stock_movements',
  'production_entries',
  'vouchers',
  'voucher_lines',
  'journal_entries',
  'journal_lines',
  'salary_records',
  'bank_statement_transactions',
  'bank_reconciliation_matches',
  'erp_settings',
  'voucher_sequences',
  'units_of_measurement',
  'edit_audit_logs',
] as const;

export type RequiredTable = (typeof ALL_REQUIRED_TABLES)[number];

export const MASTER_TABLE_COLUMNS: Record<RequiredTable, string[]> = {
  categories: ['id', 'name', 'type', 'color', 'icon', 'description', 'created_at'],
  entities: [
    'id', 'name', 'type', 'phone', 'address', 'notes',
    'email', 'alt_phone', 'gstin', 'contact_person', 'payment_terms',
    'credit_limit', 'credit_period', 'credit_terms', 'created_at',
  ],
  custom_fields: ['id', 'name', 'type', 'apply_to', 'created_at'],
  transactions: [
    'id', 'type', 'amount', 'total_amount', 'paid_amount', 'balance_due',
    'credit_status', 'due_date', 'date', 'category_id', 'entity_id',
    'product_id', 'quantity', 'description', 'notes', 'reference',
    'custom_data', 'business_entity_id', 'created_at',
  ],
  credit_payments: [
    'id', 'transaction_id', 'entity_id', 'amount', 'payment_type',
    'payment_date', 'notes', 'created_at',
  ],
  business_entities: [
    'id', 'name', 'entity_type', 'parent_id', 'address', 'phone',
    'gstin', 'location', 'description', 'is_active', 'created_at',
  ],
  accounts: [
    'id', 'name', 'account_type', 'sub_type', 'parent_id',
    'is_system', 'is_active', 'created_at',
  ],
  products: [
    'id', 'name', 'category', 'unit', 'description', 'sku', 'brand',
    'grade', 'purchase_price', 'selling_price', 'wholesale_price',
    'min_stock_level', 'is_active', 'created_at',
  ],
  product_variants: [
    'id', 'product_id', 'size', 'thickness', 'sqft_per_sheet', 'sku',
    'unit', 'purchase_price', 'selling_price', 'wholesale_price',
    'grade', 'min_stock_level', 'is_active', 'created_at',
  ],
  employees: [
    'id', 'name', 'designation', 'monthly_salary', 'phone', 'join_date',
    'bank_account_no', 'ifsc', 'is_active', 'created_at',
  ],
  partners: [
    'id', 'name', 'monthly_remun', 'profit_share_pct', 'phone',
    'address', 'is_active', 'created_at',
  ],
  bank_accounts: [
    'id', 'business_entity_id', 'bank_name', 'account_no', 'branch',
    'branch_name', 'ifsc', 'opening_balance', 'current_balance',
    'is_active', 'created_at',
  ],
  stock_balances: [
    'id', 'business_entity_id', 'product_id', 'variant_id', 'qty_sheets',
    'qty_sqft', 'qty_pieces', 'qty_other', 'avg_cost', 'updated_at',
  ],
  stock_movements: [
    'id', 'business_entity_id', 'product_id', 'variant_id', 'movement_type',
    'qty_sheets', 'qty_sqft', 'qty_pieces', 'qty_other', 'unit_cost',
    'reference_id', 'reference_type', 'narration', 'movement_date', 'created_at',
  ],
  production_entries: [
    'id', 'business_entity_id', 'production_date', 'plywood_product_id',
    'plywood_variant_id', 'sheets_produced', 'sqft_produced',
    'face_veneer_product_id', 'face_veneer_ratio', 'face_veneer_consumed',
    'veneer_movement_id', 'plywood_movement_id', 'status', 'notes', 'created_at',
  ],
  vouchers: [
    'id', 'business_entity_id', 'voucher_type', 'voucher_number', 'voucher_date',
    'party_entity_id', 'subtotal', 'tax_amount', 'total_amount', 'paid_amount',
    'balance_due', 'payment_status', 'payment_method', 'bank_account_id',
    'reference', 'narration', 'source_transaction_id', 'journal_entry_id',
    'status', 'created_at', 'updated_at',
  ],
  voucher_lines: [
    'id', 'voucher_id', 'line_no', 'product_id', 'variant_id', 'description',
    'unit', 'quantity', 'quantity_sqft', 'rate', 'tax_percent', 'tax_amount',
    'line_total', 'unit_cost', 'debit_account_id', 'credit_account_id', 'created_at',
  ],
  journal_entries: [
    'id', 'business_entity_id', 'entry_date', 'reference', 'narration',
    'total_debit', 'total_credit', 'is_balanced', 'status', 'created_at', 'updated_at',
  ],
  journal_lines: [
    'id', 'journal_id', 'account_id', 'debit_amount', 'credit_amount',
    'narration', 'created_at',
  ],
  salary_records: [
    'id', 'business_entity_id', 'voucher_date', 'salary_month', 'salary_frequency',
    'payee_type', 'employee_id', 'partner_id', 'payee_name', 'booked_amount',
    'paid_amount', 'status', 'expense_account_id', 'payable_account_id',
    'booking_journal_id', 'payment_journal_id', 'payment_method', 'bank_account_id',
    'payment_reference', 'payment_date', 'narration', 'created_at',
  ],
  bank_statement_transactions: [
    'id', 'bank_account_id', 'txn_date', 'description', 'reference_no',
    'reference', 'debit_amount', 'credit_amount', 'balance_after', 'balance',
    'is_matched', 'import_batch', 'transaction_id', 'potential_duplicate_id',
    'duplicate_reason', 'review_status', 'created_at',
  ],
  bank_reconciliation_matches: [
    'id', 'bank_statement_txn_id', 'voucher_id', 'salary_record_id',
    'journal_entry_id', 'matched_amount', 'matched_at',
  ],
  erp_settings: ['key', 'value', 'updated_at'],
  voucher_sequences: ['id', 'last_number', 'updated_at'],
  units_of_measurement: [
    'id', 'name', 'abbreviation', 'conversion_factor', 'base_unit',
    'description', 'is_active', 'created_at', 'updated_at',
  ],
  edit_audit_logs: [
    'id', 'entity_type', 'record_id', 'user_identifier', 'action',
    'old_values', 'new_values', 'created_at',
  ],
};

/**
 * Checks whether the Supabase database schema is fully up to date with all ERP & POS tables,
 * every column relation, and atomic PL/pgSQL stored procedures.
 */
export async function checkSchemaHealth(): Promise<SchemaHealthResult> {
  const supabase = getSupabase();
  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const missingFunctions: string[] = [];

  const totalTables = ALL_REQUIRED_TABLES.length;
  let totalColumns = 0;
  for (const cols of Object.values(MASTER_TABLE_COLUMNS)) {
    totalColumns += cols.length;
  }

  // 0. Verify basic network and database connectivity
  try {
    const { error: pingError } = await supabase.from('categories').select('id', { head: true }).limit(1);
    if (pingError) {
      // 42P01: relation does not exist (valid connection, just empty/missing schema)
      // PGRST205: relation does not exist in schema cache
      if (pingError.code !== '42P01' && pingError.code !== 'PGRST205') {
        const connErr = pingError.message || `Supabase error (${pingError.code || 'unknown'})`;
        return {
          isFit: false,
          missingTables: [...ALL_REQUIRED_TABLES],
          missingColumns: [],
          missingFunctions: [],
          totalTables,
          verifiedTablesCount: 0,
          totalColumns,
          verifiedColumnsCount: 0,
          connectionError: connErr,
          summary: `Database connection failed: ${connErr}`,
          checkedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err: any) {
    const connErr = err?.message || 'Network connection failed';
    return {
      isFit: false,
      missingTables: [...ALL_REQUIRED_TABLES],
      missingColumns: [],
      missingFunctions: [],
      totalTables,
      verifiedTablesCount: 0,
      totalColumns,
      verifiedColumnsCount: 0,
      connectionError: connErr,
      summary: `Database connection failed: ${connErr}`,
      checkedAt: new Date().toISOString(),
    };
  }

  // 1. Verify all 26 required tables
  const tableChecks = await Promise.allSettled(
    ALL_REQUIRED_TABLES.map(async (table) => {
      const probeCol = MASTER_TABLE_COLUMNS[table]?.[0] || 'id';
      const { error } = await supabase.from(table).select(probeCol).limit(1);
      if (
        error &&
        (error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.message?.includes('relation') ||
          error.message?.includes('schema cache'))
      ) {
        return table;
      }
      return null;
    })
  );

  for (const res of tableChecks) {
    if (res.status === 'fulfilled' && res.value) {
      missingTables.push(res.value);
    }
  }

  // 2. Comprehensive Column-Level Verification for all existing tables
  const existingTables = ALL_REQUIRED_TABLES.filter((t) => !missingTables.includes(t));

  await Promise.allSettled(
    existingTables.map(async (table) => {
      const expectedCols = MASTER_TABLE_COLUMNS[table];
      // Fast path: probe all columns of this table in a single select query (limit 1)
      const { error } = await supabase.from(table).select(expectedCols.join(',')).limit(1);

      if (!error) {
        // All expected columns exist!
        return;
      }

      // If an error occurred, probe columns individually to find exact missing columns
      for (const col of expectedCols) {
        const { error: colErr } = await supabase.from(table).select(col).limit(1);
        if (
          colErr &&
          (colErr.code === '42703' ||
            colErr.code === 'PGRST204' ||
            colErr.message?.includes('column') ||
            colErr.message?.includes('schema cache'))
        ) {
          missingColumns.push(`${table}.${col}`);
        }
      }
    })
  );

  // Calculate accurate verification metrics
  const missingColsFromMissingTables = missingTables.reduce(
    (acc, t) => acc + (MASTER_TABLE_COLUMNS[t as RequiredTable]?.length || 0),
    0
  );
  const verifiedTablesCount = totalTables - missingTables.length;
  const verifiedColumnsCount = Math.max(0, totalColumns - missingColumns.length - missingColsFromMissingTables);

  // 3. Verify critical atomic stored procedures
  // Check exec_sql helper
  try {
    const { error: execErr } = await supabase.rpc('exec_sql', { query: 'SELECT 1;' });
    if (execErr && (execErr.code === 'PGRST202' || execErr.message?.includes('not find'))) {
      missingFunctions.push('exec_sql');
    }
  } catch {
    missingFunctions.push('exec_sql');
  }

  // Check get_next_voucher_number
  try {
    const { error: seqErr } = await supabase.rpc('get_next_voucher_number', {
      p_prefix: 'PING',
      p_year: new Date().getFullYear(),
    });
    if (seqErr && (seqErr.code === 'PGRST202' || seqErr.message?.includes('not find'))) {
      missingFunctions.push('get_next_voucher_number');
    }
  } catch {
    missingFunctions.push('get_next_voucher_number');
  }

  // Check update_journal_entry
  try {
    const { error: jeErr } = await supabase.rpc('update_journal_entry', {
      p_journal_id: 'non_existent_probe',
      p_entry_date: new Date().toISOString(),
      p_reference: null,
      p_narration: 'probe',
      p_lines: [
        { account_id: 'acc_cash', debit_amount: 1, credit_amount: 0 },
        { account_id: 'acc_sales', debit_amount: 0, credit_amount: 1 },
      ],
    });
    if (jeErr && (jeErr.code === 'PGRST202' || jeErr.message?.includes('not find'))) {
      missingFunctions.push('update_journal_entry');
    }
  } catch {
    missingFunctions.push('update_journal_entry');
  }

  // Check update_salary_booking
  try {
    const { error: salErr } = await supabase.rpc('update_salary_booking', {
      p_record_id: 'non_existent_probe',
      p_voucher_date: new Date().toISOString(),
      p_salary_month: '2026-01',
      p_salary_frequency: 'monthly',
      p_payee_type: 'employee',
      p_employee_id: null,
      p_partner_id: null,
      p_payee_name: 'probe',
      p_booked_amount: 1,
      p_narration: 'probe',
    });
    if (salErr && (salErr.code === 'PGRST202' || salErr.message?.includes('not find'))) {
      missingFunctions.push('update_salary_booking');
    }
  } catch {
    missingFunctions.push('update_salary_booking');
  }

  // Check delete_bank_statement_transactions_atomic (0-row no-op check triggers PGRST202 if outdated schema)
  try {
    const { error: bstErr } = await supabase.rpc('delete_bank_statement_transactions_atomic', {
      p_ids: [],
      p_delete_linked_auto_txns: true,
    });
    if (bstErr && (bstErr.code === 'PGRST202' || bstErr.message?.includes('not find'))) {
      missingFunctions.push('delete_bank_statement_transactions_atomic');
    }
  } catch {
    missingFunctions.push('delete_bank_statement_transactions_atomic');
  }

  const isFit = missingTables.length === 0 && missingColumns.length === 0 && missingFunctions.length === 0;

  let summary = `Schema is fully up to date (${verifiedTablesCount}/${totalTables} tables, ${verifiedColumnsCount}/${totalColumns} columns verified).`;
  if (!isFit) {
    const parts: string[] = [];
    if (missingTables.length > 0) parts.push(`Missing tables (${missingTables.length}): ${missingTables.join(', ')}`);
    if (missingColumns.length > 0) parts.push(`Missing columns (${missingColumns.length}): ${missingColumns.join(', ')}`);
    if (missingFunctions.length > 0) parts.push(`Missing functions: ${missingFunctions.join(', ')}`);
    summary = parts.join(' | ');
  }

  return {
    isFit,
    missingTables,
    missingColumns,
    missingFunctions,
    totalTables,
    verifiedTablesCount,
    totalColumns,
    verifiedColumnsCount,
    summary,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Runs the complete master schema in Supabase.
 * Executes DDL via exec_sql RPC, reloads PostgREST cache, and thoroughly verifies
 * all tables and column relations.
 */
export async function applyMasterSchema(sqlQuery: string = MASTER_SCHEMA_SQL): Promise<{
  success: boolean;
  message: string;
  error?: string;
  missingItems?: string[];
  health?: SchemaHealthResult;
}> {
  const supabase = getSupabase();

  try {
    // Attempt 1: Execute via exec_sql RPC
    const { error: rpcError } = await supabase.rpc('exec_sql', { query: sqlQuery });

    if (!rpcError) {
      // Force PostgREST schema cache reload
      try {
        await supabase.rpc('exec_sql', { query: "NOTIFY pgrst, 'reload schema';" });
      } catch {
        // non-blocking
      }

      // Re-verify schema fitness with exhaustive column checks
      const health = await checkSchemaHealth();
      if (health.isFit) {
        return {
          success: true,
          message: `Master schema applied and verified successfully! (${health.verifiedTablesCount}/${health.totalTables} tables, ${health.verifiedColumnsCount}/${health.totalColumns} columns verified)`,
          health,
        };
      } else {
        return {
          success: false,
          message: `Schema executed, but some components remain missing: ${health.summary}`,
          missingItems: [...health.missingTables, ...health.missingColumns, ...health.missingFunctions],
          health,
        };
      }
    }

    // If exec_sql RPC is not found (PGRST202), Postgres requires initial setup in SQL Editor
    if (rpcError.code === 'PGRST202' || rpcError.message?.includes('not find')) {
      return {
        success: false,
        message:
          'Automatic DDL runner (exec_sql) is not yet active in your Supabase database. Please copy supabase.sql and run it once in your Supabase SQL Editor.',
        error: rpcError.message,
      };
    }

    return {
      success: false,
      message: `Failed to apply schema: ${rpcError.message}`,
      error: rpcError.message,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Unexpected error running master schema in Supabase.',
      error: err.message,
    };
  }
}
