import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resumoFinanceiro, veiculoInadimplente, type TituloResumo, type TituloVeiculo } from '@/lib/sac';

// GET /api/v1/sac/visao-360?cliente_id=|placa=|cpf=
// Payload LEVE do associado: dados + resumo financeiro + LISTA resumida de
// veiculos (sem detalhes/opcionais). O detalhe de cada veiculo e carregado sob
// demanda em /api/v1/sac/veiculo (lazy loading) para nao pesar frotas grandes.
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

  // Lista resumida (uma unica query, sem RPC por veiculo).
  const { data: veiculos } = await supabase
    .from('veiculos')
    .select('id, placa, marca, modelo, ano_modelo, status, tipo_faturamento, planos_protecao(nome)')
    .eq('cliente_id', clienteId)
    .order('placa');

  // Titulos do cliente (uma query) -> resumo financeiro + inadimplencia por veiculo.
  const { data: titulos } = await supabase
    .from('titulos_financeiros')
    .select('veiculo_id, status, data_vencimento, valor')
    .eq('cliente_id', clienteId)
    .limit(300);

  // Eventos (sinistros) do associado (uma query) -> aba Eventos + marcador no veiculo.
  const { data: eventos } = await supabase
    .from('eventos_sinistro')
    .select('id, veiculo_id, numero_protocolo, status, data_ocorrencia, tipos_evento(nome), veiculos(placa)')
    .eq('cliente_id', clienteId)
    .order('data_ocorrencia', { ascending: false })
    .limit(100);

  // Acionamentos de Assistencia 24h (atendimentos) -> marcador no veiculo.
  const { data: assist } = await supabase
    .from('atendimentos')
    .select('veiculo_id')
    .eq('cliente_id', clienteId)
    .eq('tipo', 'ASSISTENCIA_24H')
    .limit(300);

  const titulosVeic: TituloVeiculo[] = (titulos ?? []).map((t) => ({
    veiculo_id: t.veiculo_id, status: t.status, data_vencimento: t.data_vencimento,
  }));
  const eventosPorVeiculo = new Map<string, number>();
  for (const e of eventos ?? []) eventosPorVeiculo.set(e.veiculo_id, (eventosPorVeiculo.get(e.veiculo_id) ?? 0) + 1);
  const assistVeiculos = new Set((assist ?? []).map((a) => a.veiculo_id).filter(Boolean));

  const veiculosOut = (veiculos ?? []).map((v) => ({
    id: v.id,
    placa: v.placa,
    marca: v.marca,
    modelo: v.modelo,
    ano_modelo: v.ano_modelo,
    status: v.status,
    tipo_faturamento: v.tipo_faturamento,
    plano_nome: (v.planos_protecao as unknown as { nome: string } | null)?.nome ?? null,
    inadimplente: veiculoInadimplente({ id: v.id, tipo_faturamento: v.tipo_faturamento }, titulosVeic),
    eventos_qtd: eventosPorVeiculo.get(v.id) ?? 0,
    tem_assistencia: assistVeiculos.has(v.id),
  }));

  const eventosOut = (eventos ?? []).map((e) => ({
    id: e.id,
    veiculo_id: e.veiculo_id,
    placa: (e.veiculos as unknown as { placa: string } | null)?.placa ?? null,
    numero_protocolo: e.numero_protocolo,
    tipo: (e.tipos_evento as unknown as { nome: string } | null)?.nome ?? null,
    status: e.status,
    data_ocorrencia: e.data_ocorrencia,
  }));

  const resumo = resumoFinanceiro(
    (titulos ?? []).map<TituloResumo>((t) => ({ status: t.status, data_vencimento: t.data_vencimento, valor: Number(t.valor) })),
  );

  return NextResponse.json({ associado, veiculos: veiculosOut, financeiro: { resumo }, eventos: eventosOut });
}
