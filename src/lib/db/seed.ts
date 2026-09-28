import { getSupabase } from '../supabase';

export async function seedDatabase() {
  const supabase = getSupabase();

  console.log("Starting Supabase database seed...");

  // 1. Categories
  const categories = [
    { id: 'cat_sales', name: 'Sales', type: 'IN', color: '#4ade80', icon: 'trending-up' },
    { id: 'cat_purchase', name: 'Purchase', type: 'OUT', color: '#f87171', icon: 'shopping-cart' },
    { id: 'cat_transport', name: 'Transport', type: 'OUT', color: '#fbbf24', icon: 'truck' },
    { id: 'cat_labour', name: 'Labour', type: 'OUT', color: '#60a5fa', icon: 'users' },
    { id: 'cat_food', name: 'Food & Tea', type: 'OUT', color: '#a78bfa', icon: 'coffee' },
    { id: 'cat_settle_in', name: 'Debt Recovery / Credit IN', type: 'IN', color: '#34d399', icon: 'hand-coins' },
    { id: 'cat_settle_out', name: 'Credit Disbursement OUT', type: 'OUT', color: '#f43f5e', icon: 'hand-coins' },
    { id: 'cat_misc', name: 'Miscellaneous', type: 'OUT', color: '#9ca3af', icon: 'box' },
  ];

  const { error: catError } = await supabase.from('categories').upsert(categories, { onConflict: 'id' });
  if (catError) console.error('Error seeding categories:', catError.message);

  // 2. Entities
  const entities = [
    { id: 'ent_abc_interiors', name: 'ABC Interiors', type: 'Customer', phone: '9876543210', address: 'Mumbai', notes: 'Premium customer' },
    { id: 'ent_xyz_plywood', name: 'XYZ Plywood Suppliers', type: 'Supplier', phone: '9123456780', address: 'Delhi', notes: 'Main supplier' },
    { id: 'ent_ramesh', name: 'Ramesh Traders', type: 'Customer', phone: '9998887776', address: 'Pune', notes: 'Contractor - 30 days credit' },
    { id: 'ent_driver_kumar', name: 'Kumar Transports', type: 'Transporter', phone: '9988776655', address: '', notes: 'Logistics partner' },
  ];

  const { error: entError } = await supabase.from('entities').upsert(entities, { onConflict: 'id' });
  if (entError) console.error('Error seeding entities:', entError.message);

  // 3. Transactions (with Partial Credits & Bills)
  const now = new Date();
  const past30 = new Date(now.getTime() - 30 * 86400000).toISOString();
  const past15 = new Date(now.getTime() - 15 * 86400000).toISOString();
  const past5 = new Date(now.getTime() - 5 * 86400000).toISOString();
  const future15 = new Date(now.getTime() + 15 * 86400000).toISOString();
  const pastOverdue = new Date(now.getTime() - 2 * 86400000).toISOString();

  const transactions = [
    { 
      id: 'txn_1', 
      type: 'IN', 
      amount: 50000, 
      total_amount: 100000, 
      paid_amount: 70000, // 50k upfront + 20k installment
      balance_due: 30000, 
      credit_status: 'PARTIAL',
      due_date: future15,
      date: past30, 
      category_id: 'cat_sales', 
      entity_id: 'ent_abc_interiors', 
      notes: 'Plywood 18mm Commercial - 50k advance received' 
    },
    { 
      id: 'txn_2', 
      type: 'OUT', 
      amount: 100000, 
      total_amount: 250000, 
      paid_amount: 100000, 
      balance_due: 150000, 
      credit_status: 'PARTIAL',
      due_date: future15,
      date: past30, 
      category_id: 'cat_purchase', 
      entity_id: 'ent_xyz_plywood', 
      notes: 'Timber core sheets refill - 1 Lakh advance' 
    },
    { 
      id: 'txn_3', 
      type: 'IN', 
      amount: 25000, 
      total_amount: 60000, 
      paid_amount: 25000, 
      balance_due: 35000, 
      credit_status: 'PARTIAL',
      due_date: pastOverdue, // Overdue bill!
      date: past15, 
      category_id: 'cat_sales', 
      entity_id: 'ent_ramesh', 
      notes: 'Teak veneer lot #44 - Overdue payment' 
    },
    { 
      id: 'txn_4', 
      type: 'OUT', 
      amount: 12000, 
      total_amount: 18000, 
      paid_amount: 12000, 
      balance_due: 6000, 
      credit_status: 'PARTIAL',
      due_date: future15,
      date: past5, 
      category_id: 'cat_transport', 
      entity_id: 'ent_driver_kumar', 
      notes: 'Freight charges from Gandhidham' 
    },
    { 
      id: 'txn_5', 
      type: 'IN', 
      amount: 45000, 
      total_amount: 45000, 
      paid_amount: 45000, 
      balance_due: 0, 
      credit_status: 'PAID',
      due_date: null,
      date: past5, 
      category_id: 'cat_sales', 
      entity_id: 'ent_ramesh', 
      notes: 'Laminate sheets cash sale' 
    },
    { 
      id: 'txn_6', 
      type: 'OUT', 
      amount: 2500, 
      total_amount: 2500, 
      paid_amount: 2500, 
      balance_due: 0, 
      credit_status: 'PAID',
      due_date: null,
      date: past5, 
      category_id: 'cat_labour', 
      entity_id: null, 
      notes: 'Unloading charges' 
    },
    { 
      id: 'txn_settle_demo_1', 
      type: 'IN', 
      amount: 20000, 
      total_amount: 20000, 
      paid_amount: 20000, 
      balance_due: 0, 
      credit_status: 'PAID',
      due_date: null,
      date: past15, 
      category_id: 'cat_settle_in', 
      entity_id: 'ent_abc_interiors', 
      notes: 'Credit Settlement: GPay UPI partial installment',
      custom_data: { is_credit_settlement: true, payment_id: 'cp_demo_1' } 
    }
  ];

  const { error: txnError } = await supabase.from('transactions').upsert(transactions, { onConflict: 'id' });
  if (txnError) console.error('Error seeding transactions:', txnError.message);

  // 4. Credit Payments (Repayment History)
  const creditPayments = [
    {
      id: 'cp_demo_1',
      transaction_id: 'txn_1',
      entity_id: 'ent_abc_interiors',
      amount: 20000,
      payment_type: 'IN',
      payment_date: past15,
      notes: 'GPay UPI partial installment'
    }
  ];

  const { error: cpError } = await supabase.from('credit_payments').upsert(creditPayments, { onConflict: 'id' });
  if (cpError) console.warn('Note on seeding credit_payments:', cpError.message);

  console.log("Supabase seed completed successfully with credit system data!");
}
