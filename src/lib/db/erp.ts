// ============================================================
// ERP SHARED TYPES
// All new ERP modules import types from here
// ============================================================

export interface BusinessEntity {
  id: string;
  name: string;
  entity_type: 'company' | 'branch';
  parent_id: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  is_active: boolean;
  created_at?: string;
  // joined
  parent_name?: string;
}

export interface Account {
  id: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  sub_type: string | null;
  parent_id: string | null;
  is_system: boolean;
  is_active: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: 'plywood' | 'wood' | 'face_veneer' | 'other_veneer' | 'gum_resin' | 'other';
  unit: string;
  description: string | null;
  is_active: boolean;
  // joined
  variants?: ProductVariant[];
}

export interface ProductVariant {
  id: string;
  product_id: string;
  size: string | null;      // '8x4', '7x4', etc.
  thickness: number | null; // mm
  sqft_per_sheet: number | null;
  sku: string | null;
  unit: string | null;
  is_active: boolean;
  // joined
  product_name?: string;
  product_category?: string;
}

export interface Employee {
  id: string;
  name: string;
  designation: string | null;
  phone: string | null;
  bank_account_no: string | null;
  ifsc: string | null;
  monthly_salary: number;
  is_active: boolean;
}

export interface Partner {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  is_active: boolean;
}

export interface BankAccount {
  id: string;
  business_entity_id: string | null;
  bank_name: string;
  account_no: string;
  ifsc: string | null;
  branch_name: string | null;
  opening_balance: number;
  is_active: boolean;
  // joined
  business_entity_name?: string;
}

export interface StockBalance {
  id: string;
  business_entity_id: string;
  product_id: string;
  variant_id: string | null;
  qty_sheets: number;
  qty_sqft: number;
  qty_pieces: number;
  qty_other: number;
  updated_at: string;
  // joined
  product_name?: string;
  product_category?: string;
  variant_size?: string | null;
  variant_thickness?: number | null;
  sqft_per_sheet?: number | null;
  business_entity_name?: string;
}

export interface StockMovement {
  id: string;
  business_entity_id: string;
  product_id: string;
  variant_id: string | null;
  movement_type: string;
  qty_sheets: number;
  qty_sqft: number;
  qty_pieces: number;
  qty_other: number;
  reference_id: string | null;
  reference_type: string | null;
  narration: string | null;
  movement_date: string;
  created_at: string;
  // joined
  product_name?: string;
  variant_size?: string | null;
  variant_thickness?: number | null;
  business_entity_name?: string;
}

export interface ProductionEntry {
  id: string;
  business_entity_id: string;
  production_date: string;
  plywood_product_id: string;
  plywood_variant_id: string | null;
  sheets_produced: number;
  sqft_produced: number;
  face_veneer_product_id: string;
  face_veneer_ratio: number;
  face_veneer_consumed: number;
  plywood_movement_id: string | null;
  veneer_movement_id: string | null;
  status: 'posted' | 'cancelled';
  notes: string | null;
  created_at: string;
  // joined
  business_entity_name?: string;
  plywood_product_name?: string;
  variant_size?: string | null;
  variant_thickness?: number | null;
  face_veneer_product_name?: string;
}

export interface Voucher {
  id: string;
  business_entity_id: string;
  voucher_type: 'sales' | 'purchase' | 'payment' | 'receipt' | 'expense';
  voucher_number: string;
  voucher_date: string;
  party_entity_id: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_status: 'paid' | 'partial' | 'unpaid';
  payment_method: string | null;
  bank_account_id: string | null;
  reference: string | null;
  narration: string | null;
  source_transaction_id: string | null;
  status: 'posted' | 'cancelled';
  created_at: string;
  // joined
  business_entity_name?: string;
  party_entity_name?: string;
  party_entity_type?: string;
  lines?: VoucherLine[];
}

export interface VoucherLine {
  id: string;
  voucher_id: string;
  line_no: number;
  product_id: string | null;
  variant_id: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  quantity_sqft: number | null;
  rate: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
  debit_account_id: string | null;
  credit_account_id: string | null;
  // joined
  product_name?: string;
  variant_size?: string | null;
  variant_thickness?: number | null;
}

export interface JournalEntry {
  id: string;
  business_entity_id: string;
  entry_date: string;
  reference: string | null;
  narration: string;
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
  status: 'posted' | 'cancelled';
  created_at: string;
  // joined
  business_entity_name?: string;
  lines?: JournalLine[];
}

export interface JournalLine {
  id: string;
  journal_id: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  narration: string | null;
  // joined
  account_name?: string;
  account_type?: string;
}

export interface SalaryRecord {
  id: string;
  business_entity_id: string;
  voucher_date: string;
  salary_month: string;
  payee_type: 'employee' | 'partner';
  employee_id: string | null;
  partner_id: string | null;
  payee_name: string;
  booked_amount: number;
  expense_account_id: string;
  payable_account_id: string;
  paid_amount: number;
  pending_amount: number;
  payment_method: string | null;
  bank_account_id: string | null;
  payment_reference: string | null;
  payment_date: string | null;
  status: 'booked' | 'partial' | 'paid' | 'cancelled';
  narration: string | null;
  booking_journal_id: string | null;
  payment_journal_id: string | null;
  created_at: string;
  // joined
  business_entity_name?: string;
}

export interface BankStatementTransaction {
  id: string;
  bank_account_id: string;
  txn_date: string;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  balance: number | null;
  reference: string | null;
  is_matched: boolean;
  import_batch: string | null;
  created_at: string;
  // joined
  bank_name?: string;
  account_no?: string;
  match?: BankReconciliationMatch | null;
}

export interface BankReconciliationMatch {
  id: string;
  bank_statement_txn_id: string;
  voucher_id: string | null;
  salary_record_id: string | null;
  journal_entry_id: string | null;
  matched_amount: number;
  matched_at: string;
}

export interface ErpSetting {
  key: string;
  value: string;
}

// ---- Plywood size/thickness constants ----
export const PLYWOOD_SIZES: { label: string; value: string; sqft: number }[] = [
  { label: '8×4 ft',  value: '8x4', sqft: 32 },
  { label: '7×4 ft',  value: '7x4', sqft: 28 },
  { label: '6×4 ft',  value: '6x4', sqft: 24 },
  { label: '6×3 ft',  value: '6x3', sqft: 18 },
  { label: '5×4 ft',  value: '5x4', sqft: 20 },
  { label: '5×3 ft',  value: '5x3', sqft: 15 },
];

export const PLYWOOD_THICKNESSES: number[] = [25, 18, 16, 12, 9, 6];

export const SQFT_TO_SQM = 0.0929;

export function getSqftPerSheet(size: string): number {
  const found = PLYWOOD_SIZES.find(s => s.value === size);
  return found ? found.sqft : 0;
}

export function sqftToSqm(sqft: number): number {
  return Math.round(sqft * SQFT_TO_SQM * 10000) / 10000;
}

export const INVENTORY_CATEGORIES = [
  { value: 'plywood',       label: 'Plywood' },
  { value: 'wood',          label: 'Wood' },
  { value: 'face_veneer',   label: 'Face Veneer' },
  { value: 'other_veneer',  label: 'Other Veneer' },
  { value: 'gum_resin',     label: 'Gum / Resin' },
  { value: 'other',         label: 'Other' },
];
