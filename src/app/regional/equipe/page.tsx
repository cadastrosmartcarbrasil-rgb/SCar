'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Pencil, Plus, Power, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FiltroPeriodo, Vazio, periodoPreset, type Periodo } from '@/components/financeiro/ui-financeiro';
import { ModalVendedor } from '@/components/vendedores/modal-vendedor';
import { useDesempenhoEquipe } from '@/hooks/use-regional';
import { useAlternarVendedorAtivo, useVendedoresLista } from '@/hooks/use-vendedores';
import { formatCurrency } from '@/lib/utils';
import {
  avisoDeSituacaoVendedor, filtrarEquipe, hotlinkResolve, resumoDaEquipe,
  type FiltroEquipe,
} from '@/lib/regional';
import type { VendedoresRow } from '@/lib/database.types';
import { useUnidadeAtual } from '@/components/regional/contexto-unidade';

const pct = (v: number) => `${(Number(v) * 100).toFixed(2).replace('.00', '').replace('.', ',')}%`;

const ABAS: Array<{ valor: FiltroEquipe; rotulo: string }> = [
  { valor: 'ativos', rotulo: 'Ativos' },
  { valor: 'inativos', rotulo: 'Inativos' },
  { valor: 'todos', rotulo: 'Todos' },
];

export default function EquipeRegionalPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [filtro, setFiltro] = useState<FiltroEquipe>('ativos');
  const { regionalId } = useUnidadeAtual();
  const { data: equipe, isLoading } = useDesempenhoEquipe({ regionalId, ...periodo });

  // A franquia cadastra a propria equipe aqui dentro — sem voltar ao sistema
  // de gestao. `listar_vendedores` ja limita a unidade de quem chama, e a RLS
  // de `vendedores` so deixa o gestor escrever na propria regional.
  // Antes vinha do cadastro de quem olha — o que deixava a tela vazia para a
  // matriz, que nao tem regional propria. Agora vem da unidade em visualizacao.
  const { data: cadastros } = useVendedoresLista({ regionalId });
  const [editando, setEditando] = useState<Partial<VendedoresRow> | null>(null);
  const alternar = useAlternarVendedorAtivo();

  const porId = useMemo(
    () => new Map((cadastros ?? []).map((v) => [v.id, v])),
    [cadastros],
  );

  // O resumo sai da equipe INTEIRA; a tabela, do recorte escolhido. A
  // importacao de vendedores (0069) entra com todos INATIVOS de proposito,
  // entao mostrar so os ativos faria a unidade que importou 66 pessoas parecer
  // ter dois vendedores — e nao haveria de onde ativar os outros.
  const resumo = useMemo(() => resumoDaEquipe(equipe), [equipe]);
  const lista = useMemo(() => filtrarEquipe(equipe, filtro), [equipe, filtro]);

  function novo() {
    setEditando({ regional_id: regionalId, ativo: true });
  }

  function editar(vendedorId: string) {
    const v = porId.get(vendedorId);
    if (!v) return toast.error('Não consegui carregar o cadastro deste vendedor');
    setEditando({
      id: v.id, nome: v.nome, email: v.email, telefone: v.telefone, documento: v.documento,
      codigo: v.codigo, regional_id: v.regional_id, usuario_id: v.usuario_id,
      taxa_comissao_adesao: v.taxa_comissao_adesao, taxa_comissao_recorrente: v.taxa_comissao_recorrente,
      dia_pagto_entrada: v.dia_pagto_entrada, dia_pagto_recorrencia: v.dia_pagto_recorrencia,
      banco: v.banco, agencia: v.agencia, conta: v.conta, chave_pix: v.chave_pix,
      observacoes: v.observacoes, ativo: v.ativo,
    });
  }

  async function alternarSituacao(id: string, nome: string, ativoAgora: boolean) {
    if (!confirm(avisoDeSituacaoVendedor(nome, ativoAgora))) return;
    try {
      await alternar.mutateAsync({ id, ativo: !ativoAgora });
      toast.success(ativoAgora ? `${nome} foi inativado` : `${nome} foi ativado`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function copiar(codigo: string, nome: string) {
    const url = `${window.location.origin}/v/${codigo}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success(`Hotlink de ${nome} copiado`),
      () => toast.error(`Copie manualmente: ${url}`),
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Minha Equipe</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Desempenho por vendedor no período, com o hotlink de cada um.
          </p>
        </div>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Cadastrar vendedor
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-superficie p-0.5">
          {ABAS.map((a) => (
            <button
              key={a.valor}
              onClick={() => setFiltro(a.valor)}
              className={`rounded-[10px] px-3 py-1.5 text-xs font-semibold transition ${
                filtro === a.valor ? 'bg-acao text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {a.rotulo}
              <span className="tnum ml-1.5 opacity-70">
                {a.valor === 'ativos' ? resumo.ativos : a.valor === 'inativos' ? resumo.inativos : resumo.cadastrados}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          <b className="tnum text-slate-700">{resumo.cadastrados}</b> cadastrado(s) nesta unidade ·{' '}
          <b className="tnum text-slate-700">{resumo.ativos}</b> ativo(s)
          {resumo.inativos > 0 && (
            <>
              {' '}· <b className="tnum text-amber-700">{resumo.inativos}</b> aguardando ativação
            </>
          )}
        </p>
      </div>

      <FiltroPeriodo periodo={periodo} onChange={setPeriodo} />

      <Card>
        <CardContent className="overflow-x-auto pt-5">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-slate-400">Carregando...</p>
          ) : lista.length === 0 ? (
            <Vazio
              icon={Users}
              titulo={
                resumo.cadastrados === 0
                  ? 'Nenhum vendedor na unidade'
                  : filtro === 'ativos'
                    ? 'Nenhum vendedor ativo'
                    : 'Nenhum vendedor inativo'
              }
              descricao={
                resumo.cadastrados === 0
                  ? 'Cadastre a sua equipe para acompanhar o desempenho e distribuir os hotlinks de venda.'
                  : filtro === 'ativos'
                    ? `Há ${resumo.inativos} cadastrado(s) aguardando ativação. Abra "Inativos" e ligue quem já está vendendo.`
                    : 'Toda a equipe cadastrada está ativa.'
              }
              acao={
                resumo.cadastrados === 0
                  ? <Button onClick={novo}><Plus className="h-4 w-4" /> Cadastrar vendedor</Button>
                  : filtro === 'ativos'
                    ? <Button variant="secondary" onClick={() => setFiltro('inativos')}>Ver os inativos</Button>
                    : undefined
              }
            />
          ) : (
            <table className="w-full min-w-[840px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[0.6875rem] uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 font-semibold">Vendedor</th>
                  <th className="py-2.5 text-right font-semibold">Leads</th>
                  <th className="py-2.5 text-right font-semibold">Convertidos</th>
                  <th className="py-2.5 text-right font-semibold">Conversão</th>
                  <th className="py-2.5 text-right font-semibold">Comissão no período</th>
                  <th className="py-2.5 text-right font-semibold">A pagar hoje</th>
                  <th className="py-2.5 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((v) => (
                  <tr key={v.vendedor_id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                        {v.nome}
                        {!v.ativo && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-slate-500">
                            inativo
                          </span>
                        )}
                      </span>
                      <span className="block text-[0.6875rem] text-slate-400">
                        <span className="font-mono">{v.codigo}</span> · entrada {pct(v.taxa_adesao)} · recorrência {pct(v.taxa_recorrente)}
                      </span>
                    </td>
                    <td className="tnum py-2.5 text-right text-slate-700">
                      {v.leads}
                      {v.leads_hotlink > 0 && (
                        <span className="ml-1 text-[0.6875rem] text-cyan-600">({v.leads_hotlink} link)</span>
                      )}
                    </td>
                    <td className="tnum py-2.5 text-right font-medium text-slate-800">{v.convertidos}</td>
                    <td className="py-2.5 text-right">
                      <span className={`tnum rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                        v.leads === 0 ? 'bg-slate-100 text-slate-400'
                        : v.taxa_conversao >= 30 ? 'bg-emerald-50 text-emerald-700'
                        : v.taxa_conversao >= 15 ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                      }`}>
                        {v.leads === 0 ? '—' : `${v.taxa_conversao.toFixed(1).replace('.', ',')}%`}
                      </span>
                    </td>
                    <td className="tnum py-2.5 text-right text-slate-700">{formatCurrency(v.comissao_total)}</td>
                    <td className={`tnum py-2.5 text-right font-semibold ${v.comissao_pendente > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                      {formatCurrency(v.comissao_pendente)}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => alternarSituacao(v.vendedor_id, v.nome, v.ativo)}
                          disabled={alternar.isPending}
                          title={v.ativo ? `Inativar ${v.nome}` : `Ativar ${v.nome}`}
                          className={`inline-grid h-7 w-7 place-items-center rounded-lg border transition disabled:opacity-50 ${
                            v.ativo
                              ? 'border-slate-200 text-emerald-600 hover:bg-emerald-50'
                              : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => editar(v.vendedor_id)}
                          title={`Editar ${v.nome}`}
                          className="inline-grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {/* Hotlink de inativo nao resolve (0035/0067): copiar
                            seria distribuir um link morto. */}
                        <button
                          onClick={() => copiar(v.codigo, v.nome)}
                          disabled={!hotlinkResolve(v)}
                          title={
                            hotlinkResolve(v)
                              ? `Copiar hotlink de ${v.nome}`
                              : 'O hotlink só funciona com o vendedor ativo'
                          }
                          className="inline-grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 text-xs">
                  <td className="py-3 font-semibold text-slate-600">
                    <TrendingUp className="mr-1.5 inline h-3.5 w-3.5 text-slate-400" />
                    {lista.length} vendedor(es) em tela
                  </td>
                  <td className="tnum py-3 text-right">{lista.reduce((s, v) => s + v.leads, 0)}</td>
                  <td className="tnum py-3 text-right">{lista.reduce((s, v) => s + v.convertidos, 0)}</td>
                  <td />
                  <td className="tnum py-3 text-right">{formatCurrency(lista.reduce((s, v) => s + Number(v.comissao_total), 0))}</td>
                  <td className="tnum py-3 text-right font-bold text-amber-700">
                    {formatCurrency(lista.reduce((s, v) => s + Number(v.comissao_pendente), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-[0.6875rem] leading-relaxed text-slate-400">
        A unidade <b>cadastra</b>, <b>ativa</b> e <b>inativa</b> a própria equipe. Inativar não apaga
        nada — o vendedor sai do hotlink e do rodízio, e o que ele já trouxe continua no histórico.
        <b> Excluir o cadastro é só a matriz</b> (Configurações &rarr; Vendedores).
      </p>

      {editando && (
        <ModalVendedor
          inicial={editando}
          regionalFixa={regionalId}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
