'use client';

import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Car, HandCoins, Info, Target, TrendingUp, UserRound,
  Users, Wallet, Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Indicador, FiltroPeriodo, Vazio, periodoPreset, type Periodo } from '@/components/financeiro/ui-financeiro';
import { useDesempenhoEquipe, usePainelRegional } from '@/hooks/use-regional';
import { formatCurrency } from '@/lib/utils';
import { avisoCobrancaExterna, composicaoDaCarteira } from '@/lib/regional';
import { useUnidadeAtual } from '@/components/regional/contexto-unidade';
import { useCobrancaCarteira } from '@/hooks/use-cobranca-painel';
import Link from 'next/link';

export default function PainelRegionalPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  // A unidade vem do portal (o gestor entra na dele; a matriz escolhe qual visitar).
  const { regionalId, nome: nomeUnidade } = useUnidadeAtual();
  const filtro = { regionalId, ...periodo };
  const { data: p, isLoading } = usePainelRegional(filtro);
  const { data: equipe } = useDesempenhoEquipe(filtro);
  // Retrato de HOJE da inadimplencia (o mesmo numero da tela de cobranca).
  const { data: cob, isLoading: carregandoCob } = useCobrancaCarteira(regionalId);

  const ranking = (equipe ?? [])
    .filter((v) => v.leads > 0 || v.convertidos > 0)
    .slice(0, 8)
    .map((v) => ({ nome: v.nome.split(' ')[0], Convertidos: v.convertidos, Leads: v.leads }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Painel da Franquia</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {nomeUnidade} — desempenho da equipe, comissões e o financeiro da unidade.
        </p>
      </header>

      <FiltroPeriodo periodo={periodo} onChange={setPeriodo} />

      {/* ---------------------------------------------------------------
          A CARTEIRA — o que a unidade TEM. Vem primeiro porque, depois da
          carga do Mutual, e o numero que explica a tela: a unidade com mil
          veiculos aparecia com a mesma cara de uma recem-aberta, porque o
          painel so sabia falar de lead do periodo.
      ---------------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Carteira (veículos)" valor={p?.veiculos_carteira} icon={Car} tom="destaque"
          formato="numero" carregando={isLoading}
          detalhe={composicaoDaCarteira(p)}
        />
        <Indicador
          titulo="Carteira mensal" valor={p?.carteira_mensal} icon={Wallet} tom="receita"
          carregando={isLoading}
          detalhe={
            (p?.veiculos_sem_valor ?? 0) > 0
              ? `${p?.veiculos_sem_valor} veículo(s) sem mensalidade definida`
              : 'Soma da mensalidade dos veículos na base'
          }
        />
        <Indicador
          titulo="Associados" valor={p?.associados} icon={UserRound} tom="neutro"
          formato="numero" carregando={isLoading}
          detalhe="Cadastros vinculados a esta unidade"
        />
        <Indicador
          titulo="Vendedores ativos" valor={p?.vendedores_ativos} icon={Users} tom="neutro"
          formato="numero" carregando={isLoading}
          detalhe={`${p?.vendedores_cadastrados ?? 0} cadastrado(s) na unidade`}
        />
      </div>

      {/* Veiculo ativo que nao emite boleto aqui e o estado normal da carteira
          migrada (0082) — sem dizer isso, "cade a cobranca?" vira chamado. */}
      {avisoCobrancaExterna(p) && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-[12px] leading-relaxed text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <span>{avisoCobrancaExterna(p)}</span>
        </div>
      )}

      {/* ----------------- A INADIMPLENCIA, hoje (a tela completa e /regional/cobranca) */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Associados inadimplentes" valor={Number(cob?.clientes_inadimplentes ?? 0)} icon={AlertTriangle}
          tom="alerta" formato="numero" carregando={carregandoCob}
          detalhe={`hoje · de ${Number(cob?.clientes_ativos ?? 0).toLocaleString('pt-BR')} associados com veículo na base`}
        />
        <Indicador
          titulo="Vencido em aberto" valor={Number(cob?.valor_vencido ?? 0)} icon={Wallet} tom="despesa"
          carregando={carregandoCob}
          detalhe={`hoje · ${Number(cob?.boletos_vencidos ?? 0).toLocaleString('pt-BR')} boletos, qualquer competência`}
        />
        <Link href="/regional/cobranca"
          className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-superficie p-4 text-sm font-medium text-slate-700 transition hover:border-cyan-300">
          <span>Painel de inadimplência da unidade<span className="block text-xs font-normal text-slate-500">taxas, comparativos, 12 meses e os boletos</span></span>
          <ArrowUpCircle className="h-5 w-5 rotate-45 text-cyan-600" />
        </Link>
      </div>

      {/* --------------------------------------------- A VENDA, no periodo */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="Leads no período" valor={p?.leads_periodo} icon={Zap} tom="destaque"
          formato="numero" carregando={isLoading}
          detalhe={`${p?.leads_hotlink ?? 0} vieram por hotlink · ${p?.leads_convertidos ?? 0} viraram veículo`}
        />
        <Indicador
          titulo="Taxa de conversão" valor={p?.taxa_conversao} icon={Target}
          formato="percentual"
          // Sem lead no periodo nao ha conversao a julgar: pintar de alerta
          // acusaria a unidade por uma conta que nao existe.
          tom={(p?.leads_periodo ?? 0) === 0 ? 'neutro'
            : (p?.taxa_conversao ?? 0) >= 20 ? 'receita' : 'alerta'}
          carregando={isLoading}
          detalhe={(p?.leads_periodo ?? 0) === 0
            ? 'Sem lead no período — nada a converter'
            : 'Leads que entraram na base no período'}
        />
        <Indicador
          titulo="Comissão a pagar" valor={p?.comissao_vendedores_pend} icon={HandCoins} tom="alerta"
          carregando={isLoading}
          detalhe={`Hoje · já repassado (total): ${formatCurrency(p?.comissao_vendedores_paga)}`}
        />
      </div>

      {/* ------------------------------- O DINHEIRO DA UNIDADE (so comissao) */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador titulo="A receber (unidade)" valor={p?.contas_receber_aberto} icon={ArrowUpCircle} tom="receita"
          detalhe="Comissão a receber da matriz, em aberto hoje" />
        <Indicador titulo="A pagar (unidade)" valor={p?.contas_pagar_aberto} icon={ArrowDownCircle} tom="despesa"
          detalhe="Comissão a repassar aos vendedores, em aberto hoje" />
        <Indicador
          titulo="Resultado no período" valor={p?.resultado_periodo} icon={TrendingUp}
          tom={(p?.resultado_periodo ?? 0) >= 0 ? 'receita' : 'despesa'}
          detalhe="Comissão recebida menos repassada, pela data da baixa"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ranking da equipe</CardTitle>
          <p className="text-xs text-slate-500">Leads gerados x convertidos no período.</p>
        </CardHeader>
        <CardContent>
          {ranking.length === 0 ? (
            <Vazio
              icon={Users}
              titulo="Sem movimento no período"
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
                <Bar dataKey="Convertidos" fill="#0BACE2" radius={[0, 4, 4, 0]} maxBarSize={14}>
                  {ranking.map((r) => <Cell key={r.nome} fill="#0BACE2" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
