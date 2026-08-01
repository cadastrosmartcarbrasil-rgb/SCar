import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Emissao de boletos em lote.
// Integracao MOCKADA com gateway (Asaas/PJBank): substitua `emitirBoletoGateway`
// pela chamada real. Requer usuario staff com acesso financeiro/global.
interface EmitirLoteBody {
  competencia: string;      // 'YYYY-MM'
  vencimento: string;       // 'YYYY-MM-DD'
  regional_id?: string;     // opcional: restringe aos veiculos de uma regional
}

// --- MOCK do gateway bancario -------------------------------------------------
async function emitirBoletoGateway(input: { valor: number; nome: string; cpf_cnpj: string }) {
  const id = 'mock_' + Math.random().toString(36).slice(2, 12);
  return {
    gateway_transacao_id: id,
    nosso_numero: String(Math.floor(Math.random() * 1e10)).padStart(10, '0'),
    linha_digitavel: '34191.79001 01043.510047 91020.150008 8 99990000' + Math.floor(input.valor * 100),
    url_boleto: `https://sandbox.gateway.exemplo/boletos/${id}.pdf`,
  };
}
// -----------------------------------------------------------------------------

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  // Valida papel: apenas admin/financeiro emitem em lote.
  const { data: perfil } = await supabase
    .from('usuarios')
    .select('papel')
    .eq('id', user.id)
    .maybeSingle();
  if (!perfil || !['admin', 'financeiro'].includes(perfil.papel)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
  }

  const body = (await request.json()) as EmitirLoteBody;
  const admin = createAdminClient();

  // Seleciona veiculos ativos (com plano) para gerar a cobranca recorrente.
  let query = admin
    .from('veiculos')
    .select('id, cliente_id, regional_id, plano_protecao_id, clientes(nome_razao_social, cpf_cnpj), planos_protecao(taxa_administrativa)')
    .eq('status', 'ativo')
    .not('plano_protecao_id', 'is', null);
  if (body.regional_id) query = query.eq('regional_id', body.regional_id);

  const { data: veiculos, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const emitidos: string[] = [];
  const falhas: { veiculo_id: string; motivo: string }[] = [];

  for (const v of veiculos ?? []) {
    const cliente = (v as { clientes?: { nome_razao_social: string; cpf_cnpj: string } }).clientes;
    const plano = (v as { planos_protecao?: { taxa_administrativa: number } }).planos_protecao;
    const valor = Number(plano?.taxa_administrativa ?? 0);
    if (!cliente || valor <= 0) {
      falhas.push({ veiculo_id: v.id, motivo: 'Sem plano/valor valido' });
      continue;
    }

    try {
      const gw = await emitirBoletoGateway({ valor, nome: cliente.nome_razao_social, cpf_cnpj: cliente.cpf_cnpj });
      const { error: insErr } = await admin.from('titulos_financeiros').insert({
        cliente_id: v.cliente_id,
        veiculo_id: v.id,
        valor,
        data_vencimento: body.vencimento,
        status: 'pendente',
        ...gw,
      });
      if (insErr) throw insErr;
      emitidos.push(v.id);
    } catch (e) {
      falhas.push({ veiculo_id: v.id, motivo: (e as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    total: veiculos?.length ?? 0,
    emitidos: emitidos.length,
    falhas,
  });
}
