-- Atomically validate and refresh bank balances when salary is disbursed.
CREATE OR REPLACE FUNCTION public.post_salary_payment(
    p_record_id TEXT,
    p_amount NUMERIC,
    p_method TEXT,
    p_bank_id TEXT,
    p_reference TEXT,
    p_date TIMESTAMPTZ,
    p_cash_account TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.salary_records%ROWTYPE;
    jid TEXT;
BEGIN
    SELECT * INTO r
    FROM public.salary_records
    WHERE id = p_record_id
    FOR UPDATE;

    IF r.id IS NULL OR p_amount <= 0 OR (r.paid_amount + p_amount) > r.booked_amount THEN
        RAISE EXCEPTION 'Invalid salary payment amount or record not found';
    END IF;

    IF p_method IN ('bank', 'upi') THEN
        IF p_bank_id IS NULL THEN
            RAISE EXCEPTION 'A bank account is required for this payment method';
        END IF;
        PERFORM 1
        FROM public.bank_accounts
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
    SET paid_amount = paid_amount + p_amount,
        status = CASE WHEN (paid_amount + p_amount) >= booked_amount THEN 'paid' ELSE 'partial' END,
        payment_method = p_method,
        bank_account_id = p_bank_id,
        payment_reference = p_reference,
        payment_date = p_date,
        payment_journal_id = jid
    WHERE id = p_record_id;

    IF p_bank_id IS NOT NULL THEN
        PERFORM public.refresh_bank_account_balance(p_bank_id);
    END IF;
END;
$$;
