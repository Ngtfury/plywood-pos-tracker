-- =========================================================================
-- PLYWOOD POS & CREDIT TRACKER - PRODUCTION SUPABASE DATABASE SCHEMA
-- =========================================================================
-- How to apply this schema:
-- 1. Log in to your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your Project -> Click on "SQL Editor" in the left sidebar
-- 3. Click "+ New query", paste this entire script, and click "Run" (or Ctrl+Enter)
-- =========================================================================

-- Enable UUID extension if required in future
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------
-- 1. CATEGORIES TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'BOTH')),
    color TEXT DEFAULT '#94a3b8',
    icon TEXT DEFAULT 'tag',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 2. ENTITIES (Customers, Suppliers, Transporters, Contractors) TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Other',
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 3. CUSTOM FIELDS DEFINITIONS TABLE
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_fields (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'number')),
    apply_to TEXT NOT NULL CHECK (apply_to IN ('IN', 'OUT', 'BOTH')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 4. TRANSACTIONS TABLE (Cashflow + Credit / Bills)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(14, 2) DEFAULT NULL,
    paid_amount NUMERIC(14, 2) DEFAULT NULL,
    balance_due NUMERIC(14, 2) DEFAULT 0.00,
    credit_status TEXT DEFAULT 'PAID' CHECK (credit_status IN ('PAID', 'PARTIAL', 'UNPAID')),
    due_date TIMESTAMPTZ DEFAULT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    entity_id TEXT REFERENCES public.entities(id) ON DELETE SET NULL,
    product_id TEXT,
    quantity NUMERIC(14, 2),
    description TEXT,
    notes TEXT,
    reference TEXT,
    custom_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 5. CREDIT PAYMENTS TABLE (Installment Repayment Ledger)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_payments (
    id TEXT PRIMARY KEY,
    transaction_id TEXT REFERENCES public.transactions(id) ON DELETE CASCADE,
    entity_id TEXT REFERENCES public.entities(id) ON DELETE CASCADE,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    payment_type TEXT NOT NULL CHECK (payment_type IN ('IN', 'OUT')),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 6. PERFORMANCE INDEXES
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions (date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_credit_status ON public.transactions (credit_status);
CREATE INDEX IF NOT EXISTS idx_transactions_entity_id ON public.transactions (entity_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON public.transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_trans_id ON public.credit_payments (transaction_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_entity_id ON public.credit_payments (entity_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_date ON public.credit_payments (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_entities_name ON public.entities (name);

-- -------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) & ACCESS POLICIES
-- -------------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-applying
DROP POLICY IF EXISTS "Allow public all access on categories" ON public.categories;
DROP POLICY IF EXISTS "Allow public all access on entities" ON public.entities;
DROP POLICY IF EXISTS "Allow public all access on custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Allow public all access on transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow public all access on credit_payments" ON public.credit_payments;

-- Create full read/write access policies for Anon & Authenticated clients
CREATE POLICY "Allow public all access on categories" 
    ON public.categories FOR ALL 
    TO public, anon, authenticated 
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all access on entities" 
    ON public.entities FOR ALL 
    TO public, anon, authenticated 
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all access on custom_fields" 
    ON public.custom_fields FOR ALL 
    TO public, anon, authenticated 
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all access on transactions" 
    ON public.transactions FOR ALL 
    TO public, anon, authenticated 
    USING (true) WITH CHECK (true);

CREATE POLICY "Allow public all access on credit_payments" 
    ON public.credit_payments FOR ALL 
    TO public, anon, authenticated 
    USING (true) WITH CHECK (true);

-- -------------------------------------------------------------------------
-- 8. INITIAL PRODUCTION SEED: ESSENTIAL DEFAULT CATEGORIES
-- -------------------------------------------------------------------------
INSERT INTO public.categories (id, name, type, color, icon)
VALUES 
    ('cat_sales', 'Plywood Sales', 'IN', '#10b981', 'trending-up'),
    ('cat_hardware_sales', 'Hardware & Laminates Sales', 'IN', '#06b6d4', 'package'),
    ('cat_purchase', 'Raw Material & Timber Purchase', 'OUT', '#f43f5e', 'shopping-cart'),
    ('cat_transport', 'Freight & Transport', 'OUT', '#f59e0b', 'truck'),
    ('cat_labour', 'Staff Wages & Labour', 'OUT', '#3b82f6', 'users'),
    ('cat_utilities', 'Electricity & Factory Rent', 'OUT', '#8b5cf6', 'zap'),
    ('cat_food', 'Tea & Refreshments', 'OUT', '#ec4899', 'coffee'),
    ('cat_misc', 'Miscellaneous Expenses', 'OUT', '#64748b', 'box')
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- SCHEMA SETUP COMPLETE
-- =========================================================================
