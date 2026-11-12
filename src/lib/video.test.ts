import { describe, expect, it } from 'vitest';
import {
  dimensoesVideo, ehVideo, nomeVideoReduzido, tipoDeMidia, validarVideo,
  VIDEO_ANEXO_SEGUNDOS, VIDEO_BRUTO_MAX_BYTES,
} from './video';

describe('ehVideo / tipoDeMidia', () => {
  it('reconhece video pelo tipo e pela extensao', () => {
    expect(ehVideo({ name: 'a.bin', type: 'video/quicktime' })).toBe(true);
    expect(ehVideo({ name: 'IMG_1234.MOV' })).toBe(true);
    expect(ehVideo({ name: 'foto.jpg', type: 'image/jpeg' })).toBe(false);
  });
  it('tipoDeMidia pelo caminho do bucket', () => {
    expect(tipoDeMidia('ev/123.mp4')).toBe('VIDEO');
    expect(tipoDeMidia('ev/123.JPEG')).toBe('IMAGEM');
    expect(tipoDeMidia('ev/nota.pdf')).toBeNull();
    expect(tipoDeMidia(null)).toBeNull();
  });
});

describe('validarVideo', () => {
  it('recusa arquivo enorme e video longo', () => {
    expect(validarVideo({ size: VIDEO_BRUTO_MAX_BYTES + 1 })).toMatch(/máximo/);
    expect(validarVideo({ size: 1000 }, VIDEO_ANEXO_SEGUNDOS + 30)).toMatch(/limite é 90/);
  });
  it('aceita video curto e duracao desconhecida', () => {
    expect(validarVideo({ size: 80 * 1024 * 1024 }, 45)).toBeNull();
    expect(validarVideo({ size: 1000 }, null)).toBeNull();
    expect(validarVideo({ size: 1000 }, VIDEO_ANEXO_SEGUNDOS + 0.5)).toBeNull();
  });
});

describe('dimensoesVideo', () => {
  it('reduz o maior lado para 1280 com numeros pares', () => {
    expect(dimensoesVideo(1920, 1080)).toEqual({ largura: 1280, altura: 720 });
    expect(dimensoesVideo(1080, 1920)).toEqual({ largura: 720, altura: 1280 });
  });
  it('nao aumenta video pequeno e nao quebra sem dimensao', () => {
    expect(dimensoesVideo(640, 480)).toEqual({ largura: 640, altura: 480 });
    expect(dimensoesVideo(0, 0)).toEqual({ largura: 0, altura: 0 });
  });
});

describe('nomeVideoReduzido', () => {
  it('troca a extensao pela do formato gravado', () => {
    expect(nomeVideoReduzido('IMG_1234.MOV', 'video/mp4;codecs=avc1')).toBe('IMG_1234.mp4');
    expect(nomeVideoReduzido('colisao.mp4', 'video/webm')).toBe('colisao.webm');
  });
});
