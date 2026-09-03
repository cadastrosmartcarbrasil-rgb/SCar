'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { filtroBuscaLeads } from '@/lib/crm';
import { comprimirImagem, validarArquivo } from '@/lib/imagem';
import type {
  AvisoCaptura,
  ClientesRow,
  CotacaoItem,
  CotacaoPlano,
  CotacoesRow,
  FotoVistoriaModelo,
  ItemChecklistLead,
  LeadAgenda,
  LeadHistoricoRow,
  LeadInteracoesRow,
  LeadKanban,
  LeadsRow,
  ResultadoInteracaoLead,
  TipoInteracaoLead,
  ProdutoDoPlano,
  ProdutoObrigatorio,
  SimulacaoDesconto,
  StatusKanban,
  StatusLead,
  VendedoresRow,
  VistoriaAnexosRow,
  VistoriasRow,
} from '@/lib/database.types';

// Papel do usuario logado (para gate da Auditoria).
export function useMeuPapel() {
  const supabase = createClient();
  return useQuery<string | null>({
    queryKey: ['vendas', 'meu-papel'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('usuarios').select('papel').eq('id', user.id).maybeSingle();
      return data?.papel ?? null;
    },
  });
}

// --- Leads ---
export interface FiltroLeads {
  status?: StatusLead | 'TODOS';
  busca?: string;
  consultorId?: string | null;
  /** Teto de linhas. A lista NUNCA vem inteira: com a base cheia isso seria
   *  baixar a tabela de leads para o navegador a cada abertura da tela. */
  limite?: number;
}

export function useLeads(filtro?: FiltroLeads | StatusLead | 'TODOS') {
  const supabase = createClient();
  const f: FiltroLeads = typeof filtro === 'string' ? { status: filtro } : (filtro ?? {});
  const limite = f.limite ?? 100;
  const busca = (f.busca ?? '').trim();
  const filtroBusca = filtroBuscaLeads(busca);

  return useQuery<LeadsRow[]>({
    queryKey: ['vendas', 'leads', f.status ?? 'TODOS', filtroBusca ?? '', f.consultorId ?? 'all', limite],
    queryFn: async () => {
      let q = supabase.from('leads').select('*').order('updated_at', { ascending: false }).limit(limite);
      if (f.status && f.status !== 'TODOS') q = q.eq('status', f.status);
      if (f.consultorId) q = q.eq('consultor_id', f.consultorId);
      if (filtroBusca) q = q.or(filtroBusca);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Quem pode aparecer no filtro "consultor". A RLS de `usuarios` (0003) ja
 * limita: admin/financeiro veem todos, gestor ve a propria unidade e o
 * consultor ve so a si — e para ele o filtro nem faz sentido, porque a RLS de
 * `leads` (0038) ja o deixa com a propria carteira.
 */
export function useConsultoresDeVendas() {
  const supabase = createClient();
  return useQuery<{ id: string; nome: string }[]>({
    queryKey: ['vendas', 'consultores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome')
        .in('papel', ['consultor_vendas', 'gestor_regional', 'admin'])
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLead(id?: string) {
  const supabase = createClient();
  return useQuery<LeadsRow | null>({
    queryKey: ['vendas', 'lead', id ?? 'none'],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCotacoes(leadId?: string) {
  const supabase = createClient();
  return useQuery<CotacoesRow[]>({
    queryKey: ['vendas', 'cotacoes', leadId ?? 'none'],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from('cotacoes').select('*').eq('lead_id', leadId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHistoricoLead(leadId?: string) {
  const supabase = createClient();
  return useQuery<LeadHistoricoRow[]>({
    queryKey: ['vendas', 'historico', leadId ?? 'none'],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_historico').select('*').eq('lead_id', leadId!).order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveLead() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<LeadsRow, Error, Partial<LeadsRow>>({
    mutationFn: async (lead) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (lead.id) {
        const { id, created_at, updated_at, ...patch } = lead;
        const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select('*').single();
        if (error) throw error;
        return data;
      }
      const payload = { ...lead, consultor_id: lead.consultor_id ?? user?.id ?? null, created_by: user?.id ?? null };
      const { data, error } = await supabase.from('leads').insert(payload).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['vendas', 'leads'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'lead', l.id] });
    },
  });
}

// Muda o status (a esteira). APROVADO e auto-convertido para EM_AUDITORIA no banco.
export function useAvancarStatus() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<LeadsRow, Error, { id: string; status: StatusLead; perdido_motivo?: string }>({
    mutationFn: async ({ id, status, perdido_motivo }) => {
      const patch: Partial<LeadsRow> = { status };
      if (status === 'PERDIDO') patch.perdido_motivo = perdido_motivo ?? null;
      const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['vendas'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'lead', l.id] });
    },
  });
}

// Gera a cotacao (snapshot) a partir da FIPE + produtos, e cria o link publico.
export function useSalvarCotacao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<
    CotacoesRow,
    Error,
    { leadId: string; fipe: number; tipoVeiculoId: string; cotaId?: string | null; planoId?: string | null; produtosIds: string[]; modoEnvio?: string }
  >({
    mutationFn: async ({ leadId, fipe, tipoVeiculoId, cotaId, planoId, produtosIds, modoEnvio }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const [cot, part] = await Promise.all([
        supabase.rpc('cotar_plano', { p_fipe: fipe, p_tipo_veiculo_id: tipoVeiculoId, p_plano_id: planoId ?? null, p_avulsos_ids: produtosIds }),
        supabase.rpc('calcular_participacao', { p_fipe: fipe, p_tipo_veiculo_id: tipoVeiculoId, p_cota_id: cotaId ?? null }),
      ]);
      if (cot.error) throw cot.error;
      if (part.error) throw part.error;
      const calc = cot.data as unknown as CotacaoPlano;
      const itens: CotacaoItem[] = calc.detalhamento_produtos.map((i) => ({
        produto_id: i.produto_id, nome: i.nome, valor: i.valor, obrigatorio: i.obrigatorio,
      }));
      const { data, error } = await supabase.from('cotacoes').insert({
        lead_id: leadId,
        fipe,
        tipo_veiculo_id: tipoVeiculoId,
        cota_participacao_id: cotaId ?? null,
        plano_id: planoId ?? null,
        opcionais_ids: produtosIds,
        itens,
        total_mensalidade: calc.valor_total_mensalidade,
        participacao: Number(part.data ?? calc.franquia_participacao ?? 0),
        taxa_adesao: Number(calc.taxa_adesao ?? 0),
        modo_envio: modoEnvio ?? 'DETALHADA',
        created_by: user?.id ?? null,
      }).select('*').single();
      if (error) throw error;
      // marca o lead como Orcamento Gerado (se ainda estiver em Novo)
      await supabase.from('leads').update({ status: 'ORCAMENTO_GERADO' }).eq('id', leadId).eq('status', 'NOVO');
      return data;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['vendas', 'cotacoes', c.lead_id] });
      qc.invalidateQueries({ queryKey: ['vendas'] });
    },
  });
}

// Auditoria autoriza a entrada na base (cria cliente + veiculo). So papel auditoria/admin.
export function useAutorizarEntrada() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<string, Error, { leadId: string; cpfCnpj?: string | null }>({
    mutationFn: async ({ leadId, cpfCnpj }) => {
      const { data, error } = await supabase.rpc('autorizar_entrada_lead', { p_lead_id: leadId, p_cpf_cnpj: cpfCnpj ?? null });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (_v, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['vendas'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'lead', leadId] });
    },
  });
}


// ---------------------------------------------------------------------------
// Kanban do funil (0028)
// ---------------------------------------------------------------------------
export function useLeadsKanban(filtro?: { regionalId?: string | null; consultorId?: string | null }) {
  const supabase = createClient();
  return useQuery<LeadKanban[]>({
    queryKey: ['vendas', 'kanban', filtro?.regionalId ?? 'all', filtro?.consultorId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('leads_kanban', {
        p_regional_id: filtro?.regionalId ?? null,
        p_consultor_id: filtro?.consultorId ?? null,
        p_limite: 500,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Drag-and-drop: move o lead de fase (o banco valida a transicao).
export function useMoverLead() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<LeadsRow, Error, { id: string; status: StatusKanban; obs?: string | null }>({
    mutationFn: async ({ id, status, obs }) => {
      const { data, error } = await supabase.rpc('mover_lead_status', {
        p_lead_id: id,
        p_status: status,
        p_obs: obs ?? null,
      });
      if (error) throw error;
      return data as LeadsRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendas'] }),
  });
}

// ---------------------------------------------------------------------------
// Cotacao editavel + desconto (0028)
// ---------------------------------------------------------------------------
export interface AtualizarCotacaoInput {
  cotacaoId: string;
  fipe?: number | null;
  tipoVeiculoId?: string | null;
  cotaId?: string | null;
  planoId?: string | null;
  opcionaisIds?: string[] | null;
  modoEnvio?: string | null;
  descontoPercentual?: number | null;
  descontoJustificativa?: string | null;
}

export function useAtualizarCotacao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<CotacoesRow, Error, AtualizarCotacaoInput>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('atualizar_cotacao', {
        p_cotacao_id: i.cotacaoId,
        p_fipe: i.fipe ?? null,
        p_tipo_veiculo_id: i.tipoVeiculoId ?? null,
        p_cota_id: i.cotaId ?? null,
        p_plano_id: i.planoId ?? null,
        p_opcionais_ids: i.opcionaisIds ?? null,
        p_modo_envio: i.modoEnvio ?? null,
        p_desconto_percentual: i.descontoPercentual ?? null,
        p_desconto_justificativa: i.descontoJustificativa ?? null,
      });
      if (error) throw error;
      return data as CotacoesRow;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['vendas', 'cotacoes', c.lead_id] });
      qc.invalidateQueries({ queryKey: ['vendas'] });
    },
  });
}

// Itens que nao podem ser desmarcados (base + plano).
export function useProdutosObrigatorios(tipoVeiculoId?: string | null, planoId?: string | null, fipe?: number) {
  const supabase = createClient();
  return useQuery<ProdutoObrigatorio[]>({
    queryKey: ['vendas', 'obrigatorios', tipoVeiculoId ?? '', planoId ?? '', fipe ?? 0],
    enabled: !!tipoVeiculoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('produtos_obrigatorios_cotacao', {
        p_tipo_veiculo_id: tipoVeiculoId as string,
        p_plano_id: planoId ?? null,
        p_fipe: fipe ?? 0,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Simulacao do desconto (limite da franquia + efeito nos valores).
export function useSimularDesconto(cotacaoId: string | null, percentual: number) {
  const supabase = createClient();
  return useQuery<SimulacaoDesconto | null>({
    queryKey: ['vendas', 'simular-desconto', cotacaoId ?? '', percentual],
    enabled: !!cotacaoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('simular_desconto_cotacao', {
        p_cotacao_id: cotacaoId as string,
        p_percentual: percentual,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

// Desconto acima do limite: roda na sessao do gestor (alcada de excecao).
export function useAprovarDesconto() {
  const qc = useQueryClient();
  return useMutation<{ cotacao: CotacoesRow; aprovado_por: string }, Error, {
    cotacao_id: string;
    percentual: number;
    justificativa: string;
    email: string;
    senha: string;
  }>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/vendas/desconto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Falha ao aprovar o desconto');
      return json;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendas'] }),
  });
}

// ============================================================================
// 0034 — rota de venda completa (ficha, vistoria, CRLV e checklist)
// ============================================================================
const BUCKET_VENDAS = 'vendas';

/** O que ainda falta para o lead poder entrar na base (mesma fonte do banco). */
export function useChecklistLead(leadId?: string) {
  const supabase = createClient();
  return useQuery<ItemChecklistLead[]>({
    queryKey: ['vendas', 'checklist', leadId ?? '-'],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('checklist_lead', { p_lead_id: leadId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Grava a ficha do lead (associado + veiculo + adesao) em um unico patch. */
export function useSalvarFichaLead() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string } & Partial<LeadsRow>>({
    mutationFn: async ({ id, ...patch }) => {
      const { error } = await supabase.from('leads').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['vendas'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'checklist', v.id] });
    },
  });
}

/** Associado ja cadastrado? Busca pelo CPF/CNPJ para reaproveitar a ficha. */
export function useBuscarAssociadoPorDocumento() {
  const supabase = createClient();
  return useMutation<ClientesRow | null, Error, string>({
    mutationFn: async (documento) => {
      const doc = (documento ?? '').replace(/\D/g, '');
      if (doc.length < 11) return null;
      const { data, error } = await supabase
        .from('clientes').select('*').eq('cpf_cnpj', doc).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Vistoria do lead (nasce antes do veiculo existir) + suas fotos. */
export function useVistoriaLead(leadId?: string) {
  const supabase = createClient();
  return useQuery<{ vistoria: VistoriasRow | null; anexos: VistoriaAnexosRow[] }>({
    queryKey: ['vendas', 'vistoria', leadId ?? '-'],
    enabled: !!leadId,
    queryFn: async () => {
      const { data: vist, error } = await supabase
        .from('vistorias').select('*').eq('lead_id', leadId!)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!vist) return { vistoria: null, anexos: [] };

      const { data: anexos, error: e2 } = await supabase
        .from('vistoria_anexos').select('*').eq('vistoria_id', vist.id)
        .order('created_at');
      if (e2) throw e2;
      return { vistoria: vist, anexos: anexos ?? [] };
    },
  });
}

/** Sobe uma foto da vistoria, criando a vistoria do lead na primeira. */
export function useAddFotoVistoria(leadId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { file: File; tipo?: string }>({
    mutationFn: async ({ file: bruto, tipo }) => {
      // A foto e reduzida AQUI, no navegador: 1600px de lado maior, JPEG. Sobe
      // rapido no 4G da rua e a auditoria abre sem esperar. O teto de 10 MB
      // ainda existe no banco (0047), para o caso de a reducao nao rolar.
      const recusa = validarArquivo(bruto);
      if (recusa) throw new Error(recusa);
      const file = await comprimirImagem(bruto);

      let vistoriaId: string;
      const { data: existente } = await supabase
        .from('vistorias').select('id').eq('lead_id', leadId).limit(1).maybeSingle();

      if (existente) {
        vistoriaId = existente.id;
      } else {
        const { data: nova, error } = await supabase
          .from('vistorias')
          .insert({ lead_id: leadId, tipo: 'inicial', status: 'PENDENTE', data_vistoria: new Date().toISOString().slice(0, 10) })
          .select('id').single();
        if (error) throw error;
        vistoriaId = nova.id;
      }

      const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
      const path = `vistorias/${leadId}/${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET_VENDAS).upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from('vistoria_anexos').insert({
        vistoria_id: vistoriaId,
        url: path,
        tipo: tipo ?? null,
        descricao: file.name,
        tamanho_bytes: file.size,
        enviado_por: user?.id ?? null,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET_VENDAS).remove([path]);
        throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendas', 'vistoria', leadId] });
      qc.invalidateQueries({ queryKey: ['vendas', 'fotos-modelo', leadId] });
      qc.invalidateQueries({ queryKey: ['vendas', 'checklist', leadId] });
    },
  });
}

export function useRemoverFotoVistoria(leadId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, VistoriaAnexosRow>({
    mutationFn: async (anexo) => {
      const { error } = await supabase.from('vistoria_anexos').delete().eq('id', anexo.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET_VENDAS).remove([anexo.url]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendas', 'vistoria', leadId] });
      qc.invalidateQueries({ queryKey: ['vendas', 'fotos-modelo', leadId] });
      qc.invalidateQueries({ queryKey: ['vendas', 'checklist', leadId] });
    },
  });
}

/** Sobe o PDF/imagem do CRLV e grava o caminho no lead. */
export function useUploadCrlv(leadId: string) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, File>({
    mutationFn: async (bruto) => {
      // Foto do CRLV segue a mesma regra da vistoria; PDF sobe como veio (nao
      // da para recomprimir aqui), so nao pode passar do teto.
      const recusa = validarArquivo(bruto, { aceitaPdf: true });
      if (recusa) throw new Error(recusa);
      const file = await comprimirImagem(bruto);

      const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
      const path = `crlv/${leadId}/${Date.now()}${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET_VENDAS).upload(path, file, { cacheControl: '3600', upsert: true });
      if (upErr) throw upErr;
      const { error } = await supabase.from('leads').update({ crlv_url: path }).eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendas'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'checklist', leadId] });
    },
  });
}

/**
 * URLs assinadas de VARIOS arquivos de uma vez — e o que permite a aba de
 * vistoria mostrar miniatura de tudo sem um clique por foto. O bucket e
 * privado, entao cada link vale 10 minutos; a query recarrega antes disso.
 */
export function useUrlsAssinadasVendas(paths: (string | null | undefined)[]) {
  const supabase = createClient();
  const lista = Array.from(new Set(paths.filter((p): p is string => !!p))).sort();
  return useQuery<Record<string, string>>({
    queryKey: ['vendas', 'urls-assinadas', lista.join('|')],
    enabled: lista.length > 0,
    staleTime: 8 * 60_000,      // o link expira em 10 min
    gcTime: 8 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET_VENDAS).createSignedUrls(lista, 60 * 10);
      if (error) throw error;
      const mapa: Record<string, string> = {};
      (data ?? []).forEach((d) => {
        if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl;
      });
      return mapa;
    },
  });
}

/** URL assinada para ver foto/CRLV (o bucket e privado). */
export function useUrlAssinadaVendas() {
  const supabase = createClient();
  return useMutation<string, Error, string>({
    mutationFn: async (path) => {
      const { data, error } = await supabase.storage
        .from(BUCKET_VENDAS).createSignedUrl(path, 60 * 10);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** Vendedores da regional, com o teto de comissao herdado dela. */
export function useVendedoresDaRegional(regionalId?: string | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['vendas', 'vendedores', regionalId ?? 'todos'],
    queryFn: async () => {
      let q = supabase
        .from('vendedores')
        .select('*, usuarios(nome), regionais(nome, taxa_comissao_adesao, taxa_comissao_recorrente)')
        .eq('ativo', true);
      if (regionalId) q = q.eq('regional_id', regionalId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as (VendedoresRow & {
        usuarios?: { nome: string } | null;
        regionais?: { nome: string; taxa_comissao_adesao: number; taxa_comissao_recorrente: number } | null;
      })[];
    },
  });
}

// ---------------------------------------------------------------------------
// Vistoria por MODELO DE FOTOS (0040) e itens que ja vem no plano.
// ---------------------------------------------------------------------------

/** Poses que a vistoria deste lead exige, ja marcando o que foi enviado. */
export function useFotosVistoriaLead(leadId?: string) {
  const supabase = createClient();
  return useQuery<FotoVistoriaModelo[]>({
    queryKey: ['vendas', 'fotos-modelo', leadId ?? '-'],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fotos_vistoria_lead', { p_lead_id: leadId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Itens amarrados ao plano/combo. Sem esta lista a tela oferecia como adicional
 * avulso um produto que ja vinha dentro do combo.
 */
export function useProdutosDoPlano(planoId?: string | null) {
  const supabase = createClient();
  return useQuery<ProdutoDoPlano[]>({
    queryKey: ['vendas', 'produtos-plano', planoId ?? '-'],
    enabled: !!planoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('produtos_do_plano', { p_plano_id: planoId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Agenda e contatos do lead (0045)
// ---------------------------------------------------------------------------

export type InteracaoComAutor = LeadInteracoesRow & { usuarios: { nome: string } | null };

/** A trilha de contatos do lead (mais recente primeiro). */
export function useInteracoesLead(leadId?: string) {
  const supabase = createClient();
  return useQuery<InteracaoComAutor[]>({
    queryKey: ['vendas', 'interacoes', leadId ?? 'none'],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_interacoes')
        .select('*, usuarios(nome)')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface RegistrarInteracaoInput {
  leadId: string;
  tipo: TipoInteracaoLead;
  resultado?: ResultadoInteracaoLead;
  observacao?: string | null;
  proximoContatoEm?: string | null;
  proximoContatoNota?: string | null;
  limparAgenda?: boolean;
}

/** Registra o contato e move a agenda (a validacao das regras e no banco). */
export function useRegistrarInteracao() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<LeadsRow, Error, RegistrarInteracaoInput>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('registrar_interacao_lead', {
        p_lead_id: i.leadId,
        p_tipo: i.tipo,
        p_resultado: i.resultado ?? 'FALOU',
        p_observacao: i.observacao ?? null,
        p_proximo_contato_em: i.proximoContatoEm ?? null,
        p_proximo_contato_nota: i.proximoContatoNota ?? null,
        p_limpar_agenda: i.limparAgenda ?? false,
      });
      if (error) throw error;
      return data as LeadsRow;
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['vendas', 'interacoes', l.id] });
      qc.invalidateQueries({ queryKey: ['vendas', 'lead', l.id] });
      qc.invalidateQueries({ queryKey: ['vendas', 'kanban'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'agenda'] });
    },
  });
}

/** O que fazer hoje: retornos vencidos e do dia (null = ate o fim de hoje). */
export function useAgendaVendas(ate?: string | null) {
  const supabase = createClient();
  return useQuery<LeadAgenda[]>({
    queryKey: ['vendas', 'agenda', ate ?? 'hoje'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('agenda_vendas', {
        p_ate: ate ?? null,
        p_consultor_id: null,
        p_limite: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Cotacao comparativa: um preco por plano, de uma vez
//
// E o que a pagina publica do hotlink ja fazia (`/api/v1/hotlink/cotar`), agora
// para quem atende: em vez de trocar o combo no select e clicar em "calcular",
// o vendedor ve Prata, Ouro e Diamante lado a lado e escolhe.
// ---------------------------------------------------------------------------
export interface PlanoComparado {
  plano_id: string | null;   // null = so a cobertura base
  nome: string;
  descricao: string | null;
  nivel: number | null;
  mensalidade: number;
  adesao: number;
  participacao: number;
  itens: { nome: string; valor: number; obrigatorio: boolean }[];
  /** Avulsos que sobraram para este plano (os que ele ja inclui saem da conta). */
  avulsos_cobrados: string[];
}

export function useCotacaoComparativa(entrada: {
  fipe?: number | null;
  tipoVeiculoId?: string | null;
  cotaId?: string | null;
  avulsos?: string[];
}) {
  const supabase = createClient();
  const { fipe, tipoVeiculoId, cotaId } = entrada;
  const avulsos = [...(entrada.avulsos ?? [])].sort();
  const pronto = !!fipe && fipe > 0 && !!tipoVeiculoId;

  return useQuery<PlanoComparado[]>({
    queryKey: ['vendas', 'comparativo', fipe ?? 0, tipoVeiculoId ?? '', cotaId ?? '', avulsos.join(',')],
    enabled: pronto,
    queryFn: async () => {
      const [{ data: planos, error: erroPlanos }, { data: vinculos }, { data: part }] = await Promise.all([
        supabase.from('planos_protecao').select('id, nome, descricao_comercial, nivel')
          .eq('ativo', true).order('nivel').order('nome'),
        supabase.from('plano_produtos').select('plano_id, produto_id'),
        supabase.rpc('calcular_participacao', {
          p_fipe: fipe as number, p_tipo_veiculo_id: tipoVeiculoId as string, p_cota_id: cotaId ?? null,
        }),
      ]);
      if (erroPlanos) throw erroPlanos;

      const doPlano = (planoId: string) =>
        (vinculos ?? []).filter((v) => v.plano_id === planoId).map((v) => v.produto_id);

      // A cobertura base entra como primeira opcao: ha venda que fecha sem combo.
      const opcoes: { id: string | null; nome: string; descricao: string | null; nivel: number | null }[] = [
        { id: null, nome: 'Cobertura base', descricao: 'Somente os itens obrigatorios', nivel: -1 },
        ...(planos ?? []).map((p) => ({
          id: p.id, nome: p.nome, descricao: p.descricao_comercial, nivel: p.nivel,
        })),
      ];

      const cotados = await Promise.all(opcoes.map(async (o) => {
        // O que o plano ja inclui nao pode ser cobrado de novo como avulso.
        const incluidos = o.id ? doPlano(o.id) : [];
        const cobrados = avulsos.filter((a) => !incluidos.includes(a));
        const { data, error } = await supabase.rpc('cotar_plano', {
          p_fipe: fipe as number,
          p_tipo_veiculo_id: tipoVeiculoId as string,
          p_plano_id: o.id,
          p_avulsos_ids: cobrados,
        });
        if (error) return null;
        const c = data as unknown as CotacaoPlano;
        return {
          plano_id: o.id,
          nome: o.nome,
          descricao: o.descricao,
          nivel: o.nivel,
          mensalidade: Number(c.valor_total_mensalidade ?? 0),
          adesao: Number(c.taxa_adesao ?? 0),
          participacao: Number(part ?? c.franquia_participacao ?? 0),
          itens: (c.detalhamento_produtos ?? []).map((i) => ({
            nome: i.nome, valor: Number(i.valor), obrigatorio: i.obrigatorio,
          })),
          avulsos_cobrados: cobrados,
        } as PlanoComparado;
      }));

      return cotados.filter((c): c is PlanoComparado => c !== null);
    },
  });
}

// ---------------------------------------------------------------------------
// Aviso de duplicidade no CRM (0046)
//
// A mesma classificacao do hotlink, agora para quem cadastra na mao. E AVISO,
// nunca trava: a tela segue cotando (regra do 0043). A RPC nao tem parametro
// de regional — a unidade sai de quem chama.
// ---------------------------------------------------------------------------
export function useAvisoDeCaptura(entrada: {
  celular?: string; cpfCnpj?: string; placa?: string; ativo?: boolean;
}) {
  const supabase = createClient();
  const celular = (entrada.celular ?? '').replace(/\D/g, '');
  const cpf = (entrada.cpfCnpj ?? '').replace(/\D/g, '');
  const placa = (entrada.placa ?? '').trim().toUpperCase();
  // So consulta quando ha o que procurar de verdade (celular com DDD, CPF/CNPJ
  // inteiro ou placa completa) — senao seria uma consulta por tecla digitada.
  const vale = celular.length >= 10 || cpf.length === 11 || cpf.length === 14 || placa.length === 7;

  return useQuery<AvisoCaptura | null>({
    queryKey: ['vendas', 'aviso-captura', celular, cpf, placa],
    enabled: vale && entrada.ativo !== false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('classificar_captura_no_escopo', {
        p_celular: celular || null,
        p_cpf_cnpj: cpf || null,
        p_placa: placa || null,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

// ---------------------------------------------------------------------------
// Aceite presencial pelo CRM (0046)
//
// A funcao ja existia e so a pagina publica chamava: com o cliente na frente,
// o vendedor precisava mandar o link e pedir que ele abrisse no celular. O
// banco grava QUEM aceitou (CLIENTE ou VENDEDOR), entao a prova continua
// dizendo a verdade sobre como o consentimento foi colhido.
// ---------------------------------------------------------------------------
export function useRegistrarAceite() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<LeadsRow, Error, {
    leadId: string; cotacaoId: string | null; nome: string; documento: string;
  }>({
    mutationFn: async (i) => {
      const { data, error } = await supabase.rpc('registrar_aceite_venda', {
        p_lead_id: i.leadId,
        p_cotacao_id: i.cotacaoId,
        p_por: 'VENDEDOR',
        p_nome: i.nome,
        p_documento: i.documento,
        // O IP so faria sentido no dispositivo de quem aceita; aqui quem
        // responde pelo aceite e o vendedor logado, e e isso que fica gravado.
        p_ip: null,
        p_user_agent: typeof navigator === 'undefined' ? null : `CRM · ${navigator.userAgent}`,
      });
      if (error) throw error;
      return data as LeadsRow;
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['vendas', 'lead', l.id] });
      qc.invalidateQueries({ queryKey: ['vendas', 'kanban'] });
      qc.invalidateQueries({ queryKey: ['vendas', 'leads'] });
    },
  });
}
