'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Plus, Receipt, RotateCcw, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { MoneyInput } from '@/components/ui/field';
import { SeletorFornecedor } from '@/components/fornecedores/seletor-fornecedor';
import { LancamentoModal } from '@/components/financeiro/lancamento-modal';
import { usePode } from '@/hooks/use-permissoes';
import { usePlanoContas } from '@/hooks/use-config';
import { useTerceirosEvento } from '@/hooks/use-terceiros';
import { lancamentoDaCotacao } from '@/lib/terceiros';
import type { CotacoesPecasRow, ItensCotacaoRow, LancamentosFinanceirosRow, TipoReparo } from '@/lib/database.types';

type Cotacao = CotacoesPecasRow & { itens_cotacao: ItensCotacaoRow[] };

// Modulo de cotacao de pecas: fornecedor (cadastrado, 0132) e itens.
// valor_total e recalculado por trigger no banco (fn_recalcular_cotacao).
// tipoReparo separa reparo do veiculo proprio x veiculo de terceiro;
// terceiroId (0103) restringe ao reparo de UM terceiro do evento.
// Aprovar a cotacao pergunta na hora se ja vai para o contas a pagar, com o
// fornecedor, o valor e o evento preenchidos; o titulo gerado fica ligado a
// cotacao (cotacoes_pecas.lancamento_id).
export function CotacaoPecas({
  eventoId,
  tipoReparo,
  terceiroId,
  regionalId,
  protocolo,
}: {
  eventoId: string;
  tipoReparo?: TipoReparo;
  terceiroId?: string;
  regionalId?: string | null;
  protocolo?: string | null;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const trata = usePode('eventos.editar');
  const [fornecedorId, setFornecedorId] = useState('');
  const [fornecedorNome, setFornecedorNome] = useState('');
  const [perguntar, setPerguntar] = useState<Cotacao | null>(null);
  const [lancando, setLancando] = useState<Cotacao | null>(null);
  const { data: terceiros } = useTerceirosEvento(eventoId);
  const { data: categorias } = usePlanoContas();
  const chave = ['eventos', eventoId, 'cotacoes', tipoReparo ?? 'all', terceiroId ?? 'todos'];
  const recarregar = () => qc.invalidateQueries({ queryKey: ['eventos', eventoId, 'cotacoes'] });

  const { data: cotacoes } = useQuery<Cotacao[]>({
    queryKey: chave,
    queryFn: async () => {
      let q = supabase
        .from('cotacoes_pecas')
        .select('*, itens_cotacao(*)')
        .eq('evento_id', eventoId)
        .order('created_at', { ascending: true });
      if (tipoReparo) q = q.eq('tipo_reparo', tipoReparo);
      if (terceiroId) q = q.eq('evento_terceiro_id', terceiroId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as never;
    },
  });

  const criarCotacao = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cotacoes_pecas').insert({
        evento_id: eventoId,
        fornecedor_id: fornecedorId || null,
        fornecedor_nome: fornecedorNome.trim() || 'Novo fornecedor',
        tipo_reparo: tipoReparo ?? 'PROPRIO',
        evento_terceiro_id: terceiroId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setFornecedorId('');
      setFornecedorNome('');
      recarregar();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addItem = useMutation({
    mutationFn: async (v: { cotacaoId: string; desc: string; qtd: number; unit: number }) => {
      const { error } = await supabase.from('itens_cotacao').insert({
        cotacao_id: v.cotacaoId,
        descricao_peca: v.desc,
        quantidade: v.qtd,
        valor_unitario: v.unit,
      });
      if (error) throw error;
    },
    onSuccess: recarregar,
    onError: (e) => toast.error((e as Error).message),
  });

  const delItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('itens_cotacao').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: recarregar,
    onError: (e) => toast.error((e as Error).message),
  });

  const atualizar = useMutation({
    mutationFn: async (v: { id: string; patch: Partial<CotacoesPecasRow> }) => {
      const { error } = await supabase.from('cotacoes_pecas').update(v.patch).eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: recarregar,
    onError: (e) => toast.error((e as Error).message),
  });

  function aprovar(c: Cotacao) {
    if (Number(c.valor_total) <= 0) return toast.error('Inclua os itens da cotação antes de aprovar');
    atualizar.mutate(
      { id: c.id, patch: { status: 'APROVADA' } },
      { onSuccess: () => { toast.success('Cotação aprovada'); setPerguntar({ ...c, status: 'APROVADA' }); } },
    );
  }

  const inicialLancamento = (c: Cotacao): Partial<LancamentosFinanceirosRow> =>
    lancamentoDaCotacao(c, {
      eventoId, regionalId: regionalId ?? null, protocolo: protocolo ?? null,
      categoriaId: (categorias ?? []).find((x) => x.codigo_estruturado === '3.1.04')?.id ?? null,
      hoje: new Date().toISOString().slice(0, 10),
    });

  return (
    <div className="space-y-4">
      {trata && (
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-[260px] flex-1">
            <SeletorFornecedor
              value={fornecedorId}
              onChange={(id, rotulo) => { setFornecedorId(id); setFornecedorNome(rotulo); }}
              placeholder="Fornecedor da cotação (digite para buscar)"
            />
          </div>
          {!fornecedorId && (
            <input
              value={fornecedorNome}
              onChange={(e) => setFornecedorNome(e.target.value)}
              placeholder="ou só o nome (sem cadastro)"
              className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          )}
          <button
            onClick={() => criarCotacao.mutate()}
            disabled={criarCotacao.isPending}
            className="flex items-center gap-1 rounded-md bg-acao px-3 py-2 text-sm text-white hover:bg-acao-escura"
          >
            <Plus className="h-4 w-4" /> Nova cotação
          </button>
        </div>
      )}

      {(cotacoes ?? []).map((c) => (
        <CotacaoCard
          key={c.id}
          cotacao={c}
          trata={trata}
          onAddItem={(v) => addItem.mutate(v)}
          onDelItem={(id) => delItem.mutate(id)}
          onAprovar={() => aprovar(c)}
          onStatus={(status) => atualizar.mutate({ id: c.id, patch: { status } })}
          onFornecedor={(id, rotulo) =>
            atualizar.mutate({ id: c.id, patch: { fornecedor_id: id || null, ...(id ? { fornecedor_nome: rotulo } : {}) } })}
          onLancar={() => setLancando(c)}
        />
      ))}
      {(cotacoes ?? []).length === 0 && (
        <p className="text-sm text-slate-400">Nenhuma cotação lançada.</p>
      )}

      {perguntar && (
        <Modal open onClose={() => setPerguntar(null)} title="Cotação aprovada" subtitulo={perguntar.fornecedor_nome}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Lançar agora no contas a pagar? O título de <b>{formatCurrency(perguntar.valor_total)}</b> já abre com o
              fornecedor, o evento e a classificação preenchidos — você confere, ajusta o vencimento e grava.
            </p>
            {!perguntar.fornecedor_id && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Esta cotação não tem fornecedor cadastrado. Escolha (ou cadastre) o fornecedor no lançamento — conta a
                pagar do evento exige favorecido.
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <Button type="button" variant="secondary" onClick={() => setPerguntar(null)}>Depois</Button>
              <Button type="button" onClick={() => { setLancando(perguntar); setPerguntar(null); }}>
                <Receipt className="h-4 w-4" /> Lançar no contas a pagar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {lancando && (
        <LancamentoModal
          aberto
          inicial={inicialLancamento(lancando)}
          onClose={() => setLancando(null)}
          evento={{
            protocolo: protocolo ?? null,
            terceiros: (terceiros ?? []).map((t) => ({ id: t.id, codigo: t.codigo, nome: t.nome })),
          }}
          onSalvo={(ids) => {
            const id = ids[0];
            if (!id) return;
            atualizar.mutate({ id: lancando.id, patch: { lancamento_id: id } });
            qc.invalidateQueries({ queryKey: ['lancamentos'] });
          }}
        />
      )}
    </div>
  );
}

const STATUS_COTACAO: Record<string, { rotulo: string; cor: string }> = {
  EM_ABERTO: { rotulo: 'Em aberto', cor: 'bg-slate-100 text-slate-600' },
  APROVADA: { rotulo: 'Aprovada', cor: 'bg-emerald-50 text-emerald-700' },
  REJEITADA: { rotulo: 'Rejeitada', cor: 'bg-rose-50 text-rose-700' },
};

function CotacaoCard({
  cotacao, trata, onAddItem, onDelItem, onAprovar, onStatus, onFornecedor, onLancar,
}: {
  cotacao: Cotacao;
  trata: boolean;
  onAddItem: (v: { cotacaoId: string; desc: string; qtd: number; unit: number }) => void;
  onDelItem: (id: string) => void;
  onAprovar: () => void;
  onStatus: (status: CotacoesPecasRow['status']) => void;
  onFornecedor: (id: string, rotulo: string) => void;
  onLancar: () => void;
}) {
  const [desc, setDesc] = useState('');
  const [qtd, setQtd] = useState(1);
  const [unit, setUnit] = useState<number | null>(null);
  const status = STATUS_COTACAO[cotacao.status] ?? { rotulo: cotacao.status, cor: '' };
  // Aprovada ou rejeitada a cotacao para de mudar: os itens sao o que foi decidido.
  const editavel = trata && cotacao.status === 'EM_ABERTO';

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-800">{cotacao.fornecedor_nome}</p>
          <span className={`rounded px-2 py-0.5 text-xs ${status.cor}`}>{status.rotulo}</span>
          {cotacao.lancamento_id && (
            <span className="inline-flex items-center gap-1 rounded bg-cyan-50 px-2 py-0.5 text-xs text-cyan-800">
              <CheckCircle2 className="h-3 w-3" /> Lançado no contas a pagar
            </span>
          )}
        </div>
        <span className="text-sm font-semibold text-brand-700">{formatCurrency(cotacao.valor_total)}</span>
      </div>

      {trata && !cotacao.fornecedor_id && cotacao.status !== 'REJEITADA' && (
        <div className="mb-2 max-w-md">
          <p className="mb-1 text-[11px] text-amber-700">Sem fornecedor cadastrado — vincule para lançar no contas a pagar:</p>
          <SeletorFornecedor value={null} onChange={onFornecedor} nomeSugerido={cotacao.fornecedor_nome} />
        </div>
      )}

      {trata && (
        <div className="mb-2 flex flex-wrap gap-2">
          {cotacao.status === 'EM_ABERTO' && (
            <>
              <button
                onClick={onAprovar}
                className="rounded border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50"
              >
                Aprovar
              </button>
              <button
                onClick={() => onStatus('REJEITADA')}
                className="rounded border border-rose-200 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50"
              >
                Rejeitar
              </button>
            </>
          )}
          {cotacao.status === 'APROVADA' && !cotacao.lancamento_id && (
            <button
              onClick={onLancar}
              className="inline-flex items-center gap-1 rounded border border-cyan-300 px-2 py-0.5 text-xs font-medium text-cyan-800 hover:bg-cyan-50"
            >
              <Receipt className="h-3.5 w-3.5" /> Lançar no contas a pagar
            </button>
          )}
          {cotacao.status !== 'EM_ABERTO' && !cotacao.lancamento_id && (
            <button
              onClick={() => onStatus('EM_ABERTO')}
              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3 w-3" /> Reabrir
            </button>
          )}
        </div>
      )}

      <table className="w-full text-sm">
        <tbody>
          {cotacao.itens_cotacao?.map((i) => (
            <tr key={i.id} className="border-t border-slate-100">
              <td className="py-1">{i.descricao_peca}</td>
              <td className="py-1 text-center text-slate-500">{i.quantidade}x</td>
              <td className="tnum py-1 text-right">{formatCurrency(i.valor_unitario)}</td>
              <td className="py-1 pl-2 text-right">
                {editavel && (
                  <button onClick={() => onDelItem(i.id)} aria-label="Remover item">
                    <Trash2 className="h-3.5 w-3.5 text-rose-400 hover:text-rose-600" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editavel && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Peça / serviço"
            className="min-w-[140px] flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs"
          />
          <input
            type="number"
            value={qtd}
            min={1}
            onChange={(e) => setQtd(Number(e.target.value))}
            className="w-16 rounded border border-slate-300 px-2 py-1.5 text-xs"
            aria-label="Quantidade"
          />
          <div className="w-32">
            <MoneyInput value={unit} onChange={setUnit} className="py-1 text-xs" aria-label="Valor unitário" />
          </div>
          <button
            onClick={() => {
              if (!desc.trim()) return toast.error('Informe a peça ou serviço');
              onAddItem({ cotacaoId: cotacao.id, desc, qtd: qtd > 0 ? qtd : 1, unit: unit ?? 0 });
              setDesc('');
              setQtd(1);
              setUnit(null);
            }}
            className="rounded bg-acao px-2 py-1.5 text-white"
            aria-label="Adicionar item"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
