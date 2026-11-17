import { getSupabase } from '../supabase';
import { recordAuditLog } from './audit';

export interface Category {
  id: string;
  name: string;
  type: 'IN' | 'OUT' | 'BOTH';
  color: string;
  icon: string;
  description?: string | null;
  created_at?: string;
}

export interface Entity {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  alt_phone?: string | null;
  email?: string | null;
  address: string | null;
  gstin?: string | null;
  contact_person?: string | null;
  payment_terms?: string | null;
  credit_limit?: number | null;
  credit_period?: number | null;
  credit_terms?: string | null;
  notes: string | null;
  created_at?: string;
}

export interface Transaction {
  id: string;
  type: 'IN' | 'OUT';
  amount: number;
  total_amount?: number;
  paid_amount?: number;
  balance_due?: number;
  credit_status?: 'PAID' | 'PARTIAL' | 'UNPAID';
  due_date?: string | null;
  date: string;
  category_id: string;
  entity_id: string | null;
  product_id: string | null;
  quantity: number | null;
  description: string | null;
  notes: string | null;
  reference: string | null;
  custom_data?: Record<string, any>;
  business_entity_id?: string | null;
  category_name?: string;
  category_color?: string;
  entity_name?: string;
  entity_type?: string;
  entity_phone?: string | null;
  product_name?: string;
}

export interface CreditPayment {
  id: string;
  transaction_id: string | null;
  entity_id: string;
  amount: number;
  payment_type: 'IN' | 'OUT';
  payment_date: string;
  notes: string | null;
  created_at?: string;
  entity_name?: string;
}

export interface EntityCreditLedger {
  entity: Entity;
  totalReceivable: number;       // Balance to get from customer
  totalPayable: number;          // Balance to give to supplier
  totalReceivableBilled: number; // Total billed to customer
  totalReceivablePaid: number;   // Total collected from customer
  totalPayableBilled: number;    // Total purchased / owed to supplier
  totalPayablePaid: number;      // Total disbursed to supplier
  totalBilled: number;
  totalPaid: number;
  openBillsCount: number;
  overdueBillsCount: number;
  creditTransactions: Transaction[];
  paymentHistory: CreditPayment[];
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
    icon: data.icon || 'tag',
    description: data.description || null
  };
  
  const { error } = await supabase.from('categories').insert([newCat]);
  if (error) {
    console.error('Error adding category to Supabase:', error);
    throw error;
  }
  return id;
}

export async function updateCategory(id: string, data: Partial<Category>, oldData?: Partial<Category>): Promise<void> {
  const supabase = getSupabase();
  const updatePayload: Record<string, any> = {};
  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.type !== undefined) updatePayload.type = data.type;
  if (data.color !== undefined) updatePayload.color = data.color;
  if (data.icon !== undefined) updatePayload.icon = data.icon;
  if (data.description !== undefined) updatePayload.description = data.description || null;

  const { error } = await supabase.from('categories').update(updatePayload).eq('id', id);
  if (error) {
    console.error('Error updating category in Supabase:', error);
    throw error;
  }

  await recordAuditLog({
    entity_type: 'categories',
    record_id: id,
    old_values: oldData,
    new_values: updatePayload,
    action: 'UPDATE',
  });
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
    alt_phone: data.alt_phone || null,
    email: data.email || null,
    address: data.address || null,
    gstin: data.gstin || null,
    contact_person: data.contact_person || null,
    payment_terms: data.payment_terms || null,
    credit_limit: data.credit_limit != null ? Number(data.credit_limit) : null,
    credit_period: data.credit_period != null ? Number(data.credit_period) : null,
    credit_terms: data.credit_terms || null,
    notes: data.notes || null
  };
  
  const { error } = await supabase.from('entities').insert([newEnt]);
  if (error) {
    console.error('Error adding entity to Supabase:', error);
    throw error;
  }
  return id;
}

export async function updateEntity(id: string, data: Partial<Entity>, oldData?: Partial<Entity>): Promise<void> {
  const supabase = getSupabase();
  const updatePayload: Record<string, any> = {};
  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.type !== undefined) updatePayload.type = data.type;
  if (data.phone !== undefined) updatePayload.phone = data.phone || null;
  if (data.alt_phone !== undefined) updatePayload.alt_phone = data.alt_phone || null;
  if (data.email !== undefined) updatePayload.email = data.email || null;
  if (data.address !== undefined) updatePayload.address = data.address || null;
  if (data.gstin !== undefined) updatePayload.gstin = data.gstin || null;
  if (data.contact_person !== undefined) updatePayload.contact_person = data.contact_person || null;
  if (data.payment_terms !== undefined) updatePayload.payment_terms = data.payment_terms || null;
  if (data.credit_limit !== undefined) updatePayload.credit_limit = data.credit_limit != null ? Number(data.credit_limit) : null;
  if (data.credit_period !== undefined) updatePayload.credit_period = data.credit_period != null ? Number(data.credit_period) : null;
  if (data.credit_terms !== undefined) updatePayload.credit_terms = data.credit_terms || null;
  if (data.notes !== undefined) updatePayload.notes = data.notes || null;

  const { error } = await supabase.from('entities').update(updatePayload).eq('id', id);
  if (error) {
    console.error('Error updating entity in Supabase:', error);
    throw error;
  }

  await recordAuditLog({
    entity_type: 'entities',
    record_id: id,
    old_values: oldData,
    new_values: updatePayload,
    action: 'UPDATE',
  });
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
    const amt = Number(t.amount) || 0;
    const totalAmt = t.total_amount != null ? Number(t.total_amount) : amt;
    const paidAmt = t.paid_amount != null ? Number(t.paid_amount) : amt;
    const balanceDue = t.balance_due != null ? Number(t.balance_due) : Math.max(0, totalAmt - paidAmt);
    const creditStatus = (t.credit_status as 'PAID' | 'PARTIAL' | 'UNPAID') || (balanceDue <= 0 ? 'PAID' : (paidAmt > 0 ? 'PARTIAL' : 'UNPAID'));
    
    return {
      ...t,
      amount: amt,
      total_amount: totalAmt,
      paid_amount: paidAmt,
      balance_due: balanceDue,
      credit_status: creditStatus,
      due_date: t.due_date || null,
      category_name: cat ? cat.name : undefined,
      category_color: cat ? cat.color : undefined,
      entity_name: ent ? ent.name : undefined,
      entity_type: ent ? ent.type : undefined,
      entity_phone: ent ? ent.phone : undefined
    };
  });
  
  return enriched;
}

export async function addTransaction(data: Omit<Transaction, "id" | "reference">): Promise<void> {
  const supabase = getSupabase();
  const id = Date.now().toString();

  const totalAmount = data.total_amount != null ? Number(data.total_amount) : Number(data.amount);
  const paidAmount = data.paid_amount != null ? Number(data.paid_amount) : Number(data.amount);
  const balanceDue = data.balance_due != null ? Number(data.balance_due) : Math.max(0, totalAmount - paidAmount);

  let creditStatus: 'PAID' | 'PARTIAL' | 'UNPAID' = 'PAID';
  if (data.credit_status) {
    creditStatus = data.credit_status;
  } else if (balanceDue > 0) {
    creditStatus = paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
  } else {
    creditStatus = 'PAID';
  }

  // The immediate cash moved is `paidAmount`
  const cashAmount = data.paid_amount != null ? paidAmount : Number(data.amount);
  
  // Validate category_id exists in Supabase categories table
  let catId: string | null = null;
  if (data.category_id && data.category_id !== 'none' && data.category_id.trim() !== '') {
    const { data: catExists } = await supabase
      .from('categories')
      .select('id')
      .eq('id', data.category_id.trim())
      .limit(1);
    if (catExists && catExists.length > 0) {
      catId = catExists[0].id;
    }
  }

  const newTxn = {
    id,
    type: data.type,
    amount: cashAmount,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    balance_due: balanceDue,
    credit_status: creditStatus,
    due_date: data.due_date || null,
    date: data.date,
    category_id: catId,
    entity_id: data.entity_id || null,
    product_id: data.product_id || null,
    quantity: data.quantity || null,
    description: data.description || null,
    notes: data.notes || null,
    reference: data.custom_data?.payment_reference || null,
    custom_data: data.custom_data || {},
    business_entity_id: data.business_entity_id || data.custom_data?.business_entity_id || null
  };

  const { error } = await supabase.rpc('post_quick_transaction_atomic', {
    p_transaction: newTxn,
  });
  if (error) {
    console.error('Error adding transaction to Supabase:', error);
    throw error;
  }
}

export async function updateTransaction(data: Transaction): Promise<void> {
  const supabase = getSupabase();
  const totalAmount = data.total_amount != null ? Number(data.total_amount) : Number(data.amount);
  const paidAmount = data.paid_amount != null ? Number(data.paid_amount) : Number(data.amount);
  const balanceDue = data.balance_due != null ? Number(data.balance_due) : Math.max(0, totalAmount - paidAmount);
  const bankAmount = Number(data.custom_data?.bank_amount || 0);

  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error("Transaction amount must be greater than zero.");
  }
  if (!Number.isFinite(bankAmount) || bankAmount < 0) {
    throw new Error("Bank amount must be zero or greater.");
  }
  if (bankAmount > 0 && !data.custom_data?.bank_account_id) {
    throw new Error("A bank account is required for a bank payment.");
  }

  const { error } = await supabase.rpc('update_quick_transaction_atomic', {
    p_transaction: {
      id: data.id,
      type: data.type,
      amount: Number(data.amount),
      total_amount: totalAmount,
      paid_amount: paidAmount,
      balance_due: balanceDue,
      credit_status: data.credit_status || 'PAID',
      due_date: data.due_date || null,
      date: data.date,
      category_id: data.category_id || null,
      entity_id: data.entity_id || null,
      product_id: data.product_id || null,
      quantity: data.quantity || null,
      description: data.description || null,
      notes: data.notes || null,
      reference: data.reference || data.custom_data?.payment_reference || null,
      custom_data: data.custom_data || {},
    },
  });
  if (error) {
    console.error('Error updating transaction in Supabase:', error);
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

export async function updateCustomField(id: string, data: Partial<CustomFieldDef>, oldData?: Partial<CustomFieldDef>): Promise<void> {
  const supabase = getSupabase();
  const updatePayload: Record<string, any> = {};
  if (data.name !== undefined) updatePayload.name = data.name.trim();
  if (data.type !== undefined) updatePayload.type = data.type;
  if (data.apply_to !== undefined) updatePayload.apply_to = data.apply_to;

  const { error } = await supabase.from('custom_fields').update(updatePayload).eq('id', id);
  if (error) {
    console.error('Error updating custom field in Supabase:', error);
    throw error;
  }

  await recordAuditLog({
    entity_type: 'custom_fields',
    record_id: id,
    old_values: oldData,
    new_values: updatePayload,
    action: 'UPDATE',
  });
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
  const { error } = await supabase.rpc('delete_transactions_atomic', { p_ids: ids });
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
  const [transactions, creditStats] = await Promise.all([
    getTransactions(),
    getCreditDashboardStats()
  ]);
  
  let totalIn = 0;
  let totalOut = 0;
  let pureCashIn = 0;
  let pureCashOut = 0;
  let creditCollectedIn = 0;
  let creditDisbursedOut = 0;
  
  for (const t of transactions) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'IN') {
      totalIn += amt;
      if (t.custom_data?.is_credit_settlement) {
        creditCollectedIn += amt;
      } else {
        pureCashIn += amt;
      }
    } else {
      totalOut += amt;
      if (t.custom_data?.is_credit_settlement) {
        creditDisbursedOut += amt;
      } else {
        pureCashOut += amt;
      }
    }
  }

  // Net Profit Excluding Credits is the liquid realized cash profit (Total IN - Total OUT)
  const netProfitExcludingCredits = totalIn - totalOut;
  const pureCashProfit = pureCashIn - pureCashOut;
  const netCredit = creditStats.totalReceivable - creditStats.totalPayable;
  // Overall projected business profit including outstanding receivables and payables
  const totalProfitWithCredits = netProfitExcludingCredits + netCredit;
  
  return {
    totalIn,
    totalOut,
    pureCashIn,
    pureCashOut,
    pureCashProfit,
    creditCollectedIn,
    creditDisbursedOut,
    netProfit: netProfitExcludingCredits,
    netProfitExcludingCredits,
    totalProfitWithCredits,
    creditStats: {
      totalReceivable: creditStats.totalReceivable,
      totalPayable: creditStats.totalPayable,
      netCredit: creditStats.netCredit,
      activeCustomersCount: creditStats.activeCustomersCount,
      activeSuppliersCount: creditStats.activeSuppliersCount,
      overdueCount: creditStats.overdueCount
    }
  };
}

export async function getCreditPayments(entityId?: string): Promise<CreditPayment[]> {
  const supabase = getSupabase();
  let query = supabase.from('credit_payments').select('*').order('payment_date', { ascending: false });
  if (entityId) {
    query = query.eq('entity_id', entityId);
  }
  const { data, error } = await query;
  if (error) {
    console.warn('Error fetching credit payments:', error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  const ents = await getEntities();
  return data.map(p => {
    const ent = ents.find(e => e.id === p.entity_id);
    return {
      ...p,
      amount: Number(p.amount) || 0,
      entity_name: ent ? ent.name : undefined
    };
  });
}

export async function recordCreditPayment(params: {
  entity_id: string;
  amount: number;
  payment_type: 'IN' | 'OUT';
  transaction_id?: string | null;
  payment_date?: string;
  notes?: string;
}): Promise<void> {
  const supabase = getSupabase();
  const paymentAmount = Number(params.amount);
  if (paymentAmount <= 0) return;

  const paymentDate = params.payment_date || new Date().toISOString();
  const paymentId = `cp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // 1. Fetch matching open transactions for this entity (type matching payment_type)
  const { data: rawTxns } = await supabase
    .from('transactions')
    .select('*')
    .eq('entity_id', params.entity_id)
    .eq('type', params.payment_type)
    .order('date', { ascending: true });

  const openTxns = (rawTxns || []).filter(t => {
    const total = t.total_amount != null ? Number(t.total_amount) : Number(t.amount);
    const paid = t.paid_amount != null ? Number(t.paid_amount) : Number(t.amount);
    const bal = t.balance_due != null ? Number(t.balance_due) : Math.max(0, total - paid);
    return bal > 0;
  });

  let remainingPayment = paymentAmount;

  if (params.transaction_id) {
    // Specific bill chosen
    const target = openTxns.find(t => t.id === params.transaction_id);
    if (target) {
      const curPaid = Number(target.paid_amount) || 0;
      const total = Number(target.total_amount) || Number(target.amount);
      const newPaid = curPaid + remainingPayment;
      const newBalance = Math.max(0, total - newPaid);
      const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';

      await supabase.from('transactions').update({
        paid_amount: newPaid,
        balance_due: newBalance,
        credit_status: newStatus
      }).eq('id', target.id);
    }
  } else {
    // FIFO: Apply across oldest open bills first
    for (const t of openTxns) {
      if (remainingPayment <= 0) break;
      const total = Number(t.total_amount) || Number(t.amount);
      const curPaid = Number(t.paid_amount) || 0;
      const curBal = Number(t.balance_due) != null ? Number(t.balance_due) : Math.max(0, total - curPaid);

      const allocation = Math.min(remainingPayment, curBal);
      const newPaid = curPaid + allocation;
      const newBal = Math.max(0, total - newPaid);
      const newStatus = newBal <= 0 ? 'PAID' : 'PARTIAL';

      await supabase.from('transactions').update({
        paid_amount: newPaid,
        balance_due: newBal,
        credit_status: newStatus
      }).eq('id', t.id);

      remainingPayment -= allocation;
    }
  }

  // 2. Insert into credit_payments ledger
  await supabase.from('credit_payments').insert([{
    id: paymentId,
    transaction_id: params.transaction_id || (openTxns.length > 0 ? openTxns[0].id : null),
    entity_id: params.entity_id,
    amount: paymentAmount,
    payment_type: params.payment_type,
    payment_date: paymentDate,
    notes: params.notes || 'Credit Settlement'
  }]);

  // 3. DUAL ENTRY: Insert immediate cashflow transaction into transactions
  let defaultCatId: string | null = null;
  const { data: validCats } = await supabase
    .from('categories')
    .select('id')
    .or(`type.eq.${params.payment_type},type.eq.BOTH`)
    .limit(1);
  if (validCats && validCats.length > 0) {
    defaultCatId = validCats[0].id;
  }

  const cashTxnId = `txn_settle_${Date.now()}`;
  await supabase.from('transactions').insert([{
    id: cashTxnId,
    type: params.payment_type,
    amount: paymentAmount,
    total_amount: paymentAmount,
    paid_amount: paymentAmount,
    balance_due: 0,
    credit_status: 'PAID',
    date: paymentDate,
    category_id: defaultCatId,
    entity_id: params.entity_id,
    notes: params.notes ? `Credit Settlement: ${params.notes}` : `Credit Settlement Installment`,
    custom_data: { is_credit_settlement: true, payment_id: paymentId }
  }]);
}

export async function addCreditRecord(params: {
  entity_id: string;
  direction: 'TO_GET' | 'TO_GIVE';
  total_amount: number;
  paid_amount?: number;
  due_date?: string | null;
  date?: string;
  category_id?: string | null;
  notes?: string;
}): Promise<string> {
  const supabase = getSupabase();
  const id = `cred_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const total = Number(params.total_amount);
  const paid = Number(params.paid_amount || 0);
  const bal = Math.max(0, total - paid);
  const type = params.direction === 'TO_GET' ? 'IN' : 'OUT';
  const status = bal <= 0 ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID');

  // Safely validate category_id against categories table
  let catId: string | null = null;
  if (params.category_id && params.category_id !== 'none' && params.category_id.trim() !== '') {
    const { data: catExists } = await supabase
      .from('categories')
      .select('id')
      .eq('id', params.category_id.trim())
      .limit(1);
    if (catExists && catExists.length > 0) {
      catId = catExists[0].id;
    }
  }

  // If no category selected or not found, try to find an existing one matching type or set null
  if (!catId) {
    const { data: fallbackCats } = await supabase
      .from('categories')
      .select('id')
      .or(`type.eq.${type},type.eq.BOTH`)
      .limit(1);
    if (fallbackCats && fallbackCats.length > 0) {
      catId = fallbackCats[0].id;
    } else {
      catId = null; // In Supabase schema, category_id is nullable (ON DELETE SET NULL). null never violates FK!
    }
  }

  // Validate entity_id exists
  if (params.entity_id) {
    const { data: entExists } = await supabase
      .from('entities')
      .select('id')
      .eq('id', params.entity_id)
      .limit(1);
    if (!entExists || entExists.length === 0) {
      throw new Error(`Selected contact/entity (ID: ${params.entity_id}) was not found.`);
    }
  } else {
    throw new Error('Please select a contact/entity for the credit record.');
  }

  const txnDate = params.date ? params.date + "T12:00:00Z" : new Date().toISOString();

  const newTxn = {
    id,
    type,
    amount: paid, // actual immediate cash movement
    total_amount: total,
    paid_amount: paid,
    balance_due: bal,
    credit_status: status,
    due_date: params.due_date ? params.due_date + "T23:59:59Z" : null,
    date: txnDate,
    category_id: catId,
    entity_id: params.entity_id,
    product_id: null,
    quantity: null,
    description: null,
    notes: params.notes || (params.direction === 'TO_GIVE' ? 'Credit Purchase / Payable Owed' : 'Credit Sale / Receivable Due'),
    reference: null,
    custom_data: { is_credit_initial: true }
  };

  const { error } = await supabase.from('transactions').insert([newTxn]);
  if (error) {
    console.error('Error adding credit record to Supabase:', error);
    throw error;
  }
  return id;
}

export async function deleteCreditTransaction(id: string): Promise<void> {
  const supabase = getSupabase();
  // 1. Find all payments tied to this credit transaction
  const { data: payments } = await supabase.from('credit_payments').select('id').eq('transaction_id', id);
  if (payments && payments.length > 0) {
    for (const p of payments) {
      // Delete any cashflow settlement transactions tied to these payments
      await supabase.from('transactions').delete().contains('custom_data', { payment_id: p.id });
    }
    // Delete payments tied to this transaction
    await supabase.from('credit_payments').delete().eq('transaction_id', id);
  }

  // 2. Delete the credit transaction itself
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) {
    console.error('Error deleting credit transaction:', error);
    throw error;
  }
}

export async function deleteCreditPayment(paymentId: string): Promise<void> {
  const supabase = getSupabase();
  const { data: payments } = await supabase.from('credit_payments').select('*').eq('id', paymentId).limit(1);
  if (payments && payments.length > 0) {
    const payment = payments[0];
    const amount = Number(payment.amount) || 0;
    
    if (payment.transaction_id) {
      const { data: txns } = await supabase.from('transactions').select('*').eq('id', payment.transaction_id).limit(1);
      if (txns && txns.length > 0) {
        const txn = txns[0];
        const curPaid = Number(txn.paid_amount) || 0;
        const total = Number(txn.total_amount) || Number(txn.amount);
        const newPaid = Math.max(0, curPaid - amount);
        const newBal = Math.max(0, total - newPaid);
        const newStatus = newBal <= 0 ? 'PAID' : (newPaid > 0 ? 'PARTIAL' : 'UNPAID');
        await supabase.from('transactions').update({
          paid_amount: newPaid,
          balance_due: newBal,
          credit_status: newStatus
        }).eq('id', txn.id);
      }
    }

    // Delete corresponding cashflow settlement transaction
    await supabase.from('transactions').delete().contains('custom_data', { payment_id: paymentId });
    // Delete payment record
    await supabase.from('credit_payments').delete().eq('id', paymentId);
  }
}

export async function deleteEntityCredits(entityId: string): Promise<void> {
  const supabase = getSupabase();
  // 1. Delete all installment payment records for this entity
  await supabase.from('credit_payments').delete().eq('entity_id', entityId);

  // 2. Delete all credit transactions and credit settlements for this entity
  const { data: txns } = await supabase
    .from('transactions')
    .select('id, custom_data, total_amount, balance_due')
    .eq('entity_id', entityId);

  if (txns && txns.length > 0) {
    const idsToDelete = txns
      .filter(t => 
        t.custom_data?.is_credit_initial || 
        t.custom_data?.is_credit_settlement || 
        t.total_amount != null || 
        t.balance_due != null
      )
      .map(t => t.id);

    if (idsToDelete.length > 0) {
      const { error } = await supabase.from('transactions').delete().in('id', idsToDelete);
      if (error) {
        console.error('Error deleting entity credit transactions:', error);
        throw error;
      }
    }
  }
}

export async function getEntityCreditLedgers(typeFilter: 'CUSTOMER' | 'SUPPLIER' | 'ALL' = 'ALL'): Promise<EntityCreditLedger[]> {
  const [entities, allTxns, allPayments] = await Promise.all([
    getEntities(),
    getTransactions(),
    getCreditPayments()
  ]);

  const now = new Date();

  const ledgers: EntityCreditLedger[] = entities.map(entity => {
    // Relevant transactions for this entity
    const entTxns = allTxns.filter(t => t.entity_id === entity.id);
    const entPayments = allPayments.filter(p => p.entity_id === entity.id);

    let totalReceivable = 0;
    let totalPayable = 0;
    let totalReceivableBilled = 0;
    let totalReceivablePaid = 0;
    let totalPayableBilled = 0;
    let totalPayablePaid = 0;
    let openBillsCount = 0;
    let overdueBillsCount = 0;

    for (const t of entTxns) {
      // Exclude auto-generated settlement cashflow rows from billed calculation
      if (t.custom_data?.is_credit_settlement) continue;

      const total = t.total_amount != null ? Number(t.total_amount) : Number(t.amount);
      const paid = t.paid_amount != null ? Number(t.paid_amount) : Number(t.amount);
      const bal = t.balance_due != null ? Number(t.balance_due) : Math.max(0, total - paid);

      if (t.type === 'IN') {
        totalReceivableBilled += total;
        totalReceivablePaid += paid;
        if (bal > 0) {
          totalReceivable += bal;
          openBillsCount++;
          if (t.due_date && new Date(t.due_date) < now) {
            overdueBillsCount++;
          }
        }
      } else {
        totalPayableBilled += total;
        totalPayablePaid += paid;
        if (bal > 0) {
          totalPayable += bal;
          openBillsCount++;
          if (t.due_date && new Date(t.due_date) < now) {
            overdueBillsCount++;
          }
        }
      }
    }

    return {
      entity,
      totalReceivable,
      totalPayable,
      totalReceivableBilled,
      totalReceivablePaid,
      totalPayableBilled,
      totalPayablePaid,
      totalBilled: totalReceivableBilled + totalPayableBilled,
      totalPaid: totalReceivablePaid + totalPayablePaid,
      openBillsCount,
      overdueBillsCount,
      creditTransactions: entTxns,
      paymentHistory: entPayments
    };
  });

  // Filter out entities that have no credit records and no open balance
  // This guarantees that deleting an entity's credits removes the ghost 0 log from the Credits dashboard
  const activeLedgers = ledgers.filter(l => 
    l.creditTransactions.length > 0 || 
    l.paymentHistory.length > 0 || 
    l.totalReceivable > 0 || 
    l.totalPayable > 0 || 
    l.totalBilled > 0
  );

  // Filter based on selected tab
  let filtered = activeLedgers;
  if (typeFilter === 'CUSTOMER') {
    filtered = activeLedgers.filter(l => 
      l.totalReceivable > 0 || l.totalReceivableBilled > 0 || l.entity.type.toLowerCase().includes('customer')
    );
  } else if (typeFilter === 'SUPPLIER') {
    filtered = activeLedgers.filter(l => 
      l.totalPayable > 0 || l.totalPayableBilled > 0 || !l.entity.type.toLowerCase().includes('customer')
    );
  }

  // Sort: Entities with open balances at the top, then by name
  return filtered.sort((a, b) => {
    const aTotalBal = a.totalReceivable + a.totalPayable;
    const bTotalBal = b.totalReceivable + b.totalPayable;
    if (bTotalBal !== aTotalBal) return bTotalBal - aTotalBal;
    return a.entity.name.localeCompare(b.entity.name);
  });
}

export async function getCreditDashboardStats() {
  const ledgers = await getEntityCreditLedgers('ALL');
  
  let totalReceivable = 0; // Total to Get (from customers)
  let totalPayable = 0;    // Total to Give (to suppliers)
  let overdueCount = 0;
  let activeCustomersCount = 0;
  let activeSuppliersCount = 0;

  for (const l of ledgers) {
    if (l.totalReceivable > 0) {
      totalReceivable += l.totalReceivable;
      activeCustomersCount++;
    }
    if (l.totalPayable > 0) {
      totalPayable += l.totalPayable;
      activeSuppliersCount++;
    }
    overdueCount += l.overdueBillsCount;
  }

  return {
    totalReceivable,
    totalPayable,
    netCredit: totalReceivable - totalPayable,
    overdueCount,
    activeCustomersCount,
    activeSuppliersCount,
    totalPendingAccounts: activeCustomersCount + activeSuppliersCount
  };
}

// =========================================================================
// COMPANY-WISE CURRENT CASH BALANCE MANAGEMENT
// =========================================================================

/**
 * Retrieves the persisted opening cash balance for a company (or all companies).
 */
export async function getCompanyOpeningBalance(companyId?: string | null): Promise<number> {
  const supabase = getSupabase();
  const settingKey = companyId && companyId !== 'ALL'
    ? `opening_cash_balance_${companyId}`
    : 'opening_cash_balance';

  try {
    const { data, error } = await supabase
      .from('erp_settings')
      .select('value')
      .eq('key', settingKey)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      if (companyId && companyId !== 'ALL') {
        // Fallback to global opening balance if entity-specific has not been customized yet
        const { data: globalData } = await supabase
          .from('erp_settings')
          .select('value')
          .eq('key', 'opening_cash_balance')
          .limit(1)
          .maybeSingle();
        return globalData?.value ? parseFloat(globalData.value) || 0 : 0;
      }
      return 0;
    }

    return parseFloat(data.value) || 0;
  } catch (err) {
    console.warn('Failed to fetch opening cash balance from erp_settings:', err);
    return 0;
  }
}

/**
 * Persists the opening cash balance for a company in erp_settings.
 */
export async function setCompanyOpeningBalance(amount: number, companyId?: string | null): Promise<void> {
  const supabase = getSupabase();
  const settingKey = companyId && companyId !== 'ALL'
    ? `opening_cash_balance_${companyId}`
    : 'opening_cash_balance';

  const { error } = await supabase
    .from('erp_settings')
    .upsert({
      key: settingKey,
      value: amount.toString(),
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('Failed to save opening cash balance:', error);
    throw error;
  }
}

/**
 * Pure calculation function to determine the company's live current balance.
 * Uses exact immediate cashflow (got cash / paid cash) for every transaction,
 * ensuring partial upfront payments and credit settlements are accurately reflected.
 */
export function calculateCompanyCurrentBalance(
  transactions: Transaction[],
  openingBalance: number,
  companyId?: string | null
): { currentBalance: number; totalCashIn: number; totalCashOut: number } {
  let totalCashIn = 0;
  let totalCashOut = 0;

  for (const t of transactions) {
    // If companyId filter is active, check if transaction matches
    if (companyId && companyId !== 'ALL') {
      const txnBizId = t.business_entity_id || t.custom_data?.business_entity_id;
      // If transaction has a specified entity that does not match, skip
      if (txnBizId && txnBizId !== companyId) {
        continue;
      }
    }

    // Immediate cashflow moved: for partial payments, this is exactly the upfront got cash (paid_amount)
    const cashMoved = Number(t.paid_amount != null ? t.paid_amount : t.amount) || 0;

    if (t.type === 'IN') {
      totalCashIn += cashMoved;
    } else {
      totalCashOut += cashMoved;
    }
  }

  const currentBalance = Math.round((openingBalance + totalCashIn - totalCashOut) * 100) / 100;
  return {
    currentBalance,
    totalCashIn: Math.round(totalCashIn * 100) / 100,
    totalCashOut: Math.round(totalCashOut * 100) / 100
  };
}

/**
 * Directly sets the desired current balance for a company by adjusting its opening balance baseline.
 */
export async function setCompanyDesiredCurrentBalance(
  targetBalance: number,
  transactions: Transaction[],
  companyId?: string | null
): Promise<number> {
  const { totalCashIn, totalCashOut } = calculateCompanyCurrentBalance(transactions, 0, companyId);
  const newOpening = Math.round((targetBalance - (totalCashIn - totalCashOut)) * 100) / 100;
  await setCompanyOpeningBalance(newOpening, companyId);
  return newOpening;
}

/**
 * Adds funds/capital directly to the company's balance.
 */
export async function addFundsToCompanyBalance(
  amountToAdd: number,
  companyId?: string | null
): Promise<number> {
  const currentOpening = await getCompanyOpeningBalance(companyId);
  const newOpening = Math.round((currentOpening + amountToAdd) * 100) / 100;
  await setCompanyOpeningBalance(newOpening, companyId);
  return newOpening;
}
