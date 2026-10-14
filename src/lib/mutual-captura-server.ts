import 'server-only';
import {
  ENTIDADES_PAGINADAS, urlMutual, cabecalhoMutual, extrairLista, extrairTotal,
  temProximaPagina, resumoDoCorpo, type EntidadeMutual,
} from '@/lib/mutual';
import type { Database, Json } from '@/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

// O laco de captura GENERICO (paginas -> mutual_registrar_captura), num lugar
// so: serve a tela (/api/v1/mutual, um bloco por chamada) e o agendador
// (/api/v1/mutual/sincronizar, a entidade inteira). PLAN e
// CONTRACT_OBJECT_PRODUCT tem captura propria e nao passam por aqui.

export const PAGE_SIZE_MUTUAL = 500;   // teto declarado no contrato

export interface OpcoesCaptura {
  paginaInicial?: number;
  maxPaginas?: number;
  tamanho?: number;
  updatedAtGte?: string;
  usuarioId?: string | null;           // null = o agendador (sem sessao)
}

export interface ResultadoCaptura {
  ok: boolean;
  entidade: EntidadeMutual;
  paginas: number;
  registros: number;
  total_remoto: number | null;
  proxima_pagina: number | null;
  erro?: string;
}

export async function capturarEntidade(
  // A tela passa o cliente da sessao; o agendador, o service_role.
  supabase: SupabaseClient<Database>,
  base: string,
  token: string,
  entidade: EntidadeMutual,
  op: OpcoesCaptura = {},
): Promise<ResultadoCaptura> {
  const pagina0 = Math.max(op.paginaInicial ?? 1, 1);
  const maxPaginas = Math.max(op.maxPaginas ?? 5, 1);
  const tamanho = Math.min(Math.max(op.tamanho ?? PAGE_SIZE_MUTUAL, 1), 500);
  const paginada = ENTIDADES_PAGINADAS.includes(entidade);

  const { data: sinc } = await supabase
    .from('mutual_sincronias')
    .insert({ entidade, executada_por: op.usuarioId ?? null })
    .select('id').maybeSingle();

  let paginas = 0;
  let registros = 0;
  let total: number | null = null;
  let proxima: number | null = null;

  const fechar = async (erro?: string) => {
    if (!sinc?.id) return;
    await supabase.from('mutual_sincronias').update({
      concluida_em: new Date().toISOString(), paginas, registros, total_remoto: total,
      ...(erro ? { erro } : {}),
    }).eq('id', sinc.id);
  };

  try {
    for (let i = 0; i < maxPaginas; i++) {
      const pagina = pagina0 + i;
      const url = urlMutual(base, entidade, {
        page: paginada ? pagina : undefined,
        page_size: paginada ? tamanho : undefined,
        updated_at__gte: op.updatedAtGte || undefined,
      });
      const res = await fetch(url, { headers: cabecalhoMutual(token), cache: 'no-store' });
      if (!res.ok) {
        // O motivo da recusa vai junto: "HTTP 400" sozinho manda a proxima pessoa chutar.
        const detalhe = resumoDoCorpo(await res.text().catch(() => ''));
        throw new Error(`HTTP ${res.status} em ${url}${detalhe ? ` — ${detalhe}` : ''}`);
      }
      const corpo = (await res.json()) as unknown;

      const lista = extrairLista(corpo);
      total = total ?? extrairTotal(corpo);
      paginas += 1;
      if (lista.length > 0) {
        const { data: n, error } = await supabase.rpc('mutual_registrar_captura', {
          p_entidade: entidade,
          p_registros: lista as unknown as Json,
        });
        if (error) throw new Error(error.message);
        registros += n ?? 0;
      }
      proxima = null;
      if (!paginada || !temProximaPagina(corpo, tamanho)) break;
      proxima = pagina + 1;
    }
    await fechar();
    return { ok: true, entidade, paginas, registros, total_remoto: total, proxima_pagina: proxima };
  } catch (e) {
    const erro = (e as Error).message;
    await fechar(erro);
    return { ok: false, entidade, paginas, registros, total_remoto: total, proxima_pagina: proxima, erro };
  }
}
