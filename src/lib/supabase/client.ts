'use client';

// Cliente Supabase para uso no browser (Client Components).
// Respeita RLS: usa a anon key + sessao do usuario (cookies).
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
