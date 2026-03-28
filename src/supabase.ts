import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Try multiple sources for the keys
const getKeys = () => {
  const url = import.meta.env.VITE_SUPABASE_URL || (import.meta as any).env?.SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.SUPABASE_ANON_KEY;
  return { url, key };
};

const isValidUrl = (url: string | undefined): url is string => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

let client: SupabaseClient | null = null;

const { url, key } = getKeys();
if (isValidUrl(url) && key) {
  client = createClient(url, key);
}

export const supabase = client;

// Helper to get signed URL for private files
export const getSignedUrl = async (bucket: string, path: string, expiresIn = 3600) => {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error("Error getting signed URL:", error);
    return null;
  }
  return data.signedUrl;
};

// Helper to check if it's configured
export const isSupabaseConfigured = () => !!supabase;

// Optional: Function to re-initialize if keys are provided later
export const reinitializeSupabase = (url: string, key: string) => {
  if (isValidUrl(url) && key) {
    return createClient(url, key);
  }
  return null;
};
