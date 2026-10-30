import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validarDocumento } from '@/lib/documento';
import { mensagemDeErro } from '@/lib/venda-publica';
import { consumirTentativa, ipDaRequisicao } from '@/lib/rate-limit';

/**
 * "Aceitar proposta" na pagina /cotacao/<token> (proposta v2, 30/10/2026).
 *
 * O MESMO aceite do hotlink: `registrar_aceite_venda`, sem sessao (caminho
 * publico, service_role), com nome, CPF/CNPJ, IP e user-agent como prova.
 * Difere do /hotlink/contratar so porque a cotacao JA existe (o consultor a
 * montou): aceita-se ESTA, sem gravar outra. So a mais recente do lead aceita —
 * a proposta antiga nao vira prova de consentimento de outro preco.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? '').trim();
  const nome = String(body?.nome ?? '').trim().replace(/\s+/g, ' ');
  const documento = String(body?.documento ?? '').replace(/\D/g, '');

  const lim = consumirTentativa(`proposta-aceite:${ipDaRequisicao(req)}`, 10, 600);
  if (!lim.permitido) return NextResponse.json({ error: `Muitas tentativas. Tente em ${lim.esperar} s.` }, { status: 429 });
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ error: 'Proposta inválida' }, { status: 400 });
  if (!nome.includes(' ')) return NextResponse.json({ error: 'Informe o nome completo' }, { status: 400 });
  if (!validarDocumento(documento, documento.length > 11 ? 'PJ' : 'PF')) {
    return NextResponse.json({ error: 'CPF/CNPJ inválido' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: cot } = await admin.from('cotacoes').select('id, lead_id').eq('token', token).maybeSingle();
  if (!cot) return NextResponse.json({ error: 'Proposta não encontrada' }, { status: 404 });
  const { data: ultima } = await admin.from('cotacoes').select('id')
    .eq('lead_id', cot.lead_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (ultima && ultima.id !== cot.id) {
    return NextResponse.json({ error: 'Esta proposta foi atualizada. Peça ao consultor o link da versão nova.' }, { status: 409 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null;
  const { error } = await admin.rpc('registrar_aceite_venda', {
    p_lead_id: cot.lead_id, p_cotacao_id: cot.id, p_por: 'CLIENTE', p_nome: nome, p_documento: documento,
    p_ip: ip, p_user_agent: req.headers.get('user-agent'),
  });
  if (error) return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 });

  // A vistoria pelo celular sai junto (0076). Falhar aqui nao desfaz o aceite.
  const { data: links } = await admin.rpc('gerar_link_vistoria', { p_lead_id: cot.lead_id, p_dias: 7 });
  return NextResponse.json({ ok: true, vistoria: links?.[0]?.token ?? null });
}
