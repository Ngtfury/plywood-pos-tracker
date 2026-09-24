import { getSupabase } from '../supabase';

export async function clearDb(): Promise<void> {
  const supabase = getSupabase();
  // Delete all records from each table
  await supabase.from('transactions').delete().neq('id', '0');
  await supabase.from('categories').delete().neq('id', '0');
  await supabase.from('entities').delete().neq('id', '0');
  await supabase.from('custom_fields').delete().neq('id', '0');
}
