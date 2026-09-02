/**
 * Cartao de credito — validacao no navegador, antes de sair da tela.
 *
 * REGRA QUE NAO SE NEGOCIA: o numero do cartao e o CVV **nunca** sao gravados
 * no nosso banco. Eles vao do formulario direto para o gateway, que devolve um
 * TOKEN; o que guardamos e o token, a bandeira e os 4 ultimos digitos. Guardar
 * o numero (PAN) exigiria certificacao PCI-DSS e nao existe motivo para isso.
 *
 * O que este arquivo faz e pegar o erro de digitacao ANTES da chamada — o
 * cliente descobre que errou um digito na hora, nao depois de uma recusa.
 */

export type Bandeira = 'VISA' | 'MASTERCARD' | 'ELO' | 'AMEX' | 'HIPERCARD' | 'DINERS' | 'DESCONHECIDA';

export function apenasDigitos(v: string): string {
  return (v ?? '').replace(/\D/g, '');
}

/** Bandeira pelo BIN (os primeiros digitos). Best-effort, so para exibir. */
export function bandeiraDoNumero(numero: string): Bandeira {
  const n = apenasDigitos(numero);
  if (/^4/.test(n)) return 'VISA';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'MASTERCARD';
  if (/^3[47]/.test(n)) return 'AMEX';
  if (/^(36|38|30[0-5])/.test(n)) return 'DINERS';
  if (/^(606282|3841)/.test(n)) return 'HIPERCARD';
  if (/^(4011|4312|4389|4514|4573|5041|5066|5090|6277|6362|6363|650|651|655)/.test(n)) return 'ELO';
  return 'DESCONHECIDA';
}

/** Algoritmo de Luhn — pega o digito trocado sem consultar ninguem. */
export function numeroValido(numero: string): boolean {
  const n = apenasDigitos(numero);
  if (n.length < 13 || n.length > 19) return false;

  let soma = 0;
  let dobra = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (dobra) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    dobra = !dobra;
  }
  return soma % 10 === 0;
}

/** Formata em grupos de 4 (AMEX usa 4-6-5). */
export function formatarNumero(numero: string): string {
  const n = apenasDigitos(numero).slice(0, 19);
  if (bandeiraDoNumero(n) === 'AMEX') {
    return [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15)].filter(Boolean).join(' ');
  }
  return (n.match(/.{1,4}/g) ?? []).join(' ');
}

export function ultimosDigitos(numero: string): string {
  return apenasDigitos(numero).slice(-4);
}

/** MM/AA -> {mes, ano}; devolve null quando ainda nao da para interpretar. */
export function interpretarValidade(texto: string): { mes: number; ano: number } | null {
  const n = apenasDigitos(texto);
  if (n.length < 4) return null;
  const mes = Number(n.slice(0, 2));
  const ano = Number(n.length >= 6 ? n.slice(2, 6) : `20${n.slice(2, 4)}`);
  if (!mes || mes < 1 || mes > 12) return null;
  return { mes, ano };
}

export function formatarValidade(texto: string): string {
  const n = apenasDigitos(texto).slice(0, 4);
  return n.length <= 2 ? n : `${n.slice(0, 2)}/${n.slice(2)}`;
}

/** O cartao ja venceu? Vale ate o ULTIMO dia do mes informado. */
export function validadeExpirada(mes: number, ano: number, hoje = new Date()): boolean {
  const fim = new Date(ano, mes, 0, 23, 59, 59); // dia 0 do mes seguinte = ultimo dia deste
  return fim.getTime() < hoje.getTime();
}

/** AMEX usa 4 digitos de seguranca; o resto, 3. */
export function cvvValido(cvv: string, numero: string): boolean {
  const c = apenasDigitos(cvv);
  return bandeiraDoNumero(numero) === 'AMEX' ? c.length === 4 : c.length === 3;
}

export interface DadosCartao {
  numero: string;
  nome: string;
  validade: string;
  cvv: string;
}

/** Uma mensagem por vez, na ordem em que o formulario e preenchido. */
export function validarCartao(d: DadosCartao, hoje = new Date()): string | null {
  if (!numeroValido(d.numero)) return 'Confira o numero do cartao';
  if (!d.nome?.trim() || !d.nome.trim().includes(' ')) {
    return 'Informe o nome como esta impresso no cartao';
  }
  const v = interpretarValidade(d.validade);
  if (!v) return 'Informe a validade no formato MM/AA';
  if (validadeExpirada(v.mes, v.ano, hoje)) return 'Este cartao esta vencido';
  if (!cvvValido(d.cvv, d.numero)) return 'Confira o codigo de seguranca';
  return null;
}
