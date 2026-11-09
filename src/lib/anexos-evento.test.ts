import { describe, expect, it } from 'vitest';
import { motivoAnexoNaoExcluivel, motivoExclusaoValido } from './anexos-evento';

describe('anexos do evento', () => {
  it('foto e documento enviados pela equipe podem sair', () => {
    expect(motivoAnexoNaoExcluivel({ tipo_documento: 'FOTO_AVARIA' })).toBeNull();
    expect(motivoAnexoNaoExcluivel({ tipo_documento: 'CNH', termo_emitido_id: null })).toBeNull();
  });
  it('o que o sistema gerou não sai por aqui', () => {
    expect(motivoAnexoNaoExcluivel({ tipo_documento: 'ORDEM_SERVICO' })).toMatch(/gerado/);
    expect(motivoAnexoNaoExcluivel({ tipo_documento: 'OUTRO', termo_emitido_id: 'x' })).toMatch(/gerado/);
    expect(motivoAnexoNaoExcluivel({ tipo_documento: 'TERMO_ENTREGA_ASSINADO' })).toMatch(/Termos/);
  });
  it('motivo exige 5 caracteres', () => {
    expect(motivoExclusaoValido('erro')).toBe(false);
    expect(motivoExclusaoValido('foto de outro carro')).toBe(true);
  });
});
