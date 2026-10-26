import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { gerarChaveApi } from '@/lib/api-externa-server';

// POST /api/v1/api-integracoes — o admin cria uma integracao ou gera chave nova.
// A chave nasce AQUI (servidor), vai ao banco so como SHA-256 e volta em claro
// UMA vez nesta resposta. Quem confere que e admin e o banco (as RPCs).
//   { acao: 'criar', nome, descricao, fornecedor_id, escopos, regional_ids, ips, expira_em }
//   { acao: 'girar', id }
export const dynamic = 'force-dynamic';

type Corpo = {
  acao?: 'criar' | 'girar';
  id?: string;
  nome?: string;
  descricao?: string | null;
  fornecedor_id?: string | null;
  escopos?: string[];
  regional_ids?: string[] | null;
  ips?: string[] | null;
  expira_em?: string | null;
};

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as Corpo;
  const { chave, prefixo, hash } = gerarChaveApi();

  if (b.acao === 'girar') {
    if (!b.id) return NextResponse.json({ error: 'Informe a integração' }, { status: 400 });
    const { error } = await supabase.rpc('girar_chave_api_integracao', { p_id: b.id, p_prefixo: prefixo, p_hash: hash });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ id: b.id, chave, prefixo });
  }

  if (b.acao !== 'criar') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  if (!b.nome?.trim()) return NextResponse.json({ error: 'Informe o nome da integração' }, { status: 400 });
  const { data: id, error } = await supabase.rpc('criar_api_integracao', {
    p_nome: b.nome,
    p_descricao: b.descricao ?? null,
    p_fornecedor_id: b.fornecedor_id ?? null,
    p_escopos: b.escopos ?? [],
    p_regional_ids: b.regional_ids?.length ? b.regional_ids : null,
    p_ips: b.ips?.length ? b.ips : null,
    p_expira_em: b.expira_em ?? null,
    p_prefixo: prefixo,
    p_hash: hash,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id, chave, prefixo });
}
