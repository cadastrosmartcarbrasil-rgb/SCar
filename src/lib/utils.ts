import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatCurrency(value: number | null | undefined): string {
  return BRL.format(value ?? 0);
}

const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 2 });
export function formatPercent(fraction: number | null | undefined): string {
  return PCT.format(fraction ?? 0);
}

// Mascara de celular BR: (11) 91234-5678
export function maskCelular(v: string): string {
  const d = (v ?? '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d{0,2})/, '($1');
  if (d.length <= 6) return d.replace(/(\d{2})(\d{0,4})/, '($1) $2');
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

/** CEP no formato 00000-000. Guarda-se so os digitos; a mascara e da tela. */
export function maskCep(v: string): string {
  const d = (v ?? '').replace(/\D/g, '').slice(0, 8);
  return d.length <= 5 ? d : d.replace(/(\d{5})(\d{0,3})/, '$1-$2');
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

/** Data + hora (usado em trilhas de auditoria). */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

/** Primeiro e ultimo dia do mes de referencia (YYYY-MM-DD). */
export function monthRange(ref = new Date()): { inicio: string; fim: string } {
  const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: iso(inicio), fim: iso(fim) };
}
