import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/v1/sac/busca?q=...  — busca global por Nome, CPF/CNPJ ou Placa.
// Base compartilhada por SAC, Assistencia 24h e Chatbot.
export const dynamic = 'force-dynamic';

interface Hit { cliente_id: string; nome: string; cpf_cnpj: string; via: string | null }

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ resultados: [] });
  const digitos = q.replace(/\D/g, '');
  const placa = q.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const encontrados = new Map<string, Hit>();

  // Por placa
  if (placa.length >= 3) {
    const { data: veic } = await supabase
      .from('veiculos')
      .select('placa, clientes(id, nome_razao_social, cpf_cnpj)')
      .ilike('placa', `%${placa}%`)
      .limit(10);
    for (const v of veic ?? []) {
      const c = (v as unknown as { clientes: { id: string; nome_razao_social: string; cpf_cnpj: string } | null }).clientes;
      if (c) encontrados.set(c.id, { cliente_id: c.id, nome: c.nome_razao_social, cpf_cnpj: c.cpf_cnpj, via: `Placa ${(v as { placa: string }).placa}` });
    }
  }

  // Por CPF/CNPJ (digitos) ou Nome
  let cq = supabase.from('clientes').select('id, nome_razao_social, cpf_cnpj').limit(10);
  cq = digitos.length >= 3 ? cq.ilike('cpf_cnpj', `%${digitos}%`) : cq.ilike('nome_razao_social', `%${q}%`);
  const { data: cli } = await cq;
  for (const c of cli ?? []) {
    if (!encontrados.has(c.id)) encontrados.set(c.id, { cliente_id: c.id, nome: c.nome_razao_social, cpf_cnpj: c.cpf_cnpj, via: null });
  }

  return NextResponse.json({ resultados: [...encontrados.values()].slice(0, 12) });
}
