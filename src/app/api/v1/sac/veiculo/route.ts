import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/v1/sac/veiculo?veiculo_id=  — DETALHE do veiculo sob demanda (lazy).
// So e chamado quando o atendente clica no veiculo na lista. RLS garante que
// so retorna veiculo que o usuario pode ver (staff regional ou dono).
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const veiculoId = new URL(request.url).searchParams.get('veiculo_id');
  if (!veiculoId) return NextResponse.json({ error: 'veiculo_id obrigatorio' }, { status: 400 });

  const { data: veiculo, error: erroVeiculo } = await supabase
    .from('veiculos').select('*').eq('id', veiculoId).maybeSingle();
  if (erroVeiculo) return NextResponse.json({ error: erroVeiculo.message }, { status: 500 });
  if (!veiculo) return NextResponse.json({ error: 'Veiculo nao encontrado' }, { status: 404 });

  const { data: plano } = veiculo.plano_protecao_id
    ? await supabase.from('planos_protecao').select('nome').eq('id', veiculo.plano_protecao_id).maybeSingle()
    : { data: null };

  // SO os itens contratados deste veiculo (plano + avulsos). Antes usava
  // opcionais_elegibilidade, que lista o catalogo inteiro de produtos com
  // limite — poluia a ficha com item que o associado nao tem.
  const { data: opcionais, error: erroOpcionais } = await supabase
    .rpc('opcionais_veiculo', { p_veiculo_id: veiculoId });
  // Falha aqui nao pode virar "sem cobertura" silencioso na ficha do atendente.
  if (erroOpcionais) return NextResponse.json({ error: erroOpcionais.message }, { status: 500 });

  // Rastreamento: quem rastreia o veiculo, telefone da central e link da
  // plataforma — o atendente precisa disso na hora do evento (0049).
  // A rastreadora e um FORNECEDOR com o tipo marcado (0051).
  const { data: forn } = veiculo.empresa_rastreamento_id
    ? await supabase.from('fornecedores').select('razao_social, nome_fantasia, telefone, plataforma_url')
        .eq('id', veiculo.empresa_rastreamento_id).maybeSingle()
    : { data: null };
  const rastreadora = forn
    ? { nome: forn.nome_fantasia?.trim() || forn.razao_social, telefone: forn.telefone, plataforma_url: forn.plataforma_url }
    : null;

  return NextResponse.json({
    veiculo,
    plano_nome: plano?.nome ?? null,
    rastreadora: rastreadora ?? null,
    opcionais: opcionais ?? [],
  });
}
