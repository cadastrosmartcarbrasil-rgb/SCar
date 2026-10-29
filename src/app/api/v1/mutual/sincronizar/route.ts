import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { segredoConfere } from '@/lib/baixa-banco';
import { capturarEntidade } from '@/lib/mutual-captura-server';
import { somarBlocosCarga } from '@/lib/mutual';
import type { CobrancaImportacaoBloco } from '@/lib/database.types';
import {
  ENTIDADES_DA_SINCRONIA, PAGINAS_MAXIMAS_SINCRONIA, LOTE_CARGA_AGENDADOR,
  PAGINAS_MAXIMAS_INVOICE, LOTE_BOLETOS_AGENDADOR, modoCapturaInvoice,
  unidadesParaCarregar, equipesSemUnidade, resumoDaSincronia, type PassoSincronia,
} from '@/lib/mutual-sincronia';

// POST /api/v1/mutual/sincronizar — a ROTINA AUTOMATICA da convivencia (0107).
// Chamada pelo crontab do VPS (scripts/mutual-sincronizar.sh), SEM sessao, com
// `x-cron-secret: $COBRANCA_CRON_SECRET` (o mesmo segredo da baixa bancaria —
// um segredo de agendador so, uma linha a menos no .env).
//
// 1) recaptura o que a carga le (equipes, contratos, associados, enderecos,
//    veiculos) — upsert que so regrava o que mudou (0096);
// 2) roda a carga de CADA unidade com equipe ligada, em blocos (0094) — o que
//    ja existe e atualizado, o que foi vendido no Mutual depois da ultima
//    rodada e criado, sempre com `cobranca_externa` (nenhum boleto sai daqui);
// 3) liga o vendedor de quem ficou sem (0095);
// 4) importa o HISTORICO DE EVENTOS (0101) dos associados ja carregados — depois
//    da carga, porque o associado novo so existe depois dela;
// 5) importa o HISTORICO DE BOLETOS (0097/0099) — INVOICE capturado de forma
//    incremental (completa aos domingos), importado em blocos de 2.000;
// 6) relata as equipes NOVAS sem unidade: essas a rotina nao decide.
//
// Captura que falha NAO impede a carga: ela roda com o que ja estava capturado
// (e re-executavel). Demora minutos — o script espera ate 1 h.
export const dynamic = 'force-dynamic';
export const maxDuration = 3600;

export async function POST(request: Request) {
  if (!segredoConfere(request.headers.get('x-cron-secret'), process.env.COBRANCA_CRON_SECRET)) {
    // 404 e nao 401: a rota nao se anuncia para quem nao tem o segredo.
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }
  const token = process.env.MUTUAL_API_TOKEN;
  const base = (process.env.MUTUAL_API_BASE || 'https://smartcar-api.mutualignit.com.br').replace(/\/+$/, '');
  if (!token) return NextResponse.json({ ok: false, error: 'MUTUAL_API_TOKEN não configurado' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { sem_captura?: boolean };
  const supabase = createAdminClient();
  const passos: PassoSincronia[] = [];
  const inicio = new Date().toISOString();

  // ---------------------------------------------------------------- captura
  if (!body.sem_captura) {
    for (const entidade of ENTIDADES_DA_SINCRONIA) {
      const r = await capturarEntidade(supabase, base, token, entidade, {
        maxPaginas: PAGINAS_MAXIMAS_SINCRONIA, usuarioId: null,
      });
      passos.push({
        etapa: `captura ${entidade}`,
        ok: r.ok && r.proxima_pagina === null,
        detalhe: r.ok
          ? `${r.registros} registro(s) em ${r.paginas} página(s)${r.proxima_pagina ? ' — PAROU NO TETO' : ''}`
          : r.erro ?? 'falhou',
      });
    }
  }

  // --------------------------------------------- boletos (INVOICE) incremental
  // A marca e a ULTIMA captura de INVOICE da propria rotina que terminou inteira
  // (sem erro); a da tela vem em blocos e nao prova que pegou tudo.
  if (!body.sem_captura) {
    const { data: marca } = await supabase
      .from('mutual_sincronias')
      .select('iniciada_em')
      .eq('entidade', 'INVOICE').is('executada_por', null).is('erro', null)
      .not('concluida_em', 'is', null)
      .order('iniciada_em', { ascending: false }).limit(1).maybeSingle();
    let modo = modoCapturaInvoice(marca?.iniciada_em ?? null, new Date());
    let r = await capturarEntidade(supabase, base, token, 'INVOICE', {
      maxPaginas: PAGINAS_MAXIMAS_INVOICE, usuarioId: null,
      updatedAtGte: modo.completa ? undefined : modo.desde,
    });
    // Incremental recusado pelo Mutual (foi o HTTP 400 de 26 a 29/10/2026) nao pode
    // deixar a rotina dias sem boleto: cai na passada completa na mesma rodada.
    if (!r.ok && !modo.completa) {
      modo = { completa: true, motivo: `incremental falhou: ${r.erro ?? 'erro'}` };
      r = await capturarEntidade(supabase, base, token, 'INVOICE', {
        maxPaginas: PAGINAS_MAXIMAS_INVOICE, usuarioId: null,
      });
    }
    const parouNoTeto = r.ok && r.proxima_pagina !== null;
    // Parar no teto NAO pode virar marca: a proxima rodada voltaria a ser incremental
    // a partir de uma captura que nao pegou tudo.
    if (parouNoTeto && r.sincronia_id) {
      await supabase.from('mutual_sincronias')
        .update({ erro: 'parou no teto de paginas' }).eq('id', r.sincronia_id as never);
    }
    passos.push({
      etapa: 'captura INVOICE',
      ok: r.ok && !parouNoTeto,
      detalhe: r.ok
        ? `${modo.completa ? `completa (${modo.motivo})` : `incremental desde ${modo.desde}`}: `
          + `${r.registros} registro(s) em ${r.paginas} página(s)${parouNoTeto ? ' — PAROU NO TETO' : ''}`
        : r.erro ?? 'falhou',
    });
  }

  // ------------------------------------------------- unidades e equipes novas
  const { data: vinc, error: eVinc } = await supabase
    .from('integracao_vinculos')
    .select('id_externo, registro_id')
    .eq('sistema', 'MUTUAL').eq('entidade', 'SALE_TEAM');
  if (eVinc) {
    passos.push({ etapa: 'ler equipes ligadas', ok: false, detalhe: eVinc.message });
    return NextResponse.json({ ok: false, resumo: resumoDaSincronia(passos), passos }, { status: 502 });
  }
  const unidades = unidadesParaCarregar(vinc ?? []);
  const ligadas = new Set((vinc ?? []).map((v) => v.id_externo));

  // So os contratos que MUDARAM nesta rodada: a fila e do que acabou de chegar.
  let semUnidade: ReturnType<typeof equipesSemUnidade> = [];
  {
    const { data, error } = await supabase
      .from('mutual_captura')
      .select('sales_team_id:payload->>sales_team_id')
      .eq('entidade', 'CONTRACT')
      .gte('capturado_em', inicio)
      .limit(5000);
    if (!error) semUnidade = equipesSemUnidade((data ?? []) as Array<{ sales_team_id: string | null }>, ligadas);
  }

  const { data: regs } = await supabase.from('regionais').select('id, nome').in('id', unidades);
  const nomeDa = new Map((regs ?? []).map((r) => [r.id, r.nome]));

  // ------------------------------------------------------- carga por unidade
  const cargas: Array<{ unidade: string; veiculos_criados: number; veiculos_atualizados: number;
    clientes_criados: number; recusados: number; vendedores?: string }> = [];
  for (const regionalId of unidades) {
    const nome = nomeDa.get(regionalId) ?? regionalId;
    try {
      const chamar = async (preparar: boolean) => {
        const { data, error } = await supabase.rpc('mutual_executar_carga', {
          p_regional_id: regionalId, p_incluir_inativos: false, p_confirmar: true,
          p_lote: LOTE_CARGA_AGENDADOR, p_preparar: preparar,
        });
        if (error) throw new Error(error.message);
        const r = (data ?? [])[0];
        if (!r) throw new Error('o banco não devolveu o resultado da carga');
        return r;
      };
      const preparo = await chamar(true);
      const blocos = [preparo];
      const total = Number(preparo.restantes);
      let restantes = total;
      let voltas = 0;
      while (restantes > 0) {
        if (++voltas > total + 1) throw new Error('a fila da carga não esvaziou');
        const b = await chamar(false);
        blocos.push(b);
        restantes = Number(b.restantes);
      }
      const soma = somarBlocosCarga(blocos);

      let vendedores: string | undefined;
      const { data: v, error: eV } = await supabase.rpc('mutual_vincular_vendedores', {
        p_regional_id: regionalId, p_confirmar: true,
      });
      vendedores = eV ? `vendedores nao ligados: ${eV.message}` : (v ?? [])[0]?.mensagem;

      cargas.push({
        unidade: nome,
        veiculos_criados: Number(soma.veiculos_criados),
        veiculos_atualizados: Number(soma.veiculos_atualizados),
        clientes_criados: Number(soma.clientes_criados),
        recusados: Number(soma.recusados),
        vendedores,
      });
      passos.push({
        etapa: `carga ${nome}`, ok: true,
        detalhe: `${soma.veiculos_criados} veículo(s) novo(s), ${soma.veiculos_atualizados} atualizado(s), ${soma.recusados} recusado(s)`,
      });
    } catch (e) {
      passos.push({ etapa: `carga ${nome}`, ok: false, detalhe: (e as Error).message });
    }
  }

  // ------------------------------------------- historico de eventos (0101)
  // Re-executavel e so regrava o que mudou; ~1,5 s em 23/10/2026 (2.914 eventos).
  {
    const { data, error } = await supabase.rpc('mutual_importar_eventos_historico', { p_confirmar: true });
    const r = (data ?? [])[0];
    passos.push(error || !r
      ? { etapa: 'historico de eventos', ok: false, detalhe: error?.message ?? 'o banco não devolveu o resultado' }
      : { etapa: 'historico de eventos', ok: true,
          detalhe: `${r.gravados} gravado(s)/atualizado(s); ${r.importaveis} de ${r.lidos} com associado na base` });
  }

  // ------------------------------------------ historico de boletos (0097/0099)
  // Passada inteira sobre o INVOICE capturado, em blocos pelo cursor: re-executavel,
  // so regrava o que mudou (0096) e respeita o pago pelo banco (0117) e o
  // renegociado/substituido (0121/0140), que os gatilhos protegem.
  {
    let cursor: string | null = null;
    let lidos = 0, gravados = 0, blocos = 0;
    let erro: string | null = null;
    let fim = false;
    for (let i = 0; i < 1000; i++) {
      const resp: { data: CobrancaImportacaoBloco[] | null; error: { message: string } | null } =
        await supabase.rpc('cobranca_importar_historico_mutual', {
          p_cursor: cursor, p_lote: LOTE_BOLETOS_AGENDADOR, p_confirmar: true,
        });
      if (resp.error) { erro = resp.error.message; break; }
      const b: CobrancaImportacaoBloco | undefined = (resp.data ?? [])[0];
      if (!b) { fim = true; break; }
      blocos += 1;
      lidos += Number(b.lidos);
      gravados += Number(b.gravados);
      if (b.fim || !b.proximo_cursor) { fim = true; break; }
      cursor = b.proximo_cursor;
    }
    passos.push({
      etapa: 'historico de boletos',
      ok: !erro && fim,
      detalhe: erro
        ? `${erro} (parou depois de ${blocos} bloco(s), ${gravados} gravado(s))`
        : `${gravados} gravado(s)/atualizado(s) em ${lidos} lido(s), ${blocos} bloco(s)${fim ? '' : ' — NAO TERMINOU'}`,
    });
  }

  const ok = passos.every((p) => p.ok);
  return NextResponse.json({
    ok,
    resumo: resumoDaSincronia(passos),
    passos,
    cargas,
    equipes_sem_unidade: semUnidade,
  }, { status: ok ? 200 : 207 });
}
