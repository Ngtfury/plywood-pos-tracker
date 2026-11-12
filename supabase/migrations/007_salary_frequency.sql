-- Add salary frequency without changing the existing salary workflow.
ALTER TABLE public.salary_records
  ADD COLUMN IF NOT EXISTS salary_frequency TEXT NOT NULL DEFAULT 'monthly';

UPDATE public.salary_records
SET salary_frequency = 'monthly'
WHERE salary_frequency IS NULL OR salary_frequency = '';

ALTER TABLE public.salary_records
  DROP CONSTRAINT IF EXISTS chk_salary_frequency;

ALTER TABLE public.salary_records
  ADD CONSTRAINT chk_salary_frequency
  CHECK (salary_frequency IN ('monthly', 'weekly'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'salary_records'
      AND column_name = 'salary_period_start'
  ) THEN
    ALTER TABLE public.salary_records ALTER COLUMN salary_period_start DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'salary_records'
      AND column_name = 'salary_period_end'
  ) THEN
    ALTER TABLE public.salary_records ALTER COLUMN salary_period_end DROP NOT NULL;
  END IF;
END;
$$;

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
