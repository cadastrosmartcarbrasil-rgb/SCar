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
import type { CodigoModeloEmail, TextosModelo } from './modelos';
import { diasEntre, exemploAviso, formatarCnpj, hojeSp, somarDias, type DadosAviso, type Rodape, type TemplateEmail } from './cobranca';

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
  opts: { origem?: string | null; hoje?: string; textos?: Partial<Record<CodigoModeloEmail, TextosModelo>> } = {},
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
  if (template === 'vence_hoje') return emails.venceHoje({ ...base, textos: opts.textos?.vence_hoje });
  if (template === 'atraso') {
    return emails.atraso({
      ...base, diasAtraso: Math.max(1, relativo), temRastreador: d.temRastreador ? true : undefined,
      textos: opts.textos?.atraso,
    });
  }
  const faltam = -relativo > 0 ? -relativo : Math.max(1, -d.offsetDias);
  return emails.lembrete({ ...base, diasParaVencer: faltam, textos: opts.textos?.lembrete });
}

/**
 * Pre-visualizacao de um modelo (0170) com DADOS DE EXEMPLO e os textos da tela,
 * ainda nao gravados. Cobranca usa o mesmo caminho do envio (renderizarAviso).
 */
export async function renderizarModeloExemplo(
  codigo: CodigoModeloEmail,
  textos: TextosModelo,
  r: Rodape,
  origem?: string | null,
): Promise<EmailRenderizado> {
  const empresa = empresaDoRodape(r);
  const links = linksDaOrigem(origem);
  if (codigo === 'lembrete' || codigo === 'vence_hoje' || codigo === 'atraso') {
    const template: TemplateEmail = codigo === 'lembrete' ? 'aviso_vencimento' : codigo;
    const offset = codigo === 'lembrete' ? -5 : codigo === 'atraso' ? 7 : 0;
    const ex = exemploAviso(template, offset, '#');
    return renderizarAviso(template, { ...ex, temRastreador: codigo === 'atraso' ? true : undefined }, r, {
      origem, hoje: somarDias(ex.vencimento!, offset), textos: { [codigo]: textos },
    });
  }
  if (codigo === 'boas_vindas') {
    return emails.boasVindas({
      nome: 'MARIA DA SILVA', modelo: 'Fiat Argo', placa: 'ABC1D23',
      planos: ['Plano Essencial - Veículos', 'Assistência 24 horas'], textos, empresa, links,
    });
  }
  if (codigo === 'aniversario') {
    return emails.aniversario({ nome: 'MARIA DA SILVA', linkDescadastro: '#', textos, empresa, links });
  }
  return emails.recuperarSenha({ nome: 'MARIA DA SILVA', link: '#', textos, empresa, links });
}

export type ComunicadoGravado = {
  finalidade: 'INFORMATIVO' | 'SERVICO';
  assunto: string;
  titulo: string;
  previa: string | null;
  corpo: string;
  botao_texto: string | null;
  botao_url: string | null;
};

/** Comunicado (0171) para um associado; informativo exige o link de descadastro. */
export function renderizarComunicado(
  c: ComunicadoGravado, nome: string, r: Rodape, origem?: string | null, linkDescadastro?: string,
): Promise<EmailRenderizado> {
  return emails.comunicado({
    nome,
    finalidade: c.finalidade,
    assunto: c.assunto,
    titulo: c.titulo,
    previa: c.previa,
    corpo: c.corpo,
    botaoTexto: c.botao_texto,
    botaoUrl: c.botao_url,
    linkDescadastro,
    empresa: empresaDoRodape(r),
    links: linksDaOrigem(origem),
  });
}
