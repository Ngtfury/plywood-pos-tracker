// ============================================================
// INVENTORY DATABASE QUERIES
// src/lib/db/inventory.ts
// ============================================================
import { getSupabase } from '../supabase';
import type {
  BusinessEntity, Product, ProductVariant,
  StockBalance, StockMovement,
} from './erp';

// ---- Business Entities ----

export async function getBusinessEntities(): Promise<BusinessEntity[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('business_entities')
    .select('*')
    .order('name', { ascending: true });
  if (error) { console.warn('Error fetching business_entities:', error.message); return []; }
  const rows = (data || []) as BusinessEntity[];
  // Enrich with parent name
  return rows.map(r => ({
    ...r,
    parent_name: rows.find(x => x.id === r.parent_id)?.name ?? undefined,
  }));
}

export async function upsertBusinessEntity(data: Partial<BusinessEntity>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `be_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = {
    id,
    name: data.name || 'Unnamed',
    entity_type: data.entity_type || 'company',
    parent_id: data.parent_id || null,
    address: data.address || null,
    phone: data.phone || null,
    gstin: data.gstin || null,
    is_active: data.is_active !== false,
  };
  const { error } = await supabase.from('business_entities').upsert([row]);
  if (error) { console.error('Error upserting business_entity:', error); throw error; }
  return id;
}

export async function toggleBusinessEntityActive(id: string, is_active: boolean): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('business_entities').update({ is_active }).eq('id', id);
  if (error) throw error;
}

// ---- Products ----

export async function getProducts(category?: string): Promise<Product[]> {
  const supabase = getSupabase();
  let q = supabase.from('products').select('*').order('name');
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) { console.warn('Error fetching products:', error.message); return []; }
  return (data || []) as Product[];
}

export async function upsertProduct(data: Partial<Product>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = {
    id,
    name: data.name || 'Unnamed Product',
    category: data.category || 'other',
    unit: data.unit || 'sheets',
    description: data.description || null,
    is_active: data.is_active !== false,
  };
  const { error } = await supabase.from('products').upsert([row]);
  if (error) { console.error('Error upserting product:', error); throw error; }
  return id;
}

// ---- Product Variants ----

export async function getProductVariants(productId?: string): Promise<ProductVariant[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('product_variants')
    .select('*, products(name, category)')
    .order('thickness', { ascending: true });
  if (productId) q = q.eq('product_id', productId);
  const { data, error } = await q;
  if (error) { console.warn('Error fetching product_variants:', error.message); return []; }
  return ((data || []) as any[]).map(r => ({
    ...r,
    product_name: r.products?.name ?? undefined,
    product_category: r.products?.category ?? undefined,
  }));
}

export async function upsertProductVariant(data: Partial<ProductVariant>): Promise<string> {
  const supabase = getSupabase();
  const id = data.id || `pv_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const row = {
    id,
    product_id: data.product_id,
    size: data.size || null,
    thickness: data.thickness || null,
    sqft_per_sheet: data.sqft_per_sheet || null,
    sku: data.sku || null,
    unit: data.unit || null,
    is_active: data.is_active !== false,
  };
  const { error } = await supabase.from('product_variants').upsert([row]);
  if (error) { console.error('Error upserting product_variant:', error); throw error; }
  return id;
}

// ---- Stock Balances ----

export async function getStockBalances(
  businessEntityId?: string,
  productId?: string
): Promise<StockBalance[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('stock_balances')
    .select(`
      *,
      products(name, category),
      product_variants(size, thickness, sqft_per_sheet),
      business_entities(name)
    `);
  if (businessEntityId) q = q.eq('business_entity_id', businessEntityId);
  if (productId) q = q.eq('product_id', productId);
  const { data, error } = await q;
  if (error) { console.warn('Error fetching stock_balances:', error.message); return []; }
  return ((data || []) as any[]).map(r => ({
    ...r,
    product_name: r.products?.name ?? undefined,
    product_category: r.products?.category ?? undefined,
    variant_size: r.product_variants?.size ?? null,
    variant_thickness: r.product_variants?.thickness ?? null,
    sqft_per_sheet: r.product_variants?.sqft_per_sheet ?? null,
    business_entity_name: r.business_entities?.name ?? undefined,
  }));
}

// ---- Stock Movements ----

export async function getStockMovements(params: {
  businessEntityId?: string;
  productId?: string;
  movementType?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<StockMovement[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('stock_movements')
    .select(`
      *,
      products(name),
      product_variants(size, thickness),
      business_entities(name)
    `)
    .order('movement_date', { ascending: false });

  if (params.businessEntityId) q = q.eq('business_entity_id', params.businessEntityId);
  if (params.productId) q = q.eq('product_id', params.productId);
  if (params.movementType) q = q.eq('movement_type', params.movementType);
  if (params.fromDate) q = q.gte('movement_date', params.fromDate);
  if (params.toDate) q = q.lte('movement_date', params.toDate);
  if (params.limit) q = q.limit(params.limit);

  const { data, error } = await q;
  if (error) { console.warn('Error fetching stock_movements:', error.message); return []; }
  return ((data || []) as any[]).map(r => ({
    ...r,
    product_name: r.products?.name ?? undefined,
    variant_size: r.product_variants?.size ?? null,
    variant_thickness: r.product_variants?.thickness ?? null,
    business_entity_name: r.business_entities?.name ?? undefined,
  }));
}

// ---- Atomic stock movement via RPC ----
export async function postStockMovement(params: {
  business_entity_id: string;
  product_id: string;
  variant_id: string | null;
  movement_type: string;
  qty_sheets?: number;
  qty_sqft?: number;
  qty_pieces?: number;
  qty_other?: number;
  reference_id?: string | null;
  reference_type?: string | null;
  narration?: string | null;
  movement_date?: string;
}): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('post_stock_movement', {
    p_business_entity_id: params.business_entity_id,
    p_product_id: params.product_id,
    p_variant_id: params.variant_id,
    p_movement_type: params.movement_type,
    p_qty_sheets: params.qty_sheets ?? 0,
    p_qty_sqft: params.qty_sqft ?? 0,
    p_qty_pieces: params.qty_pieces ?? 0,
    p_qty_other: params.qty_other ?? 0,
    p_reference_id: params.reference_id ?? null,
    p_reference_type: params.reference_type ?? null,
    p_narration: params.narration ?? null,
    p_movement_date: params.movement_date ?? new Date().toISOString(),
  });
  if (error) { console.error('Error posting stock movement:', error); throw error; }
  return data as string;
}

// ---- ERP Settings ----
export async function getErpSettings(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('erp_settings').select('*');
  if (error) { console.warn('Error fetching erp_settings:', error.message); return {}; }
  const map: Record<string, string> = {};
  for (const row of (data || [])) map[row.key] = row.value;
  return map;
}

export async function saveErpSetting(key: string, value: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('erp_settings').upsert([{ key, value, updated_at: new Date().toISOString() }]);
  if (error) throw error;
}
