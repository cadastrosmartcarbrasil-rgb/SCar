'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  RegionaisRow,
  CategoriasDreRow,
  IntegracoesBancariasRow,
  UsuariosRow,
  PapelUsuario,
  MarcasRow,
  ModelosRow,
  VendedoresRow,
  TiposEventoRow,
  StatusCadastro,
  RegionalListada,
  UsuarioListado,
  Json,
} from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Regionais (franquias)
// ---------------------------------------------------------------------------

/** Uma linha de `regionais_listar` (0067). */
export type RegionalPainel = RegionalListada;

export function useRegionais() {
  const supabase = createClient();
  return useQuery<RegionaisRow[]>({
    queryKey: ['config', 'regionais'],
    queryFn: async () => {
      const { data, error } = await supabase.from('regionais').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveRegional() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<RegionaisRow>) => {
      const payload = {
        nome: r.nome,
        cnpj: r.cnpj || null,
        endereco: r.endereco ?? {},
        responsavel_id: r.responsavel_id || null,
        // Politica de desconto de venda da franquia (0028)
        percentual_maximo_desconto_venda: r.percentual_maximo_desconto_venda ?? 0,
        desconto_observacao: r.desconto_observacao || null,
        // Comissao da franquia (0034) — teto do que ela cede aos vendedores.
        taxa_comissao_adesao: r.taxa_comissao_adesao ?? 0,
        taxa_comissao_recorrente: r.taxa_comissao_recorrente ?? 0,
        // Regras de atribuicao do lead (0041). ATENCAO: elas estavam no
        // formulario desde a 0041 e NUNCA chegavam ao banco — o payload nao as
        // listava, entao o gestor mudava a protecao do lead, salvava, e a
        // unidade continuava com o padrao. Nao remover daqui.
        dias_protecao_lead: r.dias_protecao_lead ?? 30,
        dias_sem_contato_lead: r.dias_sem_contato_lead ?? 7,
        distribuicao_lead: r.distribuicao_lead ?? 'MANUAL',
        // Contato e situacao da unidade (0067)
        telefone: r.telefone || null,
        email: r.email || null,
        ativo: r.ativo ?? true,
      };
      if (r.id) {
        const { error } = await supabase.from('regionais').update(payload).eq('id', r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('regionais').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'regionais'] }),
  });
}

/**
 * A unidade com os numeros que dizem se ela esta viva e se da para excluir
 * (RPC `regionais_listar`, 0067). E o que a tela de Regionais mostra.
 */
export function useRegionaisPainel(incluirInativas = true) {
  const supabase = createClient();
  return useQuery<RegionalPainel[]>({
    queryKey: ['config', 'regionais', 'painel', incluirInativas],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('regionais_listar', {
        p_incluir_inativas: incluirInativas,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Liga/desliga a unidade. Inativar NAO apaga nada — ver `src/lib/regional.ts`. */
export function useSituacaoRegional() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('regionais').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'regionais'] }),
  });
}

export function useDeleteRegional() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // O banco recusa a exclusao de unidade com movimento (trigger
      // `fn_regional_bloqueia_exclusao`, 0067): sem isso as FKs
      // `on delete set null` moveriam a carteira dela para a MATRIZ.
      const { error } = await supabase.from('regionais').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'regionais'] }),
  });
}

// ---------------------------------------------------------------------------
// Plano de Contas (categorias DRE)
// ---------------------------------------------------------------------------
export function usePlanoContas() {
  const supabase = createClient();
  return useQuery<CategoriasDreRow[]>({
    queryKey: ['config', 'plano-contas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_dre')
        .select('*')
        .order('codigo_estruturado');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveCategoria() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<CategoriasDreRow>) => {
      const payload = {
        codigo_estruturado: c.codigo_estruturado,
        nome: c.nome,
        tipo: c.tipo,
        ativo: c.ativo ?? true,
      };
      if (c.id) {
        const { error } = await supabase.from('categorias_dre').update(payload).eq('id', c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categorias_dre').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'plano-contas'] }),
  });
}

export function useDeleteCategoria() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categorias_dre').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'plano-contas'] }),
  });
}

// ---------------------------------------------------------------------------
// Integracoes bancarias
// ---------------------------------------------------------------------------
export function useIntegracoes() {
  const supabase = createClient();
  return useQuery<(IntegracoesBancariasRow & { regionais?: { nome: string } | null })[]>({
    queryKey: ['config', 'integracoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integracoes_bancarias')
        .select('*, regionais(nome)')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as never;
    },
  });
}

export function useSaveIntegracao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: Partial<IntegracoesBancariasRow>) => {
      const payload = {
        nome: i.nome,
        provedor: i.provedor,
        ambiente: i.ambiente,
        api_url: i.api_url || null,
        api_key: i.api_key || null,
        api_token_extra: i.api_token_extra || null,
        webhook_secret: i.webhook_secret || null,
        regional_id: i.regional_id || null,
        is_padrao: i.is_padrao ?? false,
        ativo: i.ativo ?? true,
      };
      if (i.id) {
        const { error } = await supabase.from('integracoes_bancarias').update(payload).eq('id', i.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('integracoes_bancarias').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'integracoes'] }),
  });
}

export function useDeleteIntegracao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('integracoes_bancarias').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'integracoes'] }),
  });
}

// ---------------------------------------------------------------------------
// Usuarios & perfis
// ---------------------------------------------------------------------------
export function useUsuarios() {
  const supabase = createClient();
  return useQuery<UsuariosRow[]>({
    queryKey: ['config', 'usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase.from('usuarios').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface NovoUsuario {
  nome: string;
  email: string;
  senha: string;
  papel: UsuariosRow['papel'];
  regional_id?: string | null;
  // Ficha (0068) — contato e vinculo de quem responde pelo que faz.
  telefone?: string | null;
  documento?: string | null;
  cargo?: string | null;
  data_inicio?: string | null;
  observacoes?: string | null;
}

// Criacao de usuario passa por Route Handler (usa a service_role no servidor).
export function useCreateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (u: NovoUsuario) => {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao criar usuario');
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'usuarios'] }),
  });
}

/**
 * A equipe com a ficha resolvida (RPC `usuarios_listar`, 0068): unidade pelo
 * nome, vinculo de vendedor e por quantas unidades a pessoa responde.
 */
export function useUsuariosPainel(incluirInativos = true) {
  const supabase = createClient();
  return useQuery<UsuarioListado[]>({
    queryKey: ['config', 'usuarios', 'painel', incluirInativos],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('usuarios_listar', {
        p_incluir_inativos: incluirInativos,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Dados do usuario da equipe que EDITAM pela tela de Usuarios. */
export interface EdicaoUsuario {
  id: string;
  nome?: string;
  email?: string;
  papel?: PapelUsuario;
  regional_id?: string | null;
  ativo?: boolean;
  /** senha nova (redefinicao pelo admin); vazio = nao mexe na senha */
  senha?: string;
  // Ficha (0068)
  telefone?: string | null;
  documento?: string | null;
  cargo?: string | null;
  data_inicio?: string | null;
  data_desligamento?: string | null;
  observacoes?: string | null;
}

/**
 * Edicao do usuario da equipe.
 *
 * Passa pela rota `/api/usuarios` (PATCH) e nao direto pelo supabase-js: o
 * e-mail e a senha vivem em `auth.users`, que so a service_role alcanca. E o
 * update direto tinha um efeito pior que falhar — falhava EM SILENCIO: quando
 * a RLS barrava (usuario que nao e admin), o supabase-js devolvia sucesso com
 * zero linhas alteradas e a tela dizia "Atualizado" sem ter atualizado nada.
 */
export function useUpdateUsuario() {
  const qc = useQueryClient();
  return useMutation<{ senha_redefinida: boolean }, Error, EdicaoUsuario>({
    mutationFn: async (edicao) => {
      const r = await fetch('/api/usuarios', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(edicao),
      });
      const json = (await r.json().catch(() => ({}))) as { error?: string; senha_redefinida?: boolean };
      if (!r.ok) throw new Error(json.error ?? 'Nao foi possivel salvar o usuario.');
      return { senha_redefinida: !!json.senha_redefinida };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'usuarios'] }),
  });
}

/** O usuario logado (para a tela saber se ele pode gerenciar a equipe). */
export function usePerfilAtual() {
  const supabase = createClient();
  return useQuery<UsuariosRow | null>({
    queryKey: ['config', 'perfil-atual'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase.from('usuarios').select('*').eq('id', user.id).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

// ---------------------------------------------------------------------------
// Vendedores (consultores)
// ---------------------------------------------------------------------------
export function useVendedores() {
  const supabase = createClient();
  return useQuery<VendedoresRow[]>({
    queryKey: ['config', 'vendedores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendedores').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Carga da equipe por planilha (RPC `importar_vendedores`, 0069).
 *
 * ATOMICA de proposito: meia importacao de equipe e pior que nenhuma, porque
 * ninguem sabe onde parou. A validacao que evita a explosao (teto da franquia,
 * unidade ativa, regional mapeada) mora na PREVIA — `montarPrevia` em
 * `src/lib/vendedores-import.ts`.
 */
export function useImportarVendedores() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<
    { criados: number; atualizados: number },
    Error,
    { linhas: Record<string, unknown>[]; respeitarStatus: boolean }
  >({
    mutationFn: async ({ linhas, respeitarStatus }) => {
      const { data, error } = await supabase.rpc('importar_vendedores', {
        p_linhas: linhas as unknown as Json,
        p_respeitar_status: respeitarStatus,
      });
      if (error) throw new Error(error.message);
      const r = data?.[0];
      return { criados: r?.criados ?? 0, atualizados: r?.atualizados ?? 0 };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'vendedores'] });
      qc.invalidateQueries({ queryKey: ['config', 'regionais'] });
    },
  });
}

export function useSaveVendedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<VendedoresRow>) => {
      const payload = {
        usuario_id: v.usuario_id,
        regional_id: v.regional_id || null,
        taxa_comissao_adesao: v.taxa_comissao_adesao ?? 0,
        taxa_comissao_recorrente: v.taxa_comissao_recorrente ?? 0,
        ativo: v.ativo ?? true,
      };
      if (v.id) {
        const { error } = await supabase.from('vendedores').update(payload).eq('id', v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vendedores').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'vendedores'] }),
  });
}

export function useDeleteVendedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendedores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'vendedores'] }),
  });
}

// ---------------------------------------------------------------------------
// Marcas e Modelos de veiculos
// ---------------------------------------------------------------------------
export function useMarcas() {
  const supabase = createClient();
  return useQuery<MarcasRow[]>({
    queryKey: ['config', 'marcas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('marcas').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Carrega os modelos de UMA marca. O catalogo tem milhares de modelos, entao
// so busca quando uma marca esta selecionada (evita fetch de tudo de uma vez).
export function useModelos(marcaId?: string) {
  const supabase = createClient();
  return useQuery<ModelosRow[]>({
    queryKey: ['config', 'modelos', marcaId ?? 'none'],
    enabled: !!marcaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('modelos')
        .select('*')
        .eq('marca_id', marcaId!)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveMarca() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: string; nome: string; status?: StatusCadastro }) => {
      const status = v.status ?? 'ATIVO';
      const payload = { nome: v.nome, status, ativo: status === 'ATIVO' };
      if (v.id) {
        const { error } = await supabase.from('marcas').update(payload).eq('id', v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('marcas').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'marcas'] }),
  });
}

export function useDeleteMarca() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marcas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'marcas'] });
      qc.invalidateQueries({ queryKey: ['config', 'modelos'] });
    },
  });
}

export function useSaveModelo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id?: string;
      marca_id: string;
      nome: string;
      tipo_veiculo?: string | null;
      idade_maxima?: number;
      status?: StatusCadastro;
      cota_participacao_id?: string | null;
      grupo_veiculo?: string | null;
      especial?: boolean;
    }) => {
      const status = v.status ?? 'ATIVO';
      const payload = {
        marca_id: v.marca_id,
        nome: v.nome,
        tipo_veiculo: v.tipo_veiculo?.trim() ? v.tipo_veiculo.trim() : null,
        idade_maxima: v.idade_maxima ?? 0,
        status,
        ativo: status === 'ATIVO',
        cota_participacao_id: v.cota_participacao_id ?? null,
        grupo_veiculo: v.grupo_veiculo?.trim() ? v.grupo_veiculo.trim() : null,
        especial: v.especial ?? false,
      };
      if (v.id) {
        const { error } = await supabase.from('modelos').update(payload).eq('id', v.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('modelos').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'modelos'] }),
  });
}

export function useDeleteModelo() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('modelos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'modelos'] }),
  });
}

// ---------------------------------------------------------------------------
// Tipos de evento (sinistro)
// ---------------------------------------------------------------------------
export function useTiposEvento() {
  const supabase = createClient();
  return useQuery<TiposEventoRow[]>({
    queryKey: ['config', 'tipos-evento'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_evento').select('*').order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveTipoEvento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from('tipos_evento').insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'tipos-evento'] }),
  });
}

export function useDeleteTipoEvento() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tipos_evento').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'tipos-evento'] }),
  });
}
