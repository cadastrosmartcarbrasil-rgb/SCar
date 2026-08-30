// ============================================================================
// CRLV-e — leitura do QR Code.
//
// LIMITE REAL, para nao prometer o que nao da: o QR do CRLV digital NAO carrega
// a ficha do veiculo em texto. Ele aponta para a pagina de validacao do
// documento no gov.br/Detran. Extrair marca, modelo e ano a partir dele exigiria
// uma API paga (SERPRO/Senatran), que este sistema nao contrata.
//
// O que da para fazer com seguranca, e e o que fazemos:
//   1. Guardar o conteudo do QR como COMPROVANTE de que o CRLV foi apresentado.
//   2. Pescar do texto o que for reconhecivel — placa, Renavam e chassi
//      aparecem em boa parte dos QRs (na querystring ou no corpo).
//   3. Com a placa em maos, a consulta que ja existe (`/api/fipe`,
//      `getplacafipe`) preenche marca/modelo/ano/valor FIPE.
//
// Ou seja: o QR resolve identificacao e prova documental; a ficha vem da FIPE.
// ============================================================================

export interface DadosCrlv {
  /** Conteudo bruto lido do QR — sempre guardado como comprovante. */
  bruto: string;
  /** URL de validacao, quando o QR for um link (o caso mais comum). */
  url: string | null;
  placa: string | null;
  renavam: string | null;
  chassi: string | null;
}

/** Placa Mercosul (ABC1D23) ou antiga (ABC1234). */
const RE_PLACA = /\b([A-Z]{3})[- ]?(\d)([A-Z\d])(\d{2})\b/;
/** Chassi: 17 caracteres, sem I, O e Q (padrao VIN). */
const RE_CHASSI = /\b([A-HJ-NPR-Z0-9]{17})\b/;
const RE_RENAVAM = /\b(\d{9,11})\b/;

const CHAVES = {
  placa: ['placa', 'plate', 'pl'],
  renavam: ['renavam', 'rnv'],
  chassi: ['chassi', 'chassis', 'vin'],
};

function deParametros(texto: string): Partial<Record<keyof typeof CHAVES, string>> {
  const achados: Partial<Record<keyof typeof CHAVES, string>> = {};
  // Aceita tanto "placa=ABC1D23" (querystring) quanto "PLACA: ABC1D23" (corpo).
  const pares = texto.matchAll(/([A-Za-zçÇ_]+)\s*[:=]\s*([A-Za-z0-9-]+)/g);
  for (const [, chave, valor] of pares) {
    const k = chave.trim().toLowerCase();
    (Object.keys(CHAVES) as (keyof typeof CHAVES)[]).forEach((campo) => {
      if (!achados[campo] && CHAVES[campo].includes(k)) achados[campo] = valor;
    });
  }
  return achados;
}

export function normalizarPlaca(v: string | null | undefined): string | null {
  const s = (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(s) ? s : null;
}

/**
 * Interpreta o conteudo de um QR Code de CRLV.
 * Nunca lanca: o que nao for reconhecido volta como null e o bruto fica
 * guardado do mesmo jeito, porque ele e a prova de que o documento existe.
 */
export function interpretarQrCrlv(conteudo: string): DadosCrlv {
  const bruto = (conteudo ?? '').trim();
  const texto = bruto.toUpperCase();

  const url = /^https?:\/\//i.test(bruto) ? bruto : null;
  const params = deParametros(bruto);

  const placa =
    normalizarPlaca(params.placa) ??
    (() => {
      const m = texto.match(RE_PLACA);
      return m ? normalizarPlaca(m[1] + m[2] + m[3] + m[4]) : null;
    })();

  const chassiBruto = (params.chassi ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const chassi =
    /^[A-HJ-NPR-Z0-9]{17}$/.test(chassiBruto) ? chassiBruto : (texto.match(RE_CHASSI)?.[1] ?? null);

  const renavamBruto = (params.renavam ?? '').replace(/\D/g, '');
  let renavam: string | null = renavamBruto.length >= 9 && renavamBruto.length <= 11 ? renavamBruto : null;
  if (!renavam) {
    // Evita confundir o Renavam com outro numero longo do proprio chassi.
    const semChassi = chassi ? texto.replace(chassi, ' ') : texto;
    renavam = semChassi.match(RE_RENAVAM)?.[1] ?? null;
  }

  return { bruto, url, placa, renavam, chassi };
}

/** O QR trouxe algo aproveitavel para adiantar o cadastro? */
export function qrTrouxeDados(d: DadosCrlv): boolean {
  return !!(d.placa || d.renavam || d.chassi);
}
