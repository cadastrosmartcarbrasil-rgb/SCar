import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizarPlaca } from '@/lib/placa';
import type { CotacaoPlano } from '@/lib/database.types';
import { ofertaDosPlanos } from '@/lib/hotlink-planos-server';
import { ordenarPorPreferencia } from '@/lib/planos-oferta';
import { acimaDoLimite, erroValorProtegido, tipoRastreamentoSemProtecao } from '@/lib/limite-fipe';

/**
 * Cotacao publica do hotlink.
 *
 * Roda com service_role porque o visitante nao tem sessao — por isso a unica
 * porta de entrada e o `token` devolvido pela captura, que identifica o
 * atendimento. Sem ele nao ha o que cotar.
 *
 * Consulta a FIPE pela placa (o token da API fica no servidor) e devolve o
 * valor de cada plano ativo para o veiculo informado.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? '').trim();
  const tipoVeiculoId = String(body?.tipo_veiculo_id ?? '').trim();
  const placaBruta = String(body?.placa ?? '').trim();
  // 0180 — o valor FIPE vindo do visitante NAO e aceito: vale so a consulta do servidor.
  // 0165 — FIPE acima da tabela: o visitante protege pelo limite informando o valor protegido.
  const valorProtegido = Number(body?.valor_protegido ?? 0) || null;

  if (!token) return NextResponse.json({ error: 'Sessão expirada' }, { status: 400 });
  if (!tipoVeiculoId) return NextResponse.json({ error: 'Escolha o tipo do veículo' }, { status: 400 });

  const admin = createAdminClient();
  const { data: sessoes } = await admin.rpc('lead_por_token_publico', { p_token: token });
  const lead = sessoes?.[0];
  if (!lead) return NextResponse.json({ error: 'Sessão inválida' }, { status: 404 });
  if (!lead.em_negociacao) {
    return NextResponse.json({ error: 'Este atendimento já foi concluído' }, { status: 400 });
  }

  // A identificacao pela placa ja rodou em /hotlink/veiculo e gravou o que
  // achou no lead. Aqui so precisamos do VALOR: o da FIPE (ja no lead) ou o
  // que o visitante informou quando a placa nao foi encontrada.
  const placa = placaBruta ? normalizarPlaca(placaBruta) : '';
  // Com protecao limitada, `valor_fipe` do lead e o valor protegido: a FIPE de verdade esta ao lado.
  const { data: atual } = await admin.from('leads').select('fipe_consulta_id').eq('id', lead.lead_id).maybeSingle();
  const { data: consulta } = atual?.fipe_consulta_id
    ? await admin.from('fipe_consultas').select('valor').eq('id', atual.fipe_consulta_id).maybeSingle()
    : { data: null };
  const valorFipe = Number(consulta?.valor ?? 0);
  if (!valorFipe || valorFipe <= 0) {
    return NextResponse.json(
      { error: 'Não conseguimos consultar a tabela FIPE deste veículo agora. Tente de novo em instantes ou aguarde: um consultor vai concluir a sua cotação.' },
      { status: 422 },
    );
  }

  // 0165 — acima do limite da tabela do tipo o motor zeraria o casco: a cotacao para e pergunta.
  const { data: limiteBruto } = await admin.rpc('limite_fipe_tipo', { p_tipo_veiculo_id: tipoVeiculoId });
  const limite = limiteBruto == null ? null : Number(limiteBruto);
  let base = valorFipe;
  let mercado: number | null = null;
  if (acimaDoLimite(valorFipe, limite)) {
    if (valorProtegido == null) {
      await admin.from('leads').update({
        placa: placa || null, tipo_veiculo_id: tipoVeiculoId, valor_fipe: valorFipe, valor_fipe_mercado: null,
        origem_fipe: 'API', ultima_interacao_em: new Date().toISOString(),
      }).eq('id', lead.lead_id);
      const { data: tipos } = await admin.from('tipos_veiculo').select('id, nome');
      return NextResponse.json({
        ok: true, valor_fipe: valorFipe, planos: [],
        acima_limite: {
          limite,
          tipo_nome: (tipos ?? []).find((t) => t.id === tipoVeiculoId)?.nome ?? null,
          rastreamento_tipo_id: tipoRastreamentoSemProtecao(tipos ?? [])?.id ?? null,
        },
      });
    }
    const erro = erroValorProtegido(valorProtegido, valorFipe, limite as number);
    if (erro) return NextResponse.json({ error: erro }, { status: 422 });
    base = valorProtegido;
    mercado = valorFipe;
  }

  // O tipo confirmado (ou corrigido) pelo visitante prevalece.
  await admin.from('leads').update({
    placa: placa || null,
    tipo_veiculo_id: tipoVeiculoId,
    valor_fipe: base,
    valor_fipe_mercado: mercado,
    origem_fipe: 'API',
    ultima_interacao_em: new Date().toISOString(),
  }).eq('id', lead.lead_id);

  // 3) QUEM PRECIFICA (0081): a unidade do associado quando ele ja existe,
  //    senao a do proprio lead. Sem isso o hotlink cotaria pela matriz e o
  //    valor mudaria sozinho no fechamento da venda.
  const { data: regionalPreco } = await admin.rpc('regional_preco_do_lead', {
    p_lead_id: lead.lead_id,
  });

  // 4) Um preco por plano ativo.
  const { data: planos } = await admin
    .from('planos_protecao')
    .select('id, nome, descricao_comercial, nivel, preferencial')
    .eq('ativo', true)
    .order('nivel')
    .order('nome');

  // 0162 — so os planos do tipo, cada um com os opcionais pre-marcados.
  const oferta = await ofertaDosPlanos(admin, tipoVeiculoId);
  const cotados = [];
  for (const p of (planos ?? []).filter((x) => oferta.atende(x.id))) {
    const { data, error } = await admin.rpc('cotar_plano', {
      p_fipe: base, p_tipo_veiculo_id: tipoVeiculoId, p_plano_id: p.id, p_avulsos_ids: oferta.avulsosDo(p.id),
      p_regional_id: regionalPreco ?? null,
    });
    if (error) continue;
    const c = data as unknown as CotacaoPlano;
    cotados.push({
      plano_id: p.id,
      nome: p.nome,
      descricao: p.descricao_comercial,
      nivel: p.nivel,
      preferencial: !!p.preferencial,
      mensalidade: Number(c.valor_total_mensalidade ?? 0),
      adesao: Number(c.taxa_adesao ?? 0),
      participacao: Number(c.franquia_participacao ?? 0),
      desconto_base: Number(c.desconto_base_valor ?? 0),
      itens: (c.detalhamento_produtos ?? []).map((i) => ({ nome: i.nome, valor: i.valor })),
    });
  }

  if (cotados.length === 0) {
    return NextResponse.json({ error: 'Não há planos disponíveis para este veículo agora.' }, { status: 422 });
  }

  // 0163 — o preferencial no topo (a pagina ja o deixa escolhido).
  return NextResponse.json({
    ok: true, valor_fipe: valorFipe, planos: ordenarPorPreferencia(cotados),
    protecao_limitada: mercado != null ? { valor_protegido: base, valor_fipe: mercado } : null,
  });
}
