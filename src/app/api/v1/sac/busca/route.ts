import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { identificacaoVeiculo } from '@/lib/placa';
import { filtroBuscaAssociados } from '@/lib/busca-cadastro';

// GET /api/v1/sac/busca?q=...  — busca global por Nome, CPF/CNPJ ou Placa.
// Base compartilhada por SAC, Assistencia 24h e Chatbot.
export const dynamic = 'force-dynamic';

// `veiculo_id` so vem preenchido quando o acerto foi POR PLACA: nesse caso o
// SAC abre direto o atendimento daquele veiculo, sem passar pela lista.
interface Hit {
  cliente_id: string;
  nome: string;
  cpf_cnpj: string;
  via: string | null;
  veiculo_id: string | null;
  placa: string | null;
}

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ resultados: [] });
  const digitos = q.replace(/\D/g, '');
  const placa = q.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const encontrados = new Map<string, Hit>();

  // Por placa — uma linha POR VEICULO (a mesma pessoa pode ter varios), com o
  // veiculo_id para o atendimento abrir direto naquele item.
  // 0136: tambem pelo CHASSI (4+ caracteres) — e o unico jeito de achar o
  // 0 km, que ainda nao tem placa.
  if (placa.length >= 3) {
    const filtro = placa.length >= 4
      ? `placa.ilike.*${placa}*,chassi.ilike.*${placa}*`
      : `placa.ilike.*${placa}*`;
    const { data: veic, error } = await supabase
      .from('veiculos')
      .select('id, placa, chassi, status, clientes(id, nome_razao_social, cpf_cnpj)')
      .or(filtro)
      .neq('status', 'excluido')
      .order('placa')
      .limit(10);
    // Sem isso uma falha de consulta vira "nada encontrado" para o atendente.
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const v of veic ?? []) {
      const linha = v as unknown as {
        id: string; placa: string | null; chassi: string | null;
        clientes: { id: string; nome_razao_social: string; cpf_cnpj: string } | null;
      };
      const c = linha.clientes;
      if (!c) continue;
      encontrados.set(`v:${linha.id}`, {
        cliente_id: c.id, nome: c.nome_razao_social, cpf_cnpj: c.cpf_cnpj,
        via: linha.placa ? `Placa ${linha.placa}` : identificacaoVeiculo(null, linha.chassi),
        veiculo_id: linha.id, placa: linha.placa,
      });
    }
  }

  // Por CPF/CNPJ (digitos) ou Nome — leva a ficha do associado (lista de veiculos)
  let cq = supabase.from('clientes').select('id, nome_razao_social, cpf_cnpj').limit(10);
  // Nome sem depender de acento nem das palavras do meio (padraoNomeTolerante).
  const nome = filtroBuscaAssociados(q);
  if (digitos.length >= 3) cq = cq.ilike('cpf_cnpj', `%${digitos}%`);
  else if (nome) cq = cq.or(nome).order('nome_razao_social');
  else cq = cq.ilike('nome_razao_social', `%${q}%`);
  const { data: cli, error: erroCli } = await cq;
  if (erroCli) return NextResponse.json({ error: erroCli.message }, { status: 500 });
  for (const c of cli ?? []) {
    if (!encontrados.has(`c:${c.id}`)) {
      encontrados.set(`c:${c.id}`, {
        cliente_id: c.id, nome: c.nome_razao_social, cpf_cnpj: c.cpf_cnpj,
        via: null, veiculo_id: null, placa: null,
      });
    }
  }

  return NextResponse.json({ resultados: [...encontrados.values()].slice(0, 12) });
}
