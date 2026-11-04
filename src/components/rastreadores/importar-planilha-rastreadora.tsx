'use client';

import { useMemo, useState } from 'react';
import { FileSpreadsheet, Loader2, Link2, Download, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { baixarCsv } from '@/components/financeiro/ui-financeiro';
import { createClient } from '@/lib/supabase/client';
import { lerTodas } from '@/lib/paginacao';
import { matrizDeCsv } from '@/lib/precificacao-import';
import { matrizDeXlsx as lerXlsx, modeloRastreadoraXlsx } from '@/lib/planilha-xlsx';
import { formatCurrency, cn } from '@/lib/utils';
import { grafiasDaPlaca } from '@/lib/placa';
import { usePode } from '@/hooks/use-permissoes';
import { useEmpresasRastreamento } from '@/hooks/use-rastreamento';
import {
  interpretarPlanilhaRastreadora, conferirPlanilha, valorAQuestionar, ROTULO_SITUACAO,
  type Conferencia, type LeituraPlanilha, type SituacaoRastreadora, type VeiculoBase,
} from '@/lib/rastreadora-planilha';

// Importa a planilha de faturamento de uma rastreadora (por placa/chassi):
// liga a FICHA do veiculo a rastreadora e confere a fatura. Sem IMEI o
// equipamento nao entra no parque — so a ficha e marcada.

const ORDEM: SituacaoRastreadora[] = ['VINCULAR', 'FORA_DA_BASE', 'OUTRA_RASTREADORA', 'NAO_ENCONTRADO', 'JA_VINCULADO', 'RETIRADO'];

async function baixarModelo() {
  const ExcelJS = (await import('exceljs')).default;
  const buffer = await modeloRastreadoraXlsx(ExcelJS);
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-planilha-rastreadora.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function lerArquivo(f: File): Promise<string[][]> {
  if (/\.csv$/i.test(f.name)) return matrizDeCsv(await f.text());
  const ExcelJS = (await import('exceljs')).default;
  return lerXlsx(ExcelJS, await f.arrayBuffer());
}

interface VeiculoLido {
  id: string; placa: string | null; chassi: string | null; status: string;
  empresa_rastreamento_id: string | null;
  clientes: { nome_razao_social: string } | null;
  regionais: { nome: string } | null;
}
const SELECT_VEICULO =
  'id, placa, chassi, status, empresa_rastreamento_id, clientes(nome_razao_social), regionais!veiculos_regional_id_fkey(nome)';

function emBlocos<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export function ImportarPlanilhaRastreadora() {
  const supabase = createClient();
  const qc = useQueryClient();
  const podeEditar = usePode('rastreadores.editar');
  const { data: rastreadoras } = useEmpresasRastreamento();
  const [rastreadoraId, setRastreadoraId] = useState('');
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<LeituraPlanilha | null>(null);
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [filtro, setFiltro] = useState<SituacaoRastreadora | 'FORA_DA_FATURA' | null>(null);

  const nomeRastreadora = useMemo(
    () => new Map((rastreadoras ?? []).map((r) => [r.id, r.nome])),
    [rastreadoras],
  );

  async function conferir(lida: LeituraPlanilha, rid: string) {
    const placas = [...new Set(lida.linhas.flatMap((l) => grafiasDaPlaca(l.placa)))];
    const chassis = lida.linhas.map((l) => l.chassi).filter(Boolean) as string[];
    const lidos: VeiculoLido[] = [];
    for (const b of emBlocos(placas, 150)) {
      const { data, error } = await supabase.from('veiculos').select(SELECT_VEICULO).in('placa', b);
      if (error) throw error;
      lidos.push(...((data ?? []) as unknown as VeiculoLido[]));
    }
    for (const b of emBlocos(chassis, 150)) {
      const { data, error } = await supabase.from('veiculos').select(SELECT_VEICULO).in('chassi', b);
      if (error) throw error;
      lidos.push(...((data ?? []) as unknown as VeiculoLido[]));
    }
    const vinculados = await lerTodas<VeiculoLido>((de, ate) =>
      supabase.from('veiculos').select(SELECT_VEICULO).eq('empresa_rastreamento_id', rid)
        .order('id').range(de, ate) as never,
    );
    const ids = [...new Set([...lidos, ...vinculados].map((v) => v.id))];
    const parque = new Map<string, string>();
    for (const b of emBlocos(ids, 150)) {
      const { data, error } = await supabase.from('rastreadores').select('veiculo_id, empresa_rastreamento_id')
        .in('veiculo_id', b).in('status', ['ATIVO', 'INADIMPLENTE']);
      if (error) throw error;
      for (const r of data ?? []) if (r.veiculo_id && r.empresa_rastreamento_id) parque.set(r.veiculo_id, r.empresa_rastreamento_id);
    }
    const paraBase = (v: VeiculoLido): VeiculoBase => {
      const pr = parque.get(v.id) ?? null;
      return {
        id: v.id, placa: v.placa, chassi: v.chassi, status: v.status,
        regional: v.regionais?.nome ?? null, associado: v.clientes?.nome_razao_social ?? null,
        empresa_rastreamento_id: v.empresa_rastreamento_id,
        parque_rastreadora_id: pr, parque_rastreadora_nome: pr ? nomeRastreadora.get(pr) ?? null : null,
      };
    };
    const unicos = [...new Map(lidos.map((v) => [v.id, v])).values()];
    setConf(conferirPlanilha(lida.linhas, unicos.map(paraBase), rid, vinculados.map(paraBase)));
  }

  async function escolherArquivo(f: File | undefined) {
    if (!f) return;
    if (!rastreadoraId) { toast.error('Escolha a rastreadora antes do arquivo.'); return; }
    setLendo(true); setConf(null); setFiltro(null);
    try {
      const lida = interpretarPlanilhaRastreadora(await lerArquivo(f));
      setArquivo(f.name); setLeitura(lida);
      if (!lida.erros.length) await conferir(lida, rastreadoraId);
    } catch (e) {
      toast.error(`Não consegui ler: ${e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)}`);
    } finally {
      setLendo(false);
    }
  }

  const aVincular = conf?.itens.filter((i) => i.situacao === 'VINCULAR' && i.veiculo) ?? [];

  async function vincular() {
    if (!aVincular.length || !conf || !leitura) return;
    const nome = nomeRastreadora.get(rastreadoraId) ?? 'a rastreadora';
    if (!confirm(`Ligar ${aVincular.length} veículo(s) a ${nome}? A ficha passa a mostrar a rastreadora. Nada mais muda.`)) return;
    setGravando(true);
    try {
      for (const b of emBlocos(aVincular.map((i) => i.veiculo!.id), 100)) {
        const { error } = await supabase.from('veiculos').update({ empresa_rastreamento_id: rastreadoraId }).in('id', b);
        if (error) throw error;
      }
      toast.success(`${aVincular.length} veículo(s) ligados a ${nome}.`);
      qc.invalidateQueries({ queryKey: ['veiculos'] });
      qc.invalidateQueries({ queryKey: ['veiculo'] });
      await conferir(leitura, rastreadoraId);
    } catch (e) {
      toast.error(`Falhou: ${String((e as { message?: string })?.message ?? e)}`);
    } finally {
      setGravando(false);
    }
  }

  function exportar() {
    if (!conf) return;
    const linhas: (string | number)[][] = [['Placa', 'Situação', 'Detalhe', 'Associado', 'Unidade', 'Status no SCar', 'Valor cobrado', 'Instalado em', 'Retirado em']];
    for (const i of conf.itens) {
      linhas.push([i.placa, ROTULO_SITUACAO[i.situacao].titulo, i.detalhe ?? '', i.veiculo?.associado ?? '',
        i.veiculo?.regional ?? '', i.veiculo?.status ?? '', i.valor ?? 0, i.instalado_em ?? '', i.retirado_em ?? '']);
    }
    for (const v of conf.fora_da_fatura) {
      linhas.push([v.placa ?? '', 'Ligado aqui e fora da fatura', '', v.associado ?? '', v.regional ?? '', v.status, 0, '', '']);
    }
    baixarCsv(`conferencia-${(nomeRastreadora.get(rastreadoraId) ?? 'rastreadora').replace(/\W+/g, '-')}.csv`, linhas);
  }

  const questionar = conf ? valorAQuestionar(conf) : null;
  const lista = !conf ? [] : filtro === 'FORA_DA_FATURA' ? [] : conf.itens.filter((i) => !filtro || i.situacao === filtro);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
        <h2 className="font-display text-base font-semibold text-slate-900">Planilha da rastreadora</h2>
        <p className="mt-1 text-sm text-slate-500">
          A fatura mensal da rastreadora, ligada por <b>placa</b> (o chassi entra como reserva). A conferência mostra quem é
          cobrado e já saiu da base, quem tem rastreador de outra empresa e quem não existe aqui. Sem IMEI, o equipamento
          não entra no parque: só a <b>ficha do veículo</b> passa a dizer quem rastreia.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Rastreadora</span>
            <Select value={rastreadoraId} onChange={(e) => { setRastreadoraId(e.target.value); setConf(null); setLeitura(null); setArquivo(null); }}>
              <option value="">Escolha…</option>
              {(rastreadoras ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </Select>
          </label>
          <label className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50',
            !rastreadoraId && 'pointer-events-none opacity-50')}>
            {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {arquivo ? 'Trocar arquivo' : 'Escolher planilha (.xlsx ou .csv)'}
            <input type="file" accept=".xlsx,.csv" className="hidden" disabled={!rastreadoraId || lendo}
              onChange={(e) => { escolherArquivo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {arquivo && <span className="text-sm text-slate-500">{arquivo}</span>}
          <Button variant="ghost" onClick={() => baixarModelo().catch(() => toast.error('Não consegui gerar o modelo.'))}
            className="ml-auto">
            <Download className="mr-1 h-4 w-4" /> Baixar modelo (.xlsx)
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Colunas reconhecidas: <b>Placa</b> (obrigatória), Chassi, IMEI, Valor mensal, Data instalação, Data retirada. A planilha
          da própria rastreadora também serve: o sistema acha a linha com &quot;Placa&quot; e lê as colunas pelo nome.
        </p>
        {leitura?.erros.map((e) => <p key={e} className="mt-2 text-sm text-red-600">{e}</p>)}
        {!!leitura?.avisos.length && (
          <details className="mt-2 text-sm text-amber-700">
            <summary>{leitura.avisos.length} aviso(s) da leitura</summary>
            <ul className="mt-1 list-disc pl-5">{leitura.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          </details>
        )}
      </div>

      {conf && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-superficie p-3">
              <p className="text-xs text-slate-500">Na fatura</p>
              <p className="tnum text-xl font-semibold text-slate-900">{conf.total.qtd} · {formatCurrency(conf.total.valor)}</p>
            </div>
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="text-xs text-amber-800 dark:text-amber-300">A questionar com a rastreadora</p>
              <p className="tnum text-xl font-semibold text-amber-900 dark:text-amber-200">{questionar!.qtd} · {formatCurrency(questionar!.valor)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-superficie p-3">
              <p className="text-xs text-slate-500">A vincular agora</p>
              <p className="tnum text-xl font-semibold text-slate-900">{aVincular.length}</p>
            </div>
            <button onClick={() => setFiltro(filtro === 'FORA_DA_FATURA' ? null : 'FORA_DA_FATURA')}
              className={cn('rounded-2xl border bg-superficie p-3 text-left', filtro === 'FORA_DA_FATURA' ? 'border-cyan-500' : 'border-slate-200')}>
              <p className="text-xs text-slate-500">Ligados a ela e fora da fatura</p>
              <p className="tnum text-xl font-semibold text-slate-900">{conf.fora_da_fatura.length}</p>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {ORDEM.map((s) => (
              <button key={s} onClick={() => setFiltro(filtro === s ? null : s)} title={ROTULO_SITUACAO[s].texto}
                className={cn('rounded-full border px-3 py-1 text-xs',
                  filtro === s ? 'border-cyan-500 bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200' : 'border-slate-300 text-slate-600',
                  ROTULO_SITUACAO[s].tom === 'alerta' && conf.porSituacao[s].qtd > 0 && filtro !== s && 'border-amber-400 text-amber-800 dark:text-amber-300')}>
                {ROTULO_SITUACAO[s].titulo} · {conf.porSituacao[s].qtd}
                {conf.porSituacao[s].valor > 0 && <> · {formatCurrency(conf.porSituacao[s].valor)}</>}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={exportar}><Download className="mr-1 h-4 w-4" /> CSV da conferência</Button>
              {podeEditar && (
                <Button onClick={vincular} disabled={!aVincular.length || gravando}>
                  {gravando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
                  Vincular {aVincular.length} veículo(s)
                </Button>
              )}
            </div>
          </div>
          {filtro && filtro !== 'FORA_DA_FATURA' && (
            <p className="text-sm text-slate-500">{ROTULO_SITUACAO[filtro].texto}</p>
          )}

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie">
            <table className="w-full text-sm">
              <thead className="bg-superficie-alta text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Placa</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Associado</th>
                  <th className="px-3 py-2">Unidade</th><th className="px-3 py-2">No SCar</th><th className="px-3 py-2 text-right">Cobrado</th>
                </tr>
              </thead>
              <tbody>
                {filtro === 'FORA_DA_FATURA'
                  ? conf.fora_da_fatura.map((v) => (
                    <tr key={v.id} className="border-t border-slate-200">
                      <td className="placa px-3 py-2">{v.placa ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-600">Ligado a esta rastreadora e não cobrado</td>
                      <td className="px-3 py-2">{v.associado ?? '—'}</td><td className="px-3 py-2">{v.regional ?? '—'}</td>
                      <td className="px-3 py-2">{v.status}</td><td className="px-3 py-2 text-right">—</td>
                    </tr>))
                  : lista.map((i) => (
                    <tr key={i.linha} className="border-t border-slate-200">
                      <td className="placa px-3 py-2">{i.placa}{i.casou_por === 'CHASSI' && <span className="ml-1 text-xs text-slate-400">(pelo chassi: {i.veiculo?.placa})</span>}
                        {i.casou_por === 'PLACA' && i.veiculo?.placa && i.veiculo.placa !== i.placa && (
                          <span className="ml-1 text-xs text-slate-400">(no SCar: {i.veiculo.placa})</span>)}</td>
                      <td className="px-3 py-2">
                        <span className={cn(ROTULO_SITUACAO[i.situacao].tom === 'alerta' && 'font-medium text-amber-700 dark:text-amber-300')}>
                          {ROTULO_SITUACAO[i.situacao].tom === 'alerta' && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                          {ROTULO_SITUACAO[i.situacao].titulo}
                        </span>
                        {i.detalhe && <span className="block text-xs text-slate-500">{i.detalhe}</span>}
                      </td>
                      <td className="px-3 py-2">{i.veiculo?.associado ?? '—'}</td>
                      <td className="px-3 py-2">{i.veiculo?.regional ?? '—'}</td>
                      <td className="px-3 py-2">{i.veiculo?.status ?? '—'}</td>
                      <td className="tnum px-3 py-2 text-right">{i.valor != null ? formatCurrency(i.valor) : '—'}</td>
                    </tr>))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
