import { describe, it, expect } from 'vitest';
import { registroDaPlaca, parseValor, combustivelEnum } from './fipe';

// Payload REAL da Placa Fipe (placa OAW0838, conferido em producao em
// 12/09/2026). Guardado aqui inteiro de proposito: foi ele que provou que o
// chassi SEMPRE veio e nos e que o descartavamos — sem uma amostra real no
// repositorio a proxima sessao chuta de novo o formato da resposta.
const INFORMACOES_VEICULO = {
  marca: 'TOYOTA',
  modelo: 'COROLLA XEI 20FLEX',
  modelo_lista: ['COROLLA', 'XEI', '20FLEX'],
  ano: '2019',
  ano_modelo: '2019',
  cor: 'Preta',
  chassi: '9BRBD3HE1K0445518',
  motor: 'M650484',
  municipio: 'CUIABÁ',
  uf: 'MT',
  segmento: 'Automóvel',
  sub_segmento: null,
  placa: 'OAW0838',
  placa_alternativa: 'OAW0I38',
  cilindradas: '1987',
  potencia: '154',
  combustivel: 'Álcool/Gasolina',
};

describe('registroDaPlaca — o REGISTRO que vinha e a gente jogava fora', () => {
  it('le o payload real da Placa Fipe', () => {
    const r = registroDaPlaca(INFORMACOES_VEICULO)!;
    expect(r.chassi).toBe('9BRBD3HE1K0445518');
    expect(r.numeroMotor).toBe('M650484');
    expect(r.cor).toBe('PRETA');
    expect(r.anoFabricacao).toBe(2019);
    expect(r.anoModelo).toBe(2019);
    expect(r.municipio).toBe('CUIABÁ');
    expect(r.uf).toBe('MT');
  });

  it('traduz o combustivel do REGISTRO, que vem escrito diferente do da FIPE', () => {
    // O bloco da avaliacao diz "FLEX"; o do documento diz "Álcool/Gasolina".
    // Os dois tem de cair no mesmo valor do enum, senao a ficha do veiculo
    // muda de combustivel dependendo de qual bloco preencheu.
    expect(registroDaPlaca(INFORMACOES_VEICULO)!.combustivel).toBe('flex');
    expect(combustivelEnum('FLEX')).toBe('flex');
  });

  it('normaliza o chassi como o BANCO normaliza (so alfanumerico, caixa alta)', () => {
    // `autorizar_entrada_lead` (0034) grava
    // `upper(regexp_replace(chassi, '[^0-9A-Za-z]', '', 'g'))`. Se a tela
    // mandasse com pontuacao, o mesmo carro entraria com dois chassis
    // diferentes conforme o caminho — venda ou cadastro direto.
    const r = registroDaPlaca({ chassi: ' 9br.bd3he1-k0/445518 ' })!;
    expect(r.chassi).toBe('9BRBD3HE1K0445518');
  });

  it('CAIXA ALTA no que e cadastro — a mesma regra do ViaCEP', () => {
    const r = registroDaPlaca({ cor: 'Cinza Escuro', marca: 'Fiat', municipio: 'São Paulo' })!;
    expect(r.cor).toBe('CINZA ESCURO');
    expect(r.marca).toBe('FIAT');
    expect(r.municipio).toBe('SÃO PAULO');
  });

  it('aceita chave alternativa sem inventar: chassis/vin e numero_motor', () => {
    // Os nomes acima sao os do payload real; estes existem para o provedor nao
    // nos derrubar se renomear o campo — a mesma disciplina da 0074.
    expect(registroDaPlaca({ chassis: 'ABC123' })!.chassi).toBe('ABC123');
    expect(registroDaPlaca({ vin: 'ABC123' })!.chassi).toBe('ABC123');
    expect(registroDaPlaca({ numero_motor: 'x1' })!.numeroMotor).toBe('X1');
  });

  it('a PRIMEIRA chave da lista vence quando as duas vem preenchidas', () => {
    expect(registroDaPlaca({ chassi: 'PRIMEIRO', vin: 'SEGUNDO' })!.chassi).toBe('PRIMEIRO');
  });

  it('bloco ausente ou vazio devolve null — a tela NAO pode apagar o digitado', () => {
    // A consulta pode achar a avaliacao FIPE e nao ter registro. Devolver um
    // objeto de nulos faria o formulario sobrescrever com vazio o chassi que o
    // atendente ja tinha digitado.
    expect(registroDaPlaca(undefined)).toBeNull();
    expect(registroDaPlaca(null)).toBeNull();
    expect(registroDaPlaca([])).toBeNull();
    expect(registroDaPlaca({})).toBeNull();
    expect(registroDaPlaca({ chassi: '', cor: '   ' })).toBeNull();
  });

  it('campo vazio no meio de um bloco bom vira null, e o resto passa', () => {
    const r = registroDaPlaca({ chassi: '9BR1', motor: '', cor: null })!;
    expect(r.chassi).toBe('9BR1');
    expect(r.numeroMotor).toBeNull();
    expect(r.cor).toBeNull();
  });

  it('ano absurdo do provedor nao entra na ficha', () => {
    // Ano fora da faixa e lixo, e gravado em `ano_fabricacao` ninguem percebe.
    expect(registroDaPlaca({ ano: '0', chassi: 'X1' })!.anoFabricacao).toBeNull();
    expect(registroDaPlaca({ ano: '20199', chassi: 'X1' })!.anoFabricacao).toBeNull();
    expect(registroDaPlaca({ ano: '2019', chassi: 'X1' })!.anoFabricacao).toBe(2019);
  });

  it('o valor da FIPE continua vindo com ponto decimal, nao em formato BR', () => {
    // Regressao: "102077.00" nao pode virar 102.077 nem 10207700.
    expect(parseValor('102077.00')).toBe(102077);
    expect(parseValor('R$ 102.077,00')).toBe(102077);
  });
});
