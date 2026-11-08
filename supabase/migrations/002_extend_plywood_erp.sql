-- =========================================================================
-- PLYWOOD ERP EXTENSION MIGRATION  —  002_extend_plywood_erp.sql
-- =========================================================================
-- HOW TO APPLY:
--   1. Log in to your Supabase Dashboard → SQL Editor
--   2. Click "+ New query", paste this entire script, click Run
--   3. This migration is SAFE TO RUN on a live database with existing data
--   4. It only ADDS new tables, never drops or alters existing ones
--   5. Run this AFTER the original supabase_schema.sql (001)
-- =========================================================================

-- -------------------------------------------------------------------------
-- EXTENSION: Needed for gen_random_uuid()
-- -------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- MASTER DATA TABLES
-- =========================================================================

-- -------------------------------------------------------------------------
-- A1. BUSINESS ENTITIES (Companies & Branches)
--     Distinct from public.entities (which are customers/suppliers/contacts)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_entities (
    id          TEXT PRIMARY KEY DEFAULT 'be_' || gen_random_uuid()::text,
    name        TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'company' CHECK (entity_type IN ('company', 'branch')),
    parent_id   TEXT REFERENCES public.business_entities(id) ON DELETE SET NULL,
    address     TEXT,
    phone       TEXT,
    gstin       TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_entities_type   ON public.business_entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_business_entities_parent ON public.business_entities (parent_id);

-- -------------------------------------------------------------------------
-- A2. CHART OF ACCOUNTS
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
    id           TEXT PRIMARY KEY DEFAULT 'acc_' || gen_random_uuid()::text,
    name         TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN (
                     'asset', 'liability', 'equity', 'income', 'expense')),
    sub_type     TEXT,                        -- e.g. 'cash', 'bank', 'receivable', 'payable'
    parent_id    TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    is_system    BOOLEAN NOT NULL DEFAULT false,  -- system accounts cannot be deleted
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_type ON public.accounts (account_type);

-- Seed essential system accounts (safe with ON CONFLICT)
INSERT INTO public.accounts (id, name, account_type, sub_type, is_system) VALUES
    ('acc_cash',              'Cash in Hand',               'asset',     'cash',        true),
    ('acc_bank',              'Bank Account',               'asset',     'bank',        true),
    ('acc_receivable',        'Accounts Receivable',        'asset',     'receivable',  true),
    ('acc_stock_plywood',     'Plywood Stock',              'asset',     'inventory',   true),
    ('acc_stock_wood',        'Wood Stock',                 'asset',     'inventory',   true),
    ('acc_stock_face_veneer', 'Face Veneer Stock',          'asset',     'inventory',   true),
    ('acc_stock_other_veneer','Other Veneer Stock',         'asset',     'inventory',   true),
    ('acc_stock_gum',         'Gum / Resin Stock',          'asset',     'inventory',   true),
    ('acc_payable',           'Accounts Payable',           'liability', 'payable',     true),
    ('acc_salary_payable',    'Salary Payable',             'liability', 'payable',     true),
    ('acc_partner_payable',   'Partner Remuneration Payable','liability','payable',     true),
    ('acc_sales',             'Sales Revenue',              'income',    'sales',       true),
    ('acc_purchase',          'Purchase / COGS',            'expense',   'cogs',        true),
    ('acc_salary_expense',    'Salary Expense',             'expense',   'salary',      true),
    ('acc_partner_remun',     'Partner Remuneration',       'expense',   'salary',      true),
    ('acc_transport',         'Transport & Freight',        'expense',   'opex',        true),
    ('acc_labour',            'Labour Expense',             'expense',   'opex',        true),
    ('acc_utilities',         'Utilities & Rent',           'expense',   'opex',        true),
    ('acc_misc_expense',      'Miscellaneous Expense',      'expense',   'opex',        true),
    ('acc_production',        'Production Clearing',        'asset',     'clearing',    true)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- A3. PRODUCTS (Plywood, Wood, Face Veneer, Other Veneer, Gum/Resin)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
    id           TEXT PRIMARY KEY DEFAULT 'prod_' || gen_random_uuid()::text,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL CHECK (category IN (
                     'plywood', 'wood', 'face_veneer', 'other_veneer', 'gum_resin', 'other')),
    unit         TEXT NOT NULL DEFAULT 'sheets',  -- sheets, sqft, pieces, kg, litre
    description  TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);

-- -------------------------------------------------------------------------
-- A4. PRODUCT VARIANTS (Size + Thickness for Plywood; just SKU for others)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_variants (
    id          TEXT PRIMARY KEY DEFAULT 'pv_' || gen_random_uuid()::text,
    product_id  TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    -- Plywood-specific
    size        TEXT CHECK (size IN ('8x4', '7x4', '6x4', '6x3', '5x4', '5x3')),
    thickness   NUMERIC(6,2),   -- mm: 25, 18, 16, 12, 9, 6
    sqft_per_sheet NUMERIC(8,4), -- computed from size, stored for reliability
    -- Generic
    sku         TEXT,
    unit        TEXT,           -- override product unit if needed
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants (product_id);

-- -------------------------------------------------------------------------
-- A5. EMPLOYEES
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
    id              TEXT PRIMARY KEY DEFAULT 'emp_' || gen_random_uuid()::text,
    name            TEXT NOT NULL,
    designation     TEXT,
    phone           TEXT,
    bank_account_no TEXT,
    ifsc            TEXT,
    monthly_salary  NUMERIC(14,2) DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_active ON public.employees (is_active);

-- -------------------------------------------------------------------------
-- A6. PARTNERS
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partners (
    id          TEXT PRIMARY KEY DEFAULT 'ptr_' || gen_random_uuid()::text,
    name        TEXT NOT NULL,
    phone       TEXT,
    address     TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- A7. BANK ACCOUNTS
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id              TEXT PRIMARY KEY DEFAULT 'bnk_' || gen_random_uuid()::text,
    business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE SET NULL,
    bank_name       TEXT NOT NULL,
    account_no      TEXT NOT NULL,
    ifsc            TEXT,
    branch_name     TEXT,
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_be ON public.bank_accounts (business_entity_id);

-- =========================================================================
-- INVENTORY TABLES
-- =========================================================================

-- -------------------------------------------------------------------------
-- B1. STOCK BALANCES (running totals per entity + variant)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_balances (
    id                 TEXT PRIMARY KEY DEFAULT 'sb_' || gen_random_uuid()::text,
    business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
    product_id         TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id         TEXT REFERENCES public.product_variants(id) ON DELETE CASCADE,
    qty_sheets         NUMERIC(14,4) NOT NULL DEFAULT 0,  -- for plywood
    qty_sqft           NUMERIC(14,4) NOT NULL DEFAULT 0,  -- primary internal unit for plywood
    qty_pieces         NUMERIC(14,4) NOT NULL DEFAULT 0,  -- for veneer
    qty_other          NUMERIC(14,4) NOT NULL DEFAULT 0,  -- for wood/gum/resin by weight/volume
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_entity_id, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_balances_be      ON public.stock_balances (business_entity_id);
CREATE INDEX IF NOT EXISTS idx_stock_balances_product ON public.stock_balances (product_id);

-- -------------------------------------------------------------------------
-- B2. STOCK MOVEMENTS (full audit trail)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id                 TEXT PRIMARY KEY DEFAULT 'sm_' || gen_random_uuid()::text,
    business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
    product_id         TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id         TEXT REFERENCES public.product_variants(id) ON DELETE SET NULL,
    movement_type      TEXT NOT NULL CHECK (movement_type IN (
                           'purchase', 'sale', 'production_in', 'production_out',
                           'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out')),
    qty_sheets         NUMERIC(14,4) DEFAULT 0,
    qty_sqft           NUMERIC(14,4) DEFAULT 0,
    qty_pieces         NUMERIC(14,4) DEFAULT 0,
    qty_other          NUMERIC(14,4) DEFAULT 0,
    reference_id       TEXT,  -- voucher_id or production_entry_id
    reference_type     TEXT CHECK (reference_type IN ('voucher', 'production', 'journal', 'adjustment')),
    narration          TEXT,
    movement_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_be      ON public.stock_movements (business_entity_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date    ON public.stock_movements (movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref     ON public.stock_movements (reference_id);

-- =========================================================================
-- PRODUCTION TABLE
-- =========================================================================

-- -------------------------------------------------------------------------
-- C1. PRODUCTION ENTRIES
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_entries (
    id                     TEXT PRIMARY KEY DEFAULT 'pe_' || gen_random_uuid()::text,
    business_entity_id     TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
    production_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    plywood_product_id     TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    plywood_variant_id     TEXT REFERENCES public.product_variants(id) ON DELETE RESTRICT,
    sheets_produced        NUMERIC(14,4) NOT NULL CHECK (sheets_produced > 0),
    sqft_produced          NUMERIC(14,4) NOT NULL,       -- sheets × sqft_per_sheet
    face_veneer_product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    face_veneer_ratio      NUMERIC(6,4) NOT NULL DEFAULT 2, -- pieces per sheet (configurable)
    face_veneer_consumed   NUMERIC(14,4) NOT NULL,          -- sheets_produced × ratio
    -- Stock movement references (populated after atomic insert)
    plywood_movement_id    TEXT,
    veneer_movement_id     TEXT,
    status                 TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
    notes                  TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_be   ON public.production_entries (business_entity_id);
CREATE INDEX IF NOT EXISTS idx_production_date ON public.production_entries (production_date DESC);

-- =========================================================================
-- ACCOUNTING TABLES
-- =========================================================================

-- -------------------------------------------------------------------------
-- D1. VOUCHERS (Sales, Purchase, Payment, Receipt, Expense)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vouchers (
    id                 TEXT PRIMARY KEY DEFAULT 'vch_' || gen_random_uuid()::text,
    business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE RESTRICT,
    voucher_type       TEXT NOT NULL CHECK (voucher_type IN (
                           'sales', 'purchase', 'payment', 'receipt', 'expense')),
    voucher_number     TEXT NOT NULL,
    voucher_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    party_entity_id    TEXT REFERENCES public.entities(id) ON DELETE SET NULL, -- customer/supplier
    -- Financial summary
    subtotal           NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    paid_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    balance_due        NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_status     TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN (
                           'paid', 'partial', 'unpaid')),
    payment_method     TEXT CHECK (payment_method IN ('cash', 'bank', 'upi', 'credit', 'mixed')),
    bank_account_id    TEXT REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    reference          TEXT,
    narration          TEXT,
    -- Link to existing cashflow transaction if applicable
    source_transaction_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL,
    status             TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_number_be ON public.vouchers (business_entity_id, voucher_type, voucher_number);
CREATE INDEX IF NOT EXISTS idx_vouchers_be          ON public.vouchers (business_entity_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_type        ON public.vouchers (voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_date        ON public.vouchers (voucher_date DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_party       ON public.vouchers (party_entity_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_status      ON public.vouchers (payment_status);

-- -------------------------------------------------------------------------
-- D2. VOUCHER LINES (Line items for each voucher)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voucher_lines (
    id              TEXT PRIMARY KEY DEFAULT 'vl_' || gen_random_uuid()::text,
    voucher_id      TEXT NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
    line_no         INTEGER NOT NULL DEFAULT 1,
    product_id      TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id      TEXT REFERENCES public.product_variants(id) ON DELETE SET NULL,
    description     TEXT,
    unit            TEXT,
    quantity        NUMERIC(14,4) NOT NULL DEFAULT 0,
    quantity_sqft   NUMERIC(14,4),                     -- for plywood billing in sqft
    rate            NUMERIC(14,4) NOT NULL DEFAULT 0,  -- rate per unit
    tax_percent     NUMERIC(6,2) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total      NUMERIC(14,2) NOT NULL DEFAULT 0,  -- qty × rate + tax
    debit_account_id  TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    credit_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher  ON public.voucher_lines (voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_product  ON public.voucher_lines (product_id);

-- -------------------------------------------------------------------------
-- D3. JOURNAL ENTRIES (General Journal)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id                 TEXT PRIMARY KEY DEFAULT 'je_' || gen_random_uuid()::text,
    business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE RESTRICT,
    entry_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference          TEXT,
    narration          TEXT NOT NULL,
    total_debit        NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_credit       NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_balanced        BOOLEAN GENERATED ALWAYS AS (total_debit = total_credit) STORED,
    status             TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_journal_balanced CHECK (total_debit = total_credit)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_be   ON public.journal_entries (business_entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries (entry_date DESC);

-- -------------------------------------------------------------------------
-- D4. JOURNAL LINES (Debit / Credit legs of each journal)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_lines (
    id              TEXT PRIMARY KEY DEFAULT 'jl_' || gen_random_uuid()::text,
    journal_id      TEXT NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id      TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    debit_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    narration       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_line_one_side CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (credit_amount > 0 AND debit_amount = 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal  ON public.journal_lines (journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account  ON public.journal_lines (account_id);

-- =========================================================================
-- SALARY TABLES
-- =========================================================================

-- -------------------------------------------------------------------------
-- E1. SALARY RECORDS (Booking + Payment, single row per salary event)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_records (
    id                 TEXT PRIMARY KEY DEFAULT 'sal_' || gen_random_uuid()::text,
    business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE RESTRICT,
    voucher_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    salary_month       TEXT NOT NULL,   -- format: 'YYYY-MM', e.g. '2026-10'
    payee_type         TEXT NOT NULL CHECK (payee_type IN ('employee', 'partner')),
    employee_id        TEXT REFERENCES public.employees(id) ON DELETE SET NULL,
    partner_id         TEXT REFERENCES public.partners(id) ON DELETE SET NULL,
    payee_name         TEXT NOT NULL,  -- denormalized for history
    -- Booking
    booked_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    expense_account_id TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    payable_account_id TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    -- Payment (can be 0 if only booked, filled when paid)
    paid_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    pending_amount     NUMERIC(14,2) GENERATED ALWAYS AS (booked_amount - paid_amount) STORED,
    payment_method     TEXT CHECK (payment_method IN ('cash', 'bank', 'upi')),
    bank_account_id    TEXT REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    payment_reference  TEXT,
    payment_date       TIMESTAMPTZ,
    status             TEXT NOT NULL DEFAULT 'booked' CHECK (status IN (
                           'booked', 'partial', 'paid', 'cancelled')),
    narration          TEXT,
    -- Link to journal entry for audit trail
    booking_journal_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    payment_journal_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_be     ON public.salary_records (business_entity_id);
CREATE INDEX IF NOT EXISTS idx_salary_month  ON public.salary_records (salary_month);
CREATE INDEX IF NOT EXISTS idx_salary_payee  ON public.salary_records (payee_type, employee_id, partner_id);
CREATE INDEX IF NOT EXISTS idx_salary_status ON public.salary_records (status);

-- =========================================================================
-- BANKING TABLES
-- =========================================================================

-- -------------------------------------------------------------------------
-- F1. BANK STATEMENT TRANSACTIONS (Imported from CSV or manual)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_statement_transactions (
    id              TEXT PRIMARY KEY DEFAULT 'bst_' || gen_random_uuid()::text,
    bank_account_id TEXT NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
    txn_date        TIMESTAMPTZ NOT NULL,
    description     TEXT,
    debit_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    balance         NUMERIC(14,2),
    reference       TEXT,
    is_matched      BOOLEAN NOT NULL DEFAULT false,
    import_batch    TEXT,   -- identifier for a CSV import batch (to prevent re-import)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bst_no_duplicate ON public.bank_statement_transactions
    (bank_account_id, txn_date, description, debit_amount, credit_amount);
CREATE INDEX IF NOT EXISTS idx_bst_account  ON public.bank_statement_transactions (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bst_date     ON public.bank_statement_transactions (txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_bst_matched  ON public.bank_statement_transactions (is_matched);

-- -------------------------------------------------------------------------
-- F2. BANK RECONCILIATION MATCHES
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_matches (
    id                     TEXT PRIMARY KEY DEFAULT 'brm_' || gen_random_uuid()::text,
    bank_statement_txn_id  TEXT NOT NULL REFERENCES public.bank_statement_transactions(id) ON DELETE CASCADE,
    voucher_id             TEXT REFERENCES public.vouchers(id) ON DELETE SET NULL,
    salary_record_id       TEXT REFERENCES public.salary_records(id) ON DELETE SET NULL,
    journal_entry_id       TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    matched_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    matched_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_by             TEXT,
    CONSTRAINT chk_brm_one_reference CHECK (
        (voucher_id IS NOT NULL)::int +
        (salary_record_id IS NOT NULL)::int +
        (journal_entry_id IS NOT NULL)::int >= 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brm_statement_unique ON public.bank_reconciliation_matches (bank_statement_txn_id);
CREATE INDEX IF NOT EXISTS idx_brm_voucher ON public.bank_reconciliation_matches (voucher_id);

-- =========================================================================
-- ERP SETTINGS TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.erp_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default settings
INSERT INTO public.erp_settings (key, value) VALUES
    ('face_veneer_ratio',  '2'),       -- pieces of face veneer per plywood sheet
    ('default_tax_percent','0'),       -- default GST %
    ('currency_symbol',    '₹'),
    ('sqft_to_sqm_factor', '0.0929')   -- 1 sqft = 0.0929 sqm
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- VOUCHER NUMBER SEQUENCE HELPER TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.voucher_sequences (
    id            TEXT PRIMARY KEY,  -- e.g. 'SAL-2026', 'PUR-2026'
    last_number   INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================================
-- POSTGRESQL FUNCTIONS (ATOMIC OPERATIONS)
-- =========================================================================

-- -------------------------------------------------------------------------
-- FN1: get_next_voucher_number(prefix, year)
--      Returns next sequential voucher number like 'SAL-2026-0001'
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_next_voucher_number(
    p_prefix TEXT,
    p_year   INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_key    TEXT;
    v_num    INTEGER;
    v_result TEXT;
BEGIN
    v_key := p_prefix || '-' || p_year::TEXT;

    INSERT INTO public.voucher_sequences (id, last_number)
    VALUES (v_key, 1)
    ON CONFLICT (id) DO UPDATE
        SET last_number = voucher_sequences.last_number + 1,
            updated_at  = NOW()
    RETURNING last_number INTO v_num;

    v_result := p_prefix || '-' || p_year::TEXT || '-' || LPAD(v_num::TEXT, 4, '0');
    RETURN v_result;
END;
$$;

-- -------------------------------------------------------------------------
-- FN2: post_production_entry(...)
--      Atomically records production, adds plywood stock, deducts face veneer
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_production_entry(
    p_business_entity_id     TEXT,
    p_production_date        TIMESTAMPTZ,
    p_plywood_product_id     TEXT,
    p_plywood_variant_id     TEXT,
    p_sheets_produced        NUMERIC,
    p_sqft_produced          NUMERIC,
    p_face_veneer_product_id TEXT,
    p_face_veneer_ratio      NUMERIC,
    p_face_veneer_consumed   NUMERIC,
    p_notes                  TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_entry_id        TEXT;
    v_veneer_stock    NUMERIC;
    v_plywood_move_id TEXT;
    v_veneer_move_id  TEXT;
BEGIN
    -- 1. Check face veneer stock
    SELECT COALESCE(SUM(qty_pieces), 0)
    INTO v_veneer_stock
    FROM public.stock_balances
    WHERE business_entity_id = p_business_entity_id
      AND product_id = p_face_veneer_product_id;

    IF v_veneer_stock < p_face_veneer_consumed THEN
        RAISE EXCEPTION 'Insufficient face veneer stock. Available: %, Required: %',
            v_veneer_stock, p_face_veneer_consumed;
    END IF;

    -- 2. Create production entry
    v_entry_id := 'pe_' || gen_random_uuid()::text;
    INSERT INTO public.production_entries (
        id, business_entity_id, production_date,
        plywood_product_id, plywood_variant_id,
        sheets_produced, sqft_produced,
        face_veneer_product_id, face_veneer_ratio, face_veneer_consumed,
        notes
    ) VALUES (
        v_entry_id, p_business_entity_id, p_production_date,
        p_plywood_product_id, p_plywood_variant_id,
        p_sheets_produced, p_sqft_produced,
        p_face_veneer_product_id, p_face_veneer_ratio, p_face_veneer_consumed,
        p_notes
    );

    -- 3. Add plywood stock
    INSERT INTO public.stock_balances (
        business_entity_id, product_id, variant_id,
        qty_sheets, qty_sqft, qty_pieces, qty_other
    ) VALUES (
        p_business_entity_id, p_plywood_product_id, p_plywood_variant_id,
        p_sheets_produced, p_sqft_produced, 0, 0
    )
    ON CONFLICT (business_entity_id, product_id, variant_id) DO UPDATE
        SET qty_sheets = stock_balances.qty_sheets + p_sheets_produced,
            qty_sqft   = stock_balances.qty_sqft   + p_sqft_produced,
            updated_at = NOW();

    -- 4. Record plywood stock movement
    v_plywood_move_id := 'sm_' || gen_random_uuid()::text;
    INSERT INTO public.stock_movements (
        id, business_entity_id, product_id, variant_id,
        movement_type, qty_sheets, qty_sqft,
        reference_id, reference_type, narration, movement_date
    ) VALUES (
        v_plywood_move_id, p_business_entity_id, p_plywood_product_id, p_plywood_variant_id,
        'production_in', p_sheets_produced, p_sqft_produced,
        v_entry_id, 'production', 'Plywood produced', p_production_date
    );

    -- 5. Deduct face veneer stock
    UPDATE public.stock_balances
    SET qty_pieces = qty_pieces - p_face_veneer_consumed,
        updated_at = NOW()
    WHERE business_entity_id = p_business_entity_id
      AND product_id = p_face_veneer_product_id;

    -- 6. Record veneer stock movement
    v_veneer_move_id := 'sm_' || gen_random_uuid()::text;
    INSERT INTO public.stock_movements (
        id, business_entity_id, product_id, variant_id,
        movement_type, qty_pieces,
        reference_id, reference_type, narration, movement_date
    ) VALUES (
        v_veneer_move_id, p_business_entity_id, p_face_veneer_product_id, NULL,
        'production_out', p_face_veneer_consumed,
        v_entry_id, 'production', 'Face veneer consumed in production', p_production_date
    );

    -- 7. Update production entry with movement IDs
    UPDATE public.production_entries
    SET plywood_movement_id = v_plywood_move_id,
        veneer_movement_id  = v_veneer_move_id
    WHERE id = v_entry_id;

    RETURN v_entry_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN3: post_stock_movement(...)
--      Atomic stock adjustment (purchase IN, sale OUT, manual adjustment)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_stock_movement(
    p_business_entity_id TEXT,
    p_product_id         TEXT,
    p_variant_id         TEXT,
    p_movement_type      TEXT,
    p_qty_sheets         NUMERIC DEFAULT 0,
    p_qty_sqft           NUMERIC DEFAULT 0,
    p_qty_pieces         NUMERIC DEFAULT 0,
    p_qty_other          NUMERIC DEFAULT 0,
    p_reference_id       TEXT DEFAULT NULL,
    p_reference_type     TEXT DEFAULT NULL,
    p_narration          TEXT DEFAULT NULL,
    p_movement_date      TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_move_id      TEXT;
    v_direction    INTEGER; -- +1 for in, -1 for out
    v_cur_qty_sqft NUMERIC;
    v_cur_qty_pieces NUMERIC;
    v_cur_qty_other  NUMERIC;
BEGIN
    -- Determine direction
    IF p_movement_type IN ('purchase', 'production_in', 'adjustment_in', 'transfer_in') THEN
        v_direction := 1;
    ELSE
        v_direction := -1;
    END IF;

    -- Check for negative stock (for outbound movements)
    IF v_direction = -1 THEN
        SELECT COALESCE(qty_sqft, 0), COALESCE(qty_pieces, 0), COALESCE(qty_other, 0)
        INTO v_cur_qty_sqft, v_cur_qty_pieces, v_cur_qty_other
        FROM public.stock_balances
        WHERE business_entity_id = p_business_entity_id
          AND product_id = p_product_id
          AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL));

        IF p_qty_sqft > 0 AND v_cur_qty_sqft < p_qty_sqft THEN
            RAISE EXCEPTION 'Insufficient sqft stock. Available: %, Required: %',
                v_cur_qty_sqft, p_qty_sqft;
        END IF;
        IF p_qty_pieces > 0 AND v_cur_qty_pieces < p_qty_pieces THEN
            RAISE EXCEPTION 'Insufficient pieces stock. Available: %, Required: %',
                v_cur_qty_pieces, p_qty_pieces;
        END IF;
        IF p_qty_other > 0 AND v_cur_qty_other < p_qty_other THEN
            RAISE EXCEPTION 'Insufficient quantity. Available: %, Required: %',
                v_cur_qty_other, p_qty_other;
        END IF;
    END IF;

    -- Update stock balance
    INSERT INTO public.stock_balances (
        business_entity_id, product_id, variant_id,
        qty_sheets, qty_sqft, qty_pieces, qty_other
    ) VALUES (
        p_business_entity_id, p_product_id, p_variant_id,
        v_direction * p_qty_sheets,
        v_direction * p_qty_sqft,
        v_direction * p_qty_pieces,
        v_direction * p_qty_other
    )
    ON CONFLICT (business_entity_id, product_id, variant_id) DO UPDATE
        SET qty_sheets  = stock_balances.qty_sheets  + (v_direction * p_qty_sheets),
            qty_sqft    = stock_balances.qty_sqft    + (v_direction * p_qty_sqft),
            qty_pieces  = stock_balances.qty_pieces  + (v_direction * p_qty_pieces),
            qty_other   = stock_balances.qty_other   + (v_direction * p_qty_other),
            updated_at  = NOW();

    -- Record movement
    v_move_id := 'sm_' || gen_random_uuid()::text;
    INSERT INTO public.stock_movements (
        id, business_entity_id, product_id, variant_id,
        movement_type, qty_sheets, qty_sqft, qty_pieces, qty_other,
        reference_id, reference_type, narration, movement_date
    ) VALUES (
        v_move_id, p_business_entity_id, p_product_id, p_variant_id,
        p_movement_type,
        p_qty_sheets, p_qty_sqft, p_qty_pieces, p_qty_other,
        p_reference_id, p_reference_type, p_narration, p_movement_date
    );

    RETURN v_move_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN4: get_trial_balance(p_business_entity_id, p_from_date, p_to_date)
--      Returns account-wise debit/credit totals from voucher_lines & journal_lines
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trial_balance(
    p_business_entity_id TEXT,
    p_from_date TIMESTAMPTZ DEFAULT '2000-01-01',
    p_to_date   TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    account_id    TEXT,
    account_name  TEXT,
    account_type  TEXT,
    total_debit   NUMERIC,
    total_credit  NUMERIC,
    net_balance   NUMERIC
)
LANGUAGE sql
AS $$
    -- Journal lines
    SELECT
        a.id           AS account_id,
        a.name         AS account_name,
        a.account_type AS account_type,
        SUM(jl.debit_amount)  AS total_debit,
        SUM(jl.credit_amount) AS total_credit,
        SUM(jl.debit_amount) - SUM(jl.credit_amount) AS net_balance
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_id
    JOIN public.accounts a ON a.id = jl.account_id
    WHERE je.business_entity_id = p_business_entity_id
      AND je.status = 'posted'
      AND je.entry_date BETWEEN p_from_date AND p_to_date
    GROUP BY a.id, a.name, a.account_type
$$;

-- =========================================================================
-- ROW LEVEL SECURITY FOR NEW TABLES
-- =========================================================================

ALTER TABLE public.business_entities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_balances             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_lines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_sequences          ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-applying (safe re-run)
DO $$
DECLARE
    tbl TEXT;
    pol TEXT;
BEGIN
    FOR tbl, pol IN VALUES
        ('business_entities',          'Allow public all on business_entities'),
        ('accounts',                   'Allow public all on accounts'),
        ('products',                   'Allow public all on products'),
        ('product_variants',           'Allow public all on product_variants'),
        ('employees',                  'Allow public all on employees'),
        ('partners',                   'Allow public all on partners'),
        ('bank_accounts',              'Allow public all on bank_accounts'),
        ('stock_balances',             'Allow public all on stock_balances'),
        ('stock_movements',            'Allow public all on stock_movements'),
        ('production_entries',         'Allow public all on production_entries'),
        ('vouchers',                   'Allow public all on vouchers'),
        ('voucher_lines',              'Allow public all on voucher_lines'),
        ('journal_entries',            'Allow public all on journal_entries'),
        ('journal_lines',              'Allow public all on journal_lines'),
        ('salary_records',             'Allow public all on salary_records'),
        ('bank_statement_transactions','Allow public all on bank_statement_transactions'),
        ('bank_reconciliation_matches','Allow public all on bank_reconciliation_matches'),
        ('erp_settings',               'Allow public all on erp_settings'),
        ('voucher_sequences',          'Allow public all on voucher_sequences')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
END;
$$;

-- Create matching-pattern policies (consistent with existing schema)
CREATE POLICY "Allow public all on business_entities"
    ON public.business_entities FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on accounts"
    ON public.accounts FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on products"
    ON public.products FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on product_variants"
    ON public.product_variants FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on employees"
    ON public.employees FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on partners"
    ON public.partners FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on bank_accounts"
    ON public.bank_accounts FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on stock_balances"
    ON public.stock_balances FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on stock_movements"
    ON public.stock_movements FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on production_entries"
    ON public.production_entries FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on vouchers"
    ON public.vouchers FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on voucher_lines"
    ON public.voucher_lines FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on journal_entries"
    ON public.journal_entries FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on journal_lines"
    ON public.journal_lines FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on salary_records"
    ON public.salary_records FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on bank_statement_transactions"
    ON public.bank_statement_transactions FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on bank_reconciliation_matches"
    ON public.bank_reconciliation_matches FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on erp_settings"
    ON public.erp_settings FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all on voucher_sequences"
    ON public.voucher_sequences FOR ALL TO public, anon, authenticated
    USING (true) WITH CHECK (true);

-- =========================================================================
-- GRANT FUNCTION EXECUTION TO ANON/AUTHENTICATED
-- =========================================================================
GRANT EXECUTE ON FUNCTION public.get_next_voucher_number(TEXT, INTEGER)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_production_entry(TEXT,TIMESTAMPTZ,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,NUMERIC,NUMERIC,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_movement(TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(TEXT,TIMESTAMPTZ,TIMESTAMPTZ) TO anon, authenticated;

-- =========================================================================
-- MIGRATION COMPLETE
-- =========================================================================
-- Summary of what was added:
--   Tables: business_entities, accounts, products, product_variants,
--           employees, partners, bank_accounts,
--           stock_balances, stock_movements,
--           production_entries,
--           vouchers, voucher_lines,
--           journal_entries, journal_lines,
--           salary_records,
--           bank_statement_transactions, bank_reconciliation_matches,
--           erp_settings, voucher_sequences
--
--   Functions: get_next_voucher_number, post_production_entry,
--              post_stock_movement, get_trial_balance
--
--   Existing tables: UNCHANGED
--   Existing data:   UNCHANGED
-- =========================================================================
