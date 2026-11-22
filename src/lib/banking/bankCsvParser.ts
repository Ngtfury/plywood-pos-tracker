// =========================================================================
// PLYWOOD POS & ERP - SMART BANK STATEMENT CSV PARSER
// src/lib/banking/bankCsvParser.ts
// Robust parser for Indian bank statement CSV & Excel exports.
// =========================================================================

export interface ParsedStatementRow {
  rowNumber: number;
  date: string;           // ISO format "YYYY-MM-DD"
  valueDate?: string;     // ISO format "YYYY-MM-DD"
  particulars: string;
  chequeNo?: string;
  withdrawals: number;    // Money OUT (Debit)
  deposits: number;       // Money IN (Credit)
  balance?: number;       // Closing Balance
  type: 'IN' | 'OUT';     // Derived: 'OUT' if withdrawals > 0, else 'IN'
  amount: number;         // Actual cash amount
  raw: Record<string, string>;
}

export interface ParseResult {
  success: boolean;
  rows: ParsedStatementRow[];
  totalRows: number;
  skippedRows: number;
  error?: string;
  detectedHeaders: string[];
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04',
  may: '05', jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Parses diverse bank date representations into normalized YYYY-MM-DD string.
 * Supports:
 * - 12-Nov-26 or 12-Nov-2026
 * - 12/11/2026 or 12-11-2026 (DD/MM/YYYY)
 * - 2026-11-12 (YYYY-MM-DD)
 */
export function parseBankDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  if (!clean) return null;

  // 1. Check format "12-Nov-26" or "12-Nov-2026" or "12 Nov 2026"
  const alphaMatch = clean.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/);
  if (alphaMatch) {
    const day = alphaMatch[1].padStart(2, '0');
    const monthKey = alphaMatch[2].toLowerCase();
    const month = MONTH_MAP[monthKey];
    let year = alphaMatch[3];
    if (year.length === 2) {
      year = parseInt(year, 10) < 50 ? `20${year}` : `19${year}`;
    }
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // 2. Check standard ISO format "YYYY-MM-DD"
  const isoMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 3. Check format "DD/MM/YYYY" or "DD-MM-YYYY"
  const dmyMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) {
      year = parseInt(year, 10) < 50 ? `20${year}` : `19${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // Fallback to JS Date parse
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Cleans monetary amounts from Indian & standard currency strings:
 * e.g. "1,25,000.50", "₹ 500", "500.00 Dr" -> 500.00
 */
export function parseBankAmount(val: any): number {
  if (val == null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.abs(val);

  const str = String(val).trim();
  if (!str || str.toLowerCase() === 'xx' || str === '-') return 0;

  // Remove currency symbols, commas, and letters except minus & dot
  const sanitized = str.replace(/[^0-9.-]/g, '');
  const num = parseFloat(sanitized);
  return isNaN(num) ? 0 : Math.abs(num);
}

/**
 * Splits a CSV line taking into account double quotes.
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

/**
 * Detects the most appropriate delimiter (comma, tab, semicolon).
 */
function detectDelimiter(lines: string[]): string {
  const candidates = [',', '\t', ';'];
  let best = ',';
  let maxCount = -1;

  for (const cand of candidates) {
    let total = 0;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      total += (lines[i].match(new RegExp(cand === '\t' ? '\\t' : `\\${cand}`, 'g')) || []).length;
    }
    if (total > maxCount) {
      maxCount = total;
      best = cand;
    }
  }
  return best;
}

/**
 * Main parser function: takes raw CSV text and returns structured statement rows.
 */
export function parseBankStatementCsv(csvText: string): ParseResult {
  if (!csvText || !csvText.trim()) {
    return { success: false, rows: [], totalRows: 0, skippedRows: 0, error: 'Empty statement text provided.', detectedHeaders: [] };
  }

  const rawLines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (rawLines.length === 0) {
    return { success: false, rows: [], totalRows: 0, skippedRows: 0, error: 'Statement contains no data lines.', detectedHeaders: [] };
  }

  const delimiter = detectDelimiter(rawLines);

  // 1. Locate the Header Row (usually within first 20 rows)
  let headerIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(25, rawLines.length); i++) {
    const cols = splitCsvLine(rawLines[i], delimiter).map((c) => c.toLowerCase());
    const hasDate = cols.some((c) => /date/i.test(c));
    const hasParticulars = cols.some((c) => /particular|desc|narration|details/i.test(c));
    const hasAmount = cols.some((c) => /withdrawal|deposit|debit|credit|amount/i.test(c));

    if ((hasDate && hasParticulars) || (hasDate && hasAmount) || (hasParticulars && hasAmount)) {
      headerIndex = i;
      headers = splitCsvLine(rawLines[i], delimiter);
      break;
    }
  }

  // If no header found, assume row 0 is header
  if (headerIndex === -1) {
    headerIndex = 0;
    headers = splitCsvLine(rawLines[0], delimiter);
  }

  // 2. Map Column Indices
  let dateCol = -1;
  let valueDateCol = -1;
  let particularsCol = -1;
  let chequeCol = -1;
  let withdrawalsCol = -1;
  let depositsCol = -1;
  let balanceCol = -1;

  headers.forEach((h, idx) => {
    const cleanH = h.toLowerCase().trim();

    if (dateCol === -1 && /^(transaction\s*date|txn\s*date|trans\s*date|date)$/i.test(cleanH)) {
      dateCol = idx;
    } else if (valueDateCol === -1 && /value\s*date/i.test(cleanH)) {
      valueDateCol = idx;
    } else if (particularsCol === -1 && /^(particulars|description|narration|remarks|details|memo)$/i.test(cleanH)) {
      particularsCol = idx;
    } else if (chequeCol === -1 && /^(cheque|chq|ref|utr|reference)/i.test(cleanH)) {
      chequeCol = idx;
    } else if (withdrawalsCol === -1 && /^(withdrawals|withdrawal|debit|dr|withdrawal\s*amt|debit\s*amt)/i.test(cleanH)) {
      withdrawalsCol = idx;
    } else if (depositsCol === -1 && /^(deposits|deposit|credit|cr|deposit\s*amt|credit\s*amt)/i.test(cleanH)) {
      depositsCol = idx;
    } else if (balanceCol === -1 && /^(balance|balance\s*amount|closing\s*bal|closing\s*balance|bal)/i.test(cleanH)) {
      balanceCol = idx;
    }
  });

  // Fallbacks if exact headers were slightly non-standard
  if (dateCol === -1) {
    dateCol = headers.findIndex((h) => /date/i.test(h));
  }
  if (particularsCol === -1) {
    particularsCol = headers.findIndex((h) => /particular|desc|narrat/i.test(h));
  }
  if (withdrawalsCol === -1) {
    withdrawalsCol = headers.findIndex((h) => /withdraw|debit|dr/i.test(h));
  }
  if (depositsCol === -1) {
    depositsCol = headers.findIndex((h) => /deposit|credit|cr/i.test(h));
  }

  // 3. Parse Data Rows
  const parsedRows: ParsedStatementRow[] = [];
  let skippedCount = 0;

  for (let i = headerIndex + 1; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const cols = splitCsvLine(rawLine, delimiter);
    if (cols.length < 2) {
      skippedCount++;
      continue;
    }

    const rawDate = dateCol >= 0 ? cols[dateCol] : cols[0];
    const normalizedDate = parseBankDate(rawDate);
    if (!normalizedDate) {
      skippedCount++;
      continue; // Skip lines without a valid date (like page footers, subheadings)
    }

    const particulars = particularsCol >= 0 && cols[particularsCol] ? cols[particularsCol].trim() : 'Bank Transaction';
    const chequeNo = chequeCol >= 0 && cols[chequeCol] ? cols[chequeCol].trim() : undefined;
    const valueDate = valueDateCol >= 0 ? parseBankDate(cols[valueDateCol]) ?? undefined : undefined;

    const withdrawals = withdrawalsCol >= 0 ? parseBankAmount(cols[withdrawalsCol]) : 0;
    const deposits = depositsCol >= 0 ? parseBankAmount(cols[depositsCol]) : 0;
    const balance = balanceCol >= 0 && cols[balanceCol] ? parseBankAmount(cols[balanceCol]) : undefined;

    // Must have at least a withdrawal or deposit > 0
    if (withdrawals <= 0 && deposits <= 0) {
      skippedCount++;
      continue;
    }

    const type: 'IN' | 'OUT' = withdrawals > 0 ? 'OUT' : 'IN';
    const amount = withdrawals > 0 ? withdrawals : deposits;

    const rowMap: Record<string, string> = {};
    headers.forEach((h, cIdx) => {
      rowMap[h] = cols[cIdx] || '';
    });

    parsedRows.push({
      rowNumber: i + 1,
      date: normalizedDate,
      valueDate,
      particulars,
      chequeNo,
      withdrawals,
      deposits,
      balance,
      type,
      amount,
      raw: rowMap,
    });
  }

  return {
    success: parsedRows.length > 0,
    rows: parsedRows,
    totalRows: parsedRows.length,
    skippedRows: skippedCount,
    detectedHeaders: headers,
  };
}
