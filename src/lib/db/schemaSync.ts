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
] as const;

/**
 * Checks whether the Supabase database schema is fully up to date with all ERP & POS tables,
 * columns, and atomic PL/pgSQL stored procedures.
 */
export async function checkSchemaHealth(): Promise<SchemaHealthResult> {
  const supabase = getSupabase();
  const missingTables: string[] = [];
  const missingColumns: string[] = [];
  const missingFunctions: string[] = [];

  // 1. Verify all 24 required tables
  const tableChecks = await Promise.allSettled(
    ALL_REQUIRED_TABLES.map(async (table) => {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error && (error.code === '42P01' || error.code === 'PGRST205')) {
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

  // 2. Verify critical hardened columns on tables that exist
  if (!missingTables.includes('vouchers')) {
    const { error } = await supabase.from('vouchers').select('journal_entry_id, updated_at', { head: true }).limit(1);
    if (error && (error.code === '42703' || error.message.includes('column') || error.code === 'PGRST204')) {
      missingColumns.push('vouchers.journal_entry_id');
    }
  }

  if (!missingTables.includes('stock_balances')) {
    const { error } = await supabase.from('stock_balances').select('variant_id, qty_sheets', { head: true }).limit(1);
    if (error && (error.code === '42703' || error.message.includes('column') || error.code === 'PGRST204')) {
      missingColumns.push('stock_balances.variant_id');
    }
  }

  if (!missingTables.includes('transactions')) {
    const { error } = await supabase.from('transactions').select('total_amount, paid_amount, balance_due, credit_status', { head: true }).limit(1);
    if (error && (error.code === '42703' || error.message.includes('column') || error.code === 'PGRST204')) {
      missingColumns.push('transactions.balance_due');
    }
  }

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

  const isFit = missingTables.length === 0 && missingColumns.length === 0 && missingFunctions.length === 0;

  let summary = 'Schema is fully up to date and verified.';
  if (!isFit) {
    const parts: string[] = [];
    if (missingTables.length > 0) parts.push(`Missing tables: ${missingTables.join(', ')}`);
    if (missingColumns.length > 0) parts.push(`Missing columns: ${missingColumns.join(', ')}`);
    if (missingFunctions.length > 0) parts.push(`Missing functions: ${missingFunctions.join(', ')}`);
    summary = parts.join(' | ');
  }

  return {
    isFit,
    missingTables,
    missingColumns,
    missingFunctions,
    summary,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Runs the complete master schema in Supabase.
 * First tries invoking the secure server-side RPC `exec_sql`.
 */
export async function applyMasterSchema(sqlQuery: string = MASTER_SCHEMA_SQL): Promise<{
  success: boolean;
  message: string;
  error?: string;
  missingItems?: string[];
}> {
  const supabase = getSupabase();

  try {
    // Attempt 1: Execute via exec_sql RPC
    const { error: rpcError } = await supabase.rpc('exec_sql', { query: sqlQuery });

    if (!rpcError) {
      // Re-verify schema fitness
      const health = await checkSchemaHealth();
      if (health.isFit) {
        return {
          success: true,
          message: 'Master schema applied and verified successfully in Supabase database!',
        };
      } else {
        return {
          success: false,
          message: `Schema executed, but some components remain missing: ${health.summary}`,
          missingItems: [...health.missingTables, ...health.missingColumns, ...health.missingFunctions],
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

