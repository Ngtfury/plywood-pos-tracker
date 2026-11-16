-- =========================================================================
-- PLYWOOD POS & CREDIT TRACKER - MIGRATION 007: EDIT MASTER DATA FIELDS
-- =========================================================================
-- Adds required fields for Customer, Supplier, Product, Category,
-- Warehouse, and Units of Measurement editing functionality.
-- Failsafe, idempotent, and backward-compatible.
-- =========================================================================

-- 1. ENTITIES (Customers, Suppliers, Transporters, Contractors)
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS alt_phone TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS credit_period INTEGER DEFAULT NULL;
ALTER TABLE public.entities ADD COLUMN IF NOT EXISTS credit_terms TEXT DEFAULT NULL;

-- 2. PRODUCTS & PRODUCT VARIANTS
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS grade TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC(14, 2) DEFAULT NULL;

ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(14, 2) DEFAULT NULL;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT NULL;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS min_stock_level NUMERIC(14, 2) DEFAULT NULL;

-- 3. CATEGORIES
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. BUSINESS ENTITIES (Warehouses, Branches, Companies)
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.business_entities ADD COLUMN IF NOT EXISTS description TEXT;

-- Safely expand entity_type check constraint to include 'warehouse'
DO $$
BEGIN
    ALTER TABLE public.business_entities DROP CONSTRAINT IF EXISTS business_entities_entity_type_check;
    ALTER TABLE public.business_entities ADD CONSTRAINT business_entities_entity_type_check 
        CHECK (entity_type IN ('company', 'branch', 'warehouse'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 5. EMPLOYEES & PARTNERS
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS bank_account_no TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS ifsc TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS address TEXT;

-- 6. UNITS OF MEASUREMENT TABLE
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

-- RLS & Policies for units_of_measurement
ALTER TABLE public.units_of_measurement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all access on units_of_measurement" ON public.units_of_measurement;
CREATE POLICY "Allow public all access on units_of_measurement" 
    ON public.units_of_measurement FOR ALL 
    TO public, anon, authenticated 
    USING (true) WITH CHECK (true);

-- Seed default units if empty
INSERT INTO public.units_of_measurement (id, name, abbreviation, conversion_factor, base_unit, description)
VALUES
    ('uom_sheets', 'Sheets', 'sheets', 1.000000, 'sheets', 'Standard manufactured plywood sheet units'),
    ('uom_pieces', 'Pieces', 'pcs', 1.000000, 'pieces', 'Single unit items and hardware pieces'),
    ('uom_sqft', 'Square Feet', 'sqft', 1.000000, 'sqft', 'Standard surface area unit for plywood billing'),
    ('uom_sqm', 'Square Meters', 'sqm', 0.092900, 'sqft', 'Metric surface area (1 sqft ≈ 0.0929 sqm)'),
    ('uom_kg', 'Kilograms', 'kg', 1.000000, 'kg', 'Weight unit for resin, glue and raw chemicals'),
    ('uom_litre', 'Litres', 'ltr', 1.000000, 'litre', 'Volume unit for liquid resins and coatings')
ON CONFLICT (id) DO NOTHING;

-- 7. EDIT AUDIT LOGS TABLE
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

CREATE INDEX IF NOT EXISTS idx_edit_audit_logs_record ON public.edit_audit_logs (entity_type, record_id);
CREATE INDEX IF NOT EXISTS idx_edit_audit_logs_date ON public.edit_audit_logs (created_at DESC);

ALTER TABLE public.edit_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all access on edit_audit_logs" ON public.edit_audit_logs;
CREATE POLICY "Allow public all access on edit_audit_logs" 
    ON public.edit_audit_logs FOR ALL 
    TO public, anon, authenticated 
    USING (true) WITH CHECK (true);
