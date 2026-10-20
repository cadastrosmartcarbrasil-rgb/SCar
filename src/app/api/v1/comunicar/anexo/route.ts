import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumirTentativa } from '@/lib/rate-limit';
import { mensagemDeErro } from '@/lib/venda-publica';
import { POSES_POR_PAPEL, POSE_CROQUI, type PapelComunicacao } from '@/lib/comunicacao-evento';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET_SINISTROS ?? 'sinistros-docs';
const LIMITE = 10 * 1024 * 1024;

/**
 * Foto/documento do envolvido pelo link publico (0129). Mesmo desenho da
 * vistoria (0076): o arquivo entra com service_role DEPOIS de o token ser
 * conferido, com nome gerado aqui, e a linha do anexo vai pela RPC — que
 * confere de novo e recusa caminho fora do evento. Falhou a RPC, o arquivo sai
 * do bucket (nada de orfao).
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Envio inválido' }, { status: 400 });
  const token = String(form.get('token') ?? '').trim();
  const pose = String(form.get('pose') ?? '').trim();
  const file = form.get('file');
  if (!token || !pose || !(file instanceof File)) {
    return NextResponse.json({ error: 'Envio incompleto' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip';
  if (!consumirTentativa(`comunicar-anexo:${token}`, 60, 3600).permitido
      || !consumirTentativa(`comunicar-anexo-ip:${ip}`, 120, 3600).permitido) {
    return NextResponse.json({ error: 'Muitos envios. Aguarde alguns minutos.' }, { status: 429 });
  }

  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!file.type.startsWith('image/') && !pdf) {
    return NextResponse.json({ error: 'Envie uma foto ou um PDF' }, { status: 400 });
  }
  if (file.size > LIMITE) return NextResponse.json({ error: 'Arquivo acima de 10 MB' }, { status: 400 });

  const admin = createAdminClient();
  const { data: com } = await admin.rpc('comunicacao_publica_por_token', { p_token: token });
  if (!com?.id) return NextResponse.json({ error: 'Link inválido' }, { status: 403 });

  const poses = [...POSES_POR_PAPEL[com.papel as PapelComunicacao] ?? [], POSE_CROQUI];
  const def = poses.find((p) => p.codigo === pose);
  if (!def) return NextResponse.json({ error: 'Foto não esperada para este envolvido' }, { status: 400 });

  const ext = pdf ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${com.evento_id}/comunicacao/${com.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (upErr) return NextResponse.json({ error: 'Não consegui guardar o arquivo' }, { status: 502 });

  const { data: id, error } = await admin.rpc('registrar_anexo_comunicacao', {
    p_token: token, p_pose: def.codigo, p_tipo: def.tipo, p_url: path, p_tamanho: file.size, p_arquivo: file.name,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id });
}
