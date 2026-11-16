-- Automatic bank balance management for Quick Income and Quick Expenses.
-- Apply after the existing master schema. This migration is idempotent.

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

CREATE INDEX IF NOT EXISTS idx_transactions_bank_account
    ON public.transactions ((custom_data->>'bank_account_id'));

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
    IF v_balance < 0 THEN
        RAISE EXCEPTION 'Bank account % cannot have a negative available balance', p_bank_account_id;
    END IF;

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
        WHERE p_business_entity_id IS NULL OR b.business_entity_id = p_business_entity_id
        FOR UPDATE
    LOOP
        PERFORM public.refresh_bank_account_balance(v_account_id);
    END LOOP;

    RETURN QUERY
    SELECT b.id, b.business_entity_id, b.bank_name, b.account_no,
           b.branch_name,
           b.ifsc, b.opening_balance, b.current_balance, b.is_active,
           be.name AS business_entity_name
    FROM public.bank_accounts b
    LEFT JOIN public.business_entities be ON be.id = b.business_entity_id
    WHERE p_business_entity_id IS NULL OR b.business_entity_id = p_business_entity_id
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
        notes, reference, custom_data
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
        COALESCE(p_transaction->'custom_data', '{}'::JSONB)
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

CREATE OR REPLACE FUNCTION public.delete_transactions_atomic(p_ids TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bank_account_id TEXT;
BEGIN
    FOR v_bank_account_id IN
        SELECT DISTINCT NULLIF(t.custom_data->>'bank_account_id', '')
        FROM public.transactions t
        WHERE t.id = ANY(p_ids)
          AND NULLIF(t.custom_data->>'bank_account_id', '') IS NOT NULL
    LOOP
        PERFORM 1 FROM public.bank_accounts WHERE id = v_bank_account_id FOR UPDATE;
        DELETE FROM public.transactions WHERE id = ANY(p_ids);
        PERFORM public.refresh_bank_account_balance(v_bank_account_id);
    END LOOP;

    DELETE FROM public.transactions WHERE id = ANY(p_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_bank_account(p_bank_account_id TEXT)
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
        RAISE EXCEPTION 'Bank account has financial history and cannot be deleted. Deactivate it instead.';
    END IF;

    DELETE FROM public.bank_accounts WHERE id = p_bank_account_id;
END;
$$;

-- =========================================================================
