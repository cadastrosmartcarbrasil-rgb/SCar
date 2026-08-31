import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validarDocumento } from '@/lib/documento';
import type { CotacaoItem, CotacaoPlano } from '@/lib/database.types';

/**
 * Aceite da proposta na pagina do hotlink.
 *
 * Grava o snapshot da cotacao escolhida e registra o ACEITE — do proprio
 * cliente, no celular dele, ou do vendedor, presencialmente. O banco
 * (`registrar_aceite_venda`) e quem valida e move o lead para a esteira de
 * aprovacao; esta rota so monta a cotacao e repassa a prova do consentimento.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? '').trim();
  const planoId = String(body?.plano_id ?? '').trim();
  const nome = String(body?.nome ?? '').trim();
  const documento = String(body?.documento ?? '').replace(/\D/g, '');
  const por = String(body?.por ?? 'CLIENTE').toUpperCase();

  if (!token) return NextResponse.json({ error: 'Sessao expirada' }, { status: 400 });
  if (!planoId) return NextResponse.json({ error: 'Escolha o plano' }, { status: 400 });
  if (!nome || !nome.includes(' ')) {
    return NextResponse.json({ error: 'Informe o nome completo' }, { status: 400 });
  }
  const tipo = documento.length > 11 ? 'PJ' : 'PF';
  if (!validarDocumento(documento, tipo)) {
    return NextResponse.json({ error: 'CPF/CNPJ invalido' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: sessoes } = await admin.rpc('lead_por_token_publico', { p_token: token });
  const sessao = sessoes?.[0];
  if (!sessao) return NextResponse.json({ error: 'Sessao invalida' }, { status: 404 });

  const { data: lead } = await admin
    .from('leads')
    .select('id, tipo_veiculo_id, valor_fipe, cota_participacao_id')
    .eq('id', sessao.lead_id)
    .maybeSingle();

  if (!lead?.tipo_veiculo_id || !lead.valor_fipe) {
    return NextResponse.json({ error: 'Refaca a cotacao antes de contratar' }, { status: 400 });
  }

  // 1) Snapshot da cotacao escolhida (mesmo formato do CRM).
  const [cot, part] = await Promise.all([
    admin.rpc('cotar_plano', {
      p_fipe: lead.valor_fipe, p_tipo_veiculo_id: lead.tipo_veiculo_id,
      p_plano_id: planoId, p_avulsos_ids: [],
    }),
    admin.rpc('calcular_participacao', {
      p_fipe: lead.valor_fipe, p_tipo_veiculo_id: lead.tipo_veiculo_id,
      p_cota_id: lead.cota_participacao_id ?? null,
    }),
  ]);
  if (cot.error) return NextResponse.json({ error: cot.error.message }, { status: 400 });

  const calc = cot.data as unknown as CotacaoPlano;
  const itens: CotacaoItem[] = (calc.detalhamento_produtos ?? []).map((i) => ({
    produto_id: i.produto_id, nome: i.nome, valor: i.valor, obrigatorio: i.obrigatorio,
  }));

  const { data: cotacao, error: erroCotacao } = await admin
    .from('cotacoes')
    .insert({
      lead_id: lead.id,
      fipe: lead.valor_fipe,
      tipo_veiculo_id: lead.tipo_veiculo_id,
      cota_participacao_id: lead.cota_participacao_id ?? null,
      plano_id: planoId,
      opcionais_ids: [],
      itens,
      total_mensalidade: calc.valor_total_mensalidade,
      participacao: Number(part.data ?? calc.franquia_participacao ?? 0),
      taxa_adesao: Number(calc.taxa_adesao ?? 0),
      modo_envio: 'DETALHADA',
    })
    .select('id, token, total_mensalidade, taxa_adesao')
    .single();
  if (erroCotacao) return NextResponse.json({ error: erroCotacao.message }, { status: 400 });

  // 2) O aceite. Guarda IP e user-agent como prova do consentimento.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip') ?? null;

  const { error: erroAceite } = await admin.rpc('registrar_aceite_venda', {
    p_lead_id: lead.id,
    p_cotacao_id: cotacao.id,
    p_por: por === 'VENDEDOR' ? 'VENDEDOR' : 'CLIENTE',
    p_nome: nome,
    p_documento: documento,
    p_ip: ip,
    p_user_agent: req.headers.get('user-agent'),
  });
  if (erroAceite) return NextResponse.json({ error: erroAceite.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    proposta: cotacao.token,
    mensalidade: cotacao.total_mensalidade,
    adesao: cotacao.taxa_adesao,
  });
}
