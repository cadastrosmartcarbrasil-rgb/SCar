'use client';

import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { somarDiagnosticoPlanos, somarBlocosCarga, LOTE_CARGA } from '@/lib/mutual';
import { criarFila } from '@/lib/fila';
import type { EntidadeMutual, SondagemCaminho, DiagnosticoPlanos } from '@/lib/mutual';
import type {
  MutualDiagnostico, MutualPorStatus, MutualFilial,
  MutualQuarentena, MutualResumoCaptura, MutualStatusNaoMapeado, MutualPeriodicidade,
  MutualStatusCruzado,
  MutualCampo, MutualPassoFunil, MutualConsultorPendente,
  CobrancaExternaResumo, MutualEquipeVendas,
  MutualTipoVeiculoExterno,
  MutualPlanoExterno, MutualCategoriaVeiculo, MutualCargaLinha, MutualCargaResultado,
  MutualDesfazerResultado, MutualVendedorResumo, MutualVincularVendedores, Database,
} from '@/lib/database.types';

// =====================================================================
// 🔴 POR QUE ESTES HOOKS TEM `ativo`
// =====================================================================
// Medido em producao em 02/10/2026: cada leitura deste modulo varre os ~17,7
// mil objetos capturados e custa 2,4 a 4,4 segundos SOZINHA. A tela disparava
// ~18 delas no mount, e sob essa contencao TODAS estouravam o
// `statement_timeout` de 8s do papel `authenticated` — os logs mostram 12 a 13
// cancelamentos por rajada e HTTP 500 em cada RPC. O resultado em tela nao era
// um erro: era o estado vazio de cada secao (ver `mensagemDeFalhaDeLeitura`).
//
// Entao diagnostico NAO carrega sozinho: carrega quando a secao e ABERTA. As
// leituras que sao TRABALHO (o que esta capturado, as equipes, as filiais, o
// cutover) seguem eager, porque sem elas a tela nao serve para nada.
//
// 🔴 E MESMO ASSIM ESTOURAVA (10/10/2026): com uma unidade escolhida, as
// leituras eager da carga (capturas, equipes, cutover, tipos, planos,
// categorias, previa, linhas, vendedores) ainda saiam JUNTAS, e os logs
// mostravam timeout em rajada. Por isso TODA leitura deste arquivo passa por
// `naFila`: uma por vez, na ordem em que a tela pede (de cima para baixo).
// A tela enche mais devagar e para de falhar. Leitura de unidade que ficou
// para tras (trocou o seletor) e descartada antes de chegar ao banco.
// As MUTACOES nao entram: a carga em blocos ja e sequencial por natureza.
const naFila = criarFila(1);

/** O que ja esta na area de captura. */
export function useMutualCapturas() {
  const supabase = createClient();
  return useQuery<MutualResumoCaptura[]>({
    queryKey: ['mutual', 'capturas'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_resumo_capturas', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

/** O relatorio de qualidade — o produto da Fase 1. */
export function useMutualDiagnostico(ativo = true) {
  const supabase = createClient();
  return useQuery<MutualDiagnostico[]>({
    queryKey: ['mutual', 'diagnostico'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_diagnostico', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

export function useMutualPorStatus(ativo = true) {
  const supabase = createClient();
  return useQuery<MutualPorStatus[]>({
    queryKey: ['mutual', 'status'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_por_status', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

/** As filiais do Mutual + o palpite de de-para. NAO cria regional nenhuma. */
export function useMutualFiliais(ativo = true) {
  const supabase = createClient();
  return useQuery<MutualFilial[]>({
    queryKey: ['mutual', 'filiais'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_filiais', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

export function useMutualQuarentena(
  limite = 200,
  somenteFaturaveis = true,
  // 0071: o 0 km (sem placa, com chassi) NAO e problema de dado — e fila
  // operacional. Fica fora por padrao; a tela tem botao para ver.
  incluirPlacaPendente = false,
  ativo = true,
) {
  const supabase = createClient();
  return useQuery<MutualQuarentena[]>({
    queryKey: ['mutual', 'quarentena', limite, somenteFaturaveis, incluirPlacaPendente],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_quarentena', {
        p_limite: limite,
        p_somente_faturaveis: somenteFaturaveis,
        p_incluir_placa_pendente: incluirPlacaPendente,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

/**
 * O vocabulario do Mutual que o nosso de-para ainda nao cobre. O enum do
 * swagger NAO e exaustivo — `AGUARDADO A RETIRADA DO RASTREADOR` so apareceu
 * na base real. Sem esta lista, status desconhecido some como "funil de venda".
 */
export function useMutualStatusNaoMapeados(ativo = true) {
  const supabase = createClient();
  return useQuery<MutualStatusNaoMapeado[]>({
    queryKey: ['mutual', 'status-nao-mapeados'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_status_nao_mapeados', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

/** 0071: contrato x objeto — o instrumento que mede a mudanca antes da carga. */
export function useMutualStatusCruzado(ativo = true) {
  const supabase = createClient();
  return useQuery<MutualStatusCruzado[]>({
    queryKey: ['mutual', 'status-cruzado'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_status_cruzado', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

export interface RespostaMutual {
  configured: boolean;
  ok?: boolean;
  http?: number;
  url?: string;
  registros?: number;
  paginas?: number;
  total_remoto?: number | null;
  proxima_pagina?: number | null;
  amostra?: unknown;
  erro?: string;
  error?: string;
  /** So na captura de PLAN: o que o /quotation/plan/ devolveu. */
  diagnostico?: DiagnosticoPlanos;
}

async function chamar(body: Record<string, unknown>): Promise<RespostaMutual> {
  const res = await fetch('/api/v1/mutual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as RespostaMutual;
}

/**
 * O PROVADOR DE CAMINHO — o fim do palpite de `/plan/`.
 *
 * A 0085 abriu a entidade `PLAN` com `/contract/plan/`, deduzido do padrao das
 * outras entidades de contrato, e a tela respondeu **HTTP 404**. Em vez de
 * chutar a proxima, isto bate em cada candidata e devolve o status: a tela
 * nomeia a que responde e `ENTIDADES_MUTUAL.PLAN` passa a ser ela — uma linha,
 * porque nada de schema depende do caminho (o de-para de plano funciona com a
 * entidade ainda nao capturada, padrao da 0083).
 */
export function useSondarCaminhos() {
  return useMutation({
    mutationFn: async (caminhos?: string[]) =>
      (await chamar({ action: 'sondar', caminhos })) as RespostaMutual & { sondagens?: SondagemCaminho[] },
  });
}

/** Testa a conexao sem gravar nada. */
export function usePingMutual() {
  return useMutation<RespostaMutual, Error, void>({
    mutationFn: () => chamar({ action: 'ping' }),
  });
}

/**
 * Periodicidade da cobranca — e a consulta que decide se `final_total_value` e
 * a PARCELA ou o TOTAL do contrato. `veiculos.valor_mensalidade` (0024) e
 * MENSAL: trocar um pelo outro cobra 6x a mais num contrato semestral.
 */
export function useMutualPeriodicidade(ativo = true) {
  const supabase = createClient();
  return useQuery<MutualPeriodicidade[]>({
    queryKey: ['mutual', 'periodicidade'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_periodicidade', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

/**
 * As chaves que EXISTEM no payload capturado, com quantas vem preenchidas.
 *
 * Existe porque supor onde um campo mora ja custou duas rodadas: o dia de
 * vencimento (estava no contrato, nao no objeto) e a unidade (nao esta em
 * `regional` em lugar nenhum — 3.527 de 3.527 faturaveis sem ela, com os
 * contratos todos capturados). Aqui a pergunta se responde olhando.
 */
export function useMutualCampos(entidade: EntidadeMutual, caminho?: string, ativo = true) {
  const supabase = createClient();
  return useQuery<MutualCampo[]>({
    queryKey: ['mutual', 'campos', entidade, caminho ?? null],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_campos', {
        p_entidade: entidade, p_caminho: caminho ?? null,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

/** O funil da unidade pelo consultor (0073). Leitura; nao escreve nada. */
export function useMutualCoberturaConsultor(somenteFaturaveis = true, ativo = true) {
  const supabase = createClient();
  return useQuery<MutualPassoFunil[]>({
    queryKey: ['mutual', 'cobertura-consultor', somenteFaturaveis],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_cobertura_consultor', {
        p_somente_faturaveis: somenteFaturaveis,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

/** Quem a corrente perde, por VOLUME de veiculos — a fila de trabalho. */
export function useMutualConsultoresPendentes(somenteFaturaveis = true, limite = 50) {
  const supabase = createClient();
  return useQuery<MutualConsultorPendente[]>({
    queryKey: ['mutual', 'consultores-pendentes', somenteFaturaveis, limite],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_consultores_sem_vendedor', {
        p_limite: limite, p_somente_faturaveis: somenteFaturaveis,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

export interface ProgressoCaptura {
  entidade: EntidadeMutual;
  registros: number;          // acumulado NESTA rodada
  paginas: number;
  total: number | null;       // quanto o Mutual diz ter
  proxima: number;            // pagina que sera pedida a seguir
}

export interface ResultadoCaptura {
  configured: boolean;
  ok: boolean;
  registros: number;
  paginas: number;
  total: number | null;
  /** Onde retomar. `null` = a entidade acabou. */
  proximaPagina: number | null;
  parado: boolean;            // o usuario mandou parar
  erro?: string;
  /** PLAN: o diagnostico ACUMULADO da rodada (ver `somarDiagnosticoPlanos`). */
  diagnostico?: DiagnosticoPlanos;
}

// Teto de seguranca: se a API devolver "ha mais" para sempre, o laco tem de
// terminar. 5.000 paginas de 500 = 2,5 milhoes de registros — muito acima de
// qualquer entidade do Mutual (a maior, faturas, tem ~206 mil).
const PAGINA_MAXIMA = 5000;

/**
 * Puxa uma entidade INTEIRA, em blocos, ate a API dizer que acabou.
 *
 * Por que em blocos e nao numa requisicao so: 17.610 objetos de contrato sao 36
 * paginas, e as faturas passam de 400 — uma requisicao unica desse tamanho
 * estoura o tempo do proxy antes de terminar, e ai nao se salva nem o que ja
 * tinha vindo. Cada bloco e uma requisicao curta que ja grava o que trouxe, e a
 * captura e re-executavel (upsert), entao parar no meio nunca perde trabalho.
 *
 * O cache so e invalidado NO FIM: o diagnostico e uma consulta cara, e refaze-lo
 * a cada bloco deixaria a tela mais lenta que a propria carga.
 */
export function useCapturaMutual() {
  const qc = useQueryClient();
  const [progresso, setProgresso] = useState<ProgressoCaptura | null>(null);
  const [rodando, setRodando] = useState(false);
  const pararRef = useRef(false);

  const parar = useCallback(() => { pararRef.current = true; }, []);

  const puxarTudo = useCallback(async (
    entidade: EntidadeMutual,
    opcoes: { paginasPorVez?: number; inicio?: number; updated_at__gte?: string } = {},
  ): Promise<ResultadoCaptura> => {
    const paginasPorVez = opcoes.paginasPorVez ?? 5;
    let pagina = Math.max(opcoes.inicio ?? 1, 1);
    let registros = 0;
    let paginas = 0;
    let total: number | null = null;
    let diagnostico: DiagnosticoPlanos | undefined;

    pararRef.current = false;
    setRodando(true);
    setProgresso({ entidade, registros, paginas, total, proxima: pagina });

    try {
      for (;;) {
        const r = await chamar({
          action: 'capturar', entidade,
          paginas: paginasPorVez, pagina_inicial: pagina,
          updated_at__gte: opcoes.updated_at__gte,
        });

        if (r.diagnostico) diagnostico = somarDiagnosticoPlanos(diagnostico, r.diagnostico);

        if (!r.configured) {
          return { configured: false, ok: false, registros, paginas, total,
                   proximaPagina: pagina, parado: false };
        }
        if (!r.ok) {
          // Para no ponto: `pagina` e de onde retomar depois de resolver.
          return { configured: true, ok: false, registros, paginas, total,
                   proximaPagina: pagina, parado: false, diagnostico,
                   erro: r.erro ?? r.error ?? 'Falha ao consultar o Mutual' };
        }

        registros += r.registros ?? 0;
        paginas += r.paginas ?? 0;
        total = r.total_remoto ?? total;

        // Acabou: a API nao aponta proxima pagina, ou o bloco veio vazio
        // (protege contra um `proxima_pagina` que nunca zera).
        const proxima = r.proxima_pagina;
        if (!proxima || (r.paginas ?? 0) === 0 || proxima > PAGINA_MAXIMA) {
          return { configured: true, ok: true, registros, paginas, total,
                   proximaPagina: proxima && proxima <= PAGINA_MAXIMA ? proxima : null,
                   parado: false, diagnostico };
        }

        pagina = proxima;
        setProgresso({ entidade, registros, paginas, total, proxima: pagina });

        // O pedido de parada e atendido ENTRE blocos: abortar no meio deixaria
        // o servidor gravando sem ninguem para dizer onde retomar.
        if (pararRef.current) {
          return { configured: true, ok: true, registros, paginas, total,
                   proximaPagina: pagina, parado: true, diagnostico };
        }
      }
    } finally {
      setRodando(false);
      setProgresso(null);
      void qc.invalidateQueries({ queryKey: ['mutual'] });
    }
  }, [qc]);

  return { puxarTudo, parar, progresso, rodando };
}

/**
 * 0082 — o funil da UNIDADE pelo ASSOCIADO. Substitui o do consultor como
 * instrumento: `consultant` vem vazio em 100% dos objetos e dos contratos.
 */
export function useMutualCoberturaUnidade(somenteFaturaveis = true, ativo = true) {
  const supabase = createClient();
  return useQuery<MutualPassoFunil[]>({
    queryKey: ['mutual', 'cobertura-unidade', somenteFaturaveis],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_cobertura_unidade', {
        p_somente_faturaveis: somenteFaturaveis,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
    enabled: ativo,
  });
}

/**
 * O de-para da filial. `regionalId` nulo DESFAZ o vinculo — e nao existe
 * "vincular a matriz" aqui de proposito: neste sistema `regional_id` nulo
 * SIGNIFICA matriz (0067/0069), entao um de-para para nulo seria
 * indistinguivel de "ninguem decidiu ainda".
 */
export function useVincularFilial() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ idExterno, regionalId }: { idExterno: string; regionalId: string | null }) => {
      if (regionalId) {
        const { error } = await supabase.rpc('vincular_externo', {
          p_entidade: 'REGIONAL', p_id_externo: idExterno,
          p_tabela: 'regionais', p_registro_id: regionalId,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('desvincular_externo', {
          p_entidade: 'REGIONAL', p_id_externo: idExterno,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mutual'] }); },
  });
}

/** Quantos veiculos cada unidade ainda cobra por FORA do SCar. */
export function useCobrancaExternaResumo() {
  const supabase = createClient();
  return useQuery<CobrancaExternaResumo[]>({
    queryKey: ['mutual', 'cobranca-externa'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('cobranca_externa_resumo', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

/** O CUTOVER de uma unidade. Trazer a cobranca para ca exige motivo. */
export function useDefinirCobrancaExterna() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { regionalId, externa, motivo }:
      { regionalId: string | null; externa: boolean; motivo?: string },
    ) => {
      const { data, error } = await supabase.rpc('definir_cobranca_externa_regional', {
        p_regional_id: regionalId, p_externa: externa, p_motivo: motivo ?? null,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mutual'] });
      void qc.invalidateQueries({ queryKey: ['veiculos'] });
      void qc.invalidateQueries({ queryKey: ['cobrancas'] });
    },
  });
}

/**
 * 0083 — as EQUIPES DE VENDAS do Mutual. E este o nivel que corresponde a
 * `regionais` do SCar; a filial (REGIONAL) e a macrorregiao acima dele.
 */
export function useMutualEquipes() {
  const supabase = createClient();
  return useQuery<MutualEquipeVendas[]>({
    queryKey: ['mutual', 'equipes-vendas'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_equipes_vendas', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

/**
 * O agrupamento: VARIAS equipes do Mutual podem apontar para a MESMA regional
 * — e e exatamente para isso que o `unique` do vinculo e so do lado externo
 * (0082). `regionalId` nulo desfaz o agrupamento daquela equipe.
 */
export function useAgruparEquipe() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ idExterno, regionalId }: { idExterno: string; regionalId: string | null }) => {
      if (regionalId) {
        const { error } = await supabase.rpc('vincular_externo', {
          p_entidade: 'SALE_TEAM', p_id_externo: idExterno,
          p_tabela: 'regionais', p_registro_id: regionalId,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('desvincular_externo', {
          p_entidade: 'SALE_TEAM', p_id_externo: idExterno,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mutual'] }); },
  });
}

// ============================================================================
// 0084 — A CARGA
// ============================================================================

/** O de-para de /vehicle/type/ com o peso da carteira ao lado. */
export function useMutualTiposVeiculo() {
  const supabase = createClient();
  return useQuery<MutualTipoVeiculoExterno[]>({
    queryKey: ['mutual', 'tipos-veiculo-externos'],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_tipos_veiculo_externos', {});
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

/**
 * O de-para do PLANO (0085), com o peso da carteira DA UNIDADE escolhida.
 *
 * `unidade` nula = a base inteira. Passar a unidade importa: ordenar pelo
 * volume da base toda poria no topo um plano que nao pesa nada na unidade que
 * se esta carregando.
 */
export function useMutualPlanos(unidade: string | null) {
  const supabase = createClient();
  return useQuery<MutualPlanoExterno[]>({
    queryKey: ['mutual', 'planos-externos', unidade],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_planos_externos', {
        p_regional_id: unidade,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

/**
 * 0087 — o de-para por CATEGORIA, com o peso da unidade. A chave e o PAR
 * categoria/tipo: a categoria PASSEIO do Mutual junta carro e moto.
 */
export function useMutualCategorias(unidade: string | null) {
  const supabase = createClient();
  return useQuery<MutualCategoriaVeiculo[]>({
    queryKey: ['mutual', 'categorias-veiculo', unidade],
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_categorias_veiculo', {
        p_regional_id: unidade,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

/** Registra (ou desfaz) o de-para de uma entidade de catalogo do Mutual. */
export function useVincularCatalogo(
  entidade: 'VEHICLE_TYPE' | 'VEHICLE_CATEGORY' | 'PLAN',
  tabela: string,
) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ idExterno, registroId }: { idExterno: string; registroId: string | null }) => {
      if (registroId) {
        const { error } = await supabase.rpc('vincular_externo', {
          p_entidade: entidade, p_id_externo: idExterno,
          p_tabela: tabela, p_registro_id: registroId,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('desvincular_externo', {
          p_entidade: entidade, p_id_externo: idExterno,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['mutual'] }); },
  });
}

/**
 * A previa da carga de UMA unidade. `regionalId` nulo NAO consulta: aqui nulo
 * significaria MATRIZ (0067/0069), e a RPC recusa de proposito.
 */
export function useCargaPrevia(regionalId: string | null, incluirInativos = false) {
  const supabase = createClient();
  return useQuery<MutualDiagnostico[]>({
    queryKey: ['mutual', 'carga', 'previa', regionalId, incluirInativos],
    enabled: !!regionalId,
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_carga_previa', {
        p_regional_id: regionalId as string, p_incluir_inativos: incluirInativos,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

/** As linhas da carga — todas, ou so as recusadas (a fila de trabalho). */
export function useCargaLinhas(
  regionalId: string | null,
  incluirInativos = false,
  somenteProblemas = false,
  limite: number | null = 300,
) {
  const supabase = createClient();
  return useQuery<MutualCargaLinha[]>({
    queryKey: ['mutual', 'carga', 'linhas', regionalId, incluirInativos, somenteProblemas, limite],
    enabled: !!regionalId,
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_carga_linhas', {
        p_regional_id: regionalId as string,
        p_incluir_inativos: incluirInativos,
        p_somente_problemas: somenteProblemas,
        p_limite: limite,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

/** Onde a carga em blocos esta (0094) — a tela mostra "gravando 400 de 1.171". */
export type ProgressoCarga = {
  fase: 'preparando' | 'gravando';
  feitos: number;
  total: number;
};

/**
 * A execucao. `confirmar` false e SIMULACAO e nao escreve nada — o mesmo
 * parametro serve aos dois para nao existirem duas rotinas divergindo.
 *
 * 🔴 A CARGA DE VERDADE E EM BLOCOS (0094). Numa chamada so ela nao cabe no
 * teto de 8 s do papel `authenticated`: a da MATRIZ (467 veiculos) levou ~10 s
 * e foi executada por fora da tela — pelo botao ela teria falhado. Agora:
 * a primeira chamada LE o lote uma vez e enche a fila; cada chamada seguinte
 * grava `LOTE_CARGA` linhas. Cada bloco e uma transacao: cair a rede no meio
 * nunca deixa veiculo pela metade, e o proximo clique prepara de novo (a carga
 * e re-executavel pelo vinculo, entao o que ja entrou vira ATUALIZAR).
 */
export function useExecutarCarga() {
  const supabase = createClient();
  const qc = useQueryClient();
  const [progresso, setProgresso] = useState<ProgressoCarga | null>(null);

  const chamar = async (args: Database['public']['Functions']['mutual_executar_carga']['Args']) => {
    const { data, error } = await supabase.rpc('mutual_executar_carga', args);
    if (error) throw error;
    const r = (data ?? [])[0];
    if (!r) throw new Error('O banco nao devolveu o resultado da carga');
    return r;
  };

  const mutation = useMutation<MutualCargaResultado, Error, {
    regionalId: string; incluirInativos?: boolean; confirmar?: boolean;
  }>({
    mutationFn: async ({ regionalId, incluirInativos = false, confirmar = false }) => {
      if (!confirmar) {
        return chamar({
          p_regional_id: regionalId, p_incluir_inativos: incluirInativos, p_confirmar: false,
        });
      }
      try {
        setProgresso({ fase: 'preparando', feitos: 0, total: 0 });
        const preparo = await chamar({
          p_regional_id: regionalId, p_incluir_inativos: incluirInativos, p_confirmar: true,
          p_lote: LOTE_CARGA, p_preparar: true,
        });
        const blocos = [preparo];
        const total = Number(preparo.restantes);
        let restantes = total;
        // Freio: cada bloco grava ao menos uma linha, entao mais voltas que
        // linhas so aconteceria com a fila andando para tras.
        let voltas = 0;
        while (restantes > 0) {
          if (++voltas > total + 1) throw new Error('A fila da carga nao esvaziou — pare e confira');
          setProgresso({ fase: 'gravando', feitos: total - restantes, total });
          const b = await chamar({
            p_regional_id: regionalId, p_incluir_inativos: incluirInativos, p_confirmar: true,
            p_lote: LOTE_CARGA, p_preparar: false,
          });
          blocos.push(b);
          restantes = Number(b.restantes);
        }
        const soma = somarBlocosCarga(blocos);
        // A carga nao grava vendedor (0084); quem liga e a 0095, pelo consultor
        // do contrato, e so em quem esta SEM vendedor. Falhar aqui nao desfaz a
        // carga — ela ja esta gravada; o quadro "Vendedor dos veiculos" refaz.
        try {
          const { data, error } = await supabase.rpc('mutual_vincular_vendedores', {
            p_regional_id: regionalId, p_confirmar: true,
          });
          if (error) throw error;
          const v = (data ?? [])[0];
          if (v) soma.mensagem = `${soma.mensagem} ${v.mensagem}`.trim();
        } catch (e) {
          soma.mensagem = `${soma.mensagem} Os vendedores nao foram ligados (${
            (e as { message?: string }).message ?? 'erro'}) — use o quadro "Vendedor dos veiculos".`.trim();
        }
        return soma;
      } finally {
        setProgresso(null);
      }
    },
    onSettled: (_d, _e, vars) => {
      if (!vars.confirmar) return;
      // A carga mexe na operacao inteira: invalidar so ['mutual'] deixaria o
      // SAC, a lista de veiculos e os paineis mostrando a base de antes. E vale
      // tambem no ERRO: os blocos anteriores a falha ja foram gravados.
      for (const k of [['mutual'], ['veiculos'], ['clientes'], ['cobrancas'],
                       ['regionais'], ['dashboard']]) {
        void qc.invalidateQueries({ queryKey: k });
      }
    },
  });

  return { ...mutation, progresso };
}

/**
 * O plano das MOTOS pelos produtos do veiculo (0091/0092). No Mutual a protecao
 * a terceiros e OPCIONAL dentro do mesmo plano de moto, entao o `plan_id` nao
 * decide: quem decide e o produto contratado. Ate aqui isto so rodava por SQL.
 * `confirmar` false so conta (COM_TERCEIROS / SEM_TERCEIROS / JA_CERTO /
 * MANTIDO / SEM_DADOS); true grava. Boleto nao muda: o override manda.
 */
export function useClassificarPorTerceiros() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<{ acao: string; quantidade: number }[], Error, {
    regionalId: string; tipoVeiculoId: string; planoCom: string; planoSem: string;
    substituir: string[]; confirmar: boolean;
  }>({
    mutationFn: async (v) => {
      const { data, error } = await supabase.rpc('mutual_aplicar_plano_por_terceiros', {
        p_regional_id: v.regionalId, p_tipo_veiculo_id: v.tipoVeiculoId,
        p_plano_com: v.planoCom, p_plano_sem: v.planoSem,
        p_substituir: v.substituir, p_confirmar: v.confirmar,
      });
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (_d, v) => {
      if (!v.confirmar) return;
      for (const k of [['mutual'], ['veiculos']]) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

/**
 * O VENDEDOR DOS VEICULOS MIGRADOS (0095), pelo consultor do contrato do
 * Mutual. A leitura e agrupada por motivo e consultor — a fila de quem fica
 * sem vendedor e o que a tela precisa mostrar.
 */
export function useMutualVendedores(regionalId: string | null) {
  const supabase = createClient();
  return useQuery<MutualVendedorResumo[]>({
    queryKey: ['mutual', 'vendedores', regionalId],
    enabled: !!regionalId,
    queryFn: ({ signal }) => naFila(async () => {
      const { data, error } = await supabase.rpc('mutual_vendedores_resumo', {
        p_regional_id: regionalId as string,
      });
      if (error) throw error;
      return data ?? [];
    }, signal),
  });
}

/** Liga os vendedores. `confirmar` false so conta. Nunca troca vendedor ja gravado. */
export function useVincularVendedores() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<MutualVincularVendedores, Error, { regionalId: string; confirmar: boolean }>({
    mutationFn: async ({ regionalId, confirmar }) => {
      const { data, error } = await supabase.rpc('mutual_vincular_vendedores', {
        p_regional_id: regionalId, p_confirmar: confirmar,
      });
      if (error) throw error;
      const r = (data ?? [])[0];
      if (!r) throw new Error('O banco nao devolveu o resultado');
      return r;
    },
    onSuccess: (_d, v) => {
      if (!v.confirmar) return;
      for (const k of [['mutual'], ['veiculos'], ['vendedores'], ['regional']]) {
        void qc.invalidateQueries({ queryKey: k });
      }
    },
  });
}

/** O caminho de volta. Preserva o veiculo que ja tem trabalho do SCar em cima. */
export function useDesfazerCarga() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<MutualDesfazerResultado, Error, {
    regionalId: string; confirmar?: boolean;
  }>({
    mutationFn: async ({ regionalId, confirmar = false }) => {
      const { data, error } = await supabase.rpc('mutual_desfazer_carga', {
        p_regional_id: regionalId, p_confirmar: confirmar,
      });
      if (error) throw error;
      return (data ?? [])[0];
    },
    onSuccess: (_d, vars) => {
      if (!vars.confirmar) return;
      for (const k of [['mutual'], ['veiculos'], ['clientes'], ['cobrancas'],
                       ['regionais'], ['dashboard']]) {
        void qc.invalidateQueries({ queryKey: k });
      }
    },
  });
}
