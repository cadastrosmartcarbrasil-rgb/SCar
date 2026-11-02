/**
 * E-mails de cobranca (0168) — regras PURAS: modelos, decisao de envio e backoff.
 * Sem dependencia de servidor (a tela usa os modelos para a pre-visualizacao).
 *
 * Decisoes do usuario (02/11/2026): so boletos do SCar; regua D-5, D-1, D0, D+2
 * e D+7; sem confirmacao de pagamento; linha digitavel no corpo.
 * Tom: so cobranca, objetivo e sem ameaca (CDC art. 42) — ha teste.
 */

export type TemplateEmail = 'aviso_vencimento' | 'vence_hoje' | 'atraso';

export type DadosAviso = {
  nome: string | null;
  valor: number | null;
  vencimento: string | null; // AAAA-MM-DD
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  linkBoleto: string | null;
  /** dias em relacao ao vencimento (negativo = antes) */
  offsetDias: number;
};

export type Rodape = {
  razaoSocial: string;
  cnpj: string | null;
  whatsapp: string | null;
  email: string | null;
  site: string | null;
};

export const RAZAO_SOCIAL_PADRAO = 'SMART CAR BRASIL PROTEÇÃO PATRIMONIAL MUTUALISTA';

/** Palavras que nao podem aparecer em e-mail de cobranca (tom de ameaca/alarme). */
export const PALAVRAS_PROIBIDAS = [
  'urgente', 'ultimo aviso', 'último aviso', 'protesto', 'serasa', 'spc', 'negativa',
  'judicial', 'processo', 'cancelamento imediato', 'bloqueado',
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function dataBr(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function dataCurta(iso: string | null): string {
  return dataBr(iso).slice(0, 5);
}

export function valorBr(v: number | null): string {
  if (v == null) return '';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function primeiroNome(nome: string | null): string {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  if (!p) return '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export function formatarCnpj(c: string | null): string | null {
  const d = (c ?? '').replace(/\D/g, '');
  if (d.length !== 14) return c;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function assuntoDoAviso(template: TemplateEmail, d: DadosAviso): string {
  const venc = dataCurta(d.vencimento);
  if (template === 'vence_hoje') return `Seu boleto Smart Car Brasil vence hoje (${venc})`;
  if (template === 'atraso') return `Boleto Smart Car Brasil de ${venc} em aberto`;
  if (d.offsetDias === -1) return `Seu boleto Smart Car Brasil vence amanhã (${venc})`;
  return `Seu boleto Smart Car Brasil vence em ${Math.abs(d.offsetDias)} dias (${venc})`;
}

function frases(template: TemplateEmail, d: DadosAviso): string[] {
  const venc = dataBr(d.vencimento);
  const valor = valorBr(d.valor);
  if (template === 'vence_hoje') {
    return [
      `Lembramos que o boleto da sua proteção veicular, no valor de ${valor}, vence hoje (${venc}).`,
      'Se já fez o pagamento, pode desconsiderar esta mensagem.',
    ];
  }
  if (template === 'atraso') {
    return [
      `Até o momento não identificamos o pagamento do boleto da sua proteção veicular, no valor de ${valor}, com vencimento em ${venc}.`,
      'Se já pagou, desconsidere esta mensagem: a confirmação do banco pode levar até 2 dias úteis.',
      'Mantenha a mensalidade em dia para seguir com todos os benefícios da sua proteção. Se precisar de ajuda com o pagamento, fale com o nosso atendimento.',
    ];
  }
  const quando = d.offsetDias === -1 ? 'vence amanhã' : `vence em ${Math.abs(d.offsetDias)} dias`;
  return [
    `O boleto da sua proteção veicular, no valor de ${valor}, ${quando} (${venc}).`,
    'Você pode pagar pela linha digitável ou pelo PIX abaixo.',
  ];
}

function contato(r: Rodape): string[] {
  const l: string[] = [];
  if (r.whatsapp) l.push(`WhatsApp ${r.whatsapp}`);
  if (r.email) l.push(r.email);
  return l;
}

export function textoDoAviso(template: TemplateEmail, d: DadosAviso, r: Rodape): string {
  const nome = primeiroNome(d.nome);
  const linhas: string[] = [nome ? `Olá, ${nome}.` : 'Olá.', '', ...frases(template, d), ''];
  if (d.linhaDigitavel) linhas.push('Linha digitável:', d.linhaDigitavel, '');
  if (d.pixCopiaCola) linhas.push('PIX copia e cola:', d.pixCopiaCola, '');
  if (d.linkBoleto) linhas.push(`Ver o boleto (PDF): ${d.linkBoleto}`, '');
  linhas.push('—', r.razaoSocial);
  if (r.cnpj) linhas.push(`CNPJ ${formatarCnpj(r.cnpj)}`);
  const c = contato(r);
  if (c.length) linhas.push(`Atendimento: ${c.join(' · ')}`);
  linhas.push('Este é um e-mail automático. Para falar conosco, use os canais de atendimento acima.');
  return linhas.join('\n');
}

const NAVY = '#1E2B4D';
const CIANO = '#139AD6';

function blocoCodigo(titulo: string, valor: string): string {
  return `<p style="margin:16px 0 4px;font-size:13px;color:#38455C">${esc(titulo)}</p>
<div style="font-family:Consolas,Menlo,monospace;font-size:14px;line-height:1.5;background:#F2F5FA;border:1px solid #D5DDEA;border-radius:6px;padding:10px 12px;word-break:break-all;color:${NAVY}">${esc(valor)}</div>`;
}

export function htmlDoAviso(template: TemplateEmail, d: DadosAviso, r: Rodape): string {
  const nome = primeiroNome(d.nome);
  const paragrafos = frases(template, d)
    .map((f) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#0F1B33">${esc(f)}</p>`)
    .join('');
  const resumo = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 4px;border-collapse:collapse">
<tr><td style="padding:6px 0;font-size:13px;color:#38455C">Vencimento</td><td style="padding:6px 0;font-size:15px;color:${NAVY};text-align:right;font-weight:600">${esc(dataBr(d.vencimento))}</td></tr>
<tr><td style="padding:6px 0;font-size:13px;color:#38455C;border-top:1px solid #E5EAF2">Valor</td><td style="padding:6px 0;font-size:15px;color:${NAVY};text-align:right;font-weight:600;border-top:1px solid #E5EAF2">${esc(valorBr(d.valor))}</td></tr>
</table>`;
  const botao = d.linkBoleto
    ? `<p style="margin:20px 0 4px"><a href="${esc(d.linkBoleto)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 20px;border-radius:6px">Ver o boleto (PDF)</a></p>`
    : '';
  const c = contato(r);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assuntoDoAviso(template, d))}</title></head>
<body style="margin:0;padding:0;background:#EEF2F8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#EEF2F8"><tr><td style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #D5DDEA;border-radius:10px">
<tr><td style="background:${NAVY};border-radius:10px 10px 0 0;padding:16px 24px;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px">SMART<span style="color:${CIANO}">CAR</span> BRASIL</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:15px;color:#0F1B33">${esc(nome ? `Olá, ${nome}.` : 'Olá.')}</p>
${paragrafos}
${resumo}
${d.linhaDigitavel ? blocoCodigo('Linha digitável', d.linhaDigitavel) : ''}
${d.pixCopiaCola ? blocoCodigo('PIX copia e cola', d.pixCopiaCola) : ''}
${botao}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #E5EAF2;font-size:12px;line-height:1.5;color:#525E70">
${esc(r.razaoSocial)}${r.cnpj ? ` · CNPJ ${esc(formatarCnpj(r.cnpj) ?? '')}` : ''}<br>
${c.length ? `Atendimento: ${esc(c.join(' · '))}<br>` : ''}Este é um e-mail automático. Para falar conosco, use os canais de atendimento acima.
</td></tr></table></td></tr></table></body></html>`;
}

export function renderizarAviso(template: TemplateEmail, d: DadosAviso, r: Rodape) {
  return { assunto: assuntoDoAviso(template, d), html: htmlDoAviso(template, d, r), texto: textoDoAviso(template, d, r) };
}

/** Dados de exemplo para a pre-visualizacao e o envio de teste. */
export function exemploAviso(template: TemplateEmail, offsetDias: number, linkBoleto: string | null = null): DadosAviso {
  return {
    nome: 'MARIA DA SILVA',
    valor: 189.9,
    vencimento: '2026-11-16',
    linhaDigitavel: '74891.12345 67890.123456 78901.234567 8 12345678901234',
    pixCopiaCola: '00020126580014BR.GOV.BCB.PIX0136exemplo-de-pix-copia-e-cola5204000053039865406189.905802BR',
    linkBoleto,
    offsetDias,
  };
}

// ---------------------------------------------------------------------------
// Decisao de envio
// ---------------------------------------------------------------------------
export type ConfigEnvio = { modo: 'sandbox' | 'live'; allowlist: string[] };

export type Decisao =
  | { acao: 'enviar' }
  | { acao: 'cancelar'; motivo: string };

export function normalizarEmail(e: string | null | undefined): string {
  return (e ?? '').trim().toLowerCase();
}

export function emailValido(e: string | null | undefined): boolean {
  return /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(normalizarEmail(e));
}

export function decidirEnvio(
  item: { destinatario: string; titulo_status: string | null; linha_digitavel: string | null },
  cfg: ConfigEnvio,
): Decisao {
  if (item.titulo_status === 'pago') return { acao: 'cancelar', motivo: 'boleto pago' };
  if (item.titulo_status === 'cancelado') return { acao: 'cancelar', motivo: 'boleto cancelado' };
  if (!item.linha_digitavel) return { acao: 'cancelar', motivo: 'boleto sem linha digitavel' };
  if (!emailValido(item.destinatario)) return { acao: 'cancelar', motivo: 'e-mail invalido' };
  if (cfg.modo !== 'live') {
    const lista = cfg.allowlist.map(normalizarEmail);
    if (!lista.includes(normalizarEmail(item.destinatario))) {
      return { acao: 'cancelar', motivo: 'modo sandbox: destinatario fora da lista de teste' };
    }
  }
  return { acao: 'enviar' };
}

export const TENTATIVAS_MAXIMAS = 5;

/** Backoff exponencial: 1, 2, 4, 8, 16 minutos (teto 30). */
export function proximaTentativa(tentativas: number, agora: Date = new Date()): Date {
  const minutos = Math.min(30, 2 ** Math.max(0, tentativas - 1));
  return new Date(agora.getTime() + minutos * 60_000);
}

/** Erro do provedor: transitorio (tenta de novo) ou permanente (desiste). */
export function erroTransitorio(status: number | null): boolean {
  if (status == null) return true; // queda de rede
  return status === 408 || status === 429 || status >= 500;
}

export type SituacaoEmail =
  | 'pendente' | 'enviando' | 'enviado' | 'entregue' | 'falhou' | 'bounce'
  | 'reclamado' | 'suprimido' | 'cancelado' | 'expirado';

export const ROTULO_SITUACAO_EMAIL: Record<SituacaoEmail, string> = {
  pendente: 'Na fila',
  enviando: 'Enviando',
  enviado: 'Enviado',
  entregue: 'Entregue',
  falhou: 'Falhou',
  bounce: 'Devolvido',
  reclamado: 'Marcado como spam',
  suprimido: 'Bloqueado (supressão)',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
};

/** Limites de alerta (conservadores; o provedor age perto de 4-5% e 0,1%). */
export const LIMITE_BOUNCE = 0.02;
export const LIMITE_RECLAMACAO = 0.0005;

export function taxasDoPainel(r: { enviados: number; bounces: number; reclamacoes: number }) {
  const base = r.enviados || 0;
  const bounce = base ? r.bounces / base : 0;
  const reclamacao = base ? r.reclamacoes / base : 0;
  return {
    bounce,
    reclamacao,
    alertaBounce: base > 0 && bounce > LIMITE_BOUNCE,
    alertaReclamacao: base > 0 && reclamacao > LIMITE_RECLAMACAO,
  };
}
