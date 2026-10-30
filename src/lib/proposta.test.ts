import { describe, expect, it } from 'vitest';
import {
  ASSISTENCIA_24H_PROPOSTA, montarProposta, regrasDaProposta, textoReboque, tituloLegivel, validadeDaProposta,
  valorDoNome, type FontesProposta,
} from './proposta';

const PROIBIDAS = /\b(seguro|segurado|ap[óo]lice|pr[êe]mio|sinistro|indeniza[çc][ãa]o|franquia|corretor)\b/i;

const tipoCarro = { nome: 'Passeio', exige_rastreador: true, valor_limite_isencao: 59999.99, km_reboque_ida: 500, km_reboque_volta: 500 };

function fontes(p: Partial<FontesProposta> = {}, cot: Partial<FontesProposta['cotacao']> = {}): FontesProposta {
  return {
    cotacao: {
      token: 'tok', created_at: '2026-10-30T20:29:51Z', modo_envio: 'DETALHADA', fipe: 49326,
      itens: [
        { produto_id: 'adm', nome: 'Taxa Administrativa', valor: 17.5, obrigatorio: true, categoria: 'ADMIN' },
        { produto_id: 'a24', nome: 'Assistencia 24h', valor: 14, obrigatorio: true, categoria: 'BENEFICIO' },
        { produto_id: 'cas', nome: 'Protecao Casco (RFC)', valor: 63, obrigatorio: true, categoria: 'CASCO' },
        { produto_id: 'rcf', nome: 'RCF - Terceiros 30mil', valor: 10, obrigatorio: false, categoria: 'RCF' },
        { produto_id: 'cr7', nome: 'Carro Reserva 7 dias', valor: 0, obrigatorio: false, categoria: 'BENEFICIO' },
      ],
      total_mensalidade: 104.5, total_com_desconto: 109.5, valor_assistencia_profissional: 5,
      taxa_adesao: 250, participacao: 4932.6,
      ...cot,
    },
    lead: { placa: 'QXV9D19', marca: 'Jeep', modelo: 'Compass', ano_modelo: 2020, aceite_em: null, aceite_cotacao_id: null },
    cotacaoId: 'c1',
    ultimaCotacaoId: 'c1',
    plano: { nome: 'PLANO ECONÔMICO' },
    cotaPercentual: 0.1,
    tipo: tipoCarro,
    produtos: [{ id: 'vid', categoria: 'VIDROS', descricao_cobertura: 'PARABRISAS, VIDROS LATERAIS, RETROVISORES' }],
    consultor: { nome: 'BIANCA MENDEZ', telefone: '(65) 99999-0000', email: 'Bianca@AppSmartCar.com.br' },
    empresa: { razao_social: 'SMART CAR', nome_fantasia: null, cnpj: '23427787000178', site: null, telefone_fixo: null,
      regulamento_url: null, validade_proposta_dias: 30 },
    origem: 'https://appsmartcar.com.br/',
    ...p,
  };
}

describe('proposta comercial v2', () => {
  it('total do cliente e itens sem a Assistência Profissional como linha', () => {
    const d = montarProposta(fontes());
    expect(d.valores.mensal).toBe(109.5);
    expect(JSON.stringify(d)).not.toMatch(/assist[eê]ncia profissional/i);
    expect(d.valores.adesao).toBe(250);
    expect(d.valores.cotaPercentual).toBe(0.1);
    expect(d.valores.cotaValor).toBe(4932.6);
    expect(d.link).toBe('https://appsmartcar.com.br/cotacao/tok');
  });

  it('casco aberto em itens, terceiros com o limite e carro reserva com os dias', () => {
    const d = montarProposta(fontes());
    const t = d.coberturas.map((c) => c.titulo);
    expect(t.slice(0, 5)).toEqual(['Roubo e furto', 'Colisão', 'Perda total', 'Incêndio após colisão', 'Fenômenos da natureza']);
    expect(d.coberturas.find((c) => c.titulo === 'Proteção a terceiros')?.detalhe).toContain('R$ 30.000,00');
    expect(d.coberturas.find((c) => c.titulo === 'Carro reserva')?.detalhe).toContain('7 dias');
    expect(t).not.toContain('Taxa Administrativa');
    expect(t).not.toContain('Assistencia 24h');
  });

  it('consolidada não lista valor por item', () => {
    const d = montarProposta(fontes({}, { modo_envio: 'CONSOLIDADA' }));
    expect(d.detalhada).toBe(false);
    expect(d.coberturas.some((c) => /\/mês/.test(c.detalhe ?? ''))).toBe(false);
    const det = montarProposta(fontes());
    expect(det.coberturas.find((c) => c.titulo === 'Proteção a terceiros')?.detalhe).toContain('/mês');
  });

  it('sem vidros: sem tile e sem a regra; com vidros: tipo e descrição', () => {
    expect(montarProposta(fontes()).vidros).toBeNull();
    expect(montarProposta(fontes()).regras.map((r) => r.titulo)).not.toContain('Vidros, lanternas e faróis');
    const comVidros = fontes({}, {
      itens: [...fontes().cotacao.itens, { produto_id: 'vid', nome: 'VIDROS III - PARAB + V LAT', valor: 23.5, obrigatorio: false }],
    });
    const d = montarProposta(comVidros);
    expect(d.vidros?.tipo).toBe('Vidros III');
    expect(d.vidros?.descricao).toContain('Parabrisas');
    expect(d.regras.map((r) => r.titulo)).toContain('Vidros, lanternas e faróis');
  });

  it('rastreador: item cobrado, regra do tipo ou não exigido', () => {
    const comItem = fontes({}, {
      itens: [...fontes().cotacao.itens, { produto_id: null, nome: 'Rastreador', valor: 35, obrigatorio: true }],
    });
    expect(montarProposta(comItem).valores.rastreador).toBe('R$ 35,00/mês');
    expect(montarProposta({ ...comItem, cotacao: { ...comItem.cotacao, modo_envio: 'CONSOLIDADA' } }).valores.rastreador).toBe('Incluso');
    expect(montarProposta(fontes()).valores.rastreador).toBe('Não exigido');
    const moto = { ...tipoCarro, nome: 'Moto', exige_rastreador: false };
    expect(montarProposta(fontes({ tipo: moto })).valores.rastreador).toBe('Não exigido');
  });

  it('regra do rastreador lida do tipo, não de número fixo', () => {
    const r = regrasDaProposta({ ...tipoCarro, nome: 'Moto', valor_limite_isencao: 15999.99 }, false);
    expect(r.find((x) => x.titulo === 'Rastreador')?.texto).toContain('R$ 16.000,00');
    expect(regrasDaProposta({ ...tipoCarro, exige_rastreador: false }, false).map((x) => x.titulo)).not.toContain('Rastreador');
  });

  it('sem consultor o bloco fica nulo; com ele o nome legível', () => {
    expect(montarProposta(fontes({ consultor: null })).consultor).toBeNull();
    const d = montarProposta(fontes());
    expect(d.consultor?.nome).toBe('Bianca Mendez');
    expect(d.consultor?.email).toBe('bianca@appsmartcar.com.br');
  });

  it('reboque pelo tipo do veículo; sem km, o texto não inventa número', () => {
    expect(textoReboque(montarProposta(fontes()).reboque)).toEqual({ total: '1.000 km', detalhe: '500 km ida + 500 km volta' });
    const semKm = montarProposta(fontes({ tipo: { ...tipoCarro, km_reboque_ida: null, km_reboque_volta: null } }));
    expect(textoReboque(semKm.reboque).total).not.toMatch(/\d/);
  });

  it('validade pelos dias da empresa, no fuso de São Paulo', () => {
    expect(validadeDaProposta('2026-10-30T20:29:51Z', 30)).toBe('29/11/2026');
    expect(montarProposta(fontes()).validade).toBe('29/11/2026');
    expect(montarProposta(fontes()).dataCotacao).toBe('30/10/2026');
  });

  it('aceite: desatualizada quando há cotação mais nova; data só do aceite desta', () => {
    expect(montarProposta(fontes({ ultimaCotacaoId: 'c2' })).aceite.desatualizada).toBe(true);
    const aceita = montarProposta(fontes({
      lead: { ...fontes().lead!, aceite_em: '2026-10-31T12:00:00Z', aceite_cotacao_id: 'c1' },
    }));
    expect(aceita.aceite).toEqual({ feito: true, em: '31/10/2026', desatualizada: false });
  });

  it('textos e auxiliares', () => {
    expect(tituloLegivel('SAÚDE SMART - DESCONTO')).toBe('Saúde Smart - Desconto');
    expect(tituloLegivel('Carro Reserva')).toBe('Carro Reserva');
    expect(valorDoNome('MOTOCICLETA - TERCEIROS ATÉ R$ 20.000,00')).toBe(20000);
    expect(valorDoNome('RCF - Terceiros 100mil')).toBe(100000);
  });

  it('nenhuma palavra proibida nos textos fixos', () => {
    const textos = [
      ...ASSISTENCIA_24H_PROPOSTA.flatMap((s) => [s.servico, s.inclui, s.limite]),
      ...regrasDaProposta(tipoCarro, true).flatMap((r) => [r.titulo, r.texto]),
    ].join(' | ');
    expect(textos).not.toMatch(PROIBIDAS);
  });
});
