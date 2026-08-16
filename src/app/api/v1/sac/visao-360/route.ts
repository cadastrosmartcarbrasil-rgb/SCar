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
    // limit(1): placa repetida (historico/importacao) nao pode derrubar o SAC
    // com o erro de "mais de uma linha" do maybeSingle().
    const { data } = await supabase.from('veiculos')
      .select('cliente_id').ilike('placa', placa.toUpperCase()).limit(1);
    clienteId = data?.[0]?.cliente_id ?? null;
  }
  if (!clienteId && cpf) {
    const { data } = await supabase.from('clientes')
      .select('id').eq('cpf_cnpj', cpf.replace(/\D/g, '')).limit(1);
    clienteId = data?.[0]?.id ?? null;
  }
  if (!clienteId) return NextResponse.json({ error: 'Associado nao encontrado' }, { status: 404 });

  const { data: associado, error: erroAssociado } = await supabase
    .from('clientes').select('*').eq('id', clienteId).maybeSingle();
  if (erroAssociado) return NextResponse.json({ error: erroAssociado.message }, { status: 500 });
  if (!associado) return NextResponse.json({ error: 'Associado nao encontrado' }, { status: 404 });

  // Lista resumida: um RPC so, ja ORDENADO (ativos primeiro, desempate por data
  // de ativacao/modelo/placa) e com plano, alertas, eventos e assistencia
  // resolvidos no banco — antes eram 4 consultas separadas aqui.
  const { data: veiculos, error: erroVeiculos } = await supabase
    .rpc('veiculos_do_cliente', { p_cliente_id: clienteId });
  if (erroVeiculos) return NextResponse.json({ error: erroVeiculos.message }, { status: 500 });

  // Titulos do cliente (uma query) -> resumo financeiro + inadimplencia por veiculo.
  const { data: titulos, error: erroTitulos } = await supabase
    .from('titulos_financeiros')
    .select('veiculo_id, status, data_vencimento, valor')
    .eq('cliente_id', clienteId)
    .limit(300);
  // Titulo que nao carrega mostraria o associado como adimplente por engano.
  if (erroTitulos) return NextResponse.json({ error: erroTitulos.message }, { status: 500 });

  // Eventos (sinistros) do associado (uma query) -> aba Eventos + marcador no veiculo.
  const { data: eventos, error: erroEventos } = await supabase
    .from('eventos_sinistro')
    .select('id, veiculo_id, numero_protocolo, status, data_ocorrencia, tipos_evento(nome), veiculos(placa)')
    .eq('cliente_id', clienteId)
    .order('data_ocorrencia', { ascending: false })
    .limit(100);
  if (erroEventos) return NextResponse.json({ error: erroEventos.message }, { status: 500 });

  // Alertas ativos dos veiculos do associado -> abrem no SAC no mesmo instante.
  // (a CONTAGEM por veiculo ja vem do RPC; aqui e o detalhe do banner)
  const veicIds = (veiculos ?? []).map((v) => v.id);
  const { data: alertas, error: erroAlertas } = veicIds.length
    ? await supabase
        .from('veiculo_alertas')
        .select('id, veiculo_id, mensagem, tipos_alerta(nome, severidade), veiculos(placa)')
        .in('veiculo_id', veicIds)
        .eq('ativo', true)
    : { data: [], error: null };
  if (erroAlertas) return NextResponse.json({ error: erroAlertas.message }, { status: 500 });

  const titulosVeic: TituloVeiculo[] = (titulos ?? []).map((t) => ({
    veiculo_id: t.veiculo_id, status: t.status, data_vencimento: t.data_vencimento,
  }));
  // A ordem vem do RPC (ativos primeiro); aqui so entra a inadimplencia, que e
  // calculada a partir dos titulos ja carregados (regra unica em src/lib/sac.ts).
  const veiculosOut = (veiculos ?? []).map((v) => ({
    id: v.id,
    placa: v.placa,
    marca: v.marca,
    modelo: v.modelo,
    ano_modelo: v.ano_modelo,
    status: v.status,
    tipo_faturamento: v.tipo_faturamento,
    data_ativacao: v.data_ativacao,
    plano_nome: v.plano_nome,
    inadimplente: veiculoInadimplente({ id: v.id, tipo_faturamento: v.tipo_faturamento }, titulosVeic),
    eventos_qtd: v.eventos_qtd,
    tem_assistencia: v.tem_assistencia,
    alertas_qtd: v.alertas_qtd,
  }));

  const alertasOut = (alertas ?? []).map((a) => ({
    id: a.id,
    veiculo_id: a.veiculo_id,
    placa: (a.veiculos as unknown as { placa: string } | null)?.placa ?? null,
    nome: (a.tipos_alerta as unknown as { nome: string } | null)?.nome ?? 'Alerta',
    severidade: (a.tipos_alerta as unknown as { severidade: string } | null)?.severidade ?? 'MEDIA',
    mensagem: a.mensagem,
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

  return NextResponse.json({ associado, veiculos: veiculosOut, financeiro: { resumo }, eventos: eventosOut, alertas: alertasOut });
}
