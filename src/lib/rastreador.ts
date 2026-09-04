// Regras puras do modulo de RASTREADORES (sem I/O), espelhando as constraints
// do banco (0025_rastreadores): formato de IMEI, numero do chip e a regra que
// diz se o veiculo esta com o rastreamento pendente.

/** Mantem so digitos (o operador cola IMEI com espacos/hifens do sistema da rastreadora). */
export function normalizarDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** IMEI: 14 a 17 digitos (mesmo check do banco). 15 e o padrao GSM. */
export function imeiFormatoValido(imei: string | null | undefined): boolean {
  const d = normalizarDigitos(imei);
  return d.length >= 14 && d.length <= 17;
}

/** Digito verificador (Luhn) do IMEI de 15 digitos — vale so para 15 posicoes. */
export function imeiLuhnValido(imei: string | null | undefined): boolean {
  const d = normalizarDigitos(imei);
  if (d.length !== 15) return false;
  let soma = 0;
  for (let i = 0; i < 15; i++) {
    let n = Number(d[i]);
    // dobra as posicoes pares (indice impar), da direita para a esquerda.
    if ((15 - i) % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
  }
  return soma % 10 === 0;
}

/** Numero do chip (linha M2M ou ICCID): 8 a 22 digitos (mesmo check do banco). */
export function chipFormatoValido(chip: string | null | undefined): boolean {
  const d = normalizarDigitos(chip);
  return d.length >= 8 && d.length <= 22;
}

/** Exibicao amigavel do chip: telefone BR (10/11 digitos) ou ICCID em blocos de 4. */
export function formatarChip(chip: string | null | undefined): string {
  const d = normalizarDigitos(chip);
  if (!d) return '';
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export interface DadosRastreador {
  rastreador_imei: string | null;
  rastreador_chip: string | null;
  empresa_rastreamento_id: string | null;
}

/** Ha algum dado de rastreamento preenchido no veiculo? */
export function temRastreador(v: DadosRastreador): boolean {
  return !!(normalizarDigitos(v.rastreador_imei) || normalizarDigitos(v.rastreador_chip) || v.empresa_rastreamento_id);
}

export type SituacaoRastreamento = 'COMPLETO' | 'INCOMPLETO' | 'PENDENTE' | 'NAO_EXIGE';

/**
 * Situacao do rastreamento do veiculo.
 * `exige` vem da regra por tipo de veiculo (`tipos_veiculo.exige_rastreador`).
 *  - COMPLETO  : IMEI + chip + prestador informados.
 *  - INCOMPLETO: comecou a preencher mas falta algo.
 *  - PENDENTE  : exige rastreador e nao ha nenhum dado (alerta "Rastreador pendente").
 *  - NAO_EXIGE : nao exige e nada preenchido.
 */
export function situacaoRastreamento(v: DadosRastreador, exige = false): SituacaoRastreamento {
  const imei = imeiFormatoValido(v.rastreador_imei);
  const chip = chipFormatoValido(v.rastreador_chip);
  const prestador = !!v.empresa_rastreamento_id;
  if (imei && chip && prestador) return 'COMPLETO';
  if (temRastreador(v)) return 'INCOMPLETO';
  return exige ? 'PENDENTE' : 'NAO_EXIGE';
}

/** Valida o formulario de rastreamento; devolve a mensagem do primeiro erro (ou null). */
export function validarRastreador(v: DadosRastreador): string | null {
  const imei = normalizarDigitos(v.rastreador_imei);
  const chip = normalizarDigitos(v.rastreador_chip);
  if (imei && !imeiFormatoValido(imei)) return 'IMEI deve ter de 14 a 17 digitos';
  if (chip && !chipFormatoValido(chip)) return 'Numero do chip deve ter de 8 a 22 digitos';
  if ((imei || chip) && !v.empresa_rastreamento_id) return 'Informe a empresa de rastreamento ("Rastreador por")';
  return null;
}
