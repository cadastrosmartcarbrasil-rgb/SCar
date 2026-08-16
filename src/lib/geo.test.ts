import { describe, it, expect } from 'vitest';
import {
  enderecoLinha,
  coordenadaDe,
  pontoNavegacao,
  linkGoogleRota,
  linkGoogleLocal,
  linkWaze,
  linksNavegacao,
  metrosParaKm,
  segundosParaMinutos,
  rotuloRota,
} from './geo';

const ORIGEM = {
  logradouro: 'Avenida Mato Grosso', numero: '240', bairro: 'Centro-Norte',
  cidade: 'Cuiaba', uf: 'MT', cep: '78005-030', lat: -15.5989, lng: -56.0949,
};
const DESTINO = {
  logradouro: 'Rua Mirassol', numero: '54', bairro: 'Alvorada',
  cidade: 'Cuiaba', uf: 'MT', lat: -15.5801, lng: -56.0712,
};

describe('endereco e coordenada', () => {
  it('monta o endereco em uma linha, na mesma ordem do SQL', () => {
    expect(enderecoLinha(ORIGEM)).toBe('Avenida Mato Grosso, 240, Centro-Norte, Cuiaba, MT, 78005-030');
    expect(enderecoLinha({ cidade: 'Cuiaba' })).toBe('Cuiaba');
    expect(enderecoLinha(null)).toBe('');
  });

  it('le a coordenada em numero ou texto e ignora vazio/0,0', () => {
    expect(coordenadaDe(ORIGEM)).toEqual({ lat: -15.5989, lng: -56.0949 });
    expect(coordenadaDe({ lat: '-15.5', lng: '-56.1' })).toEqual({ lat: -15.5, lng: -56.1 });
    expect(coordenadaDe({ lat: 0, lng: 0 })).toBeNull();
    expect(coordenadaDe({ cidade: 'Cuiaba' })).toBeNull();
  });

  it('coordenada tem precedencia sobre o texto na navegacao', () => {
    expect(pontoNavegacao(ORIGEM)).toBe('-15.5989,-56.0949');
    expect(pontoNavegacao({ logradouro: 'Rua Sem GPS', cidade: 'Cuiaba' })).toBe('Rua Sem GPS, Cuiaba');
    expect(pontoNavegacao({})).toBeNull();
  });
});

describe('links de navegacao da OS', () => {
  it('rota completa no Google Maps', () => {
    expect(linkGoogleRota(ORIGEM, DESTINO)).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=-15.5989%2C-56.0949'
      + '&destination=-15.5801%2C-56.0712&travelmode=driving',
    );
  });

  it('sem destino nao ha rota, mas o local do resgate continua navegavel', () => {
    expect(linkGoogleRota(ORIGEM, {})).toBeNull();
    expect(linkGoogleLocal(ORIGEM)).toContain('maps/search/?api=1&query=-15.5989');
  });

  it('Waze usa ll para coordenada e q para endereco', () => {
    expect(linkWaze(ORIGEM)).toBe('https://waze.com/ul?ll=-15.5989,-56.0949&navigate=yes');
    expect(linkWaze({ logradouro: 'Rua Sem GPS', cidade: 'Cuiaba' }))
      .toBe('https://waze.com/ul?q=Rua%20Sem%20GPS%2C%20Cuiaba&navigate=yes');
    expect(linkWaze({})).toBeNull();
  });

  it('conjunto de links do voucher', () => {
    const l = linksNavegacao(ORIGEM, DESTINO);
    expect(l.googleRota).toBeTruthy();
    expect(l.googleOrigem).toBeTruthy();
    expect(l.wazeOrigem).toBeTruthy();
    expect(l.wazeDestino).toBeTruthy();
  });
});

describe('conversoes e rotulo da rota', () => {
  it('metros -> km e segundos -> minutos', () => {
    expect(metrosParaKm(12432)).toBe(12.4);
    expect(metrosParaKm(0)).toBe(0);
    expect(segundosParaMinutos(1380)).toBe(23);
    expect(segundosParaMinutos(20)).toBe(1); // nunca zero
  });

  it('rotulo com distancia e tempo', () => {
    expect(rotuloRota(12.4, 23)).toBe('12,4 km · 23 min');
    expect(rotuloRota(120, 95)).toBe('120,0 km · 1h35');
    expect(rotuloRota(8.2)).toBe('8,2 km');
    expect(rotuloRota(null)).toBe('—');
  });
});
