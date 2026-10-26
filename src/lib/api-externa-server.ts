import 'server-only';

// API EXTERNA (0151) — autenticacao da chave e trilha de cada requisicao.
//
// Toda rota de /api/externa/v1 passa por `rotaApi(escopo, handler)`:
//   1. le a chave (Bearer ou x-api-key) e o prefixo;
//   2. freio por IP para chave errada e por chave para volume;
//   3. compara o SHA-256 em tempo constante, confere ativa/vencida/IP/escopo;
//   4. roda o handler com o service_role (as RPCs conferem DE NOVO no banco);
//   5. grava a trilha (api_requisicoes) e o ultimo uso.
// Erro devolvido ao sistema externo e sempre JSON { erro, codigo }.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumirTentativa, ipDaRequisicao } from '@/lib/rate-limit';
import { chaveDaRequisicao, ipPermitido, montarChave, prefixoDaChave, situacaoChave, type EscopoApi } from '@/lib/api-externa';
import type { ApiIntegracoesRow } from '@/lib/database.types';

export type ClienteAdmin = ReturnType<typeof createAdminClient>;

export function hashChave(chave: string): string {
  return createHash('sha256').update(chave).digest('hex');
}

/** Gera uma chave nova (servidor). A chave em claro sai daqui UMA vez. */
export function gerarChaveApi(): { chave: string; prefixo: string; hash: string } {
  const { chave, prefixo } = montarChave(randomBytes(10), randomBytes(32));
  return { chave, prefixo, hash: hashChave(chave) };
}

export function erroApi(status: number, codigo: string, erro: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ erro, codigo, ...extra }, { status });
}

/** Mensagem do banco sem detalhe tecnico (as nossas regras passam). */
export function mensagemDoBanco(e: { message?: string } | null | undefined): string {
  const m = e?.message ?? '';
  if (/integracao inativa|escopo|no maximo|envie uma lista/i.test(m)) return m;
  return 'Falha ao consultar o SCar';
}

export interface ContextoApi {
  integracao: Pick<ApiIntegracoesRow, 'id' | 'nome' | 'escopos' | 'fornecedor_id' | 'regional_ids'>;
  supabase: ClienteAdmin;
  ip: string;
  /** o handler informa quantos registros devolveu/gravou (vai para a trilha) */
  registros: (n: number) => void;
}

const LIMITE_POR_MINUTO = 120;

export function rotaApi(
  escopo: EscopoApi | null,
  handler: (request: Request, ctx: ContextoApi) => Promise<NextResponse>,
) {
  return async (request: Request): Promise<NextResponse> => {
    const inicio = Date.now();
    const ip = ipDaRequisicao(request);
    const rota = new URL(request.url).pathname;
    const chave = chaveDaRequisicao(request.headers.get('authorization'), request.headers.get('x-api-key'));
    const prefixo = prefixoDaChave(chave);

    // chave errada: freio por IP (20 tentativas a cada 10 min)
    const negar = (status: number, codigo: string, erro: string) => {
      const lim = consumirTentativa(`api-externa-ip:${ip}`, 20, 600);
      if (!lim.permitido) {
        return erroApi(429, 'MUITAS_TENTATIVAS', `Muitas tentativas com chave inválida. Tente em ${lim.esperar}s.`);
      }
      return erroApi(status, codigo, erro);
    };

    if (!chave) return negar(401, 'SEM_CHAVE', 'Informe a chave: Authorization: Bearer <chave> ou x-api-key.');
    if (!prefixo) return negar(401, 'CHAVE_INVALIDA', 'Chave inválida.');

    const supabase = createAdminClient();
    const { data: integ } = await supabase.from('api_integracoes').select('*').eq('chave_prefixo', prefixo).maybeSingle();
    const hash = Buffer.from(hashChave(chave), 'hex');
    const esperado = Buffer.from(integ?.chave_hash ?? '0'.repeat(64), 'hex');
    if (!integ || !timingSafeEqual(hash, esperado)) return negar(401, 'CHAVE_INVALIDA', 'Chave inválida.');

    let status = 200;
    let erro: string | null = null;
    let registros: number | null = null;
    let resposta: NextResponse;

    const situacao = situacaoChave(integ);
    if (situacao !== 'ATIVA') {
      resposta = erroApi(403, `CHAVE_${situacao}`, `Chave ${situacao.toLowerCase()}. Fale com a Smart Car.`);
    } else if (!ipPermitido(ip, integ.ips_permitidos)) {
      resposta = erroApi(403, 'IP_NAO_PERMITIDO', `IP ${ip} não autorizado para esta chave.`);
    } else if (escopo && !integ.escopos.includes(escopo)) {
      resposta = erroApi(403, 'SEM_ESCOPO', `A chave não tem o escopo ${escopo}.`);
    } else {
      const lim = consumirTentativa(`api-externa-chave:${integ.id}`, LIMITE_POR_MINUTO, 60);
      if (!lim.permitido) {
        resposta = erroApi(429, 'LIMITE', `Limite de ${LIMITE_POR_MINUTO} requisições por minuto. Tente em ${lim.esperar}s.`);
      } else {
        try {
          resposta = await handler(request, {
            integracao: integ, supabase, ip, registros: (n) => { registros = n; },
          });
        } catch (e) {
          console.error('[api-externa]', rota, e);
          resposta = erroApi(500, 'ERRO_INTERNO', 'Erro interno no SCar.');
        }
      }
    }

    status = resposta.status;
    if (status >= 400) {
      try { erro = ((await resposta.clone().json()) as { codigo?: string }).codigo ?? null; } catch { erro = null; }
    }

    // trilha + ultimo uso (falhar aqui nao derruba a resposta)
    await Promise.all([
      supabase.from('api_requisicoes').insert({
        integracao_id: integ.id, metodo: request.method, rota, status, ip,
        duracao_ms: Date.now() - inicio, registros, erro,
      }),
      supabase.from('api_integracoes').update({ ultimo_uso_em: new Date().toISOString(), ultimo_ip: ip }).eq('id', integ.id),
    ]).catch((e) => console.error('[api-externa] trilha', e));

    resposta.headers.set('x-scar-integracao', integ.nome);
    return resposta;
  };
}
