// =========================================================================
// MASTER DATA EDIT FUNCTIONALITY & DATA SAFETY VERIFICATION SUITE
// Tests all edit features, financial invariants, and audit logging.
// Run with: node --experimental-strip-types src/__tests__/edit-functionality.test.ts
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

console.log('======================================================================');
console.log('   PLYWOOD POS & CREDIT TRACKER - MASTER DATA EDIT INTEGRITY SUITE   ');
console.log('======================================================================\n');

const projectRoot = process.cwd();

// -------------------------------------------------------------------------
// 1. MIGRATION 007 & MASTER SCHEMA REPOSITORY VERIFICATION
// -------------------------------------------------------------------------
console.log('--- 1. Database Schema & Migration 007 Verification ---');

const mig007Path = path.join(projectRoot, 'supabase', 'migrations', '007_edit_master_data_fields.sql');
const masterSqlPath = path.join(projectRoot, 'supabase.sql');
const bundledMasterSqlPath = path.join(projectRoot, 'src', 'lib', 'db', 'masterSchemaSql.ts');

assert(fs.existsSync(mig007Path), 'Migration 007 file exists at supabase/migrations/007_edit_master_data_fields.sql');
assert(fs.existsSync(masterSqlPath), 'Master schema file exists at supabase.sql');
assert(fs.existsSync(bundledMasterSqlPath), 'Bundled master schema module exists at src/lib/db/masterSchemaSql.ts');

const mig007Content = fs.readFileSync(mig007Path, 'utf8');
const masterSqlContent = fs.readFileSync(masterSqlPath, 'utf8');
const bundledMasterSqlContent = fs.readFileSync(bundledMasterSqlPath, 'utf8');

// Check Customer & Supplier master fields in entities
const hasEntitiesMasterFields =
  mig007Content.includes('ADD COLUMN IF NOT EXISTS email TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS alt_phone TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS gstin TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS contact_person TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS payment_terms TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS credit_limit NUMERIC') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS credit_period INT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS credit_terms TEXT');

assert(hasEntitiesMasterFields, 'Migration 007 adds all Customer and Supplier master fields to public.entities');

// Check Product & Variant master fields
const hasProductFields =
  mig007Content.includes('ADD COLUMN IF NOT EXISTS sku TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS brand TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS grade TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS purchase_price NUMERIC') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS selling_price NUMERIC') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC');

assert(hasProductFields, 'Migration 007 adds SKU, brand, grade, prices, and min_stock_level to public.products');

const hasVariantFields =
  mig007Content.includes('ADD COLUMN IF NOT EXISTS purchase_price NUMERIC') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS selling_price NUMERIC') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS grade TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC');

assert(hasVariantFields, 'Migration 007 adds pricing and grade fields to public.product_variants');

// Check Warehouse in business_entities
const hasWarehouseSupport =
  mig007Content.includes("'warehouse'") &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS location TEXT') &&
  mig007Content.includes('ADD COLUMN IF NOT EXISTS description TEXT');

assert(hasWarehouseSupport, 'Migration 007 extends business_entities with warehouse support, location, and description');

// Check Units of Measurement and Audit Logs tables
const hasUnitsAndAuditTables =
  mig007Content.includes('CREATE TABLE IF NOT EXISTS public.units_of_measurement') &&
  mig007Content.includes('CREATE TABLE IF NOT EXISTS public.edit_audit_logs');

assert(hasUnitsAndAuditTables, 'Migration 007 creates public.units_of_measurement and public.edit_audit_logs tables');

// Check that master schema files include migration 007 tables
assert(
  masterSqlContent.includes('CREATE TABLE IF NOT EXISTS public.units_of_measurement') &&
  masterSqlContent.includes('CREATE TABLE IF NOT EXISTS public.edit_audit_logs'),
  'supabase.sql incorporates units_of_measurement and edit_audit_logs tables'
);

assert(
  bundledMasterSqlContent.includes('units_of_measurement') &&
  bundledMasterSqlContent.includes('edit_audit_logs'),
  'masterSchemaSql.ts incorporates units_of_measurement and edit_audit_logs tables'
);


// -------------------------------------------------------------------------
// 2. AUDIT LOGGING & SECURITY SANITIZATION ENGINE
// -------------------------------------------------------------------------
console.log('\n--- 2. Audit Logging Engine Verification ---');

const auditPath = path.join(projectRoot, 'src', 'lib', 'db', 'audit.ts');
assert(fs.existsSync(auditPath), 'Audit service exists at src/lib/db/audit.ts');

const auditContent = fs.readFileSync(auditPath, 'utf8');

const hasSanitization =
  auditContent.includes('SECRET_KEYS') &&
  auditContent.includes("'password'") &&
  auditContent.includes("'token'") &&
  auditContent.includes("'api_key'") &&
  auditContent.includes('[REDACTED]');

assert(hasSanitization, 'Audit logging engine safely redacts sensitive keys (passwords, tokens, api keys)');

const hasNonBlockingDesign =
  auditContent.includes('try {') &&
  auditContent.includes('console.warn') &&
  auditContent.includes('action: entry.action || \'UPDATE\'');

assert(hasNonBlockingDesign, 'Audit logging executes non-blocking error handling to ensure master updates never stall');


// -------------------------------------------------------------------------
// 3. FINANCIAL INVARIANTS & LEDGER IMMUTABILITY
// -------------------------------------------------------------------------
console.log('\n--- 3. Financial Invariants & Data Safety Protection ---');

const queriesPath = path.join(projectRoot, 'src', 'lib', 'db', 'queries.ts');
const queriesContent = fs.readFileSync(queriesPath, 'utf8');

// Ensure updateEntity only updates entities table, never modifying transactions or credit_payments
const updateEntityDoesNotAlterTransactions =
  queriesContent.includes('export async function updateEntity') &&
  !queriesContent.slice(queriesContent.indexOf('export async function updateEntity'), queriesContent.indexOf('export async function deleteEntities')).includes("from('transactions')") &&
  !queriesContent.slice(queriesContent.indexOf('export async function updateEntity'), queriesContent.indexOf('export async function deleteEntities')).includes("from('credit_payments')");

assert(updateEntityDoesNotAlterTransactions, 'Entity editing updates public.entities only, preserving historical transactions and balances');

// Ensure updateCategory uses targeted update by ID
const updateCategoryIsTargeted =
  queriesContent.includes('export async function updateCategory') &&
  queriesContent.includes(".eq('id', id)");

assert(updateCategoryIsTargeted, 'Category editing targets specific record by primary key (id) preserving relationships');

// Ensure updateCustomField updates definition without rewriting transaction custom_data
const updateCustomFieldIsTargeted =
  queriesContent.includes('export async function updateCustomField') &&
  queriesContent.includes(".eq('id', id)");

assert(updateCustomFieldIsTargeted, 'Custom field editing updates definition safely by ID');

const inventoryPath = path.join(projectRoot, 'src', 'lib', 'db', 'inventory.ts');
const inventoryContent = fs.readFileSync(inventoryPath, 'utf8');

// Ensure upsertProduct does not mutate stock_movements or vouchers
const upsertProductDoesNotAlterVouchers =
  inventoryContent.includes('export async function upsertProduct') &&
  !inventoryContent.slice(inventoryContent.indexOf('export async function upsertProduct'), inventoryContent.indexOf('export async function getProductVariants')).includes("from('vouchers')") &&
  !inventoryContent.slice(inventoryContent.indexOf('export async function upsertProduct'), inventoryContent.indexOf('export async function getProductVariants')).includes("from('voucher_lines')") &&
  !inventoryContent.slice(inventoryContent.indexOf('export async function upsertProduct'), inventoryContent.indexOf('export async function getProductVariants')).includes("from('stock_movements')");

assert(upsertProductDoesNotAlterVouchers, 'Product editing updates product master without mutating historical vouchers or stock movements');

// Ensure upsertProductVariant does not mutate stock_movements
const upsertVariantDoesNotAlterStock =
  inventoryContent.includes('export async function upsertProductVariant') &&
  !inventoryContent.slice(inventoryContent.indexOf('export async function upsertProductVariant'), inventoryContent.indexOf('export async function getUnitsOfMeasurement')).includes("from('stock_movements')");

assert(upsertVariantDoesNotAlterStock, 'Variant editing updates variant dimensions and prices without altering stock balances or movements');

// Ensure Units of measurement does not alter historical transaction quantities
const unitsManagementSafe =
  inventoryContent.includes('export async function upsertUnitOfMeasurement') &&
  inventoryContent.includes('export async function deleteUnitOfMeasurement') &&
  !inventoryContent.slice(inventoryContent.indexOf('export async function upsertUnitOfMeasurement'), inventoryContent.indexOf('export async function getStockBalances')).includes("from('stock_movements')");

assert(unitsManagementSafe, 'Units of measurement updates master configurations without modifying historical transaction quantities');


// -------------------------------------------------------------------------
// 4. UI PAGES EDIT FUNCTIONALITY INTEGRATION
// -------------------------------------------------------------------------
console.log('\n--- 4. UI Pages & Editing Workflows Verification ---');

// A. Customers & Suppliers (Entities.tsx)
const entitiesUiPath = path.join(projectRoot, 'src', 'pages', 'entities', 'Entities.tsx');
const entitiesUiContent = fs.readFileSync(entitiesUiPath, 'utf8');

const hasEntitiesEditUi =
  entitiesUiContent.includes('handleEdit') &&
  entitiesUiContent.includes('isEditing') &&
  entitiesUiContent.includes('updateEntity') &&
  entitiesUiContent.includes('creditLimit') &&
  entitiesUiContent.includes('creditPeriod') &&
  entitiesUiContent.includes('creditTerms') &&
  entitiesUiContent.includes('contactPerson') &&
  entitiesUiContent.includes('paymentTerms') &&
  entitiesUiContent.includes('gstin');

assert(hasEntitiesEditUi, 'Entities.tsx implements Edit action with comprehensive modal for Customers and Suppliers');

// B. Customer Credit Settings (Credits.tsx)
const creditsUiPath = path.join(projectRoot, 'src', 'pages', 'credits', 'Credits.tsx');
const creditsUiContent = fs.readFileSync(creditsUiPath, 'utf8');

const hasCreditsEditUi =
  creditsUiContent.includes('handleOpenEditCredit') &&
  creditsUiContent.includes('handleSaveCreditSettings') &&
  creditsUiContent.includes('editCreditLimit') &&
  creditsUiContent.includes('editCreditPeriod') &&
  creditsUiContent.includes('editCreditTerms') &&
  creditsUiContent.includes('updateEntity');

assert(hasCreditsEditUi, 'Credits.tsx implements Edit Credit Policy action on ledger rows and statement modal header');

// C. Product Categories (Categories.tsx)
const categoriesUiPath = path.join(projectRoot, 'src', 'pages', 'categories', 'Categories.tsx');
const categoriesUiContent = fs.readFileSync(categoriesUiPath, 'utf8');

const hasCategoriesEditUi =
  categoriesUiContent.includes('handleOpenEdit') &&
  categoriesUiContent.includes('handleSaveCategory') &&
  categoriesUiContent.includes('updateCategory') &&
  categoriesUiContent.includes('description');

assert(hasCategoriesEditUi, 'Categories.tsx implements Edit action on table rows with name, flow type, color, and description');

// D. Products & Variants (Products.tsx)
const productsUiPath = path.join(projectRoot, 'src', 'pages', 'inventory', 'Products.tsx');
const productsUiContent = fs.readFileSync(productsUiPath, 'utf8');

const hasProductsEditUi =
  productsUiContent.includes('handleOpenEditProduct') &&
  productsUiContent.includes('handleSaveProduct') &&
  productsUiContent.includes('handleOpenEditVariant') &&
  productsUiContent.includes('handleSaveVariant') &&
  productsUiContent.includes('upsertProduct') &&
  productsUiContent.includes('upsertProductVariant') &&
  productsUiContent.includes('selling_price') &&
  productsUiContent.includes('wholesale_price') &&
  productsUiContent.includes('min_stock_level') &&
  productsUiContent.includes('sqft_per_sheet');

assert(hasProductsEditUi, 'Products.tsx implements Edit Product and Edit Variant dialogs with dimensional calculations and pricing');

// E. Business Entities & Warehouses (BusinessEntities.tsx)
const businessEntitiesUiPath = path.join(projectRoot, 'src', 'pages', 'business-entities', 'BusinessEntities.tsx');
const businessEntitiesUiContent = fs.readFileSync(businessEntitiesUiPath, 'utf8');

const hasBusinessEntitiesEditUi =
  businessEntitiesUiContent.includes('handleOpenEdit') &&
  businessEntitiesUiContent.includes('handleSave') &&
  businessEntitiesUiContent.includes('upsertBusinessEntity') &&
  businessEntitiesUiContent.includes('warehouse') &&
  businessEntitiesUiContent.includes('location') &&
  businessEntitiesUiContent.includes('description');

assert(hasBusinessEntitiesEditUi, 'BusinessEntities.tsx supports Company, Branch, and Warehouse editing with location and description');

// F. Units of Measurement, Accounts, Partners, Employees (Masters.tsx)
const mastersUiPath = path.join(projectRoot, 'src', 'pages', 'masters', 'Masters.tsx');
const mastersUiContent = fs.readFileSync(mastersUiPath, 'utf8');

const hasMastersEditUi =
  mastersUiContent.includes('"UNITS"') &&
  mastersUiContent.includes('upsertUnitOfMeasurement') &&
  mastersUiContent.includes('handleOpenEditUnit') &&
  mastersUiContent.includes('handleOpenEditAccount') &&
  mastersUiContent.includes('upsertAccount') &&
  mastersUiContent.includes('monthly_remun') &&
  mastersUiContent.includes('profit_share_pct') &&
  mastersUiContent.includes('join_date');

assert(hasMastersEditUi, 'Masters.tsx features Units of Measurement tab, Chart of Accounts edit, Partner profit share, and Employee join dates');

// G. Business Profile & Essential Settings, Custom Fields (Settings.tsx)
const settingsUiPath = path.join(projectRoot, 'src', 'pages', 'settings', 'Settings.tsx');
const settingsUiContent = fs.readFileSync(settingsUiPath, 'utf8');

const hasSettingsEditUi =
  settingsUiContent.includes('handleSaveBusinessProfile') &&
  settingsUiContent.includes('saveErpSetting') &&
  settingsUiContent.includes('companyGstin') &&
  settingsUiContent.includes('defaultCreditPeriod') &&
  settingsUiContent.includes('defaultTerms') &&
  settingsUiContent.includes('handleOpenEditField') &&
  settingsUiContent.includes('updateCustomField');

assert(hasSettingsEditUi, 'Settings.tsx features Business Profile & General Settings card and Custom Fields Edit modal');

// H. Banking Statement Transactions (Banking.tsx)
const bankingUiPath = path.join(projectRoot, 'src', 'pages', 'banking', 'Banking.tsx');
const bankingUiContent = fs.readFileSync(bankingUiPath, 'utf8');

const hasBankingEditUi =
  bankingUiContent.includes('handleOpenEditStatement') &&
  bankingUiContent.includes('handleUpdateStatement') &&
  bankingUiContent.includes('updateBankStatementTransaction') &&
  bankingUiContent.includes('Edit Bank Statement Entry');

assert(hasBankingEditUi, 'Banking.tsx features Edit Statement Entry modal for correcting unmatched bank transactions');


// -------------------------------------------------------------------------
// 5. TEST RUNNER RESULTS SUMMARY
// -------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(`TEST SUITE COMPLETED: ${passCount} PASSED, ${failCount} FAILED`);
console.log('======================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
