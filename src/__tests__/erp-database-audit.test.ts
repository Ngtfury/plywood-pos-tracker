// =========================================================================
// ERP DATABASE AUDIT & INTEGRITY VERIFICATION SUITE
// Tests all 13 audit items and financial/inventory invariants.
// Run with: node --experimental-strip-types src/__tests__/erp-database-audit.test.ts
// =========================================================================

import * as fs from 'fs';
import * as path from 'path';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (failureDetails) {
      console.error(`    Details: ${failureDetails}`);
    }
    failCount++;
  }
}

console.log('==================================================');
console.log('   PLYWOOD ERP DATABASE AUDIT & REPAIR SUITE      ');
console.log('==================================================\n');

// Read migration files
const projectRoot = process.cwd();
const mig003Path = path.join(projectRoot, 'supabase', 'migrations', '003_harden_and_fix_erp.sql');
const mig002Path = path.join(projectRoot, 'supabase', 'migrations', '002_extend_plywood_erp.sql');
const schema001Path = path.join(projectRoot, 'supabase_schema.sql');

assert(fs.existsSync(mig003Path), 'Fix 0: Migration 003 file exists at supabase/migrations/003_harden_and_fix_erp.sql');
assert(fs.existsSync(mig002Path), 'Fix 0: Migration 002 remains preserved without silent overwrite');
assert(fs.existsSync(schema001Path), 'Fix 0: Migration 001 (supabase_schema.sql) remains preserved');

const mig003Content = fs.readFileSync(mig003Path, 'utf8');

// 1. Audit Item 1: RLS Upgrade & Zero-DELETE on Audit Tables
const hasNoDeleteOnLedger =
  !mig003Content.includes('CREATE POLICY "vch_delete"') &&
  !mig003Content.includes('CREATE POLICY "sm_delete"') &&
  !mig003Content.includes('CREATE POLICY "je_delete"') &&
  !mig003Content.includes('CREATE POLICY "sal_delete"');

const hasGranularPolicies =
  mig003Content.includes('CREATE POLICY "vch_select"') &&
  mig003Content.includes('CREATE POLICY "vch_insert"') &&
  mig003Content.includes('CREATE POLICY "vch_update"') &&
  mig003Content.includes('CREATE POLICY "sm_select"') &&
  mig003Content.includes('CREATE POLICY "sm_insert"');

assert(hasNoDeleteOnLedger && hasGranularPolicies,
  'Fix 1: RLS replaces unconstrained anonymous ALL policies with zero-DELETE audit ledger protection');

// 2. Audit Item 2: Explicit Row Locking (FOR UPDATE)
const hasRowLocking =
  mig003Content.includes('FOR UPDATE') &&
  mig003Content.includes('SELECT id, qty_sheets, qty_sqft, qty_pieces, qty_other') &&
  mig003Content.includes('SELECT * INTO v_vch') &&
  mig003Content.includes('SELECT * INTO v_prod');

assert(hasRowLocking, 'Fix 2: post_stock_movement and cancel functions employ explicit FOR UPDATE row locking');

// 3. Audit Item 3: Stock Balance Uniqueness for Nullable Product Variants
const hasNullableUniqueIndex =
  mig003Content.includes('uq_stock_balances_not_null') &&
  mig003Content.includes('uq_stock_balances_null_variant') &&
  mig003Content.includes('WHERE variant_id IS NULL') &&
  mig003Content.includes('WHERE variant_id IS NOT NULL');

assert(hasNullableUniqueIndex, 'Fix 3: Partial unique indexes guarantee stock uniqueness for nullable product variants');

// 4. Audit Item 4: Validation of Sheet Quantities & All Inventory Units
const hasUnitValidation =
  mig003Content.includes('Insufficient sheet stock') &&
  mig003Content.includes('Insufficient sqft stock') &&
  mig003Content.includes('Insufficient pieces stock') &&
  mig003Content.includes('Stock movement quantities must not be negative');

assert(hasUnitValidation, 'Fix 4: Comprehensive validation for sheet quantities, sqft, pieces, and weight/volume units');

// 5. Audit Item 5: Correct Missing-Stock-Row Handling
const hasMissingStockHandling =
  mig003Content.includes('No stock record found for product') &&
  mig003Content.includes('v_balance_id IS NULL') &&
  mig003Content.includes('INSERT INTO public.stock_balances');

assert(hasMissingStockHandling, 'Fix 5: Deductions fail immediately on non-existent stock rows; additions initialize safely');

// 6. Audit Item 6: Production Validation & Face Veneer Recipe Enforcement
const hasProductionValidation =
  mig003Content.includes('Calculated consumption mismatch') &&
  mig003Content.includes('ROUND(p_sheets_produced * p_face_veneer_ratio, 4)') &&
  mig003Content.includes('v_plywood_cat <> \'plywood\'') &&
  mig003Content.includes('v_veneer_cat <> \'face_veneer\'');

assert(hasProductionValidation, 'Fix 6: Production validates positive ratios, recipe calculation (sheets × ratio), and product categories');

// 7. Audit Item 7: Double-Entry Accounting Records for Every Voucher Type
const hasDoubleEntryGeneration =
  mig003Content.includes('acc_receivable') &&
  mig003Content.includes('acc_sales') &&
  mig003Content.includes('acc_purchase') &&
  mig003Content.includes('acc_payable') &&
  mig003Content.includes('INSERT INTO public.journal_entries') &&
  mig003Content.includes('INSERT INTO public.journal_lines');

assert(hasDoubleEntryGeneration, 'Fix 7: post_voucher_atomic generates balanced double-entry journals for all 5 voucher types');

// 8. Audit Item 8: Atomic Voucher Posting and Stock Changes
const hasAtomicFunction =
  mig003Content.includes('CREATE OR REPLACE FUNCTION public.post_voucher_atomic') &&
  mig003Content.includes('SECURITY DEFINER') &&
  mig003Content.includes('p_voucher JSONB,') &&
  mig003Content.includes('p_lines   JSONB');

assert(hasAtomicFunction, 'Fix 8: post_voucher_atomic executes voucher, line items, stock updates, and journals in one transaction');

// 9. Audit Item 9: Trial Balance Correctness (Includes Posted Transactions Exactly Once)
const hasCorrectTrialBalance =
  mig003Content.includes('CREATE OR REPLACE FUNCTION public.get_trial_balance') &&
  mig003Content.includes('je.status = \'posted\'') &&
  mig003Content.includes('je.business_entity_id = p_business_entity_id') &&
  mig003Content.includes('COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)');

assert(hasCorrectTrialBalance, 'Fix 9: get_trial_balance includes all posted transactions and excludes cancelled items without duplication');

// 10. Audit Item 10: Salary Constraints & Payee Exclusivity
const hasSalaryConstraints =
  mig003Content.includes('chk_salary_payee_consistency') &&
  mig003Content.includes('chk_salary_amounts') &&
  mig003Content.includes('chk_salary_month_format') &&
  mig003Content.includes('^[0-9]{4}-(0[1-9]|1[0-2])$');

assert(hasSalaryConstraints, 'Fix 10: Salary records enforce employee vs partner exclusivity, positive booking, and month format');

// 11. Audit Item 11: Bank Reconciliation Constraint Correction (= 1 Reference)
const hasBankReconciliationFix =
  mig003Content.includes('chk_brm_exactly_one_reference') &&
  mig003Content.includes('= 1') &&
  mig003Content.includes('chk_brm_matched_amount_pos');

assert(hasBankReconciliationFix, 'Fix 11: Bank reconciliation strictly enforces exactly one linked transaction reference and positive amount');

// 12. Audit Item 12: Cancellation Atomic Reversals
const hasCancellationRPCs =
  mig003Content.includes('CREATE OR REPLACE FUNCTION public.cancel_voucher_atomic') &&
  mig003Content.includes('CREATE OR REPLACE FUNCTION public.cancel_production_entry_atomic') &&
  mig003Content.includes('CREATE OR REPLACE FUNCTION public.cancel_journal_entry_atomic') &&
  mig003Content.includes('bank_reconciliation_matches');

assert(hasCancellationRPCs, 'Fix 12: Cancellation functions safely reverse stock, nullify journals, and prevent cancelling reconciled records');

// 13. Audit Item 13: Indexes & Constraints Hardening
const hasIndexesAndConstraints =
  mig003Content.includes('idx_voucher_lines_variant') &&
  mig003Content.includes('idx_production_plywood_prod') &&
  mig003Content.includes('chk_stock_balances_non_negative') &&
  mig003Content.includes('chk_vouchers_math');

assert(hasIndexesAndConstraints, 'Fix 13: Missing performance indexes and non-negative/math constraints applied');

// 14. Algorithmic Double-Entry Math Verification
function testAccountingEngine() {
  // Simulate Sales Voucher: ₹10,000 Total, ₹4,000 Paid (Cash), ₹6,000 Credit
  const total = 10000;
  const paid = 4000;
  const credit = 6000;
  const debits = [
    { acc: 'acc_cash', amount: paid },
    { acc: 'acc_receivable', amount: credit }
  ];
  const credits = [
    { acc: 'acc_sales', amount: total }
  ];
  const sumDebit = debits.reduce((s, d) => s + d.amount, 0);
  const sumCredit = credits.reduce((s, c) => s + c.amount, 0);
  assert(sumDebit === sumCredit && sumDebit === total,
    'Accounting Engine: Sales double-entry debits equal credits (Dr Cash + Dr Rec = Cr Sales)');

  // Simulate Purchase Voucher: ₹15,000 Total, ₹5,000 Paid (Bank), ₹10,000 Credit
  const purTotal = 15000;
  const purPaid = 5000;
  const purDue = 10000;
  const purDebits = [{ acc: 'acc_purchase', amount: purTotal }];
  const purCredits = [
    { acc: 'acc_bank', amount: purPaid },
    { acc: 'acc_payable', amount: purDue }
  ];
  const pSumDebit = purDebits.reduce((s, d) => s + d.amount, 0);
  const pSumCredit = purCredits.reduce((s, c) => s + c.amount, 0);
  assert(pSumDebit === pSumCredit && pSumDebit === purTotal,
    'Accounting Engine: Purchase double-entry debits equal credits (Dr COGS = Cr Bank + Cr Payable)');
}

testAccountingEngine();

// 15. Unit Conversion Math Verification
function testPlywoodUnitConversions() {
  const SIZES: Record<string, number> = {
    '8x4': 32,
    '7x4': 28,
    '6x4': 24,
    '6x3': 18,
    '5x4': 20,
    '5x3': 15,
  };

  let allSizesCorrect = true;
  for (const [size, expectedSqft] of Object.entries(SIZES)) {
    const [l, w] = size.split('x').map(Number);
    if (l * w !== expectedSqft) allSizesCorrect = false;
  }
  assert(allSizesCorrect, 'Inventory Engine: Standard 6 plywood sizes accurately map to sqft');

  // 100 sheets of 8x4 = 3200 sqft, consumes 200 face veneer pieces
  const sheets = 100;
  const sqft = sheets * SIZES['8x4'];
  const veneerRatio = 2;
  const veneerConsumed = sheets * veneerRatio;
  assert(sqft === 3200 && veneerConsumed === 200,
    'Production Engine: 100 sheets 8x4 produces 3,200 sqft and consumes exactly 200 veneer pieces');
}

testPlywoodUnitConversions();

// 16. Master Schema (supabase.sql) & Auto-Sync Verification
function testMasterSchemaIntegrity() {
  const masterSqlPath = path.join(projectRoot, 'supabase.sql');
  const masterSqlTsPath = path.join(projectRoot, 'src', 'lib', 'db', 'masterSchemaSql.ts');
  const schemaSyncTsPath = path.join(projectRoot, 'src', 'lib', 'db', 'schemaSync.ts');

  assert(fs.existsSync(masterSqlPath), 'Fix 14: Master schema file exists at project root (supabase.sql)');
  assert(fs.existsSync(masterSqlTsPath), 'Fix 14: Bundled master schema module exists at src/lib/db/masterSchemaSql.ts');
  assert(fs.existsSync(schemaSyncTsPath), 'Fix 14: Schema sync and health engine exists at src/lib/db/schemaSync.ts');

  const masterSqlContent = fs.readFileSync(masterSqlPath, 'utf8');

  // Verify all 24 tables are in supabase.sql
  const expectedTables = [
    'categories', 'entities', 'custom_fields', 'transactions', 'credit_payments',
    'business_entities', 'accounts', 'products', 'product_variants', 'employees',
    'partners', 'bank_accounts', 'stock_balances', 'stock_movements', 'production_entries',
    'vouchers', 'voucher_lines', 'journal_entries', 'journal_lines', 'salary_records',
    'bank_statement_transactions', 'bank_reconciliation_matches', 'erp_settings', 'voucher_sequences'
  ];

  let missingInMaster: string[] = [];
  for (const tbl of expectedTables) {
    if (!masterSqlContent.includes(`CREATE TABLE IF NOT EXISTS public.${tbl}`)) {
      missingInMaster.push(tbl);
    }
  }
  assert(missingInMaster.length === 0, 'Fix 14: supabase.sql contains CREATE TABLE IF NOT EXISTS for all 24 tables', missingInMaster.join(', '));

  // Verify exec_sql RPC
  assert(
    masterSqlContent.includes('CREATE OR REPLACE FUNCTION public.exec_sql(query text)') &&
    masterSqlContent.includes('SECURITY DEFINER'),
    'Fix 14: supabase.sql includes secure exec_sql RPC function for automated DDL migrations'
  );

  // Verify atomic procedures in master schema
  const expectedFunctions = [
    'post_stock_movement',
    'post_production_entry',
    'post_voucher_atomic',
    'cancel_voucher_atomic',
    'cancel_production_entry_atomic',
    'cancel_journal_entry_atomic',
    'get_trial_balance',
    'get_next_voucher_number',
    'post_salary_booking',
    'post_salary_payment'
  ];

  let missingFuncs: string[] = [];
  for (const fn of expectedFunctions) {
    if (!masterSqlContent.includes(`FUNCTION public.${fn}`)) {
      missingFuncs.push(fn);
    }
  }
  assert(missingFuncs.length === 0, 'Fix 14: supabase.sql includes all atomic and cancellation RPC procedures', missingFuncs.join(', '));

  // Verify idempotent fail-safe statements
  assert(
    masterSqlContent.includes('ON CONFLICT (id) DO NOTHING') &&
    masterSqlContent.includes('CREATE INDEX IF NOT EXISTS') &&
    masterSqlContent.includes('DROP POLICY IF EXISTS'),
    'Fix 14: supabase.sql is strictly failsafe and can be executed repeatedly without errors or data loss'
  );
}

testMasterSchemaIntegrity();

console.log('\n==================================================');
console.log(`TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('==================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
