import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { modeloEmail, textosParaGravar, validarTextos, type CodigoModeloEmail, type TextosModelo } from '@/lib/comunicacao/modelos';
import {
  modeloWhatsApp, textosWhatsAppParaGravar, validarTextosWhatsApp, type CodigoModeloWhatsApp,
} from '@/lib/comunicacao/modelos-whatsapp';

// POST /api/v1/comunicacoes/modelos — grava os textos de um modelo de e-mail (0170).
// { codigo, textos, motivo, canal? } ou { codigo, original: true, motivo, canal? } (volta ao texto original).
// canal: EMAIL (padrao) ou WHATSAPP (0172).
// Valida o catalogo aqui; a permissao e a versao sao do banco (salvar_modelo_comunicacao).
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    codigo?: string; textos?: TextosModelo; motivo?: string; original?: boolean; canal?: string;
  };
  const canal = body.canal === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL';
  const m = canal === 'WHATSAPP' ? modeloWhatsApp(body.codigo ?? '') : modeloEmail(body.codigo ?? '');
  if (!m) return NextResponse.json({ error: 'Modelo desconhecido' }, { status: 400 });
  const codigo = m.codigo;

  let gravar: TextosModelo = {};
  if (!body.original) {
    const textos = Object.fromEntries(
      Object.entries(body.textos ?? {}).filter(([, v]) => typeof v === 'string'),
    ) as TextosModelo;
    const erros = canal === 'WHATSAPP' ? validarTextosWhatsApp(codigo, textos) : validarTextos(codigo, textos);
    if (erros.length) return NextResponse.json({ error: erros.join(' '), erros }, { status: 400 });
    gravar = canal === 'WHATSAPP'
      ? textosWhatsAppParaGravar(codigo as CodigoModeloWhatsApp, textos)
      : textosParaGravar(codigo as CodigoModeloEmail, textos);
  }
  const { data: versao, error } = await s.rpc('salvar_modelo_comunicacao', {
    p_canal: canal, p_codigo: codigo, p_textos: gravar, p_motivo: body.motivo ?? null,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, versao, alterados: Object.keys(gravar).length });
}
