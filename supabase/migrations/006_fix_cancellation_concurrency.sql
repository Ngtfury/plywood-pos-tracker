-- Proposed additive correction for 005_plywood_erp_cancellations.sql.
-- Do not apply to a production project without reviewing and testing first.
-- This migration does not touch legacy tables or historical business records.

CREATE OR REPLACE FUNCTION public.cancel_journal_entry_atomic(p_journal_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.journal_entries%ROWTYPE;
BEGIN
  SELECT *
  INTO v_entry
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
    SELECT 1
    FROM public.bank_reconciliation_matches
    WHERE journal_entry_id = p_journal_id
  ) THEN
    RAISE EXCEPTION 'Journal entry % is reconciled and cannot be cancelled', p_journal_id;
  END IF;

  UPDATE public.journal_entries
  SET status = 'cancelled'
  WHERE id = p_journal_id;
END;
$$;
