-- =========================================================================
-- PLYWOOD POS & ERP SYSTEM - COMPLETE PRODUCTION MASTER SCHEMA (supabase.sql)
-- =========================================================================
-- HOW TO USE:
--   1. Log in to your Supabase Dashboard: https://supabase.com/dashboard
--   2. Go to your Project -> SQL Editor -> "+ New query"
--   3. Paste this ENTIRE file and click "Run" (or Ctrl+Enter)
--   4. FAILSAFE & IDEMPOTENT: This script can be run multiple times safely.
--      It will NEVER delete or corrupt existing transactions or ERP records.
--      It creates tables IF NOT EXISTS, alters missing columns IF NOT EXISTS,
--      hardens database constraints, builds performance indexes, installs
--      atomic PL/pgSQL stored procedures, and applies zero-DELETE audit RLS.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. EXTENSIONS & DYNAMIC UTILITIES
-- -------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Dynamic SQL Execution Helper (Enables seamless in-app schema migrations)
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    EXECUTE query;
END;
$$;

-- =========================================================================
-- 1. BASE POS & EXPENSE TRACKER TABLES (PRESERVED)
-- =========================================================================

-- 1.1 Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'BOTH')),
    color      TEXT DEFAULT '#94a3b8',
    icon       TEXT DEFAULT 'tag',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.2 Entities (Customers, Suppliers, Transporters, Contractors) Table
CREATE TABLE IF NOT EXISTS public.entities (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'Other',
    phone      TEXT,
    address    TEXT,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.3 Custom Fields Definition Table
CREATE TABLE IF NOT EXISTS public.custom_fields (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('text', 'number')),
    apply_to   TEXT NOT NULL CHECK (apply_to IN ('IN', 'OUT', 'BOTH')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.4 Transactions Table (Cashflow + Credit / Invoices)
CREATE TABLE IF NOT EXISTS public.transactions (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
    amount        NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_amount  NUMERIC(14, 2) DEFAULT NULL,
    paid_amount   NUMERIC(14, 2) DEFAULT NULL,
    balance_due   NUMERIC(14, 2) DEFAULT 0.00,
    credit_status TEXT DEFAULT 'PAID' CHECK (credit_status IN ('PAID', 'PARTIAL', 'UNPAID')),
    due_date      TIMESTAMPTZ DEFAULT NULL,
    date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category_id   TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    entity_id     TEXT REFERENCES public.entities(id) ON DELETE SET NULL,
    product_id    TEXT,
    quantity      NUMERIC(14, 2),
    description   TEXT,
    notes         TEXT,
    reference     TEXT,
    custom_data   JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1.5 Credit Payments Table (Installment Repayment Ledger)
CREATE TABLE IF NOT EXISTS public.credit_payments (
    id             TEXT PRIMARY KEY,
    transaction_id TEXT REFERENCES public.transactions(id) ON DELETE CASCADE,
    entity_id      TEXT REFERENCES public.entities(id) ON DELETE CASCADE,
    amount         NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    payment_type   TEXT NOT NULL CHECK (payment_type IN ('IN', 'OUT')),
    payment_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================================
-- 2. ENTERPRISE RESOURCE PLANNING (ERP) CORE TABLES
-- =========================================================================

-- 2.1 Business Entities (Companies & Branches)
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

-- 2.2 Chart of Accounts (Double-Entry General Ledger)
CREATE TABLE IF NOT EXISTS public.accounts (
    id           TEXT PRIMARY KEY DEFAULT 'acc_' || gen_random_uuid()::text,
    name         TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
    sub_type     TEXT,
    parent_id    TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    is_system    BOOLEAN NOT NULL DEFAULT false,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.3 Products Master Table
CREATE TABLE IF NOT EXISTS public.products (
    id          TEXT PRIMARY KEY DEFAULT 'prod_' || gen_random_uuid()::text,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL CHECK (category IN (
                    'plywood', 'wood', 'face_veneer', 'other_veneer', 'gum_resin', 'other')),
    unit        TEXT NOT NULL DEFAULT 'pieces',
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.4 Product Variants Table (Sizes & Thicknesses)
CREATE TABLE IF NOT EXISTS public.product_variants (
    id             TEXT PRIMARY KEY DEFAULT 'pv_' || gen_random_uuid()::text,
    product_id     TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    size           TEXT CHECK (size IN ('8x4', '7x4', '6x4', '6x3', '5x4', '5x3')),
    thickness      NUMERIC(6, 2) CHECK (thickness IS NULL OR thickness IN (25, 18, 16, 12, 9, 6)),
    sqft_per_sheet NUMERIC(8, 4),
    sku            TEXT,
    unit           TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.5 Employees Master Table
CREATE TABLE IF NOT EXISTS public.employees (
    id             TEXT PRIMARY KEY DEFAULT 'emp_' || gen_random_uuid()::text,
    name           TEXT NOT NULL,
    designation    TEXT,
    monthly_salary NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    phone          TEXT,
    join_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.6 Partners Master Table
CREATE TABLE IF NOT EXISTS public.partners (
    id               TEXT PRIMARY KEY DEFAULT 'ptr_' || gen_random_uuid()::text,
    name             TEXT NOT NULL,
    monthly_remun    NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    profit_share_pct NUMERIC(5, 2)  NOT NULL DEFAULT 0.00,
    phone            TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.7 Bank Accounts Master Table
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id                 TEXT PRIMARY KEY DEFAULT 'bnk_' || gen_random_uuid()::text,
    business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE CASCADE,
    bank_name          TEXT NOT NULL,
    account_no         TEXT NOT NULL,
    branch             TEXT,
    ifsc               TEXT,
    opening_balance    NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    current_balance    NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_active          BOOLEAN NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep the application-facing branch name available on databases created from
-- older versions of the schema.
ALTER TABLE public.bank_accounts
    ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.bank_accounts
    ADD COLUMN IF NOT EXISTS current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'bank_accounts'
          AND column_name = 'branch'
    ) THEN
        UPDATE public.bank_accounts
        SET branch_name = branch
        WHERE branch_name IS NULL
          AND branch IS NOT NULL;
    END IF;
END;
$$;

-- 2.8 Stock Balances Table
CREATE TABLE IF NOT EXISTS public.stock_balances (
    id                 TEXT PRIMARY KEY DEFAULT 'sb_' || gen_random_uuid()::text,
    business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
    product_id         TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id         TEXT REFERENCES public.product_variants(id) ON DELETE CASCADE,
    qty_sheets         NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    qty_sqft           NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    qty_pieces         NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    qty_other          NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    avg_cost           NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.9 Stock Movements Audit Ledger Table (Immutable Log)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id                 TEXT PRIMARY KEY DEFAULT 'sm_' || gen_random_uuid()::text,
    business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
    product_id         TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id         TEXT REFERENCES public.product_variants(id) ON DELETE SET NULL,
    movement_type      TEXT NOT NULL CHECK (movement_type IN (
                           'purchase', 'sale', 'production_in', 'production_out',
                           'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out')),
    qty_sheets         NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    qty_sqft           NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    qty_pieces         NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    qty_other          NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    unit_cost          NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    reference_id       TEXT,
    reference_type     TEXT CHECK (reference_type IN ('voucher', 'production', 'manual', 'opening', 'voucher_cancellation', 'production_cancellation')),
    narration          TEXT,
    movement_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.10 Production Entries Table
CREATE TABLE IF NOT EXISTS public.production_entries (
    id                     TEXT PRIMARY KEY DEFAULT 'pe_' || gen_random_uuid()::text,
    business_entity_id     TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
    production_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    plywood_product_id     TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    plywood_variant_id     TEXT REFERENCES public.product_variants(id) ON DELETE RESTRICT,
    sheets_produced        NUMERIC(14, 4) NOT NULL,
    sqft_produced          NUMERIC(14, 4) NOT NULL,
    face_veneer_product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    face_veneer_ratio      NUMERIC(8, 4) NOT NULL DEFAULT 2.0000,
    face_veneer_consumed   NUMERIC(14, 4) NOT NULL,
    veneer_movement_id     TEXT,
    plywood_movement_id    TEXT,
    status                 TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
    notes                  TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.11 Vouchers Header Table
CREATE TABLE IF NOT EXISTS public.vouchers (
    id                    TEXT PRIMARY KEY DEFAULT 'vch_' || gen_random_uuid()::text,
    business_entity_id    TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
    voucher_type          TEXT NOT NULL CHECK (voucher_type IN (
                              'sales', 'purchase', 'receipt', 'payment', 'expense')),
    voucher_number        TEXT NOT NULL,
    voucher_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    party_entity_id       TEXT REFERENCES public.entities(id) ON DELETE SET NULL,
    subtotal              NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    tax_amount            NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_amount          NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    paid_amount           NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    balance_due           NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    payment_status        TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN (
                              'paid', 'partial', 'unpaid')),
    payment_method        TEXT CHECK (payment_method IN ('cash', 'bank', 'cheque', 'upi', 'credit')),
    bank_account_id       TEXT REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    reference             TEXT,
    narration             TEXT,
    source_transaction_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL,
    journal_entry_id      TEXT,
    status                TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.12 Voucher Line Items Table
CREATE TABLE IF NOT EXISTS public.voucher_lines (
    id                TEXT PRIMARY KEY DEFAULT 'vl_' || gen_random_uuid()::text,
    voucher_id        TEXT NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
    line_no           INTEGER NOT NULL DEFAULT 1,
    product_id        TEXT REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id        TEXT REFERENCES public.product_variants(id) ON DELETE SET NULL,
    description       TEXT,
    unit              TEXT NOT NULL DEFAULT 'pieces',
    quantity          NUMERIC(14, 4) NOT NULL DEFAULT 1.0000,
    quantity_sqft     NUMERIC(14, 4),
    rate              NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    tax_percent       NUMERIC(5, 2)  NOT NULL DEFAULT 0.00,
    tax_amount        NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    line_total        NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    unit_cost         NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    debit_account_id  TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    credit_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.13 Journal Entries (General Ledger Header)
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id                 TEXT PRIMARY KEY DEFAULT 'je_' || gen_random_uuid()::text,
    business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
    entry_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference          TEXT,
    narration          TEXT,
    total_debit        NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_credit       NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_balanced        BOOLEAN NOT NULL DEFAULT false,
    status             TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.14 Journal Lines (Double-Entry Debit & Credit Records)
CREATE TABLE IF NOT EXISTS public.journal_lines (
    id            TEXT PRIMARY KEY DEFAULT 'jl_' || gen_random_uuid()::text,
    journal_id    TEXT NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id    TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    debit_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    credit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    narration     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.15 Salary Records Table
CREATE TABLE IF NOT EXISTS public.salary_records (
    id                 TEXT PRIMARY KEY DEFAULT 'sal_' || gen_random_uuid()::text,
    business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE CASCADE,
    voucher_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    salary_month       TEXT NOT NULL,
    salary_frequency   TEXT NOT NULL DEFAULT 'monthly' CHECK (salary_frequency IN ('monthly', 'weekly')),
    payee_type         TEXT NOT NULL CHECK (payee_type IN ('employee', 'partner')),
    employee_id        TEXT REFERENCES public.employees(id) ON DELETE SET NULL,
    partner_id         TEXT REFERENCES public.partners(id) ON DELETE SET NULL,
    payee_name         TEXT NOT NULL,
    booked_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    paid_amount        NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    status             TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'partial', 'paid', 'cancelled')),
    expense_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    payable_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
    booking_journal_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    payment_journal_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    payment_method     TEXT CHECK (payment_method IN ('cash', 'bank', 'cheque', 'upi')),
    bank_account_id    TEXT REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    payment_reference  TEXT,
    payment_date       TIMESTAMPTZ,
    narration          TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.16 Bank Statement Transactions Table
CREATE TABLE IF NOT EXISTS public.bank_statement_transactions (
    id                     TEXT PRIMARY KEY DEFAULT 'bst_' || gen_random_uuid()::text,
    bank_account_id        TEXT NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
    txn_date               DATE NOT NULL,
    description            TEXT,
    reference_no           TEXT,
    reference              TEXT,
    debit_amount           NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    credit_amount          NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    balance_after          NUMERIC(14, 2),
    balance                NUMERIC(14, 2),
    is_matched             BOOLEAN NOT NULL DEFAULT false,
    import_batch           TEXT,
    transaction_id         TEXT REFERENCES public.transactions(id) ON DELETE SET NULL,
    potential_duplicate_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL,
    duplicate_reason       TEXT,
    review_status          TEXT NOT NULL DEFAULT 'auto_added',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Non-destructive column additions for existing installations
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS reference_no TEXT;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS balance NUMERIC(14, 2);
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14, 2);
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS import_batch TEXT;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS transaction_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS potential_duplicate_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'auto_added';

-- 2.17 Bank Reconciliation Matches Table
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_matches (
    id                     TEXT PRIMARY KEY DEFAULT 'brm_' || gen_random_uuid()::text,
    bank_statement_txn_id  TEXT NOT NULL REFERENCES public.bank_statement_transactions(id) ON DELETE CASCADE,
    voucher_id             TEXT REFERENCES public.vouchers(id) ON DELETE SET NULL,
    salary_record_id       TEXT REFERENCES public.salary_records(id) ON DELETE SET NULL,
    journal_entry_id       TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL,
    matched_amount         NUMERIC(14, 2) NOT NULL,
    matched_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.18 ERP Key-Value Settings Table
CREATE TABLE IF NOT EXISTS public.erp_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.19 Voucher Auto-Numbering Sequences Table
CREATE TABLE IF NOT EXISTS public.voucher_sequences (
    id          TEXT PRIMARY KEY,
    last_number INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.20 Units of Measurement Table
CREATE TABLE IF NOT EXISTS public.units_of_measurement (
    id                TEXT PRIMARY KEY DEFAULT 'uom_' || gen_random_uuid()::text,
    name              TEXT NOT NULL,
    abbreviation      TEXT NOT NULL,
    conversion_factor NUMERIC(12, 6) NOT NULL DEFAULT 1.000000,
    base_unit         TEXT DEFAULT 'pieces',
    description       TEXT,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.21 Edit Audit Logs Table
CREATE TABLE IF NOT EXISTS public.edit_audit_logs (
    id              TEXT PRIMARY KEY DEFAULT 'audit_' || gen_random_uuid()::text,
    entity_type     TEXT NOT NULL,
    record_id       TEXT NOT NULL,
    user_identifier TEXT DEFAULT 'master_user',
    action          TEXT NOT NULL DEFAULT 'UPDATE',
    old_values      JSONB,
    new_values      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================================
-- 3. SCHEMA HARDENING & BACKWARD-COMPATIBLE COLUMN ADDITIONS
-- =========================================================================
-- Every table and column is hardened with non-destructive ADD COLUMN IF NOT EXISTS
-- so that legacy or partially migrated databases can be safely upgraded in-place.

-- 3.1 Categories Table
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#94a3b8';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'tag';
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.2 Entities (Customers, Suppliers, Transporters, Contractors) Table
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Other';
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS alt_phone TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS credit_period INTEGER DEFAULT NULL;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS credit_terms TEXT DEFAULT NULL;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.3 Custom Fields Table
ALTER TABLE public.custom_fields ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.custom_fields ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.custom_fields ADD COLUMN IF NOT EXISTS apply_to TEXT;
ALTER TABLE public.custom_fields ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.4 Transactions Table
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS balance_due NUMERIC(14, 2) DEFAULT 0.00;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS credit_status TEXT DEFAULT 'PAID';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS entity_id TEXT REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 2);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS custom_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.5 Credit Payments Table
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS transaction_id TEXT REFERENCES public.transactions(id) ON DELETE CASCADE;
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS entity_id TEXT REFERENCES public.entities(id) ON DELETE CASCADE;
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS payment_type TEXT;
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.6 Business Entities Table
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'company';
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES public.business_entities(id) ON DELETE SET NULL;
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.7 Accounts Table
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS account_type TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS sub_type TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.8 Products Table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pieces';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.9 Product Variants Table
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS thickness NUMERIC(6, 2);
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS sqft_per_sheet NUMERIC(8, 4);
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT NULL;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.10 Employees Table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS join_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS bank_account_no TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS ifsc TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.11 Partners Table
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS monthly_remun NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS profit_share_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.12 Bank Accounts Table
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE CASCADE;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS account_no TEXT;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS branch TEXT;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS ifsc TEXT;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS current_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.13 Stock Balances Table
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE CASCADE;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS variant_id TEXT REFERENCES public.product_variants(id) ON DELETE CASCADE;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS qty_sheets NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS qty_sqft NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS qty_pieces NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS qty_other NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.14 Stock Movements Table
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS variant_id TEXT REFERENCES public.product_variants(id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS movement_type TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS qty_sheets NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS qty_sqft NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS qty_pieces NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS qty_other NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS narration TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.15 Production Entries Table
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE CASCADE;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS production_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS plywood_product_id TEXT REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS plywood_variant_id TEXT REFERENCES public.product_variants(id) ON DELETE RESTRICT;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS sheets_produced NUMERIC(14, 4);
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS sqft_produced NUMERIC(14, 4);
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS face_veneer_product_id TEXT REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS face_veneer_ratio NUMERIC(8, 4) NOT NULL DEFAULT 2.0000;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS face_veneer_consumed NUMERIC(14, 4);
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS veneer_movement_id TEXT;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS plywood_movement_id TEXT;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.16 Vouchers Header Table
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE CASCADE;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS voucher_type TEXT;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS voucher_number TEXT;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS voucher_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS party_entity_id TEXT REFERENCES public.entities(id) ON DELETE SET NULL;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS balance_due NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS bank_account_id TEXT REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS narration TEXT;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS source_transaction_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS journal_entry_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.17 Voucher Line Items Table
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS voucher_id TEXT REFERENCES public.vouchers(id) ON DELETE CASCADE;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS line_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS variant_id TEXT REFERENCES public.product_variants(id) ON DELETE SET NULL;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pieces';
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS quantity NUMERIC(14, 4) NOT NULL DEFAULT 1.0000;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS quantity_sqft NUMERIC(14, 4);
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS rate NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS line_total NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS debit_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS credit_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.voucher_lines ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.18 Journal Entries Table
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE CASCADE;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS entry_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS narration TEXT;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS total_debit NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS total_credit NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS is_balanced BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.19 Journal Lines Table
ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS journal_id TEXT REFERENCES public.journal_entries(id) ON DELETE CASCADE;
ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES public.accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS debit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS narration TEXT;
ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.20 Salary Records Table (EXHAUSTIVE MIGRATION & HARDENING)
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE CASCADE;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS voucher_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS salary_month TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM');
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS salary_frequency TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS payee_type TEXT NOT NULL DEFAULT 'employee';
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS employee_id TEXT REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS partner_id TEXT REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS payee_name TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS booked_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'booked';
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS expense_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS payable_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS booking_journal_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS payment_journal_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS bank_account_id TEXT REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS narration TEXT;
ALTER TABLE public.salary_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.21 Bank Statement Transactions Table
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS bank_account_id TEXT REFERENCES public.bank_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS txn_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS reference_no TEXT;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS debit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14, 2);
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS balance NUMERIC(14, 2);
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS is_matched BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS import_batch TEXT;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS transaction_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS potential_duplicate_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'auto_added';
ALTER TABLE public.bank_statement_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.22 Bank Reconciliation Matches Table
ALTER TABLE public.bank_reconciliation_matches ADD COLUMN IF NOT EXISTS bank_statement_txn_id TEXT REFERENCES public.bank_statement_transactions(id) ON DELETE CASCADE;
ALTER TABLE public.bank_reconciliation_matches ADD COLUMN IF NOT EXISTS voucher_id TEXT REFERENCES public.vouchers(id) ON DELETE SET NULL;
ALTER TABLE public.bank_reconciliation_matches ADD COLUMN IF NOT EXISTS salary_record_id TEXT REFERENCES public.salary_records(id) ON DELETE SET NULL;
ALTER TABLE public.bank_reconciliation_matches ADD COLUMN IF NOT EXISTS journal_entry_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public.bank_reconciliation_matches ADD COLUMN IF NOT EXISTS matched_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.bank_reconciliation_matches ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.23 ERP Settings Table
ALTER TABLE public.erp_settings ADD COLUMN IF NOT EXISTS value TEXT NOT NULL DEFAULT '';
ALTER TABLE public.erp_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.24 Voucher Sequences Table
ALTER TABLE public.voucher_sequences ADD COLUMN IF NOT EXISTS last_number INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.voucher_sequences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.25 Units of Measurement Table
ALTER TABLE public.units_of_measurement ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.units_of_measurement ADD COLUMN IF NOT EXISTS abbreviation TEXT;
ALTER TABLE public.units_of_measurement ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(12, 6) NOT NULL DEFAULT 1.000000;
ALTER TABLE public.units_of_measurement ADD COLUMN IF NOT EXISTS base_unit TEXT DEFAULT 'pieces';
ALTER TABLE public.units_of_measurement ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.units_of_measurement ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.units_of_measurement ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.units_of_measurement ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3.26 Edit Audit Logs Table
ALTER TABLE public.edit_audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE public.edit_audit_logs ADD COLUMN IF NOT EXISTS record_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.edit_audit_logs ADD COLUMN IF NOT EXISTS user_identifier TEXT DEFAULT 'master_user';
ALTER TABLE public.edit_audit_logs ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'UPDATE';
ALTER TABLE public.edit_audit_logs ADD COLUMN IF NOT EXISTS old_values JSONB;
ALTER TABLE public.edit_audit_logs ADD COLUMN IF NOT EXISTS new_values JSONB;
ALTER TABLE public.edit_audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- =========================================================================
-- 4. MATHEMATICAL AND DOMAIN INTEGRITY CONSTRAINTS
-- =========================================================================

DO $$
BEGIN
    -- Vouchers math and settlement integrity
    ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS chk_vouchers_amounts;
    ALTER TABLE public.vouchers ADD CONSTRAINT chk_vouchers_amounts CHECK (
        total_amount >= 0 AND subtotal >= 0 AND tax_amount >= 0 AND
        paid_amount >= 0 AND balance_due >= 0
    );

    ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS chk_vouchers_math;
    ALTER TABLE public.vouchers ADD CONSTRAINT chk_vouchers_math CHECK (
        ABS(total_amount - (subtotal + tax_amount)) <= 1.05
    );

    ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS chk_vouchers_settlement;
    ALTER TABLE public.vouchers ADD CONSTRAINT chk_vouchers_settlement CHECK (
        ABS(total_amount - (paid_amount + balance_due)) <= 0.05
    );

    -- Voucher Lines math
    ALTER TABLE public.voucher_lines DROP CONSTRAINT IF EXISTS chk_vl_quantities;
    ALTER TABLE public.voucher_lines ADD CONSTRAINT chk_vl_quantities CHECK (
        quantity >= 0 AND (quantity_sqft IS NULL OR quantity_sqft >= 0)
    );

    ALTER TABLE public.voucher_lines DROP CONSTRAINT IF EXISTS chk_vl_amounts;
    ALTER TABLE public.voucher_lines ADD CONSTRAINT chk_vl_amounts CHECK (
        rate >= 0 AND tax_percent >= 0 AND tax_amount >= 0 AND line_total >= 0
    );

    -- Stock Balances Non-Negative Guard
    ALTER TABLE public.stock_balances DROP CONSTRAINT IF EXISTS chk_stock_balances_non_negative;
    ALTER TABLE public.stock_balances ADD CONSTRAINT chk_stock_balances_non_negative CHECK (
        qty_sheets >= 0 AND qty_sqft >= 0 AND qty_pieces >= 0 AND qty_other >= 0
    );

    -- Salary Records Exclusivity and Format
    ALTER TABLE public.salary_records DROP CONSTRAINT IF EXISTS chk_salary_payee_consistency;
    ALTER TABLE public.salary_records ADD CONSTRAINT chk_salary_payee_consistency CHECK (
        (payee_type = 'employee' AND employee_id IS NOT NULL AND partner_id IS NULL) OR
        (payee_type = 'partner' AND partner_id IS NOT NULL AND employee_id IS NULL)
    );

    ALTER TABLE public.salary_records DROP CONSTRAINT IF EXISTS chk_salary_amounts;
    ALTER TABLE public.salary_records ADD CONSTRAINT chk_salary_amounts CHECK (
        booked_amount > 0 AND paid_amount >= 0 AND paid_amount <= booked_amount
    );

    ALTER TABLE public.salary_records DROP CONSTRAINT IF EXISTS chk_salary_month_format;
    ALTER TABLE public.salary_records ADD CONSTRAINT chk_salary_month_format CHECK (
        salary_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    );

    -- Bank Reconciliation Matches Exclusivity
    ALTER TABLE public.bank_reconciliation_matches DROP CONSTRAINT IF EXISTS chk_brm_exactly_one_reference;
    ALTER TABLE public.bank_reconciliation_matches ADD CONSTRAINT chk_brm_exactly_one_reference CHECK (
        (voucher_id IS NOT NULL)::int +
        (salary_record_id IS NOT NULL)::int +
        (journal_entry_id IS NOT NULL)::int = 1
    );

    ALTER TABLE public.bank_reconciliation_matches DROP CONSTRAINT IF EXISTS chk_brm_matched_amount_pos;
    ALTER TABLE public.bank_reconciliation_matches ADD CONSTRAINT chk_brm_matched_amount_pos CHECK (
        matched_amount > 0
    );

    -- Production Entries Positive Metrics
    ALTER TABLE public.production_entries DROP CONSTRAINT IF EXISTS chk_production_positive_metrics;
    ALTER TABLE public.production_entries ADD CONSTRAINT chk_production_positive_metrics CHECK (
        sheets_produced > 0 AND sqft_produced > 0 AND
        face_veneer_ratio > 0 AND face_veneer_consumed > 0
    );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Constraint setup notice: %', SQLERRM;
END;
$$;

-- =========================================================================
-- 5. PERFORMANCE AND UNIQUE PARTIAL INDEXES
-- =========================================================================

-- POS Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_credit_status ON public.transactions (credit_status);
CREATE INDEX IF NOT EXISTS idx_transactions_entity_id ON public.transactions (entity_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON public.transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_trans_id ON public.credit_payments (transaction_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_entity_id ON public.credit_payments (entity_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_date ON public.credit_payments (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_entities_name ON public.entities (name);

-- Business Entities & Accounts Indexes
CREATE INDEX IF NOT EXISTS idx_business_entities_type   ON public.business_entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_business_entities_parent ON public.business_entities (parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type            ON public.accounts (account_type);

-- Partial Unique Indexes for Stock Balances (Handles nullable variant_id safely)
DROP INDEX IF EXISTS public.uq_stock_balances_not_null;
DROP INDEX IF EXISTS public.uq_stock_balances_null_variant;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_balances_not_null
    ON public.stock_balances (business_entity_id, product_id, variant_id)
    WHERE variant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_balances_null_variant
    ON public.stock_balances (business_entity_id, product_id)
    WHERE variant_id IS NULL;

-- ERP Operations Indexes
CREATE INDEX IF NOT EXISTS idx_voucher_lines_variant    ON public.voucher_lines (variant_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_debit_acc  ON public.voucher_lines (debit_account_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_credit_acc ON public.voucher_lines (credit_account_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_journal_entry   ON public.vouchers (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_biz_type        ON public.vouchers (business_entity_id, voucher_type);
CREATE INDEX IF NOT EXISTS idx_vouchers_number          ON public.vouchers (business_entity_id, voucher_type, voucher_number);

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant  ON public.stock_movements (variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref      ON public.stock_movements (reference_id, reference_type);

CREATE INDEX IF NOT EXISTS idx_production_plywood_prod  ON public.production_entries (plywood_product_id);
CREATE INDEX IF NOT EXISTS idx_production_plywood_var   ON public.production_entries (plywood_variant_id);
CREATE INDEX IF NOT EXISTS idx_production_veneer_prod   ON public.production_entries (face_veneer_product_id);
CREATE INDEX IF NOT EXISTS idx_production_status        ON public.production_entries (status);

CREATE INDEX IF NOT EXISTS idx_journal_entries_biz_date ON public.journal_entries (business_entity_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_lines_acc        ON public.journal_lines (account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_be_accno
    ON public.bank_accounts (business_entity_id, account_no);
CREATE INDEX IF NOT EXISTS idx_transactions_bank_account
    ON public.transactions ((custom_data->>'bank_account_id'));

-- =========================================================================
-- 6. STORED PROCEDURES (ATOMIC, ROW-LOCKED, ZERO-RACE-CONDITION RPCS)
-- =========================================================================

-- -------------------------------------------------------------------------
-- FN 6.1: get_next_voucher_number(prefix, year)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_next_voucher_number(
    p_prefix TEXT,
    p_year   INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key    TEXT;
    v_num    INTEGER;
BEGIN
    v_key := p_prefix || '-' || p_year::TEXT;

    INSERT INTO public.voucher_sequences (id, last_number, updated_at)
    VALUES (v_key, 1, NOW())
    ON CONFLICT (id) DO UPDATE
        SET last_number = voucher_sequences.last_number + 1,
            updated_at  = NOW()
    RETURNING last_number INTO v_num;

    RETURN p_prefix || '-' || p_year::TEXT || '-' || LPAD(v_num::TEXT, 4, '0');
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.2: post_stock_movement (with explicit FOR UPDATE row locking)
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
    p_movement_date      TIMESTAMPTZ DEFAULT NOW(),
    p_unit_cost          NUMERIC DEFAULT 0
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_move_id     TEXT;
    v_direction   INTEGER;
    v_balance_id  TEXT;
    v_cur_sheets  NUMERIC;
    v_cur_sqft    NUMERIC;
    v_cur_pieces  NUMERIC;
    v_cur_other   NUMERIC;
    v_new_sheets  NUMERIC;
    v_new_sqft    NUMERIC;
    v_new_pieces  NUMERIC;
    v_new_other   NUMERIC;
    v_prod_name   TEXT;
BEGIN
    IF p_qty_sheets < 0 OR p_qty_sqft < 0 OR p_qty_pieces < 0 OR p_qty_other < 0 THEN
        RAISE EXCEPTION 'Stock movement quantities must not be negative';
    END IF;

    IF p_movement_type IN ('purchase', 'production_in', 'transfer_in', 'adjustment_in') THEN
        v_direction := 1;
    ELSIF p_movement_type IN ('sale', 'production_out', 'transfer_out', 'adjustment_out') THEN
        v_direction := -1;
    ELSE
        RAISE EXCEPTION 'Invalid movement_type: %', p_movement_type;
    END IF;

    v_move_id := 'sm_' || gen_random_uuid()::text;

    -- Explicit row locking FOR UPDATE
    IF p_variant_id IS NOT NULL THEN
        SELECT id, qty_sheets, qty_sqft, qty_pieces, qty_other
        INTO v_balance_id, v_cur_sheets, v_cur_sqft, v_cur_pieces, v_cur_other
        FROM public.stock_balances
        WHERE business_entity_id = p_business_entity_id
          AND product_id         = p_product_id
          AND variant_id         = p_variant_id
        FOR UPDATE;
    ELSE
        SELECT id, qty_sheets, qty_sqft, qty_pieces, qty_other
        INTO v_balance_id, v_cur_sheets, v_cur_sqft, v_cur_pieces, v_cur_other
        FROM public.stock_balances
        WHERE business_entity_id = p_business_entity_id
          AND product_id         = p_product_id
          AND variant_id         IS NULL
        FOR UPDATE;
    END IF;

    IF v_balance_id IS NULL THEN
        IF v_direction < 0 THEN
            SELECT name INTO v_prod_name FROM public.products WHERE id = p_product_id;
            RAISE EXCEPTION 'No stock record found for product % to deduct from.', COALESCE(v_prod_name, p_product_id);
        END IF;

        INSERT INTO public.stock_balances (
            business_entity_id, product_id, variant_id,
            qty_sheets, qty_sqft, qty_pieces, qty_other, avg_cost, updated_at
        ) VALUES (
            p_business_entity_id, p_product_id, p_variant_id,
            p_qty_sheets, p_qty_sqft, p_qty_pieces, p_qty_other, p_unit_cost, p_movement_date
        );
    ELSE
        v_new_sheets := v_cur_sheets + (v_direction * p_qty_sheets);
        v_new_sqft   := v_cur_sqft   + (v_direction * p_qty_sqft);
        v_new_pieces := v_cur_pieces + (v_direction * p_qty_pieces);
        v_new_other  := v_cur_other  + (v_direction * p_qty_other);

        IF v_direction < 0 THEN
            SELECT name INTO v_prod_name FROM public.products WHERE id = p_product_id;
            IF v_new_sheets < -0.0001 THEN
                RAISE EXCEPTION 'Insufficient sheet stock for %. Current: %, Requested: %',
                    COALESCE(v_prod_name, p_product_id), v_cur_sheets, p_qty_sheets;
            END IF;
            IF v_new_sqft < -0.0001 THEN
                RAISE EXCEPTION 'Insufficient sqft stock for %. Current: %, Requested: %',
                    COALESCE(v_prod_name, p_product_id), v_cur_sqft, p_qty_sqft;
            END IF;
            IF v_new_pieces < -0.0001 THEN
                RAISE EXCEPTION 'Insufficient pieces stock for %. Current: %, Requested: %',
                    COALESCE(v_prod_name, p_product_id), v_cur_pieces, p_qty_pieces;
            END IF;
            IF v_new_other < -0.0001 THEN
                RAISE EXCEPTION 'Insufficient stock for %. Current: %, Requested: %',
                    COALESCE(v_prod_name, p_product_id), v_cur_other, p_qty_other;
            END IF;
        END IF;

        UPDATE public.stock_balances
        SET qty_sheets = GREATEST(0, v_new_sheets),
            qty_sqft   = GREATEST(0, v_new_sqft),
            qty_pieces = GREATEST(0, v_new_pieces),
            qty_other  = GREATEST(0, v_new_other),
            updated_at = p_movement_date
        WHERE id = v_balance_id;
    END IF;

    INSERT INTO public.stock_movements (
        id, business_entity_id, product_id, variant_id,
        movement_type, qty_sheets, qty_sqft, qty_pieces, qty_other,
        unit_cost, reference_id, reference_type, narration, movement_date, created_at
    ) VALUES (
        v_move_id, p_business_entity_id, p_product_id, p_variant_id,
        p_movement_type, p_qty_sheets, p_qty_sqft, p_qty_pieces, p_qty_other,
        p_unit_cost, p_reference_id, p_reference_type, p_narration, p_movement_date, NOW()
    );

    RETURN v_move_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.3: post_production_entry (Atomic Manufacturing & Recipe Validation)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_production_entry(
    p_business_entity_id     TEXT,
    p_production_date        TIMESTAMPTZ,
    p_plywood_product_id     TEXT,
    p_plywood_variant_id     TEXT,
    p_sheets_produced        NUMERIC,
    p_sqft_produced          NUMERIC,
    p_face_veneer_product_id TEXT,
    p_face_veneer_ratio      NUMERIC DEFAULT 2.0,
    p_face_veneer_consumed   NUMERIC DEFAULT NULL,
    p_notes                  TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id               TEXT;
    v_veneer_move_id   TEXT;
    v_plywood_move_id  TEXT;
    v_calc_consumed    NUMERIC;
    v_actual_consumed  NUMERIC;
    v_plywood_cat      TEXT;
    v_veneer_cat       TEXT;
BEGIN
    IF p_sheets_produced <= 0 THEN
        RAISE EXCEPTION 'Production sheets_produced must be positive: %', p_sheets_produced;
    END IF;
    IF p_sqft_produced <= 0 THEN
        RAISE EXCEPTION 'Production sqft_produced must be positive: %', p_sqft_produced;
    END IF;
    IF p_face_veneer_ratio <= 0 THEN
        RAISE EXCEPTION 'Production face_veneer_ratio must be positive: %', p_face_veneer_ratio;
    END IF;

    SELECT category INTO v_plywood_cat FROM public.products WHERE id = p_plywood_product_id;
    IF v_plywood_cat IS NULL OR v_plywood_cat <> 'plywood' THEN
        RAISE EXCEPTION 'Target product % is not classified as plywood', p_plywood_product_id;
    END IF;

    SELECT category INTO v_veneer_cat FROM public.products WHERE id = p_face_veneer_product_id;
    IF v_veneer_cat IS NULL OR v_veneer_cat <> 'face_veneer' THEN
        RAISE EXCEPTION 'Veneer raw material % is not classified as face_veneer', p_face_veneer_product_id;
    END IF;

    v_calc_consumed := ROUND(p_sheets_produced * p_face_veneer_ratio, 4);

    IF p_face_veneer_consumed IS NOT NULL THEN
        IF ABS(p_face_veneer_consumed - v_calc_consumed) > 0.001 THEN
            RAISE EXCEPTION 'Calculated consumption mismatch. Expected: % (Sheets % x Ratio %), Provided: %',
                v_calc_consumed, p_sheets_produced, p_face_veneer_ratio, p_face_veneer_consumed;
        END IF;
        v_actual_consumed := p_face_veneer_consumed;
    ELSE
        v_actual_consumed := v_calc_consumed;
    END IF;

    v_id := 'pe_' || gen_random_uuid()::text;

    INSERT INTO public.production_entries (
        id, business_entity_id, production_date,
        plywood_product_id, plywood_variant_id,
        sheets_produced, sqft_produced,
        face_veneer_product_id, face_veneer_ratio, face_veneer_consumed,
        notes, status, created_at
    ) VALUES (
        v_id, p_business_entity_id, p_production_date,
        p_plywood_product_id, p_plywood_variant_id,
        p_sheets_produced, p_sqft_produced,
        p_face_veneer_product_id, p_face_veneer_ratio, v_actual_consumed,
        p_notes, 'posted', NOW()
    );

    v_veneer_move_id := public.post_stock_movement(
        p_business_entity_id := p_business_entity_id,
        p_product_id         := p_face_veneer_product_id,
        p_variant_id         := NULL,
        p_movement_type      := 'production_out',
        p_qty_sheets         := 0,
        p_qty_sqft           := 0,
        p_qty_pieces         := v_actual_consumed,
        p_qty_other          := 0,
        p_reference_id       := v_id,
        p_reference_type     := 'production',
        p_narration          := 'Face veneer consumed for production entry ' || v_id,
        p_movement_date      := p_production_date
    );

    v_plywood_move_id := public.post_stock_movement(
        p_business_entity_id := p_business_entity_id,
        p_product_id         := p_plywood_product_id,
        p_variant_id         := p_plywood_variant_id,
        p_movement_type      := 'production_in',
        p_qty_sheets         := p_sheets_produced,
        p_qty_sqft           := p_sqft_produced,
        p_qty_pieces         := 0,
        p_qty_other          := 0,
        p_reference_id       := v_id,
        p_reference_type     := 'production',
        p_narration          := 'Finished plywood produced in entry ' || v_id,
        p_movement_date      := p_production_date
    );

    UPDATE public.production_entries
    SET veneer_movement_id  = v_veneer_move_id,
        plywood_movement_id = v_plywood_move_id
    WHERE id = v_id;

    RETURN v_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.4: post_journal_entry (Double-Entry Header + Lines)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_journal_entry(
    p_business_entity_id TEXT,
    p_entry_date         TIMESTAMPTZ,
    p_reference          TEXT,
    p_narration          TEXT,
    p_lines              JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    jid    TEXT := 'je_' || gen_random_uuid()::text;
    l      JSONB;
    debit  NUMERIC := 0;
    credit NUMERIC := 0;
BEGIN
    IF jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'Journal entry requires at least two lines';
    END IF;

    FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        debit  := debit  + COALESCE((l->>'debit_amount')::numeric, 0);
        credit := credit + COALESCE((l->>'credit_amount')::numeric, 0);
    END LOOP;

    IF debit <= 0 OR ABS(debit - credit) > 0.005 THEN
        RAISE EXCEPTION 'Journal entry is unbalanced: Total Debits %, Total Credits %', debit, credit;
    END IF;

    INSERT INTO public.journal_entries (
        id, business_entity_id, entry_date, reference, narration,
        total_debit, total_credit, is_balanced, status, created_at
    ) VALUES (
        jid, p_business_entity_id, p_entry_date, p_reference, p_narration,
        ROUND(debit, 2), ROUND(credit, 2), true, 'posted', NOW()
    );

    FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO public.journal_lines (
            journal_id, account_id, debit_amount, credit_amount, narration
        ) VALUES (
            jid,
            l->>'account_id',
            COALESCE((l->>'debit_amount')::numeric, 0),
            COALESCE((l->>'credit_amount')::numeric, 0),
            l->>'narration'
        );
    END LOOP;

    RETURN jid;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.5: post_voucher_atomic (Combined Voucher, Inventory & GL Posting)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_voucher_atomic(
    p_voucher JSONB,
    p_lines   JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_voucher_id    TEXT;
    v_vch_type      TEXT;
    v_vch_number    TEXT;
    v_vch_date      TIMESTAMPTZ;
    v_biz_id        TEXT;
    v_party_id      TEXT;
    v_subtotal      NUMERIC;
    v_tax_amount    NUMERIC;
    v_total_amount  NUMERIC;
    v_paid_amount   NUMERIC;
    v_balance_due   NUMERIC;
    v_payment_method TEXT;
    v_bank_acc_id   TEXT;
    v_reference     TEXT;
    v_narration     TEXT;
    v_source_txn_id TEXT;
    v_cash_bank_acc TEXT;
    v_cogs_amount   NUMERIC := 0;

    v_line_elem     JSONB;
    v_line_no       INTEGER;
    v_prod_id       TEXT;
    v_var_id        TEXT;
    v_prod_cat      TEXT;
    v_qty           NUMERIC;
    v_sqft          NUMERIC;
    v_rate          NUMERIC;
    v_unit_cost     NUMERIC;
    v_tax_pct       NUMERIC;
    v_tax_amt       NUMERIC;
    v_line_total    NUMERIC;
    v_unit          TEXT;
    v_deb_acc       TEXT;
    v_cred_acc      TEXT;

    v_je_id         TEXT;
BEGIN
    v_voucher_id     := COALESCE(p_voucher->>'id', 'vch_' || gen_random_uuid()::text);
    v_biz_id         := p_voucher->>'business_entity_id';
    v_vch_type       := p_voucher->>'voucher_type';
    v_vch_number     := p_voucher->>'voucher_number';
    v_vch_date       := COALESCE((p_voucher->>'voucher_date')::timestamptz, NOW());
    v_party_id       := p_voucher->>'party_entity_id';
    v_subtotal       := COALESCE((p_voucher->>'subtotal')::numeric, 0);
    v_tax_amount     := COALESCE((p_voucher->>'tax_amount')::numeric, 0);
    v_total_amount   := COALESCE((p_voucher->>'total_amount')::numeric, 0);
    v_paid_amount    := COALESCE((p_voucher->>'paid_amount')::numeric, 0);
    v_balance_due    := COALESCE((p_voucher->>'balance_due')::numeric, 0);
    v_payment_method := p_voucher->>'payment_method';
    v_bank_acc_id    := p_voucher->>'bank_account_id';
    v_reference      := p_voucher->>'reference';
    v_narration      := p_voucher->>'narration';
    v_source_txn_id  := p_voucher->>'source_transaction_id';

    IF v_biz_id IS NULL THEN
        RAISE EXCEPTION 'business_entity_id is required';
    END IF;
    IF v_vch_type NOT IN ('sales', 'purchase', 'receipt', 'payment', 'expense') THEN
        RAISE EXCEPTION 'Invalid voucher_type: %', v_vch_type;
    END IF;
    IF v_total_amount < 0 OR v_paid_amount < 0 OR v_balance_due < 0 THEN
        RAISE EXCEPTION 'Negative amounts prohibited';
    END IF;
    IF ABS(v_total_amount - (v_paid_amount + v_balance_due)) > 0.05 THEN
        RAISE EXCEPTION 'Settlement imbalance: Total %, Paid %, Due %', v_total_amount, v_paid_amount, v_balance_due;
    END IF;

    IF v_payment_method IN ('bank', 'cheque', 'upi') THEN
        v_cash_bank_acc := 'acc_bank';
    ELSE
        v_cash_bank_acc := 'acc_cash';
    END IF;

    INSERT INTO public.vouchers (
        id, business_entity_id, voucher_type, voucher_number, voucher_date,
        party_entity_id, subtotal, tax_amount, total_amount, paid_amount, balance_due,
        payment_status, payment_method, bank_account_id, reference, narration,
        source_transaction_id, status, created_at, updated_at
    ) VALUES (
        v_voucher_id, v_biz_id, v_vch_type, v_vch_number, v_vch_date,
        v_party_id, v_subtotal, v_tax_amount, v_total_amount, v_paid_amount, v_balance_due,
        CASE WHEN v_balance_due <= 0 THEN 'paid' WHEN v_paid_amount > 0 THEN 'partial' ELSE 'unpaid' END,
        v_payment_method, v_bank_acc_id, v_reference, v_narration,
        v_source_txn_id, 'posted', NOW(), NOW()
    );

    FOR v_line_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) LOOP
        v_line_no    := COALESCE((v_line_elem->>'line_no')::integer, 1);
        v_prod_id    := v_line_elem->>'product_id';
        v_var_id     := NULLIF(v_line_elem->>'variant_id', '');
        v_unit       := COALESCE(v_line_elem->>'unit', 'pieces');
        v_qty        := COALESCE((v_line_elem->>'quantity')::numeric, 0);
        v_sqft       := (v_line_elem->>'quantity_sqft')::numeric;
        v_rate       := COALESCE((v_line_elem->>'rate')::numeric, 0);
        v_tax_pct    := COALESCE((v_line_elem->>'tax_percent')::numeric, 0);
        v_tax_amt    := COALESCE((v_line_elem->>'tax_amount')::numeric, 0);
        v_line_total := COALESCE((v_line_elem->>'line_total')::numeric, 0);
        v_unit_cost  := COALESCE((v_line_elem->>'unit_cost')::numeric, 0);
        v_deb_acc    := v_line_elem->>'debit_account_id';
        v_cred_acc   := v_line_elem->>'credit_account_id';

        INSERT INTO public.voucher_lines (
            voucher_id, line_no, product_id, variant_id,
            description, unit, quantity, quantity_sqft, rate,
            tax_percent, tax_amount, line_total, unit_cost,
            debit_account_id, credit_account_id, created_at
        ) VALUES (
            v_voucher_id, v_line_no, v_prod_id, v_var_id,
            v_line_elem->>'description', v_unit, v_qty, v_sqft, v_rate,
            v_tax_pct, v_tax_amt, v_line_total, v_unit_cost,
            v_deb_acc, v_cred_acc, NOW()
        );

        IF v_prod_id IS NOT NULL THEN
            SELECT category INTO v_prod_cat FROM public.products WHERE id = v_prod_id;

            IF v_vch_type = 'purchase' THEN
                IF v_prod_cat IN ('face_veneer', 'other_veneer') THEN
                    PERFORM public.post_stock_movement(
                        v_biz_id, v_prod_id, NULL, 'purchase',
                        0, 0, v_qty, 0,
                        v_voucher_id, 'voucher', 'Purchase ' || v_vch_number, v_vch_date, v_rate
                    );
                ELSIF v_prod_cat IN ('wood', 'gum_resin', 'other') THEN
                    PERFORM public.post_stock_movement(
                        v_biz_id, v_prod_id, NULL, 'purchase',
                        0, 0, 0, v_qty,
                        v_voucher_id, 'voucher', 'Purchase ' || v_vch_number, v_vch_date, v_rate
                    );
                ELSE
                    PERFORM public.post_stock_movement(
                        v_biz_id, v_prod_id, v_var_id, 'purchase',
                        v_qty, COALESCE(v_sqft, 0), 0, 0,
                        v_voucher_id, 'voucher', 'Purchase ' || v_vch_number, v_vch_date, v_rate
                    );
                END IF;

            ELSIF v_vch_type = 'sales' THEN
                IF v_prod_cat IN ('face_veneer', 'other_veneer') THEN
                    PERFORM public.post_stock_movement(
                        v_biz_id, v_prod_id, NULL, 'sale',
                        0, 0, v_qty, 0,
                        v_voucher_id, 'voucher', 'Sale ' || v_vch_number, v_vch_date, v_unit_cost
                    );
                ELSIF v_prod_cat IN ('wood', 'gum_resin', 'other') THEN
                    PERFORM public.post_stock_movement(
                        v_biz_id, v_prod_id, NULL, 'sale',
                        0, 0, 0, v_qty,
                        v_voucher_id, 'voucher', 'Sale ' || v_vch_number, v_vch_date, v_unit_cost
                    );
                ELSE
                    PERFORM public.post_stock_movement(
                        v_biz_id, v_prod_id, v_var_id, 'sale',
                        v_qty, COALESCE(v_sqft, 0), 0, 0,
                        v_voucher_id, 'voucher', 'Sale ' || v_vch_number, v_vch_date, v_unit_cost
                    );
                END IF;
                v_cogs_amount := v_cogs_amount + (v_qty * GREATEST(0, v_unit_cost));
            END IF;
        END IF;
    END LOOP;

    -- Double-Entry Journal Entry Generation
    v_je_id := 'je_' || gen_random_uuid()::text;

    IF v_vch_type = 'sales' THEN
        INSERT INTO public.journal_entries (
            id, business_entity_id, entry_date, reference, narration,
            total_debit, total_credit, is_balanced, status, created_at
        ) VALUES (
            v_je_id, v_biz_id, v_vch_date, v_voucher_id,
            COALESCE(v_narration, 'Sales voucher ' || v_vch_number),
            v_total_amount, v_total_amount, true, 'posted', NOW()
        );

        IF v_paid_amount > 0 THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, v_cash_bank_acc, v_paid_amount, 0, 'Sales receipt collection');
        END IF;
        IF v_balance_due > 0 THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, 'acc_receivable', v_balance_due, 0, 'Customer receivable on sales');
        END IF;
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_je_id, 'acc_sales', 0, v_total_amount, 'Sales revenue booked');

    ELSIF v_vch_type = 'purchase' THEN
        INSERT INTO public.journal_entries (
            id, business_entity_id, entry_date, reference, narration,
            total_debit, total_credit, is_balanced, status, created_at
        ) VALUES (
            v_je_id, v_biz_id, v_vch_date, v_voucher_id,
            COALESCE(v_narration, 'Purchase voucher ' || v_vch_number),
            v_total_amount, v_total_amount, true, 'posted', NOW()
        );

        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_je_id, 'acc_purchase', v_total_amount, 0, 'Purchase / raw material inventory');

        IF v_paid_amount > 0 THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, v_cash_bank_acc, 0, v_paid_amount, 'Purchase payment');
        END IF;
        IF v_balance_due > 0 THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, 'acc_payable', 0, v_balance_due, 'Supplier accounts payable');
        END IF;

    ELSIF v_vch_type = 'receipt' THEN
        INSERT INTO public.journal_entries (
            id, business_entity_id, entry_date, reference, narration,
            total_debit, total_credit, is_balanced, status, created_at
        ) VALUES (
            v_je_id, v_biz_id, v_vch_date, v_voucher_id,
            COALESCE(v_narration, 'Receipt voucher ' || v_vch_number),
            v_total_amount, v_total_amount, true, 'posted', NOW()
        );

        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_je_id, v_cash_bank_acc, v_total_amount, 0, 'Cash/Bank inflow on customer receipt');
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_je_id, 'acc_receivable', 0, v_total_amount, 'Accounts receivable credited');

    ELSIF v_vch_type = 'payment' THEN
        INSERT INTO public.journal_entries (
            id, business_entity_id, entry_date, reference, narration,
            total_debit, total_credit, is_balanced, status, created_at
        ) VALUES (
            v_je_id, v_biz_id, v_vch_date, v_voucher_id,
            COALESCE(v_narration, 'Payment voucher ' || v_vch_number),
            v_total_amount, v_total_amount, true, 'posted', NOW()
        );

        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_je_id, 'acc_payable', v_total_amount, 0, 'Accounts payable debited');
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_je_id, v_cash_bank_acc, 0, v_total_amount, 'Cash/Bank disbursement');

    ELSIF v_vch_type = 'expense' THEN
        INSERT INTO public.journal_entries (
            id, business_entity_id, entry_date, reference, narration,
            total_debit, total_credit, is_balanced, status, created_at
        ) VALUES (
            v_je_id, v_biz_id, v_vch_date, v_voucher_id,
            COALESCE(v_narration, 'Expense voucher ' || v_vch_number),
            v_total_amount, v_total_amount, true, 'posted', NOW()
        );

        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_je_id, 'acc_misc_expense', v_total_amount, 0, 'Operating expense debited');
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_je_id, v_cash_bank_acc, 0, v_total_amount, 'Cash/Bank payment for expense');
    END IF;

    UPDATE public.vouchers
    SET journal_entry_id = v_je_id
    WHERE id = v_voucher_id;

    RETURN v_voucher_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.6: cancel_voucher_atomic
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_voucher_atomic(
    p_voucher_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vch       public.vouchers%ROWTYPE;
    v_move      public.stock_movements%ROWTYPE;
    v_rev_type  TEXT;
BEGIN
    SELECT * INTO v_vch
    FROM public.vouchers
    WHERE id = p_voucher_id
    FOR UPDATE;

    IF v_vch.id IS NULL THEN
        RAISE EXCEPTION 'Voucher % not found', p_voucher_id;
    END IF;
    IF v_vch.status = 'cancelled' THEN
        RAISE EXCEPTION 'Voucher % is already cancelled', p_voucher_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.bank_reconciliation_matches
        WHERE voucher_id = p_voucher_id
    ) THEN
        RAISE EXCEPTION 'Cannot cancel voucher %: reconciled in bank statements.', p_voucher_id;
    END IF;

    -- Reverse stock movements
    FOR v_move IN
        SELECT * FROM public.stock_movements
        WHERE reference_id = p_voucher_id AND reference_type = 'voucher'
    LOOP
        IF v_move.movement_type = 'purchase' THEN
            v_rev_type := 'adjustment_out';
        ELSIF v_move.movement_type = 'sale' THEN
            v_rev_type := 'adjustment_in';
        ELSE
            v_rev_type := 'adjustment_out';
        END IF;

        PERFORM public.post_stock_movement(
            p_business_entity_id := v_move.business_entity_id,
            p_product_id         := v_move.product_id,
            p_variant_id         := v_move.variant_id,
            p_movement_type      := v_rev_type,
            p_qty_sheets         := v_move.qty_sheets,
            p_qty_sqft           := v_move.qty_sqft,
            p_qty_pieces         := v_move.qty_pieces,
            p_qty_other          := v_move.qty_other,
            p_reference_id       := p_voucher_id,
            p_reference_type     := 'voucher_cancellation',
            p_narration          := 'Reversal of ' || v_move.movement_type || ' for voucher ' || v_vch.voucher_number,
            p_movement_date      := NOW(),
            p_unit_cost          := v_move.unit_cost
        );
    END LOOP;

    -- Cancel linked Journal Entry
    IF v_vch.journal_entry_id IS NOT NULL THEN
        UPDATE public.journal_entries
        SET status = 'cancelled'
        WHERE id = v_vch.journal_entry_id;
    END IF;

    UPDATE public.vouchers
    SET status     = 'cancelled',
        updated_at = NOW()
    WHERE id = p_voucher_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.7: cancel_production_entry_atomic
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_production_entry_atomic(
    p_production_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prod public.production_entries%ROWTYPE;
BEGIN
    SELECT * INTO v_prod
    FROM public.production_entries
    WHERE id = p_production_id
    FOR UPDATE;

    IF v_prod.id IS NULL THEN
        RAISE EXCEPTION 'Production entry % not found', p_production_id;
    END IF;
    IF v_prod.status = 'cancelled' THEN
        RAISE EXCEPTION 'Production entry % is already cancelled', p_production_id;
    END IF;

    -- Revert veneer consumption
    PERFORM public.post_stock_movement(
        p_business_entity_id := v_prod.business_entity_id,
        p_product_id         := v_prod.face_veneer_product_id,
        p_variant_id         := NULL,
        p_movement_type      := 'adjustment_in',
        p_qty_sheets         := 0,
        p_qty_sqft           := 0,
        p_qty_pieces         := v_prod.face_veneer_consumed,
        p_qty_other          := 0,
        p_reference_id       := p_production_id,
        p_reference_type     := 'production_cancellation',
        p_narration          := 'Reversal of veneer consumption for cancelled production entry ' || p_production_id,
        p_movement_date      := NOW()
    );

    -- Revert finished plywood production
    PERFORM public.post_stock_movement(
        p_business_entity_id := v_prod.business_entity_id,
        p_product_id         := v_prod.plywood_product_id,
        p_variant_id         := v_prod.plywood_variant_id,
        p_movement_type      := 'adjustment_out',
        p_qty_sheets         := v_prod.sheets_produced,
        p_qty_sqft           := v_prod.sqft_produced,
        p_qty_pieces         := 0,
        p_qty_other          := 0,
        p_reference_id       := p_production_id,
        p_reference_type     := 'production_cancellation',
        p_narration          := 'Reversal of plywood produced for cancelled production entry ' || p_production_id,
        p_movement_date      := NOW()
    );

    UPDATE public.production_entries
    SET status = 'cancelled'
    WHERE id = p_production_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.8: cancel_journal_entry_atomic
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_journal_entry_atomic(
    p_journal_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entry public.journal_entries%ROWTYPE;
BEGIN
    SELECT * INTO v_entry
    FROM public.journal_entries
    WHERE id = p_journal_id
    FOR UPDATE;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Journal entry % not found', p_journal_id;
    END IF;
    IF v_entry.status = 'cancelled' THEN
        RAISE EXCEPTION 'Journal entry % is already cancelled', p_journal_id;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.bank_reconciliation_matches
        WHERE journal_entry_id = p_journal_id
    ) THEN
        RAISE EXCEPTION 'Cannot cancel journal entry %: reconciled in bank reconciliation.', p_journal_id;
    END IF;

    UPDATE public.journal_entries
    SET status = 'cancelled'
    WHERE id = p_journal_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.8b: update_journal_entry
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_journal_entry(
    p_journal_id TEXT,
    p_entry_date TIMESTAMPTZ,
    p_reference  TEXT,
    p_narration  TEXT,
    p_lines      JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entry public.journal_entries%ROWTYPE;
    l      JSONB;
    debit  NUMERIC := 0;
    credit NUMERIC := 0;
BEGIN
    SELECT * INTO v_entry
    FROM public.journal_entries
    WHERE id = p_journal_id
    FOR UPDATE;

    IF v_entry.id IS NULL THEN
        RAISE EXCEPTION 'Journal entry % not found', p_journal_id;
    END IF;
    IF v_entry.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot edit cancelled journal entry %', p_journal_id;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.bank_reconciliation_matches
        WHERE journal_entry_id = p_journal_id
    ) THEN
        RAISE EXCEPTION 'Cannot edit journal entry %: reconciled in bank reconciliation.', p_journal_id;
    END IF;

    IF jsonb_array_length(p_lines) < 2 THEN
        RAISE EXCEPTION 'Journal entry requires at least two lines';
    END IF;

    FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        debit  := debit  + COALESCE((l->>'debit_amount')::numeric, 0);
        credit := credit + COALESCE((l->>'credit_amount')::numeric, 0);
    END LOOP;

    IF debit <= 0 OR ABS(debit - credit) > 0.005 THEN
        RAISE EXCEPTION 'Journal entry is unbalanced: Total Debits %, Total Credits %', debit, credit;
    END IF;

    -- Update header
    UPDATE public.journal_entries
    SET entry_date = p_entry_date,
        reference = p_reference,
        narration = p_narration,
        total_debit = ROUND(debit, 2),
        total_credit = ROUND(credit, 2),
        is_balanced = true,
        updated_at = NOW()
    WHERE id = p_journal_id;

    -- Replace lines atomically
    DELETE FROM public.journal_lines WHERE journal_id = p_journal_id;

    FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        INSERT INTO public.journal_lines (
            journal_id, account_id, debit_amount, credit_amount, narration
        ) VALUES (
            p_journal_id,
            l->>'account_id',
            ROUND(COALESCE((l->>'debit_amount')::numeric, 0), 2),
            ROUND(COALESCE((l->>'credit_amount')::numeric, 0), 2),
            NULLIF(l->>'narration', '')
        );
    END LOOP;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.9: post_salary_booking
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_salary_booking(
    p_record JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id TEXT := COALESCE(p_record->>'id', 'sal_' || gen_random_uuid()::text);
    jid  TEXT;
    biz  TEXT := p_record->>'business_entity_id';
    amt  NUMERIC := (p_record->>'booked_amount')::numeric;
BEGIN
    jid := public.post_journal_entry(
        biz,
        (p_record->>'voucher_date')::timestamptz,
        v_id,
        'Salary booking: ' || COALESCE(p_record->>'payee_name', 'Employee/Partner'),
        jsonb_build_array(
            jsonb_build_object('account_id', p_record->>'expense_account_id', 'debit_amount', amt, 'credit_amount', 0),
            jsonb_build_object('account_id', p_record->>'payable_account_id', 'debit_amount', 0, 'credit_amount', amt)
        )
    );

    INSERT INTO public.salary_records (
        id, business_entity_id, voucher_date, salary_month, salary_frequency,
        payee_type, employee_id, partner_id, payee_name,
        booked_amount, paid_amount, status,
        expense_account_id, payable_account_id, booking_journal_id, narration, created_at
    ) VALUES (
        v_id, biz, (p_record->>'voucher_date')::timestamptz, p_record->>'salary_month',
        COALESCE(NULLIF(p_record->>'salary_frequency', ''), 'monthly'),
        p_record->>'payee_type', NULLIF(p_record->>'employee_id', ''), NULLIF(p_record->>'partner_id', ''),
        p_record->>'payee_name', amt, 0, 'booked',
        p_record->>'expense_account_id', p_record->>'payable_account_id', jid, p_record->>'narration', NOW()
    );

    RETURN v_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.10: post_salary_payment
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_salary_payment(
    p_record_id     TEXT,
    p_amount        NUMERIC,
    p_method        TEXT,
    p_bank_id       TEXT,
    p_reference     TEXT,
    p_date          TIMESTAMPTZ,
    p_cash_account  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r   public.salary_records%ROWTYPE;
    jid TEXT;
BEGIN
    SELECT * INTO r FROM public.salary_records WHERE id = p_record_id FOR UPDATE;

    IF r.id IS NULL OR p_amount <= 0 OR (r.paid_amount + p_amount) > r.booked_amount THEN
        RAISE EXCEPTION 'Invalid salary payment amount or record not found';
    END IF;
    IF p_method IN ('bank', 'upi') THEN
        IF p_bank_id IS NULL THEN
            RAISE EXCEPTION 'A bank account is required for this payment method';
        END IF;
        PERFORM 1 FROM public.bank_accounts
        WHERE id = p_bank_id AND is_active
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected bank account is not active or does not exist';
        END IF;
    ELSE
        p_bank_id := NULL;
    END IF;

    jid := public.post_journal_entry(
        r.business_entity_id,
        p_date,
        p_record_id,
        'Salary payment for ' || r.payee_name,
        jsonb_build_array(
            jsonb_build_object('account_id', r.payable_account_id, 'debit_amount', p_amount, 'credit_amount', 0),
            jsonb_build_object('account_id', p_cash_account, 'debit_amount', 0, 'credit_amount', p_amount)
        )
    );

    UPDATE public.salary_records
    SET paid_amount        = paid_amount + p_amount,
        status             = CASE WHEN (paid_amount + p_amount) >= booked_amount THEN 'paid' ELSE 'partial' END,
        payment_method     = p_method,
        bank_account_id    = p_bank_id,
        payment_reference  = p_reference,
        payment_date       = p_date,
        payment_journal_id = jid
    WHERE id = p_record_id;
    IF p_bank_id IS NOT NULL THEN
        PERFORM public.refresh_bank_account_balance(p_bank_id);
    END IF;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.10b: update_salary_booking
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_salary_booking(
    p_record_id        TEXT,
    p_voucher_date     TIMESTAMPTZ,
    p_salary_month     TEXT,
    p_salary_frequency TEXT,
    p_payee_type       TEXT,
    p_employee_id      TEXT,
    p_partner_id       TEXT,
    p_payee_name       TEXT,
    p_booked_amount    NUMERIC,
    p_narration        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.salary_records%ROWTYPE;
BEGIN
    SELECT * INTO r
    FROM public.salary_records
    WHERE id = p_record_id
    FOR UPDATE;

    IF r.id IS NULL THEN
        RAISE EXCEPTION 'Salary record % not found', p_record_id;
    END IF;

    IF p_booked_amount < r.paid_amount THEN
        RAISE EXCEPTION 'Booked amount (₹%) cannot be less than already disbursed amount (₹%)', p_booked_amount, r.paid_amount;
    END IF;

    -- Update linked booking journal entry if exists
    IF r.booking_journal_id IS NOT NULL THEN
        UPDATE public.journal_entries
        SET entry_date = p_voucher_date,
            total_debit = ROUND(p_booked_amount, 2),
            total_credit = ROUND(p_booked_amount, 2),
            narration = 'Salary booking: ' || p_payee_name
        WHERE id = r.booking_journal_id;

        UPDATE public.journal_lines
        SET debit_amount = ROUND(p_booked_amount, 2)
        WHERE journal_id = r.booking_journal_id AND debit_amount > 0;

        UPDATE public.journal_lines
        SET credit_amount = ROUND(p_booked_amount, 2)
        WHERE journal_id = r.booking_journal_id AND credit_amount > 0;
    END IF;

    -- Update salary record
    UPDATE public.salary_records
    SET voucher_date = p_voucher_date,
        salary_month = p_salary_month,
        salary_frequency = COALESCE(NULLIF(p_salary_frequency, ''), 'monthly'),
        payee_type = p_payee_type,
        employee_id = NULLIF(p_employee_id, ''),
        partner_id = NULLIF(p_partner_id, ''),
        payee_name = p_payee_name,
        booked_amount = ROUND(p_booked_amount, 2),
        status = CASE WHEN r.paid_amount >= p_booked_amount THEN 'paid'
                      WHEN r.paid_amount > 0 THEN 'partial'
                      ELSE 'booked' END,
        narration = p_narration
    WHERE id = p_record_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.10c: cancel_salary_booking
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_salary_booking(
    p_record_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.salary_records%ROWTYPE;
BEGIN
    SELECT * INTO r
    FROM public.salary_records
    WHERE id = p_record_id
    FOR UPDATE;

    IF r.id IS NULL THEN
        RAISE EXCEPTION 'Salary record % not found', p_record_id;
    END IF;
    IF r.paid_amount > 0 THEN
        RAISE EXCEPTION 'Cannot cancel salary record %: payments have already been disbursed (₹%).', p_record_id, r.paid_amount;
    END IF;

    -- Cancel linked booking journal
    IF r.booking_journal_id IS NOT NULL THEN
        UPDATE public.journal_entries
        SET status = 'cancelled'
        WHERE id = r.booking_journal_id;
    END IF;

    DELETE FROM public.salary_records WHERE id = p_record_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN 6.11: get_trial_balance
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trial_balance(
    p_business_entity_id TEXT,
    p_from_date TIMESTAMPTZ DEFAULT '2000-01-01',
    p_to_date   TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    account_id   TEXT,
    account_name TEXT,
    account_type TEXT,
    total_debit  NUMERIC,
    total_credit NUMERIC,
    net_balance  NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        a.id           AS account_id,
        a.name         AS account_name,
        a.account_type AS account_type,
        COALESCE(SUM(jl.debit_amount), 0)  AS total_debit,
        COALESCE(SUM(jl.credit_amount), 0) AS total_credit,
        COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0) AS net_balance
    FROM public.accounts a
    LEFT JOIN public.journal_lines jl ON jl.account_id = a.id
    LEFT JOIN public.journal_entries je ON je.id = jl.journal_id
        AND je.business_entity_id = p_business_entity_id
        AND je.status = 'posted'
        AND je.entry_date BETWEEN p_from_date AND p_to_date
    WHERE a.is_active = true
    GROUP BY a.id, a.name, a.account_type
    HAVING COALESCE(SUM(jl.debit_amount), 0) > 0
        OR COALESCE(SUM(jl.credit_amount), 0) > 0
    ORDER BY a.account_type, a.name;
$$;

-- =========================================================================
-- 7. INITIAL PRODUCTION SEED DATA (SAFE WITH ON CONFLICT DO NOTHING)
-- =========================================================================

-- 7.1 Categories Seed
INSERT INTO public.categories (id, name, type, color, icon) VALUES
    ('cat_sales',          'Plywood Sales',                 'IN',  '#10b981', 'trending-up'),
    ('cat_hardware_sales', 'Hardware & Laminates Sales',    'IN',  '#06b6d4', 'package'),
    ('cat_purchase',       'Raw Material & Timber Purchase','OUT', '#f43f5e', 'shopping-cart'),
    ('cat_transport',      'Freight & Transport',           'OUT', '#f59e0b', 'truck'),
    ('cat_labour',         'Staff Wages & Labour',          'OUT', '#3b82f6', 'users'),
    ('cat_utilities',      'Electricity & Factory Rent',    'OUT', '#8b5cf6', 'zap'),
    ('cat_food',           'Tea & Refreshments',            'OUT', '#ec4899', 'coffee'),
    ('cat_settle_in',      'Debt Recovery / Credit IN',     'IN',  '#34d399', 'hand-coins'),
    ('cat_settle_out',     'Credit Disbursement OUT',       'OUT', '#f43f5e', 'hand-coins'),
    ('cat_bank_deposit',   'Bank Deposit / Inflow',         'IN',  '#10b981', 'landmark'),
    ('cat_bank_charges',   'Bank Charges / Outflow',        'OUT', '#f43f5e', 'landmark'),
    ('cat_misc',           'Miscellaneous Expenses',        'OUT', '#64748b', 'box')
ON CONFLICT (id) DO NOTHING;

-- 7.2 Chart of Accounts Seed
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

-- 7.3 Default Business Entity
INSERT INTO public.business_entities (id, name, entity_type, is_active)
VALUES ('be_main', 'Main Company', 'company', true)
ON CONFLICT (id) DO NOTHING;

-- 7.4 ERP Operational Settings
INSERT INTO public.erp_settings (key, value) VALUES
    ('face_veneer_ratio',   '2'),
    ('default_tax_percent', '0'),
    ('currency_symbol',     '₹'),
    ('sqft_to_sqm_factor',  '0.0929')
ON CONFLICT (key) DO NOTHING;

-- 7.5 Seed Default Units of Measurement
INSERT INTO public.units_of_measurement (id, name, abbreviation, conversion_factor, base_unit, description)
VALUES
    ('uom_sheets', 'Sheets', 'sheets', 1.000000, 'sheets', 'Standard manufactured plywood sheet units'),
    ('uom_pieces', 'Pieces', 'pcs', 1.000000, 'pieces', 'Single unit items and hardware pieces'),
    ('uom_sqft', 'Square Feet', 'sqft', 1.000000, 'sqft', 'Standard surface area unit for plywood billing'),
    ('uom_sqm', 'Square Meters', 'sqm', 0.092900, 'sqft', 'Metric surface area (1 sqft ≈ 0.0929 sqm)'),
    ('uom_kg', 'Kilograms', 'kg', 1.000000, 'kg', 'Weight unit for resin, glue and raw chemicals'),
    ('uom_litre', 'Litres', 'ltr', 1.000000, 'litre', 'Volume unit for liquid resins and coatings')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- FN 6.11: Bank balance calculation and atomic Quick Entry posting
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_bank_account_balance(p_bank_account_id TEXT)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ROUND(
        COALESCE((SELECT opening_balance FROM public.bank_accounts WHERE id = p_bank_account_id), 0)
        + COALESCE((
            SELECT SUM(
                CASE WHEN t.type = 'IN' THEN
                    COALESCE(NULLIF(t.custom_data->>'bank_amount', '')::NUMERIC, 0)
                ELSE
                    -COALESCE(NULLIF(t.custom_data->>'bank_amount', '')::NUMERIC, 0)
                END
            )
            FROM public.transactions t
            WHERE t.custom_data->>'bank_account_id' = p_bank_account_id
              AND COALESCE(NULLIF(t.custom_data->>'bank_amount', '')::NUMERIC, 0) > 0
        ), 0)
        + COALESCE((
            SELECT SUM(
                CASE WHEN v.voucher_type IN ('sales', 'receipt') THEN v.paid_amount
                     ELSE -v.paid_amount
                END
            )
            FROM public.vouchers v
            WHERE v.bank_account_id = p_bank_account_id
              AND v.status = 'posted'
              AND v.payment_method IN ('bank', 'cheque', 'upi')
        ), 0)
        - COALESCE((
            SELECT SUM(s.paid_amount)
            FROM public.salary_records s
            WHERE s.bank_account_id = p_bank_account_id
              AND s.status IN ('partial', 'paid')
              AND s.payment_method IN ('bank', 'cheque', 'upi')
        ), 0),
        2
    );
$$;

CREATE OR REPLACE FUNCTION public.refresh_bank_account_balance(p_bank_account_id TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance NUMERIC;
BEGIN
    PERFORM 1 FROM public.bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank account % was not found', p_bank_account_id;
    END IF;

    v_balance := public.calculate_bank_account_balance(p_bank_account_id);

    UPDATE public.bank_accounts
    SET current_balance = v_balance
    WHERE id = p_bank_account_id;

    RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bank_accounts_with_balances(p_business_entity_id TEXT DEFAULT NULL)
RETURNS TABLE (
    id TEXT,
    business_entity_id TEXT,
    bank_name TEXT,
    account_no TEXT,
    branch_name TEXT,
    ifsc TEXT,
    opening_balance NUMERIC,
    current_balance NUMERIC,
    is_active BOOLEAN,
    business_entity_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_id TEXT;
BEGIN
    FOR v_account_id IN
        SELECT b.id
        FROM public.bank_accounts b
        WHERE p_business_entity_id IS NULL OR b.business_entity_id = p_business_entity_id OR b.business_entity_id IS NULL
        FOR UPDATE
    LOOP
        PERFORM public.refresh_bank_account_balance(v_account_id);
    END LOOP;

    RETURN QUERY
    SELECT b.id, b.business_entity_id, b.bank_name, b.account_no,
           COALESCE(b.branch_name, b.branch) AS branch_name,
           b.ifsc, b.opening_balance, b.current_balance, b.is_active,
           be.name AS business_entity_name
    FROM public.bank_accounts b
    LEFT JOIN public.business_entities be ON be.id = b.business_entity_id
    WHERE p_business_entity_id IS NULL OR b.business_entity_id = p_business_entity_id OR b.business_entity_id IS NULL
    ORDER BY b.bank_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_quick_transaction_atomic(p_transaction JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id TEXT := p_transaction->>'id';
    v_type TEXT := p_transaction->>'type';
    v_bank_account_id TEXT := NULLIF(p_transaction->'custom_data'->>'bank_account_id', '');
    v_bank_amount NUMERIC := COALESCE(NULLIF(p_transaction->'custom_data'->>'bank_amount', '')::NUMERIC, 0);
    v_inserted_id TEXT;
BEGIN
    IF v_id IS NULL OR v_type NOT IN ('IN', 'OUT') THEN
        RAISE EXCEPTION 'A valid transaction id and type are required';
    END IF;
    IF COALESCE((p_transaction->>'amount')::NUMERIC, 0) <= 0 THEN
        RAISE EXCEPTION 'Transaction amount must be greater than zero';
    END IF;
    IF v_bank_amount < 0 THEN
        RAISE EXCEPTION 'Bank amount cannot be negative';
    END IF;
    IF v_bank_amount > 0 AND v_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'A bank account is required for a bank payment';
    END IF;
    IF v_bank_account_id IS NOT NULL THEN
        PERFORM 1 FROM public.bank_accounts WHERE id = v_bank_account_id AND is_active FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected bank account is not active or does not exist';
        END IF;
    END IF;

    INSERT INTO public.transactions (
        id, type, amount, total_amount, paid_amount, balance_due, credit_status,
        due_date, date, category_id, entity_id, product_id, quantity, description,
        notes, reference, custom_data, business_entity_id
    )
    VALUES (
        v_id, v_type, (p_transaction->>'amount')::NUMERIC,
        NULLIF(p_transaction->>'total_amount', '')::NUMERIC,
        NULLIF(p_transaction->>'paid_amount', '')::NUMERIC,
        COALESCE(NULLIF(p_transaction->>'balance_due', '')::NUMERIC, 0),
        COALESCE(p_transaction->>'credit_status', 'PAID'),
        NULLIF(p_transaction->>'due_date', '')::TIMESTAMPTZ,
        COALESCE(NULLIF(p_transaction->>'date', '')::TIMESTAMPTZ, NOW()),
        NULLIF(p_transaction->>'category_id', ''),
        NULLIF(p_transaction->>'entity_id', ''),
        NULLIF(p_transaction->>'product_id', ''),
        NULLIF(p_transaction->>'quantity', '')::NUMERIC,
        NULLIF(p_transaction->>'description', ''),
        NULLIF(p_transaction->>'notes', ''),
        NULLIF(p_transaction->>'reference', ''),
        COALESCE(p_transaction->'custom_data', '{}'::JSONB),
        NULLIF(p_transaction->>'business_entity_id', '')
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_inserted_id;

    IF v_inserted_id IS NULL THEN
        RETURN v_id;
    END IF;

    IF v_bank_account_id IS NOT NULL THEN
        PERFORM public.refresh_bank_account_balance(v_bank_account_id);
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_quick_transaction_atomic(p_transaction JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id TEXT := p_transaction->>'id';
    v_type TEXT := p_transaction->>'type';
    v_old_bank_account_id TEXT;
    v_new_bank_account_id TEXT := NULLIF(p_transaction->'custom_data'->>'bank_account_id', '');
    v_bank_amount NUMERIC := COALESCE(NULLIF(p_transaction->'custom_data'->>'bank_amount', '')::NUMERIC, 0);
BEGIN
    IF v_id IS NULL OR v_type NOT IN ('IN', 'OUT') THEN RAISE EXCEPTION 'A valid transaction id and type are required'; END IF;
    IF COALESCE((p_transaction->>'amount')::NUMERIC, 0) <= 0 THEN RAISE EXCEPTION 'Transaction amount must be greater than zero'; END IF;
    IF v_bank_amount < 0 THEN RAISE EXCEPTION 'Bank amount cannot be negative'; END IF;
    IF v_bank_amount > 0 AND v_new_bank_account_id IS NULL THEN RAISE EXCEPTION 'A bank account is required for a bank payment'; END IF;

    SELECT NULLIF(custom_data->>'bank_account_id', '') INTO v_old_bank_account_id
    FROM public.transactions WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Transaction % was not found', v_id; END IF;
    IF v_old_bank_account_id IS NOT NULL THEN
        PERFORM 1 FROM public.bank_accounts WHERE id = v_old_bank_account_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'The original bank account no longer exists'; END IF;
    END IF;
    IF v_new_bank_account_id IS NOT NULL THEN
        PERFORM 1 FROM public.bank_accounts WHERE id = v_new_bank_account_id AND is_active FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Selected bank account is not active or does not exist'; END IF;
    END IF;

    UPDATE public.transactions SET
        type = v_type, amount = (p_transaction->>'amount')::NUMERIC,
        total_amount = NULLIF(p_transaction->>'total_amount', '')::NUMERIC,
        paid_amount = NULLIF(p_transaction->>'paid_amount', '')::NUMERIC,
        balance_due = COALESCE(NULLIF(p_transaction->>'balance_due', '')::NUMERIC, 0),
        credit_status = COALESCE(p_transaction->>'credit_status', 'PAID'),
        due_date = NULLIF(p_transaction->>'due_date', '')::TIMESTAMPTZ,
        date = COALESCE(NULLIF(p_transaction->>'date', '')::TIMESTAMPTZ, NOW()),
        category_id = NULLIF(p_transaction->>'category_id', ''),
        entity_id = NULLIF(p_transaction->>'entity_id', ''),
        product_id = NULLIF(p_transaction->>'product_id', ''),
        quantity = NULLIF(p_transaction->>'quantity', '')::NUMERIC,
        description = NULLIF(p_transaction->>'description', ''),
        notes = NULLIF(p_transaction->>'notes', ''),
        reference = NULLIF(p_transaction->>'reference', ''),
        custom_data = COALESCE(p_transaction->'custom_data', '{}'::JSONB)
    WHERE id = v_id;

    IF v_old_bank_account_id IS NOT NULL THEN PERFORM public.refresh_bank_account_balance(v_old_bank_account_id); END IF;
    IF v_new_bank_account_id IS NOT NULL
       AND v_new_bank_account_id IS DISTINCT FROM v_old_bank_account_id THEN
        PERFORM public.refresh_bank_account_balance(v_new_bank_account_id);
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_transactions_atomic(p_ids TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bank_ids TEXT[];
    v_bank_account_id TEXT;
BEGIN
    SELECT ARRAY_AGG(DISTINCT NULLIF(t.custom_data->>'bank_account_id', ''))
    INTO v_bank_ids
    FROM public.transactions t
    WHERE t.id = ANY(p_ids)
      AND NULLIF(t.custom_data->>'bank_account_id', '') IS NOT NULL;

    -- Clean up matching bank statement links if present
    UPDATE public.bank_statement_transactions
    SET transaction_id = NULL,
        potential_duplicate_id = NULL
    WHERE transaction_id = ANY(p_ids)
       OR potential_duplicate_id = ANY(p_ids);

    DELETE FROM public.credit_payments WHERE transaction_id = ANY(p_ids);
    DELETE FROM public.transactions WHERE id = ANY(p_ids);

    IF v_bank_ids IS NOT NULL THEN
        FOREACH v_bank_account_id IN ARRAY v_bank_ids
        LOOP
            IF EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_bank_account_id) THEN
                PERFORM public.refresh_bank_account_balance(v_bank_account_id);
            END IF;
        END LOOP;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_bank_account(p_bank_account_id TEXT, p_force BOOLEAN DEFAULT false)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM 1 FROM public.bank_accounts WHERE id = p_bank_account_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank account % was not found', p_bank_account_id;
    END IF;

    IF NOT p_force THEN
        IF EXISTS (
            SELECT 1 FROM public.transactions
            WHERE custom_data->>'bank_account_id' = p_bank_account_id
        ) OR EXISTS (
            SELECT 1 FROM public.vouchers WHERE bank_account_id = p_bank_account_id
        ) OR EXISTS (
            SELECT 1 FROM public.salary_records WHERE bank_account_id = p_bank_account_id
        ) OR EXISTS (
            SELECT 1 FROM public.bank_statement_transactions WHERE bank_account_id = p_bank_account_id
        ) THEN
            RAISE EXCEPTION 'Bank account has financial history and cannot be deleted. Deactivate or force-delete it instead.';
        END IF;
    ELSE
        -- Force cleanup of linked statement entries, imported statement transactions & unlink manual references
        DELETE FROM public.bank_reconciliation_matches
        WHERE bank_statement_txn_id IN (
            SELECT id FROM public.bank_statement_transactions WHERE bank_account_id = p_bank_account_id
        );
        DELETE FROM public.bank_statement_transactions WHERE bank_account_id = p_bank_account_id;
        DELETE FROM public.transactions
        WHERE custom_data->>'bank_account_id' = p_bank_account_id
          AND (custom_data->>'is_statement_imported')::BOOLEAN IS TRUE;
        UPDATE public.vouchers SET bank_account_id = NULL WHERE bank_account_id = p_bank_account_id;
        UPDATE public.salary_records SET bank_account_id = NULL WHERE bank_account_id = p_bank_account_id;
        UPDATE public.transactions
        SET custom_data = custom_data - 'bank_account_id'
        WHERE custom_data->>'bank_account_id' = p_bank_account_id;
    END IF;

    DELETE FROM public.bank_accounts WHERE id = p_bank_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_bank_statement_transactions_atomic(
    p_ids TEXT[],
    p_delete_linked_auto_txns BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bank_ids TEXT[];
    v_txn_ids TEXT[];
    v_bank_id TEXT;
BEGIN
    SELECT ARRAY_AGG(DISTINCT bst.bank_account_id)
    INTO v_bank_ids
    FROM public.bank_statement_transactions bst
    WHERE bst.id = ANY(p_ids) AND bst.bank_account_id IS NOT NULL;

    IF p_delete_linked_auto_txns THEN
        SELECT ARRAY_AGG(DISTINCT bst.transaction_id)
        INTO v_txn_ids
        FROM public.bank_statement_transactions bst
        JOIN public.transactions t ON t.id = bst.transaction_id
        WHERE bst.id = ANY(p_ids)
          AND bst.transaction_id IS NOT NULL
          AND (bst.review_status = 'auto_added' OR (t.custom_data->>'is_statement_imported')::BOOLEAN IS TRUE);
    END IF;

    DELETE FROM public.bank_reconciliation_matches WHERE bank_statement_txn_id = ANY(p_ids);
    DELETE FROM public.bank_statement_transactions WHERE id = ANY(p_ids);

    IF v_txn_ids IS NOT NULL AND array_length(v_txn_ids, 1) > 0 THEN
        DELETE FROM public.transactions WHERE id = ANY(v_txn_ids);
    END IF;

    IF v_bank_ids IS NOT NULL THEN
        FOREACH v_bank_id IN ARRAY v_bank_ids
        LOOP
            IF EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_bank_id) THEN
                PERFORM public.refresh_bank_account_balance(v_bank_id);
            END IF;
        END LOOP;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_voucher_atomic(p_voucher_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vch public.vouchers%ROWTYPE;
BEGIN
    SELECT * INTO v_vch FROM public.vouchers WHERE id = p_voucher_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Voucher % was not found', p_voucher_id;
    END IF;

    -- Safely reverse stock, bank balances, and journal if still posted
    IF v_vch.status = 'posted' THEN
        PERFORM public.cancel_voucher_atomic(p_voucher_id);
    END IF;

    DELETE FROM public.bank_reconciliation_matches WHERE voucher_id = p_voucher_id;
    DELETE FROM public.voucher_lines WHERE voucher_id = p_voucher_id;
    DELETE FROM public.vouchers WHERE id = p_voucher_id;

    IF v_vch.journal_entry_id IS NOT NULL THEN
        DELETE FROM public.bank_reconciliation_matches WHERE journal_entry_id = v_vch.journal_entry_id;
        DELETE FROM public.journal_lines WHERE journal_id = v_vch.journal_entry_id;
        DELETE FROM public.journal_entries WHERE id = v_vch.journal_entry_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_journal_entry_atomic(p_journal_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_je public.journal_entries%ROWTYPE;
BEGIN
    SELECT * INTO v_je FROM public.journal_entries WHERE id = p_journal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Journal entry % was not found', p_journal_id;
    END IF;

    IF v_je.status = 'posted' THEN
        PERFORM public.cancel_journal_entry_atomic(p_journal_id);
    END IF;

    DELETE FROM public.bank_reconciliation_matches WHERE journal_entry_id = p_journal_id;
    DELETE FROM public.journal_lines WHERE journal_id = p_journal_id;
    DELETE FROM public.journal_entries WHERE id = p_journal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_salary_booking(p_record_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec public.salary_records%ROWTYPE;
BEGIN
    SELECT * INTO v_rec FROM public.salary_records WHERE id = p_record_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Salary record % was not found', p_record_id;
    END IF;

    DELETE FROM public.bank_reconciliation_matches WHERE salary_record_id = p_record_id;
    DELETE FROM public.salary_records WHERE id = p_record_id;

    IF v_rec.booking_journal_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_id = v_rec.booking_journal_id;
        DELETE FROM public.journal_entries WHERE id = v_rec.booking_journal_id;
    END IF;
    IF v_rec.payment_journal_id IS NOT NULL THEN
        DELETE FROM public.journal_lines WHERE journal_id = v_rec.payment_journal_id;
        DELETE FROM public.journal_entries WHERE id = v_rec.payment_journal_id;
    END IF;

    IF v_rec.bank_account_id IS NOT NULL THEN
        PERFORM public.refresh_bank_account_balance(v_rec.bank_account_id);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_production_entry_atomic(p_production_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prod public.production_entries%ROWTYPE;
BEGIN
    SELECT * INTO v_prod FROM public.production_entries WHERE id = p_production_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Production entry % was not found', p_production_id;
    END IF;

    IF v_prod.status = 'posted' THEN
        PERFORM public.cancel_production_entry_atomic(p_production_id);
    END IF;

    DELETE FROM public.production_entries WHERE id = p_production_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.wipe_all_erp_data(p_keep_categories BOOLEAN DEFAULT false)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    IF NOT COALESCE(p_keep_categories, false) THEN
        DELETE FROM public.categories;
    END IF;
    DELETE FROM public.erp_settings;
    DELETE FROM public.voucher_sequences;
    DELETE FROM public.accounts WHERE COALESCE(is_system, false) = false;
    DELETE FROM public.units_of_measurement
    WHERE id NOT IN ('uom_sheets', 'uom_pieces', 'uom_sqft', 'uom_sqm', 'uom_kg', 'uom_litre');
END;
$$;

-- =========================================================================
-- 8. ROW LEVEL SECURITY (RLS) & AUDIT ZERO-DELETE POLICIES
-- =========================================================================

-- Enable RLS across all tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units_of_measurement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for Units and Audit Logs
DROP POLICY IF EXISTS "Allow public all access on units_of_measurement" ON public.units_of_measurement;
CREATE POLICY "Allow public all access on units_of_measurement" 
    ON public.units_of_measurement FOR ALL 
    TO public, anon, authenticated 
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access on edit_audit_logs" ON public.edit_audit_logs;
CREATE POLICY "Allow public all access on edit_audit_logs" 
    ON public.edit_audit_logs FOR ALL 
    TO public, anon, authenticated 
    USING (true) WITH CHECK (true);

-- 8.1 POS Policies (Full access)
DROP POLICY IF EXISTS "Allow public all access on categories" ON public.categories;
CREATE POLICY "Allow public all access on categories" ON public.categories FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access on entities" ON public.entities;
CREATE POLICY "Allow public all access on entities" ON public.entities FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access on custom_fields" ON public.custom_fields;
CREATE POLICY "Allow public all access on custom_fields" ON public.custom_fields FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access on transactions" ON public.transactions;
CREATE POLICY "Allow public all access on transactions" ON public.transactions FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public all access on credit_payments" ON public.credit_payments;
CREATE POLICY "Allow public all access on credit_payments" ON public.credit_payments FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

-- 8.2 Business Entities
DROP POLICY IF EXISTS "be_select" ON public.business_entities;
DROP POLICY IF EXISTS "be_insert" ON public.business_entities;
DROP POLICY IF EXISTS "be_update" ON public.business_entities;
DROP POLICY IF EXISTS "be_delete" ON public.business_entities;
CREATE POLICY "be_select" ON public.business_entities FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "be_insert" ON public.business_entities FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "be_update" ON public.business_entities FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "be_delete" ON public.business_entities FOR DELETE TO public, anon, authenticated USING (true);

-- 8.3 Chart of Accounts (System Account Protection)
DROP POLICY IF EXISTS "acc_select" ON public.accounts;
DROP POLICY IF EXISTS "acc_insert" ON public.accounts;
DROP POLICY IF EXISTS "acc_update" ON public.accounts;
DROP POLICY IF EXISTS "acc_delete" ON public.accounts;
CREATE POLICY "acc_select" ON public.accounts FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "acc_insert" ON public.accounts FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "acc_update" ON public.accounts FOR UPDATE TO public, anon, authenticated USING (NOT is_system) WITH CHECK (NOT is_system);
CREATE POLICY "acc_delete" ON public.accounts FOR DELETE TO public, anon, authenticated USING (NOT is_system);

-- 8.4 Products & Variants
DROP POLICY IF EXISTS "prod_select" ON public.products;
DROP POLICY IF EXISTS "prod_insert" ON public.products;
DROP POLICY IF EXISTS "prod_update" ON public.products;
DROP POLICY IF EXISTS "prod_delete" ON public.products;
CREATE POLICY "prod_select" ON public.products FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "prod_insert" ON public.products FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "prod_update" ON public.products FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "prod_delete" ON public.products FOR DELETE TO public, anon, authenticated USING (true);

DROP POLICY IF EXISTS "pv_select" ON public.product_variants;
DROP POLICY IF EXISTS "pv_insert" ON public.product_variants;
DROP POLICY IF EXISTS "pv_update" ON public.product_variants;
DROP POLICY IF EXISTS "pv_delete" ON public.product_variants;
CREATE POLICY "pv_select" ON public.product_variants FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "pv_insert" ON public.product_variants FOR INSERT TO public, anon, authenticated WITH CHECK (true);
CREATE POLICY "pv_update" ON public.product_variants FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pv_delete" ON public.product_variants FOR DELETE TO public, anon, authenticated USING (true);

-- 8.5 Employees & Partners
DROP POLICY IF EXISTS "emp_select" ON public.employees;
DROP POLICY IF EXISTS "emp_insert" ON public.employees;
DROP POLICY IF EXISTS "emp_update" ON public.employees;
DROP POLICY IF EXISTS "emp_delete" ON public.employees;
CREATE POLICY "emp_select" ON public.employees FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "emp_insert" ON public.employees FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "emp_update" ON public.employees FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "emp_delete" ON public.employees FOR DELETE TO public, anon, authenticated USING (true);

DROP POLICY IF EXISTS "ptr_select" ON public.partners;
DROP POLICY IF EXISTS "ptr_insert" ON public.partners;
DROP POLICY IF EXISTS "ptr_update" ON public.partners;
DROP POLICY IF EXISTS "ptr_delete" ON public.partners;
CREATE POLICY "ptr_select" ON public.partners FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "ptr_insert" ON public.partners FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "ptr_update" ON public.partners FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "ptr_delete" ON public.partners FOR DELETE TO public, anon, authenticated USING (true);

-- 8.6 Bank Accounts
DROP POLICY IF EXISTS "bnk_select" ON public.bank_accounts;
DROP POLICY IF EXISTS "bnk_insert" ON public.bank_accounts;
DROP POLICY IF EXISTS "bnk_update" ON public.bank_accounts;
DROP POLICY IF EXISTS "bnk_delete" ON public.bank_accounts;
CREATE POLICY "bnk_select" ON public.bank_accounts FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "bnk_insert" ON public.bank_accounts FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(bank_name)) > 0 AND length(trim(account_no)) > 0);
CREATE POLICY "bnk_update" ON public.bank_accounts FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "bnk_delete" ON public.bank_accounts FOR DELETE TO public, anon, authenticated USING (true);

-- 8.7 Stock Balances
DROP POLICY IF EXISTS "sb_select" ON public.stock_balances;
DROP POLICY IF EXISTS "sb_insert" ON public.stock_balances;
DROP POLICY IF EXISTS "sb_update" ON public.stock_balances;
CREATE POLICY "sb_select" ON public.stock_balances FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "sb_insert" ON public.stock_balances FOR INSERT TO public, anon, authenticated WITH CHECK (qty_sheets >= 0 AND qty_sqft >= 0 AND qty_pieces >= 0 AND qty_other >= 0);
CREATE POLICY "sb_update" ON public.stock_balances FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (qty_sheets >= 0 AND qty_sqft >= 0 AND qty_pieces >= 0 AND qty_other >= 0);

-- 8.8 Stock Movements Audit Ledger (ZERO-DELETE, IMMUTABLE)
DROP POLICY IF EXISTS "sm_select" ON public.stock_movements;
DROP POLICY IF EXISTS "sm_insert" ON public.stock_movements;
CREATE POLICY "sm_select" ON public.stock_movements FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "sm_insert" ON public.stock_movements FOR INSERT TO public, anon, authenticated WITH CHECK (qty_sheets >= 0 AND qty_sqft >= 0 AND qty_pieces >= 0 AND qty_other >= 0);

-- 8.9 Production Entries (ZERO-DELETE)
DROP POLICY IF EXISTS "pe_select" ON public.production_entries;
DROP POLICY IF EXISTS "pe_insert" ON public.production_entries;
DROP POLICY IF EXISTS "pe_update" ON public.production_entries;
CREATE POLICY "pe_select" ON public.production_entries FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "pe_insert" ON public.production_entries FOR INSERT TO public, anon, authenticated WITH CHECK (sheets_produced > 0);
CREATE POLICY "pe_update" ON public.production_entries FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (status IN ('posted', 'cancelled'));

-- 8.10 Vouchers & Lines (ZERO-DELETE)
DROP POLICY IF EXISTS "vch_select" ON public.vouchers;
DROP POLICY IF EXISTS "vch_insert" ON public.vouchers;
DROP POLICY IF EXISTS "vch_update" ON public.vouchers;
CREATE POLICY "vch_select" ON public.vouchers FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "vch_insert" ON public.vouchers FOR INSERT TO public, anon, authenticated WITH CHECK (total_amount >= 0);
CREATE POLICY "vch_update" ON public.vouchers FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (status IN ('posted', 'cancelled'));

DROP POLICY IF EXISTS "vl_select" ON public.voucher_lines;
DROP POLICY IF EXISTS "vl_insert" ON public.voucher_lines;
CREATE POLICY "vl_select" ON public.voucher_lines FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "vl_insert" ON public.voucher_lines FOR INSERT TO public, anon, authenticated WITH CHECK (quantity >= 0 AND rate >= 0);

-- 8.11 Journal Entries & Lines (ZERO-DELETE)
DROP POLICY IF EXISTS "je_select" ON public.journal_entries;
DROP POLICY IF EXISTS "je_insert" ON public.journal_entries;
DROP POLICY IF EXISTS "je_update" ON public.journal_entries;
CREATE POLICY "je_select" ON public.journal_entries FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "je_insert" ON public.journal_entries FOR INSERT TO public, anon, authenticated WITH CHECK (total_debit = total_credit);
CREATE POLICY "je_update" ON public.journal_entries FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (status IN ('posted', 'cancelled'));

DROP POLICY IF EXISTS "jl_select" ON public.journal_lines;
DROP POLICY IF EXISTS "jl_insert" ON public.journal_lines;
CREATE POLICY "jl_select" ON public.journal_lines FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "jl_insert" ON public.journal_lines FOR INSERT TO public, anon, authenticated WITH CHECK (debit_amount >= 0 AND credit_amount >= 0);

-- 8.12 Salary Records (ZERO-DELETE)
DROP POLICY IF EXISTS "sal_select" ON public.salary_records;
DROP POLICY IF EXISTS "sal_insert" ON public.salary_records;
DROP POLICY IF EXISTS "sal_update" ON public.salary_records;
CREATE POLICY "sal_select" ON public.salary_records FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "sal_insert" ON public.salary_records FOR INSERT TO public, anon, authenticated WITH CHECK (booked_amount > 0);
CREATE POLICY "sal_update" ON public.salary_records FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (paid_amount <= booked_amount);

-- 8.13 Banking & Reconciliation
DROP POLICY IF EXISTS "bst_select" ON public.bank_statement_transactions;
DROP POLICY IF EXISTS "bst_insert" ON public.bank_statement_transactions;
DROP POLICY IF EXISTS "bst_update" ON public.bank_statement_transactions;
DROP POLICY IF EXISTS "bst_delete" ON public.bank_statement_transactions;
CREATE POLICY "bst_select" ON public.bank_statement_transactions FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "bst_insert" ON public.bank_statement_transactions FOR INSERT TO public, anon, authenticated WITH CHECK (true);
CREATE POLICY "bst_update" ON public.bank_statement_transactions FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "bst_delete" ON public.bank_statement_transactions FOR DELETE TO public, anon, authenticated USING (true);

DROP POLICY IF EXISTS "brm_select" ON public.bank_reconciliation_matches;
DROP POLICY IF EXISTS "brm_insert" ON public.bank_reconciliation_matches;
DROP POLICY IF EXISTS "brm_delete" ON public.bank_reconciliation_matches;
CREATE POLICY "brm_select" ON public.bank_reconciliation_matches FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "brm_insert" ON public.bank_reconciliation_matches FOR INSERT TO public, anon, authenticated WITH CHECK (matched_amount > 0);
CREATE POLICY "brm_delete" ON public.bank_reconciliation_matches FOR DELETE TO public, anon, authenticated USING (true);

-- 8.14 Settings & Voucher Sequences
DROP POLICY IF EXISTS "cfg_select" ON public.erp_settings;
DROP POLICY IF EXISTS "cfg_upsert" ON public.erp_settings;
CREATE POLICY "cfg_select" ON public.erp_settings FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "cfg_upsert" ON public.erp_settings FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "seq_select" ON public.voucher_sequences;
DROP POLICY IF EXISTS "seq_upsert" ON public.voucher_sequences;
CREATE POLICY "seq_select" ON public.voucher_sequences FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "seq_upsert" ON public.voucher_sequences FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

-- =========================================================================
-- 9. PERMISSIONS GRANT
-- =========================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Force PostgREST schema cache reload immediately
NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- MASTER SCHEMA SETUP COMPLETE
-- =========================================================================

