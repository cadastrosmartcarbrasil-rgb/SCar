import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * A logo OFICIAL (Configuracoes -> Empresa, `empresa.logo_url`) para qualquer
 * tela, com ou sem sessao.
 *
 * Por que pelo service_role: a policy `empresa_select` e `is_staff()`. Antes do
 * login (as telas de entrada) e para o associado do /portal a leitura pela
 * sessao volta vazia, e a tela caia no desenho de reserva
 * (`public/logo-smartcar.svg`) — uma marca que nao e a oficial. Aqui so sai a
 * URL da logo, que ja e publica (bucket `empresa`).
 *
 * Nunca derruba a pagina: sem env (build) ou com erro, devolve null e o
 * componente usa a reserva.
 */
export const logoOficial = cache(async (): Promise<string | null> => {
  try {
    const { data } = await createAdminClient()
      .from('empresa').select('logo_url').limit(1).maybeSingle();
    return data?.logo_url || null;
  } catch {
    return null;
  }
});
