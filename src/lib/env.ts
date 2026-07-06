// Only VITE_* vars are exposed to the browser bundle (Vite convention).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://example.supabase.co';
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'missing-publishable-key';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'https://example.azurewebsites.net/api';
const azureFunctionKey = import.meta.env.VITE_AZURE_FUNCTION_KEY ?? 'missing-function-key';

const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) && Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const hasApiConfig =
  Boolean(import.meta.env.VITE_API_BASE_URL) && Boolean(import.meta.env.VITE_AZURE_FUNCTION_KEY);

export const env = {
  supabaseUrl,
  supabasePublishableKey,
  apiBaseUrl,
  azureFunctionKey,
  hasSupabaseConfig,
  hasApiConfig,
};

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!import.meta.env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!import.meta.env.VITE_API_BASE_URL) missing.push('VITE_API_BASE_URL');
  if (!import.meta.env.VITE_AZURE_FUNCTION_KEY) missing.push('VITE_AZURE_FUNCTION_KEY');
  return missing;
}
