import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'plywood_supabase_url';
const STORAGE_ANON_KEY = 'plywood_supabase_anon_key';
const STORAGE_CONFIGURED_KEY = 'plywood_supabase_configured';

export function getStoredCredentials(): { url: string; key: string } {
  const url = (localStorage.getItem(STORAGE_URL_KEY) || '').trim();
  const key = (localStorage.getItem(STORAGE_ANON_KEY) || '').trim();
  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  const configured = localStorage.getItem(STORAGE_CONFIGURED_KEY) === 'true';
  const { url, key } = getStoredCredentials();
  return Boolean(configured && url && key);
}

export function saveStoredCredentials(url: string, key: string) {
  localStorage.setItem(STORAGE_URL_KEY, url.trim());
  localStorage.setItem(STORAGE_ANON_KEY, key.trim());
}

export function markSupabaseConfigured(url: string, key: string) {
  saveStoredCredentials(url, key);
  localStorage.setItem(STORAGE_CONFIGURED_KEY, 'true');
  resetSupabaseClient(url, key);
}

export function clearStoredCredentials() {
  localStorage.removeItem(STORAGE_URL_KEY);
  localStorage.removeItem(STORAGE_ANON_KEY);
  localStorage.removeItem(STORAGE_CONFIGURED_KEY);
  supabaseInstance = null;
  currentClientUrl = '';
  currentClientKey = '';
}

export function disconnectSupabase() {
  clearStoredCredentials();
}

let supabaseInstance: SupabaseClient | null = null;
let currentClientUrl = '';
let currentClientKey = '';

export function getSupabase(): SupabaseClient {
  const { url, key } = getStoredCredentials();

  // If credentials changed or instance doesn't match active credentials, recreate client
  if (!supabaseInstance || currentClientUrl !== url || currentClientKey !== key) {
    if (!url || !key) {
      supabaseInstance = createClient('https://placeholder.supabase.co', 'placeholder');
      currentClientUrl = '';
      currentClientKey = '';
    } else {
      supabaseInstance = createClient(url, key);
      currentClientUrl = url;
      currentClientKey = key;
    }
  }
  return supabaseInstance;
}

export function resetSupabaseClient(url?: string, key?: string): SupabaseClient {
  if (url && key) {
    saveStoredCredentials(url, key);
  }
  const creds = getStoredCredentials();
  const effectiveUrl = (url || creds.url || '').trim();
  const effectiveKey = (key || creds.key || '').trim();

  if (effectiveUrl && effectiveKey) {
    supabaseInstance = createClient(effectiveUrl, effectiveKey);
    currentClientUrl = effectiveUrl;
    currentClientKey = effectiveKey;
  } else {
    supabaseInstance = createClient('https://placeholder.supabase.co', 'placeholder');
    currentClientUrl = '';
    currentClientKey = '';
  }
  return supabaseInstance;
}

export async function testConnection(
  url?: string, 
  key?: string
): Promise<{ success: boolean; message: string; tablesExist?: boolean }> {
  try {
    const creds = getStoredCredentials();
    const testUrl = (url !== undefined ? url : creds.url).trim();
    const testKey = (key !== undefined ? key : creds.key).trim();

    if (!testUrl || !testKey) {
      return { success: false, message: 'Please provide both Supabase Project URL and Publishable/Anon API Key.' };
    }

    if (!testUrl.startsWith('https://') || !testUrl.includes('.supabase.co')) {
      return { 
        success: false, 
        message: 'Invalid Project URL format. It should look like: https://abcdefghijklm.supabase.co' 
      };
    }

    const tempClient = createClient(testUrl, testKey);
    const requiredTables = ['categories', 'entities', 'transactions', 'business_entities', 'products', 'vouchers', 'journal_entries'];
    const missingTables: string[] = [];
    for (const table of requiredTables) {
      const { error: tableError } = await tempClient.from(table).select('*', { count: 'exact', head: true });
      if (tableError?.code === '42P01' || tableError?.code === 'PGRST205') missingTables.push(table);
      else if (tableError) return { success: false, message: tableError.message };
    }

    if (missingTables.length > 0) {
      // PostgREST error 42P01: relation "categories" does not exist
      return {
        success: true,
        message: `Connected, but the MVP ERP schema is incomplete. Missing: ${missingTables.join(', ')}. Apply supabase/migrations/004_plywood_erp_mvp.sql.`,
        tablesExist: false
      };
    }

    return { 
      success: true, 
      message: 'Connection verified! Supabase tables are ready and accessible.',
      tablesExist: true
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to establish connection with Supabase.' };
  }
}
