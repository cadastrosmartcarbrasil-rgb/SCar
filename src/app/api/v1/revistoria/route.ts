import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumirTentativa, ipDaRequisicao } from '@/lib/rate-limit';
import { mensagemDeErro } from '@/lib/venda-publica';
import { extensaoDoVideo, validarVideo } from '@/lib/revistoria';

const BUCKET = 'vendas';
const LIMITE_FOTO = 10 * 1024 * 1024;

/**
 * O link PUBLICO da revistoria do boleto vencido (0137). Mesmo desenho da
 * vistoria da venda (0076): sem sessao, a capacidade e o token; o arquivo
 * entra com service_role DEPOIS de o token ser conferido, e a linha do anexo
 * vai pela RPC, que confere de novo (situacao, prazo, item, duracao do video).
 * Falhou a RPC, o arquivo sai do bucket — nada de orfao.
 *
 *  - multipart (token, tipo, file, duracao?) -> grava UMA midia
 *  - JSON { acao: 'concluir', token }        -> manda para a analise
 */
export async function POST(req: Request) {
  const ip = ipDaRequisicao(req);
  const admin = createAdminClient();
  const tipoConteudo = req.headers.get('content-type') ?? '';

  if (tipoConteudo.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? '').trim();
    if (body?.acao !== 'concluir' || !token) {
      return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
    }
    if (!consumirTentativa(`revistoria-concluir:${ip}`, 30, 3600).permitido) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }, { status: 429 });
    }
    const { error } = await admin.rpc('concluir_revistoria_publica', { p_token: token });
    if (error) return NextResponse.json({ error: mensagemDeErro(error.message) }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Envio inválido' }, { status: 400 });
  const token = String(form.get('token') ?? '').trim();
  const tipo = String(form.get('tipo') ?? '').trim();
  const file = form.get('file');
  const duracaoBruta = form.get('duracao');
  const duracao = duracaoBruta == null || duracaoBruta === '' ? null : Number(duracaoBruta);
  if (!token || !tipo || !(file instanceof File)) {
    return NextResponse.json({ error: 'Envio incompleto' }, { status: 400 });
  }

  if (!consumirTentativa(`revistoria-midia:${token}`, 40, 3600).permitido
      || !consumirTentativa(`revistoria-midia-ip:${ip}`, 80, 3600).permitido) {
    return NextResponse.json({ error: 'Muitos envios. Aguarde alguns minutos.' }, { status: 429 });
  }

  // Confere ANTES de gastar upload: link vencido ou ja enviado nao deixa arquivo no bucket.
  const { data: sessoes } = await admin.rpc('revistoria_por_token', { p_token: token });
  const s = sessoes?.[0];
  if (!s?.valida || !s.revistoria_id) {
    return NextResponse.json(
      { error: s?.motivo === 'LINK_EXPIRADO' ? 'Este link expirou' : 'Este link não aceita mais envios' },
      { status: 403 },
    );
  }
  const { data: itens } = await admin.rpc('revistoria_itens_publica', { p_token: token });
  const item = (itens ?? []).find((i) => i.codigo === tipo);
  if (!item) return NextResponse.json({ error: 'Item inválido' }, { status: 400 });

  let ext = 'jpg';
  if (item.midia === 'VIDEO') {
    if (!file.type.startsWith('video/')) return NextResponse.json({ error: 'Envie um vídeo' }, { status: 400 });
    const recusa = validarVideo(duracao, file.size);
    if (recusa) return NextResponse.json({ error: recusa }, { status: 400 });
    ext = extensaoDoVideo(file.type);
  } else {
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Envie uma foto' }, { status: 400 });
    if (file.size > LIMITE_FOTO) return NextResponse.json({ error: 'Foto acima de 10 MB' }, { status: 400 });
    ext = file.type.includes('png') ? 'png' : 'jpg';
  }

  const path = `revistorias/${s.revistoria_id}/${tipo.toLowerCase()}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (upErr) return NextResponse.json({ error: 'Não consegui guardar o arquivo. Tente de novo.' }, { status: 502 });

  const { error: rpcErr } = await admin.rpc('registrar_midia_revistoria_publica', {
    p_token: token,
    p_tipo: tipo,
    p_url: path,
    p_tamanho: file.size,
    p_arquivo: file.name || null,
    p_duracao: item.midia === 'VIDEO' ? duracao : null,
  });
  if (rpcErr) {
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: mensagemDeErro(rpcErr.message) }, { status: 400 });
  }

  const { data: novos } = await admin.rpc('revistoria_itens_publica', { p_token: token });
  return NextResponse.json({ ok: true, itens: novos ?? [] });
}
