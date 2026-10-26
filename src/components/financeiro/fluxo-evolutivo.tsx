'use client';

import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFluxoEvolutivo } from '@/hooks/use-dre';
import { mensagemErro } from '@/hooks/use-tesouraria';
import { hojeEmSaoPaulo } from '@/lib/baixa-banco';
import { montarFluxoEvolutivo, type LinhaFluxo } from '@/lib/plano-contas';
import { formatCurrency } from '@/lib/utils';
import { Vazio } from './ui-financeiro';
import { BotoesExportar, SELECT_CLS, dataBR } from './tesouraria-ui';

const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const inicioDoMes = (iso: string) => `${iso.slice(0, 8)}01`;
const fimDoMes = (iso: string) => {
  const d = new Date(`${iso.slice(0, 8)}01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const valor = (v: number) => (v ? formatCurrency(v) : '—');

const ESTILO: Record<LinhaFluxo['tipo'], string> = {
  secao: 'bg-brand-600 text-white font-semibold text-xs tracking-wide',
  saldo: 'text-slate-700',
  total: 'bg-slate-100 font-semibold text-slate-900',
  entrada: 'text-slate-700',
  saida: 'text-slate-700',
  resultado: 'bg-slate-50 font-semibold text-slate-900',
};

/**
 * Fluxo de caixa EVOLUTIVO (0152) — a aba "Fluxo de Caixa Modelo" da planilha:
 * uma coluna por dia, os SALDOS INICIAIS por tipo de conta e o TOTAL, as
 * ENTRADAS por conta do plano, as SAIDAS por rubrica analitica e o saldo final
 * do dia. So o REALIZADO (o que passou pelas contas); a previsao fica no Fluxo Diario.
 */
export function FluxoEvolutivo() {
  const hoje = hojeEmSaoPaulo();
  const [inicio, setInicio] = useState(inicioDoMes(hoje));
  const [fim, setFim] = useState(hoje < fimDoMes(hoje) ? hoje : fimDoMes(hoje));
  const { data, isLoading, error } = useFluxoEvolutivo(inicio, fim);

  const grade = useMemo(
    () => (data ? montarFluxoEvolutivo(data, inicio, fim) : null),
    [data, inicio, fim],
  );
  const longo = grade ? grade.dias.length > 62 : false;
  const semMovimento = grade && !grade.linhas.some((l) => (l.tipo === 'entrada' || l.tipo === 'saida'));

  const atalhos = [
    { r: 'Este mês', a: inicioDoMes(hoje), b: hoje },
    { r: 'Mês anterior', a: inicioDoMes(somarDias(inicioDoMes(hoje), -1)), b: somarDias(inicioDoMes(hoje), -1) },
    { r: 'Últimos 15 dias', a: somarDias(hoje, -14), b: hoje },
    { r: 'Últimos 30 dias', a: somarDias(hoje, -29), b: hoje },
  ];

  const tabela = () => ({
    titulo: 'Demonstrativo de Fluxo de Caixa Diário (Modelo Evolutivo)',
    subtitulo: `${dataBR(inicio)} a ${dataBR(fim)}`,
    cabecalho: ['Conta / Categoria', ...(grade?.dias.map(dataBR) ?? []), 'Total / Último'],
    linhas: (grade?.linhas ?? []).map((l) => [
      l.rotulo, ...(l.tipo === 'secao' ? (grade?.dias.map(() => '') ?? []) : l.valores), l.total ?? '',
    ]),
    colunasMoeda: grade ? Array.from({ length: grade.dias.length + 1 }, (_, i) => i + 1) : [],
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-superficie p-3">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">De</span>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={`${SELECT_CLS} w-40`} />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Até</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={`${SELECT_CLS} w-40`} />
        </label>
        <div className="flex flex-wrap gap-1.5 pb-1">
          {atalhos.map((a) => (
            <button key={a.r} type="button" onClick={() => { setInicio(a.a); setFim(a.b); }}
              className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
              {a.r}
            </button>
          ))}
        </div>
        <div className="ml-auto pb-1">
          <BotoesExportar nome={`fluxo-evolutivo-${inicio}-a-${fim}`} tabela={tabela} desabilitado={!grade} />
        </div>
      </div>

      {inicio > fim && <p className="text-sm text-rose-600">A data inicial é depois da final.</p>}
      {longo && (
        <p className="text-sm text-amber-700">Período longo: são {grade?.dias.length} colunas. Para leitura, use até 2 meses.</p>
      )}
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Não foi possível ler o fluxo: {mensagemErro(error)}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Demonstrativo de Fluxo de Caixa Diário (Modelo Evolutivo)</CardTitle>
          <p className="text-xs text-slate-500">
            Realizado de {dataBR(inicio)} a {dataBR(fim)}. Os saldos de cada coluna são os do INÍCIO do dia; o saldo
            final do dia = total dos saldos + entradas + saídas. Transferências entre contas mudam os saldos por
            tipo de conta, mas não são entrada nem saída.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />)}
            </div>
          ) : !grade ? null : (
            <>
              {semMovimento && (
                <div className="px-4 pt-3">
                  <Vazio icon={CalendarRange} titulo="Sem entradas nem saídas no período"
                    descricao="Os saldos abaixo vêm das contas bancárias; os movimentos aparecem quando houver baixas no período." />
                </div>
              )}
              <div className="max-h-[70vh] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-superficie-alta text-slate-600">
                      <th className="sticky left-0 z-30 min-w-[260px] border-b border-slate-200 bg-superficie-alta px-3 py-2 text-left font-semibold">
                        Conta / Categoria
                      </th>
                      {grade.dias.map((d) => (
                        <th key={d} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-right font-semibold">
                          {diaMes(d)}
                        </th>
                      ))}
                      <th className="whitespace-nowrap border-b border-l border-slate-200 px-3 py-2 text-right font-semibold">
                        Total / último
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {grade.linhas.map((l) => (
                      <tr key={l.chave} className={ESTILO[l.tipo]}>
                        <td className={`sticky left-0 z-10 whitespace-nowrap border-b border-slate-100 px-3 py-1.5 ${
                          l.tipo === 'secao' ? 'bg-brand-600' : l.tipo === 'total' ? 'bg-slate-100' : l.tipo === 'resultado' ? 'bg-slate-50' : 'bg-superficie'}`}
                          style={l.tipo === 'entrada' || l.tipo === 'saida' || l.tipo === 'saldo' ? { paddingLeft: 22 } : undefined}>
                          {l.rotulo}
                        </td>
                        {l.tipo === 'secao'
                          ? <td colSpan={grade.dias.length + 1} className="border-b border-slate-100" />
                          : <>
                              {l.valores.map((v, i) => (
                                <td key={i} className={`tnum whitespace-nowrap border-b border-slate-100 px-3 py-1.5 text-right ${
                                  v < 0 ? 'text-rose-700' : ''}`}>
                                  {valor(v)}
                                </td>
                              ))}
                              <td className={`tnum whitespace-nowrap border-b border-l border-slate-200 px-3 py-1.5 text-right font-semibold ${
                                (l.total ?? 0) < 0 ? 'text-rose-700' : ''}`}>
                                {l.total == null ? '' : valor(l.total)}
                              </td>
                            </>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] leading-relaxed text-slate-400">
        O tipo de cada conta (conta corrente, aplicação, dinheiro ou outros) é escolhido em Configurações → Contas
        Bancárias. O saldo de implantação da conta é o do fim do dia informado e passa a contar no dia seguinte.
      </p>
    </div>
  );
}
