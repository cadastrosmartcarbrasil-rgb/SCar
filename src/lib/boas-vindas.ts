// ---------------------------------------------------------------------------
// BOAS-VINDAS do associado novo (0161) — o texto do e-mail e do WhatsApp.
//
// Decisao do usuario (30/10/2026): na entrada na base o associado recebe as
// boas-vindas por e-mail e WhatsApp, com o carne e as instrucoes do PORTAL —
// login (CPF/CNPJ), a senha do primeiro acesso (o proprio documento, trocada
// na entrada, 0044) e o que ele encontra la (veiculos, boletos e documentos).
// ---------------------------------------------------------------------------
import { formatCurrency, formatDate } from './utils';

export interface BoletoBoasVindas {
  vencimento: string;
  valor: number;
  adesao: boolean;
  linha_digitavel: string | null;
}

export interface DadosBoasVindas {
  nome: string;
  placa: string | null;
  /** URL de login do portal, ex.: https://appsmartcar.com.br/portal/login */
  portalUrl: string;
  /** Nomes dos documentos que o portal mostra (Manual da 24h, regulamento...). */
  documentos?: string[];
  boletos?: BoletoBoasVindas[];
  /** A cobertura comeca em (ISO), 24h depois da entrada (0161). */
  coberturaDesde?: string | null;
}

function primeiroNome(nome: string): string {
  const p = (nome || '').trim().split(/\s+/)[0] ?? '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}

function quandoCobertura(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function blocoBoletos(boletos: BoletoBoasVindas[]): string[] {
  const ordem = [...boletos].sort((a, b) =>
    a.adesao === b.adesao ? a.vencimento.localeCompare(b.vencimento) : a.adesao ? -1 : 1);
  const out: string[] = [];
  for (const b of ordem) {
    out.push(`${b.adesao ? 'Adesão' : 'Mensalidade'} · vence ${formatDate(b.vencimento)} · ${formatCurrency(b.valor)}`);
    if (b.linha_digitavel) out.push(b.linha_digitavel);
    out.push('');
  }
  return out;
}

/** O e-mail (texto puro) de boas-vindas. */
export function textoBoasVindasEmail(d: DadosBoasVindas): string {
  const nome = primeiroNome(d.nome);
  const cobertura = quandoCobertura(d.coberturaDesde);
  const linhas: string[] = [
    `Olá${nome ? `, ${nome}` : ''}! Seja bem-vindo(a) à Smart Car Brasil.`,
    '',
    `A proteção do seu veículo${d.placa ? ` ${d.placa}` : ''} foi ativada.`
      + (cobertura ? ` A cobertura começa em ${cobertura}.` : ''),
    '',
    'PORTAL DO ASSOCIADO',
    `Acesse: ${d.portalUrl}`,
    'Login: o seu CPF (ou CNPJ), só os números.',
    'Senha do primeiro acesso: o mesmo CPF/CNPJ. No primeiro acesso o portal pede para você criar uma senha nova.',
    'No portal estão os seus veículos, todos os boletos emitidos (com 2ª via e PIX) e os seus documentos.',
  ];
  const docs = (d.documentos ?? []).filter(Boolean);
  if (docs.length > 0) {
    linhas.push('', 'Documentos disponíveis no portal:', ...docs.map((n) => `• ${n}`));
  }
  const bol = (d.boletos ?? []).filter((b) => b.linha_digitavel);
  if (bol.length > 0) {
    linhas.push('', 'SEUS BOLETOS (os PDFs vão anexados; todos podem ser pagos por PIX):', '', ...blocoBoletos(bol));
  }
  linhas.push('', 'Qualquer dúvida, fale com a nossa central. Obrigado pela confiança!');
  return linhas.join('\n');
}

/** A mensagem de boas-vindas do WhatsApp (curta: os boletos vão por linha). */
export function mensagemBoasVindasWhatsApp(d: DadosBoasVindas): string {
  const nome = primeiroNome(d.nome);
  const cobertura = quandoCobertura(d.coberturaDesde);
  const linhas: string[] = [
    `Olá${nome ? `, ${nome}` : ''}! Seja bem-vindo(a) à Smart Car Brasil 🚗`,
    `A proteção do seu veículo${d.placa ? ` ${d.placa}` : ''} está ativa`
      + (cobertura ? ` — a cobertura começa em ${cobertura}.` : '.'),
    '',
    `Portal do associado: ${d.portalUrl}`,
    'Login e senha do primeiro acesso: o seu CPF (só os números). Lá estão seus boletos, a 2ª via e os documentos.',
  ];
  const bol = (d.boletos ?? []).filter((b) => b.linha_digitavel);
  if (bol.length > 0) linhas.push('', 'Seus boletos:', '', ...blocoBoletos(bol));
  return linhas.join('\n').trimEnd();
}
