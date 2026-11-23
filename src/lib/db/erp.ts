// ============================================================
// ERP SHARED TYPES
// All new ERP modules import types from here
// ============================================================

export interface BusinessEntity {
  id: string;
  name: string;
  entity_type: 'company' | 'branch' | 'warehouse';
  parent_id: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  location?: string | null;
  description?: string | null;
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
  sku?: string | null;
  brand?: string | null;
  grade?: string | null;
  purchase_price?: number | null;
  selling_price?: number | null;
  wholesale_price?: number | null;
  min_stock_level?: number | null;
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
  purchase_price?: number | null;
  selling_price?: number | null;
  wholesale_price?: number | null;
  grade?: string | null;
  min_stock_level?: number | null;
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
  join_date?: string;
  is_active: boolean;
}

export interface Partner {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  monthly_remun?: number;
  profit_share_pct?: number;
  is_active: boolean;
}

export interface UnitOfMeasurement {
  id: string;
  name: string;
  abbreviation: string;
  conversion_factor: number;
  base_unit?: string | null;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BankAccount {
  id: string;
  business_entity_id: string | null;
  bank_name: string;
  account_no: string;
  ifsc: string | null;
  branch_name: string | null;
  opening_balance: number;
  current_balance: number;
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

export interface VoucherTransportInfo {
  vehicleNumber?: string;
  destination?: string;
  dispatchedThrough?: string;
  ewayBillNo?: string;
  lrNumber?: string;
  buyerOrderNo?: string;
  buyerOrderDate?: string;
}

export interface VoucherShippingInfo {
  sameAsBuyer: boolean;
  consigneeName?: string;
  address?: string;
  gstin?: string;
  state?: string;
  stateCode?: string;
}

export interface VoucherTaxSplit {
  isInterState: boolean;
  taxPercent: number;
  cgstPercent: number;
  cgstAmount: number;
  sgstPercent: number;
  sgstAmount: number;
  igstPercent: number;
  igstAmount: number;
  sellerStateCode: string;
  sellerStateName: string;
  placeOfSupplyCode: string;
  placeOfSupplyName: string;
}

export interface VoucherMetadata {
  transport?: VoucherTransportInfo;
  shipping?: VoucherShippingInfo;
  customRef?: string;
  roundOff?: number;
  taxSplit?: VoucherTaxSplit;
}

export const GST_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];

export function getStateFromGstin(gstin?: string | null): { code: string; name: string } | null {
  if (!gstin || gstin.trim().length < 2) return null;
  const code = gstin.trim().slice(0, 2);
  const found = GST_STATES.find(s => s.code === code);
  return found || { code, name: `State (${code})` };
}

export function parseVoucherReference(ref: string | null | undefined): VoucherMetadata {
  if (!ref) return {};
  try {
    const trimmed = ref.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = JSON.parse(trimmed);
      return {
        transport: parsed.transport,
        shipping: parsed.shipping,
        customRef: parsed.customRef,
        roundOff: typeof parsed.roundOff === 'number' ? parsed.roundOff : undefined,
        taxSplit: parsed.taxSplit,
      };
    }
  } catch {
    // plain string reference
  }
  return { customRef: ref };
}

export function formatVoucherReference(meta: VoucherMetadata): string | null {
  const hasTransport = meta.transport && Object.values(meta.transport).some(v => Boolean(v && v.trim()));
  const hasShipping = meta.shipping && (!meta.shipping.sameAsBuyer || Boolean(meta.shipping.consigneeName));
  const hasCustomRef = Boolean(meta.customRef && meta.customRef.trim());
  const hasRoundOff = typeof meta.roundOff === 'number' && meta.roundOff !== 0;
  const hasTaxSplit = Boolean(meta.taxSplit);

  if (!hasTransport && !hasShipping && !hasRoundOff && !hasTaxSplit) {
    return hasCustomRef ? (meta.customRef?.trim() || null) : null;
  }

  return JSON.stringify({
    ...(hasTransport ? { transport: meta.transport } : {}),
    ...(hasShipping ? { shipping: meta.shipping } : {}),
    ...(hasCustomRef ? { customRef: meta.customRef?.trim() } : {}),
    ...(hasRoundOff ? { roundOff: meta.roundOff } : {}),
    ...(hasTaxSplit ? { taxSplit: meta.taxSplit } : {}),
  });
}

/**
 * Pure function to compute the next voucher sequence.
 * 1. Checks if any existing vouchers match the standard PREFIX-YYYY-XXXX format.
 * 2. If not, inspects the latest voucher to increment (e.g. "D74" -> "D75", "INV-099" -> "INV-100").
 * 3. Fallback to PREFIX-YYYY-0001.
 */
export function computeNextVoucherNumber(
  prefix: string,
  existingVouchers: { voucher_number?: string | null }[],
  year: number = new Date().getFullYear()
): string {
  const expectedPrefix = `${prefix}-${year}-`;
  if (!existingVouchers || existingVouchers.length === 0) {
    return `${expectedPrefix}0001`;
  }

  let maxStandardSeq = 0;
  let foundStandard = false;

  for (const v of existingVouchers) {
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

  const latestVoucher = existingVouchers[0];
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

  return `${expectedPrefix}0001`;
}

export function numberToIndianWords(amount: number): string {
  if (amount === 0) return 'INR Zero Only';
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n === 0) return '';
    if (n < 20) return units[n];
    const unitPart = n % 10;
    return tens[Math.floor(n / 10)] + (unitPart ? ' ' + units[unitPart] : '');
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) res += units[hundred] + ' Hundred';
    if (rest > 0) res += (res ? ' ' : '') + convertTwoDigits(rest);
    return res;
  }

  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const integerPart = Math.floor(rounded);
  const paisePart = Math.round((rounded - integerPart) * 100);

  const crore = Math.floor(integerPart / 10000000);
  const lakh = Math.floor((integerPart % 10000000) / 100000);
  const thousand = Math.floor((integerPart % 100000) / 1000);
  const remainder = integerPart % 1000;

  let words = '';
  if (crore > 0) words += convertTwoDigits(crore) + ' Crore ';
  if (lakh > 0) words += convertTwoDigits(lakh) + ' Lakh ';
  if (thousand > 0) words += convertTwoDigits(thousand) + ' Thousand ';
  if (remainder > 0) words += convertThreeDigits(remainder) + ' ';

  words = words.trim() || 'Zero';
  let result = 'INR ' + words;

  if (paisePart > 0) {
    result += ' and ' + convertTwoDigits(paisePart) + ' Paise';
  }
  result += ' Only';
  return result;
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
  business_entity_gstin?: string;
  business_entity_address?: string;
  party_entity_name?: string;
  party_entity_gstin?: string;
  party_entity_address?: string;
  party_entity_type?: string;
  bank_name?: string;
  account_no?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  transport?: VoucherTransportInfo;
  shipping?: VoucherShippingInfo;
  round_off?: number;
  tax_split?: VoucherTaxSplit;
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
  salary_frequency: 'monthly' | 'weekly';
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
  balance_after?: number | null;
  reference: string | null;
  reference_no?: string | null;
  is_matched: boolean;
  import_batch: string | null;
  transaction_id?: string | null;
  potential_duplicate_id?: string | null;
  duplicate_reason?: string | null;
  review_status?: 'auto_added' | 'under_review' | 'merged' | 'dismissed';
  created_at: string;
  // joined
  bank_name?: string;
  account_no?: string;
  match?: BankReconciliationMatch | null;
  matched_transaction?: any | null;
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
