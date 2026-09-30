'use client';

import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { EntidadeMutual } from '@/lib/mutual';
import type {
  MutualDiagnostico, MutualPorStatus, MutualFilial,
  MutualQuarentena, MutualResumoCaptura, MutualStatusNaoMapeado, MutualPeriodicidade,
  MutualStatusCruzado,
  MutualCampo, MutualPassoFunil, MutualConsultorPendente,
  CobrancaExternaResumo, MutualEquipeVendas,
  MutualTipoVeiculoExterno, MutualCargaLinha, MutualCargaResultado,
  MutualDesfazerResultado,
} from '@/lib/database.types';

/** O que ja esta na area de captura. */
export function useMutualCapturas() {
  const supabase = createClient();
  return useQuery<MutualResumoCaptura[]>({
    queryKey: ['mutual', 'capturas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_resumo_capturas', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** O relatorio de qualidade — o produto da Fase 1. */
export function useMutualDiagnostico() {
  const supabase = createClient();
  return useQuery<MutualDiagnostico[]>({
    queryKey: ['mutual', 'diagnostico'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_diagnostico', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMutualPorStatus() {
  const supabase = createClient();
  return useQuery<MutualPorStatus[]>({
    queryKey: ['mutual', 'status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_por_status', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** As filiais do Mutual + o palpite de de-para. NAO cria regional nenhuma. */
export function useMutualFiliais() {
  const supabase = createClient();
  return useQuery<MutualFilial[]>({
    queryKey: ['mutual', 'filiais'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_filiais', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMutualQuarentena(
  limite = 200,
  somenteFaturaveis = true,
  // 0071: o 0 km (sem placa, com chassi) NAO e problema de dado — e fila
  // operacional. Fica fora por padrao; a tela tem botao para ver.
  incluirPlacaPendente = false,
) {
  const supabase = createClient();
  return useQuery<MutualQuarentena[]>({
    queryKey: ['mutual', 'quarentena', limite, somenteFaturaveis, incluirPlacaPendente],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_quarentena', {
        p_limite: limite,
        p_somente_faturaveis: somenteFaturaveis,
        p_incluir_placa_pendente: incluirPlacaPendente,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * O vocabulario do Mutual que o nosso de-para ainda nao cobre. O enum do
 * swagger NAO e exaustivo — `AGUARDADO A RETIRADA DO RASTREADOR` so apareceu
 * na base real. Sem esta lista, status desconhecido some como "funil de venda".
 */
export function useMutualStatusNaoMapeados() {
  const supabase = createClient();
  return useQuery<MutualStatusNaoMapeado[]>({
    queryKey: ['mutual', 'status-nao-mapeados'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_status_nao_mapeados', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** 0071: contrato x objeto — o instrumento que mede a mudanca antes da carga. */
export function useMutualStatusCruzado() {
  const supabase = createClient();
  return useQuery<MutualStatusCruzado[]>({
    queryKey: ['mutual', 'status-cruzado'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_status_cruzado', {});
      if (error) throw error;
      return data ?? [];
    },
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
}

async function chamar(body: Record<string, unknown>): Promise<RespostaMutual> {
  const res = await fetch('/api/v1/mutual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as RespostaMutual;
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
export function useMutualPeriodicidade() {
  const supabase = createClient();
  return useQuery<MutualPeriodicidade[]>({
    queryKey: ['mutual', 'periodicidade'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_periodicidade', {});
      if (error) throw error;
      return data ?? [];
    },
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
export function useMutualCampos(entidade: EntidadeMutual, caminho?: string) {
  const supabase = createClient();
  return useQuery<MutualCampo[]>({
    queryKey: ['mutual', 'campos', entidade, caminho ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_campos', {
        p_entidade: entidade, p_caminho: caminho ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** O funil da unidade pelo consultor (0073). Leitura; nao escreve nada. */
export function useMutualCoberturaConsultor(somenteFaturaveis = true) {
  const supabase = createClient();
  return useQuery<MutualPassoFunil[]>({
    queryKey: ['mutual', 'cobertura-consultor', somenteFaturaveis],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_cobertura_consultor', {
        p_somente_faturaveis: somenteFaturaveis,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Quem a corrente perde, por VOLUME de veiculos — a fila de trabalho. */
export function useMutualConsultoresPendentes(somenteFaturaveis = true, limite = 50) {
  const supabase = createClient();
  return useQuery<MutualConsultorPendente[]>({
    queryKey: ['mutual', 'consultores-pendentes', somenteFaturaveis, limite],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_consultores_sem_vendedor', {
        p_limite: limite, p_somente_faturaveis: somenteFaturaveis,
      });
      if (error) throw error;
      return data ?? [];
    },
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

        if (!r.configured) {
          return { configured: false, ok: false, registros, paginas, total,
                   proximaPagina: pagina, parado: false };
        }
        if (!r.ok) {
          // Para no ponto: `pagina` e de onde retomar depois de resolver.
          return { configured: true, ok: false, registros, paginas, total,
                   proximaPagina: pagina, parado: false,
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
                   parado: false };
        }

        pagina = proxima;
        setProgresso({ entidade, registros, paginas, total, proxima: pagina });

        // O pedido de parada e atendido ENTRE blocos: abortar no meio deixaria
        // o servidor gravando sem ninguem para dizer onde retomar.
        if (pararRef.current) {
          return { configured: true, ok: true, registros, paginas, total,
                   proximaPagina: pagina, parado: true };
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
export function useMutualCoberturaUnidade(somenteFaturaveis = true) {
  const supabase = createClient();
  return useQuery<MutualPassoFunil[]>({
    queryKey: ['mutual', 'cobertura-unidade', somenteFaturaveis],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_cobertura_unidade', {
        p_somente_faturaveis: somenteFaturaveis,
      });
      if (error) throw error;
      return data ?? [];
    },
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
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cobranca_externa_resumo', {});
      if (error) throw error;
      return data ?? [];
    },
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
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_equipes_vendas', {});
      if (error) throw error;
      return data ?? [];
    },
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
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_tipos_veiculo_externos', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Registra (ou desfaz) o de-para de uma entidade de catalogo do Mutual. */
export function useVincularCatalogo(entidade: 'VEHICLE_TYPE' | 'PLAN', tabela: string) {
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
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_carga_previa', {
        p_regional_id: regionalId as string, p_incluir_inativos: incluirInativos,
      });
      if (error) throw error;
      return data ?? [];
    },
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
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mutual_carga_linhas', {
        p_regional_id: regionalId as string,
        p_incluir_inativos: incluirInativos,
        p_somente_problemas: somenteProblemas,
        p_limite: limite,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * A execucao. `confirmar` false e SIMULACAO e nao escreve nada — o mesmo
 * parametro serve aos dois para nao existirem duas rotinas divergindo.
 */
export function useExecutarCarga() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<MutualCargaResultado, Error, {
    regionalId: string; incluirInativos?: boolean; confirmar?: boolean;
  }>({
    mutationFn: async ({ regionalId, incluirInativos = false, confirmar = false }) => {
      const { data, error } = await supabase.rpc('mutual_executar_carga', {
        p_regional_id: regionalId,
        p_incluir_inativos: incluirInativos,
        p_confirmar: confirmar,
      });
      if (error) throw error;
      return (data ?? [])[0];
    },
    onSuccess: (_d, vars) => {
      if (!vars.confirmar) return;
      // A carga mexe na operacao inteira: invalidar so ['mutual'] deixaria o
      // SAC, a lista de veiculos e os paineis mostrando a base de antes.
      for (const k of [['mutual'], ['veiculos'], ['clientes'], ['cobrancas'],
                       ['regionais'], ['dashboard']]) {
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
