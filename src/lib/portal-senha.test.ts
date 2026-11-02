import { describe, expect, it } from 'vitest';
import { problemaDaNovaSenha } from './portal-senha';

describe('nova senha do portal', () => {
  it('exige 8 caracteres, confirmacao igual e nao so numeros', () => {
    expect(problemaDaNovaSenha('abc12', 'abc12')).toMatch(/8 caracteres/);
    expect(problemaDaNovaSenha('abcd1234', 'abcd12345')).toMatch(/não conferem/);
    expect(problemaDaNovaSenha('12345678901', '12345678901')).toMatch(/só números/);
    expect(problemaDaNovaSenha('abcd1234', 'abcd1234')).toBeNull();
  });
});
