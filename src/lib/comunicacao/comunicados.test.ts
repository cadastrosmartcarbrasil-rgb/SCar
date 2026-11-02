import { describe, expect, it } from 'vitest';
import { COMUNICADO_VAZIO, SITUACOES_PADRAO, filtrosParaGravar, foraDoEnvio, validarComunicado } from './comunicados';
import { lerTokenDescadastro, tokenDescadastro } from './servidor';
import { decidirEnvio } from './cobranca';
import { renderizarComunicado } from './render-email';

const rod = { razaoSocial: 'SMART CAR', cnpj: null, whatsapp: null, email: null, site: null };

const base = {
  ...COMUNICADO_VAZIO,
  nome_interno: 'Novidade de novembro',
  assunto: 'Novidade para você, {nome}',
  titulo: 'Olá, {nome}',
  corpo: 'Temos uma **novidade**.\n\nAté breve.',
};

describe('comunicados por e-mail (0171)', () => {
  it('valida nome, campos, botão, limites e palavras de spam', () => {
    expect(validarComunicado(base, true)).toEqual([]);
    expect(validarComunicado({ ...base, nome_interno: 'x' }).join()).toMatch(/nome/);
    expect(validarComunicado({ ...base, assunto: '' }, true).join()).toMatch(/assunto/);
    expect(validarComunicado({ ...base, assunto: '' }, false)).toEqual([]);
    expect(validarComunicado({ ...base, corpo: 'Seu {valor}' }).join()).toMatch(/\{valor\}/);
    expect(validarComunicado({ ...base, botao_texto: 'Ver' }).join()).toMatch(/link/);
    expect(validarComunicado({ ...base, botao_texto: 'Ver', botao_url: 'http://x.com' }).join()).toMatch(/https/);
    expect(validarComunicado({ ...base, botao_texto: 'Ver', botao_url: 'https://x.com/a' })).toEqual([]);
    expect(validarComunicado({ ...base, assunto: 'Último aviso' }).join()).toMatch(/spam/);
    expect(validarComunicado({ ...base, corpo: 'x'.repeat(5001) }).join()).toMatch(/5000/);
  });

  it('grava só os filtros preenchidos; um associado ignora o resto', () => {
    expect(filtrosParaGravar({ cliente_id: 'c1', regional_ids: ['r'] })).toEqual({ cliente_id: 'c1' });
    expect(filtrosParaGravar({ regional_ids: [], plano_ids: ['p'] })).toEqual({ situacoes: SITUACOES_PADRAO, plano_ids: ['p'] });
    expect(filtrosParaGravar({ situacoes: ['ativo'], regional_ids: ['r'] })).toEqual({ regional_ids: ['r'], situacoes: ['ativo'] });
  });

  it('explica quem fica de fora', () => {
    const p = { associados: 10, recebem: 6, sem_email: 2, email_repetido: 1, suprimidos: 0, descadastrados: 1, amostra: [] };
    const l = foraDoEnvio(p);
    expect(l).toHaveLength(3);
    expect(l.join()).toMatch(/2 sem e-mail/);
    expect(foraDoEnvio({ ...p, sem_email: 0, email_repetido: 0, descadastrados: 0 })).toEqual([]);
  });

  it('o token de descadastro vai e volta, sem caixa, e recusa assinatura errada', () => {
    const t = tokenDescadastro('Maria@Exemplo.com ', 'segredo-de-teste-123');
    expect(lerTokenDescadastro(t, 'segredo-de-teste-123')).toBe('maria@exemplo.com');
    expect(lerTokenDescadastro(t, 'outro-segredo')).toBeNull();
    expect(lerTokenDescadastro('lixo', 'segredo-de-teste-123')).toBeNull();
  });

  it('comunicado na fila só depende do e-mail e do modo teste', () => {
    const item = { destinatario: 'a@b.com', titulo_status: null, linha_digitavel: null, comunicado_id: 'x' };
    expect(decidirEnvio(item, { modo: 'live', allowlist: [] })).toEqual({ acao: 'enviar' });
    expect(decidirEnvio(item, { modo: 'sandbox', allowlist: [] }).acao).toBe('cancelar');
    expect(decidirEnvio(item, { modo: 'sandbox', allowlist: ['A@B.com'] })).toEqual({ acao: 'enviar' });
    expect(decidirEnvio({ ...item, comunicado_id: null }, { modo: 'live', allowlist: [] }).acao).toBe('cancelar');
  });

  it('renderiza com o nome, o negrito e o link de descadastro só no informativo', async () => {
    const c = { finalidade: 'INFORMATIVO' as const, assunto: base.assunto, titulo: base.titulo, previa: null,
      corpo: base.corpo, botao_texto: null, botao_url: null };
    const r = await renderizarComunicado(c, 'MARIA DA SILVA', rod, 'https://app.exemplo', 'https://app.exemplo/descadastro/tok');
    expect(r.assunto).toContain('Maria');
    expect(r.html).toContain('<strong');
    expect(r.html).toContain('/descadastro/tok');
    const s = await renderizarComunicado({ ...c, finalidade: 'SERVICO' }, 'MARIA DA SILVA', rod, 'https://app.exemplo');
    expect(s.html).not.toContain('/descadastro/');
  });
});
