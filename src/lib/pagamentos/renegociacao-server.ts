// ---------------------------------------------------------------------------
// A emissao de uma renegociacao (0121) — 2a via, acordo e PRO-RATA (0144) —,
// num lugar so: as rotas de renegociacao e de cancelamento de veiculo usam.
// SO NO SERVIDOR (usa o service_role).
//
// A ORDEM e o que impede o associado de pagar duas vezes ou ficar sem boleto:
//   1. a renegociacao ja foi criada pela SESSAO de quem atende (o banco
//      confere o escopo);
//   2. emite os boletos NOVOS no banco;
//   3. fecha a emissao — qualquer recusa desfaz tudo e os originais ficam;
//   4. so entao pede a BAIXA de cada original (falha fica registrada, com
//      "tentar de novo").
// ---------------------------------------------------------------------------
import { createAdminClient } from '@/lib/supabase/admin';
import {
  escolherIntegracao, getPaymentGateway, MockGateway,
  type CobrancaEmitida, type IntegracaoCandidata, type PaymentGateway,
} from '@/lib/pagamentos';
import { baixaJaFeitaNoBanco } from '@/lib/renegociacao';
import type { Json } from '@/lib/database.types';

export type Admin = ReturnType<typeof createAdminClient>;

export async function resolverGateway(admin: Admin, regionalId: string | null) {
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

export async function baixarOriginais(admin: Admin, gateway: PaymentGateway, renegociacaoId: string) {
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

export interface ClienteDoBoleto {
  nome_razao_social: string;
  cpf_cnpj: string;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  endereco: unknown;
}

export type ResultadoEmissao =
  | { ok: true; erros_baixa: number; provedor: string }
  | { ok: false; erro: string };

/**
 * Passos 2 a 4 para uma renegociacao JA CRIADA. Sem boleto novo (situacao ja
 * EMITIDA — o cancelamento que so baixa), vai direto para a baixa.
 */
export async function emitirRenegociacao(
  admin: Admin,
  gw: Awaited<ReturnType<typeof resolverGateway>>,
  cliente: ClienteDoBoleto,
  renegociacaoId: string,
  descricao: string,
): Promise<ResultadoEmissao> {
  const { data: reneg } = await admin.from('cobranca_renegociacoes')
    .select('situacao').eq('id', renegociacaoId).maybeSingle();

  if (reneg?.situacao === 'EMITINDO') {
    const { data: titulos } = await admin.from('titulos_financeiros')
      .select('id, valor, data_vencimento, renegociacao_parcela')
      .eq('renegociacao_id', renegociacaoId)
      .order('renegociacao_parcela');
    const emitidas: CobrancaEmitida[] = [];
    for (const t of titulos ?? []) {
      try {
        emitidas.push(await gw.gateway.emitir({
          titulo_id: t.id,
          valor: Number(t.valor),
          vencimento: t.data_vencimento,
          descricao,
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

    const { data: situacao, error: errFim } = await admin.rpc('finalizar_emissao_renegociacao', {
      p_id: renegociacaoId,
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
    if (errFim) return { ok: false, erro: errFim.message };

    if (situacao !== 'EMITIDA') {
      // Algum boleto falhou: os que o banco aceitou nao podem ficar soltos por la.
      for (const r of emitidas) {
        if (r.nosso_numero && !r.erro) {
          try { await gw.gateway.cancelar(r.nosso_numero); } catch { /* registrado como ERRO na renegociacao */ }
        }
      }
      const motivo = emitidas.filter((r) => r.erro).map((r) => r.erro).join(' | ') || 'o banco não devolveu a linha digitável';
      return { ok: false, erro: `O banco recusou a emissão: ${motivo}. Nada foi alterado nos boletos originais.` };
    }
  }

  const errosBaixa = await baixarOriginais(admin, gw.gateway, renegociacaoId);
  return { ok: true, erros_baixa: errosBaixa, provedor: gw.gateway.provedor };
}
