'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Receipt, PlayCircle, FileText, Ban, ChevronDown, ChevronRight, Barcode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import {
  useFaturas, useFaturaItens, useGerarFaturas, useEmitirTitulos, useEmitirTituloFatura,
  useCancelarFatura, type FaturaComRel,
} from '@/hooks/use-cobrancas';
import { competenciaDe, rotuloCompetencia } from '@/lib/cobranca';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { StatusFatura } from '@/lib/database.types';

const STATUS_COR: Record<StatusFatura, string> = {
  ABERTA: 'bg-amber-50 text-amber-700',
  PAGA: 'bg-emerald-50 text-emerald-700',
  CANCELADA: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL: Record<StatusFatura, string> = {
  ABERTA: 'Em aberto', PAGA: 'Paga', CANCELADA: 'Cancelada',
};

const mesAtual = () => new Date().toISOString().slice(0, 7);

export function Cobrancas() {
  const [mes, setMes] = useState(mesAtual);
  const [regionalId, setRegionalId] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<StatusFatura | ''>('');
  const [gerando, setGerando] = useState(false);
  const [expandida, setExpandida] = useState<string | null>(null);

  const competencia = competenciaDe(mes);
  const { data: regionais } = useRegionais();
  const { data: faturas, isLoading } = useFaturas({
    competencia,
    regionalId: regionalId || null,
    status: statusFiltro || null,
  });
  const gerar = useGerarFaturas();
  const emitirLote = useEmitirTitulos();
  const emitirUma = useEmitirTituloFatura();
  const cancelar = useCancelarFatura();

  const kpis = useMemo(() => {
    const l = faturas ?? [];
    const soma = (f: FaturaComRel[]) => f.reduce((s, x) => s + Number(x.valor_total ?? 0), 0);
    const abertas = l.filter((f) => f.status === 'ABERTA');
    return {
      qtd: l.length,
      total: soma(l.filter((f) => f.status !== 'CANCELADA')),
      aberto: soma(abertas),
      pago: soma(l.filter((f) => f.status === 'PAGA')),
      semTitulo: abertas.filter((f) => !f.titulo_id).length,
    };
  }, [faturas]);

  function gerarLote() {
    gerar.mutate(
      { competencia, regionalId: regionalId || null },
      {
        onSuccess: (r) => {
          setGerando(false);
          toast.success(
            r.faturas_geradas > 0
              ? `${r.faturas_geradas} fatura(s) geradas — ${formatCurrency(r.valor_total)} (${r.associados} associados)`
              : 'Nenhuma fatura nova: a competencia ja estava gerada',
          );
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function emitirTitulosLote() {
    emitirLote.mutate(
      { competencia, regionalId: regionalId || null },
      {
        onSuccess: (r) =>
          toast.success(
            r.titulos_emitidos > 0
              ? `${r.titulos_emitidos} titulo(s) emitidos — ${formatCurrency(r.valor_total)}`
              : 'Nenhuma fatura aberta sem titulo',
          ),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros + acoes do lote */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Competencia">
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value || mesAtual())} />
          </FormField>
          <FormField label="Regional">
            <Select value={regionalId} onChange={(e) => setRegionalId(e.target.value)}>
              <option value="">Todas</option>
              {(regionais ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as StatusFatura | '')}>
              <option value="">Todos</option>
              <option value="ABERTA">Em aberto</option>
              <option value="PAGA">Pagas</option>
              <option value="CANCELADA">Canceladas</option>
            </Select>
          </FormField>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={emitirTitulosLote} disabled={emitirLote.isPending || kpis.semTitulo === 0}>
            <FileText className="h-4 w-4" /> Emitir titulos ({kpis.semTitulo})
          </Button>
          <Button onClick={() => setGerando(true)}>
            <PlayCircle className="h-4 w-4" /> Gerar cobrancas
          </Button>
        </div>
      </div>

      {/* KPIs da competencia */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Faturas', valor: String(kpis.qtd), cor: 'text-slate-900' },
          { label: 'Faturado', valor: formatCurrency(kpis.total), cor: 'text-slate-900' },
          { label: 'Em aberto', valor: formatCurrency(kpis.aberto), cor: 'text-amber-700' },
          { label: 'Recebido', valor: formatCurrency(kpis.pago), cor: 'text-emerald-700' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">{k.label}</p>
            <p className={`tnum mt-1 text-xl font-semibold ${k.cor}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Associado</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Vencimento</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Titulo</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>
            )}
            {!isLoading && (faturas ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Nenhuma fatura em {rotuloCompetencia(competencia)}. Use &quot;Gerar cobrancas&quot;.
                </td>
              </tr>
            )}
            {(faturas ?? []).map((f) => (
              <FaturaLinha
                key={f.id}
                fatura={f}
                aberta={expandida === f.id}
                onToggle={() => setExpandida(expandida === f.id ? null : f.id)}
                onEmitir={() =>
                  emitirUma.mutate(f.id, {
                    onSuccess: () => toast.success('Titulo emitido'),
                    onError: (e) => toast.error(e.message),
                  })
                }
                onCancelar={() =>
                  cancelar.mutate(f.id, {
                    onSuccess: () => toast.success('Fatura cancelada'),
                    onError: (e) => toast.error(e.message),
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={gerando} onClose={() => setGerando(false)} title={`Gerar cobrancas — ${rotuloCompetencia(competencia)}`}>
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Gera a fatura de cada associado com veiculo em vigencia (ativo, em evento ou vistoria
            pendente) na competencia, respeitando o modo de faturamento de cada veiculo:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Agrupado</strong>: uma fatura por associado, no dia de vencimento mais usado entre os veiculos.</li>
            <li><strong>Individual</strong>: uma fatura por veiculo, no dia de vencimento da ficha dele.</li>
            <li>Valor = mensalidade da ficha do veiculo; sem ela, o motor de precos (plano + opcionais).</li>
          </ul>
          <p className="rounded-lg bg-slate-50 p-3 text-xs">
            A operacao e <strong>idempotente</strong>: faturas ja emitidas nesta competencia nao sao
            recriadas nem alteradas. Regional: <strong>{regionais?.find((r) => r.id === regionalId)?.nome ?? 'Todas'}</strong>.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setGerando(false)}>Cancelar</Button>
            <Button onClick={gerarLote} disabled={gerar.isPending}>
              <Receipt className="h-4 w-4" /> {gerar.isPending ? 'Gerando...' : 'Gerar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FaturaLinha({
  fatura, aberta, onToggle, onEmitir, onCancelar,
}: {
  fatura: FaturaComRel;
  aberta: boolean;
  onToggle: () => void;
  onEmitir: () => void;
  onCancelar: () => void;
}) {
  const agrupada = fatura.tipo_faturamento === 'AGRUPADO_ASSOCIADO';
  const { data: itens } = useFaturaItens(aberta && agrupada ? fatura.id : null);
  const titulo = fatura.titulos_financeiros;

  return (
    <>
      <tr className="border-b border-slate-50 last:border-0">
        <td className="px-4 py-2">
          <button onClick={onToggle} className="flex items-center gap-1 text-left font-medium text-slate-700 hover:text-brand-700">
            {agrupada ? (aberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
            {fatura.clientes?.nome_razao_social ?? '-'}
          </button>
        </td>
        <td className="px-4 py-2 text-slate-600">
          {agrupada ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">Agrupada</span>
          ) : (
            <span className="rounded bg-cyan-50 px-2 py-0.5 text-xs text-cyan-700">
              {fatura.veiculos?.placa ?? 'Individual'}
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-slate-600">{formatDate(fatura.vencimento)}</td>
        <td className="tnum px-4 py-2 text-right font-medium">{formatCurrency(Number(fatura.valor_total))}</td>
        <td className="px-4 py-2">
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COR[fatura.status]}`}>{STATUS_LABEL[fatura.status]}</span>
        </td>
        <td className="px-4 py-2 text-xs text-slate-500">
          {titulo ? (
            titulo.url_boleto ? (
              <a href={titulo.url_boleto} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                <Barcode className="h-3.5 w-3.5" /> Boleto
              </a>
            ) : (
              <span>Emitido ({titulo.status})</span>
            )
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </td>
        <td className="px-4 py-2">
          <div className="flex justify-end gap-1">
            {fatura.status === 'ABERTA' && !fatura.titulo_id && (
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onEmitir}>
                <FileText className="h-3.5 w-3.5" /> Emitir titulo
              </Button>
            )}
            {fatura.status !== 'PAGA' && fatura.status !== 'CANCELADA' && (
              <Button variant="ghost" className="px-2 py-1 text-xs text-rose-600" onClick={onCancelar}>
                <Ban className="h-3.5 w-3.5" /> Cancelar
              </Button>
            )}
          </div>
        </td>
      </tr>
      {aberta && agrupada && (
        <tr className="border-b border-slate-50 bg-slate-50/60">
          <td colSpan={7} className="px-8 py-2">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Veiculos da fatura</p>
            <ul className="space-y-1 text-sm text-slate-600">
              {(itens ?? []).map((i) => (
                <li key={i.id} className="flex justify-between border-b border-slate-100 py-1 last:border-0">
                  <span>{i.descricao}</span>
                  <span className="tnum">{formatCurrency(Number(i.valor))}</span>
                </li>
              ))}
              {(itens ?? []).length === 0 && <li className="text-slate-400">Carregando itens...</li>}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
