'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { FormField, Input, Select } from '@/components/ui/field';
import { useAcionamentos } from '@/hooks/use-assistencia';
import { STATUS_ACIONAMENTO_LABEL } from '@/lib/assistencia';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { StatusAcionamento } from '@/lib/database.types';
import { OrdemServico } from './painel-acionamento';

// Operacao: todos os acionamentos, com filtro por status e busca por
// protocolo/OS/placa/associado. Clicar abre a OS completa.
export function AcionamentosLista() {
  const [status, setStatus] = useState<StatusAcionamento | ''>('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const { data: lista, isLoading } = useAcionamentos({ status: status || null, busca });

  if (aberto) return <OrdemServico acionamentoId={aberto} onVoltar={() => setAberto(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label="Buscar">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Protocolo, OS, placa ou associado"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </FormField>
        <FormField label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusAcionamento | '')}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_ACIONAMENTO_LABEL) as StatusAcionamento[]).map((s) => (
              <option key={s} value={s}>{STATUS_ACIONAMENTO_LABEL[s].label}</option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Protocolo / OS</th>
              <th className="px-4 py-2">Servico</th>
              <th className="px-4 py-2">Veiculo</th>
              <th className="px-4 py-2">Associado</th>
              <th className="px-4 py-2">Prestador</th>
              <th className="px-4 py-2">Aberto em</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {!isLoading && (lista ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nenhum acionamento.</td></tr>
            )}
            {(lista ?? []).map((a) => (
              <tr
                key={a.id}
                onClick={() => setAberto(a.id)}
                className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  {a.protocolo}
                  {a.codigo_os && <span className="block text-slate-400">{a.codigo_os}</span>}
                </td>
                <td className="px-4 py-2 text-slate-700">{a.servicos_assistencia?.descricao}</td>
                <td className="px-4 py-2 font-medium text-slate-700">{a.veiculos?.placa}</td>
                <td className="px-4 py-2 text-slate-600">{a.clientes?.nome_razao_social}</td>
                <td className="px-4 py-2 text-slate-600">{a.fornecedores?.razao_social ?? '-'}</td>
                <td className="px-4 py-2 text-slate-500">{formatDate(a.created_at)}</td>
                <td className="tnum px-4 py-2 text-right">{formatCurrency(Number(a.valor_total))}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_ACIONAMENTO_LABEL[a.status].cor}`}>
                    {STATUS_ACIONAMENTO_LABEL[a.status].label}
                  </span>
                  {a.liberado_por && (
                    <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">liberado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
