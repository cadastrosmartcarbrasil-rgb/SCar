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

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

/** Primeiro e ultimo dia do mes de referencia (YYYY-MM-DD). */
export function monthRange(ref = new Date()): { inicio: string; fim: string } {
  const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: iso(inicio), fim: iso(fim) };
}
