import { getSupabase } from '../supabase';

export interface Category {
  id: string;
  name: string;
  type: 'IN' | 'OUT' | 'BOTH';
  color: string;
  icon: string;
}

export interface Entity {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export interface Transaction {
  id: string;
  type: 'IN' | 'OUT';
  amount: number;
  date: string;
  category_id: string;
  entity_id: string | null;
  product_id: string | null;
  quantity: number | null;
  description: string | null;
  notes: string | null;
  reference: string | null;
  custom_data?: Record<string, any>;
  category_name?: string;
  category_color?: string;
  entity_name?: string;
  product_name?: string;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  type: "text" | "number";
  apply_to: "IN" | "OUT" | "BOTH";
}

export async function getCategories(type?: 'IN' | 'OUT'): Promise<Category[]> {
  const supabase = getSupabase();
  let query = supabase.from('categories').select('*').order('name', { ascending: true });
  
  if (type) {
    query = query.or(`type.eq.${type},type.eq.BOTH`);
  }
  
  const { data, error } = await query;
  if (error) {
    console.warn('Error fetching categories from Supabase:', error.message);
    return [];
  }
  return data || [];
}

export async function addCategory(data: Partial<Category>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `cat_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  const newCat = {
    id,
    name: data.name || 'Unnamed Category',
    type: data.type || 'BOTH',
    color: data.color || '#94a3b8',
    icon: data.icon || 'tag'
  };
  
  const { error } = await supabase.from('categories').insert([newCat]);
  if (error) {
    console.error('Error adding category to Supabase:', error);
    throw error;
  }
  return id;
}

export async function getEntities(): Promise<Entity[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('entities').select('*').order('name', { ascending: true });
  if (error) {
    console.warn('Error fetching entities from Supabase:', error.message);
    return [];
  }
  return data || [];
}

export async function addEntity(data: Partial<Entity>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `ent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  const newEnt = {
    id,
    name: data.name || 'Unnamed Entity',
    type: data.type || 'Other',
    phone: data.phone || null,
    address: data.address || null,
    notes: data.notes || null
  };
  
  const { error } = await supabase.from('entities').insert([newEnt]);
  if (error) {
    console.error('Error adding entity to Supabase:', error);
    throw error;
  }
  return id;
}

export async function getTransactions(): Promise<Transaction[]> {
  const supabase = getSupabase();
  const { data: txns, error } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false });

  if (error) {
    console.warn('Error fetching transactions from Supabase:', error.message);
    return [];
  }

  if (!txns || txns.length === 0) return [];

  // Enrich with categories and entities
  const [cats, ents] = await Promise.all([getCategories(), getEntities()]);
  
  const enriched = txns.map(t => {
    const cat = cats.find(c => c.id === t.category_id);
    const ent = ents.find(e => e.id === t.entity_id);
    
    return {
      ...t,
      amount: Number(t.amount) || 0,
      category_name: cat ? cat.name : undefined,
      category_color: cat ? cat.color : undefined,
      entity_name: ent ? ent.name : undefined
    };
  });
  
  return enriched;
}

export async function addTransaction(data: Omit<Transaction, "id" | "reference">): Promise<void> {
  const supabase = getSupabase();
  const id = Date.now().toString();
  
  const newTxn = {
    id,
    type: data.type,
    amount: data.amount,
    date: data.date,
    category_id: data.category_id,
    entity_id: data.entity_id || null,
    product_id: data.product_id || null,
    quantity: data.quantity || null,
    description: data.description || null,
    notes: data.notes || null,
    reference: null,
    custom_data: data.custom_data || {}
  };

  const { error } = await supabase.from('transactions').insert([newTxn]);
  if (error) {
    console.error('Error adding transaction to Supabase:', error);
    throw error;
  }
}

export async function getCustomFields(): Promise<CustomFieldDef[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('custom_fields').select('*').order('created_at', { ascending: true });
  if (error) {
    console.warn('Error fetching custom fields from Supabase:', error.message);
    return [];
  }
  return data || [];
}

export async function addCustomField(data: Omit<CustomFieldDef, "id">): Promise<void> {
  const supabase = getSupabase();
  const id = Date.now().toString();
  
  const newField = {
    id,
    name: data.name,
    type: data.type,
    apply_to: data.apply_to
  };

  const { error } = await supabase.from('custom_fields').insert([newField]);
  if (error) {
    console.error('Error adding custom field to Supabase:', error);
    throw error;
  }
}

export async function deleteCustomFields(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('custom_fields').delete().in('id', ids);
  if (error) {
    console.error('Error deleting custom fields:', error);
    throw error;
  }
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('transactions').delete().in('id', ids);
  if (error) {
    console.error('Error deleting transactions:', error);
    throw error;
  }
}

export async function deleteCategories(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('categories').delete().in('id', ids);
  if (error) {
    console.error('Error deleting categories:', error);
    throw error;
  }
}

export async function deleteEntities(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('entities').delete().in('id', ids);
  if (error) {
    console.error('Error deleting entities:', error);
    throw error;
  }
}

export async function getDashboardStats() {
  const transactions = await getTransactions();
  
  let totalIn = 0;
  let totalOut = 0;
  
  for (const t of transactions) {
    if (t.type === 'IN') totalIn += Number(t.amount) || 0;
    if (t.type === 'OUT') totalOut += Number(t.amount) || 0;
  }
  
  return {
    totalIn,
    totalOut,
    netProfit: totalIn - totalOut
  };
}
