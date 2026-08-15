import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  montarVoucherTexto,
  montarVoucherHtml,
  linkWhatsApp,
  enderecoTexto,
  type DadosVoucher,
} from '@/lib/assistencia';

// POST /api/v1/assistencia/voucher { acionamento_id, enviar_email? }
// Monta o comunicado da OS para o prestador, envia por e-mail (quando ha
// RESEND_API_KEY configurada) e devolve o texto + link de WhatsApp para o
// atendente disparar na hora. Marca o acionamento como "voucher enviado"
// (que move a OS para EM_ATENDIMENTO).
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
  const { data: perfil } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
  if (!perfil) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { acionamento_id?: string; enviar_email?: boolean };
  if (!body.acionamento_id) return NextResponse.json({ error: 'acionamento_id obrigatorio' }, { status: 400 });

  const { data: a, error } = await supabase
    .from('acionamentos_assistencia')
    .select(`*,
      servicos_assistencia(descricao),
      veiculos(placa, marca, modelo, cor),
      clientes(nome_razao_social),
      fornecedores(razao_social, email, whatsapp, telefone)`)
    .eq('id', body.acionamento_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!a) return NextResponse.json({ error: 'Acionamento nao encontrado' }, { status: 404 });

  type Rel = typeof a & {
    servicos_assistencia?: { descricao: string } | null;
    veiculos?: { placa: string; marca: string | null; modelo: string | null; cor: string | null } | null;
    clientes?: { nome_razao_social: string } | null;
    fornecedores?: { razao_social: string; email: string | null; whatsapp: string | null; telefone: string | null } | null;
  };
  const rel = a as Rel;
  if (!rel.prestador_id || !rel.codigo_os) {
    return NextResponse.json({ error: 'Confirme o prestador (gere a OS) antes de enviar o comunicado' }, { status: 400 });
  }

  const { data: empresa } = await supabase
    .from('empresa')
    .select('nome_fantasia, telefone_fixo, whatsapp_principal')
    .limit(1)
    .maybeSingle();

  const dados: DadosVoucher = {
    codigo_os: rel.codigo_os,
    protocolo: rel.protocolo ?? '',
    servico: rel.servicos_assistencia?.descricao ?? 'Assistencia 24h',
    empresa: empresa?.nome_fantasia ?? null,
    prestador: rel.fornecedores?.razao_social ?? '',
    associado: rel.clientes?.nome_razao_social ?? '',
    solicitante: rel.solicitante_nome,
    telefone: rel.solicitante_telefone,
    veiculo: {
      placa: rel.veiculos?.placa ?? '',
      marca: rel.veiculos?.marca ?? null,
      modelo: rel.veiculos?.modelo ?? null,
      cor: rel.veiculos?.cor ?? null,
    },
    origem: enderecoTexto(rel.origem),
    destino: enderecoTexto(rel.destino),
    km_previsto: rel.km_previsto,
    valor_servico: Number(rel.valor_servico ?? 0),
    valor_km_excedente: Number(rel.valor_km_excedente ?? 0),
    valor_total: Number(rel.valor_total ?? 0),
    prazo_estimado_min: rel.prazo_estimado_min,
    observacoes: rel.observacoes,
    contato_central: empresa?.whatsapp_principal ?? empresa?.telefone_fixo ?? null,
  };

  const texto = montarVoucherTexto(dados);
  const destinatario = rel.fornecedores?.email ?? null;
  let emailEnviado = false;

  // E-mail: usa o Resend quando configurado (mesma chave da edge function).
  if (body.enviar_email !== false && destinatario && process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? 'SCar <no-reply@scar.app>',
          to: [destinatario],
          subject: `Ordem de Servico ${dados.codigo_os} — ${dados.servico} (${dados.veiculo.placa})`,
          html: montarVoucherHtml(dados),
        }),
      });
      emailEnviado = res.ok;
    } catch {
      emailEnviado = false;
    }
  }

  await supabase.rpc('marcar_voucher_enviado', { p_acionamento_id: rel.id });

  return NextResponse.json({
    texto,
    whatsapp: linkWhatsApp(rel.fornecedores?.whatsapp ?? rel.fornecedores?.telefone, texto),
    email_enviado: emailEnviado,
    destinatario,
  });
}
