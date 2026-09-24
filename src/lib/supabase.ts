import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'plywood_supabase_url';
const STORAGE_ANON_KEY = 'plywood_supabase_anon_key';

const DEFAULT_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qcwbbtfdqqltatelrowl.supabase.co';
const DEFAULT_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Ulm9OrpI2gjAOxOTaNO1mQ_HdyCHDml';

export function getStoredCredentials() {
  const url = localStorage.getItem(STORAGE_URL_KEY) || DEFAULT_URL;
  const key = localStorage.getItem(STORAGE_ANON_KEY) || DEFAULT_KEY;
  return { url, key };
}

export function saveStoredCredentials(url: string, key: string) {
  localStorage.setItem(STORAGE_URL_KEY, url.trim());
  localStorage.setItem(STORAGE_ANON_KEY, key.trim());
}

export function clearStoredCredentials() {
  localStorage.removeItem(STORAGE_URL_KEY);
  localStorage.removeItem(STORAGE_ANON_KEY);
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const { url, key } = getStoredCredentials();
    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

export function resetSupabaseClient(url?: string, key?: string): SupabaseClient {
  if (url && key) {
    saveStoredCredentials(url, key);
  }
  const creds = getStoredCredentials();
  supabaseInstance = createClient(creds.url, creds.key);
  return supabaseInstance;
}

export async function testConnection(url?: string, key?: string): Promise<{ success: boolean; message: string }> {
  try {
    const testUrl = url || getStoredCredentials().url;
    const testKey = key || getStoredCredentials().key;

    if (!testUrl || !testKey) {
      return { success: false, message: 'Supabase URL or Key is missing.' };
    }

    const tempClient = createClient(testUrl, testKey);
    const { error } = await tempClient.from('categories').select('id', { count: 'exact', head: true });

    if (error) {
      // If table doesn't exist yet, it's still a valid connection to Supabase!
      if (error.code === '42P01') {
        return { success: true, message: 'Connected to Supabase! (Note: Tables are not created yet. Please execute the SQL schema script).' };
      }
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Successfully connected to Supabase database!' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to connect to Supabase.' };
  }
}
