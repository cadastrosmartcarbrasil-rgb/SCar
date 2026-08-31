'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Ban, Check, Plus, Scale, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import {
  FiltroPeriodo, Indicador, Vazio, periodoPreset, type Periodo,
} from '@/components/financeiro/ui-financeiro';
import {
  useBaixarTituloRegional, useCancelarTituloRegional, useLancarTituloRegional,
  useResumoFinanceiroRegional, useTitulosRegional, useVendedoresDaUnidade,
} from '@/hooks/use-regional';
import {
  FORMAS_PAGAMENTO, MOVIMENTOS_REGIONAIS, ROTULO_FORMA, SITUACOES_REGIONAIS,
  movimentoRegional, totaisDaFila, validarLancamentoRegional,
} from '@/lib/regional-financeiro';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { TituloRegionalRow } from '@/lib/database.types';

const CLASSE_SITUACAO: Record<string, string> = {
  aberto:    'bg-slate-50 text-slate-600 ring-slate-200',
  parcial:   'bg-amber-50 text-amber-700 ring-amber-200',
  vencido:   'bg-rose-50 text-rose-700 ring-rose-200',
  quitado:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelado: 'bg-slate-100 text-slate-400 ring-slate-200',
};

function SeloSituacao({ situacao }: { situacao: string }) {
  const rotulo = SITUACOES_REGIONAIS.find((s) => s.chave === situacao)?.rotulo ?? situacao;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
      CLASSE_SITUACAO[situacao] ?? CLASSE_SITUACAO.aberto}`}>
      {rotulo}
    </span>
  );
}

/**
 * Financeiro da franquia — a versao COMPACTA.
 *
 * A operacao inteira (mensalidade, evento, assistencia, fornecedor) e da
 * matriz. A unidade so movimenta comissao: a que recebe da matriz e a que
 * repassa aos vendedores. Por isso aqui nao ha plano de contas, centro de
 * custo nem conta bancaria — cadastros da matriz, que a franquia nao cria.
 * A classificacao contabil vem pronta no movimento e a baixa registra a forma.
 */
export function FinanceiroRegional({ regionalId }: { regionalId: string | null }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoPreset('mes'));
  const [tipo, setTipo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [novo, setNovo] = useState(false);
  const [baixando, setBaixando] = useState<TituloRegionalRow | null>(null);
  const [cancelando, setCancelando] = useState<TituloRegionalRow | null>(null);

  const escopo = { regionalId, ...periodo };
  const { data: resumo } = useResumoFinanceiroRegional(escopo);
  const { data: titulos, isLoading } = useTitulosRegional({ ...escopo, tipo, situacao });

  const emTela = useMemo(() => totaisDaFila(titulos ?? []), [titulos]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          titulo="A receber da matriz" valor={resumo?.a_receber_aberto} icon={ArrowDownCircle} tom="receita"
          detalhe={Number(resumo?.a_receber_vencido ?? 0) > 0
            ? `${formatCurrency(Number(resumo?.a_receber_vencido))} vencido`
            : 'nada vencido'}
        />
        <Indicador
          titulo="A pagar aos vendedores" valor={resumo?.a_pagar_aberto} icon={ArrowUpCircle} tom="despesa"
          detalhe={Number(resumo?.a_pagar_vencido ?? 0) > 0
            ? `${formatCurrency(Number(resumo?.a_pagar_vencido))} vencido`
            : 'nada vencido'}
        />
        <Indicador
          titulo="Saldo liquidado no periodo" valor={resumo?.saldo_periodo} icon={Scale}
          tom={Number(resumo?.saldo_periodo ?? 0) >= 0 ? 'receita' : 'despesa'}
          detalhe={`${formatCurrency(Number(resumo?.recebido_periodo ?? 0))} recebido · ${formatCurrency(Number(resumo?.pago_periodo ?? 0))} pago`}
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <FiltroPeriodo periodo={periodo} onChange={setPeriodo}>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full sm:w-44">
              <option value="">Receber e pagar</option>
              <option value="RECEITA">Só a receber</option>
              <option value="DESPESA">Só a pagar</option>
            </Select>
            <Select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="w-full sm:w-40">
              <option value="">Todas as situações</option>
              {SITUACOES_REGIONAIS.map((s) => (
                <option key={s.chave} value={s.chave}>{s.rotulo}</option>
              ))}
            </Select>
            <Button onClick={() => setNovo(true)} className="w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" /> Novo lançamento
            </Button>
          </FiltroPeriodo>

          {isLoading ? (
            <div className="space-y-2 py-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
            </div>
          ) : (titulos ?? []).length === 0 ? (
            <Vazio
              icon={Wallet}
              titulo="Nenhum lançamento no período"
              descricao="Aqui ficam a comissão que a matriz repassa à sua unidade e o repasse aos seus vendedores."
              acao={<Button onClick={() => setNovo(true)}><Plus className="mr-1.5 h-4 w-4" /> Novo lançamento</Button>}
            />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Vencimento</th>
                    <th className="px-3 py-2">Lançamento</th>
                    <th className="px-3 py-2">Favorecido</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-right">Saldo</th>
                    <th className="px-3 py-2">Situação</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(titulos ?? []).map((t) => {
                    const receita = t.tipo === 'RECEITA';
                    const aberto = t.situacao !== 'quitado' && t.situacao !== 'cancelado';
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/70">
                        <td className="tnum whitespace-nowrap px-3 py-2 text-slate-600">
                          {formatDate(t.data_vencimento)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-800">{t.descricao}</span>
                          <span className={`ml-2 text-[11px] font-semibold ${receita ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {receita ? 'a receber' : 'a pagar'}
                          </span>
                          {t.observacoes && (
                            <p className="mt-0.5 text-[11px] text-slate-400">{t.observacoes}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{t.favorecido ?? '—'}</td>
                        <td className="tnum px-3 py-2 text-right text-slate-700">
                          {formatCurrency(Number(t.valor_original))}
                        </td>
                        <td className={`tnum px-3 py-2 text-right font-semibold ${
                          Number(t.valor_saldo) > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                          {formatCurrency(Number(t.valor_saldo))}
                        </td>
                        <td className="px-3 py-2"><SeloSituacao situacao={t.situacao} /></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {aberto && (
                            <>
                              <button
                                onClick={() => setBaixando(t)}
                                className="rounded-lg px-2 py-1 text-[12px] font-semibold text-brand-700 hover:bg-brand-50"
                              >
                                {receita ? 'Recebi' : 'Paguei'}
                              </button>
                              {Number(t.valor_pago) === 0 && (
                                <button
                                  onClick={() => setCancelando(t)}
                                  className="ml-1 rounded-lg px-2 py-1 text-[12px] text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                                >
                                  Cancelar
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 text-[12px] font-semibold text-slate-600">
                    <td className="px-3 py-2" colSpan={4}>Em aberto nesta lista</td>
                    <td className="tnum px-3 py-2 text-right">
                      <span className="text-emerald-700">{formatCurrency(emTela.receber)}</span>
                      <span className="mx-1 text-slate-300">/</span>
                      <span className="text-rose-700">{formatCurrency(emTela.pagar)}</span>
                    </td>
                    <td className="px-3 py-2" colSpan={2}>
                      <span className={emTela.saldo >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                        saldo {formatCurrency(emTela.saldo)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {novo && <ModalLancamento regionalId={regionalId} onClose={() => setNovo(false)} />}
      {baixando && <ModalBaixa titulo={baixando} onClose={() => setBaixando(null)} />}
      {cancelando && <ModalCancelar titulo={cancelando} onClose={() => setCancelando(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Novo lancamento — sem plano de contas, sem centro de custo, sem conta.
// ---------------------------------------------------------------------------
function ModalLancamento({ regionalId, onClose }: { regionalId: string | null; onClose: () => void }) {
  const [tipo, setTipo] = useState<string>('COMISSAO_RECEBER');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [vencimento, setVencimento] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const { data: vendedores } = useVendedoresDaUnidade(regionalId);
  const lancar = useLancarTituloRegional();
  const mov = movimentoRegional(tipo);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const erro = validarLancamentoRegional({
      tipo, descricao, valor, vencimento, vendedorId: vendedorId || null,
    });
    if (erro) return toast.error(erro);

    lancar.mutate(
      {
        regionalId, tipo, descricao: descricao.trim(), valor: valor as number,
        vencimento, vendedorId: vendedorId || null, observacoes: observacoes || null,
      },
      {
        onSuccess: () => { toast.success('Lançamento registrado'); onClose(); },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Novo lançamento da unidade"
      subtitulo="A classificação contábil é resolvida pelo sistema.">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {MOVIMENTOS_REGIONAIS.map((m) => (
            <button
              key={m.chave} type="button" onClick={() => setTipo(m.chave)}
              className={`rounded-xl border p-3 text-left transition ${
                tipo === m.chave
                  ? 'border-cyan-400 bg-cyan-50/60 ring-1 ring-cyan-300'
                  : 'border-slate-200 hover:border-slate-300'}`}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                {m.tipo === 'RECEITA'
                  ? <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                  : <ArrowUpCircle className="h-4 w-4 text-rose-600" />}
                {m.rotulo}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{m.ajuda}</span>
            </button>
          ))}
        </div>

        <FormField label="Descrição">
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder={mov?.tipo === 'RECEITA' ? 'Comissão de agosto/2026' : 'Repasse de agosto - Amanda'} />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Valor">
            <MoneyInput value={valor} onChange={setValor} />
          </FormField>
          <FormField label="Vencimento">
            <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </FormField>
        </div>

        {mov?.pedeVendedor && (
          <FormField label="Vendedor que vai receber">
            <Select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
              <option value="">Selecione…</option>
              {(vendedores ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.nome ?? 'sem nome'}</option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField label="Observação">
          <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </FormField>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          Classificação contábil: <b>{mov?.categoria} · {mov?.categoriaNome}</b>. A unidade não escolhe
          plano de contas — a estrutura contábil é da matriz e chega pronta aqui.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={lancar.isPending}>
            {lancar.isPending ? 'Salvando…' : 'Lançar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Baixa: data, valor e COMO. Sem conta bancaria da matriz.
// ---------------------------------------------------------------------------
function ModalBaixa({ titulo, onClose }: { titulo: TituloRegionalRow; onClose: () => void }) {
  const saldo = Number(titulo.valor_saldo);
  const receita = titulo.tipo === 'RECEITA';
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  // A baixa quase sempre e do valor cheio: o campo ja nasce com o saldo.
  const [valor, setValor] = useState<number | null>(saldo);
  const [forma, setForma] = useState<string>('PIX');
  const [observacao, setObservacao] = useState('');
  const baixar = useBaixarTituloRegional();

  const parcial = (valor ?? 0) > 0 && (valor ?? 0) < saldo;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valor || valor <= 0) return toast.error('Informe o valor');
    if (valor > saldo) return toast.error('O valor não pode passar do saldo em aberto');
    baixar.mutate(
      { id: titulo.id, data, valor, forma, observacao: observacao || null },
      {
        onSuccess: () => { toast.success(receita ? 'Recebimento registrado' : 'Pagamento registrado'); onClose(); },
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={receita ? 'Registrar recebimento' : 'Registrar pagamento'}
      subtitulo={titulo.descricao}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="text-[12px] text-slate-500">Saldo em aberto</span>
          <span className="tnum text-[15px] font-bold text-slate-900">{formatCurrency(saldo)}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={receita ? 'Data do recebimento' : 'Data do pagamento'}>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </FormField>
          <FormField label="Valor">
            <MoneyInput value={valor} onChange={setValor} />
          </FormField>
        </div>

        <FormField label={receita ? 'Como recebeu' : 'Como pagou'}>
          <Select value={forma} onChange={(e) => setForma(e.target.value)}>
            {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{ROTULO_FORMA[f]}</option>)}
          </Select>
        </FormField>

        <FormField label="Observação">
          <Input value={observacao} onChange={(e) => setObservacao(e.target.value)}
            placeholder="comprovante, referência…" />
        </FormField>

        {parcial && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Baixa parcial: restam {formatCurrency(saldo - (valor ?? 0))} em aberto.
            {' '}
            <button type="button" onClick={() => setValor(saldo)} className="font-semibold underline">
              usar o saldo total
            </button>
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
          <Button type="submit" disabled={baixar.isPending}>
            <Check className="mr-1.5 h-4 w-4" />
            {baixar.isPending ? 'Registrando…' : 'Confirmar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ModalCancelar({ titulo, onClose }: { titulo: TituloRegionalRow; onClose: () => void }) {
  const [motivo, setMotivo] = useState('');
  const cancelar = useCancelarTituloRegional();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) return toast.error('Informe o motivo');
    cancelar.mutate({ id: titulo.id, motivo: motivo.trim() }, {
      onSuccess: () => { toast.success('Lançamento cancelado'); onClose(); },
      onError: (e: unknown) => toast.error((e as Error).message),
    });
  }

  return (
    <Modal open onClose={onClose} title="Cancelar lançamento" subtitulo={titulo.descricao} tamanho="md">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] leading-relaxed text-slate-500">
          O lançamento não é apagado: ele fica no histórico com a situação <b>cancelado</b> e o motivo.
        </p>
        <FormField label="Motivo">
          <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Voltar</Button>
          <Button type="submit" variant="danger" disabled={cancelar.isPending}>
            <Ban className="mr-1.5 h-4 w-4" /> Cancelar lançamento
          </Button>
        </div>
      </form>
    </Modal>
  );
}
