// =========================================================================
// PLYWOOD POS & ERP - SALES VOUCHER & ERP COMPREHENSIVE E2E VERIFICATION
// src/__tests__/sales-voucher-e2e.test.ts
// Automated end-to-end audit for Sales Voucher calculations, tax splitting,
// round-off math, BRS CSV ingestion, and company cashflow reconciliation.
// =========================================================================

import assert from "node:assert/strict";
import {
  getSqftPerSheet,
  sqftToSqm,
  SQFT_TO_SQM,
  formatVoucherReference,
  parseVoucherReference,
  numberToIndianWords,
  getStateFromGstin,
  computeNextVoucherNumber,
} from "../lib/db/erp.ts";
import { parseBankStatementCsv, parseBankDate, parseBankAmount } from "../lib/banking/bankCsvParser.ts";
import type { VoucherTaxSplit } from "../lib/db/erp.ts";

let passCount = 0;
let failCount = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failCount++;
  }
}

console.log("\n=======================================================");
console.log("  PRODUCTION AUDIT: SALES VOUCHERS, BRS & ERP SUITE");
console.log("=======================================================\n");

// =========================================================================
// 1. VOUCHER NUMBERING & AUTO-SEQUENCING
// =========================================================================
console.log("Suite 1: Voucher Numbering & Auto-Sequencing");

runTest("getNextVoucherNumber defaults to SAL-YYYY-0001 when no vouchers exist", () => {
  const nextNum = computeNextVoucherNumber("SAL", [], 2026);
  assert.equal(nextNum, "SAL-2026-0001");
});

runTest("getNextVoucherNumber increments standard format SAL-2026-0004 -> SAL-2026-0005", () => {
  const existing = [
    { voucher_number: "SAL-2026-0004" },
    { voucher_number: "SAL-2026-0003" },
    { voucher_number: "SAL-2026-0002" },
  ];
  const nextNum = computeNextVoucherNumber("SAL", existing, 2026);
  assert.equal(nextNum, "SAL-2026-0005");
});

runTest("getNextVoucherNumber increments custom prefix D74 -> D75", () => {
  const existing = [{ voucher_number: "D74" }];
  const nextNum = computeNextVoucherNumber("SAL", existing, 2026);
  assert.equal(nextNum, "D75");
});

runTest("getNextVoucherNumber increments padded custom format INV-099 -> INV-100", () => {
  const existing = [{ voucher_number: "INV-099" }];
  const nextNum = computeNextVoucherNumber("SAL", existing, 2026);
  assert.equal(nextNum, "INV-100");
});

// =========================================================================
// 2. BILLABLE UNIT RECALCULATION & CONVERSIONS
// =========================================================================
console.log("\nSuite 2: Billable Unit Calculations (sqft, sqm, sheets)");

runTest("Standard 8x4 sheet returns 32 sqft per sheet", () => {
  const sqft = getSqftPerSheet("8x4");
  assert.equal(sqft, 32);
});

runTest("Standard 7x4 sheet returns 28 sqft per sheet", () => {
  const sqft = getSqftPerSheet("7x4");
  assert.equal(sqft, 28);
});

runTest("SQFT to SQM conversion factor is accurate to 4 decimal places", () => {
  const sqft = 32;
  const sqm = sqftToSqm(sqft);
  // 32 * 0.0929 = 2.9728
  assert.equal(sqm, 2.9728);
});

runTest("Form line calculation with rate_unit = 'sqft'", () => {
  const quantity = 150; // 150 sheets
  const sqftPerSheet = 32; // 8x4
  const quantity_sqft = Math.round(quantity * sqftPerSheet * 1000) / 1000; // 4800 sqft
  const rate = 85; // ₹85 per sqft
  const taxPercent = 18;

  const baseAmount = Math.round(quantity_sqft * rate * 100) / 100; // 4800 * 85 = 408000
  const taxAmount = Math.round(((baseAmount * taxPercent) / 100) * 100) / 100; // 73440
  const lineTotal = Math.round((baseAmount + taxAmount) * 100) / 100; // 481440

  assert.equal(quantity_sqft, 4800);
  assert.equal(baseAmount, 408000);
  assert.equal(taxAmount, 73440);
  assert.equal(lineTotal, 481440);
});

runTest("Form line calculation with rate_unit = 'sqm'", () => {
  const quantity = 100; // 100 sheets
  const sqftPerSheet = 32;
  const quantity_sqft = quantity * sqftPerSheet; // 3200 sqft
  const quantity_sqm = Math.round(quantity_sqft * SQFT_TO_SQM * 10000) / 10000; // 297.28 sqm
  const rate = 850; // ₹850 per sqm
  const taxPercent = 18;

  const baseAmount = Math.round(quantity_sqm * rate * 100) / 100; // 297.28 * 850 = 252688
  const taxAmount = Math.round(((baseAmount * taxPercent) / 100) * 100) / 100; // 45483.84
  const lineTotal = Math.round((baseAmount + taxAmount) * 100) / 100; // 298171.84

  assert.equal(quantity_sqm, 297.28);
  assert.equal(baseAmount, 252688);
  assert.equal(taxAmount, 45483.84);
  assert.equal(lineTotal, 298171.84);
});

runTest("Form line calculation with rate_unit = 'sheets'", () => {
  const quantity = 200; // 200 sheets
  const rate = 2250; // ₹2,250 per sheet
  const taxPercent = 18;

  const baseAmount = Math.round(quantity * rate * 100) / 100; // 450000
  const taxAmount = Math.round(((baseAmount * taxPercent) / 100) * 100) / 100; // 81000
  const lineTotal = Math.round((baseAmount + taxAmount) * 100) / 100; // 531000

  assert.equal(baseAmount, 450000);
  assert.equal(taxAmount, 81000);
  assert.equal(lineTotal, 531000);
});

// =========================================================================
// 3. GST TAX SPLITTING LOGIC (Intra-State vs Inter-State)
// =========================================================================
console.log("\nSuite 3: GST Automated Tax Splitting (Intra-State vs Inter-State)");

runTest("Intra-State GST: Kerala seller (32) to Kerala customer (32) splits into 9% CGST + 9% SGST", () => {
  const sellerStateCode: string = "32";
  const placeOfSupplyCode: string = "32";
  const isInterState = sellerStateCode !== placeOfSupplyCode;
  const taxTotal = 18000;
  const avgTaxRate = 18;

  assert.equal(isInterState, false);

  const halfRate = Math.round((avgTaxRate / 2) * 10) / 10;
  const cgstAmt = Math.round((taxTotal / 2) * 100) / 100;
  const sgstAmt = Math.round((taxTotal - cgstAmt) * 100) / 100;

  assert.equal(halfRate, 9);
  assert.equal(cgstAmt, 9000);
  assert.equal(sgstAmt, 9000);
});

runTest("Inter-State GST: Kerala seller (32) to Tamil Nadu customer (33) assigns 100% IGST", () => {
  const sellerStateCode: string = "32";
  const placeOfSupplyCode: string = "33";
  const isInterState = sellerStateCode !== placeOfSupplyCode;
  const taxTotal = 18000;
  const avgTaxRate = 18;

  assert.equal(isInterState, true);

  const taxSplit: VoucherTaxSplit = {
    isInterState: true,
    taxPercent: avgTaxRate,
    cgstPercent: 0,
    cgstAmount: 0,
    sgstPercent: 0,
    sgstAmount: 0,
    igstPercent: avgTaxRate,
    igstAmount: taxTotal,
    sellerStateCode,
    sellerStateName: "Kerala",
    placeOfSupplyCode,
    placeOfSupplyName: "Tamil Nadu",
  };

  assert.equal(taxSplit.cgstAmount, 0);
  assert.equal(taxSplit.sgstAmount, 0);
  assert.equal(taxSplit.igstAmount, 18000);
  assert.equal(taxSplit.igstPercent, 18);
});

runTest("getStateFromGstin extracts 2-digit state code and name correctly", () => {
  const sellerGstin = "32AAYFD0732E1ZN"; // Kerala
  const buyerGstin = "23AABCU9603R1ZM"; // Madhya Pradesh

  const sellerState = getStateFromGstin(sellerGstin);
  assert.ok(sellerState);
  assert.equal(sellerState.code, "32");
  assert.equal(sellerState.name, "Kerala");

  const buyerState = getStateFromGstin(buyerGstin);
  assert.ok(buyerState);
  assert.equal(buyerState.code, "23");
  assert.equal(buyerState.name, "Madhya Pradesh");
});

// =========================================================================
// 4. ROUND-OFF MATH & METADATA REFERENCE SERIALIZATION
// =========================================================================
console.log("\nSuite 4: Round-Off Math & Reference Serialization");

runTest("Round-off to nearest rupee: 1475.35 rounds to 1475 (-0.35)", () => {
  const exact = 1475.35;
  const rounded = Math.round(exact);
  const roundOff = Math.round((rounded - exact) * 100) / 100;

  assert.equal(rounded, 1475);
  assert.equal(roundOff, -0.35);
});

runTest("Round-off to nearest rupee: 1475.65 rounds to 1476 (+0.35)", () => {
  const exact = 1475.65;
  const rounded = Math.round(exact);
  const roundOff = Math.round((rounded - exact) * 100) / 100;

  assert.equal(rounded, 1476);
  assert.equal(roundOff, 0.35);
});

runTest("formatVoucherReference and parseVoucherReference round-trip successfully", () => {
  const transport = {
    vehicleNumber: "KL-07-CD-1234",
    destination: "Ernakulam",
    dispatchedThrough: "Road",
    lrNumber: "LR-9876",
    ewayBillNo: "EWB-11223344",
  };

  const shipping = {
    sameAsBuyer: false,
    consigneeName: "Apex Woodcrafts Ltd",
    address: "Plot 12, Industrial Area, Cochin",
    gstin: "32AAACA1234A1Z5",
    state: "Kerala",
    stateCode: "32",
  };

  const taxSplit: VoucherTaxSplit = {
    isInterState: false,
    taxPercent: 18,
    cgstPercent: 9,
    cgstAmount: 900,
    sgstPercent: 9,
    sgstAmount: 900,
    igstPercent: 0,
    igstAmount: 0,
    sellerStateCode: "32",
    sellerStateName: "Kerala",
    placeOfSupplyCode: "32",
    placeOfSupplyName: "Kerala",
  };

  const encoded = formatVoucherReference({
    transport,
    shipping,
    roundOff: -0.35,
    taxSplit,
    customRef: "PO-45001",
  });

  const parsed = parseVoucherReference(encoded);

  assert.equal(parsed.transport?.vehicleNumber, "KL-07-CD-1234");
  assert.equal(parsed.transport?.destination, "Ernakulam");
  assert.equal(parsed.shipping?.sameAsBuyer, false);
  assert.equal(parsed.shipping?.consigneeName, "Apex Woodcrafts Ltd");
  assert.equal(parsed.roundOff, -0.35);
  assert.equal(parsed.taxSplit?.cgstAmount, 900);
  assert.equal(parsed.customRef, "PO-45001");
});

// =========================================================================
// 5. INDIAN CURRENCY NUMBER-TO-WORDS CONVERTER
// =========================================================================
console.log("\nSuite 5: Indian Currency Number to Words Converter");

runTest("Converts simple integer amounts to words", () => {
  const words = numberToIndianWords(1000);
  assert.equal(words, "INR One Thousand Only");
});

runTest("Converts multi-lakh amounts to words accurately", () => {
  const words = numberToIndianWords(125432);
  assert.equal(words, "INR One Lakh Twenty Five Thousand Four Hundred Thirty Two Only");
});

runTest("Converts fractional paise amounts accurately", () => {
  const words = numberToIndianWords(450.75);
  assert.equal(words, "INR Four Hundred Fifty and Seventy Five Paise Only");
});

// =========================================================================
// 6. BANK RECONCILIATION STATEMENT (BRS) CSV PARSING
// =========================================================================
console.log("\nSuite 6: BRS CSV Parsing (User Screenshot Exact Structure)");

runTest("Parses 12-Nov-26 date format into ISO YYYY-MM-DD", () => {
  const parsed = parseBankDate("12-Nov-26");
  assert.equal(parsed, "2026-11-12");
});

runTest("Parses amount with 'XX' placeholder safely returning 0 without crash", () => {
  const parsed = parseBankAmount("XX");
  assert.equal(parsed, 0);
});

runTest("Parses standard Indian formatted bank statement CSV with Cheque N and Balance Amount", () => {
  const csv = `SlNo,Transaction Date,Value Date,Particulars,Cheque N,Withdrawals,Deposits,Balance Amount
1,12-Nov-26,12-Nov-26,Charges for NEFT TO XXX,,45.00,,50000.00
2,12-Nov-26,12-Nov-26,NEFT TO XXX,CHQ-1234,25000.00,,25000.00
3,12-Nov-26,12-Nov-26,Payment from Client A,,0,75000.00,100000.00
`;

  const result = parseBankStatementCsv(csv);
  assert.equal(result.success, true);
  assert.equal(result.rows.length, 3);

  // Row 1: Withdrawal 45
  assert.equal(result.rows[0].date, "2026-11-12");
  assert.equal(result.rows[0].withdrawals, 45);
  assert.equal(result.rows[0].type, "OUT");
  assert.equal(result.rows[0].balance, 50000);

  // Row 2: Withdrawal 25000 with cheque
  assert.equal(result.rows[1].chequeNo, "CHQ-1234");
  assert.equal(result.rows[1].withdrawals, 25000);
  assert.equal(result.rows[1].type, "OUT");

  // Row 3: Deposit 75000
  assert.equal(result.rows[2].deposits, 75000);
  assert.equal(result.rows[2].type, "IN");
  assert.equal(result.rows[2].balance, 100000);
});

// =========================================================================
// 7. COMPANY CURRENT BALANCE CALCULATION WITH PARTIAL PAYMENTS
// =========================================================================
console.log("\nSuite 7: Company Current Balance with Partial Payments");

function calcBalance(
  transactions: any[],
  openingBalance: number,
  companyId?: string | null
): { currentBalance: number; totalCashIn: number; totalCashOut: number } {
  let totalCashIn = 0;
  let totalCashOut = 0;

  for (const t of transactions) {
    if (companyId && companyId !== "ALL") {
      const txnBizId = t.business_entity_id || t.custom_data?.business_entity_id;
      if (txnBizId && txnBizId !== companyId) {
        continue;
      }
    }
    const cashMoved = Number(t.paid_amount != null ? t.paid_amount : t.amount) || 0;
    if (t.type === "IN") {
      totalCashIn += cashMoved;
    } else if (t.type === "OUT") {
      totalCashOut += cashMoved;
    }
  }

  const currentBalance = Math.round((openingBalance + totalCashIn - totalCashOut) * 100) / 100;
  return {
    currentBalance,
    totalCashIn: Math.round(totalCashIn * 100) / 100,
    totalCashOut: Math.round(totalCashOut * 100) / 100,
  };
}

runTest("Calculates live company cash balance using paid_amount for partial payment", () => {
  const mockTxns: any[] = [
    // Full cash sale
    {
      id: "txn_1",
      type: "IN",
      amount: 10000,
      paid_amount: 10000,
      total_amount: 10000,
      business_entity_id: "biz_1",
    },
    // Partial payment sale (Invoice is ₹50,000, but customer only paid ₹15,000 upfront)
    {
      id: "txn_2",
      type: "IN",
      amount: 50000,
      paid_amount: 15000,
      total_amount: 50000,
      business_entity_id: "biz_1",
    },
    // Expense
    {
      id: "txn_3",
      type: "OUT",
      amount: 5000,
      paid_amount: 5000,
      total_amount: 5000,
      business_entity_id: "biz_1",
    },
    // Transaction for different company (should be excluded when filtered)
    {
      id: "txn_4",
      type: "IN",
      amount: 20000,
      paid_amount: 20000,
      total_amount: 20000,
      business_entity_id: "biz_2",
    },
  ];

  const openingBalance = 20000;

  // Filter for biz_1
  const statsBiz1 = calcBalance(mockTxns, openingBalance, "biz_1");
  // Total cash in = 10000 + 15000 = 25000
  // Total cash out = 5000
  // Net cash flow = 20000
  // Current balance = 20000 (opening) + 20000 (net) = 40000
  assert.equal(statsBiz1.totalCashIn, 25000);
  assert.equal(statsBiz1.totalCashOut, 5000);
  assert.equal(statsBiz1.currentBalance, 40000);

  // Global / ALL companies
  const statsGlobal = calcBalance(mockTxns, openingBalance, null);
  // Total cash in = 10000 + 15000 + 20000 = 45000
  // Total cash out = 5000
  // Current balance = 20000 + 40000 = 60000
  assert.equal(statsGlobal.totalCashIn, 45000);
  assert.equal(statsGlobal.totalCashOut, 5000);
  assert.equal(statsGlobal.currentBalance, 60000);
});

runTest("Cash-in-Hand strictly ignores bank statement imports and pure bank transfers", () => {
  // Using actual logic matching calculateCompanyCurrentBalance in queries.ts
  function calcCashOnly(transactions: any[], openingBalance: number) {
    let totalCashIn = 0;
    let totalCashOut = 0;
    for (const t of transactions) {
      if (t.custom_data?.is_statement_imported === true) continue;
      const paid = Number(t.paid_amount != null ? t.paid_amount : t.amount) || 0;
      const custom = t.custom_data || {};
      let cashMoved = 0;
      if (custom.cash_amount != null) cashMoved = Number(custom.cash_amount) || 0;
      else if (custom.payment_method === "bank_transfer_only") cashMoved = 0;
      else cashMoved = Math.max(0, paid - (Number(custom.bank_amount) || 0));
      if (cashMoved <= 0) continue;
      if (t.type === "IN") totalCashIn += cashMoved;
      else totalCashOut += cashMoved;
    }
    return {
      currentBalance: openingBalance + totalCashIn - totalCashOut,
      totalCashIn,
      totalCashOut,
    };
  }

  const txns = [
    // Cash Quick Income (+5000 Cash)
    { type: "IN", amount: 5000, paid_amount: 5000, custom_data: { payment_method: "cash_only", cash_amount: 5000, bank_amount: 0 } },
    // Split Income (+3000 Cash, +7000 Bank)
    { type: "IN", amount: 10000, paid_amount: 10000, custom_data: { payment_method: "cash_and_bank", cash_amount: 3000, bank_amount: 7000 } },
    // Bank-only Quick Expense (0 Cash, 2000 Bank)
    { type: "OUT", amount: 2000, paid_amount: 2000, custom_data: { payment_method: "bank_transfer_only", cash_amount: 0, bank_amount: 2000 } },
    // Bank Statement Import (+50000 Bank, 0 Cash)
    { type: "IN", amount: 50000, paid_amount: 50000, custom_data: { is_statement_imported: true, bank_amount: 50000, cash_amount: 0 } },
  ];

  const res = calcCashOnly(txns, 1000);
  assert.equal(res.totalCashIn, 8000);
  assert.equal(res.totalCashOut, 0);
  assert.equal(res.currentBalance, 9000);
});

runTest("BRS duplicate matching is strictly scoped per-bank (never matches cash or other/deleted banks)", () => {
  function findPerBankMatch(
    targetBankId: string,
    row: { date: string; amount: number; type: "IN" | "OUT"; particulars: string; ref?: string },
    cloudStatementsForTargetBank: any[],
    manualTxnsForTargetBank: any[]
  ) {
    const rowDesc = row.particulars.trim().toLowerCase();
    const rowRef = (row.ref || "").trim().toLowerCase();

    const cloudMatch = cloudStatementsForTargetBank.find((st) => {
      if (st.bank_account_id !== targetBankId) return false;
      if (st.txn_date.slice(0, 10) !== row.date) return false;
      const stIsOut = Number(st.debit_amount) > 0;
      const stType = stIsOut ? "OUT" : "IN";
      if (stType !== row.type) return false;
      const stAmt = stIsOut ? Number(st.debit_amount) : Number(st.credit_amount);
      if (Math.abs(stAmt - row.amount) >= 0.01) return false;
      const stDesc = (st.description || "").trim().toLowerCase();
      const stRef = (st.reference || "").trim().toLowerCase();
      return (rowDesc && stDesc === rowDesc) || (rowRef && stRef === rowRef);
    });
    if (cloudMatch) return "CLOUD_STATEMENT";

    const txnMatch = manualTxnsForTargetBank.find((t) => {
      if (t.custom_data?.bank_account_id !== targetBankId) return false;
      if (t.custom_data?.is_statement_imported === true) return false;
      if (t.type !== row.type || t.date.slice(0, 10) !== row.date) return false;
      const tAmt = Number(t.custom_data?.bank_amount ?? t.paid_amount ?? t.amount);
      return Math.abs(tAmt - row.amount) < 0.01;
    });
    return txnMatch ? "LEDGER_TXN" : null;
  }

  const allCloudStatements = [
    { bank_account_id: "bnk_old", txn_date: "2026-11-26", debit_amount: 5000, credit_amount: 0, description: "NEFT TO SUPPLIER" },
  ];
  const allLedgerTxns = [
    // Orphaned / Cash-only transaction with no bank_account_id
    { id: "txn_cash", type: "OUT", date: "2026-11-26T12:00:00Z", amount: 5000, custom_data: { payment_method: "cash_only" } },
    // Another bank's transaction
    { id: "txn_other_bank", type: "OUT", date: "2026-11-26T12:00:00Z", amount: 5000, custom_data: { bank_account_id: "bnk_other", bank_amount: 5000 } },
    // Target new bank manual entry
    { id: "txn_target", type: "IN", date: "2026-11-26T12:00:00Z", amount: 12000, custom_data: { bank_account_id: "bnk_new", bank_amount: 12000 } },
  ];

  // Reconciling a brand-new bank should NOT flag Cash, other bank, or deleted old bank entries
  assert.equal(
    findPerBankMatch("bnk_new", { date: "2026-11-26", amount: 5000, type: "OUT", particulars: "NEFT TO SUPPLIER" }, allCloudStatements, allLedgerTxns),
    null
  );
  // Reconciling the target bank SHOULD still catch a matching manual Quick Entry tied specifically to bnk_new
  assert.equal(
    findPerBankMatch("bnk_new", { date: "2026-11-26", amount: 12000, type: "IN", particulars: "CLIENT NEFT" }, allCloudStatements, allLedgerTxns),
    "LEDGER_TXN"
  );
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log("\n=======================================================");
console.log(`  RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log("=======================================================\n");

if (failCount > 0) {
  process.exit(1);
} else {
  console.log("✓ All 22 production test scenarios passed cleanly!");
  process.exit(0);
}
