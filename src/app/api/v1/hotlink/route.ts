import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Captura publica pelo hotlink do vendedor (/v/<codigo>).
 * Roda com a service_role porque o visitante nao tem sessao — por isso aceita
 * SO os campos do formulario e sempre amarra o lead ao vendedor do codigo.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const codigo = String(body?.codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nome = String(body?.nome ?? '').trim();
  const celular = String(body?.celular ?? '').trim();
  const email = String(body?.email ?? '').trim();
  const placa = String(body?.placa ?? '').trim().toUpperCase();

  if (!codigo) return NextResponse.json({ error: 'Link invalido' }, { status: 400 });
  if (nome.length < 3) return NextResponse.json({ error: 'Informe seu nome' }, { status: 400 });
  if (celular.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'Informe um celular valido' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: vend } = await admin
    .from('vendedores')
    .select('id, nome, regional_id, usuario_id, ativo')
    .eq('codigo', codigo)
    .maybeSingle();

  if (!vend || !vend.ativo) {
    return NextResponse.json({ error: 'Este link de vendas nao esta ativo.' }, { status: 404 });
  }

  const { error } = await admin.from('leads').insert({
    nome,
    celular,
    email: email || null,
    placa: placa || null,
    vendedor_id: vend.id,
    consultor_id: vend.usuario_id,
    regional_id: vend.regional_id,
    status: 'NOVO',
    observacoes: `Captado pelo hotlink do vendedor ${vend.nome} (${codigo}).`,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, vendedor: vend.nome });
}
