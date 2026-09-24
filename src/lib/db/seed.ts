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
    { id: 'cat_misc', name: 'Miscellaneous', type: 'OUT', color: '#9ca3af', icon: 'box' },
  ];

  const { error: catError } = await supabase.from('categories').upsert(categories, { onConflict: 'id' });
  if (catError) console.error('Error seeding categories:', catError.message);

  // 2. Entities
  const entities = [
    { id: 'ent_abc_interiors', name: 'ABC Interiors', type: 'Customer', phone: '9876543210', address: 'Mumbai', notes: 'Premium customer' },
    { id: 'ent_xyz_plywood', name: 'XYZ Plywood Suppliers', type: 'Supplier', phone: '9123456780', address: 'Delhi', notes: 'Main supplier' },
    { id: 'ent_ramesh', name: 'Ramesh Traders', type: 'Customer', phone: '9998887776', address: 'Pune', notes: '' },
    { id: 'ent_driver_kumar', name: 'Kumar Transports', type: 'Transporter', phone: '9988776655', address: '', notes: '' },
  ];

  const { error: entError } = await supabase.from('entities').upsert(entities, { onConflict: 'id' });
  if (entError) console.error('Error seeding entities:', entError.message);

  // 3. Transactions
  const transactions = [
    { id: 'txn_1', type: 'IN', amount: 150000, date: new Date('2026-08-01 10:00:00').toISOString(), category_id: 'cat_sales', entity_id: 'ent_abc_interiors', notes: 'Advance payment' },
    { id: 'txn_2', type: 'OUT', amount: 250000, date: new Date('2026-08-02 11:30:00').toISOString(), category_id: 'cat_purchase', entity_id: 'ent_xyz_plywood', notes: 'Stock refill' },
    { id: 'txn_3', type: 'OUT', amount: 12000, date: new Date('2026-08-02 14:00:00').toISOString(), category_id: 'cat_transport', entity_id: 'ent_driver_kumar', notes: 'Freight charges for stock' },
    { id: 'txn_4', type: 'OUT', amount: 50, date: new Date('2026-08-03 09:15:00').toISOString(), category_id: 'cat_food', entity_id: null, notes: 'Morning tea' },
    { id: 'txn_5', type: 'IN', amount: 45000, date: new Date('2026-08-05 16:45:00').toISOString(), category_id: 'cat_sales', entity_id: 'ent_ramesh', notes: 'Full payment received' },
    { id: 'txn_6', type: 'OUT', amount: 2500, date: new Date('2026-08-05 18:00:00').toISOString(), category_id: 'cat_labour', entity_id: null, notes: 'Unloading charges' },
    { id: 'txn_7', type: 'OUT', amount: 800, date: new Date('2026-08-06 10:30:00').toISOString(), category_id: 'cat_transport', entity_id: null, notes: 'Fuel for delivery van' },
  ];

  const { error: txnError } = await supabase.from('transactions').upsert(transactions, { onConflict: 'id' });
  if (txnError) console.error('Error seeding transactions:', txnError.message);

  console.log("Supabase seed completed successfully!");
}
