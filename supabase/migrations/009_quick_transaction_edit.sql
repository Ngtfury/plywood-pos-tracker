-- Atomic editing for Quick Income and Quick Expense bank impacts.
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
    IF v_id IS NULL OR v_type NOT IN ('IN', 'OUT') THEN
        RAISE EXCEPTION 'A valid transaction id and type are required';
    END IF;
    IF COALESCE((p_transaction->>'amount')::NUMERIC, 0) <= 0 THEN
        RAISE EXCEPTION 'Transaction amount must be greater than zero';
    END IF;
    IF v_bank_amount < 0 THEN
        RAISE EXCEPTION 'Bank amount cannot be negative';
    END IF;
    IF v_bank_amount > 0 AND v_new_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'A bank account is required for a bank payment';
    END IF;

    SELECT NULLIF(custom_data->>'bank_account_id', '')
    INTO v_old_bank_account_id
    FROM public.transactions
    WHERE id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction % was not found', v_id;
    END IF;

    IF v_old_bank_account_id IS NOT NULL THEN
        PERFORM 1 FROM public.bank_accounts WHERE id = v_old_bank_account_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'The original bank account no longer exists';
        END IF;
    END IF;
    IF v_new_bank_account_id IS NOT NULL THEN
        PERFORM 1 FROM public.bank_accounts
        WHERE id = v_new_bank_account_id AND is_active
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Selected bank account is not active or does not exist';
        END IF;
    END IF;

    UPDATE public.transactions
    SET type = v_type,
        amount = (p_transaction->>'amount')::NUMERIC,
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

    IF v_old_bank_account_id IS NOT NULL THEN
        PERFORM public.refresh_bank_account_balance(v_old_bank_account_id);
    END IF;
    IF v_new_bank_account_id IS NOT NULL
       AND v_new_bank_account_id IS DISTINCT FROM v_old_bank_account_id THEN
        PERFORM public.refresh_bank_account_balance(v_new_bank_account_id);
    END IF;

    RETURN v_id;
END;
$$;
