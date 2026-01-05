import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "");
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // ビルド時や開発環境で env が未設定の場合はコンソールに警告
  // 実行時に確実に設定されている前提で運用してください
  console.warn("VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set");
}

export const client: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

export default client;
