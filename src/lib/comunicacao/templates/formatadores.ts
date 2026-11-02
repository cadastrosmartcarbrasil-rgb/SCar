/** Formatadores pt-BR. Datas "date-only" NÃO passam por Date() para evitar deslocamento de fuso. */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatarMoeda = (valor: number) => brl.format(valor);

/** 'YYYY-MM-DD' -> '10/11/2026'. Aceita também Date (usa America/Cuiaba). */
export function formatarData(d: string | Date): string {
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return d;
  }
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Cuiaba' }).format(d);
}

/** 'PAULO ROGÉRIO DA SILVA' -> 'Paulo' */
export function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? '';
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR');
}

export const pluralDias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
