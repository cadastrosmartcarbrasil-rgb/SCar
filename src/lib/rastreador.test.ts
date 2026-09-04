import { describe, it, expect } from 'vitest';
import {
  normalizarDigitos, imeiFormatoValido, imeiLuhnValido, chipFormatoValido,
  formatarChip, temRastreador, situacaoRastreamento, validarRastreador,
  STATUS_RASTREADOR, statusMeta, rotuloStatus, transicoesValidas, podeTransicionar,
  exigeMotivo, statusEscolhiveis, alertaDePrazo, rotuloDivergencia,
  type DadosRastreador, type StatusRastreador,
} from './rastreador';

const base: DadosRastreador = { rastreador_imei: null, rastreador_chip: null, empresa_rastreamento_id: null };

describe('normalizacao', () => {
  it('mantem so digitos', () => {
    expect(normalizarDigitos(' 86.012-345 678 9012 ')).toBe('860123456789012');
    expect(normalizarDigitos(null)).toBe('');
  });
});

describe('IMEI', () => {
  it('aceita 14 a 17 digitos (mesmo check do banco)', () => {
    expect(imeiFormatoValido('86012345678901')).toBe(true);     // 14
    expect(imeiFormatoValido('860123456789012')).toBe(true);    // 15
    expect(imeiFormatoValido('86012345678901234')).toBe(true);  // 17
    expect(imeiFormatoValido('8601234567890')).toBe(false);     // 13
    expect(imeiFormatoValido('860123456789012345')).toBe(false);// 18
    expect(imeiFormatoValido('')).toBe(false);
  });
  it('Luhn: valida o digito verificador do IMEI de 15 posicoes', () => {
    expect(imeiLuhnValido('490154203237518')).toBe(true);  // IMEI de exemplo (3GPP)
    expect(imeiLuhnValido('490154203237519')).toBe(false); // DV trocado
    expect(imeiLuhnValido('86012345678901')).toBe(false);  // 14 digitos: nao se aplica
  });
});

describe('chip', () => {
  it('aceita 8 a 22 digitos', () => {
    expect(chipFormatoValido('5511998877665')).toBe(true);
    expect(chipFormatoValido('8955170000000000000')).toBe(true); // ICCID
    expect(chipFormatoValido('1234567')).toBe(false);
  });
  it('formata telefone BR e ICCID', () => {
    expect(formatarChip('11998877665')).toBe('(11) 99887-7665');
    expect(formatarChip('1133224455')).toBe('(11) 3322-4455');
    expect(formatarChip('8955170000000000000')).toBe('8955 1700 0000 0000 000');
    expect(formatarChip(null)).toBe('');
  });
});

describe('situacao do rastreamento', () => {
  const completo: DadosRastreador = { rastreador_imei: '860123456789012', rastreador_chip: '5511998877665', empresa_rastreamento_id: 'er-1' };
  it('completo com IMEI + chip + prestador', () => {
    expect(situacaoRastreamento(completo)).toBe('COMPLETO');
    expect(temRastreador(completo)).toBe(true);
  });
  it('incompleto quando falta o chip', () => {
    expect(situacaoRastreamento({ ...completo, rastreador_chip: null })).toBe('INCOMPLETO');
  });
  it('pendente quando a regra exige e nada foi preenchido', () => {
    expect(situacaoRastreamento(base, true)).toBe('PENDENTE');
    expect(situacaoRastreamento(base, false)).toBe('NAO_EXIGE');
    expect(temRastreador(base)).toBe(false);
  });
});

describe('validacao do formulario', () => {
  it('vazio e valido (nem todo veiculo tem rastreador)', () => {
    expect(validarRastreador(base)).toBeNull();
  });
  it('cobra prestador quando ha IMEI ou chip', () => {
    expect(validarRastreador({ ...base, rastreador_imei: '860123456789012' }))
      .toBe('Informe a empresa de rastreamento ("Rastreador por")');
  });
  it('reclama de tamanho invalido', () => {
    expect(validarRastreador({ ...base, rastreador_imei: '123', empresa_rastreamento_id: 'er-1' }))
      .toBe('IMEI deve ter de 14 a 17 digitos');
    expect(validarRastreador({ ...base, rastreador_chip: '123', empresa_rastreamento_id: 'er-1' }))
      .toBe('Numero do chip deve ter de 8 a 22 digitos');
  });
  it('completo passa', () => {
    expect(validarRastreador({ rastreador_imei: '860123456789012', rastreador_chip: '5511998877665', empresa_rastreamento_id: 'er-1' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Modulo de rastreadores (0050)
// ---------------------------------------------------------------------------
describe('status do equipamento', () => {
  it('os 11 status guardam a numeracao do sistema antigo', () => {
    expect(STATUS_RASTREADOR).toHaveLength(11);
    expect(STATUS_RASTREADOR.map((s) => s.numero)).toEqual([1,2,3,4,5,6,7,8,9,10,11]);
    expect(statusMeta('ATIVO').numero).toBe(2);
    expect(rotuloStatus('ATIVO')).toBe('2 - Ativo / Instalado');
    expect(rotuloStatus('BAIXADO')).toBe('11 - Baixado');
  });
});

describe('maquina de estados', () => {
  it('do estoque so sai para instalado ou para os desvios', () => {
    expect(podeTransicionar('DISPONIVEL', 'ATIVO')).toBe(true);
    expect(podeTransicionar('DISPONIVEL', 'BOLETO_GERADO')).toBe(false);
  });
  it('do veiculo volta ao estoque ou entra na fila de recuperacao', () => {
    expect(transicoesValidas('ATIVO')).toContain('A_DEVOLVER');
    expect(transicoesValidas('ATIVO')).toContain('DISPONIVEL');
  });
  it('baixado e terminal', () => {
    expect(transicoesValidas('BAIXADO')).toEqual([]);
    expect(podeTransicionar('BAIXADO', 'DISPONIVEL')).toBe(false);
  });
  it('o mesmo status e sempre aceito (salvar sem mudar nada)', () => {
    expect(podeTransicionar('MANUTENCAO', 'MANUTENCAO')).toBe(true);
  });
  it('ATIVO nao entra no menu de status — ativar e instalar, e exige veiculo', () => {
    expect(statusEscolhiveis('DISPONIVEL')).not.toContain('ATIVO');
    expect(statusEscolhiveis('INADIMPLENTE')).not.toContain('ATIVO');
  });
  it('baixa, duplicidade e cobranca pedem motivo', () => {
    expect(exigeMotivo('BAIXADO')).toBe(true);
    expect(exigeMotivo('DUPLICADO')).toBe(true);
    expect(exigeMotivo('COBRAR_RASTREADOR')).toBe(true);
    expect(exigeMotivo('DISPONIVEL')).toBe(false);
  });
  it('nenhum status aponta para si mesmo na tabela de transicoes', () => {
    for (const s of STATUS_RASTREADOR) {
      expect(transicoesValidas(s.status)).not.toContain(s.status as StatusRastreador);
    }
  });
});

describe('prazos (contados de status_desde)', () => {
  const HOJE = new Date('2026-09-20T12:00:00Z');
  it('devolucao pedida ha mais de 5 dias sugere cobrar', () => {
    const a = alertaDePrazo('A_DEVOLVER', '2026-09-10T12:00:00Z', HOJE);
    expect(a?.dias).toBe(10);
    expect(a?.sugestao).toBe('COBRAR_RASTREADOR');
  });
  it('dentro do prazo nao alerta', () => {
    expect(alertaDePrazo('A_DEVOLVER', '2026-09-17T12:00:00Z', HOJE)).toBeNull();
  });
  it('inadimplente ha mais de 35 dias sugere pedir de volta', () => {
    expect(alertaDePrazo('INADIMPLENTE', '2026-07-01T12:00:00Z', HOJE)?.sugestao).toBe('A_DEVOLVER');
  });
  it('manutencao arrastada so destaca, sem sugerir', () => {
    const a = alertaDePrazo('MANUTENCAO', '2026-08-01T12:00:00Z', HOJE);
    expect(a?.sugestao).toBeNull();
    expect(a?.mensagem).toContain('manutencao');
  });
  it('equipamento em estoque nao tem prazo', () => {
    expect(alertaDePrazo('DISPONIVEL', '2020-01-01T12:00:00Z', HOJE)).toBeNull();
  });
  it('data ausente ou invalida nao quebra', () => {
    expect(alertaDePrazo('A_DEVOLVER', null, HOJE)).toBeNull();
    expect(alertaDePrazo('A_DEVOLVER', 'nao e data', HOJE)).toBeNull();
  });
});

describe('divergencias', () => {
  it('traduz o tipo do banco para a tela', () => {
    expect(rotuloDivergencia('FICHA_SEM_EQUIPAMENTO')).toBe('Ficha do veiculo sem equipamento cadastrado');
    expect(rotuloDivergencia('TIPO_QUE_NAO_EXISTE')).toBe('TIPO_QUE_NAO_EXISTE');
  });
});
