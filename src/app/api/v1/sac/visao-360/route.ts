import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resumoFinanceiro, type TituloResumo } from '@/lib/sac';

// GET /api/v1/sac/visao-360?cliente_id=|placa=|cpf=  — payload unico da Visao 360.
// Consumido pelo painel SAC e reutilizavel por Assistencia 24h / Chatbot / Vendas.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const url = new URL(request.url);
  let clienteId = url.searchParams.get('cliente_id');
  const placa = url.searchParams.get('placa');
  const cpf = url.searchParams.get('cpf');

  if (!clienteId && placa) {
    const { data } = await supabase.from('veiculos').select('cliente_id').ilike('placa', placa.toUpperCase()).maybeSingle();
    clienteId = data?.cliente_id ?? null;
  }
  if (!clienteId && cpf) {
    const { data } = await supabase.from('clientes').select('id').eq('cpf_cnpj', cpf.replace(/\D/g, '')).maybeSingle();
    clienteId = data?.id ?? null;
  }
  if (!clienteId) return NextResponse.json({ error: 'Associado nao encontrado' }, { status: 404 });

  const { data: associado } = await supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle();
  if (!associado) return NextResponse.json({ error: 'Associado nao encontrado' }, { status: 404 });

  const { data: veiculos } = await supabase.from('veiculos').select('*').eq('cliente_id', clienteId).order('placa');
  const veiculosOut = await Promise.all(
    (veiculos ?? []).map(async (v) => {
      const { data: opcionais } = await supabase.rpc('opcionais_elegibilidade', { p_veiculo_id: v.id });
      const { data: plano } = v.plano_protecao_id
        ? await supabase.from('planos_protecao').select('nome').eq('id', v.plano_protecao_id).maybeSingle()
        : { data: null };
      return { ...v, plano_nome: plano?.nome ?? null, opcionais: opcionais ?? [] };
    }),
  );

  const { data: titulos } = await supabase
    .from('titulos_financeiros')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('data_vencimento', { ascending: false })
    .limit(60);

  const { data: faturas } = await supabase
    .from('faturas')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('competencia', { ascending: false })
    .limit(24);

  const resumo = resumoFinanceiro(
    (titulos ?? []).map<TituloResumo>((t) => ({ status: t.status, data_vencimento: t.data_vencimento, valor: Number(t.valor) })),
  );

  return NextResponse.json({
    associado,
    veiculos: veiculosOut,
    financeiro: { resumo, titulos: titulos ?? [] },
    faturas: faturas ?? [],
  });
}
