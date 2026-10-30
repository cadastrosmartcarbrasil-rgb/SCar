import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentGateway, SicrediGateway, type GatewayConfig } from '@/lib/pagamentos';
import { remetenteEmail } from '@/lib/email';
import { mensagemBoasVindasWhatsApp, textoBoasVindasEmail, type BoletoBoasVindas } from '@/lib/boas-vindas';

// POST /api/v1/vendas/boas-vindas — as BOAS-VINDAS do associado novo (0161).
//   { veiculo_id, titulo_ids?, enviar? }
// Monta o e-mail (portal: login e senha do 1o acesso, documentos do portal e os
// boletos do carne, com os PDFs anexados) e a mensagem do WhatsApp. Com
// `enviar: false` so devolve os textos. Sem RESEND_API_KEY nao finge que enviou.
// Quem pode: quem enxerga o veiculo (RLS) — a Auditoria que acabou de aprovar.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    veiculo_id?: string; titulo_ids?: string[]; enviar?: boolean;
  };
  if (!body.veiculo_id) return NextResponse.json({ error: 'veiculo_id obrigatório' }, { status: 400 });

  // A sessao decide se a pessoa enxerga o veiculo.
  const { data: visivel } = await supabase.from('veiculos').select('id').eq('id', body.veiculo_id).maybeSingle();
  if (!visivel) return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 });

  const admin = createAdminClient();
  const { data: veic } = await admin.from('veiculos')
    .select('id, placa, cobertura_desde, cliente_id, clientes(nome_razao_social, email)')
    .eq('id', body.veiculo_id).maybeSingle();
  const cli = (veic as unknown as { clientes: { nome_razao_social: string; email: string | null } | null } | null)?.clientes;
  if (!veic || !cli) return NextResponse.json({ error: 'Associado não encontrado' }, { status: 404 });

  const ids = (body.titulo_ids ?? []).filter(Boolean);
  const { data: titulos } = ids.length
    ? await admin.from('titulos_financeiros')
        .select('id, cliente_id, valor, data_vencimento, linha_digitavel, integracao_id, adesao_lead_id')
        .in('id', ids)
    : { data: [] };
  const deste = (titulos ?? []).filter((t) => t.cliente_id === veic.cliente_id);

  const { data: docs } = await admin.from('termos_modelos')
    .select('nome').eq('ativo', true).eq('visivel_portal', true).order('nome');

  const origem = new URL(request.url).origin;
  const dados = {
    nome: cli.nome_razao_social,
    placa: veic.placa,
    portalUrl: `${origem}/portal/login`,
    documentos: (docs ?? []).map((d) => d.nome as string),
    coberturaDesde: veic.cobertura_desde,
    boletos: deste.map((t): BoletoBoasVindas => ({
      vencimento: t.data_vencimento, valor: Number(t.valor), adesao: !!t.adesao_lead_id,
      linha_digitavel: t.linha_digitavel,
    })),
  };
  const texto = textoBoasVindasEmail(dados);
  const whatsapp = mensagemBoasVindasWhatsApp(dados);

  if (body.enviar === false) return NextResponse.json({ enviado: false, texto, whatsapp });
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({
      enviado: false, texto, whatsapp,
      aviso: 'RESEND_API_KEY não configurada: o e-mail não saiu. Copie o texto ou use o WhatsApp.',
    });
  }
  const destino = (cli.email ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
    return NextResponse.json({ error: 'Associado sem e-mail válido no cadastro.', texto, whatsapp }, { status: 400 });
  }

  // PDFs dos boletos quando o banco devolve; sem eles o texto ja tem a linha.
  const anexos: { filename: string; content: string }[] = [];
  for (const t of deste) {
    if (!t.linha_digitavel) continue;
    try {
      const { data: integ } = t.integracao_id
        ? await admin.from('integracoes_bancarias').select('*').eq('id', t.integracao_id).maybeSingle()
        : { data: null };
      const gw = getPaymentGateway((integ ?? { provedor: 'SICREDI' }) as GatewayConfig);
      if (!(gw instanceof SicrediGateway)) continue;
      const pdf = await gw.pdf(t.linha_digitavel);
      anexos.push({
        filename: `${t.adesao_lead_id ? 'adesao' : 'mensalidade'}-${t.data_vencimento}.pdf`,
        content: Buffer.from(pdf).toString('base64'),
      });
    } catch { /* segue sem o anexo */ }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remetenteEmail(),
      to: [destino],
      subject: 'Bem-vindo(a) à Smart Car Brasil — seu portal e seus boletos',
      text: texto,
      attachments: anexos.length ? anexos : undefined,
    }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Resend recusou o envio: ${await res.text()}`, texto, whatsapp }, { status: 400 });
  }
  return NextResponse.json({ enviado: true, para: destino, anexos: anexos.length, texto, whatsapp });
}
