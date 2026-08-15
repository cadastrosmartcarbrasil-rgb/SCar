'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { PlayCircle, Send, Landmark, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import { useAssociados } from '@/hooks/use-associados';
import { useVeiculos } from '@/hooks/use-veiculos';
import {
  useGerarLotePeriodo, useEnviarRemessa, useRemessas, useRemessaItens,
  type GeracaoLoteResultado,
} from '@/hooks/use-cobrancas';
import { rotuloCompetencia } from '@/lib/cobranca';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { StatusRemessa } from '@/lib/database.types';

type Escopo = 'todos' | 'associado' | 'veiculos';

const REMESSA_COR: Record<StatusRemessa, string> = {
  PENDENTE: 'bg-slate-100 text-slate-600',
  PROCESSANDO: 'bg-sky-50 text-sky-700',
  CONCLUIDA: 'bg-emerald-50 text-emerald-700',
  PARCIAL: 'bg-amber-50 text-amber-700',
  ERRO: 'bg-rose-50 text-rose-700',
};

const mesAtual = () => new Date().toISOString().slice(0, 7);

export function GeracaoLote() {
  const [competencia, setCompetencia] = useState(mesAtual);
  const [meses, setMeses] = useState(6);
  const [escopo, setEscopo] = useState<Escopo>('todos');
  const [clienteId, setClienteId] = useState('');
  const [veiculoIds, setVeiculoIds] = useState<string[]>([]);
  const [regionalId, setRegionalId] = useState('');
  const [emitirTitulos, setEmitirTitulos] = useState(true);
  const [resultado, setResultado] = useState<GeracaoLoteResultado | null>(null);

  const { data: regionais } = useRegionais();
  const { data: associados } = useAssociados();
  const { data: veiculos } = useVeiculos(escopo === 'veiculos' ? clienteId || undefined : undefined);
  const gerar = useGerarLotePeriodo();
  const enviar = useEnviarRemessa();

  function processar() {
    if (escopo === 'associado' && !clienteId) return toast.error('Selecione o associado');
    if (escopo === 'veiculos' && veiculoIds.length === 0) return toast.error('Selecione ao menos um veiculo');
    gerar.mutate(
      {
        competencia,
        meses,
        cliente_id: escopo === 'associado' ? clienteId : null,
        veiculo_ids: escopo === 'veiculos' ? veiculoIds : null,
        regional_id: regionalId || null,
        emitir_titulos: emitirTitulos,
      },
      {
        onSuccess: (r) => {
          setResultado(r);
          toast.success(
            r.total_faturas > 0
              ? `${r.total_faturas} fatura(s) em ${meses} competencia(s) — ${formatCurrency(r.total_valor)}`
              : 'Nada novo a gerar: o periodo ja estava boletado',
          );
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function enviarBanco() {
    enviar.mutate(
      { competencia, regional_id: regionalId || null },
      {
        onSuccess: (r) =>
          toast.success(
            r.enviados > 0
              ? `Remessa ${r.provedor}: ${r.enviados} titulo(s) registrados${r.erros ? `, ${r.erros} com erro` : ''}`
              : (r.mensagem ?? 'Nenhum titulo pendente de envio'),
          ),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Boletagem recorrente</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Gera as faturas e os titulos de varias competencias de uma vez (ex.: proximos 6 meses).
          A rotina e idempotente: competencia ja boletada nao e recriada.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Competencia inicial">
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value || mesAtual())} />
          </FormField>
          <FormField label="Quantidade de meses">
            <Select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
              {[1, 2, 3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>{m} {m === 1 ? 'mes' : 'meses'}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Escopo">
            <Select
              value={escopo}
              onChange={(e) => { setEscopo(e.target.value as Escopo); setVeiculoIds([]); }}
            >
              <option value="todos">Toda a base</option>
              <option value="associado">Um associado</option>
              <option value="veiculos">Grupo de veiculos</option>
            </Select>
          </FormField>
          <FormField label="Regional">
            <Select value={regionalId} onChange={(e) => setRegionalId(e.target.value)}>
              <option value="">Todas</option>
              {(regionais ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </Select>
          </FormField>
        </div>

        {(escopo === 'associado' || escopo === 'veiculos') && (
          <div className="mt-3">
            <FormField label="Associado">
              <Select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setVeiculoIds([]); }}>
                <option value="">Selecione...</option>
                {(associados ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.nome_razao_social} — {a.cpf_cnpj}</option>
                ))}
              </Select>
            </FormField>
          </div>
        )}

        {escopo === 'veiculos' && clienteId && (
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Veiculos do associado</p>
            <div className="grid gap-1 md:grid-cols-2 lg:grid-cols-3">
              {(veiculos ?? []).map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={veiculoIds.includes(v.id)}
                    onChange={(e) =>
                      setVeiculoIds((ids) => (e.target.checked ? [...ids, v.id] : ids.filter((x) => x !== v.id)))
                    }
                  />
                  <span className="font-medium">{v.placa}</span>
                  <span className="text-slate-400">{v.modelo ?? ''}</span>
                </label>
              ))}
              {(veiculos ?? []).length === 0 && <p className="text-sm text-slate-400">Nenhum veiculo.</p>}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={emitirTitulos} onChange={(e) => setEmitirTitulos(e.target.checked)} />
            Emitir os titulos financeiros (base do boleto) junto
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={enviarBanco} disabled={enviar.isPending}>
              <Send className="h-4 w-4" /> {enviar.isPending ? 'Enviando...' : 'Enviar lote ao banco'}
            </Button>
            <Button onClick={processar} disabled={gerar.isPending}>
              <PlayCircle className="h-4 w-4" /> {gerar.isPending ? 'Processando...' : 'Processar boletagem'}
            </Button>
          </div>
        </div>
      </div>

      {resultado && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-2">Competencia</th>
                <th className="px-4 py-2 text-right">Associados</th>
                <th className="px-4 py-2 text-right">Faturas</th>
                <th className="px-4 py-2 text-right">Valor</th>
                <th className="px-4 py-2 text-right">Titulos emitidos</th>
              </tr>
            </thead>
            <tbody>
              {resultado.periodos.map((p) => {
                const t = resultado.titulos.find((x) => x.competencia === p.competencia);
                return (
                  <tr key={p.competencia} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2 font-medium text-slate-700">{rotuloCompetencia(p.competencia)}</td>
                    <td className="tnum px-4 py-2 text-right text-slate-600">{p.associados}</td>
                    <td className="tnum px-4 py-2 text-right text-slate-600">{p.faturas_geradas}</td>
                    <td className="tnum px-4 py-2 text-right">{formatCurrency(Number(p.valor_total))}</td>
                    <td className="tnum px-4 py-2 text-right text-slate-600">{t?.titulos_emitidos ?? '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Remessas />
    </div>
  );
}

// Historico das remessas enviadas ao banco (fila de integracao).
function Remessas() {
  const { data: remessas, isLoading } = useRemessas();
  const [aberta, setAberta] = useState<string | null>(null);
  const { data: itens } = useRemessaItens(aberta);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <Landmark className="h-4 w-4 text-brand-700" />
        <h2 className="text-base font-semibold text-slate-900">Remessas bancarias</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Referencia</th>
              <th className="px-4 py-2">Enviada em</th>
              <th className="px-4 py-2 text-right">Titulos</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {!isLoading && (remessas ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nenhuma remessa enviada ainda.</td></tr>
            )}
            {(remessas ?? []).map((r) => (
              <tr
                key={r.id}
                onClick={() => setAberta(aberta === r.id ? null : r.id)}
                className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-2 text-slate-700">{r.referencia ?? '-'}</td>
                <td className="px-4 py-2 text-slate-600">{r.enviado_em ? formatDate(r.enviado_em) : '-'}</td>
                <td className="tnum px-4 py-2 text-right text-slate-600">{r.total_titulos}</td>
                <td className="tnum px-4 py-2 text-right">{formatCurrency(Number(r.total_valor))}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${REMESSA_COR[r.status]}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aberta && (
        <div className="border-t border-slate-100 px-5 py-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Itens da remessa</p>
          <ul className="space-y-1 text-sm">
            {(itens ?? []).map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-slate-600">
                {i.status === 'CONFIRMADO' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : i.status === 'ERRO' ? (
                  <XCircle className="h-3.5 w-3.5 text-rose-600" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                )}
                <span className="font-mono text-xs">{i.titulo_id.slice(0, 8)}</span>
                <span>{i.status}</span>
                {i.erro && <span className="text-rose-600">— {i.erro}</span>}
              </li>
            ))}
            {(itens ?? []).length === 0 && <li className="text-slate-400">Sem itens.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
