import '@/lib/polyfills';
import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const isServer = typeof window === 'undefined';

/** Build a storage adapter only when we actually need it (runtime), never on SSR */
function createStorageAdapter() {
  if (isServer) {
    // SSR / prerender: harmless in-memory store to avoid touching window/localStorage
    const mem: Record<string, string> = {};
    return {
      getItem: async (k: string) => mem[k] ?? null,
      setItem: async (k: string, v: string) => { mem[k] = v; },
      removeItem: async (k: string) => { delete mem[k]; },
    };
  }

  if (Platform.OS === 'web') {
    // Web runtime: use localStorage
    return {
      getItem: async (k: string) => window.localStorage.getItem(k),
      setItem: async (k: string, v: string) => { window.localStorage.setItem(k, v); },
      removeItem: async (k: string) => { window.localStorage.removeItem(k); },
    };
  }

  // Native (iOS/Android): AsyncStorage
  return {
    getItem: (k: string) => AsyncStorage.getItem(k),
    setItem: (k: string, v: string) => AsyncStorage.setItem(k, v),
    removeItem: (k: string) => AsyncStorage.removeItem(k),
  };
}

let _client: SupabaseClient | null = null;

/** Preferred: call this to safely get the client at runtime */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (isServer) {
    // If anything tries to use the client during SSR, fail fast (prevents silent crashes)
    throw new Error('Supabase client requested on the server (SSR).');
  }
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: createStorageAdapter() as any,
      autoRefreshToken: true,
      persistSession: true,
      // You had this false; keep it unless you do email redirect on web
      detectSessionInUrl: false,
    },
  });
  return _client;
}

/**
 * Backwards-compatible export: modules that already do `import { supabase } from '@/lib/supabase'`
 * will still work in the browser. During SSR this is a typed null that must not be used.
 */
export const supabase: SupabaseClient = isServer
  // @ts-expect-error — SSR placeholder; do not use on the server
  ? null
  : getSupabase();
