/**
 * Renderiza os avisos de cobranca com os templates React Email (./templates).
 * Roda no servidor (rotina, envio de teste e pre-visualizacao do painel).
 *
 * Decisoes que moram aqui:
 * - linha digitavel e PIX vao no corpo (decisao do usuario, 02/11/2026);
 * - a placa nunca vai inteira (so "placa final NN");
 * - rastreador (decisao de 02/11/2026: e a primeira acao da empresa pelo atraso):
 *   com rastreador na ficha o atraso afirma o bloqueio do sinal; sem, o texto e condicional;
 * - dias ate/desde o vencimento contados em Sao Paulo, na hora do envio.
 */
import { emails, type EmailRenderizado } from './templates';
import type { Empresa, Links } from './templates/config';
import { diasEntre, formatarCnpj, hojeSp, type DadosAviso, type Rodape, type TemplateEmail } from './cobranca';

function linkWhatsapp(numero: string | null): string | undefined {
  let d = (numero ?? '').replace(/\D/g, '');
  if (d.length < 10) return undefined;
  if (!d.startsWith('55')) d = `55${d}`;
  return `https://wa.me/${d}`;
}

export function empresaDoRodape(r: Rodape): Partial<Empresa> {
  const e: Partial<Empresa> = { razaoSocial: r.razaoSocial };
  const cnpj = formatarCnpj(r.cnpj);
  if (cnpj) e.cnpj = cnpj;
  if (r.email) e.emailAtendimento = r.email;
  const wa = linkWhatsapp(r.whatsapp);
  if (wa) e.whatsappUrl = wa;
  if (r.site) e.site = r.site;
  return e;
}

/** Links pela origem publica do sistema; variavel de ambiente, quando existe, manda. */
export function linksDaOrigem(origem: string | null | undefined, env: Record<string, string | undefined> = process.env): Partial<Links> {
  const o = (origem ?? '').replace(/\/$/, '');
  if (!o) return {};
  const l: Partial<Links> = {};
  if (!env.EMAIL_LOGO_URL) l.logoUrl = `${o}/email/logo-smartcar-negativa.png`;
  if (!env.PORTAL_LOGIN_URL) l.portalLoginUrl = `${o}/portal/login`;
  if (!env.PORTAL_FATURAS_URL) l.portalFaturasUrl = `${o}/portal/financeiro`;
  return l;
}

export async function renderizarAviso(
  template: TemplateEmail,
  d: DadosAviso,
  r: Rodape,
  opts: { origem?: string | null; hoje?: string } = {},
): Promise<EmailRenderizado> {
  const vencimento = d.vencimento?.slice(0, 10) ?? '';
  const hoje = opts.hoje ?? hojeSp();
  const relativo = vencimento ? diasEntre(vencimento, hoje) : d.offsetDias; // >0 = em atraso
  const base = {
    nome: d.nome ?? '',
    veiculo: d.veiculo ?? undefined,
    valor: d.valor ?? 0,
    vencimento,
    pagamento: {
      linkBoleto: d.linkBoleto ?? undefined,
      linhaDigitavel: d.linhaDigitavel ?? undefined,
      pixCopiaCola: d.pixCopiaCola ?? undefined,
    },
    empresa: empresaDoRodape(r),
    links: linksDaOrigem(opts.origem),
  };
  if (template === 'vence_hoje') return emails.venceHoje(base);
  if (template === 'atraso') {
    return emails.atraso({ ...base, diasAtraso: Math.max(1, relativo), temRastreador: d.temRastreador ? true : undefined });
  }
  const faltam = -relativo > 0 ? -relativo : Math.max(1, -d.offsetDias);
  return emails.lembrete({ ...base, diasParaVencer: faltam });
}
