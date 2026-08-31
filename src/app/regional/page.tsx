'use client';

import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowDownCircle, ArrowUpCircle, Car, HandCoins, Target, TrendingUp, Users, Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Indicador, FiltroPeriodo, Vazio, periodoPreset, type Periodo } from '@/components/financeiro/ui-financeiro';
import { useDesempenhoEquipe, usePainelRegional } from '@/hooks/use-regional';
import { formatCurrency } from '@/lib/utils';

export default function PainelRegionalPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const filtro = { regionalId: null, ...periodo };
  const { data: p, isLoading } = usePainelRegional(filtro);
  const { data: equipe } = useDesempenhoEquipe(filtro);

  const ranking = (equipe ?? [])
    .filter((v) => v.leads > 0 || v.convertidos > 0)
    .slice(0, 8)
    .map((v) => ({ nome: v.nome.split(' ')[0], Convertidos: v.convertidos, Leads: v.leads }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Painel da Franquia</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Desempenho da sua equipe, comissoes e o financeiro da unidade.
        </p>
      </header>

      <FiltroPeriodo periodo={periodo} onChange={setPeriodo} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Leads no periodo" valor={p?.leads_periodo} icon={Zap} tom="destaque"
          carregando={isLoading}
          detalhe={`${p?.leads_hotlink ?? 0} vieram por hotlink · ${p?.leads_convertidos ?? 0} viraram veiculo`}
        />
        <Indicador
          titulo="Taxa de conversao" valor={p?.taxa_conversao} icon={Target}
          tom={(p?.taxa_conversao ?? 0) >= 20 ? 'receita' : 'alerta'}
          carregando={isLoading}
          detalhe="Leads que entraram na base no periodo"
        />
        <Indicador
          titulo="Veiculos ativos" valor={p?.veiculos_ativos} icon={Car} tom="neutro"
          carregando={isLoading}
          detalhe={`${p?.vendedores_ativos ?? 0} vendedor(es) ativo(s) na unidade`}
        />
        <Indicador
          titulo="Comissao a pagar" valor={p?.comissao_vendedores_pend} icon={HandCoins} tom="alerta"
          carregando={isLoading}
          detalhe={`Ja repassado: ${formatCurrency(p?.comissao_vendedores_paga)}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador titulo="A receber (unidade)" valor={p?.contas_receber_aberto} icon={ArrowUpCircle} tom="receita"
          detalhe="Somente titulos desta franquia" />
        <Indicador titulo="A pagar (unidade)" valor={p?.contas_pagar_aberto} icon={ArrowDownCircle} tom="despesa"
          detalhe="Nao inclui nada da matriz" />
        <Indicador
          titulo="Resultado liquidado" valor={p?.resultado_periodo} icon={TrendingUp}
          tom={(p?.resultado_periodo ?? 0) >= 0 ? 'receita' : 'despesa'}
          detalhe="Recebido menos pago, nesta unidade"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ranking da equipe</CardTitle>
          <p className="text-xs text-slate-500">Leads gerados x convertidos no periodo.</p>
        </CardHeader>
        <CardContent>
          {ranking.length === 0 ? (
            <Vazio
              icon={Users}
              titulo="Sem movimento no periodo"
              descricao="Assim que a equipe captar leads — pelo hotlink ou pelo cadastro interno — o ranking aparece aqui."
            />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, ranking.length * 38)}>
              <BarChart data={ranking} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8edf5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="nome" width={80} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="Leads" fill="#C9E8F7" radius={[0, 4, 4, 0]} maxBarSize={14} />
                <Bar dataKey="Convertidos" fill="#22A7E4" radius={[0, 4, 4, 0]} maxBarSize={14}>
                  {ranking.map((r) => <Cell key={r.nome} fill="#22A7E4" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
