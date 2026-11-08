// ============================================================
// PRODUCTION DATABASE QUERIES
// src/lib/db/production.ts
// ============================================================
import { getSupabase } from '../supabase';
import type { ProductionEntry } from './erp';

export async function getProductionEntries(params: {
  businessEntityId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): Promise<ProductionEntry[]> {
  const supabase = getSupabase();
  let q = supabase
    .from('production_entries')
    .select(`
      *,
      business_entities(name),
      plywood_product:products!plywood_product_id(name),
      plywood_variant:product_variants!plywood_variant_id(size, thickness),
      face_veneer_product:products!face_veneer_product_id(name)
    `)
    .order('production_date', { ascending: false });

  if (params.businessEntityId) q = q.eq('business_entity_id', params.businessEntityId);
  if (params.fromDate) q = q.gte('production_date', params.fromDate);
  if (params.toDate) q = q.lte('production_date', params.toDate);
  if (params.limit) q = q.limit(params.limit);

  const { data, error } = await q;
  if (error) { console.warn('Error fetching production_entries:', error.message); return []; }

  return ((data || []) as any[]).map(r => ({
    ...r,
    business_entity_name: r.business_entities?.name ?? undefined,
    plywood_product_name: r.plywood_product?.name ?? undefined,
    variant_size: r.plywood_variant?.size ?? null,
    variant_thickness: r.plywood_variant?.thickness ?? null,
    face_veneer_product_name: r.face_veneer_product?.name ?? undefined,
  }));
}

export async function postProductionEntry(params: {
  business_entity_id: string;
  production_date: string;
  plywood_product_id: string;
  plywood_variant_id: string | null;
  sheets_produced: number;
  sqft_produced: number;
  face_veneer_product_id: string;
  face_veneer_ratio: number;
  face_veneer_consumed: number;
  notes?: string | null;
}): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('post_production_entry', {
    p_business_entity_id: params.business_entity_id,
    p_production_date: params.production_date,
    p_plywood_product_id: params.plywood_product_id,
    p_plywood_variant_id: params.plywood_variant_id,
    p_sheets_produced: params.sheets_produced,
    p_sqft_produced: params.sqft_produced,
    p_face_veneer_product_id: params.face_veneer_product_id,
    p_face_veneer_ratio: params.face_veneer_ratio,
    p_face_veneer_consumed: params.face_veneer_consumed,
    p_notes: params.notes || null,
  });
  if (error) { console.error('Error posting production entry:', error); throw error; }
  return data as string;
}

export async function cancelProductionEntry(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error: rpcErr } = await supabase.rpc('cancel_production_entry_atomic', { p_production_id: id });
  if (!rpcErr) return;

  if (rpcErr && rpcErr.code !== '42883' && !rpcErr.message.includes('does not exist')) {
    throw new Error(rpcErr.message);
  }

  const { error } = await supabase
    .from('production_entries')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}
