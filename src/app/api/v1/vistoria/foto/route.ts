import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'vendas';

/**
 * Receber UMA foto da vistoria pelo link do cliente.
 *
 * O upload passa por aqui, e nao pelo navegador direto no Storage, porque a
 * policy do bucket `vendas` exige `is_staff()` (0034) — e afrouxa-la para
 * aceitar visitante seria abrir escrita anonima no nosso storage. Aqui o
 * arquivo entra com service_role DEPOIS de o token ser conferido, e a linha do
 * anexo vai pela RPC, que confere de novo (prazo, pose, situacao do lead).
 *
 * A imagem ja chega reduzida do navegador (`comprimirImagem`, 1600px/JPEG); o
 * teto de 10 MB continua sendo do BANCO (0047), que e onde regra e regra.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Envio invalido' }, { status: 400 });

  const token = String(form.get('token') ?? '').trim();
  const tipo = String(form.get('tipo') ?? '').trim();
  const file = form.get('file');
  if (!token || !tipo || !(file instanceof File)) {
    return NextResponse.json({ error: 'Envio incompleto' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Envie uma foto' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Confere ANTES de gastar upload: link vencido ou venda encerrada nao pode
  // deixar arquivo no bucket.
  const { data: sessoes } = await admin.rpc('vistoria_por_token', { p_token: token });
  const s = sessoes?.[0];
  if (!s?.valida || !s.lead_id) {
    return NextResponse.json(
      { error: s?.motivo === 'LINK_EXPIRADO' ? 'Este link expirou' : 'Link invalido' },
      { status: 403 },
    );
  }

  const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '.jpg';
  const path = `vistorias/${s.lead_id}/${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (upErr) return NextResponse.json({ error: 'Nao consegui guardar a foto' }, { status: 502 });

  const { error: rpcErr } = await admin.rpc('registrar_foto_vistoria_publica', {
    p_token: token,
    p_tipo: tipo,
    p_url: path,
    p_tamanho: file.size,
    p_arquivo: file.name,
  });

  if (rpcErr) {
    // A linha do anexo falhou (pose invalida, teto do banco, prazo estourado
    // entre a conferencia e agora): o arquivo recem-enviado sai do bucket em
    // vez de virar orfao — mesma regra dos outros uploads do sistema.
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: rpcErr.message }, { status: 400 });
  }

  const { data: poses } = await admin.rpc('fotos_vistoria_lead', { p_lead_id: s.lead_id });
  return NextResponse.json({ ok: true, poses: poses ?? [] });
}
