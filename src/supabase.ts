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
} else {
  console.warn("Supabase configuration is missing. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your environment variables.");
}

// Export a getter so other files always get the latest client
export const getSupabase = () => client;
export { client as supabase };

// Helper to get signed URL for private files
export const getSignedUrl = async (bucket: string, path: string, expiresIn = 3600) => {
  const currentClient = getSupabase();
  if (!currentClient) return null;
  const { data, error } = await currentClient.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error("Error getting signed URL:", error);
    return null;
  }
  return data.signedUrl;
};

// Helper to check if it's configured
export const isSupabaseConfigured = () => !!getSupabase();

// Optional: Function to re-initialize if keys are provided later
export const reinitializeSupabase = (url: string, key: string) => {
  if (isValidUrl(url) && key) {
    client = createClient(url, key);
    return client;
  }
  return null;
};
