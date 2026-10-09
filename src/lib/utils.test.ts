import { describe, it, expect } from 'vitest';
import { formatDate } from './utils';

describe('formatDate', () => {
  it('data pura (coluna date) e o MESMO dia, em qualquer fuso', () => {
    // new Date('2025-11-28') e meia-noite UTC: no Brasil virava 27/11.
    expect(formatDate('2025-11-28')).toBe('28/11/2025');
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
  });

  it('timestamp e Date seguem funcionando', () => {
    expect(formatDate('2026-03-10T15:00:00')).toBe('10/03/2026');
    expect(formatDate(new Date(2026, 2, 10))).toBe('10/03/2026');
  });

  it('vazio vira traco', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('')).toBe('-');
  });
});
