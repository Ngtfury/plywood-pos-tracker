-- Ensure existing employee tables support the master employee form.
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS join_date DATE NOT NULL DEFAULT CURRENT_DATE;
