import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { emitirRenegociacao, resolverGateway } from '@/lib/pagamentos/renegociacao-server';

// POST /api/v1/cobrancas/avulso — BOLETO AVULSO do SAC (0150): adesao, vistoria,
// rastreador, acordo... tudo que nao e mensalidade.
//   { cliente_id, tipo_id, valor, vencimento, veiculo_id?, descricao? }
//
// Mesma ordem da 2a via (0121): banco padrao resolvido ANTES; o boleto e criado
// pela SESSAO (o banco confere Cobranca: Criar + escopo); a emissao e o
// fechamento rodam no servidor. Recusa do banco cancela o titulo.
export const dynamic = 'force-dynamic';

const CAMPOS_CLIENTE = 'id, nome_razao_social, cpf_cnpj, email, telefone, celular, endereco, regional_id';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    cliente_id?: string;
    tipo_id?: string;
    valor?: number;
    vencimento?: string;
    veiculo_id?: string | null;
    descricao?: string | null;
  };
  if (!body.cliente_id || !body.tipo_id || !body.valor || !body.vencimento) {
    return NextResponse.json({ error: 'cliente_id, tipo_id, valor e vencimento são obrigatórios' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: cliente } = await admin.from('clientes').select(CAMPOS_CLIENTE).eq('id', body.cliente_id).maybeSingle();
  if (!cliente) return NextResponse.json({ error: 'Associado não encontrado' }, { status: 404 });
  const { data: tipo } = await admin.from('tipos_boleto_avulso').select('nome').eq('id', body.tipo_id).maybeSingle();

  let regionalId = cliente.regional_id;
  if (body.veiculo_id) {
    const { data: v } = await admin.from('veiculos').select('regional_id').eq('id', body.veiculo_id).maybeSingle();
    regionalId = v?.regional_id ?? regionalId;
  }

  let gw: Awaited<ReturnType<typeof resolverGateway>>;
  try {
    gw = await resolverGateway(admin, regionalId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const { data: id, error } = await supabase.rpc('criar_boleto_avulso', {
    p_cliente_id: body.cliente_id,
    p_tipo_id: body.tipo_id,
    p_valor: Number(body.valor),
    p_vencimento: body.vencimento,
    p_veiculo_id: body.veiculo_id ?? null,
    p_descricao: body.descricao ?? null,
  });
  if (error || !id) return NextResponse.json({ error: error?.message ?? 'Falha ao criar o boleto' }, { status: 400 });

  const descricao = `Smart Car Brasil - ${tipo?.nome ?? 'Boleto avulso'}`;
  const r = await emitirRenegociacao(admin, gw, cliente, id, descricao);
  if (!r.ok) return NextResponse.json({ error: r.erro, renegociacao_id: id }, { status: 400 });
  return NextResponse.json({ ok: true, renegociacao_id: id, provedor: r.provedor });
}
