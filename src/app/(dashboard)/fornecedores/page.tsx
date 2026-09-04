'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Pencil, Store, Search, LifeBuoy, Satellite } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFornecedores, type TipoFornecedor } from '@/hooks/use-fornecedores';
import {
  ModalFornecedor, formularioVazio, type FormFornecedor, type EnderecoFornecedor,
} from '@/components/fornecedores/modal-fornecedor';
import { formatarDocumento, formatarTelefone } from '@/lib/documento';
import { formatCurrency } from '@/lib/utils';
import type { FornecedoresRow } from '@/lib/database.types';

// Um cadastro so: fornecedor de pecas, prestador da 24h e rastreadora. Os
// filtros abaixo sao marcacoes na mesma tabela, nao telas diferentes (0051).
const ABAS: { id: TipoFornecedor; label: string; icon: React.ElementType }[] = [
  { id: 'todos', label: 'Todos', icon: Store },
  { id: 'geral', label: 'Pecas e servicos', icon: Store },
  { id: 'prestador', label: 'Prestadores 24h', icon: LifeBuoy },
  { id: 'rastreadora', label: 'Rastreadoras', icon: Satellite },
];

function Conteudo() {
  const params = useSearchParams();
  const inicial = (params.get('tipo') as TipoFornecedor) || 'todos';
  const [aba, setAba] = useState<TipoFornecedor>(ABAS.some((a) => a.id === inicial) ? inicial : 'todos');
  const [busca, setBusca] = useState('');
  const [edit, setEdit] = useState<FormFornecedor | null>(null);

  const { data: fornecedores, isLoading } = useFornecedores(aba);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return fornecedores ?? [];
    return (fornecedores ?? []).filter((f) =>
      f.razao_social.toLowerCase().includes(t)
      || (f.nome_fantasia ?? '').toLowerCase().includes(t)
      || (f.documento ?? '').includes(t.replace(/\D/g, ''))
      || (f.cobertura ?? '').toLowerCase().includes(t),
    );
  }, [fornecedores, busca]);

  function editar(f: FornecedoresRow) {
    setEdit({ ...f, endereco: (f.endereco as EnderecoFornecedor) ?? {} });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Fornecedores</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Quem presta servico para a associacao: oficina e pecas, prestador da Assistencia 24h e
            empresa de rastreamento. Um cadastro so — o tipo e uma marcacao na ficha.
          </p>
        </div>
        <Button onClick={() => setEdit(formularioVazio(
          aba === 'prestador' ? 'prestador' : aba === 'rastreadora' ? 'rastreadora' : undefined,
        ))}>
          <Plus className="h-4 w-4" /> Novo fornecedor
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
              aba === a.id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <a.icon className="h-4 w-4" /> {a.label}
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, documento ou cobertura"
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Fornecedor</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Documento</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Ativo</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {filtrados.map((f) => (
              <tr key={f.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">
                  {f.nome_fantasia?.trim() || f.razao_social}
                  {f.nome_fantasia?.trim() && <span className="block text-xs text-slate-400">{f.razao_social}</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {f.prestador_assistencia && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        <LifeBuoy className="h-3 w-3" /> 24h
                      </span>
                    )}
                    {f.empresa_rastreamento && (
                      <span className="inline-flex items-center gap-1 rounded bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
                        <Satellite className="h-3 w-3" /> Rastreadora
                      </span>
                    )}
                    {!f.prestador_assistencia && !f.empresa_rastreamento && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Pecas / servicos</span>
                    )}
                  </div>
                  {f.empresa_rastreamento && Number(f.custo_mensal_equipamento ?? 0) > 0 && (
                    <span className="block text-[11px] text-slate-400">
                      {formatCurrency(Number(f.custo_mensal_equipamento))} por equipamento/mes
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-slate-600">
                  {f.documento ? formatarDocumento(f.documento, f.tipo_pessoa) : '—'}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {[f.contato, f.telefone ? formatarTelefone(f.telefone) : null].filter(Boolean).join(' · ')
                    || f.email || '—'}
                  {f.cobertura && <span className="block text-[11px] text-slate-400">{f.cobertura}</span>}
                </td>
                <td className="px-4 py-2">
                  {f.ativo ? <span className="text-emerald-600">Sim</span> : <span className="text-slate-400">Nao</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => editar(f)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && filtrados.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nenhum fornecedor nesta lista.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <ModalFornecedor aberto inicial={edit} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

export default function FornecedoresPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Carregando...</p>}>
      <Conteudo />
    </Suspense>
  );
}
