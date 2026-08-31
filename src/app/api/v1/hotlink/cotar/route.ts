import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consultarPlacaNoServidor } from '@/lib/fipe-server';
import { normalizarPlaca, placaValida } from '@/lib/placa';
import type { CotacaoPlano } from '@/lib/database.types';

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
  const fipeInformada = Number(body?.valor_fipe ?? 0);

  if (!token) return NextResponse.json({ error: 'Sessao expirada' }, { status: 400 });
  if (!tipoVeiculoId) return NextResponse.json({ error: 'Escolha o tipo do veiculo' }, { status: 400 });

  const admin = createAdminClient();
  const { data: sessoes } = await admin.rpc('lead_por_token_publico', { p_token: token });
  const lead = sessoes?.[0];
  if (!lead) return NextResponse.json({ error: 'Sessao invalida' }, { status: 404 });
  if (!lead.em_negociacao) {
    return NextResponse.json({ error: 'Este atendimento ja foi concluido' }, { status: 400 });
  }

  // 1) Valor do veiculo: FIPE pela placa, ou o que o visitante informou.
  let veiculo: { marca?: string | null; modelo?: string | null; anoModelo?: number | null;
                 valor?: number | null; codigoFipe?: string | null; combustivel?: string | null } = {};
  const placa = placaBruta ? normalizarPlaca(placaBruta) : '';

  if (placa && placaValida(placa)) {
    // Sem token da FIPE, fora do ar ou placa desconhecida: segue com o valor
    // que o visitante informou (a funcao ja devolve null nesses casos).
    const r = await consultarPlacaNoServidor(placa);
    if (r) veiculo = r;
  }

  const valorFipe = Number(veiculo.valor ?? 0) || fipeInformada;
  if (!valorFipe || valorFipe <= 0) {
    return NextResponse.json(
      { error: 'Nao consegui o valor do veiculo. Informe o valor de mercado para cotar.', veiculo },
      { status: 422 },
    );
  }

  // 2) Guarda o que ja sabemos do veiculo no atendimento.
  await admin.from('leads').update({
    placa: placa || null,
    tipo_veiculo_id: tipoVeiculoId,
    marca: veiculo.marca ?? null,
    modelo: veiculo.modelo ?? null,
    ano_modelo: veiculo.anoModelo ?? null,
    valor_fipe: valorFipe,
    codigo_fipe: veiculo.codigoFipe ?? null,
    origem_fipe: veiculo.valor ? 'API' : 'MANUAL',
    ultima_interacao_em: new Date().toISOString(),
  }).eq('id', lead.lead_id);

  // 3) Um preco por plano ativo.
  const { data: planos } = await admin
    .from('planos_protecao')
    .select('id, nome, descricao_comercial, nivel')
    .eq('ativo', true)
    .order('nivel');

  const cotados = [];
  for (const p of planos ?? []) {
    const { data, error } = await admin.rpc('cotar_plano', {
      p_fipe: valorFipe, p_tipo_veiculo_id: tipoVeiculoId, p_plano_id: p.id, p_avulsos_ids: [],
    });
    if (error) continue;
    const c = data as unknown as CotacaoPlano;
    cotados.push({
      plano_id: p.id,
      nome: p.nome,
      descricao: p.descricao_comercial,
      nivel: p.nivel,
      mensalidade: Number(c.valor_total_mensalidade ?? 0),
      adesao: Number(c.taxa_adesao ?? 0),
      participacao: Number(c.franquia_participacao ?? 0),
      itens: (c.detalhamento_produtos ?? []).map((i) => ({ nome: i.nome, valor: i.valor })),
    });
  }

  if (cotados.length === 0) {
    return NextResponse.json({ error: 'Nao ha planos disponiveis para este veiculo agora.' }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    veiculo: {
      placa: placa || null,
      marca: veiculo.marca ?? null,
      modelo: veiculo.modelo ?? null,
      ano: veiculo.anoModelo ?? null,
      valor_fipe: valorFipe,
      origem: veiculo.valor ? 'FIPE' : 'INFORMADO',
    },
    planos: cotados,
  });
}
