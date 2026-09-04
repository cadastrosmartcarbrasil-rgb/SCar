'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Satellite, Plus, Search, Loader2, Boxes, CircleAlert, ArrowRight, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, MoneyInput, Textarea } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import { useEmpresasRastreamento } from '@/hooks/use-rastreamento';
import {
  useRastreadores, useRastreadoresResumo, useSalvarRastreador,
  type FiltrosRastreador,
} from '@/hooks/use-rastreadores';
import {
  STATUS_RASTREADOR, statusMeta, rotuloStatus, alertaDePrazo,
  imeiFormatoValido, imeiLuhnValido, chipFormatoValido, normalizarDigitos, formatarChip,
} from '@/lib/rastreador';
import type { RastreadoresRow, StatusRastreador } from '@/lib/database.types';

const PAGINA = 50;

export function PainelRastreadores() {
  const [f, setF] = useState<FiltrosRastreador>({ limite: PAGINA, offset: 0 });
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState<Partial<RastreadoresRow> | null>(null);

  const { data: resumo } = useRastreadoresResumo(f.regionalId);
  const { data: lista, isLoading } = useRastreadores({ ...f, busca });
  const { data: regionais } = useRegionais();
  const { data: plataformas } = useEmpresasRastreamento();
  const salvar = useSalvarRastreador();

  const total = lista?.[0]?.total_registros ?? 0;
  const porStatus = useMemo(
    () => new Map((resumo?.por_status ?? []).map((s) => [s.status, s.quantidade])),
    [resumo],
  );

  function aplicar(patch: Partial<FiltrosRastreador>) {
    setF((atual) => ({ ...atual, ...patch, offset: 0 }));
  }

  function salvarNovo(e: React.FormEvent) {
    e.preventDefault();
    if (!novo) return;
    if (!imeiFormatoValido(novo.imei)) return toast.error('IMEI deve ter de 14 a 17 digitos');
    if (novo.iccid && !chipFormatoValido(novo.iccid)) return toast.error('ICCID invalido');
    salvar.mutate(novo, {
      onSuccess: () => { toast.success('Equipamento cadastrado'); setNovo(null); },
      onError: (err) => toast.error(
        err.message.includes('rastreadores_imei_key') ? 'Este IMEI ja esta cadastrado' : err.message,
      ),
    });
  }

  function exportarCsv() {
    const linhas = [
      ['IMEI', 'Status', 'Unidade', 'Plataforma', 'Placa', 'Associado', 'Dias no status'],
      ...(lista ?? []).map((r) => [
        r.imei, rotuloStatus(r.status), r.regional ?? '', r.plataforma ?? '',
        r.placa ?? '', r.associado ?? '', String(r.dias_no_status),
      ]),
    ];
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'rastreadores.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Painel: o parque em numeros. Cada card filtra a lista abaixo. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador titulo="Equipamentos" valor={resumo?.total ?? 0} icone={<Boxes className="h-4 w-4" />} />
        <Indicador titulo="Instalados" valor={resumo?.ativos ?? 0} onClick={() => aplicar({ status: 'ATIVO' })} />
        <Indicador titulo="Em estoque" valor={resumo?.estoque ?? 0} onClick={() => aplicar({ status: 'DISPONIVEL' })} />
        <Link href="/rastreadores/divergencias"
          className="rounded-xl border border-rose-200 bg-superficie p-3 transition hover:border-rose-300">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
            <CircleAlert className="h-4 w-4 text-rose-500" /> Divergencias
          </p>
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-rose-700">
            Painel do dia <ArrowRight className="h-3.5 w-3.5" />
          </p>
        </Link>
      </div>

      {/* Cards por status — com o numero que a equipe fala */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {STATUS_RASTREADOR.map((s) => (
          <button key={s.status} onClick={() => aplicar({ status: s.status })}
            className={`rounded-lg border border-slate-200 bg-superficie p-2.5 text-left transition hover:border-cyan-300 ${
              f.status === s.status ? 'ring-2 ring-cyan-400' : ''}`}>
            <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${s.cor}`}>
              {s.numero} - {s.rotulo}
            </span>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-800">{porStatus.get(s.status) ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="IMEI, linha, serie, placa ou associado"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </div>
        <Select value={f.regionalId ?? ''} onChange={(e) => aplicar({ regionalId: e.target.value || undefined })} className="mt-0 w-auto">
          <option value="">Todas as unidades</option>
          {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </Select>
        <Select value={f.plataformaId ?? ''} onChange={(e) => aplicar({ plataformaId: e.target.value || undefined })} className="mt-0 w-auto">
          <option value="">Todas as plataformas</option>
          {(plataformas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </Select>
        <Select value={f.status ?? ''} onChange={(e) => aplicar({ status: (e.target.value || '') as StatusRastreador | '' })} className="mt-0 w-auto">
          <option value="">Todos os status</option>
          {STATUS_RASTREADOR.map((s) => <option key={s.status} value={s.status}>{s.numero} - {s.rotulo}</option>)}
        </Select>
        <Button variant="secondary" onClick={exportarCsv}><Download className="h-4 w-4" /> CSV</Button>
        <Button onClick={() => setNovo({ status: 'DISPONIVEL' })}><Plus className="h-4 w-4" /> Novo equipamento</Button>
      </div>

      {/* Lista */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">IMEI</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Veiculo / Associado</th>
              <th className="px-4 py-2">Unidade</th>
              <th className="px-4 py-2">Plataforma</th>
              <th className="px-4 py-2">Parado ha</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {(lista ?? []).map((r) => {
              const meta = statusMeta(r.status);
              const alerta = alertaDePrazo(r.status, r.status_desde);
              return (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-cyan-50/40">
                  <td className="px-4 py-2 font-mono font-medium text-slate-800">
                    <Link href={`/rastreadores/${r.id}`} className="hover:underline">{r.imei}</Link>
                    {r.linha && <span className="block text-[11px] font-sans text-slate-400">{formatarChip(r.linha)}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.cor}`}>{r.status_numero} - {meta.rotulo}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.placa ? (
                      <>
                        <span className="font-mono font-medium text-slate-800">{r.placa}</span>
                        <span className="block text-[11px] text-slate-400">{r.associado ?? ''}</span>
                      </>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.regional ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{r.plataforma ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className="tabular-nums text-slate-600">{r.dias_no_status} d</span>
                    {alerta && <span className="block text-[11px] text-amber-600">{alerta.mensagem}</span>}
                  </td>
                </tr>
              );
            })}
            {!isLoading && (lista ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nenhum equipamento encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Mostrando {(lista ?? []).length} de {total} equipamento(s)
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={(f.offset ?? 0) === 0}
            onClick={() => setF((a) => ({ ...a, offset: Math.max((a.offset ?? 0) - PAGINA, 0) }))}>
            Anterior
          </Button>
          <Button variant="secondary" disabled={(f.offset ?? 0) + PAGINA >= total}
            onClick={() => setF((a) => ({ ...a, offset: (a.offset ?? 0) + PAGINA }))}>
            Proxima
          </Button>
        </div>
      </div>

      {/* Cadastro manual — a unica porta de entrada de dados nesta fase */}
      <Modal open={!!novo} onClose={() => setNovo(null)} title="Novo equipamento" tamanho="lg"
             subtitulo="O equipamento entra no estoque; a instalacao acontece na ficha dele.">
        <form onSubmit={salvarNovo} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="IMEI *">
              <Input value={novo?.imei ?? ''} inputMode="numeric" className="mt-0 font-mono"
                onChange={(e) => setNovo((n) => ({ ...n, imei: normalizarDigitos(e.target.value).slice(0, 17) }))} />
            </FormField>
            <FormField label="Nº do chip (linha)">
              <Input value={novo?.linha ?? ''} inputMode="numeric" className="mt-0 font-mono"
                onChange={(e) => setNovo((n) => ({ ...n, linha: normalizarDigitos(e.target.value).slice(0, 22) }))} />
            </FormField>
            <FormField label="ICCID">
              <Input value={novo?.iccid ?? ''} inputMode="numeric" className="mt-0 font-mono"
                onChange={(e) => setNovo((n) => ({ ...n, iccid: normalizarDigitos(e.target.value).slice(0, 22) }))} />
            </FormField>
          </div>
          {!!novo?.imei && novo.imei.length === 15 && !imeiLuhnValido(novo.imei) && (
            <p className="text-xs text-amber-600">O digito verificador deste IMEI nao confere — confirme com a rastreadora.</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Plataforma (rastreadora)">
              <Select value={novo?.empresa_rastreamento_id ?? ''}
                onChange={(e) => setNovo((n) => ({ ...n, empresa_rastreamento_id: e.target.value || null }))}>
                <option value="">-- Selecione --</option>
                {(plataformas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Select>
            </FormField>
            <FormField label="Unidade (filial)">
              <Select value={novo?.regional_id ?? ''}
                onChange={(e) => setNovo((n) => ({ ...n, regional_id: e.target.value || null }))}>
                <option value="">-- Selecione --</option>
                {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </Select>
            </FormField>
            <FormField label="Operadora do chip">
              <Input value={novo?.operadora ?? ''} onChange={(e) => setNovo((n) => ({ ...n, operadora: e.target.value }))} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Modelo"><Input value={novo?.modelo ?? ''} onChange={(e) => setNovo((n) => ({ ...n, modelo: e.target.value }))} /></FormField>
            <FormField label="Fabricante"><Input value={novo?.fabricante ?? ''} onChange={(e) => setNovo((n) => ({ ...n, fabricante: e.target.value }))} /></FormField>
            <FormField label="Nº de serie"><Input value={novo?.numero_serie ?? ''} onChange={(e) => setNovo((n) => ({ ...n, numero_serie: e.target.value }))} /></FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Data de aquisicao">
              <Input type="date" value={novo?.data_aquisicao ?? ''} onChange={(e) => setNovo((n) => ({ ...n, data_aquisicao: e.target.value || null }))} />
            </FormField>
            <FormField label="Valor de aquisicao">
              <MoneyInput value={novo?.valor_aquisicao ?? null} onChange={(v) => setNovo((n) => ({ ...n, valor_aquisicao: v }))} />
            </FormField>
            <FormField label="Nota fiscal">
              <Input value={novo?.nota_fiscal ?? ''} onChange={(e) => setNovo((n) => ({ ...n, nota_fiscal: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Observacoes">
            <Textarea rows={2} value={novo?.observacoes ?? ''} onChange={(e) => setNovo((n) => ({ ...n, observacoes: e.target.value }))} />
          </FormField>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setNovo(null)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Satellite className="h-4 w-4" />} Cadastrar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Indicador({ titulo, valor, icone, onClick }: {
  titulo: string; valor: number; icone?: React.ReactNode; onClick?: () => void;
}) {
  const conteudo = (
    <>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">{icone} {titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="rounded-xl border border-slate-200 bg-superficie p-3 text-left transition hover:border-cyan-300">{conteudo}</button>
  ) : (
    <div className="rounded-xl border border-slate-200 bg-superficie p-3">{conteudo}</div>
  );
}
