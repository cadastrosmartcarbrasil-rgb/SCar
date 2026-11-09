import { describe, expect, it } from 'vitest';
import {
  anexosVigentes, duracaoLegivel, ehVideo, nomeDaPose, rotuloVistoria, situacaoVistoria,
  type AnexoVistoria, type RevistoriaResumo,
} from './vistorias-veiculo';

const a = (id: string, tipo: string | null, created_at: string, url = `x/${id}.jpg`): AnexoVistoria => ({
  id, url, tipo, descricao: null, created_at, tamanho_bytes: null, enviado_pelo_cliente: false, duracao_segundos: null,
});

const rev = (situacao: string, motivo: string | null = null): RevistoriaResumo => ({
  situacao, enviado_em: null, analisado_em: null, observacao_analise: null, motivo_reprovacao: motivo,
  dispensa_justificativa: null, vencimento_referencia: null, dias_atraso: null,
});

describe('vistorias do veículo', () => {
  it('rotula pelo tipo', () => {
    expect(rotuloVistoria('inicial')).toBe('Vistoria de adesão');
    expect(rotuloVistoria('revistoria_cobranca')).toBe('Revistoria da 2ª via');
    expect(rotuloVistoria(null)).toBe('Vistoria');
  });

  it('a situação da revistoria vence o status da vistoria', () => {
    expect(situacaoVistoria('PENDENTE', rev('EM_ANALISE')).texto).toBe('Em análise');
    expect(situacaoVistoria('APROVADA', rev('UTILIZADA')).tom).toBe('verde');
    expect(situacaoVistoria('PENDENTE', rev('AGUARDANDO', 'foto escura')).texto).toContain('Reprovada');
    expect(situacaoVistoria('APROVADA').texto).toBe('Aprovada');
    expect(situacaoVistoria('XPTO').texto).toBe('XPTO');
  });

  it('reconhece vídeo', () => {
    expect(ehVideo({ tipo: 'REV_VIDEO_VOLTA', url: 'a.bin' })).toBe(true);
    expect(ehVideo({ tipo: null, url: 'a/b.MP4' })).toBe(true);
    expect(ehVideo({ tipo: 'FRENTE', url: 'a.jpg' })).toBe(false);
  });

  it('nome da pose pelo catálogo ou legível', () => {
    expect(nomeDaPose('FRENTE', { FRENTE: 'Frente' })).toBe('Frente');
    expect(nomeDaPose('REV_VIDEO_VOLTA', {})).toBe('Video volta');
    expect(nomeDaPose(null, {})).toBe('Arquivo');
  });

  it('uma foto por pose, a mais recente, na ordem do catálogo', () => {
    const r = anexosVigentes([
      a('1', 'TRASEIRA', '2026-11-01T10:00:00Z'),
      a('2', 'FRENTE', '2026-11-01T10:00:00Z'),
      a('3', 'FRENTE', '2026-11-02T10:00:00Z'),
      a('4', null, '2026-11-01T09:00:00Z'),
    ], { FRENTE: 1, TRASEIRA: 2 });
    expect(r.vigentes.map((x) => x.id)).toEqual(['3', '1', '4']);
    expect(r.substituidos).toBe(1);
  });

  it('duração legível', () => {
    expect(duracaoLegivel(26.3)).toBe('26 s');
    expect(duracaoLegivel(65)).toBe('1 min 05 s');
    expect(duracaoLegivel(null)).toBeNull();
  });
});
