'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, UserRound, Search, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useRegionais } from '@/hooks/use-config';
import { useAssociadosPagina, useExcluirAssociado } from '@/hooks/use-associados';
import { AssociadoForm, novoAssociadoVazio } from '@/components/associados/associado-form';
import { formatarDocumento } from '@/lib/documento';
import { Paginador } from '@/components/ui/paginador';
import { useAdiado } from '@/hooks/use-adiado';
import type { StatusCliente } from '@/lib/database.types';
import { SePode } from '@/components/layout/se-pode';

const SITUACAO_COR: Record<string, string> = {
  ativo: 'bg-emerald-50 text-emerald-700',
  inativo: 'bg-slate-100 text-slate-600',
  suspenso: 'bg-amber-50 text-amber-700',
  excluido: 'bg-rose-50 text-rose-700',
  inadimplente: 'bg-orange-50 text-orange-700',
  cancelado: 'bg-slate-100 text-slate-500',
};
const cor = (s: StatusCliente) => SITUACAO_COR[s] ?? 'bg-slate-100 text-slate-600';

export default function AssociadosPage() {
  const router = useRouter();
  const { data: regionais } = useRegionais();
  const excluir = useExcluirAssociado();

  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);

  const nomesRegionais = useMemo(() => new Map((regionais ?? []).map((r) => [r.id, r.nome])), [regionais]);

  // Uma pagina por vez, ja filtrada no banco (busca-cadastro.ts) — antes a tela
  // baixava os 5.500 associados para filtrar aqui.
  const [pagina, setPagina] = useState(0);
  const buscaAdiada = useAdiado(busca);
  useEffect(() => { setPagina(0); }, [buscaAdiada]);
  const lista = useAssociadosPagina(buscaAdiada, pagina);
  const isLoading = lista.isLoading;
  const filtrados = lista.data?.linhas ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Associados</h1>
          <p className="text-sm text-slate-500">Clique em um associado para abrir o painel completo.</p>
        </div>
        <SePode chave="associados.criar">
        <Button onClick={() => setAberto(true)}>
          <Plus className="h-4 w-4" /> Novo Associado
        </Button>
        </SePode>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, CPF/CNPJ ou matricula"
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Matricula</th>
              <th className="px-4 py-2">Nome / Razao Social</th>
              <th className="px-4 py-2">CPF / CNPJ</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Regional</th>
              <th className="px-4 py-2">Situacao</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {filtrados.map((a) => (
              <tr
                key={a.id}
                onClick={() => router.push(`/associados/${a.id}`)}
                className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-2 font-mono text-xs text-brand-600">{a.matricula ?? '-'}</td>
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-brand-500" /> {a.nome_razao_social}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {a.cpf_cnpj ? formatarDocumento(a.cpf_cnpj, a.tipo_pessoa) : '-'}
                </td>
                <td className="px-4 py-2 text-slate-600">{a.celular || a.telefone || a.email || '-'}</td>
                <td className="px-4 py-2 text-slate-600">{a.regional_id ? nomesRegionais.get(a.regional_id) ?? '-' : '-'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs capitalize ${cor(a.status)}`}>{a.status}</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <SePode chave="associados.excluir">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Excluir o associado "${a.nome_razao_social}"?`))
                          excluir.mutate(a.id, {
                            onSuccess: () => toast.success('Associado excluido'),
                            onError: (er) => toast.error((er as Error).message),
                          });
                      }}
                      className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    </SePode>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Nenhum associado encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Paginador pagina={pagina} total={lista.data?.total ?? 0} onPagina={setPagina}
          carregando={lista.isFetching && !lista.isLoading} />
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Novo Associado" tamanho="xl">
        <AssociadoForm
          initial={novoAssociadoVazio()}
          onCancel={() => setAberto(false)}
          onSaved={() => setAberto(false)}
        />
      </Modal>
    </div>
  );
}
