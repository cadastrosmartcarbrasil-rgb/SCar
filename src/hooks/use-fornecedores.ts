'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { soDigitos } from '@/lib/documento';
import type { FornecedoresRow } from '@/lib/database.types';

/** Tipo do fornecedor — e so uma marcacao na MESMA tabela (0051). */
export type TipoFornecedor = 'todos' | 'geral' | 'prestador' | 'rastreadora';

export function useFornecedores(tipo: TipoFornecedor = 'todos') {
  const supabase = createClient();
  return useQuery<FornecedoresRow[]>({
    queryKey: ['fornecedores', tipo],
    queryFn: async () => {
      let q = supabase.from('fornecedores').select('*').order('razao_social');
      if (tipo === 'prestador') q = q.eq('prestador_assistencia', true);
      if (tipo === 'rastreadora') q = q.eq('empresa_rastreamento', true);
      if (tipo === 'geral') q = q.eq('prestador_assistencia', false).eq('empresa_rastreamento', false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveFornecedor() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<string, Error, Partial<FornecedoresRow>>({
    mutationFn: async (f) => {
      const payload = {
        tipo_pessoa: f.tipo_pessoa ?? 'PJ',
        // documento e opcional desde a 0051 — rastreadora e prestador pequeno
        // as vezes entram sem CNPJ. Vazio vira null, nao string vazia.
        documento: soDigitos(f.documento ?? '') || null,
        razao_social: f.razao_social,
        nome_fantasia: f.nome_fantasia || null,
        situacao_cadastral: f.situacao_cadastral || null,
        cnae_principal: f.cnae_principal || null,
        contato: f.contato || null,
        email: f.email || null,
        telefone: f.telefone || null,
        endereco: f.endereco ?? {},
        dados_receita: f.dados_receita ?? {},
        ativo: f.ativo ?? true,
        // tipos e campos proprios de cada um
        prestador_assistencia: f.prestador_assistencia ?? false,
        whatsapp: f.whatsapp || null,
        cobertura: f.cobertura || null,
        chave_pix: f.chave_pix || null,
        observacoes: f.observacoes || null,
        empresa_rastreamento: f.empresa_rastreamento ?? false,
        plataforma_url: f.plataforma_url || null,
        custo_mensal_equipamento: f.custo_mensal_equipamento ?? 0,
      };
      if (f.id) {
        const { error } = await supabase.from('fornecedores').update(payload).eq('id', f.id);
        if (error) throw error;
        return f.id;
      }
      const { data, error } = await supabase.from('fornecedores').insert(payload).select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] });
      qc.invalidateQueries({ queryKey: ['rastreamento'] });
      qc.invalidateQueries({ queryKey: ['assistencia'] });
    },
  });
}

export interface ResultadoImportacaoFornecedores {
  criados: number;
  completados: number;
  /** Linha da planilha + o motivo do banco, quando alguma recusou. */
  falhas: { linha: number; nome: string; erro: string }[];
}

/**
 * Importacao por planilha: insere os NOVOS em blocos de 100 (bloco que falha e
 * refeito linha a linha, para dizer QUAL recusou) e completa os ja cadastrados
 * so com o que estava vazio — a previa (`montarPreviaFornecedores`) decide o
 * que entra em cada lista.
 */
export function useImportarFornecedores() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<
    ResultadoImportacaoFornecedores,
    Error,
    {
      novos: { linha: number; nome: string; registro: Record<string, unknown> }[];
      completar: { linha: number; nome: string; id: string; campos: Record<string, unknown> }[];
    }
  >({
    mutationFn: async ({ novos, completar }) => {
      const r: ResultadoImportacaoFornecedores = { criados: 0, completados: 0, falhas: [] };
      const traduz = (m: string) =>
        /duplicate key|unique/i.test(m) ? 'CNPJ/CPF já cadastrado (alguém cadastrou enquanto a prévia estava aberta)' : m;

      for (let i = 0; i < novos.length; i += 100) {
        const bloco = novos.slice(i, i + 100);
        const { error } = await supabase.from('fornecedores').insert(bloco.map((n) => n.registro) as never);
        if (!error) { r.criados += bloco.length; continue; }
        for (const n of bloco) {
          const { error: e1 } = await supabase.from('fornecedores').insert(n.registro as never);
          if (e1) r.falhas.push({ linha: n.linha, nome: n.nome, erro: traduz(e1.message) });
          else r.criados += 1;
        }
      }
      for (const c of completar) {
        const { error } = await supabase.from('fornecedores').update(c.campos as never).eq('id', c.id);
        if (error) r.falhas.push({ linha: c.linha, nome: c.nome, erro: traduz(error.message) });
        else r.completados += 1;
      }
      return r;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] });
      qc.invalidateQueries({ queryKey: ['rastreamento'] });
      qc.invalidateQueries({ queryKey: ['assistencia'] });
    },
  });
}
