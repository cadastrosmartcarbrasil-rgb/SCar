import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { modeloEmail, textosParaGravar, validarTextos, type CodigoModeloEmail, type TextosModelo } from '@/lib/comunicacao/modelos';

// POST /api/v1/comunicacoes/modelos — grava os textos de um modelo de e-mail (0170).
// { codigo, textos, motivo } ou { codigo, original: true, motivo } (volta ao texto original).
// Valida o catalogo aqui; a permissao e a versao sao do banco (salvar_modelo_comunicacao).
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    codigo?: string; textos?: TextosModelo; motivo?: string; original?: boolean;
  };
  const m = modeloEmail(body.codigo ?? '');
  if (!m) return NextResponse.json({ error: 'Modelo desconhecido' }, { status: 400 });
  const codigo = m.codigo as CodigoModeloEmail;

  let gravar: TextosModelo = {};
  if (!body.original) {
    const textos = Object.fromEntries(
      Object.entries(body.textos ?? {}).filter(([, v]) => typeof v === 'string'),
    ) as TextosModelo;
    const erros = validarTextos(codigo, textos);
    if (erros.length) return NextResponse.json({ error: erros.join(' '), erros }, { status: 400 });
    gravar = textosParaGravar(codigo, textos);
  }
  const { data: versao, error } = await s.rpc('salvar_modelo_comunicacao', {
    p_canal: 'EMAIL', p_codigo: codigo, p_textos: gravar, p_motivo: body.motivo ?? null,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, versao, alterados: Object.keys(gravar).length });
}
