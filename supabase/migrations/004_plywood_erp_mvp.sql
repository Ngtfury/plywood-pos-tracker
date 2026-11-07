-- Plywood ERP MVP, additive migration.
-- Apply after supabase_schema.sql. This file never drops, recreates, truncates,
-- or backfills the legacy tables: categories, entities, custom_fields,
-- transactions, and credit_payments.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.business_entities (
  id TEXT PRIMARY KEY DEFAULT 'be_' || gen_random_uuid()::text,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'company' CHECK (entity_type IN ('company','branch')),
  parent_id TEXT REFERENCES public.business_entities(id) ON DELETE SET NULL,
  address TEXT, phone TEXT, gstin TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  sub_type TEXT,
  parent_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY DEFAULT 'prod_' || gen_random_uuid()::text,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('plywood','wood','face_veneer','other_veneer','gum_resin','other')),
  unit TEXT NOT NULL DEFAULT 'pieces',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id TEXT PRIMARY KEY DEFAULT 'pv_' || gen_random_uuid()::text,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size TEXT CHECK (size IN ('8x4','7x4','6x4','6x3','5x4','5x3')),
  thickness NUMERIC(6,2) CHECK (thickness IS NULL OR thickness IN (25,18,16,12,9,6)),
  sqft_per_sheet NUMERIC(8,4),
  sku TEXT,
  unit TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employees (
  id TEXT PRIMARY KEY DEFAULT 'emp_' || gen_random_uuid()::text,
  name TEXT NOT NULL, designation TEXT, phone TEXT,
  bank_account_no TEXT, ifsc TEXT,
  monthly_salary NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partners (
  id TEXT PRIMARY KEY DEFAULT 'ptr_' || gen_random_uuid()::text,
  name TEXT NOT NULL, phone TEXT, address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id TEXT PRIMARY KEY DEFAULT 'bnk_' || gen_random_uuid()::text,
  business_entity_id TEXT REFERENCES public.business_entities(id) ON DELETE SET NULL,
  bank_name TEXT NOT NULL, account_no TEXT NOT NULL, ifsc TEXT, branch_name TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_balances (
  id TEXT PRIMARY KEY DEFAULT 'sb_' || gen_random_uuid()::text,
  business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  qty_sheets NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_sqft NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_pieces NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_other NUMERIC(14,4) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (qty_sheets >= 0 AND qty_sqft >= 0 AND qty_pieces >= 0 AND qty_other >= 0)
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id TEXT PRIMARY KEY DEFAULT 'sm_' || gen_random_uuid()::text,
  business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id TEXT REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN
    ('purchase','sale','production_in','production_out','adjustment_in','adjustment_out','transfer_in','transfer_out')),
  qty_sheets NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_sqft NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_pieces NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_other NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  reference_id TEXT, reference_type TEXT, narration TEXT,
  movement_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_entries (
  id TEXT PRIMARY KEY DEFAULT 'pe_' || gen_random_uuid()::text,
  business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE RESTRICT,
  production_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  plywood_product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  plywood_variant_id TEXT REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  sheets_produced NUMERIC(14,4) NOT NULL CHECK (sheets_produced > 0),
  sqft_produced NUMERIC(14,4) NOT NULL CHECK (sqft_produced > 0),
  face_veneer_product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  face_veneer_ratio NUMERIC(8,4) NOT NULL DEFAULT 2 CHECK (face_veneer_ratio > 0),
  face_veneer_consumed NUMERIC(14,4) NOT NULL CHECK (face_veneer_consumed > 0),
  plywood_movement_id TEXT, veneer_movement_id TEXT,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','cancelled')),
  notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vouchers (
  id TEXT PRIMARY KEY DEFAULT 'vch_' || gen_random_uuid()::text,
  business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE RESTRICT,
  voucher_type TEXT NOT NULL CHECK (voucher_type IN ('sales','purchase','payment','receipt','expense')),
  voucher_number TEXT NOT NULL, voucher_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  party_entity_id TEXT REFERENCES public.entities(id) ON DELETE SET NULL,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_due NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid','partial','unpaid')),
  payment_method TEXT CHECK (payment_method IN ('cash','bank','upi','credit','mixed')),
  bank_account_id TEXT REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  reference TEXT, narration TEXT,
  source_transaction_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL,
  journal_entry_id TEXT, status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (abs(total_amount - subtotal - tax_amount) <= 0.05),
  CHECK (abs(total_amount - paid_amount - balance_due) <= 0.05)
);

CREATE TABLE IF NOT EXISTS public.voucher_lines (
  id TEXT PRIMARY KEY DEFAULT 'vl_' || gen_random_uuid()::text,
  voucher_id TEXT NOT NULL REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  line_no INTEGER NOT NULL, product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id TEXT REFERENCES public.product_variants(id) ON DELETE SET NULL,
  description TEXT, unit TEXT,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  quantity_sqft NUMERIC(14,4) CHECK (quantity_sqft IS NULL OR quantity_sqft >= 0),
  rate NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  tax_percent NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  debit_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
  credit_account_id TEXT REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id TEXT PRIMARY KEY DEFAULT 'je_' || gen_random_uuid()::text,
  business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE RESTRICT,
  entry_date TIMESTAMPTZ NOT NULL DEFAULT now(), reference TEXT, narration TEXT NOT NULL,
  total_debit NUMERIC(14,2) NOT NULL, total_credit NUMERIC(14,2) NOT NULL,
  is_balanced BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (total_debit = total_credit)
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id TEXT PRIMARY KEY DEFAULT 'jl_' || gen_random_uuid()::text,
  journal_id TEXT NOT NULL REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  debit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  narration TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
);

CREATE TABLE IF NOT EXISTS public.salary_records (
  id TEXT PRIMARY KEY DEFAULT 'sal_' || gen_random_uuid()::text,
  business_entity_id TEXT NOT NULL REFERENCES public.business_entities(id) ON DELETE RESTRICT,
  voucher_date TIMESTAMPTZ NOT NULL DEFAULT now(), salary_month TEXT NOT NULL,
  payee_type TEXT NOT NULL CHECK (payee_type IN ('employee','partner')),
  employee_id TEXT REFERENCES public.employees(id) ON DELETE SET NULL,
  partner_id TEXT REFERENCES public.partners(id) ON DELETE SET NULL,
  payee_name TEXT NOT NULL, booked_amount NUMERIC(14,2) NOT NULL CHECK (booked_amount > 0),
  expense_account_id TEXT NOT NULL REFERENCES public.accounts(id),
  payable_account_id TEXT NOT NULL REFERENCES public.accounts(id),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  pending_amount NUMERIC(14,2) GENERATED ALWAYS AS (booked_amount - paid_amount) STORED,
  payment_method TEXT, bank_account_id TEXT REFERENCES public.bank_accounts(id),
  payment_reference TEXT, payment_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','partial','paid','cancelled')),
  narration TEXT, booking_journal_id TEXT, payment_journal_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (paid_amount <= booked_amount)
);

CREATE TABLE IF NOT EXISTS public.bank_statement_transactions (
  id TEXT PRIMARY KEY DEFAULT 'bst_' || gen_random_uuid()::text,
  bank_account_id TEXT NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  txn_date TIMESTAMPTZ NOT NULL, description TEXT,
  debit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2), reference TEXT, is_matched BOOLEAN NOT NULL DEFAULT false,
  import_batch TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_reconciliation_matches (
  id TEXT PRIMARY KEY DEFAULT 'brm_' || gen_random_uuid()::text,
  bank_statement_txn_id TEXT NOT NULL REFERENCES public.bank_statement_transactions(id) ON DELETE RESTRICT,
  voucher_id TEXT REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  salary_record_id TEXT REFERENCES public.salary_records(id) ON DELETE RESTRICT,
  journal_entry_id TEXT REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  matched_amount NUMERIC(14,2) NOT NULL CHECK (matched_amount > 0),
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((voucher_id IS NOT NULL)::int + (salary_record_id IS NOT NULL)::int + (journal_entry_id IS NOT NULL)::int = 1)
);

CREATE TABLE IF NOT EXISTS public.erp_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.voucher_sequences (
  id TEXT PRIMARY KEY, last_number INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_balance_variant ON public.stock_balances(business_entity_id, product_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_balance_product ON public.stock_balances(business_entity_id, product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_number ON public.vouchers(business_entity_id, voucher_type, voucher_number);
CREATE INDEX IF NOT EXISTS ix_stock_movements_ref ON public.stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS ix_voucher_lines_voucher ON public.voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS ix_journal_lines_journal ON public.journal_lines(journal_id);

INSERT INTO public.accounts(id,name,account_type,sub_type,is_system) VALUES
('acc_cash','Cash in Hand','asset','cash',true),
('acc_bank','Bank Accounts','asset','bank',true),
('acc_receivable','Accounts Receivable','asset','receivable',true),
('acc_payable','Accounts Payable','liability','payable',true),
('acc_salary_payable','Salary Payable','liability','payable',true),
('acc_stock_plywood','Plywood Inventory','asset','inventory',true),
('acc_stock_wood','Wood Inventory','asset','inventory',true),
('acc_stock_face_veneer','Face Veneer Inventory','asset','inventory',true),
('acc_stock_other_veneer','Other Veneer Inventory','asset','inventory',true),
('acc_stock_gum','Gum/Resin Inventory','asset','inventory',true),
('acc_sales','Sales Revenue','income','sales',true),
('acc_purchase','Purchases','asset','inventory',true),
('acc_cogs','Cost of Goods Sold','expense','cogs',true),
('acc_salary_expense','Salary Expense','expense','salary',true),
('acc_partner_remun','Partner Remuneration','expense','salary',true),
('acc_misc_expense','Miscellaneous Expense','expense','expense',true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products(id,name,category,unit) VALUES
('prod_plywood','Plywood','plywood','sheets'),
('prod_face_veneer','Face Veneer','face_veneer','pieces'),
('prod_wood','Wood','wood','sqft'),
('prod_other_veneer','Other Veneer','other_veneer','pieces'),
('prod_gum','Gum/Resin','gum_resin','kg')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.product_variants(product_id,size,thickness,sqft_per_sheet,sku)
SELECT 'prod_plywood', v.size, v.thickness, v.sqft, 'PLY-' || v.size || '-' || v.thickness
FROM (VALUES
('8x4',25,32),('8x4',18,32),('8x4',16,32),('8x4',12,32),('8x4',9,32),('8x4',6,32),
('7x4',25,28),('7x4',18,28),('7x4',16,28),('7x4',12,28),('7x4',9,28),('7x4',6,28),
('6x4',25,24),('6x4',18,24),('6x4',16,24),('6x4',12,24),('6x4',9,24),('6x4',6,24),
('6x3',25,18),('6x3',18,18),('6x3',16,18),('6x3',12,18),('6x3',9,18),('6x3',6,18),
('5x4',25,20),('5x4',18,20),('5x4',16,20),('5x4',12,20),('5x4',9,20),('5x4',6,20),
('5x3',25,15),('5x3',18,15),('5x3',16,15),('5x3',12,15),('5x3',9,15),('5x3',6,15)
) AS v(size,thickness,sqft)
WHERE NOT EXISTS (SELECT 1 FROM public.product_variants p WHERE p.sku = 'PLY-' || v.size || '-' || v.thickness);

CREATE OR REPLACE FUNCTION public.get_next_voucher_number(p_prefix TEXT, p_year INTEGER DEFAULT EXTRACT(YEAR FROM now())::int)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO voucher_sequences(id,last_number) VALUES (p_prefix || '-' || p_year, 1)
  ON CONFLICT(id) DO UPDATE SET last_number = voucher_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO n;
  RETURN p_prefix || '-' || p_year || '-' || lpad(n::text,4,'0');
END $$;

CREATE OR REPLACE FUNCTION public.post_stock_movement(
  p_business_entity_id TEXT, p_product_id TEXT, p_variant_id TEXT, p_movement_type TEXT,
  p_qty_sheets NUMERIC DEFAULT 0, p_qty_sqft NUMERIC DEFAULT 0, p_qty_pieces NUMERIC DEFAULT 0,
  p_qty_other NUMERIC DEFAULT 0, p_reference_id TEXT DEFAULT NULL, p_reference_type TEXT DEFAULT NULL,
  p_narration TEXT DEFAULT NULL, p_movement_date TIMESTAMPTZ DEFAULT now(), p_unit_cost NUMERIC DEFAULT 0)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b stock_balances%ROWTYPE; dir INT; id TEXT := 'sm_' || gen_random_uuid()::text;
BEGIN
  IF p_qty_sheets < 0 OR p_qty_sqft < 0 OR p_qty_pieces < 0 OR p_qty_other < 0
     OR p_qty_sheets + p_qty_sqft + p_qty_pieces + p_qty_other <= 0 THEN
    RAISE EXCEPTION 'Stock quantities must be positive';
  END IF;
  IF p_movement_type IN ('purchase','production_in','adjustment_in','transfer_in') THEN dir := 1;
  ELSIF p_movement_type IN ('sale','production_out','adjustment_out','transfer_out') THEN dir := -1;
  ELSE RAISE EXCEPTION 'Invalid movement type'; END IF;
  SELECT * INTO b FROM stock_balances WHERE business_entity_id=p_business_entity_id
    AND product_id=p_product_id AND variant_id IS NOT DISTINCT FROM p_variant_id FOR UPDATE;
  IF dir = -1 AND (b.id IS NULL OR b.qty_sheets < p_qty_sheets OR b.qty_sqft < p_qty_sqft
    OR b.qty_pieces < p_qty_pieces OR b.qty_other < p_qty_other) THEN
    RAISE EXCEPTION 'Insufficient stock for product %', p_product_id;
  END IF;
  IF b.id IS NULL THEN
    INSERT INTO stock_balances(business_entity_id,product_id,variant_id,qty_sheets,qty_sqft,qty_pieces,qty_other,avg_cost)
    VALUES(p_business_entity_id,p_product_id,p_variant_id,dir*p_qty_sheets,dir*p_qty_sqft,dir*p_qty_pieces,dir*p_qty_other,p_unit_cost);
  ELSE
    UPDATE stock_balances SET qty_sheets=qty_sheets+dir*p_qty_sheets, qty_sqft=qty_sqft+dir*p_qty_sqft,
      qty_pieces=qty_pieces+dir*p_qty_pieces, qty_other=qty_other+dir*p_qty_other,
      avg_cost=CASE WHEN dir=1 AND p_unit_cost>0 THEN p_unit_cost ELSE avg_cost END, updated_at=now() WHERE id=b.id;
  END IF;
  INSERT INTO stock_movements(id,business_entity_id,product_id,variant_id,movement_type,qty_sheets,qty_sqft,qty_pieces,qty_other,unit_cost,reference_id,reference_type,narration,movement_date)
  VALUES(id,p_business_entity_id,p_product_id,p_variant_id,p_movement_type,p_qty_sheets,p_qty_sqft,p_qty_pieces,p_qty_other,p_unit_cost,p_reference_id,p_reference_type,p_narration,p_movement_date);
  RETURN id;
END $$;

CREATE OR REPLACE FUNCTION public.post_journal_entry(
  p_business_entity_id TEXT, p_entry_date TIMESTAMPTZ, p_reference TEXT, p_narration TEXT, p_lines JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE jid TEXT := 'je_' || gen_random_uuid()::text; l JSONB; debit NUMERIC := 0; credit NUMERIC := 0;
BEGIN
  IF jsonb_array_length(p_lines) < 2 THEN RAISE EXCEPTION 'Journal needs at least two lines'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    debit := debit + COALESCE((l->>'debit_amount')::numeric,0);
    credit := credit + COALESCE((l->>'credit_amount')::numeric,0);
  END LOOP;
  IF debit <= 0 OR abs(debit-credit) > 0.005 THEN RAISE EXCEPTION 'Journal is unbalanced'; END IF;
  INSERT INTO journal_entries(id,business_entity_id,entry_date,reference,narration,total_debit,total_credit,is_balanced)
  VALUES(jid,p_business_entity_id,p_entry_date,p_reference,p_narration,round(debit,2),round(credit,2),true);
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO journal_lines(journal_id,account_id,debit_amount,credit_amount,narration)
    VALUES(jid,l->>'account_id',COALESCE((l->>'debit_amount')::numeric,0),COALESCE((l->>'credit_amount')::numeric,0),l->>'narration');
  END LOOP;
  RETURN jid;
END $$;

CREATE OR REPLACE FUNCTION public.post_production_entry(
  p_business_entity_id TEXT, p_production_date TIMESTAMPTZ, p_plywood_product_id TEXT,
  p_plywood_variant_id TEXT, p_sheets_produced NUMERIC, p_sqft_produced NUMERIC,
  p_face_veneer_product_id TEXT, p_face_veneer_ratio NUMERIC DEFAULT 2,
  p_face_veneer_consumed NUMERIC DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id TEXT := 'pe_' || gen_random_uuid()::text; consumed NUMERIC := round(p_sheets_produced * p_face_veneer_ratio,4);
  vmove TEXT; pmove TEXT;
BEGIN
  IF p_face_veneer_consumed IS NOT NULL AND abs(p_face_veneer_consumed-consumed)>0.001 THEN RAISE EXCEPTION 'Invalid veneer consumption'; END IF;
  INSERT INTO production_entries(id,business_entity_id,production_date,plywood_product_id,plywood_variant_id,sheets_produced,sqft_produced,face_veneer_product_id,face_veneer_ratio,face_veneer_consumed,notes)
  VALUES(v_id,p_business_entity_id,p_production_date,p_plywood_product_id,p_plywood_variant_id,p_sheets_produced,p_sqft_produced,p_face_veneer_product_id,p_face_veneer_ratio,consumed,p_notes);
  vmove := post_stock_movement(p_business_entity_id,p_face_veneer_product_id,NULL,'production_out',0,0,consumed,0,v_id,'production','Face veneer consumed',p_production_date);
  pmove := post_stock_movement(p_business_entity_id,p_plywood_product_id,p_plywood_variant_id,'production_in',p_sheets_produced,p_sqft_produced,0,0,v_id,'production','Plywood produced',p_production_date);
  UPDATE production_entries SET veneer_movement_id=vmove, plywood_movement_id=pmove WHERE production_entries.id=v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.post_voucher_atomic(p_voucher JSONB, p_lines JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id TEXT := COALESCE(p_voucher->>'id','vch_' || gen_random_uuid()::text); jid TEXT; l JSONB;
  typ TEXT := p_voucher->>'voucher_type'; total NUMERIC := COALESCE((p_voucher->>'total_amount')::numeric,0);
  paid NUMERIC := COALESCE((p_voucher->>'paid_amount')::numeric,0); due NUMERIC := COALESCE((p_voucher->>'balance_due')::numeric,0);
  biz TEXT := p_voucher->>'business_entity_id'; party TEXT := p_voucher->>'party_entity_id';
  cash TEXT := CASE WHEN p_voucher->>'payment_method' IN ('bank','upi') THEN 'acc_bank' ELSE 'acc_cash' END;
  lines_json JSONB := '[]'::jsonb; cogs NUMERIC := 0; prod TEXT; var TEXT; qty NUMERIC; sqft NUMERIC; cost NUMERIC; category TEXT;
BEGIN
  IF typ NOT IN ('sales','purchase','payment','receipt','expense') OR biz IS NULL THEN RAISE EXCEPTION 'Invalid voucher'; END IF;
  IF total < 0 OR paid < 0 OR due < 0 OR abs(total-paid-due)>0.05 THEN RAISE EXCEPTION 'Invalid settlement'; END IF;
  IF EXISTS(SELECT 1 FROM vouchers WHERE business_entity_id=biz AND voucher_type=typ AND voucher_number=p_voucher->>'voucher_number') THEN
    RAISE EXCEPTION 'Duplicate voucher number'; END IF;
  INSERT INTO vouchers(id,business_entity_id,voucher_type,voucher_number,voucher_date,party_entity_id,subtotal,tax_amount,total_amount,paid_amount,balance_due,payment_status,payment_method,bank_account_id,reference,narration,source_transaction_id)
  VALUES(v_id,biz,typ,p_voucher->>'voucher_number',COALESCE((p_voucher->>'voucher_date')::timestamptz,now()),party,COALESCE((p_voucher->>'subtotal')::numeric,0),COALESCE((p_voucher->>'tax_amount')::numeric,0),total,paid,due,COALESCE(p_voucher->>'payment_status','unpaid'),p_voucher->>'payment_method',p_voucher->>'bank_account_id',p_voucher->>'reference',p_voucher->>'narration',p_voucher->>'source_transaction_id');
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    prod := l->>'product_id'; var := NULLIF(l->>'variant_id',''); qty := COALESCE((l->>'quantity')::numeric,0); sqft := COALESCE((l->>'quantity_sqft')::numeric,0);
    cost := COALESCE((l->>'unit_cost')::numeric,0);
    SELECT p.category INTO category FROM products p WHERE p.id = prod;
    INSERT INTO voucher_lines(voucher_id,line_no,product_id,variant_id,description,unit,quantity,quantity_sqft,rate,tax_percent,tax_amount,line_total,unit_cost,debit_account_id,credit_account_id)
    VALUES(v_id,COALESCE((l->>'line_no')::int,1),prod,var,l->>'description',l->>'unit',qty,NULLIF(sqft,0),COALESCE((l->>'rate')::numeric,0),COALESCE((l->>'tax_percent')::numeric,0),COALESCE((l->>'tax_amount')::numeric,0),COALESCE((l->>'line_total')::numeric,0),cost,l->>'debit_account_id',l->>'credit_account_id');
    IF typ='purchase' AND prod IS NOT NULL THEN
      IF category IN ('face_veneer','other_veneer') THEN
        PERFORM post_stock_movement(biz,prod,NULL,'purchase',0,0,qty,0,v_id,'voucher','Purchase ' || (p_voucher->>'voucher_number'),p_voucher->>'voucher_date',cost);
      ELSIF category IN ('wood','gum_resin','other') THEN
        PERFORM post_stock_movement(biz,prod,NULL,'purchase',0,0,0,qty,v_id,'voucher','Purchase ' || (p_voucher->>'voucher_number'),p_voucher->>'voucher_date',cost);
      ELSE
        PERFORM post_stock_movement(biz,prod,var,'purchase',qty,sqft,0,0,v_id,'voucher','Purchase ' || (p_voucher->>'voucher_number'),p_voucher->>'voucher_date',cost);
      END IF;
    ELSIF typ='sales' AND prod IS NOT NULL THEN
      SELECT avg_cost INTO cost FROM stock_balances WHERE business_entity_id=biz AND product_id=prod AND variant_id IS NOT DISTINCT FROM var FOR UPDATE;
      cogs := cogs + qty * GREATEST(cost,0);
      IF category IN ('face_veneer','other_veneer') THEN
        PERFORM post_stock_movement(biz,prod,NULL,'sale',0,0,qty,0,v_id,'voucher','Sale ' || (p_voucher->>'voucher_number'),p_voucher->>'voucher_date',cost);
      ELSIF category IN ('wood','gum_resin','other') THEN
        PERFORM post_stock_movement(biz,prod,NULL,'sale',0,0,0,qty,v_id,'voucher','Sale ' || (p_voucher->>'voucher_number'),p_voucher->>'voucher_date',cost);
      ELSE
        PERFORM post_stock_movement(biz,prod,var,'sale',qty,sqft,0,0,v_id,'voucher','Sale ' || (p_voucher->>'voucher_number'),p_voucher->>'voucher_date',cost);
      END IF;
    END IF;
  END LOOP;
  IF typ='sales' THEN
    lines_json := jsonb_build_array(
      jsonb_build_object('account_id',cash,'debit_amount',paid,'credit_amount',0,'narration','Sale collection'),
      jsonb_build_object('account_id','acc_receivable','debit_amount',due,'credit_amount',0,'narration','Sale receivable'),
      jsonb_build_object('account_id','acc_sales','debit_amount',0,'credit_amount',total,'narration','Sales revenue'),
      jsonb_build_object('account_id','acc_cogs','debit_amount',cogs,'credit_amount',0,'narration','Cost of goods sold'),
      jsonb_build_object('account_id','acc_purchase','debit_amount',0,'credit_amount',cogs,'narration','Inventory relieved'));
  ELSIF typ='purchase' THEN
    lines_json := jsonb_build_array(jsonb_build_object('account_id','acc_purchase','debit_amount',total,'credit_amount',0,'narration','Inventory purchase'),jsonb_build_object('account_id',cash,'debit_amount',0,'credit_amount',paid,'narration','Purchase paid'),jsonb_build_object('account_id','acc_payable','debit_amount',0,'credit_amount',due,'narration','Supplier payable'));
  ELSIF typ='receipt' THEN
    lines_json := jsonb_build_array(jsonb_build_object('account_id',cash,'debit_amount',total,'credit_amount',0,'narration','Customer receipt'),jsonb_build_object('account_id','acc_receivable','debit_amount',0,'credit_amount',total,'narration','Receivable settled'));
  ELSIF typ='payment' THEN
    lines_json := jsonb_build_array(jsonb_build_object('account_id','acc_payable','debit_amount',total,'credit_amount',0,'narration','Supplier payable settled'),jsonb_build_object('account_id',cash,'debit_amount',0,'credit_amount',total,'narration','Payment made'));
  ELSE
    lines_json := jsonb_build_array(jsonb_build_object('account_id','acc_misc_expense','debit_amount',total,'credit_amount',0,'narration','Expense'),jsonb_build_object('account_id',cash,'debit_amount',0,'credit_amount',total,'narration','Expense paid'));
  END IF;
  jid := post_journal_entry(biz,COALESCE((p_voucher->>'voucher_date')::timestamptz,now()),v_id,COALESCE(p_voucher->>'narration',typ),lines_json);
  UPDATE vouchers SET journal_entry_id=jid WHERE vouchers.id=v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.post_salary_booking(p_record JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id TEXT := COALESCE(p_record->>'id','sal_' || gen_random_uuid()::text); jid TEXT; biz TEXT := p_record->>'business_entity_id'; amt NUMERIC := (p_record->>'booked_amount')::numeric;
BEGIN
  jid := post_journal_entry(biz,(p_record->>'voucher_date')::timestamptz,v_id,'Salary booking',jsonb_build_array(jsonb_build_object('account_id',p_record->>'expense_account_id','debit_amount',amt,'credit_amount',0),jsonb_build_object('account_id',p_record->>'payable_account_id','debit_amount',0,'credit_amount',amt)));
  INSERT INTO salary_records(id,business_entity_id,voucher_date,salary_month,payee_type,employee_id,partner_id,payee_name,booked_amount,expense_account_id,payable_account_id,booking_journal_id,narration)
  VALUES(v_id,biz,(p_record->>'voucher_date')::timestamptz,p_record->>'salary_month',p_record->>'payee_type',NULLIF(p_record->>'employee_id',''),NULLIF(p_record->>'partner_id',''),p_record->>'payee_name',amt,p_record->>'expense_account_id',p_record->>'payable_account_id',jid,p_record->>'narration');
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.post_salary_payment(p_record_id TEXT,p_amount NUMERIC,p_method TEXT,p_bank_id TEXT,p_reference TEXT,p_date TIMESTAMPTZ,p_cash_account TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r salary_records%ROWTYPE; jid TEXT;
BEGIN
  SELECT * INTO r FROM salary_records WHERE id=p_record_id FOR UPDATE;
  IF r.id IS NULL OR p_amount <= 0 OR r.paid_amount+p_amount > r.booked_amount THEN RAISE EXCEPTION 'Invalid salary payment'; END IF;
  jid := post_journal_entry(r.business_entity_id,p_date,p_record_id,'Salary payment',jsonb_build_array(jsonb_build_object('account_id',r.payable_account_id,'debit_amount',p_amount,'credit_amount',0),jsonb_build_object('account_id',p_cash_account,'debit_amount',0,'credit_amount',p_amount)));
  UPDATE salary_records SET paid_amount=paid_amount+p_amount,status=CASE WHEN paid_amount+p_amount=booked_amount THEN 'paid' ELSE 'partial' END,payment_method=p_method,bank_account_id=p_bank_id,payment_reference=p_reference,payment_date=p_date,payment_journal_id=jid WHERE id=p_record_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_trial_balance(p_business_entity_id TEXT,p_from_date TIMESTAMPTZ DEFAULT '2000-01-01',p_to_date TIMESTAMPTZ DEFAULT now())
RETURNS TABLE(account_id TEXT,account_name TEXT,account_type TEXT,total_debit NUMERIC,total_credit NUMERIC,net_balance NUMERIC)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
SELECT a.id,a.name,a.account_type,COALESCE(sum(l.debit_amount),0),COALESCE(sum(l.credit_amount),0),COALESCE(sum(l.debit_amount),0)-COALESCE(sum(l.credit_amount),0)
FROM accounts a LEFT JOIN journal_lines l ON l.account_id=a.id
LEFT JOIN journal_entries j ON j.id=l.journal_id
WHERE a.is_active AND (j.id IS NULL OR (j.business_entity_id=p_business_entity_id AND j.status='posted' AND j.entry_date BETWEEN p_from_date AND p_to_date))
GROUP BY a.id,a.name,a.account_type HAVING sum(l.debit_amount) IS NOT NULL OR sum(l.credit_amount) IS NOT NULL ORDER BY a.account_type,a.name
$$;

-- =========================================
-- ERP TABLE RLS POLICIES
-- Same policy pattern as existing POS schema
-- =========================================

DO $$
DECLARE
    tbl TEXT;
    erp_tables TEXT[] := ARRAY[
        'business_entities',
        'accounts',
        'products',
        'product_variants',
        'employees',
        'partners',
        'bank_accounts',
        'stock_balances',
        'stock_movements',
        'production_entries',
        'vouchers',
        'voucher_lines',
        'journal_entries',
        'journal_lines',
        'salary_records',
        'bank_statement_transactions',
        'bank_reconciliation_matches',
        'erp_settings',
        'voucher_sequences'
    ];
BEGIN
    FOREACH tbl IN ARRAY erp_tables LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
            tbl
        );

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'Allow public all access on ' || tbl,
            tbl
        );

        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             FOR ALL TO public, anon, authenticated
             USING (true) WITH CHECK (true)',
            'Allow public all access on ' || tbl,
            tbl
        );
    END LOOP;
END $$;
