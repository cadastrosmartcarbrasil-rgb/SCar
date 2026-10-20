import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  escolherIntegracao, getPaymentGateway, MockGateway,
  type CobrancaEmitida, type IntegracaoCandidata, type PaymentGateway,
} from '@/lib/pagamentos';
import { baixaJaFeitaNoBanco } from '@/lib/renegociacao';
import type { Json } from '@/lib/database.types';

// POST /api/v1/cobrancas/renegociacao — 2a via vencida e boleto NEGOCIADO NA HORA (0121).
//   { acao: 'criar', cliente_id, tipo: 'SEGUNDA_VIA'|'ACORDO', origens:[{origem,id}],
//     parcelas:[{vencimento,valor}], acordo_id?, observacao? }
//   { acao: 'baixar', renegociacao_id }   -> tenta de novo a baixa dos originais
//
// A ORDEM e o que impede o associado de pagar duas vezes ou ficar sem boleto:
//   1. `criar_renegociacao` pela SESSAO de quem atende (o banco confere o escopo);
//   2. emite os boletos NOVOS no Sicredi;
//   3. fecha a emissao — qualquer recusa desfaz tudo e os originais ficam intactos;
//   4. so entao pede a BAIXA de cada original no banco (falha fica registrada,
//      com "tentar de novo").
export const dynamic = 'force-dynamic';

type Admin = ReturnType<typeof createAdminClient>;

async function resolverGateway(admin: Admin, regionalId: string | null) {
  const { data: integracoes, error } = await admin
    .from('integracoes_bancarias')
    .select('id, nome, provedor, ambiente, api_url, api_key, api_token_extra, webhook_secret, regional_id, is_padrao, ativo')
    .eq('ativo', true)
    .eq('is_padrao', true);
  if (error) throw new Error(error.message);
  const integracao = escolherIntegracao((integracoes ?? []) as IntegracaoCandidata[], regionalId);
  const gateway = getPaymentGateway(integracao);
  // Boleto ficticio na mao do associado e pior que nenhum: sem banco real, para.
  if (gateway instanceof MockGateway && process.env.NODE_ENV === 'production') {
    throw new Error('Nenhuma integração bancária ativa (Configurações -> Integrações bancárias): o boleto não seria real.');
  }
  return { gateway, integracaoId: integracao?.id ?? null };
}

async function baixarOriginais(admin: Admin, gateway: PaymentGateway, renegociacaoId: string) {
  const { data: origens } = await admin
    .from('cobranca_renegociacao_origens')
    .select('id, origem, nosso_numero, baixa_status')
    .eq('renegociacao_id', renegociacaoId)
    .in('baixa_status', ['PENDENTE', 'ERRO']);
  let erros = 0;
  for (const o of origens ?? []) {
    if (!o.nosso_numero) {
      // So o titulo do SCar chega aqui sem nosso numero (nunca foi ao banco).
      await admin.rpc('registrar_baixa_original', { p_origem_id: o.id, p_status: 'SEM_REGISTRO' });
      continue;
    }
    try {
      await gateway.cancelar(o.nosso_numero);
      await admin.rpc('registrar_baixa_original', { p_origem_id: o.id, p_status: 'BAIXADO' });
    } catch (e) {
      const msg = (e as Error).message;
      if (baixaJaFeitaNoBanco(msg)) {
        // O banco ja tinha baixado (prazo vencido): o original nao pode mais ser pago.
        await admin.rpc('registrar_baixa_original', { p_origem_id: o.id, p_status: 'BAIXADO' });
        continue;
      }
      erros++;
      await admin.rpc('registrar_baixa_original', {
        p_origem_id: o.id, p_status: 'ERRO', p_erro: msg.slice(0, 500),
      });
    }
  }
  return erros;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    acao?: 'criar' | 'baixar';
    cliente_id?: string;
    tipo?: string;
    origens?: { origem: string; id: string }[];
    parcelas?: { vencimento: string; valor: number }[];
    acordo_id?: string | null;
    observacao?: string | null;
    renegociacao_id?: string;
  };
  const admin = createAdminClient();

  // ---- tentar de novo a baixa dos originais
  if (body.acao === 'baixar') {
    if (!body.renegociacao_id) return NextResponse.json({ error: 'renegociacao_id obrigatório' }, { status: 400 });
    const { data: r } = await admin.from('cobranca_renegociacoes')
      .select('id, cliente_id, regional_id, situacao').eq('id', body.renegociacao_id).maybeSingle();
    if (!r) return NextResponse.json({ error: 'Renegociação não encontrada' }, { status: 404 });
    const { data: pode } = await supabase.rpc('cobranca_pode_cliente', { p_cliente_id: r.cliente_id });
    if (!pode) return NextResponse.json({ error: 'Fora do seu escopo de cobrança' }, { status: 403 });
    if (r.situacao !== 'EMITIDA') return NextResponse.json({ error: 'O boleto novo não foi emitido' }, { status: 400 });
    try {
      const { gateway } = await resolverGateway(admin, r.regional_id);
      const erros = await baixarOriginais(admin, gateway, r.id);
      return NextResponse.json({ ok: true, erros_baixa: erros });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  // ---- criar + emitir + baixar
  if (!body.cliente_id) return NextResponse.json({ error: 'cliente_id obrigatório' }, { status: 400 });

  const { data: cliente } = await admin.from('clientes')
    .select('id, nome_razao_social, cpf_cnpj, email, telefone, celular, endereco, regional_id')
    .eq('id', body.cliente_id).maybeSingle();
  if (!cliente) return NextResponse.json({ error: 'Associado não encontrado' }, { status: 404 });

  // Gateway ANTES de criar: configuracao errada para aqui, sem deixar nada pela metade.
  let gw: Awaited<ReturnType<typeof resolverGateway>>;
  try {
    gw = await resolverGateway(admin, cliente.regional_id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // 1) pela sessao: e o banco que diz se quem atende pode negociar este associado
  const { data: id, error: errCria } = await supabase.rpc('criar_renegociacao', {
    p_cliente_id: body.cliente_id,
    p_tipo: body.tipo ?? 'SEGUNDA_VIA',
    p_origens: (body.origens ?? []) as unknown as Json,
    p_parcelas: (body.parcelas ?? []) as unknown as Json,
    p_acordo_id: body.acordo_id ?? null,
    p_observacao: body.observacao ?? null,
  });
  if (errCria || !id) return NextResponse.json({ error: errCria?.message ?? 'Falha ao criar' }, { status: 400 });

  // 2) emite os boletos novos
  const { data: titulos } = await admin.from('titulos_financeiros')
    .select('id, valor, data_vencimento, renegociacao_parcela')
    .eq('renegociacao_id', id)
    .order('renegociacao_parcela');
  const emitidas: CobrancaEmitida[] = [];
  for (const t of titulos ?? []) {
    try {
      emitidas.push(await gw.gateway.emitir({
        titulo_id: t.id,
        valor: Number(t.valor),
        vencimento: t.data_vencimento,
        descricao: 'Mensalidade de proteção veicular (negociada)',
        pagador: {
          nome: cliente.nome_razao_social,
          cpf_cnpj: cliente.cpf_cnpj,
          email: cliente.email,
          telefone: cliente.celular ?? cliente.telefone,
          endereco: (cliente.endereco ?? null) as Record<string, string | null> | null,
        },
      }));
    } catch (e) {
      emitidas.push({ titulo_id: t.id, erro: (e as Error).message });
    }
  }

  // 3) fecha a emissao
  const { data: situacao, error: errFim } = await admin.rpc('finalizar_emissao_renegociacao', {
    p_id: id,
    p_integracao_id: gw.integracaoId,
    p_retornos: emitidas.map((r) => ({
      titulo_id: r.titulo_id,
      nosso_numero: r.nosso_numero ?? null,
      linha_digitavel: r.linha_digitavel ?? null,
      pix_copia_cola: r.pix_copia_cola ?? null,
      gateway_id: r.gateway_transacao_id ?? null,
      erro: r.erro ?? null,
    })) as unknown as Json,
  });
  if (errFim) return NextResponse.json({ error: errFim.message, renegociacao_id: id }, { status: 500 });

  if (situacao !== 'EMITIDA') {
    // Algum boleto falhou: os que o banco aceitou nao podem ficar soltos por la.
    for (const r of emitidas) {
      if (r.nosso_numero && !r.erro) {
        try { await gw.gateway.cancelar(r.nosso_numero); } catch { /* registrado como ERRO na renegociacao */ }
      }
    }
    const motivo = emitidas.filter((r) => r.erro).map((r) => r.erro).join(' | ') || 'o banco não devolveu a linha digitável';
    return NextResponse.json({
      error: `O banco recusou a emissão: ${motivo}. Nada foi alterado nos boletos originais.`,
      renegociacao_id: id,
    }, { status: 400 });
  }

  // 4) baixa dos originais
  const errosBaixa = await baixarOriginais(admin, gw.gateway, id);
  return NextResponse.json({ ok: true, renegociacao_id: id, provedor: gw.gateway.provedor, erros_baixa: errosBaixa });
}
