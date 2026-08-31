import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const LIMITE_ANEXO = 5 * 1024 * 1024; // ~5 MB

/**
 * Boas-vindas ao vendedor, com o contrato em anexo (opcional).
 * Envia por Resend quando RESEND_API_KEY existe; sem a chave, guarda o contrato
 * e devolve o texto para envio manual — nunca finge que enviou.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });

  const form = await req.formData();
  const vendedorId = String(form.get('vendedor_id') ?? '');
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const contrato = form.get('contrato') as File | null;

  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
    return NextResponse.json({ error: 'E-mail de destino invalido' }, { status: 400 });
  }
  if (contrato && contrato.size > LIMITE_ANEXO) {
    return NextResponse.json({ error: 'O contrato passa de 5 MB' }, { status: 400 });
  }

  const { data: v } = await supabase
    .from('vendedores')
    .select('id, nome, codigo, regional_id, regionais(nome)')
    .eq('id', vendedorId)
    .single();
  if (!v) return NextResponse.json({ error: 'Vendedor nao encontrado' }, { status: 404 });

  const unidade = (v as unknown as { regionais?: { nome: string } | null }).regionais?.nome ?? '-';
  const origem = new URL(req.url).origin;
  const hotlink = `${origem}/v/${v.codigo}`;

  // Guarda o contrato no bucket privado, para ficar anexado ao cadastro.
  let contratoPath: string | null = null;
  if (contrato && contrato.size > 0) {
    const ext = contrato.name.includes('.') ? `.${contrato.name.split('.').pop()}` : '.pdf';
    contratoPath = `contratos/${vendedorId}/${Date.now()}${ext}`;
    const { error: upErr } = await supabase.storage
      .from('vendas')
      .upload(contratoPath, contrato, { contentType: contrato.type || 'application/pdf', upsert: true });
    if (upErr) return NextResponse.json({ error: `Falha ao guardar o contrato: ${upErr.message}` }, { status: 400 });
  }

  const assunto = `Bem-vindo(a) a Smart Car Brasil, ${v.nome}!`;
  const texto = [
    `Ola, ${v.nome}!`,
    '',
    `Seu cadastro de vendedor foi criado na unidade ${unidade}.`,
    `Seu codigo de vendedor e ${v.codigo}.`,
    '',
    `Seu link de vendas (hotlink): ${hotlink}`,
    'Toda cotacao iniciada por esse link ja entra vinculada a voce.',
    '',
    contratoPath
      ? 'Segue em anexo o contrato para assinatura digital.'
      : 'O contrato sera enviado em seguida.',
    '',
    'Qualquer duvida, fale com a sua unidade.',
  ].join('\n');

  let enviado = false;
  if (process.env.RESEND_API_KEY) {
    const anexos = contrato && contrato.size > 0
      ? [{
          filename: contrato.name || 'contrato.pdf',
          content: Buffer.from(await contrato.arrayBuffer()).toString('base64'),
        }]
      : undefined;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? 'Smart Car Brasil <nao-responda@smartvidanet.com.br>',
        to: [email],
        subject: assunto,
        text: texto,
        attachments: anexos,
      }),
    });
    if (!res.ok) {
      const detalhe = await res.text();
      return NextResponse.json({ error: `Resend recusou o envio: ${detalhe}` }, { status: 400 });
    }
    enviado = true;
  }

  if (contratoPath || enviado) {
    await supabase.from('vendedores').update({
      ...(contratoPath ? { contrato_url: contratoPath } : {}),
      ...(enviado ? { boas_vindas_enviada_em: new Date().toISOString() } : {}),
    }).eq('id', vendedorId);
  }

  return NextResponse.json({
    enviado,
    hotlink,
    assunto,
    texto,
    contrato_url: contratoPath,
    aviso: enviado ? null : 'RESEND_API_KEY nao configurada: o contrato foi guardado, mas o e-mail nao saiu. Copie o texto e envie manualmente.',
  });
}
