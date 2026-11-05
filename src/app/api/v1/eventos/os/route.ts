import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logoOficial } from '@/lib/marca-server';
import {
  carregarFontesOS, gerarPdf, htmlDoPdf, logoComoDataUrl, preencherTermo, sha256, trocarLogoDoModelo, type DadosOS,
} from '@/lib/termos-server';
import { MARCA_NUMERO_OS, MARCA_PROTOCOLO } from '@/lib/termos';
import { problemasDaOS, totaisDaOS, mensagemOSWhatsApp } from '@/lib/ordem-servico';
import { tokenDaOS } from '@/lib/comunicacao/servidor';
import { origemDaRequisicao } from '@/lib/api-externa-doc';
import { remetenteServico } from '@/lib/email';
import type { Json, OrdemServicoRow } from '@/lib/database.types';

// ORDEM DE SERVICO do evento (0181) — uma rota, as acoes:
//   previa   { dados }            -> HTML preenchido + vazios + totais (nada grava)
//   emitir   { dados }            -> emitir_ordem_servico + PDF (bucket termos) + anexo do evento
//   gerar_pdf { os_id }           -> o PDF que falhou na emissao
//   link     { os_id }            -> link assinado de curta duracao (7 dias) + mensagem do WhatsApp
//   email    { os_id, para }      -> e-mail ao prestador com o PDF (respeita o modo teste)
// Permissao e unidade: no banco (pode_tratar_evento). A leitura e pela sessao (RLS).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
type Corpo = { acao?: string; dados?: DadosOS; os_id?: string; para?: string };
type Sb = ReturnType<typeof createClient>;

const DIAS_LINK = 7;

async function versaoDoModelo(supabase: Sb) {
  const { data } = await supabase.from('termos_modelos')
    .select('id, nome, versao_atual_id, updated_at')
    .eq('tipo', 'ORDEM_SERVICO').eq('ativo', true).not('versao_atual_id', 'is', null)
    .order('updated_at', { ascending: false }).limit(1);
  const m = (data ?? [])[0];
  if (!m?.versao_atual_id) {
    throw new Error('Não há modelo de Ordem de Serviço publicado. Em Configurações → Termos, publique o modelo "ORDEM DE SERVIÇO – EVENTOS".');
  }
  const { data: v } = await supabase.from('termos_versoes')
    .select('id, nome, numero, conteudo_html').eq('id', m.versao_atual_id).maybeSingle();
  if (!v) throw new Error('Versão do modelo de Ordem de Serviço não encontrada.');
  return v;
}

function normalizarDados(d: DadosOS): DadosOS {
  return {
    ...d,
    itens: (d.itens ?? []).map((i) => ({
      tipo: i.tipo === 'MAO_DE_OBRA' ? 'MAO_DE_OBRA' : 'PECA',
      descricao: String(i.descricao ?? '').trim().toUpperCase(),
      codigo: i.codigo ? String(i.codigo).trim() : null,
      quantidade: Number(i.quantidade),
      valor_unitario: Number(i.valor_unitario),
    })),
  };
}

async function pdfDaOS(supabase: Sb, os: OrdemServicoRow): Promise<string | null> {
  try {
    const { data: e } = await supabase.from('termos_emitidos')
      .select('id, cliente_id, protocolo, titulo, conteudo_html, html_sha256, emitido_em, pdf_path')
      .eq('id', os.termo_emitido_id!).maybeSingle();
    if (!e) throw new Error('termo da OS não encontrado');
    if (e.pdf_path) return null;
    const logo = await logoComoDataUrl(await logoOficial());
    const l = trocarLogoDoModelo(e.conteudo_html, logo);
    const rodape = `${os.numero} · protocolo ${e.protocolo} · emitida em `
      + `${new Date(e.emitido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · `
      + `SHA-256 do conteúdo: ${e.html_sha256}`;
    const pdf = await gerarPdf(htmlDoPdf(l.html, e.titulo, l.logoNoCabecalho, rodape));
    const path = `emitidos/${e.cliente_id}/${e.id}.pdf`;
    const admin = createAdminClient();
    const up = await admin.storage.from('termos').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (up.error) throw up.error;
    const { error } = await supabase.rpc('anexar_pdf_ordem_servico', {
      p_os_id: os.id, p_path: path, p_sha256: sha256(pdf), p_bytes: pdf.length,
    });
    if (error) throw error;
    return null;
  } catch (err) {
    return `A OS ${os.numero} foi emitida, mas o PDF não foi gerado: ${(err as Error).message}. Use "Gerar PDF".`;
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return erro('Não autenticado', 401);
  const { data: perfil } = await supabase.from('usuarios').select('nome, ativo').eq('id', user.id).maybeSingle();
  if (!perfil || perfil.ativo === false) return erro('Só a equipe emite Ordem de Serviço.', 403);

  let c: Corpo;
  try { c = (await request.json()) as Corpo; } catch { return erro('Pedido inválido.'); }

  try {
    if (c.acao === 'previa' || c.acao === 'emitir') {
      if (!c.dados?.evento_id) return erro('Informe o evento.');
      const dados = normalizarDados(c.dados);
      const versao = await versaoDoModelo(supabase);
      const fontes = await carregarFontesOS(supabase, dados, perfil.nome);
      // sem participacao informada, vale a do evento
      if (dados.participacao_associado == null) {
        dados.participacao_associado = fontes.evento?.valor_participacao ?? 0;
      }
      const t = totaisDaOS(dados.itens, dados.participacao_associado, dados.pecas_smartcar ?? 0);
      const r = preencherTermo(versao.conteudo_html, fontes);

      if (c.acao === 'previa') {
        const html = r.html.split(MARCA_PROTOCOLO).join('(gerado na emissão)')
          .split(MARCA_NUMERO_OS).join('(gerado na emissão)');
        return NextResponse.json({ html, vazios: r.vazios, totais: t, modelo: `${versao.nome} v${versao.numero}` });
      }

      const problemas = problemasDaOS({
        fornecedorId: dados.fornecedor_id, itens: dados.itens, inicio: dados.data_inicio_prevista,
        dataLimite: dados.data_limite_entrega, documento: dados.documento ?? 'AUTORIZACAO',
        osAnteriorId: dados.os_anterior_id, totais: t,
      });
      if (problemas.length) return erro(problemas.join(' '));
      const { data: os, error } = await supabase.rpc('emitir_ordem_servico', {
        p_versao_id: versao.id,
        p_dados: { ...dados, total_autorizado: t.autorizado, valor_liquido: t.liquido } as unknown as Json,
        p_html: r.html,
        p_campos_vazios: r.vazios,
      });
      if (error) return erro(error.message, error.code === '42501' ? 403 : 400);
      const aviso = await pdfDaOS(supabase, os!);
      return NextResponse.json({ os, vazios: r.vazios, aviso });
    }

    if (!c.os_id) return erro('Informe a Ordem de Serviço.');
    const { data: os } = await supabase.from('ordens_servico').select('*').eq('id', c.os_id).maybeSingle();
    if (!os) return erro('Ordem de Serviço não encontrada.', 404);

    if (c.acao === 'gerar_pdf') {
      const aviso = await pdfDaOS(supabase, os);
      if (aviso) return erro(aviso);
      return NextResponse.json({ ok: true });
    }

    if (c.acao === 'link') {
      const segredo = (process.env.EMAIL_LINK_SECRET ?? '').trim();
      if (!segredo) return erro('EMAIL_LINK_SECRET não configurado no servidor: baixe o PDF e envie o arquivo.');
      const expira = Math.floor(Date.now() / 1000) + DIAS_LINK * 86400;
      const link = `${origemDaRequisicao(request.headers)}/os/${tokenDaOS(os.id, expira, segredo)}`;
      const [{ data: f }, { data: ev }] = await Promise.all([
        supabase.from('fornecedores').select('nome_fantasia, razao_social, whatsapp, telefone').eq('id', os.fornecedor_id).maybeSingle(),
        supabase.from('eventos_sinistro').select('numero_protocolo').eq('id', os.evento_id).maybeSingle(),
      ]);
      const mensagem = mensagemOSWhatsApp({
        prestador: f?.nome_fantasia || f?.razao_social || 'prestador', numero: os.numero,
        protocolo: ev?.numero_protocolo ?? null, link, limite: os.data_limite_entrega,
      });
      return NextResponse.json({ link, mensagem, telefone: f?.whatsapp || f?.telefone || null, dias: DIAS_LINK });
    }

    if (c.acao === 'email') {
      const para = String(c.para ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return erro('Informe um e-mail válido do prestador.');
      if (os.status === 'CANCELADA' || os.status === 'SUBSTITUIDA') return erro(`A ${os.numero} está ${os.status.toLowerCase()}.`);
      const admin = createAdminClient();
      // Modo teste do modulo de e-mails (0168): so sai para a lista de teste.
      const { data: cfg } = await admin.from('email_config').select('modo, allowlist').eq('id', true).maybeSingle();
      const modo = (cfg as { modo?: string } | null)?.modo ?? 'sandbox';
      const lista = ((cfg as { allowlist?: string[] } | null)?.allowlist ?? []).map((x) => x.toLowerCase());
      if (modo !== 'live' && !lista.includes(para)) {
        return erro('O módulo de e-mails está em MODO TESTE: só envia para a lista de teste (Cobrança → E-mails de Cobrança). Use o WhatsApp ou baixe o PDF.');
      }
      if (!process.env.RESEND_API_KEY) return erro('RESEND_API_KEY não configurada no servidor: baixe o PDF e envie manualmente.');
      const { data: e } = await supabase.from('termos_emitidos').select('pdf_path').eq('id', os.termo_emitido_id!).maybeSingle();
      if (!e?.pdf_path) return erro('O PDF desta OS ainda não foi gerado. Use "Gerar PDF" antes de enviar.');
      const { data: arq, error: eArq } = await admin.storage.from('termos').download(e.pdf_path);
      if (eArq || !arq) return erro('PDF da OS não encontrado no armazenamento.');
      const [{ data: emp }, { data: ev }, { data: f }] = await Promise.all([
        admin.from('empresa').select('email_departamento_eventos').limit(1).maybeSingle(),
        supabase.from('eventos_sinistro').select('numero_protocolo').eq('id', os.evento_id).maybeSingle(),
        supabase.from('fornecedores').select('nome_fantasia, razao_social').eq('id', os.fornecedor_id).maybeSingle(),
      ]);
      const [y, m, d] = os.data_limite_entrega.split('-');
      const texto = [
        `Olá, ${f?.nome_fantasia || f?.razao_social || 'prestador'}.`,
        '',
        `Segue em anexo a Ordem de Serviço ${os.numero}${ev?.numero_protocolo ? ` do evento ${ev.numero_protocolo}` : ''} da Smart Car Brasil.`,
        `Data limite de entrega: ${d}/${m}/${y}.`,
        'Serviços ou peças adicionais só podem ser realizados com nova autorização escrita.',
        'Emita a nota fiscal conforme o quadro "Nota fiscal e faturamento" da OS.',
        '',
        'Para responder, use este e-mail: a resposta vai ao Departamento de Eventos.',
        '',
        'Smart Car Brasil – Departamento de Eventos',
      ].join('\n');
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: remetenteServico(),
          to: [para],
          reply_to: emp?.email_departamento_eventos || undefined,
          subject: `Ordem de Serviço ${os.numero} — Smart Car Brasil`,
          text: texto,
          attachments: [{ filename: `${os.numero}.pdf`, content: Buffer.from(await arq.arrayBuffer()).toString('base64') }],
        }),
      });
      if (!res.ok) return erro(`O provedor recusou o envio: ${(await res.text()).slice(0, 300)}`);
      const { data: atual, error } = await supabase.rpc('registrar_envio_ordem_servico', {
        p_os_id: os.id, p_canal: 'EMAIL', p_destino: para, p_observacao: null,
      });
      if (error) return erro(`E-mail enviado, mas o registro falhou: ${error.message}`);
      return NextResponse.json({ enviado: true, os: atual });
    }

    return erro('Ação desconhecida.');
  } catch (e) {
    return erro((e as Error).message || 'Falha ao processar a Ordem de Serviço.');
  }
}
