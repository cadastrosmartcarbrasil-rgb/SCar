'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { useProdutos, useSaveProduto } from '@/hooks/use-precificacao';
import { formatCurrency } from '@/lib/utils';
import type { ProdutosRow, MetodoPreco } from '@/lib/database.types';

const METODOS: { v: MetodoPreco; l: string }[] = [
  { v: 'FIXO', l: 'Valor fixo' },
  { v: 'FAIXA_FIPE', l: 'Por faixa FIPE (matriz)' },
  { v: 'PERCENTUAL_FIPE', l: 'Percentual da FIPE' },
];
const CATEGORIAS = ['ADMIN', 'CASCO', 'RASTREADOR', 'BENEFICIO'];

export default function ProdutosPage() {
  const { data: produtos, isLoading } = useProdutos();
  const salvar = useSaveProduto();
  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState<Partial<ProdutosRow> | null>(null);

  function novo() {
    setEd({ nome: '', fornecedor_nome: 'Interno', metodo_preco: 'FIXO', categoria: 'BENEFICIO', obrigatorio: false, status: true });
    setAberto(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.nome) return toast.error('Informe o nome');
    salvar.mutate(ed, {
      onSuccess: () => {
        toast.success('Produto salvo');
        setAberto(false);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  const preco = (p: ProdutosRow) =>
    p.metodo_preco === 'FIXO'
      ? formatCurrency(p.valor_fixo ?? 0)
      : p.metodo_preco === 'PERCENTUAL_FIPE'
        ? `${((p.percentual ?? 0) * 100).toFixed(2)}% FIPE`
        : 'Matriz FIPE';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Produtos/beneficios que compoem a mensalidade. Itens obrigatorios entram na cota base;
          opcionais sao adicionais.
        </p>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Novo Produto
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Produto</th>
              <th className="px-4 py-2">Categoria</th>
              <th className="px-4 py-2">Fornecedor</th>
              <th className="px-4 py-2">Preco</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {(produtos ?? []).map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <Package className="h-4 w-4 text-brand-500" /> {p.nome}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{p.categoria}</td>
                <td className="px-4 py-2 text-slate-600">{p.fornecedor_nome}</td>
                <td className="px-4 py-2 text-slate-600">{preco(p)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${p.obrigatorio ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                    {p.obrigatorio ? 'Base' : 'Opcional'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => {
                      setEd(p);
                      setAberto(true);
                    }}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && (produtos ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhum produto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={ed?.id ? 'Editar Produto' : 'Novo Produto'}>
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Nome *">
            <Input value={ed?.nome ?? ''} onChange={(e) => setEd((p) => ({ ...p, nome: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Categoria">
              <Select value={ed?.categoria ?? 'BENEFICIO'} onChange={(e) => setEd((p) => ({ ...p, categoria: e.target.value }))}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Fornecedor">
              <Input value={ed?.fornecedor_nome ?? ''} onChange={(e) => setEd((p) => ({ ...p, fornecedor_nome: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Metodo de preco">
            <Select value={ed?.metodo_preco ?? 'FIXO'} onChange={(e) => setEd((p) => ({ ...p, metodo_preco: e.target.value as MetodoPreco }))}>
              {METODOS.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.l}
                </option>
              ))}
            </Select>
          </FormField>
          {ed?.metodo_preco === 'FIXO' && (
            <FormField label="Valor fixo (R$)">
              <Input type="number" step="0.01" value={ed?.valor_fixo ?? ''} onChange={(e) => setEd((p) => ({ ...p, valor_fixo: Number(e.target.value) || null }))} />
            </FormField>
          )}
          {ed?.metodo_preco === 'PERCENTUAL_FIPE' && (
            <FormField label="Percentual da FIPE (ex.: 0.04 = 4%)">
              <Input type="number" step="0.0001" value={ed?.percentual ?? ''} onChange={(e) => setEd((p) => ({ ...p, percentual: Number(e.target.value) || null }))} />
            </FormField>
          )}
          {ed?.metodo_preco === 'FAIXA_FIPE' && (
            <p className="rounded bg-sky-50 p-2 text-xs text-sky-700">
              Os valores por faixa FIPE ficam na matriz de precos (importada da planilha).
            </p>
          )}
          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={ed?.obrigatorio ?? false} onChange={(e) => setEd((p) => ({ ...p, obrigatorio: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
              Item base (obrigatorio)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={ed?.status ?? true} onChange={(e) => setEd((p) => ({ ...p, status: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
              Ativo
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
