import { getSupabase } from '../supabase';

/**
 * Wipes database tables according to the new schema foreign-key cascade order:
 * 1. credit_payments (installments)
 * 2. transactions (bills & expenses)
 * 3. custom_fields
 * 4. entities (customers, suppliers, transporters)
 * 5. categories (standard category tags)
 */
export async function clearDb(keepCategories: boolean = false): Promise<void> {
  const supabase = getSupabase();

  // 1. Wipe credit payments
  const { error: errPayments } = await supabase
    .from('credit_payments')
    .delete()
    .neq('id', '___none___');
  if (errPayments) {
    console.error('Error wiping credit_payments:', errPayments);
    throw new Error(`Failed to wipe credit payments: ${errPayments.message}`);
  }

  // 2. Wipe transactions
  const { error: errTxns } = await supabase
    .from('transactions')
    .delete()
    .neq('id', '___none___');
  if (errTxns) {
    console.error('Error wiping transactions:', errTxns);
    throw new Error(`Failed to wipe transactions: ${errTxns.message}`);
  }

  // 3. Wipe custom field definitions
  const { error: errFields } = await supabase
    .from('custom_fields')
    .delete()
    .neq('id', '___none___');
  if (errFields) {
    console.error('Error wiping custom_fields:', errFields);
    throw new Error(`Failed to wipe custom fields: ${errFields.message}`);
  }

  // 4. Wipe entities (contacts)
  const { error: errEntities } = await supabase
    .from('entities')
    .delete()
    .neq('id', '___none___');
  if (errEntities) {
    console.error('Error wiping entities:', errEntities);
    throw new Error(`Failed to wipe entities: ${errEntities.message}`);
  }

  // 5. Optionally wipe categories or reset them
  if (!keepCategories) {
    const { error: errCats } = await supabase
      .from('categories')
      .delete()
      .neq('id', '___none___');
    if (errCats) {
      console.error('Error wiping categories:', errCats);
      throw new Error(`Failed to wipe categories: ${errCats.message}`);
    }
  }
}
