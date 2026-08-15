import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPaymentGateway, type CobrancaEmitida, type CobrancaInput, type GatewayConfig } from '@/lib/pagamentos';

// POST /api/v1/cobrancas/remessa
// Envia um LOTE de titulos para a API bancaria:
//   1. monta a fila (titulos sem linha digitavel da competencia/regional, ou a
//      lista informada em `titulo_ids`);
//   2. cria a remessa (`criar_remessa_cobranca`) e marca como enviada;
//   3. chama o gateway (hoje MOCK; troca-se so a integracao cadastrada);
//   4. grava o retorno por titulo (linha digitavel, PDF, PIX) e fecha a remessa.
//
// A etapa 3 e o unico ponto que fala com o banco — quando a API real entrar,
// nada aqui muda: `getPaymentGateway` devolve o adaptador do provedor.
export const dynamic = 'force-dynamic';

interface Body {
  competencia?: string | null;   // 'YYYY-MM' (default: todas as pendentes)
  regional_id?: string | null;
  titulo_ids?: string[] | null;  // opcional: lote manual
  limite?: number;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil || !['admin', 'financeiro'].includes(perfil.papel)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const competencia = body.competencia ? `${body.competencia.slice(0, 7)}-01` : null;

  // 1) Fila de titulos a registrar no banco
  let tituloIds = body.titulo_ids ?? [];
  if (tituloIds.length === 0) {
    const { data: fila, error } = await supabase.rpc('titulos_para_remessa', {
      p_competencia: competencia,
      p_regional_id: body.regional_id ?? null,
      p_limite: body.limite ?? 500,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    tituloIds = (fila ?? []).map((t) => t.id);
  }
  if (tituloIds.length === 0) {
    return NextResponse.json({ ok: true, remessa: null, enviados: 0, mensagem: 'Nenhum titulo pendente de envio' });
  }

  // 2) Remessa
  const { data: remessa, error: errRem } = await supabase.rpc('criar_remessa_cobranca', {
    p_titulo_ids: tituloIds,
    p_integracao_id: null,
    p_referencia: competencia ? `competencia ${competencia.slice(0, 7)}` : 'lote manual',
  });
  if (errRem || !remessa) return NextResponse.json({ error: errRem?.message ?? 'Falha ao criar remessa' }, { status: 400 });

  const { data: itens } = await supabase
    .from('cobranca_remessa_itens')
    .select('titulo_id, titulos_financeiros(id, valor, data_vencimento, cliente_id, clientes(nome_razao_social, cpf_cnpj, email, telefone))')
    .eq('remessa_id', remessa.id);

  if (!itens || itens.length === 0) {
    return NextResponse.json({ ok: true, remessa, enviados: 0, mensagem: 'Nenhum titulo elegivel no lote' });
  }

  await supabase.rpc('marcar_remessa_enviada', { p_remessa_id: remessa.id });

  // 3) Gateway (integracao padrao ativa; sem credencial cai no MOCK)
  const { data: integracao } = await supabase
    .from('integracoes_bancarias')
    .select('id, nome, provedor, ambiente, api_url, api_key, api_token_extra, webhook_secret')
    .eq('ativo', true)
    .eq('is_padrao', true)
    .maybeSingle();
  const gateway = getPaymentGateway((integracao as GatewayConfig | null) ?? null);

  type ItemRel = {
    titulo_id: string;
    titulos_financeiros?: {
      valor: number;
      data_vencimento: string;
      clientes?: { nome_razao_social: string; cpf_cnpj: string; email: string | null; telefone: string | null } | null;
    } | null;
  };
  const cobrancas: CobrancaInput[] = (itens as unknown as ItemRel[]).map((i) => ({
    titulo_id: i.titulo_id,
    valor: Number(i.titulos_financeiros?.valor ?? 0),
    vencimento: i.titulos_financeiros?.data_vencimento ?? new Date().toISOString().slice(0, 10),
    descricao: 'Mensalidade de protecao veicular',
    pagador: {
      nome: i.titulos_financeiros?.clientes?.nome_razao_social ?? '',
      cpf_cnpj: i.titulos_financeiros?.clientes?.cpf_cnpj ?? '',
      email: i.titulos_financeiros?.clientes?.email ?? null,
      telefone: i.titulos_financeiros?.clientes?.telefone ?? null,
    },
  }));

  let emitidas: CobrancaEmitida[];
  try {
    emitidas = await gateway.emitirLote(cobrancas);
  } catch (e) {
    // Falha global (ex.: gateway sem implementacao): marca todos como erro.
    emitidas = cobrancas.map((c) => ({ titulo_id: c.titulo_id, erro: (e as Error).message }));
  }

  // 4) Retorno por titulo + fechamento da remessa
  for (const r of emitidas) {
    await supabase.rpc('registrar_retorno_cobranca', {
      p_titulo_id: r.titulo_id,
      p_gateway_id: r.gateway_transacao_id ?? null,
      p_nosso_numero: r.nosso_numero ?? null,
      p_linha_digitavel: r.linha_digitavel ?? null,
      p_url_boleto: r.url_boleto ?? null,
      p_pix_copia_cola: r.pix_copia_cola ?? null,
      p_pix_qrcode_url: r.pix_qrcode_url ?? null,
      p_erro: r.erro ?? null,
      p_retorno: (r.retorno ?? null) as never,
    });
  }
  const { data: final } = await supabase.rpc('finalizar_remessa', { p_remessa_id: remessa.id });

  return NextResponse.json({
    ok: true,
    provedor: gateway.provedor,
    remessa: final ?? remessa,
    enviados: emitidas.length,
    erros: emitidas.filter((r) => r.erro).length,
  });
}
