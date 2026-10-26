'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ChevronRight, History, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { useDeleteCategoria, useMigracaoPlano, usePlanoContas, useSaveCategoria } from '@/hooks/use-config';
import { useAcoesNaAba } from '@/hooks/use-permissoes';
import type { CategoriasDreRow } from '@/lib/database.types';
import {
  NATUREZAS, codigoValido, contaDuplicada, ehAnalitica, metaNatureza, naturezaDe, naturezaPorCodigo,
  nomeNormalizado, ordenarPlano, profundidade, validarConta,
} from '@/lib/plano-contas';

type Edicao = Partial<CategoriasDreRow>;

/**
 * Plano de contas padrao (0152): arvore por codigo, contas sinteticas (agrupam)
 * e analiticas (recebem lancamento), natureza (balanco ou DRE) e o de-para da
 * migracao do plano anterior. Antes de criar, a tela procura a conta pelo
 * codigo e pela descricao exata — o banco confere de novo.
 */
export default function PlanoContasPage() {
  const { data: categorias, isLoading } = usePlanoContas();
  const { data: migracao } = useMigracaoPlano();
  const salvar = useSaveCategoria();
  const excluir = useDeleteCategoria();
  const pode = useAcoesNaAba('cfg_plano_contas');

  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState<Edicao | null>(null);
  const [busca, setBusca] = useState('');
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const [verMigracao, setVerMigracao] = useState(false);

  const plano = useMemo(() => ordenarPlano(categorias ?? []), [categorias]);
  const codigos = useMemo(() => plano.map((c) => c.codigo_estruturado), [plano]);

  const visiveis = useMemo(() => {
    const termo = nomeNormalizado(busca);
    if (termo) {
      return plano.filter((c) => nomeNormalizado(c.nome).includes(termo) || c.codigo_estruturado.startsWith(busca.trim()));
    }
    return plano.filter((c) => ![...fechadas].some((f) => c.codigo_estruturado.startsWith(`${f}.`)));
  }, [plano, busca, fechadas]);

  const temFilhas = (codigo: string) => codigos.some((c) => c.startsWith(`${codigo}.`));
  const alternar = (codigo: string) =>
    setFechadas((s) => {
      const n = new Set(s);
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo);
      return n;
    });

  const migradas = (migracao ?? []).filter((m) => m.acao === 'RECODIFICADA');
  const semCorrespondencia = (migracao ?? []).filter((m) => m.acao === 'SEM_CORRESPONDENCIA');

  function novo(mae?: CategoriasDreRow) {
    setEd({ codigo_estruturado: mae ? `${mae.codigo_estruturado}.` : '', nome: '', analitica: true, ativo: true, natureza: null });
    setAberto(true);
  }

  const duplicada = ed?.codigo_estruturado && ed?.nome
    ? contaDuplicada({ id: ed.id, codigo_estruturado: ed.codigo_estruturado, nome: ed.nome }, plano)
    : null;
  const naturezaSugerida = ed?.codigo_estruturado && codigoValido(ed.codigo_estruturado)
    ? naturezaPorCodigo(ed.codigo_estruturado) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed) return;
    const erro = validarConta(
      { id: ed.id, codigo_estruturado: ed.codigo_estruturado ?? '', nome: ed.nome ?? '' }, plano);
    if (erro) return toast.error(erro);
    salvar.mutate({ ...ed, natureza: ed.natureza || naturezaSugerida }, {
      onSuccess: () => {
        toast.success('Conta salva');
        setAberto(false);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Plano de contas padrão. As contas <strong>sintéticas</strong> agrupam; só as{' '}
          <strong>analíticas</strong> recebem lançamento. A natureza decide onde a conta aparece: balanço
          (ativo, passivo, PL) ou DRE (receita, deduções, custos, despesas, resultado financeiro).
        </p>
        <div className="flex items-center gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar código ou descrição"
              className="w-60 rounded-lg border border-slate-300 bg-superficie py-2 pl-8 pr-3 text-sm focus:border-cyan-500 focus:outline-none"
            />
          </label>
          {pode.criar && (
            <Button onClick={() => novo()}>
              <Plus className="h-4 w-4" /> Nova conta
            </Button>
          )}
        </div>
      </div>

      {semCorrespondencia.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {semCorrespondencia.length} conta(s) do plano anterior não tinham correspondente e ficaram com o
            código antigo ({semCorrespondencia.map((m) => m.codigo_antigo).join(', ')}). Edite e dê a elas um
            código do plano padrão.
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-superficie-alta text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Código / Descrição</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Natureza</th>
              <th className="px-3 py-2">Grupo / destino</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>
            )}
            {visiveis.map((c) => {
              const nat = metaNatureza(naturezaDe(c));
              const nivel = profundidade(c.codigo_estruturado, codigos);
              const sintetica = !ehAnalitica(c);
              const filhas = sintetica && temFilhas(c.codigo_estruturado);
              return (
                <tr key={c.id} className={`border-b border-slate-100 last:border-0 ${sintetica ? 'bg-slate-50/60' : ''}`}>
                  <td className="py-1.5 pr-3" style={{ paddingLeft: `${16 + nivel * 18}px` }}>
                    <div className="flex items-center gap-1.5">
                      {filhas && !busca ? (
                        <button
                          type="button"
                          onClick={() => alternar(c.codigo_estruturado)}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                          aria-label={fechadas.has(c.codigo_estruturado) ? 'Abrir grupo' : 'Fechar grupo'}
                        >
                          {fechadas.has(c.codigo_estruturado)
                            ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      ) : <span className="w-4" />}
                      <span className="font-mono text-xs text-slate-500">{c.codigo_estruturado}</span>
                      <span className={sintetica ? 'font-semibold text-slate-800' : 'text-slate-700'}>{c.nome}</span>
                      {c.codigo_anterior && (
                        <span className="text-[11px] text-slate-400" title="Código no plano anterior">
                          (antes {c.codigo_anterior})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {sintetica ? <span className="text-slate-500">Sintética</span> : <span className="text-slate-700">Analítica</span>}
                    {c.automatica && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500"
                        title="Alimentada pelo sistema (saldos, a receber, a pagar): não recebe lançamento direto">
                        <Lock className="h-3 w-3" /> automática
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {nat && <span className={`rounded px-2 py-0.5 text-xs ${nat.cor}`}>{nat.rotulo}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-500">{c.destino ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs">
                    <span className={c.ativo ? 'text-emerald-600' : 'text-slate-400'}>{c.ativo ? 'Ativa' : 'Inativa'}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex justify-end gap-1">
                      {pode.criar && sintetica && (
                        <button onClick={() => novo(c)} title="Nova conta abaixo desta"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                      {pode.editar && (
                        <button onClick={() => { setEd(c); setAberto(true); }} title="Editar"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {pode.excluir && !c.automatica && (
                        <button
                          title="Excluir"
                          onClick={() => {
                            if (confirm(`Excluir a conta ${c.codigo_estruturado} "${c.nome}"?`))
                              excluir.mutate(c.id, {
                                onSuccess: () => toast.success('Conta excluída'),
                                onError: (e) => toast.error((e as Error).message),
                              });
                          }}
                          className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && visiveis.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nenhuma conta encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {migradas.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-superficie">
          <button
            type="button"
            onClick={() => setVerMigracao((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700"
          >
            <History className="h-4 w-4 text-slate-400" />
            Migração do plano anterior: {migradas.length} contas recodificadas (lançamentos preservados)
            {verMigracao ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronRight className="ml-auto h-4 w-4" />}
          </button>
          {verMigracao && (
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="text-left uppercase text-slate-400">
                    <th className="px-4 py-2">Código anterior</th>
                    <th className="px-3 py-2">Descrição anterior</th>
                    <th className="px-3 py-2">Código novo</th>
                    <th className="px-3 py-2">Descrição nova</th>
                    <th className="px-3 py-2 text-right">Lançamentos</th>
                  </tr>
                </thead>
                <tbody>
                  {migradas.map((m) => (
                    <tr key={m.id} className="border-t border-slate-50">
                      <td className="px-4 py-1.5 font-mono text-slate-500">{m.codigo_antigo}</td>
                      <td className="px-3 py-1.5 text-slate-500">{m.nome_antigo}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-700">{m.codigo_novo}</td>
                      <td className="px-3 py-1.5 text-slate-700">{m.nome_novo}</td>
                      <td className="tnum px-3 py-1.5 text-right text-slate-600">{m.lancamentos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={aberto} onClose={() => setAberto(false)} title={ed?.id ? 'Editar conta' : 'Nova conta'} tamanho="lg">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Código *">
              <Input
                value={ed?.codigo_estruturado ?? ''}
                onChange={(e) => setEd((p) => ({ ...p, codigo_estruturado: e.target.value }))}
                placeholder="4.2.1.08"
              />
            </FormField>
            <FormField label="Descrição da conta *" className="sm:col-span-2">
              <Input value={ed?.nome ?? ''} onChange={(e) => setEd((p) => ({ ...p, nome: e.target.value }))} caixa="original" />
            </FormField>
          </div>

          {duplicada && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                Já existe {duplicada.motivo === 'codigo' ? 'uma conta com este código' : 'uma conta com esta descrição'}:{' '}
                <strong>{duplicada.conta.codigo_estruturado} — {duplicada.conta.nome}</strong>. Use a conta existente.
              </span>
              {pode.editar && (
                <button type="button" onClick={() => setEd(duplicada.conta)}
                  className="rounded border border-amber-400 px-2 py-0.5 text-xs font-medium hover:bg-amber-100">
                  Abrir a existente
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Tipo *">
              <Select
                value={ed?.analitica === false ? 'S' : 'A'}
                onChange={(e) => setEd((p) => ({ ...p, analitica: e.target.value === 'A' }))}
              >
                <option value="A">Analítica (recebe lançamento)</option>
                <option value="S">Sintética (só agrupa)</option>
              </Select>
            </FormField>
            <FormField label="Natureza *">
              <Select
                value={ed?.natureza ?? ''}
                onChange={(e) => setEd((p) => ({ ...p, natureza: e.target.value || null }))}
              >
                <option value="">
                  {naturezaSugerida ? `Pelo código: ${metaNatureza(naturezaSugerida)?.rotulo}` : 'Escolha'}
                </option>
                {NATUREZAS.map((n) => <option key={n.valor} value={n.valor}>{n.rotulo}</option>)}
              </Select>
            </FormField>
            <FormField label="Grupo / destino">
              <Input value={ed?.destino ?? ''} onChange={(e) => setEd((p) => ({ ...p, destino: e.target.value }))}
                placeholder="Fluxo de Caixa / Saídas Adm" caixa="original" />
            </FormField>
          </div>

          {ed?.automatica && (
            <p className="text-xs text-slate-500">
              Conta alimentada pelo sistema (saldos das contas, títulos a receber e a pagar): não recebe lançamento direto.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={ed?.ativo ?? true}
              onChange={(e) => setEd((p) => ({ ...p, ativo: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Conta ativa
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending || !!duplicada}>
              {salvar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
