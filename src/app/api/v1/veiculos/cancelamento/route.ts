import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { emitirRenegociacao, resolverGateway } from '@/lib/pagamentos/renegociacao-server';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Json } from '@/lib/database.types';

// POST /api/v1/veiculos/cancelamento — cancela UM veiculo (0144).
//   { veiculo_id, data, motivo, previsao_retorno, data_retorno?, observacao?,
//     cobrar, vencimento?, origens:[{origem,id}] }
//   { acao: 'cobrar', cancelamento_id, cobrar, vencimento?, origens }  -> tenta de novo a cobranca
//
// O cancelamento e a cobranca sao DOIS passos de proposito: o veiculo sai da
// base na hora (e decisao do associado, nao do banco); se o banco recusar o
// boleto do pro-rata, o cancelamento fica e a tela oferece "tentar de novo".
// Toda regra mora no banco (`cancelar_veiculo`, `criar_renegociacao_pro_rata`),
// chamada pela SESSAO de quem atende.
export const dynamic = 'force-dynamic';

const CAMPOS_CLIENTE = 'id, nome_razao_social, cpf_cnpj, email, telefone, celular, endereco, regional_id';

type Corpo = {
  acao?: 'cancelar' | 'cobrar';
  veiculo_id?: string;
  cancelamento_id?: string;
  data?: string;
  motivo?: string;
  previsao_retorno?: boolean;
  data_retorno?: string | null;
  observacao?: string | null;
  cobrar?: boolean;
  vencimento?: string | null;
  origens?: { origem: string; id: string }[];
};

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Corpo;
  const admin = createAdminClient();
  const origens = body.origens ?? [];
  const querCobranca = !!body.cobrar || origens.length > 0;

  // Quem e o veiculo (e o cancelamento, quando e a nova tentativa da cobranca).
  let veiculoId = body.veiculo_id ?? null;
  let cancelamentoId = body.cancelamento_id ?? null;
  let dataCancelamento = body.data ?? null;
  if (body.acao === 'cobrar') {
    if (!cancelamentoId) return NextResponse.json({ error: 'cancelamento_id obrigatório' }, { status: 400 });
    const { data: k } = await supabase.from('veiculo_cancelamentos')
      .select('veiculo_id, data_cancelamento').eq('id', cancelamentoId).maybeSingle();
    if (!k) return NextResponse.json({ error: 'Cancelamento não encontrado' }, { status: 404 });
    veiculoId = k.veiculo_id;
    dataCancelamento = k.data_cancelamento;
  }
  if (!veiculoId || !dataCancelamento) {
    return NextResponse.json({ error: 'veiculo_id e data são obrigatórios' }, { status: 400 });
  }

  const { data: veic } = await admin.from('veiculos')
    .select('id, placa, chassi, cliente_id, regional_id').eq('id', veiculoId).maybeSingle();
  if (!veic) return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 });
  const { data: cliente } = await admin.from('clientes').select(CAMPOS_CLIENTE).eq('id', veic.cliente_id).maybeSingle();
  if (!cliente) return NextResponse.json({ error: 'Associado não encontrado' }, { status: 404 });

  // Gateway ANTES de cancelar: configuracao bancaria errada para aqui, sem
  // deixar o veiculo cancelado e o boleto por fazer.
  let gw: Awaited<ReturnType<typeof resolverGateway>> | null = null;
  if (querCobranca) {
    try {
      gw = await resolverGateway(admin, cliente.regional_id);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  // 1) o cancelamento
  if (body.acao !== 'cobrar') {
    const { data: k, error } = await supabase.rpc('cancelar_veiculo', {
      p_veiculo_id: veiculoId,
      p_data: dataCancelamento,
      p_motivo: body.motivo ?? '',
      p_previsao_retorno: !!body.previsao_retorno,
      p_data_retorno: body.previsao_retorno ? (body.data_retorno ?? null) : null,
      p_observacao: body.observacao ?? null,
    });
    if (error || !k) return NextResponse.json({ error: error?.message ?? 'Falha ao cancelar' }, { status: 400 });
    cancelamentoId = k;

    // O protocolo do atendimento (Central de Protocolos e aba do SAC). Nao bloqueia.
    try {
      const placa = veic.placa ?? `0 KM ${veic.chassi ?? ''}`;
      const { data: at } = await supabase.rpc('abrir_atendimento', {
        p_veiculo_id: veiculoId,
        p_tipo: 'CANCELAMENTO',
        p_canal: 'SAC_INTERNO',
        p_assunto: `Cancelamento do veículo ${placa}`,
        p_descricao: `Motivo: ${body.motivo ?? ''}`
          + (body.previsao_retorno && body.data_retorno ? `\nRetorno previsto: ${formatDate(body.data_retorno)}` : '')
          + (body.observacao ? `\n${body.observacao}` : ''),
        p_dados: { cancelamento_id: k, data_cancelamento: dataCancelamento } as unknown as Json,
      });
      const atId = (at as { id?: string } | null)?.id;
      if (atId) {
        await supabase.rpc('encerrar_protocolo', {
          p_atendimento_id: atId,
          p_solucao: `Veículo cancelado em ${formatDate(dataCancelamento)}.`,
        });
      }
    } catch { /* o cancelamento ja esta gravado em veiculo_cancelamentos */ }
  }

  if (!querCobranca || !gw) {
    return NextResponse.json({ ok: true, cancelamento_id: cancelamentoId, cobranca: null });
  }

  // 2) o boleto do pro-rata e a baixa dos boletos futuros do veiculo
  const { data: reneg, error: errReneg } = await supabase.rpc('criar_renegociacao_pro_rata', {
    p_veiculo_id: veiculoId,
    p_ate: dataCancelamento,
    p_cobrar: !!body.cobrar,
    p_vencimento: body.cobrar ? (body.vencimento ?? null) : null,
    p_origens: origens as unknown as Json,
    p_cancelamento_id: cancelamentoId,
    p_observacao: `Cancelamento em ${formatDate(dataCancelamento)}`,
  });
  if (errReneg) {
    return NextResponse.json({
      ok: true, cancelamento_id: cancelamentoId,
      cobranca: { ok: false, erro: errReneg.message },
    });
  }
  if (!reneg) {
    return NextResponse.json({ ok: true, cancelamento_id: cancelamentoId, cobranca: null });
  }

  const r = await emitirRenegociacao(admin, gw, cliente, reneg, 'Proteção veicular — pró-rata do cancelamento');
  const { data: titulo } = await admin.from('titulos_financeiros')
    .select('id, valor, data_vencimento, linha_digitavel, pix_copia_cola, nosso_numero')
    .eq('renegociacao_id', reneg).maybeSingle();
  return NextResponse.json({
    ok: true,
    cancelamento_id: cancelamentoId,
    cobranca: r.ok
      ? { ok: true, renegociacao_id: reneg, erros_baixa: r.erros_baixa, titulo,
          resumo: titulo ? `Boleto do pró-rata: ${formatCurrency(Number(titulo.valor))}, vence ${formatDate(titulo.data_vencimento)}` : null }
      : { ok: false, renegociacao_id: reneg, erro: r.erro },
  });
}
