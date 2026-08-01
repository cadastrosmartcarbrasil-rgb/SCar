import 'server-only';

// Cliente com service_role. BYPASSA o RLS.
// Use APENAS em Route Handlers / Server Actions para operacoes administrativas
// controladas (ex.: emissao de boletos em lote, provisionamento de usuarios).
// NUNCA importe em Client Components.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
