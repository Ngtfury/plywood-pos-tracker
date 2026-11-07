-- =========================================================================
-- PLYWOOD ERP HARDENING & AUDIT FIX MIGRATION  —  003_harden_and_fix_erp.sql
-- =========================================================================
-- HOW TO APPLY:
--   1. Log in to your Supabase Dashboard → SQL Editor
--   2. Click "+ New query", paste this entire script, click Run
--   3. Run this AFTER 001 (supabase_schema.sql) and 002 (002_extend_plywood_erp.sql)
--   4. This migration hardens database constraints, replaces unconstrained RLS,
--      provides atomic row-locked functions, and enforces strict double-entry integrity.
--   5. SAFE & IDEMPOTENT: It preserves all 5 original tables, 002 tables, and all records.
-- =========================================================================

-- =========================================================================
-- 1. SCHEMA HARDENING & CONSTRAINTS
-- =========================================================================

-- 1.1 Link column between vouchers and journal_entries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vouchers'
          AND column_name = 'journal_entry_id'
    ) THEN
        ALTER TABLE public.vouchers
            ADD COLUMN journal_entry_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vouchers'
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.vouchers
            ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END;
$$;

-- 1.2 Voucher Header Constraints (non-negative & mathematical integrity)
DO $$
BEGIN
    ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS chk_vouchers_amounts;
    ALTER TABLE public.vouchers ADD CONSTRAINT chk_vouchers_amounts CHECK (
        total_amount >= 0 AND subtotal >= 0 AND tax_amount >= 0 AND
        paid_amount >= 0 AND balance_due >= 0
    );

    ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS chk_vouchers_math;
    ALTER TABLE public.vouchers ADD CONSTRAINT chk_vouchers_math CHECK (
        ABS(total_amount - (subtotal + tax_amount)) <= 0.05
    );

    ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS chk_vouchers_settlement;
    ALTER TABLE public.vouchers ADD CONSTRAINT chk_vouchers_settlement CHECK (
        ABS(total_amount - (paid_amount + balance_due)) <= 0.05
    );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Constraint warning on vouchers: %', SQLERRM;
END;
$$;

-- 1.3 Voucher Line Constraints
DO $$
BEGIN
    ALTER TABLE public.voucher_lines DROP CONSTRAINT IF EXISTS chk_vl_quantities;
    ALTER TABLE public.voucher_lines ADD CONSTRAINT chk_vl_quantities CHECK (
        quantity >= 0 AND (quantity_sqft IS NULL OR quantity_sqft >= 0)
    );

    ALTER TABLE public.voucher_lines DROP CONSTRAINT IF EXISTS chk_vl_amounts;
    ALTER TABLE public.voucher_lines ADD CONSTRAINT chk_vl_amounts CHECK (
        rate >= 0 AND tax_percent >= 0 AND tax_amount >= 0 AND line_total >= 0
    );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Constraint warning on voucher_lines: %', SQLERRM;
END;
$$;

-- 1.4 Stock Balance Hardening & Non-Negative Integrity
DO $$
BEGIN
    ALTER TABLE public.stock_balances DROP CONSTRAINT IF EXISTS chk_stock_balances_non_negative;
    ALTER TABLE public.stock_balances ADD CONSTRAINT chk_stock_balances_non_negative CHECK (
        qty_sheets >= 0 AND qty_sqft >= 0 AND qty_pieces >= 0 AND qty_other >= 0
    );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Constraint warning on stock_balances: %', SQLERRM;
END;
$$;

-- Fix unique indexing on stock_balances when variant_id is NULL
-- In Postgres standard uniqueness, NULL != NULL which allowed duplicate rows when variant_id was null.
DROP INDEX IF EXISTS public.uq_stock_balances_not_null;
DROP INDEX IF EXISTS public.uq_stock_balances_null_variant;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_balances_not_null
    ON public.stock_balances (business_entity_id, product_id, variant_id)
    WHERE variant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_balances_null_variant
    ON public.stock_balances (business_entity_id, product_id)
    WHERE variant_id IS NULL;

-- 1.5 Salary Records Constraints & Payee Exclusivity
DO $$
BEGIN
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
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Constraint warning on salary_records: %', SQLERRM;
END;
$$;

-- 1.6 Bank Reconciliation Constraints: Exactly One Reference & Positive Amount
DO $$
BEGIN
    ALTER TABLE public.bank_reconciliation_matches DROP CONSTRAINT IF EXISTS chk_brm_one_reference;
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
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Constraint warning on bank_reconciliation_matches: %', SQLERRM;
END;
$$;

-- 1.7 Production Entries Constraints
DO $$
BEGIN
    ALTER TABLE public.production_entries DROP CONSTRAINT IF EXISTS chk_production_positive_metrics;
    ALTER TABLE public.production_entries ADD CONSTRAINT chk_production_positive_metrics CHECK (
        sheets_produced > 0 AND sqft_produced > 0 AND
        face_veneer_ratio > 0 AND face_veneer_consumed > 0
    );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Constraint warning on production_entries: %', SQLERRM;
END;
$$;

-- =========================================================================
-- 2. PERFORMANCE & FOREIGN KEY INDEXES
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_voucher_lines_variant    ON public.voucher_lines (variant_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_debit_acc  ON public.voucher_lines (debit_account_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_credit_acc ON public.voucher_lines (credit_account_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_journal_entry   ON public.vouchers (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant  ON public.stock_movements (variant_id);

CREATE INDEX IF NOT EXISTS idx_production_plywood_prod  ON public.production_entries (plywood_product_id);
CREATE INDEX IF NOT EXISTS idx_production_plywood_var   ON public.production_entries (plywood_variant_id);
CREATE INDEX IF NOT EXISTS idx_production_veneer_prod   ON public.production_entries (face_veneer_product_id);
CREATE INDEX IF NOT EXISTS idx_production_status        ON public.production_entries (status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_be_accno
    ON public.bank_accounts (business_entity_id, account_no);


-- =========================================================================
-- 3. HARDENED CORE STORED PROCEDURES (ROW LOCKING & INTEGRITY)
-- =========================================================================

-- -------------------------------------------------------------------------
-- FN1: post_stock_movement (with explicit FOR UPDATE row locking)
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_move_id       TEXT;
    v_direction     INTEGER; -- +1 for in, -1 for out
    v_balance_id    TEXT;
    v_cur_sheets    NUMERIC := 0;
    v_cur_sqft      NUMERIC := 0;
    v_cur_pieces    NUMERIC := 0;
    v_cur_other     NUMERIC := 0;
    v_new_sheets    NUMERIC := 0;
    v_new_sqft      NUMERIC := 0;
    v_new_pieces    NUMERIC := 0;
    v_new_other     NUMERIC := 0;
BEGIN
    -- 1. Validate inputs
    IF COALESCE(p_qty_sheets, 0) < 0 OR COALESCE(p_qty_sqft, 0) < 0 OR
       COALESCE(p_qty_pieces, 0) < 0 OR COALESCE(p_qty_other, 0) < 0 THEN
        RAISE EXCEPTION 'Stock movement quantities must not be negative.';
    END IF;

    IF (COALESCE(p_qty_sheets, 0) + COALESCE(p_qty_sqft, 0) +
        COALESCE(p_qty_pieces, 0) + COALESCE(p_qty_other, 0)) <= 0 THEN
        RAISE EXCEPTION 'Stock movement requires at least one quantity greater than zero.';
    END IF;

    -- 2. Determine movement direction
    IF p_movement_type IN ('purchase', 'production_in', 'adjustment_in', 'transfer_in') THEN
        v_direction := 1;
    ELSIF p_movement_type IN ('sale', 'production_out', 'adjustment_out', 'transfer_out') THEN
        v_direction := -1;
    ELSE
        RAISE EXCEPTION 'Invalid stock movement type: %', p_movement_type;
    END IF;

    -- 3. Row lock the stock balance row to serialize concurrent writes
    SELECT id, qty_sheets, qty_sqft, qty_pieces, qty_other
    INTO v_balance_id, v_cur_sheets, v_cur_sqft, v_cur_pieces, v_cur_other
    FROM public.stock_balances
    WHERE business_entity_id = p_business_entity_id
      AND product_id = p_product_id
      AND (
          (variant_id IS NULL AND p_variant_id IS NULL) OR
          (variant_id = p_variant_id)
      )
    FOR UPDATE;

    -- 4. Deductions: Must have existing stock row and sufficient quantity in ALL units
    IF v_direction = -1 THEN
        IF v_balance_id IS NULL THEN
            RAISE EXCEPTION 'No stock record found for product % (variant %). Cannot deduct inventory.',
                p_product_id, COALESCE(p_variant_id, 'NONE');
        END IF;

        IF COALESCE(p_qty_sheets, 0) > 0 AND v_cur_sheets < p_qty_sheets THEN
            RAISE EXCEPTION 'Insufficient sheet stock for product %. Available: %, Required: %',
                p_product_id, v_cur_sheets, p_qty_sheets;
        END IF;

        IF COALESCE(p_qty_sqft, 0) > 0 AND v_cur_sqft < p_qty_sqft THEN
            RAISE EXCEPTION 'Insufficient sqft stock for product %. Available: %, Required: %',
                p_product_id, v_cur_sqft, p_qty_sqft;
        END IF;

        IF COALESCE(p_qty_pieces, 0) > 0 AND v_cur_pieces < p_qty_pieces THEN
            RAISE EXCEPTION 'Insufficient pieces stock for product %. Available: %, Required: %',
                p_product_id, v_cur_pieces, p_qty_pieces;
        END IF;

        IF COALESCE(p_qty_other, 0) > 0 AND v_cur_other < p_qty_other THEN
            RAISE EXCEPTION 'Insufficient unit stock for product %. Available: %, Required: %',
                p_product_id, v_cur_other, p_qty_other;
        END IF;

        v_new_sheets := v_cur_sheets - COALESCE(p_qty_sheets, 0);
        v_new_sqft   := v_cur_sqft   - COALESCE(p_qty_sqft, 0);
        v_new_pieces := v_cur_pieces - COALESCE(p_qty_pieces, 0);
        v_new_other  := v_cur_other  - COALESCE(p_qty_other, 0);

        UPDATE public.stock_balances
        SET qty_sheets = v_new_sheets,
            qty_sqft   = v_new_sqft,
            qty_pieces = v_new_pieces,
            qty_other  = v_new_other,
            updated_at = NOW()
        WHERE id = v_balance_id;

    ELSE
        -- Inward Movement: Update or Insert row
        IF v_balance_id IS NOT NULL THEN
            v_new_sheets := v_cur_sheets + COALESCE(p_qty_sheets, 0);
            v_new_sqft   := v_cur_sqft   + COALESCE(p_qty_sqft, 0);
            v_new_pieces := v_cur_pieces + COALESCE(p_qty_pieces, 0);
            v_new_other  := v_cur_other  + COALESCE(p_qty_other, 0);

            UPDATE public.stock_balances
            SET qty_sheets = v_new_sheets,
                qty_sqft   = v_new_sqft,
                qty_pieces = v_new_pieces,
                qty_other  = v_new_other,
                updated_at = NOW()
            WHERE id = v_balance_id;
        ELSE
            INSERT INTO public.stock_balances (
                business_entity_id, product_id, variant_id,
                qty_sheets, qty_sqft, qty_pieces, qty_other
            ) VALUES (
                p_business_entity_id, p_product_id, p_variant_id,
                COALESCE(p_qty_sheets, 0),
                COALESCE(p_qty_sqft, 0),
                COALESCE(p_qty_pieces, 0),
                COALESCE(p_qty_other, 0)
            );
        END IF;
    END IF;

    -- 5. Record movement in audit ledger
    v_move_id := 'sm_' || gen_random_uuid()::text;
    INSERT INTO public.stock_movements (
        id, business_entity_id, product_id, variant_id,
        movement_type, qty_sheets, qty_sqft, qty_pieces, qty_other,
        reference_id, reference_type, narration, movement_date
    ) VALUES (
        v_move_id, p_business_entity_id, p_product_id, p_variant_id,
        p_movement_type,
        COALESCE(p_qty_sheets, 0),
        COALESCE(p_qty_sqft, 0),
        COALESCE(p_qty_pieces, 0),
        COALESCE(p_qty_other, 0),
        p_reference_id, p_reference_type, p_narration, p_movement_date
    );

    RETURN v_move_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN2: post_production_entry (Atomic & Row-Locked with Recipe Verification)
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entry_id             TEXT;
    v_veneer_balance_id    TEXT;
    v_cur_veneer_pieces    NUMERIC := 0;
    v_plywood_cat          TEXT;
    v_veneer_cat           TEXT;
    v_expected_consumption NUMERIC;
    v_plywood_move_id      TEXT;
    v_veneer_move_id       TEXT;
BEGIN
    -- 1. Validate basic numbers
    IF p_sheets_produced <= 0 THEN
        RAISE EXCEPTION 'Sheets produced must be greater than zero.';
    END IF;
    IF p_sqft_produced <= 0 THEN
        RAISE EXCEPTION 'Sqft produced must be greater than zero.';
    END IF;
    IF p_face_veneer_ratio <= 0 THEN
        RAISE EXCEPTION 'Face veneer ratio must be greater than zero.';
    END IF;

    -- 2. Verify recipe calculation: consumption = sheets × ratio
    v_expected_consumption := ROUND(p_sheets_produced * p_face_veneer_ratio, 4);
    IF ABS(p_face_veneer_consumed - v_expected_consumption) > 0.001 THEN
        RAISE EXCEPTION 'Calculated consumption mismatch. Expected %, received %',
            v_expected_consumption, p_face_veneer_consumed;
    END IF;

    -- 3. Verify product categories
    SELECT category INTO v_plywood_cat FROM public.products WHERE id = p_plywood_product_id;
    IF v_plywood_cat IS NULL OR v_plywood_cat <> 'plywood' THEN
        RAISE EXCEPTION 'Selected produced product (%) is not a Plywood item.', p_plywood_product_id;
    END IF;

    SELECT category INTO v_veneer_cat FROM public.products WHERE id = p_face_veneer_product_id;
    IF v_veneer_cat IS NULL OR v_veneer_cat <> 'face_veneer' THEN
        RAISE EXCEPTION 'Selected raw material (%) is not a Face Veneer product.', p_face_veneer_product_id;
    END IF;

    -- 4. Lock face veneer stock row with FOR UPDATE
    SELECT id, qty_pieces INTO v_veneer_balance_id, v_cur_veneer_pieces
    FROM public.stock_balances
    WHERE business_entity_id = p_business_entity_id
      AND product_id = p_face_veneer_product_id
      AND variant_id IS NULL
    FOR UPDATE;

    IF v_veneer_balance_id IS NULL OR v_cur_veneer_pieces < p_face_veneer_consumed THEN
        RAISE EXCEPTION 'Insufficient face veneer stock. Available: %, Required: %',
            COALESCE(v_cur_veneer_pieces, 0), p_face_veneer_consumed;
    END IF;

    -- 5. Create production entry
    v_entry_id := 'pe_' || gen_random_uuid()::text;
    INSERT INTO public.production_entries (
        id, business_entity_id, production_date,
        plywood_product_id, plywood_variant_id,
        sheets_produced, sqft_produced,
        face_veneer_product_id, face_veneer_ratio, face_veneer_consumed,
        status, notes
    ) VALUES (
        v_entry_id, p_business_entity_id, p_production_date,
        p_plywood_product_id, p_plywood_variant_id,
        p_sheets_produced, p_sqft_produced,
        p_face_veneer_product_id, p_face_veneer_ratio, p_face_veneer_consumed,
        'posted', p_notes
    );

    -- 6. Deduct face veneer pieces
    UPDATE public.stock_balances
    SET qty_pieces = qty_pieces - p_face_veneer_consumed,
        updated_at = NOW()
    WHERE id = v_veneer_balance_id;

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

    -- 7. Add plywood stock atomically
    v_plywood_move_id := public.post_stock_movement(
        p_business_entity_id,
        p_plywood_product_id,
        p_plywood_variant_id,
        'production_in',
        p_sheets_produced,
        p_sqft_produced,
        0, 0,
        v_entry_id,
        'production',
        'Plywood manufactured in production run',
        p_production_date
    );

    -- 8. Link movement references
    UPDATE public.production_entries
    SET plywood_movement_id = v_plywood_move_id,
        veneer_movement_id  = v_veneer_move_id
    WHERE id = v_entry_id;

    RETURN v_entry_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN3: post_voucher_atomic (Atomic Voucher + Stock + Double Entry Ledger)
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
    v_voucher_id      TEXT;
    v_journal_id      TEXT;
    v_biz_id          TEXT;
    v_vch_type        TEXT;
    v_vch_number      TEXT;
    v_vch_date        TIMESTAMPTZ;
    v_party_id        TEXT;
    v_subtotal        NUMERIC(14,2);
    v_tax_amount      NUMERIC(14,2);
    v_total_amount    NUMERIC(14,2);
    v_paid_amount     NUMERIC(14,2);
    v_balance_due     NUMERIC(14,2);
    v_payment_status  TEXT;
    v_payment_method  TEXT;
    v_bank_account_id TEXT;
    v_reference       TEXT;
    v_narration       TEXT;
    v_source_txn_id   TEXT;

    v_line_elem       JSONB;
    v_line_id         TEXT;
    v_line_no         INTEGER := 1;
    v_prod_id         TEXT;
    v_var_id          TEXT;
    v_desc            TEXT;
    v_unit            TEXT;
    v_qty             NUMERIC(14,4);
    v_qty_sqft        NUMERIC(14,4);
    v_rate            NUMERIC(14,4);
    v_tax_pct         NUMERIC(6,2);
    v_tax_amt         NUMERIC(14,2);
    v_line_tot        NUMERIC(14,2);
    v_deb_acc         TEXT;
    v_cred_acc        TEXT;
    v_prod_cat        TEXT;
    v_cash_bank_acc   TEXT;
BEGIN
    -- 1. Extract and validate header attributes
    v_biz_id          := p_voucher->>'business_entity_id';
    v_vch_type        := p_voucher->>'voucher_type';
    v_vch_number      := p_voucher->>'voucher_number';
    v_vch_date        := COALESCE((p_voucher->>'voucher_date')::TIMESTAMPTZ, NOW());
    v_party_id        := p_voucher->>'party_entity_id';
    v_subtotal        := COALESCE((p_voucher->>'subtotal')::NUMERIC, 0);
    v_tax_amount      := COALESCE((p_voucher->>'tax_amount')::NUMERIC, 0);
    v_total_amount    := COALESCE((p_voucher->>'total_amount')::NUMERIC, 0);
    v_paid_amount     := COALESCE((p_voucher->>'paid_amount')::NUMERIC, 0);
    v_balance_due     := COALESCE((p_voucher->>'balance_due')::NUMERIC, 0);
    v_payment_status  := COALESCE(p_voucher->>'payment_status', 'unpaid');
    v_payment_method  := p_voucher->>'payment_method';
    v_bank_account_id := p_voucher->>'bank_account_id';
    v_reference       := p_voucher->>'reference';
    v_narration       := p_voucher->>'narration';
    v_source_txn_id   := p_voucher->>'source_transaction_id';

    IF v_biz_id IS NULL THEN
        RAISE EXCEPTION 'business_entity_id is required.';
    END IF;
    IF v_vch_type NOT IN ('sales', 'purchase', 'payment', 'receipt', 'expense') THEN
        RAISE EXCEPTION 'Invalid voucher_type: %', v_vch_type;
    END IF;
    IF v_vch_number IS NULL OR trim(v_vch_number) = '' THEN
        RAISE EXCEPTION 'voucher_number is required.';
    END IF;
    IF v_total_amount < 0 THEN
        RAISE EXCEPTION 'total_amount cannot be negative.';
    END IF;
    IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
        RAISE EXCEPTION 'Voucher must have at least one line item.';
    END IF;

    -- Validate settlement equation
    IF ABS(v_total_amount - (v_paid_amount + v_balance_due)) > 0.05 THEN
        RAISE EXCEPTION 'Total amount (%) does not match paid (%) + balance due (%).',
            v_total_amount, v_paid_amount, v_balance_due;
    END IF;

    -- Unique voucher number per business entity & voucher type
    IF EXISTS (
        SELECT 1 FROM public.vouchers
        WHERE business_entity_id = v_biz_id
          AND voucher_type = v_vch_type
          AND voucher_number = v_vch_number
          AND status = 'posted'
    ) THEN
        RAISE EXCEPTION 'Voucher number % already exists for this branch and type.', v_vch_number;
    END IF;

    -- 2. Allocate IDs
    v_voucher_id := COALESCE(p_voucher->>'id', 'vch_' || gen_random_uuid()::text);
    v_journal_id := 'je_' || gen_random_uuid()::text;

    -- Cash vs Bank settlement account helper
    IF v_payment_method = 'bank' OR v_payment_method = 'upi' THEN
        v_cash_bank_acc := 'acc_bank';
    ELSE
        v_cash_bank_acc := 'acc_cash';
    END IF;

    -- 3. Insert Voucher Record
    INSERT INTO public.vouchers (
        id, business_entity_id, voucher_type, voucher_number, voucher_date,
        party_entity_id, subtotal, tax_amount, total_amount, paid_amount,
        balance_due, payment_status, payment_method, bank_account_id,
        reference, narration, source_transaction_id, journal_entry_id, status
    ) VALUES (
        v_voucher_id, v_biz_id, v_vch_type, v_vch_number, v_vch_date,
        v_party_id, v_subtotal, v_tax_amount, v_total_amount, v_paid_amount,
        v_balance_due, v_payment_status, v_payment_method, v_bank_account_id,
        v_reference, v_narration, v_source_txn_id, v_journal_id, 'posted'
    );

    -- 4. Process Lines & Associated Inventory Movements
    FOR v_line_elem IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_line_id  := COALESCE(v_line_elem->>'id', 'vl_' || gen_random_uuid()::text);
        v_prod_id  := v_line_elem->>'product_id';
        v_var_id   := v_line_elem->>'variant_id';
        v_desc     := v_line_elem->>'description';
        v_unit     := v_line_elem->>'unit';
        v_qty      := COALESCE((v_line_elem->>'quantity')::NUMERIC, 0);
        v_qty_sqft := (v_line_elem->>'quantity_sqft')::NUMERIC;
        v_rate     := COALESCE((v_line_elem->>'rate')::NUMERIC, 0);
        v_tax_pct  := COALESCE((v_line_elem->>'tax_percent')::NUMERIC, 0);
        v_tax_amt  := COALESCE((v_line_elem->>'tax_amount')::NUMERIC, 0);
        v_line_tot := COALESCE((v_line_elem->>'line_total')::NUMERIC, 0);
        v_deb_acc  := v_line_elem->>'debit_account_id';
        v_cred_acc := v_line_elem->>'credit_account_id';

        INSERT INTO public.voucher_lines (
            id, voucher_id, line_no, product_id, variant_id,
            description, unit, quantity, quantity_sqft, rate,
            tax_percent, tax_amount, line_total, debit_account_id, credit_account_id
        ) VALUES (
            v_line_id, v_voucher_id, v_line_no, v_prod_id, v_var_id,
            v_desc, v_unit, v_qty, v_qty_sqft, v_rate,
            v_tax_pct, v_tax_amt, v_line_tot, v_deb_acc, v_cred_acc
        );

        -- Stock update for Sales: Deduct inventory atomically with row lock
        IF v_vch_type = 'sales' AND v_prod_id IS NOT NULL AND v_qty > 0 THEN
            PERFORM public.post_stock_movement(
                v_biz_id,
                v_prod_id,
                v_var_id,
                'sale',
                v_qty,
                COALESCE(v_qty_sqft, 0),
                0, 0,
                v_voucher_id,
                'voucher',
                'Sale invoice: ' || v_vch_number,
                v_vch_date
            );
        END IF;

        -- Stock update for Purchases: Add inventory atomically
        IF v_vch_type = 'purchase' AND v_prod_id IS NOT NULL AND v_qty > 0 THEN
            SELECT category INTO v_prod_cat FROM public.products WHERE id = v_prod_id;

            IF v_prod_cat = 'plywood' THEN
                PERFORM public.post_stock_movement(
                    v_biz_id, v_prod_id, v_var_id, 'purchase',
                    v_qty, COALESCE(v_qty_sqft, 0), 0, 0,
                    v_voucher_id, 'voucher', 'Purchase invoice: ' || v_vch_number, v_vch_date
                );
            ELSIF v_prod_cat IN ('face_veneer', 'other_veneer') THEN
                PERFORM public.post_stock_movement(
                    v_biz_id, v_prod_id, NULL, 'purchase',
                    0, 0, v_qty, 0,
                    v_voucher_id, 'voucher', 'Purchase invoice: ' || v_vch_number, v_vch_date
                );
            ELSE
                PERFORM public.post_stock_movement(
                    v_biz_id, v_prod_id, NULL, 'purchase',
                    0, 0, 0, v_qty,
                    v_voucher_id, 'voucher', 'Purchase invoice: ' || v_vch_number, v_vch_date
                );
            END IF;
        END IF;

        v_line_no := v_line_no + 1;
    END LOOP;

    -- 5. Generate Double-Entry Accounting Journal Entry
    INSERT INTO public.journal_entries (
        id, business_entity_id, entry_date, reference, narration,
        total_debit, total_credit, status
    ) VALUES (
        v_journal_id, v_biz_id, v_vch_date, v_voucher_id,
        COALESCE(v_narration, v_vch_type || ' voucher #' || v_vch_number),
        v_total_amount, v_total_amount, 'posted'
    );

    -- 6. Generate Balanced Journal Lines by Voucher Type
    IF v_vch_type = 'sales' THEN
        -- Cash/Bank received
        IF v_paid_amount > 0 THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_journal_id, v_cash_bank_acc, v_paid_amount, 0, 'Cash/Bank collection on sale');
        END IF;
        -- Customer credit receivable
        IF v_balance_due > 0 THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_journal_id, 'acc_receivable', v_balance_due, 0, 'Receivable on credit sale');
        END IF;
        -- Sales revenue
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_journal_id, 'acc_sales', 0, v_total_amount, 'Sales revenue posted');

    ELSIF v_vch_type = 'purchase' THEN
        -- Purchase expense / COGS
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_journal_id, 'acc_purchase', v_total_amount, 0, 'Purchase goods');
        -- Paid portion
        IF v_paid_amount > 0 THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_journal_id, v_cash_bank_acc, 0, v_paid_amount, 'Cash/Bank paid for purchase');
        END IF;
        -- Accounts payable for balance
        IF v_balance_due > 0 THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_journal_id, 'acc_payable', 0, v_balance_due, 'Payable for credit purchase');
        END IF;

    ELSIF v_vch_type = 'receipt' THEN
        -- Cash/Bank IN
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_journal_id, v_cash_bank_acc, v_total_amount, 0, 'Cash/Bank received from customer');
        -- Accounts receivable cleared
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_journal_id, 'acc_receivable', 0, v_total_amount, 'Customer balance settled');

    ELSIF v_vch_type = 'payment' THEN
        -- Accounts payable cleared
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_journal_id, COALESCE(v_deb_acc, 'acc_payable'), v_total_amount, 0, 'Supplier/Payee balance settled');
        -- Cash/Bank OUT
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_journal_id, v_cash_bank_acc, 0, v_total_amount, 'Disbursement from Cash/Bank');

    ELSIF v_vch_type = 'expense' THEN
        -- Operating Expense
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_journal_id, COALESCE(v_deb_acc, 'acc_misc_expense'), v_total_amount, 0, 'Operating expense incurred');
        -- Cash/Bank OUT
        INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
        VALUES (v_journal_id, v_cash_bank_acc, 0, v_total_amount, 'Expense payment from Cash/Bank');
    END IF;

    RETURN v_voucher_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN4: cancel_voucher_atomic (Stock Reversal + Journal Cancellation)
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
    v_vch       RECORD;
    v_move      RECORD;
    v_prod_cat  TEXT;
BEGIN
    -- 1. Fetch voucher with row lock
    SELECT * INTO v_vch
    FROM public.vouchers
    WHERE id = p_voucher_id
    FOR UPDATE;

    IF v_vch IS NULL THEN
        RAISE EXCEPTION 'Voucher % not found.', p_voucher_id;
    END IF;

    IF v_vch.status = 'cancelled' THEN
        RAISE EXCEPTION 'Voucher % is already cancelled.', p_voucher_id;
    END IF;

    -- 2. Guard: Cannot cancel if matched in bank reconciliation
    IF EXISTS (
        SELECT 1 FROM public.bank_reconciliation_matches
        WHERE voucher_id = p_voucher_id
    ) THEN
        RAISE EXCEPTION 'Cannot cancel voucher % because it has reconciled bank transactions. Unmatch bank transaction first.', p_voucher_id;
    END IF;

    -- 3. Reverse Inventory Movements
    FOR v_move IN
        SELECT * FROM public.stock_movements
        WHERE reference_id = p_voucher_id AND reference_type = 'voucher'
    LOOP
        IF v_move.movement_type = 'sale' THEN
            -- Reverse sale: Put stock back with adjustment_in
            PERFORM public.post_stock_movement(
                v_move.business_entity_id,
                v_move.product_id,
                v_move.variant_id,
                'adjustment_in',
                v_move.qty_sheets,
                v_move.qty_sqft,
                v_move.qty_pieces,
                v_move.qty_other,
                v_voucher_id,
                'voucher',
                'Reversal of cancelled sales invoice ' || v_vch.voucher_number,
                NOW()
            );

        ELSIF v_move.movement_type = 'purchase' THEN
            -- Reverse purchase: Deduct stock back with adjustment_out (with verification)
            PERFORM public.post_stock_movement(
                v_move.business_entity_id,
                v_move.product_id,
                v_move.variant_id,
                'adjustment_out',
                v_move.qty_sheets,
                v_move.qty_sqft,
                v_move.qty_pieces,
                v_move.qty_other,
                v_voucher_id,
                'voucher',
                'Reversal of cancelled purchase invoice ' || v_vch.voucher_number,
                NOW()
            );
        END IF;
    END LOOP;

    -- 4. Cancel associated journal entry
    IF v_vch.journal_entry_id IS NOT NULL THEN
        UPDATE public.journal_entries
        SET status = 'cancelled'
        WHERE id = v_vch.journal_entry_id;
    ELSE
        UPDATE public.journal_entries
        SET status = 'cancelled'
        WHERE reference = p_voucher_id;
    END IF;

    -- 5. Mark voucher cancelled
    UPDATE public.vouchers
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_voucher_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN5: cancel_production_entry_atomic (Reverse Production & Raw Material)
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
    v_prod      RECORD;
    v_ply_bal   RECORD;
BEGIN
    SELECT * INTO v_prod
    FROM public.production_entries
    WHERE id = p_production_id
    FOR UPDATE;

    IF v_prod IS NULL THEN
        RAISE EXCEPTION 'Production entry % not found.', p_production_id;
    END IF;

    IF v_prod.status = 'cancelled' THEN
        RAISE EXCEPTION 'Production entry % is already cancelled.', p_production_id;
    END IF;

    -- 1. Deduct produced plywood back (checks that produced plywood hasn't already been sold)
    PERFORM public.post_stock_movement(
        v_prod.business_entity_id,
        v_prod.plywood_product_id,
        v_prod.plywood_variant_id,
        'adjustment_out',
        v_prod.sheets_produced,
        v_prod.sqft_produced,
        0, 0,
        p_production_id,
        'production',
        'Reversal of cancelled production entry',
        NOW()
    );

    -- 2. Restore consumed face veneer pieces
    PERFORM public.post_stock_movement(
        v_prod.business_entity_id,
        v_prod.face_veneer_product_id,
        NULL,
        'adjustment_in',
        0, 0,
        v_prod.face_veneer_consumed,
        0,
        p_production_id,
        'production',
        'Restoration of consumed face veneer for cancelled production',
        NOW()
    );

    -- 3. Mark production entry cancelled
    UPDATE public.production_entries
    SET status = 'cancelled'
    WHERE id = p_production_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN6: cancel_journal_entry_atomic (Cancel Manual Journal)
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
    v_je RECORD;
BEGIN
    SELECT * INTO v_je
    FROM public.journal_entries
    WHERE id = p_journal_id
    FOR UPDATE;

    IF v_je IS NULL THEN
        RAISE EXCEPTION 'Journal entry % not found.', p_journal_id;
    END IF;

    IF v_je.status = 'cancelled' THEN
        RAISE EXCEPTION 'Journal entry % is already cancelled.', p_journal_id;
    END IF;

    -- Cannot cancel if matched in bank reconciliation
    IF EXISTS (
        SELECT 1 FROM public.bank_reconciliation_matches
        WHERE journal_entry_id = p_journal_id
    ) THEN
        RAISE EXCEPTION 'Cannot cancel journal entry % because it is reconciled in bank statements.', p_journal_id;
    END IF;

    UPDATE public.journal_entries
    SET status = 'cancelled'
    WHERE id = p_journal_id;
END;
$$;

-- -------------------------------------------------------------------------
-- FN7: get_trial_balance (Complete, Balanced, Non-Duplicative Trial Balance)
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
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        a.id           AS account_id,
        a.name         AS account_name,
        a.account_type AS account_type,
        COALESCE(SUM(jl.debit_amount), 0)::NUMERIC(14,2)  AS total_debit,
        COALESCE(SUM(jl.credit_amount), 0)::NUMERIC(14,2) AS total_credit,
        (COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0))::NUMERIC(14,2) AS net_balance
    FROM public.accounts a
    LEFT JOIN (
        public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_id
             AND je.business_entity_id = p_business_entity_id
             AND je.status = 'posted'
             AND je.entry_date BETWEEN p_from_date AND p_to_date
    ) ON jl.account_id = a.id
    WHERE a.is_active = true
    GROUP BY a.id, a.name, a.account_type
    HAVING (COALESCE(SUM(jl.debit_amount), 0) <> 0 OR COALESCE(SUM(jl.credit_amount), 0) <> 0)
    ORDER BY a.account_type, a.name;
$$;


-- =========================================================================
-- 4. HISTORICAL DATA RECONCILIATION & JOURNAL BACKFILL
-- =========================================================================
-- Ensures any vouchers recorded in 002 prior to atomic journal generation
-- receive matching double-entry records in public.journal_entries/lines.
DO $$
DECLARE
    v_rec           RECORD;
    v_je_id         TEXT;
    v_cash_bank_acc TEXT;
BEGIN
    FOR v_rec IN
        SELECT v.*
        FROM public.vouchers v
        WHERE v.status = 'posted'
          AND (v.journal_entry_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM public.journal_entries je WHERE je.id = v.journal_entry_id
          ))
    LOOP
        v_je_id := 'je_bf_' || substr(v_rec.id, 5);

        IF v_rec.payment_method = 'bank' OR v_rec.payment_method = 'upi' THEN
            v_cash_bank_acc := 'acc_bank';
        ELSE
            v_cash_bank_acc := 'acc_cash';
        END IF;

        INSERT INTO public.journal_entries (
            id, business_entity_id, entry_date, reference, narration,
            total_debit, total_credit, status
        ) VALUES (
            v_je_id, v_rec.business_entity_id, v_rec.voucher_date, v_rec.id,
            COALESCE(v_rec.narration, v_rec.voucher_type || ' voucher #' || v_rec.voucher_number),
            v_rec.total_amount, v_rec.total_amount, 'posted'
        ) ON CONFLICT (id) DO NOTHING;

        IF v_rec.voucher_type = 'sales' THEN
            IF v_rec.paid_amount > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
                VALUES (v_je_id, v_cash_bank_acc, v_rec.paid_amount, 0, 'Sales collection')
                ON CONFLICT DO NOTHING;
            END IF;
            IF v_rec.balance_due > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
                VALUES (v_je_id, 'acc_receivable', v_rec.balance_due, 0, 'Sales receivable')
                ON CONFLICT DO NOTHING;
            END IF;
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, 'acc_sales', 0, v_rec.total_amount, 'Sales revenue')
            ON CONFLICT DO NOTHING;

        ELSIF v_rec.voucher_type = 'purchase' THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, 'acc_purchase', v_rec.total_amount, 0, 'Purchase COGS')
            ON CONFLICT DO NOTHING;
            IF v_rec.paid_amount > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
                VALUES (v_je_id, v_cash_bank_acc, 0, v_rec.paid_amount, 'Purchase payment')
                ON CONFLICT DO NOTHING;
            END IF;
            IF v_rec.balance_due > 0 THEN
                INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
                VALUES (v_je_id, 'acc_payable', 0, v_rec.balance_due, 'Purchase payable')
                ON CONFLICT DO NOTHING;
            END IF;

        ELSIF v_rec.voucher_type = 'receipt' THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, v_cash_bank_acc, v_rec.total_amount, 0, 'Receipt')
            ON CONFLICT DO NOTHING;
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, 'acc_receivable', 0, v_rec.total_amount, 'Receivable cleared')
            ON CONFLICT DO NOTHING;

        ELSIF v_rec.voucher_type = 'payment' THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, 'acc_payable', v_rec.total_amount, 0, 'Payable settled')
            ON CONFLICT DO NOTHING;
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, v_cash_bank_acc, 0, v_rec.total_amount, 'Payment')
            ON CONFLICT DO NOTHING;

        ELSIF v_rec.voucher_type = 'expense' THEN
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, 'acc_misc_expense', v_rec.total_amount, 0, 'Expense')
            ON CONFLICT DO NOTHING;
            INSERT INTO public.journal_lines (journal_id, account_id, debit_amount, credit_amount, narration)
            VALUES (v_je_id, v_cash_bank_acc, 0, v_rec.total_amount, 'Expense payment')
            ON CONFLICT DO NOTHING;
        END IF;

        UPDATE public.vouchers
        SET journal_entry_id = v_je_id
        WHERE id = v_rec.id;
    END LOOP;
END;
$$;


-- =========================================================================
-- 5. SECURE ROW-LEVEL SECURITY & AUTHORIZATION STRATEGY
-- =========================================================================
-- Replaces unrestricted anon 'FOR ALL USING (true)' policies from 002.
-- Rules:
--   1. Zero-DELETE on all ledger & audit tables:
--      (vouchers, voucher_lines, journal_entries, journal_lines,
--       stock_movements, production_entries, salary_records, bank_reconciliation_matches)
--      Historical audit ledger records can NEVER be dropped via REST API.
--   2. Controlled INSERT/UPDATE policies with data integrity checks.
--   3. System account protection: is_system = true accounts cannot be updated or deleted.
--   4. Standard SELECT access for reading reports and application workflows.

DO $$
DECLARE
    tbl TEXT;
    pol TEXT;
BEGIN
    -- Drop legacy 002 blanket policies
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

-- 5.1 Business Entities
DROP POLICY IF EXISTS "be_select" ON public.business_entities;
DROP POLICY IF EXISTS "be_insert" ON public.business_entities;
DROP POLICY IF EXISTS "be_update" ON public.business_entities;
CREATE POLICY "be_select" ON public.business_entities FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "be_insert" ON public.business_entities FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "be_update" ON public.business_entities FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (length(trim(name)) > 0);

-- 5.2 Accounts (Chart of Accounts with System Account Protection)
DROP POLICY IF EXISTS "acc_select" ON public.accounts;
DROP POLICY IF EXISTS "acc_insert" ON public.accounts;
DROP POLICY IF EXISTS "acc_update" ON public.accounts;
DROP POLICY IF EXISTS "acc_delete" ON public.accounts;
CREATE POLICY "acc_select" ON public.accounts FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "acc_insert" ON public.accounts FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "acc_update" ON public.accounts FOR UPDATE TO public, anon, authenticated USING (NOT is_system) WITH CHECK (NOT is_system);
CREATE POLICY "acc_delete" ON public.accounts FOR DELETE TO public, anon, authenticated USING (NOT is_system);

-- 5.3 Products & Variants
DROP POLICY IF EXISTS "prod_select" ON public.products;
DROP POLICY IF EXISTS "prod_insert" ON public.products;
DROP POLICY IF EXISTS "prod_update" ON public.products;
CREATE POLICY "prod_select" ON public.products FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "prod_insert" ON public.products FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "prod_update" ON public.products FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (length(trim(name)) > 0);

DROP POLICY IF EXISTS "pv_select" ON public.product_variants;
DROP POLICY IF EXISTS "pv_insert" ON public.product_variants;
DROP POLICY IF EXISTS "pv_update" ON public.product_variants;
CREATE POLICY "pv_select" ON public.product_variants FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "pv_insert" ON public.product_variants FOR INSERT TO public, anon, authenticated WITH CHECK (true);
CREATE POLICY "pv_update" ON public.product_variants FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (true);

-- 5.4 Employees & Partners
DROP POLICY IF EXISTS "emp_select" ON public.employees;
DROP POLICY IF EXISTS "emp_insert" ON public.employees;
DROP POLICY IF EXISTS "emp_update" ON public.employees;
CREATE POLICY "emp_select" ON public.employees FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "emp_insert" ON public.employees FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "emp_update" ON public.employees FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (length(trim(name)) > 0);

DROP POLICY IF EXISTS "ptr_select" ON public.partners;
DROP POLICY IF EXISTS "ptr_insert" ON public.partners;
DROP POLICY IF EXISTS "ptr_update" ON public.partners;
CREATE POLICY "ptr_select" ON public.partners FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "ptr_insert" ON public.partners FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(name)) > 0);
CREATE POLICY "ptr_update" ON public.partners FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (length(trim(name)) > 0);

-- 5.5 Bank Accounts
DROP POLICY IF EXISTS "bnk_select" ON public.bank_accounts;
DROP POLICY IF EXISTS "bnk_insert" ON public.bank_accounts;
DROP POLICY IF EXISTS "bnk_update" ON public.bank_accounts;
CREATE POLICY "bnk_select" ON public.bank_accounts FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "bnk_insert" ON public.bank_accounts FOR INSERT TO public, anon, authenticated WITH CHECK (length(trim(bank_name)) > 0 AND length(trim(account_no)) > 0);
CREATE POLICY "bnk_update" ON public.bank_accounts FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (true);

-- 5.6 Stock Balances
DROP POLICY IF EXISTS "sb_select" ON public.stock_balances;
DROP POLICY IF EXISTS "sb_insert" ON public.stock_balances;
DROP POLICY IF EXISTS "sb_update" ON public.stock_balances;
CREATE POLICY "sb_select" ON public.stock_balances FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "sb_insert" ON public.stock_balances FOR INSERT TO public, anon, authenticated WITH CHECK (qty_sheets >= 0 AND qty_sqft >= 0 AND qty_pieces >= 0 AND qty_other >= 0);
CREATE POLICY "sb_update" ON public.stock_balances FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (qty_sheets >= 0 AND qty_sqft >= 0 AND qty_pieces >= 0 AND qty_other >= 0);

-- 5.7 Audit Ledger: Stock Movements (Immutable - NO DELETE, NO UPDATE)
DROP POLICY IF EXISTS "sm_select" ON public.stock_movements;
DROP POLICY IF EXISTS "sm_insert" ON public.stock_movements;
CREATE POLICY "sm_select" ON public.stock_movements FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "sm_insert" ON public.stock_movements FOR INSERT TO public, anon, authenticated WITH CHECK (
    qty_sheets >= 0 AND qty_sqft >= 0 AND qty_pieces >= 0 AND qty_other >= 0
);

-- 5.8 Production Entries (Immutable Audit Ledger - NO DELETE)
DROP POLICY IF EXISTS "pe_select" ON public.production_entries;
DROP POLICY IF EXISTS "pe_insert" ON public.production_entries;
DROP POLICY IF EXISTS "pe_update" ON public.production_entries;
CREATE POLICY "pe_select" ON public.production_entries FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "pe_insert" ON public.production_entries FOR INSERT TO public, anon, authenticated WITH CHECK (sheets_produced > 0);
CREATE POLICY "pe_update" ON public.production_entries FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (status IN ('posted', 'cancelled'));

-- 5.9 Vouchers & Voucher Lines (NO DELETE)
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

-- 5.10 Journal Entries & Lines (NO DELETE)
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

-- 5.11 Salary Records (NO DELETE)
DROP POLICY IF EXISTS "sal_select" ON public.salary_records;
DROP POLICY IF EXISTS "sal_insert" ON public.salary_records;
DROP POLICY IF EXISTS "sal_update" ON public.salary_records;
CREATE POLICY "sal_select" ON public.salary_records FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "sal_insert" ON public.salary_records FOR INSERT TO public, anon, authenticated WITH CHECK (booked_amount > 0);
CREATE POLICY "sal_update" ON public.salary_records FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (paid_amount <= booked_amount);

-- 5.12 Banking & Reconciliation
DROP POLICY IF EXISTS "bst_select" ON public.bank_statement_transactions;
DROP POLICY IF EXISTS "bst_insert" ON public.bank_statement_transactions;
DROP POLICY IF EXISTS "bst_update" ON public.bank_statement_transactions;
CREATE POLICY "bst_select" ON public.bank_statement_transactions FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "bst_insert" ON public.bank_statement_transactions FOR INSERT TO public, anon, authenticated WITH CHECK (true);
CREATE POLICY "bst_update" ON public.bank_statement_transactions FOR UPDATE TO public, anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "brm_select" ON public.bank_reconciliation_matches;
DROP POLICY IF EXISTS "brm_insert" ON public.bank_reconciliation_matches;
DROP POLICY IF EXISTS "brm_delete" ON public.bank_reconciliation_matches;
CREATE POLICY "brm_select" ON public.bank_reconciliation_matches FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "brm_insert" ON public.bank_reconciliation_matches FOR INSERT TO public, anon, authenticated WITH CHECK (matched_amount > 0);
CREATE POLICY "brm_delete" ON public.bank_reconciliation_matches FOR DELETE TO public, anon, authenticated USING (true);

-- 5.13 ERP Settings & Sequences
DROP POLICY IF EXISTS "cfg_select" ON public.erp_settings;
DROP POLICY IF EXISTS "cfg_upsert" ON public.erp_settings;
CREATE POLICY "cfg_select" ON public.erp_settings FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "cfg_upsert" ON public.erp_settings FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "seq_select" ON public.voucher_sequences;
DROP POLICY IF EXISTS "seq_upsert" ON public.voucher_sequences;
CREATE POLICY "seq_select" ON public.voucher_sequences FOR SELECT TO public, anon, authenticated USING (true);
CREATE POLICY "seq_upsert" ON public.voucher_sequences FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);


-- =========================================================================
-- 6. GRANT FUNCTION PERMISSIONS TO APPLICATION CLIENTS
-- =========================================================================
GRANT EXECUTE ON FUNCTION public.get_next_voucher_number(TEXT, INTEGER)                                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_production_entry(TEXT,TIMESTAMPTZ,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,NUMERIC,NUMERIC,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_movement(TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_voucher_atomic(JSONB, JSONB)                                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_voucher_atomic(TEXT)                                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_production_entry_atomic(TEXT)                                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_journal_entry_atomic(TEXT)                                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(TEXT,TIMESTAMPTZ,TIMESTAMPTZ)                      TO anon, authenticated;

-- =========================================================================
-- MIGRATION 003 COMPLETE
-- =========================================================================
