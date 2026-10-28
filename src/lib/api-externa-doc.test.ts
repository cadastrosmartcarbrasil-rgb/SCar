import { describe, expect, it } from 'vitest';
import {
  colecaoPostman, documentacaoMarkdown, ENDPOINTS_API, ERROS_API, exemploCurl,
  origemDaRequisicao, paginaDocumentacao,
} from './api-externa-doc';
import { especificacaoApiExterna } from './api-externa-openapi';

const ORIGEM = 'https://appsmartcar.com.br';

describe('catalogo da documentacao da API externa', () => {
  it('lista as mesmas rotas e metodos do OpenAPI', () => {
    const spec = especificacaoApiExterna(ORIGEM);
    const doOpenapi = Object.entries(spec.paths).flatMap(([c, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${c}`)).sort();
    const doCatalogo = ENDPOINTS_API.map((e) => `${e.metodo} ${e.caminho}`).sort();
    expect(doCatalogo).toEqual(doOpenapi);
  });

  it('todo codigo de erro citado existe na tabela de erros', () => {
    const codigos = new Set(ERROS_API.map((e) => e.codigo));
    for (const e of ENDPOINTS_API) for (const c of e.erros) expect(codigos.has(c), `${e.id}: ${c}`).toBe(true);
  });

  it('ids unicos (sao as ancoras da pagina)', () => {
    const ids = ENDPOINTS_API.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('OpenAPI leva operationId, tags e o exemplo de resposta de cada rota', () => {
    const spec = especificacaoApiExterna(ORIGEM) as unknown as { paths: Record<string, Record<string, Record<string, unknown>>> };
    for (const e of ENDPOINTS_API) {
      const op = spec.paths[e.caminho][e.metodo.toLowerCase()];
      expect(op.operationId).toBeTruthy();
      expect((op.tags as string[]).length).toBe(1);
      const ok = (op.responses as Record<string, { content: Record<string, { example?: unknown }> }>)[200];
      expect(ok.content['application/json'].example).toEqual(e.resposta);
    }
  });
});

describe('saidas da documentacao', () => {
  it('a pagina HTML traz todas as rotas, o endereco base e os downloads', () => {
    const html = paginaDocumentacao(ORIGEM);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    for (const e of ENDPOINTS_API) {
      expect(html).toContain(`id="${e.id}"`);
      expect(html).toContain(e.caminho);
    }
    expect(html).toContain(`${ORIGEM}/api/externa/v1`);
    expect(html).toContain('/postman.json');
    expect(html).toContain('/openapi.json');
    for (const x of ERROS_API) expect(html).toContain(x.codigo);
  });

  it('escapa o que vai para o HTML (origem nao injeta marcacao)', () => {
    const html = paginaDocumentacao('https://x"><script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)');
  });

  it('o Markdown traz todas as rotas e os erros', () => {
    const md = documentacaoMarkdown(ORIGEM);
    for (const e of ENDPOINTS_API) expect(md).toContain(`${e.metodo} ${e.caminho}`);
    for (const x of ERROS_API) expect(md).toContain(`\`${x.codigo}\``);
  });

  it('a colecao do Postman tem uma chamada por rota, com a chave por variavel', () => {
    const c = colecaoPostman(ORIGEM);
    expect(c.item).toHaveLength(ENDPOINTS_API.length);
    expect(c.auth.bearer[0].value).toBe('{{chave}}');
    expect(c.variable.find((v) => v.key === 'base_url')?.value).toBe(`${ORIGEM}/api/externa/v1`);
    const post = c.item.find((i) => i.request.method === 'POST');
    expect(post?.request.body?.raw).toContain('comunicacoes');
  });

  it('o curl do POST leva o corpo e o content-type', () => {
    const curl = exemploCurl(ORIGEM, 'rastreadores-comunicacao');
    expect(curl).toContain('-X POST');
    expect(curl).toContain('Content-Type: application/json');
    expect(curl).toContain('"comunicacoes"');
    expect(exemploCurl(ORIGEM, 'veiculos-um')).toContain('/veiculos/ABC1D23');
  });

  it('origem pelo cabecalho do proxy, com https por padrao', () => {
    expect(origemDaRequisicao(new Headers({ 'x-forwarded-host': 'appsmartcar.com.br', 'x-forwarded-proto': 'https' }))).toBe('https://appsmartcar.com.br');
    expect(origemDaRequisicao(new Headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
    expect(origemDaRequisicao(new Headers())).toBe('https://appsmartcar.com.br');
  });
});
