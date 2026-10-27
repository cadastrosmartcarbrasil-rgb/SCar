'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlanoContas } from '@/hooks/use-config';
import { useBalancete } from '@/hooks/use-dre';
import { usePode } from '@/hooks/use-permissoes';
import { ladoDoSaldo, metaNatureza, montarBalancete } from '@/lib/plano-contas';
import { formatCurrency, formatDate } from '@/lib/utils';
import { mensagemErro } from '@/hooks/use-tesouraria';
import { FiltroPeriodo, Vazio, periodoPreset, type Periodo } from './ui-financeiro';
import { BotoesExportar } from './tesouraria-ui';

const saldoTexto = (v: number) => (v ? `${formatCurrency(Math.abs(v))} ${ladoDoSaldo(v)}` : formatCurrency(0));

/**
 * Balancete de verificacao (0152): para cada conta do plano, o saldo anterior,
 * os debitos e creditos do periodo e o saldo final (D = devedor, C = credor).
 * As partidas sao derivadas dos lancamentos, baixas, titulos, transferencias e
 * saldos iniciais; por construcao, debitos = creditos.
 */
export function Balancete() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [zeradas, setZeradas] = useState(false);
  const [soSinteticas, setSoSinteticas] = useState(false);
  const podeExportar = usePode('financeiro_dre.exportar');
  const { data: plano } = usePlanoContas();
  const { data: saldos, isLoading, error } = useBalancete(periodo.inicio, periodo.fim);

  const { linhas, totais } = useMemo(
    () => montarBalancete(plano ?? [], saldos ?? [], zeradas),
    [plano, saldos, zeradas],
  );
  const visiveis = soSinteticas ? linhas.filter((l) => !l.analitica) : linhas;
  const fecha = Math.abs(totais.debitos - totais.creditos) < 0.005 && Math.abs(totais.devedor - totais.credor) < 0.005;

  const tabela = () => ({
    titulo: 'Balancete de Verificação',
    subtitulo: `${formatDate(periodo.inicio)} a ${formatDate(periodo.fim)}`,
    cabecalho: ['Código', 'Conta', 'Tipo', 'Saldo anterior', 'D/C', 'Débitos', 'Créditos', 'Saldo final', 'D/C'],
    linhas: visiveis.map((l) => [
      l.codigo, `${'  '.repeat(l.profundidade)}${l.nome}`, l.analitica ? 'Analítica' : 'Sintética',
      Math.abs(l.saldoAnterior), ladoDoSaldo(l.saldoAnterior), l.debitos, l.creditos,
      Math.abs(l.saldoFinal), ladoDoSaldo(l.saldoFinal),
    ]),
    rodape: ['', 'TOTAIS', '', '', '', totais.debitos, totais.creditos, '', ''],
    colunasMoeda: [3, 5, 6, 7],
  });

  return (
    <div className="space-y-4">
      <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={zeradas} onChange={(e) => setZeradas(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300" />
          Mostrar contas sem movimento
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={soSinteticas} onChange={(e) => setSoSinteticas(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300" />
          Só as sintéticas
        </label>
        <div className="ml-auto print:hidden">
          {podeExportar && (
            <BotoesExportar nome={`balancete-${periodo.inicio}-a-${periodo.fim}`} tabela={tabela} desabilitado={!visiveis.length} />
          )}
        </div>
      </FiltroPeriodo>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Não foi possível ler o balancete: {mensagemErro(error)}
        </div>
      ) : null}

      {!isLoading && saldos && saldos.length > 0 && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
          fecha ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
          {fecha ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {fecha
            ? `Balancete fechado: débitos = créditos (${formatCurrency(totais.debitos)}) e saldos devedores = credores (${formatCurrency(totais.devedor)}).`
            : `Diferença: débitos ${formatCurrency(totais.debitos)} × créditos ${formatCurrency(totais.creditos)}.`}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Balancete de Verificação</CardTitle>
          <p className="text-xs text-slate-500">
            {formatDate(periodo.inicio)} a {formatDate(periodo.fim)} · consolidado · D = saldo devedor, C = saldo credor
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />)}
            </div>
          ) : visiveis.length === 0 ? (
            <Vazio icon={Scale} titulo="Sem saldo nem movimento" descricao="Nenhuma conta teve saldo ou movimento até o fim do período." />
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-semibold">Conta</th>
                  <th className="py-2 font-semibold">Natureza</th>
                  <th className="py-2 text-right font-semibold">Saldo anterior</th>
                  <th className="py-2 text-right font-semibold">Débitos</th>
                  <th className="py-2 text-right font-semibold">Créditos</th>
                  <th className="py-2 text-right font-semibold">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.codigo}
                    className={`border-b border-slate-50 ${l.analitica ? 'text-slate-600' : 'bg-slate-50/70 font-semibold text-slate-800'}`}>
                    <td className="py-1.5 pr-3" style={{ paddingLeft: `${4 + l.profundidade * 16}px` }}>
                      <span className="mr-2 font-mono text-[11px] text-slate-400">{l.codigo}</span>
                      {l.nome}
                      {l.foraDoPlano && <span className="ml-1 text-[11px] text-amber-600">(fora do plano)</span>}
                    </td>
                    <td className="py-1.5 text-xs text-slate-500">{metaNatureza(l.natureza)?.rotulo}</td>
                    <td className="tnum py-1.5 text-right">{saldoTexto(l.saldoAnterior)}</td>
                    <td className="tnum py-1.5 text-right">{l.debitos ? formatCurrency(l.debitos) : '—'}</td>
                    <td className="tnum py-1.5 text-right">{l.creditos ? formatCurrency(l.creditos) : '—'}</td>
                    <td className="tnum py-1.5 text-right font-medium">{saldoTexto(l.saldoFinal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className="py-2" colSpan={3}>TOTAIS (contas analíticas)</td>
                  <td className="tnum py-2 text-right">{formatCurrency(totais.debitos)}</td>
                  <td className="tnum py-2 text-right">{formatCurrency(totais.creditos)}</td>
                  <td className="tnum py-2 text-right text-xs font-semibold text-slate-600">
                    D {formatCurrency(totais.devedor)} · C {formatCurrency(totais.credor)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] leading-relaxed text-slate-400">
        Como as partidas são montadas: o título a receber debita Contas a Receber (1.1.2) e credita a conta de
        receita; o título a pagar debita a conta de custo/despesa (ou de balanço, como imobilizado) e credita
        Fornecedores a Pagar (2.1.1.01); o pagamento movimenta a conta da própria conta bancária em Disponibilidades (1.1.1, dentro do grupo da
        classe da conta); o saldo inicial das contas entra contra Lucros/Prejuízos Acumulados (2.2.2.01).
        Títulos cancelados não entram.
      </p>
    </div>
  );
}
