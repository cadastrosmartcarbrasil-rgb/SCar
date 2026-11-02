import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { lerTodas } from '@/lib/paginacao';
import type { Json } from '@/lib/database.types';
import {
  BASE_NEWTRACKER, LIMITE_MAXIMO, cabecalhoNewTracker, casarComBase, contasNewTracker, emBlocos, itemParaCadastro,
  itemParaComunicacao, lerPaginaNewTracker, mensagemErroNewTracker, montarItensNewTracker, temMaisPaginas,
  urlNewTracker, type LinhaPrevia, type Linha, type RecursoNewTracker, type VeiculoSCar,
} from '@/lib/newtracker';

// Leitura completa da plataforma da New Tracker + gravacao no parque pelas
// MESMAS funcoes da nossa API externa (0151/0165), em nome da chave da
// New Tracker cadastrada em Configuracoes -> API e Integracoes. Nada de caminho
// paralelo: o resultado e o mesmo que seria se eles chamassem a nossa API.

const PAGINAS_MAX = 100; // 100 x 500 = 50 mil linhas por recurso
const BLOCO_GRAVACAO = 200;

export function baseNewTracker(): string {
  return (process.env.NEWTRACKER_API_BASE?.trim() || BASE_NEWTRACKER).replace(/\/+$/, '');
}

/** Todas as contas configuradas (uma chave por conta/regional da New Tracker). */
export function contasConfiguradas() {
  return contasNewTracker(process.env.NEWTRACKER_API_KEY, process.env.NEWTRACKER_API_KEYS);
}

/** Le TODAS as paginas de um recurso. */
export async function lerRecursoNewTracker(
  cfg: { chave: string; base: string },
  recurso: Exclude<RecursoNewTracker, 'status'>,
): Promise<Linha[]> {
  const todas: Linha[] = [];
  for (let pagina = 1; pagina <= PAGINAS_MAX; pagina++) {
    const res = await fetch(urlNewTracker(cfg.base, recurso, { pagina, limite: LIMITE_MAXIMO }), {
      headers: cabecalhoNewTracker(cfg.chave),
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    const corpo: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${recurso}: ${mensagemErroNewTracker(res.status, corpo)}`);
    const p = lerPaginaNewTracker(corpo);
    todas.push(...p.dados);
    if (p.dados.length === 0 || !temMaisPaginas(p, LIMITE_MAXIMO)) return todas;
  }
  throw new Error(`${recurso}: passou de ${PAGINAS_MAX} paginas — leitura interrompida`);
}

/** A chave da New Tracker cadastrada no SCar (Configuracoes -> API e Integracoes). */
export async function integracaoNewTracker(): Promise<{ id: string; nome: string; fornecedor_id: string }> {
  const admin = createAdminClient();
  const forcada = process.env.NEWTRACKER_INTEGRACAO_ID?.trim();
  const { data, error } = await admin
    .from('api_integracoes')
    .select('id, nome, fornecedor_id, ativo, revogada_em, expira_em, escopos, fornecedores(nome_fantasia, razao_social)')
    .eq('ativo', true)
    .is('revogada_em', null);
  if (error) throw error;
  const agora = Date.now();
  const candidatas = (data ?? []).filter((i) => {
    const r = i as unknown as {
      id: string; fornecedor_id: string | null; expira_em: string | null; escopos: string[];
      fornecedores: { nome_fantasia: string | null; razao_social: string | null } | null;
    };
    if (forcada) return r.id === forcada;
    const nome = `${r.fornecedores?.nome_fantasia ?? ''} ${r.fornecedores?.razao_social ?? ''}`.toUpperCase();
    return !!r.fornecedor_id
      && (!r.expira_em || Date.parse(r.expira_em) > agora)
      && r.escopos.includes('rastreadores:escrever')
      && /NEW\s*TRACKER/.test(nome);
  });
  if (candidatas.length === 0) {
    throw new Error('Nenhuma chave ativa da New Tracker (com rastreadores:escrever) em Configurações → API e Integrações.');
  }
  if (candidatas.length > 1) {
    throw new Error('Há mais de uma chave ativa da New Tracker. Revogue a que sobra ou defina NEWTRACKER_INTEGRACAO_ID.');
  }
  const c = candidatas[0] as unknown as { id: string; nome: string; fornecedor_id: string };
  return { id: c.id, nome: c.nome, fornecedor_id: c.fornecedor_id };
}

async function nossosVeiculos(): Promise<VeiculoSCar[]> {
  const admin = createAdminClient();
  return lerTodas<VeiculoSCar>((de, ate) =>
    admin.from('veiculos').select('id, placa, chassi, status').order('id').range(de, ate) as unknown as
      PromiseLike<{ data: VeiculoSCar[] | null; error: unknown }>,
  );
}

type Lidos = { equipamentos: number; chips: number; veiculos: number; posicoes: number };

export interface PreviaNewTracker {
  lidos: Lidos;
  /** o que veio de cada conta */
  por_conta: ({ conta: string } & Lidos)[];
  linhas: LinhaPrevia[];
  /** IMEIs ja no parque: de quem sao e como estao */
  no_parque: Map<string, { fornecedor_id: string | null; status: string; veiculo_id: string | null }>;
}

export async function montarPreviaNewTracker(): Promise<PreviaNewTracker> {
  const contas = contasConfiguradas();
  if (contas.length === 0) throw new Error('NEWTRACKER_API_KEY não configurada no servidor');
  const base = baseNewTracker();
  const lerConta = async (c: { nome: string; chave: string }) => {
    const cfg = { chave: c.chave, base };
    const [equipamentos, chips, veiculos, posicoes] = await Promise.all([
      lerRecursoNewTracker(cfg, 'equipamentos'),
      lerRecursoNewTracker(cfg, 'chips'),
      lerRecursoNewTracker(cfg, 'veiculos'),
      lerRecursoNewTracker(cfg, 'posicoes'),
    ]).catch((e) => { throw new Error(`Conta ${c.nome}: ${e instanceof Error ? e.message : String(e)}`); });
    return { conta: c.nome, equipamentos, chips, veiculos, posicoes };
  };
  const [lidasContas, nossos] = await Promise.all([Promise.all(contas.map(lerConta)), nossosVeiculos()]);
  const equipamentos = lidasContas.flatMap((c) => c.equipamentos);
  const chips = lidasContas.flatMap((c) => c.chips);
  const veiculos = lidasContas.flatMap((c) => c.veiculos);
  const posicoes = lidasContas.flatMap((c) => c.posicoes);
  const linhas = casarComBase(montarItensNewTracker({ equipamentos, chips, veiculos, posicoes }), nossos);

  const admin = createAdminClient();
  const parque = await lerTodas<{ imei: string; empresa_rastreamento_id: string | null; status: string; veiculo_id: string | null }>(
    (de, ate) => admin.from('rastreadores').select('imei, empresa_rastreamento_id, status, veiculo_id')
      .order('id').range(de, ate) as unknown as PromiseLike<{ data: never[] | null; error: unknown }>,
  );
  const no_parque = new Map(parque.map((r) => [r.imei, {
    fornecedor_id: r.empresa_rastreamento_id, status: String(r.status), veiculo_id: r.veiculo_id,
  }]));

  return {
    lidos: { equipamentos: equipamentos.length, chips: chips.length, veiculos: veiculos.length, posicoes: posicoes.length },
    por_conta: lidasContas.map((c) => ({
      conta: c.conta, equipamentos: c.equipamentos.length, chips: c.chips.length,
      veiculos: c.veiculos.length, posicoes: c.posicoes.length,
    })),
    linhas,
    no_parque,
  };
}

export interface ResultadoImportacao {
  cadastro: Record<string, number>;
  comunicacao: Record<string, number>;
  /** 0174: o status do parque depois da sincronia com o veiculo e a cobranca */
  status: { inativados: number; inadimplentes: number; reativados: number } | null;
  problemas: { imei: string; resultado: string; motivo: string | null }[];
}

/**
 * Grava os INSTALAR no parque e, depois, a ultima posicao de cada um. O equipamento
 * que o SCar ja pos em 3/4 no MESMO veiculo nao e reinstalado (o status e do SCar:
 * a cobranca e o cadastro decidem); so a posicao e atualizada. No fim, a sincronia
 * do parque (0174) acerta o status de todos.
 */
export async function importarNewTracker(
  linhas: LinhaPrevia[],
  noParque?: PreviaNewTracker['no_parque'],
): Promise<ResultadoImportacao> {
  const integ = await integracaoNewTracker();
  const admin = createAdminClient();
  const cadastro: Record<string, number> = {};
  const comunicacao: Record<string, number> = {};
  const problemas: ResultadoImportacao['problemas'] = [];

  const instalar = linhas.filter((l) => l.situacao === 'INSTALAR');
  const statusDoScar = (l: LinhaPrevia) => {
    const p = noParque?.get(l.item.imei);
    return !!p && p.veiculo_id === l.veiculo?.id && ['INADIMPLENTE', 'INATIVO'].includes(p.status);
  };
  const mantidos = instalar.filter(statusDoScar).length;
  if (mantidos > 0) cadastro.STATUS_DO_SCAR_MANTIDO = mantidos;
  for (const bloco of emBlocos(instalar.filter((l) => !statusDoScar(l)).map(itemParaCadastro), BLOCO_GRAVACAO)) {
    const { data, error } = await admin.rpc('api_cadastrar_rastreadores', {
      p_integracao_id: integ.id, p_itens: bloco as unknown as Json,
    });
    if (error) throw new Error(`Gravação do parque: ${error.message}`);
    for (const r of data ?? []) {
      cadastro[r.resultado] = (cadastro[r.resultado] ?? 0) + 1;
      if (['RECUSADO', 'OUTRA_PLATAFORMA', 'INVALIDO', 'ERRO', 'VEICULO_NAO_ENCONTRADO'].includes(r.resultado)) {
        problemas.push({ imei: r.imei ?? '', resultado: r.resultado, motivo: r.motivo });
      }
    }
  }

  const posicoes = instalar
    .map((l) => itemParaComunicacao(l.item))
    .filter((p): p is Record<string, unknown> => p !== null);
  for (const bloco of emBlocos(posicoes, BLOCO_GRAVACAO)) {
    const { data, error } = await admin.rpc('api_registrar_comunicacoes', {
      p_integracao_id: integ.id, p_itens: bloco as unknown as Json,
    });
    if (error) throw new Error(`Gravação das posições: ${error.message}`);
    for (const r of data ?? []) comunicacao[r.resultado] = (comunicacao[r.resultado] ?? 0) + 1;
  }

  const { data: st, error: eSt } = await admin.rpc('sincronizar_status_rastreadores', {});
  if (eSt) console.error('[newtracker] sincronia do status', eSt.message);
  const status = eSt ? null : ((st ?? [])[0] ?? null);

  return { cadastro, comunicacao, status, problemas };
}
