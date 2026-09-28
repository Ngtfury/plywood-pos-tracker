import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_URL_KEY = 'plywood_supabase_url';
const STORAGE_ANON_KEY = 'plywood_supabase_anon_key';
const STORAGE_CONFIGURED_KEY = 'plywood_supabase_configured';

export function getStoredCredentials(): { url: string; key: string } {
  const url = localStorage.getItem(STORAGE_URL_KEY) || import.meta.env.VITE_SUPABASE_URL || '';
  const key = localStorage.getItem(STORAGE_ANON_KEY) || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return { url: url.trim(), key: key.trim() };
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
}

export function disconnectSupabase() {
  clearStoredCredentials();
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const { url, key } = getStoredCredentials();
    if (!url || !key) {
      // Fallback placeholder client to prevent unhandled crashes during initial render before onboarding
      supabaseInstance = createClient('https://placeholder.supabase.co', 'placeholder');
    } else {
      supabaseInstance = createClient(url, key);
    }
  }
  return supabaseInstance;
}

export function resetSupabaseClient(url?: string, key?: string): SupabaseClient {
  if (url && key) {
    saveStoredCredentials(url, key);
  }
  const creds = getStoredCredentials();
  if (creds.url && creds.key) {
    supabaseInstance = createClient(creds.url, creds.key);
  } else {
    supabaseInstance = createClient('https://placeholder.supabase.co', 'placeholder');
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
    const { error } = await tempClient.from('categories').select('id', { count: 'exact', head: true });

    if (error) {
      // PostgREST error 42P01: relation "categories" does not exist
      if (error.code === '42P01') {
        return { 
          success: true, 
          message: 'Connected to Supabase! Note: Database schema tables are not created yet. Please execute the SQL script in your Supabase SQL editor.',
          tablesExist: false
        };
      }
      return { success: false, message: error.message };
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
