-- Additive follow-up for 004_plywood_erp_mvp.sql.
-- Does not modify legacy tables or historical business records.

CREATE OR REPLACE FUNCTION public.cancel_voucher_atomic(p_voucher_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voucher vouchers%ROWTYPE;
  v_move stock_movements%ROWTYPE;
BEGIN
  SELECT * INTO v_voucher
  FROM public.vouchers
  WHERE id = p_voucher_id
  FOR UPDATE;

  IF v_voucher.id IS NULL THEN
    RAISE EXCEPTION 'Voucher % not found', p_voucher_id;
  END IF;
  IF v_voucher.status = 'cancelled' THEN
    RAISE EXCEPTION 'Voucher % is already cancelled', p_voucher_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bank_reconciliation_matches
    WHERE voucher_id = p_voucher_id
  ) THEN
    RAISE EXCEPTION 'Voucher % is reconciled and cannot be cancelled', p_voucher_id;
  END IF;

  FOR v_move IN
    SELECT * FROM public.stock_movements
    WHERE reference_id = p_voucher_id AND reference_type = 'voucher'
  LOOP
    PERFORM public.post_stock_movement(
      v_move.business_entity_id,
      v_move.product_id,
      v_move.variant_id,
      CASE
        WHEN v_move.movement_type IN ('sale', 'production_out', 'transfer_out', 'adjustment_out')
          THEN 'adjustment_in'
        ELSE 'adjustment_out'
      END,
      v_move.qty_sheets,
      v_move.qty_sqft,
      v_move.qty_pieces,
      v_move.qty_other,
      p_voucher_id,
      'voucher_cancellation',
      'Reversal of cancelled voucher ' || v_voucher.voucher_number,
      now(),
      v_move.unit_cost
    );
  END LOOP;

  IF v_voucher.journal_entry_id IS NOT NULL THEN
    UPDATE public.journal_entries
    SET status = 'cancelled'
    WHERE id = v_voucher.journal_entry_id;
  END IF;

  UPDATE public.vouchers
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_voucher_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_production_entry_atomic(p_production_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry production_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_entry
  FROM public.production_entries
  WHERE id = p_production_id
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'Production entry % not found', p_production_id;
  END IF;
  IF v_entry.status = 'cancelled' THEN
    RAISE EXCEPTION 'Production entry % is already cancelled', p_production_id;
  END IF;

  PERFORM public.post_stock_movement(
    v_entry.business_entity_id, v_entry.plywood_product_id,
    v_entry.plywood_variant_id, 'adjustment_out',
    v_entry.sheets_produced, v_entry.sqft_produced, 0, 0,
    p_production_id, 'production_cancellation',
    'Reversal of cancelled production', now()
  );
  PERFORM public.post_stock_movement(
    v_entry.business_entity_id, v_entry.face_veneer_product_id,
    NULL, 'adjustment_in',
    0, 0, v_entry.face_veneer_consumed, 0,
    p_production_id, 'production_cancellation',
    'Restore face veneer from cancelled production', now()
  );

  UPDATE public.production_entries
  SET status = 'cancelled'
  WHERE id = p_production_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_journal_entry_atomic(p_journal_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = p_journal_id) THEN
    RAISE EXCEPTION 'Journal entry % not found', p_journal_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bank_reconciliation_matches
    WHERE journal_entry_id = p_journal_id
  ) THEN
    RAISE EXCEPTION 'Journal entry % is reconciled and cannot be cancelled', p_journal_id;
  END IF;
  UPDATE public.journal_entries
  SET status = 'cancelled'
  WHERE id = p_journal_id AND status = 'posted';
END;
$$;
