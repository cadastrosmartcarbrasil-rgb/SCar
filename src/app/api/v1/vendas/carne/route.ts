import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolverGateway } from '@/lib/pagamentos/renegociacao-server';
import { validarMesesCarne, type BoletoDoCarne } from '@/lib/carne';
import type { CobrancaEmitida } from '@/lib/pagamentos';

// POST /api/v1/vendas/carne — o CARNE do veiculo (0145).
//   { veiculo_id, meses }
// 1. o gateway e resolvido ANTES (configuracao errada para aqui);
// 2. `gerar_carne_veiculo` pela SESSAO (o banco confere quem pode: Auditoria,
//    matriz ou cobranca na unidade) gera as faturas e os titulos dos N meses;
// 3. os titulos ainda sem linha digitavel (inclusive o boleto da adesao) vao ao
//    banco numa remessa, pelo servidor;
// 4. devolve os boletos com linha digitavel e PIX (o carne).
// Re-executavel: mes ja faturado nao e refeito, boleto ja registrado nao e
// reenviado e o que falhou no banco vai de novo.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { veiculo_id?: string; meses?: number };
  const meses = Number(body.meses);
  if (!body.veiculo_id) return NextResponse.json({ error: 'veiculo_id obrigatório' }, { status: 400 });
  const erroMeses = validarMesesCarne(meses);
  if (erroMeses) return NextResponse.json({ error: erroMeses }, { status: 400 });

  const admin = createAdminClient();
  const { data: veic } = await admin.from('veiculos')
    .select('id, placa, cliente_id, clientes(id, nome_razao_social, cpf_cnpj, email, telefone, celular, endereco, regional_id)')
    .eq('id', body.veiculo_id).maybeSingle();
  if (!veic) return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 });
  const cliente = (veic as unknown as {
    clientes: { nome_razao_social: string; cpf_cnpj: string; email: string | null; telefone: string | null;
      celular: string | null; endereco: Record<string, string | null> | null; regional_id: string | null } | null;
  }).clientes;
  if (!cliente) return NextResponse.json({ error: 'Associado não encontrado' }, { status: 404 });

  let gw: Awaited<ReturnType<typeof resolverGateway>>;
  try {
    gw = await resolverGateway(admin, cliente.regional_id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const { data: linhas, error } = await supabase.rpc('gerar_carne_veiculo', {
    p_veiculo_id: body.veiculo_id, p_meses: meses,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const todos = (linhas ?? []) as { titulo_id: string; adesao: boolean; registrado: boolean }[];
  const ehAdesao = new Map(todos.map((l) => [l.titulo_id, l.adesao]));
  const aEnviar = todos.filter((l) => !l.registrado).map((l) => l.titulo_id);

  if (aEnviar.length > 0) {
    const { data: remessa, error: errRem } = await admin.rpc('criar_remessa_cobranca', {
      p_titulo_ids: aEnviar,
      p_integracao_id: gw.integracaoId,
      p_referencia: `carne ${veic.placa ?? veic.id}`,
    });
    if (errRem || !remessa) return NextResponse.json({ error: errRem?.message ?? 'Falha ao criar a remessa' }, { status: 400 });

    const { data: itens } = await admin.from('cobranca_remessa_itens')
      .select('titulo_id, titulos_financeiros(valor, data_vencimento)')
      .eq('remessa_id', remessa.id);
    if ((itens ?? []).length > 0) {
      await admin.rpc('marcar_remessa_enviada', { p_remessa_id: remessa.id });
      const emitidas: CobrancaEmitida[] = [];
      for (const i of (itens ?? []) as unknown as { titulo_id: string; titulos_financeiros: { valor: number; data_vencimento: string } | null }[]) {
        try {
          emitidas.push(await gw.gateway.emitir({
            titulo_id: i.titulo_id,
            valor: Number(i.titulos_financeiros?.valor ?? 0),
            vencimento: i.titulos_financeiros?.data_vencimento ?? '',
            descricao: ehAdesao.get(i.titulo_id) ? 'Taxa de adesão — proteção veicular' : 'Mensalidade de proteção veicular',
            pagador: {
              nome: cliente.nome_razao_social,
              cpf_cnpj: cliente.cpf_cnpj,
              email: cliente.email,
              telefone: cliente.celular ?? cliente.telefone,
              endereco: cliente.endereco,
            },
          }));
        } catch (e) {
          emitidas.push({ titulo_id: i.titulo_id, erro: (e as Error).message });
        }
      }
      for (const r of emitidas) {
        await admin.rpc('registrar_retorno_cobranca', {
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
      await admin.rpc('finalizar_remessa', { p_remessa_id: remessa.id });
    }
  }

  const ids = todos.map((l) => l.titulo_id);
  const { data: titulos } = ids.length
    ? await admin.from('titulos_financeiros')
        .select('id, valor, data_vencimento, linha_digitavel, pix_copia_cola, gateway_erro, adesao_lead_id')
        .in('id', ids)
    : { data: [] };
  const boletos: BoletoDoCarne[] = (titulos ?? []).map((t) => ({
    titulo_id: t.id,
    vencimento: t.data_vencimento,
    valor: Number(t.valor),
    adesao: !!t.adesao_lead_id,
    linha_digitavel: t.linha_digitavel,
    pix_copia_cola: t.pix_copia_cola,
    erro: t.linha_digitavel ? null : (t.gateway_erro ?? 'Não registrado no banco'),
  })).sort((a, b) => (a.adesao === b.adesao ? a.vencimento.localeCompare(b.vencimento) : a.adesao ? -1 : 1));

  return NextResponse.json({ ok: true, provedor: gw.gateway.provedor, boletos });
}
