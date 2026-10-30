'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, PercentInput } from '@/components/ui/field';
import {
  usePlanos, useProdutos, usePlanoProdutos, useSavePlano, useDeletePlano, useTiposVeiculo, useTiposPorProduto,
  useTiposPorPlano, useSugestoesPorPlano,
} from '@/hooks/use-precificacao';
import { rotuloTiposDoProduto } from '@/lib/produtos';
import { selosDoPlano, validarRegrasDoPlano } from '@/lib/planos';
import type { PlanosProtecaoRow } from '@/lib/database.types';

interface Edicao {
  id?: string;
  nome: string;
  descricao_comercial: string;
  nivel: number;
  ativo: boolean;
  semCasco: boolean;
  descontoBase: number;
  multiplicador: number;
  produtosIds: Set<string>;
  /** 0162 — vazio = todos os tipos. */
  tiposIds: Set<string>;
  /** 0162 — opcionais que ja vem marcados na cotacao (removiveis). */
  sugestoesIds: Set<string>;
}

export default function PlanosPage() {
  const { data: planos, isLoading } = usePlanos();
  const { data: produtos } = useProdutos();
  const { data: tipos } = useTiposVeiculo();
  const { data: tiposPorProduto } = useTiposPorProduto();
  const { data: tiposPorPlano } = useTiposPorPlano();
  const { data: sugestoesPorPlano } = useSugestoesPorPlano();
  const nomeDoTipo = (id: string) => (tipos ?? []).find((t) => t.id === id)?.nome;
  const salvar = useSavePlano();
  const excluir = useDeletePlano();

  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState<Edicao | null>(null);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const { data: vinculos } = usePlanoProdutos(editId);

  // Ao abrir edicao de um plano existente, carrega os produtos vinculados.
  useEffect(() => {
    if (editId && vinculos && ed && ed.id === editId) {
      setEd((e) => (e ? { ...e, produtosIds: new Set(vinculos) } : e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinculos, editId]);

  // Opcionais disponiveis para compor um combo (produtos nao-obrigatorios ativos).
  const opcionais = (produtos ?? []).filter((p) => !p.obrigatorio && p.status);

  function novo() {
    setEditId(undefined);
    setEd({ nome: '', descricao_comercial: '', nivel: (planos?.length ?? 0) + 1, ativo: true, semCasco: false, descontoBase: 0, multiplicador: 1, produtosIds: new Set(), tiposIds: new Set(), sugestoesIds: new Set() });
    setAberto(true);
  }

  function editar(p: PlanosProtecaoRow) {
    setEditId(p.id);
    setEd({
      id: p.id,
      nome: p.nome,
      descricao_comercial: p.descricao_comercial ?? '',
      nivel: p.nivel ?? 0,
      ativo: p.ativo,
      semCasco: p.sem_casco ?? false,
      descontoBase: Number(p.desconto_base_percentual ?? 0),
      multiplicador: Number(p.multiplicador_participacao ?? 1),
      produtosIds: new Set(),
      tiposIds: new Set(tiposPorPlano?.[p.id] ?? []),
      sugestoesIds: new Set(sugestoesPorPlano?.[p.id] ?? []),
    });
    setAberto(true);
  }

  function toggleProduto(id: string) {
    setEd((e) => {
      if (!e) return e;
      const n = new Set(e.produtosIds);
      const sug = new Set(e.sugestoesIds);
      if (n.has(id)) n.delete(id); else { n.add(id); sug.delete(id); }
      return { ...e, produtosIds: n, sugestoesIds: sug };
    });
  }

  function toggleSugestao(id: string) {
    setEd((e) => {
      if (!e) return e;
      const n = new Set(e.sugestoesIds);
      const inc = new Set(e.produtosIds);
      if (n.has(id)) n.delete(id); else { n.add(id); inc.delete(id); }
      return { ...e, sugestoesIds: n, produtosIds: inc };
    });
  }

  function toggleTipo(id: string) {
    setEd((e) => {
      if (!e) return e;
      const n = new Set(e.tiposIds);
      if (n.has(id)) n.delete(id); else n.add(id);
      return { ...e, tiposIds: n };
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.nome.trim()) return toast.error('Informe o nome do plano');
    const erroRegra = validarRegrasDoPlano(ed.descontoBase, ed.multiplicador);
    if (erroRegra) return toast.error(erroRegra);
    salvar.mutate(
      {
        id: ed.id,
        nome: ed.nome,
        descricao_comercial: ed.descricao_comercial || null,
        nivel: ed.nivel,
        ativo: ed.ativo,
        sem_casco: ed.semCasco,
        desconto_base_percentual: ed.descontoBase,
        multiplicador_participacao: ed.multiplicador,
        produtosIds: [...ed.produtosIds],
        tiposIds: [...ed.tiposIds],
        sugestoesIds: [...ed.sugestoesIds],
      },
      {
        onSuccess: () => { toast.success('Plano salvo'); setAberto(false); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function remover(p: PlanosProtecaoRow) {
    if (!confirm(`Excluir o plano "${p.nome}"?`)) return;
    excluir.mutate(p.id, {
      onSuccess: () => toast.success('Plano excluído'),
      onError: (err) => toast.error(err.message),
    });
  }

  const nomeProduto = (id: string) => (produtos ?? []).find((p) => p.id === id)?.nome ?? '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-sm text-slate-500">
          Planos comerciais, cada um oferecido aos tipos de veículo marcados. Todo plano já inclui a cotação base
          (casco + taxa admin + assistência 24h + rastreador se aplicável); aqui você amarra os
          opcionais que compõem cada nível. Plano marcado como <strong>sem proteção de casco</strong>{' '}
          (ex.: só terceiros, rastreamento) não leva o casco da base. O plano pode ter{' '}
          <strong>desconto na base</strong> e <strong>participação multiplicada</strong> (ex.: Econômico).
        </p>
        <Button onClick={novo}><Plus className="h-4 w-4" /> Novo Plano</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}
        {(planos ?? []).map((p) => (
          <PlanoCard key={p.id} plano={p} onEdit={() => editar(p)} onDelete={() => remover(p)} />
        ))}
        {!isLoading && (planos ?? []).length === 0 && (
          <p className="text-sm text-slate-400">Nenhum plano cadastrado.</p>
        )}
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={ed?.id ? 'Editar Plano' : 'Novo Plano'} tamanho="lg">
        {ed && (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <FormField label="Nome do plano *">
                  <Input value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} placeholder="Ex.: Plano Ouro" />
                </FormField>
              </div>
              <FormField label="Nível (ordem)">
                <Input type="number" value={ed.nivel} onChange={(e) => setEd({ ...ed, nivel: Number(e.target.value) || 0 })} />
              </FormField>
            </div>
            <FormField label="Descrição comercial">
              <textarea
                value={ed.descricao_comercial}
                onChange={(e) => setEd({ ...ed, descricao_comercial: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Texto exibido na proposta"
              />
            </FormField>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-600">Oferecido para</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-slate-200 p-2">
                {(tipos ?? []).map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={ed.tiposIds.has(t.id)} onChange={() => toggleTipo(t.id)}
                      className="h-4 w-4 rounded border-slate-300" />
                    {t.nome}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {ed.tiposIds.size === 0
                  ? 'Nenhum marcado: o plano aparece para TODOS os tipos de veículo (carro, moto e pesado).'
                  : 'A cotação só oferece este plano para os tipos marcados (sem plano de moto para carro, e vice-versa).'}
              </p>
            </div>

            <div>
              <div className="mb-1 flex items-end justify-between gap-2">
                <p className="text-sm font-medium text-slate-600">Opcionais do plano</p>
                <p className="text-[11px] text-slate-400"><b>Incluso</b> = faz parte do plano · <b>Pré-marcado</b> = já vem marcado, o cliente pode tirar ou trocar</p>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {opcionais.length === 0 && <p className="p-2 text-xs text-slate-400">Nenhum opcional cadastrado em Produtos.</p>}
                {opcionais.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                    <span className="flex min-w-0 items-center gap-2 text-slate-700">
                      {p.nome}
                      <span className="rounded bg-slate-100 px-1.5 text-[10px] uppercase text-slate-500">{p.categoria}</span>
                      {tiposPorProduto?.[p.id]?.length ? (
                        <span className="text-[11px] text-slate-500">só {rotuloTiposDoProduto(p.id, tiposPorProduto, nomeDoTipo)}</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-3">
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input type="checkbox" checked={ed.produtosIds.has(p.id)} onChange={() => toggleProduto(p.id)}
                          className="h-4 w-4 rounded border-slate-300" />
                        Incluso
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input type="checkbox" checked={ed.sugestoesIds.has(p.id)} onChange={() => toggleSugestao(p.id)}
                          className="h-4 w-4 rounded border-slate-300" />
                        Pré-marcado
                      </label>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                A cotação base entra automaticamente. O <b>pré-marcado</b> entra no preço como opcional e o
                consultor (ou o cliente) tira ou troca na hora — marcar &quot;Parabrisa&quot; troca o &quot;Vidros
                completo&quot;, uma faixa de terceiros troca a outra. Cada veículo só leva o opcional que atende o tipo dele.
              </p>
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={ed.semCasco}
                onChange={(e) => setEd({ ...ed, semCasco: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="font-medium text-slate-700">Sem proteção de casco</span>
                <span className="block text-xs text-slate-500">
                  O casco da cotação base sai do preço e da ficha do SAC. Use para planos só de
                  terceiros, rastreamento ou assistência. Taxa administrativa, assistência 24h e a
                  regra do rastreador continuam.
                </span>
              </span>
            </label>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">Desconto e participação do plano</p>
              <p className="mb-2 text-xs text-slate-500">
                Para planos como o Econômico: desconto sobre os itens obrigatórios da base (taxa
                administrativa, assistência 24h e proteção do casco) em troca de uma participação
                maior no evento. A regra do rastreador, o adicional da unidade e os opcionais não
                têm desconto.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Desconto na base (%)">
                  <PercentInput value={ed.descontoBase} max={90}
                    onChange={(v) => setEd({ ...ed, descontoBase: v ?? 0 })} />
                </FormField>
                <FormField label="Participação no evento">
                  <select value={String(ed.multiplicador)}
                    onChange={(e) => setEd({ ...ed, multiplicador: Number(e.target.value) })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    {[1, 1.5, 2, 2.5, 3].map((m) => (
                      <option key={m} value={m}>
                        {m === 1 ? 'Normal (a do veículo)' : `${m.toLocaleString('pt-BR')}x a do veículo`}
                      </option>
                    ))}
                    {![1, 1.5, 2, 2.5, 3].includes(ed.multiplicador) && (
                      <option value={ed.multiplicador}>{ed.multiplicador.toLocaleString('pt-BR')}x a do veículo</option>
                    )}
                  </select>
                </FormField>
              </div>
              {ed.multiplicador !== 1 && (
                <p className="mt-2 text-xs text-slate-500">
                  Exemplo: veículo com cota de 5% da FIPE passa a ter{' '}
                  {(5 * ed.multiplicador).toLocaleString('pt-BR')}% neste plano.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={ed.ativo} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Ativo
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function PlanoCard({ plano, onEdit, onDelete }: { plano: PlanosProtecaoRow; onEdit: () => void; onDelete: () => void }) {
  const { data: vinculos } = usePlanoProdutos(plano.id);
  const { data: produtos } = useProdutos();
  const { data: tipos } = useTiposVeiculo();
  const { data: tiposPorPlano } = useTiposPorPlano();
  const { data: sugestoesPorPlano } = useSugestoesPorPlano();
  const nomes = (vinculos ?? []).map((id) => (produtos ?? []).find((p) => p.id === id)?.nome).filter(Boolean);
  const tiposDoPlano = (tiposPorPlano?.[plano.id] ?? []).map((id) => (tipos ?? []).find((t) => t.id === id)?.nome).filter(Boolean);
  const premarcados = (sugestoesPorPlano?.[plano.id] ?? []).map((id) => (produtos ?? []).find((p) => p.id === id)?.nome).filter(Boolean);
  return (
    <div className="rounded-xl border border-slate-200 bg-superficie p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand-500" />
          <h3 className="font-semibold text-slate-800">{plano.nome}</h3>
          {!plano.ativo && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">inativo</span>}
          {plano.sem_casco && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-800">sem casco</span>}
          {selosDoPlano(plano).map((s) => (
            <span key={s} className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] uppercase text-cyan-700">{s}</span>
          ))}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
          <button onClick={onDelete} className="rounded p-1.5 text-rose-400 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {plano.descricao_comercial && <p className="mt-1 text-xs text-slate-500">{plano.descricao_comercial}</p>}
      {tiposDoPlano.length ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Para: <b>{tiposDoPlano.join(', ')}</b>
        </p>
      ) : (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          Oferecido para <b>todos os tipos</b> de veículo. Edite e marque <b>Oferecido para</b> para
          o plano não aparecer na cotação de carro, moto e pesado ao mesmo tempo.
        </p>
      )}
      {premarcados.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase text-slate-400">Pré-marcados (removíveis)</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {premarcados.map((n) => (
              <li key={n} className="rounded bg-cyan-50 px-2 py-0.5 text-xs text-cyan-700">{n}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3">
        <p className="text-[10px] font-medium uppercase text-slate-400">Opcionais</p>
        {nomes.length === 0 ? (
          <p className="text-xs text-slate-400">{plano.sem_casco ? 'Somente cotação base, sem o casco.' : 'Somente cotação base.'}</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-1">
            {nomes.map((n) => (
              <li key={n} className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{n}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
