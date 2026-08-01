import 'server-only';

// Cliente Supabase para Server Components, Server Actions e Route Handlers.
// Le/escreve a sessao via cookies do Next. Respeita RLS.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado a partir de um Server Component: pode ser ignorado quando
            // ha um middleware atualizando a sessao.
          }
        },
      },
    },
  );
}
