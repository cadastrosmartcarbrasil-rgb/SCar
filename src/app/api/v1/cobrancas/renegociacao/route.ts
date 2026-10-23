import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  baixarOriginais, emitirRenegociacao, resolverGateway,
} from '@/lib/pagamentos/renegociacao-server';
import type { Json } from '@/lib/database.types';

// POST /api/v1/cobrancas/renegociacao — 2a via vencida e boleto NEGOCIADO NA HORA (0121).
//   { acao: 'criar', cliente_id, tipo: 'SEGUNDA_VIA'|'ACORDO', origens:[{origem,id}],
//     parcelas:[{vencimento,valor}], acordo_id?, observacao? }
//   { acao: 'pro_rata', veiculo_id, ate, desde?, vencimento, origens?, observacao? }  (0144)
//   { acao: 'baixar', renegociacao_id }   -> tenta de novo a baixa dos originais
//
// A ordem (criar pela sessao -> emitir -> fechar -> baixar) esta em
// `src/lib/pagamentos/renegociacao-server.ts`.
export const dynamic = 'force-dynamic';

const CAMPOS_CLIENTE = 'id, nome_razao_social, cpf_cnpj, email, telefone, celular, endereco, regional_id';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    acao?: 'criar' | 'baixar' | 'pro_rata';
    cliente_id?: string;
    veiculo_id?: string;
    tipo?: string;
    origens?: { origem: string; id: string }[];
    parcelas?: { vencimento: string; valor: number }[];
    acordo_id?: string | null;
    observacao?: string | null;
    renegociacao_id?: string;
    ate?: string;
    desde?: string | null;
    vencimento?: string | null;
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

  // ---- boleto PRO-RATA avulso (0144): pela data de vencimento do veiculo
  if (body.acao === 'pro_rata') {
    if (!body.veiculo_id || !body.ate) {
      return NextResponse.json({ error: 'veiculo_id e ate são obrigatórios' }, { status: 400 });
    }
    const { data: veic } = await admin.from('veiculos').select('cliente_id').eq('id', body.veiculo_id).maybeSingle();
    if (!veic) return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 });
    const { data: cliente } = await admin.from('clientes').select(CAMPOS_CLIENTE).eq('id', veic.cliente_id).maybeSingle();
    if (!cliente) return NextResponse.json({ error: 'Associado não encontrado' }, { status: 404 });

    let gw: Awaited<ReturnType<typeof resolverGateway>>;
    try {
      gw = await resolverGateway(admin, cliente.regional_id);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    const { data: id, error } = await supabase.rpc('criar_renegociacao_pro_rata', {
      p_veiculo_id: body.veiculo_id,
      p_ate: body.ate,
      p_desde: body.desde ?? null,
      p_cobrar: true,
      p_vencimento: body.vencimento ?? null,
      p_origens: (body.origens ?? []) as unknown as Json,
      p_observacao: body.observacao ?? null,
    });
    if (error || !id) return NextResponse.json({ error: error?.message ?? 'Nada a cobrar' }, { status: 400 });

    const r = await emitirRenegociacao(admin, gw, cliente, id, 'Mensalidade de proteção veicular (pró-rata)');
    if (!r.ok) return NextResponse.json({ error: r.erro, renegociacao_id: id }, { status: 400 });
    return NextResponse.json({ ok: true, renegociacao_id: id, provedor: r.provedor, erros_baixa: r.erros_baixa });
  }

  // ---- criar + emitir + baixar
  if (!body.cliente_id) return NextResponse.json({ error: 'cliente_id obrigatório' }, { status: 400 });

  const { data: cliente } = await admin.from('clientes').select(CAMPOS_CLIENTE).eq('id', body.cliente_id).maybeSingle();
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

  const r = await emitirRenegociacao(admin, gw, cliente, id, 'Mensalidade de proteção veicular (negociada)');
  if (!r.ok) return NextResponse.json({ error: r.erro, renegociacao_id: id }, { status: 400 });
  return NextResponse.json({ ok: true, renegociacao_id: id, provedor: r.provedor, erros_baixa: r.erros_baixa });
}
