-- =========================================================
-- PLYWOOD POS / EXPENSE TRACKER - SUPABASE DATABASE SCHEMA
-- =========================================================
-- Run this SQL in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qcwbbtfdqqltatelrowl/sql

-- 1. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'BOTH')),
    color TEXT DEFAULT '#94a3b8',
    icon TEXT DEFAULT 'tag',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Entities (Customers, Suppliers, Transporters, etc.) Table
CREATE TABLE IF NOT EXISTS public.entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Other',
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Custom Fields Definition Table
CREATE TABLE IF NOT EXISTS public.custom_fields (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'number')),
    apply_to TEXT NOT NULL CHECK (apply_to IN ('IN', 'OUT', 'BOTH')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    date TIMESTAMPTZ DEFAULT NOW(),
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    entity_id TEXT REFERENCES public.entities(id) ON DELETE SET NULL,
    product_id TEXT,
    quantity NUMERIC(12, 2),
    description TEXT,
    notes TEXT,
    reference TEXT,
    custom_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) & Grant Full Access Policies
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Public access on categories" ON public.categories;
DROP POLICY IF EXISTS "Public access on entities" ON public.entities;
DROP POLICY IF EXISTS "Public access on custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "Public access on transactions" ON public.transactions;

-- Create Policies for Anon/Authenticated Read & Write
CREATE POLICY "Public access on categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access on entities" ON public.entities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access on custom_fields" ON public.custom_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access on transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
