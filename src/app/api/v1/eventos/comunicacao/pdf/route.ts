import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { gerarPdf, htmlDoPdf, logoComoDataUrl } from '@/lib/termos-server';
import { logoOficial } from '@/lib/marca-server';
import {
  TEXTOS, ehTerceiro, linhasDaDeclaracao, rotuloPapel, type DadosComunicacao, type PapelComunicacao,
} from '@/lib/comunicacao-evento';

// PDF de UMA versao declarada na comunicacao do evento (0129):
//   ?declaracao=<id>  (equipe; quem le e a sessao — a RLS `pode_ver_evento` decide)
export const dynamic = 'force-dynamic';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('declaracao');
  if (!id) return NextResponse.json({ error: 'Informe a declaracao' }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: d } = await supabase.from('evento_declaracoes').select('*').eq('id', id).maybeSingle();
  if (!d) return NextResponse.json({ error: 'Declaração não encontrada' }, { status: 404 });
  const [{ data: c }, { data: e }, { data: anexos }] = await Promise.all([
    supabase.from('evento_comunicacoes').select('papel, nome').eq('id', d.comunicacao_id).maybeSingle(),
    supabase.from('eventos_sinistro').select('numero_protocolo').eq('id', d.evento_id).maybeSingle(),
    supabase.from('anexos_evento').select('pose, nome_original, created_at').eq('comunicacao_id', d.comunicacao_id).order('created_at'),
  ]);
  const papel = (c?.papel ?? 'testemunha') as PapelComunicacao;
  const dados = (d.dados ?? {}) as DadosComunicacao;

  const secoes = linhasDaDeclaracao(papel, dados).map((s) => `
    <h3>${esc(s.secao)}</h3>
    <table>${s.itens.map(([k, v]) => `<tr><th style="width:35%;text-align:left">${esc(k)}</th><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`).join('');

  const listaAnexos = (anexos ?? []).length
    ? `<h3>Arquivos recebidos</h3><ul>${(anexos ?? []).map((a) => `<li>${esc(a.pose ?? '')} — ${esc(a.nome_original ?? 'arquivo')}</li>`).join('')}</ul>`
    : '';

  const corpo = `
    <h2>Comunicacao de evento — ${esc(rotuloPapel(papel))}</h2>
    <p>Protocolo <b>${esc(e?.numero_protocolo)}</b> · versao ${d.versao} ·
       ${d.origem === 'EQUIPE' ? 'registrada pela equipe' : 'enviada pelo envolvido'} em
       ${esc(new Date(d.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</p>
    <p>Envolvido: <b>${esc(c?.nome ?? dados.identificacao?.nome ?? '')}</b></p>
    ${secoes}
    ${listaAnexos}
    <h3>Declaracao</h3>
    <p>${esc(d.texto_declaracao)}</p>
    <p><i>${esc(ehTerceiro(papel) ? TEXTOS.naoReconheceTerceiro : TEXTOS.naoReconhece)}</i></p>
    <p style="font-size:9pt;color:#555">IP: ${esc(d.ip ?? '—')} · Dispositivo: ${esc(d.user_agent ?? '—')}<br>
       Codigo de conferencia (SHA-256): ${esc(d.hash_conteudo)}</p>`;

  try {
    const logo = await logoComoDataUrl(await logoOficial());
    const pdf = await gerarPdf(htmlDoPdf(corpo, 'Comunicacao de evento', logo,
      `${e?.numero_protocolo ?? ''} · versao ${d.versao} · ${d.hash_conteudo.slice(0, 16)}`));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${e?.numero_protocolo ?? 'evento'}-comunicacao-v${d.versao}.pdf"`,
      },
    });
  } catch (err) {
    console.error('[comunicacao-pdf]', err);
    return NextResponse.json({ error: 'Nao foi possivel gerar o PDF agora' }, { status: 500 });
  }
}
