'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight, Banknote, CheckCircle2, Landmark, Settings2, TriangleAlert, Undo2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import {
  mensagemErro,
  useCancelarTransferencia,
  useConferenciaCaixaDre,
  useConfigurarConta,
  useOperadoresConta,
  useSalvarOperadoresConta,
  useCriarTransferencia,
  useSaldosContas,
  useTransferencias,
} from '@/hooks/use-tesouraria';
import { useContasBancarias } from '@/hooks/use-financeiro';
import { ListaOperadores, NomesOperadores } from './operadores-conta';
import { hojeEmSaoPaulo } from '@/lib/baixa-banco';
import { somarMoeda } from '@/lib/money';
import { MODOS_MENSALIDADE_OFX, diaAnteriorIso, textosDeMensalidade } from '@/lib/tesouraria';
import type { ContasBancariasRow, ModoMensalidadeOfx, SaldoContaRow } from '@/lib/database.types';
import { Indicador } from './ui-financeiro';
import { BotoesExportar, Dinheiro, dataBR } from './tesouraria-ui';

/**
 * Contas e Saldos (0119): o saldo de cada conta e o SALDO TOTAL, que e a soma
 * das contas — a referencia para bater com o balancete e o DRE. Saldo =
 * saldo inicial + movimentos (baixas, titulos pagos pelo banco e
 * transferencias), a mesma fonte do extrato e do fluxo.
 */
export function SaldosContas({ onAbrirExtrato, matriz = true }: { onAbrirExtrato: (contaId: string) => void; matriz?: boolean }) {
  const hoje = hojeEmSaoPaulo();
  const [dataSaldo, setDataSaldo] = useState(hoje);
  const { data: saldos, isLoading, error } = useSaldosContas(dataSaldo);
  const { data: contas } = useContasBancarias();
  const [configurar, setConfigurar] = useState<ContasBancariasRow | null>(null);
  const [transferir, setTransferir] = useState(false);

  const mesIni = `${dataSaldo.slice(0, 8)}01`;
  const { data: conf } = useConferenciaCaixaDre(mesIni, dataSaldo);

  const total = useMemo(() => somarMoeda(...(saldos ?? []).map((s) => Number(s.saldo))), [saldos]);
  const semInicial = (saldos ?? []).filter((s) => s.movimentos > 0 && !s.saldo_inicial_em && Number(s.saldo_inicial) === 0);
  const divergentes = (saldos ?? []).filter((s) => s.extrato_diferenca !== null && Math.abs(Number(s.extrato_diferenca)) >= 0.01);
  const pendentes = (saldos ?? []).reduce((a, s) => a + s.itens_pendentes, 0);

  const tabela = () => ({
    titulo: 'Saldos das contas bancárias',
    subtitulo: `Saldo no fim do dia ${dataBR(dataSaldo)}`,
    cabecalho: ['Conta', 'Banco', 'Saldo inicial', 'Saldo inicial em', 'Entradas', 'Saídas', 'Saldo', 'Saldo no último extrato', 'Extrato em', 'Diferença'],
    linhas: (saldos ?? []).map((s) => [
      s.nome, s.banco ?? '', Number(s.saldo_inicial), dataBR(s.saldo_inicial_em), Number(s.entradas), Number(s.saidas),
      Number(s.saldo), s.extrato_saldo === null ? '' : Number(s.extrato_saldo), dataBR(s.extrato_saldo_em),
      s.extrato_diferenca === null ? '' : Number(s.extrato_diferenca),
    ]),
    rodape: ['SALDO TOTAL', '', '', '', '', '', total, '', '', ''],
    colunasMoeda: [2, 4, 5, 6, 7, 9],
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Saldo no fim do dia</span>
          <input type="date" value={dataSaldo} max={hoje} onChange={(e) => setDataSaldo(e.target.value || hoje)}
            className="tnum mt-1 block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          <BotoesExportar nome={`saldos-${dataSaldo}`} tabela={tabela} desabilitado={!saldos?.length} />
          <Button variant="secondary" onClick={() => setTransferir(true)}>
            <ArrowLeftRight className="h-4 w-4" /> Transferência entre contas
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Indicador titulo="Saldo total resumido" valor={total} icon={Landmark} tom={total < 0 ? 'despesa' : 'destaque'}
          detalhe={`Soma das ${(saldos ?? []).length} contas no fim de ${dataBR(dataSaldo)}`} carregando={isLoading} />
        <Indicador titulo="Itens do extrato a conciliar" valor={pendentes} formato="numero" icon={TriangleAlert}
          tom={pendentes ? 'alerta' : 'neutro'} detalhe="Pendentes + sugestões nos OFX importados" carregando={isLoading} />
        <Indicador titulo="Contas divergentes do banco" valor={divergentes.length} formato="numero" icon={Banknote}
          tom={divergentes.length ? 'despesa' : 'receita'}
          detalhe={divergentes.length ? 'O saldo do último OFX não bate com o sistema' : 'Todas batem com o último OFX (ou não há OFX)'}
          carregando={isLoading} />
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Não foi possível ler os saldos: {mensagemErro(error)}</p>}

      {semInicial.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {semInicial.map((s) => s.nome).join(', ')} {semInicial.length > 1 ? 'tem' : 'tem'} movimento e ainda não tem saldo inicial —
          o saldo mostrado é só a soma dos movimentos registrados. Use <b>Configurar</b> e informe o saldo do banco na data de início.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle>Saldo por conta</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Conta</th>
                <th className="px-4 py-2 text-right">Saldo inicial</th>
                <th className="px-4 py-2 text-right">Entradas</th>
                <th className="px-4 py-2 text-right">Saídas</th>
                <th className="px-4 py-2 text-right">Saldo</th>
                <th className="px-4 py-2 text-right">Último extrato (banco)</th>
                <th className="px-4 py-2">Conciliação</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(saldos ?? []).map((s) => (
                <LinhaConta key={s.conta_id} s={s}
                  onConfigurar={matriz ? () => setConfigurar((contas ?? []).find((c) => c.id === s.conta_id) ?? null) : undefined}
                  onExtrato={() => onAbrirExtrato(s.conta_id)} />
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50">
              <tr>
                <td className="px-4 py-2 font-semibold text-slate-900">Saldo total</td>
                <td colSpan={3} />
                <td className="px-4 py-2 text-right"><Dinheiro v={total} forte /></td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {matriz && conf && <ConferenciaDre conf={conf} inicio={mesIni} fim={dataSaldo} />}

      <ListaTransferencias inicio={mesIni} fim={hoje} />

      {configurar && <ModalConfigurarConta conta={configurar} onClose={() => setConfigurar(null)} />}
      {transferir && <ModalTransferencia onClose={() => setTransferir(false)} />}
    </div>
  );
}

function LinhaConta({ s, onConfigurar, onExtrato }: { s: SaldoContaRow; onConfigurar?: () => void; onExtrato: () => void }) {
  const diverge = s.extrato_diferenca !== null && Math.abs(Number(s.extrato_diferenca)) >= 0.01;
  return (
    <tr className={s.ativo ? '' : 'opacity-60'}>
      <td className="px-4 py-2.5">
        <p className="font-medium text-slate-900">{s.nome}{!s.ativo && ' (inativa)'}</p>
        <p className="text-xs text-slate-500">{s.banco ?? s.tipo ?? '—'} · {s.movimentos} movimento(s)</p>
        <NomesOperadores contaId={s.conta_id} />
      </td>
      <td className="px-4 py-2.5 text-right">
        <Dinheiro v={s.saldo_inicial} />
        <p className="text-[11px] text-slate-400">{s.saldo_inicial_em ? `em ${dataBR(s.saldo_inicial_em)}` : 'sem data'}</p>
      </td>
      <td className="px-4 py-2.5 text-right"><Dinheiro v={s.entradas} /></td>
      <td className="px-4 py-2.5 text-right"><Dinheiro v={-Number(s.saidas)} /></td>
      <td className="px-4 py-2.5 text-right"><Dinheiro v={s.saldo} forte /></td>
      <td className="px-4 py-2.5 text-right">
        {s.extrato_saldo === null ? <span className="text-xs text-slate-400">sem OFX</span> : (
          <>
            <Dinheiro v={s.extrato_saldo} />
            <p className={`text-[11px] ${diverge ? 'font-semibold text-rose-700' : 'text-emerald-700'}`}>
              {diverge ? `diferença ${Number(s.extrato_diferenca).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'bate'} · {dataBR(s.extrato_saldo_em)}
            </p>
          </>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs">
        {s.itens_pendentes > 0
          ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">{s.itens_pendentes} do extrato a conciliar</span>
          : <span className="text-slate-400">{s.ultima_importacao ? 'em dia' : '—'}</span>}
        {s.nao_conciliados > 0 && <p className="mt-0.5 text-slate-500">{s.nao_conciliados} movimento(s) sem conferência</p>}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex justify-end gap-1">
          <button onClick={onExtrato} className="rounded-md px-2 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50">Extrato</button>
          {onConfigurar && (
            <button onClick={onConfigurar} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100" title="Saldo inicial, OFX e quem opera a conta">
              <Settings2 className="h-3.5 w-3.5" /> Configurar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ConferenciaDre({ conf, inicio, fim }: { conf: NonNullable<ReturnType<typeof useConferenciaCaixaDre>['data']>; inicio: string; fim: string }) {
  const bate = Math.abs(Number(conf.diferenca)) < 0.01;
  const explicacoes = [
    { v: Number(conf.antes_do_saldo_inicial), t: 'movimentos anteriores ao saldo inicial de alguma conta (estão no DRE, não no saldo)' },
    { v: Number(conf.baixas_sem_conta), t: 'baixas sem conta bancária (estão no DRE, não no saldo)' },
    { v: Number(conf.titulos_fora_do_extrato), t: 'mensalidades (títulos) pagas sem conta definida na integração bancária' },
    { v: Number(conf.movimentos_avulsos), t: 'movimentações de caixa avulsas (DRE) sem conta' },
  ].filter((e) => Math.abs(e.v) >= 0.01);
  return (
    <Card>
      <CardHeader><CardTitle>Conferência: saldo das contas x DRE de caixa ({dataBR(inicio)} a {dataBR(fim)})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Item rotulo="Saldo no início" v={conf.saldo_inicial} />
          <Item rotulo="Saldo no fim" v={conf.saldo_final} />
          <Item rotulo="Variação do saldo" v={conf.variacao_saldo} sinal />
          <Item rotulo="Resultado do DRE (caixa)" v={conf.resultado_dre_caixa} sinal />
          <Item rotulo="Diferença" v={conf.diferenca} sinal />
        </div>
        {bate ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> A variação do saldo consolidado bate com o resultado de caixa do DRE.</p>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">A diferença se explica por:</p>
            {explicacoes.length ? (
              <ul className="mt-1 list-disc pl-5">{explicacoes.map((e) => (
                <li key={e.t}><Dinheiro v={e.v} /> — {e.t}</li>
              ))}</ul>
            ) : <p>nenhum motivo conhecido — confira lançamentos sem plano de contas ou com data fora do período.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Item({ rotulo, v, sinal }: { rotulo: string; v: number; sinal?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className="mt-0.5"><Dinheiro v={v} sinal={sinal} forte /></p>
    </div>
  );
}

function ListaTransferencias({ inicio, fim }: { inicio: string; fim: string }) {
  const { data } = useTransferencias(inicio, fim);
  const { data: contas } = useContasBancarias();
  const cancelar = useCancelarTransferencia();
  const nome = (id: string) => contas?.find((c) => c.id === id)?.nome ?? '—';
  if (!data?.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Transferências do mês</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {data.map((t) => (
              <tr key={t.id} className={t.status === 'CANCELADA' ? 'opacity-50' : ''}>
                <td className="px-4 py-2 tnum">{dataBR(t.data)}</td>
                <td className="px-4 py-2">{nome(t.conta_origem_id)} → {nome(t.conta_destino_id)}</td>
                <td className="px-4 py-2 text-slate-500">{t.descricao ?? ''}{t.status === 'CANCELADA' ? ` · cancelada: ${t.cancelada_motivo ?? ''}` : ''}</td>
                <td className="px-4 py-2 text-right"><Dinheiro v={t.valor} /></td>
                <td className="px-4 py-2 text-right">
                  {t.status === 'ATIVA' && (
                    <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Cancelar transferência"
                      onClick={() => {
                        const motivo = prompt('Motivo do cancelamento da transferência:');
                        if (motivo) cancelar.mutate({ id: t.id, motivo }, { onError: (e) => alert(mensagemErro(e)) });
                      }}>
                      <Undo2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ModalConfigurarConta({ conta, onClose }: { conta: ContasBancariasRow; onClose: () => void }) {
  const salvar = useConfigurarConta();
  const salvarOperadores = useSalvarOperadoresConta();
  const { data: operadoresAtuais } = useOperadoresConta(conta.id);
  const [operadores, setOperadores] = useState<string[] | null>(null);
  const marcados = operadores ?? operadoresAtuais ?? [];
  const [saldo, setSaldo] = useState<number | null>(Number(conta.saldo_inicial ?? 0));
  const [em, setEm] = useState(conta.saldo_inicial_em ?? '');
  const [modo, setModo] = useState<ModoMensalidadeOfx>(conta.ofx_mensalidades ?? 'POR_TEXTO');
  const [textos, setTextos] = useState((conta.ofx_textos_mensalidade ?? []).join('\n'));
  const [erro, setErro] = useState('');
  return (
    <Modal open onClose={onClose} title={`Configurar ${conta.nome}`} subtitulo="Saldo inicial, importação do OFX e quem opera a conta" tamanho="lg">
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        setErro('');
        salvar.mutate(
          { id: conta.id, saldoInicial: saldo ?? 0, saldoInicialEm: em || null, modo, textos: textosDeMensalidade(textos) },
          {
            onSuccess: () => {
              if (operadores === null) { onClose(); return; }
              salvarOperadores.mutate({ conta: conta.id, usuarios: operadores },
                { onSuccess: onClose, onError: (er) => setErro(mensagemErro(er)) });
            },
            onError: (er) => setErro(mensagemErro(er)),
          },
        );
      }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Saldo do banco no fim do dia">
            <MoneyInput value={saldo} onChange={setSaldo} />
          </FormField>
          <FormField label="Dia desse saldo">
            <Input type="date" value={em} onChange={(e) => setEm(e.target.value)} />
          </FormField>
        </div>
        <p className="text-xs text-slate-500">
          O saldo da conta passa a ser este valor mais os movimentos registrados <b>depois</b> desse dia. Movimentos
          até esse dia não entram no saldo (já estão dentro dele). Use o saldo do extrato do banco do dia anterior
          ao primeiro movimento registrado nesta conta (no Sicredi, os recebimentos automáticos começam em 13/10/2026,
          então o saldo de {dataBR(diaAnteriorIso('2026-10-13'))}).
        </p>
        <FormField label="Créditos de mensalidade no OFX">
          <Select value={modo} onChange={(e) => setModo(e.target.value as ModoMensalidadeOfx)}>
            {MODOS_MENSALIDADE_OFX.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
          </Select>
        </FormField>
        {modo === 'POR_TEXTO' && (
          <FormField label="Textos do histórico que indicam mensalidade (um por linha)">
            <Textarea rows={4} value={textos} onChange={(e) => setTextos(e.target.value)} />
          </FormField>
        )}
        <p className="text-xs text-slate-500">
          Antes da regra, todo crédito do OFX e comparado com os recebimentos que o banco já baixou sozinho (webhook):
          o que casar vira <b>sugestão de conciliação</b>, nunca um lançamento novo. A regra só decide o crédito que
          sobra — por exemplo, a liquidação de boletos que o banco credita somada no dia.
        </p>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-medium text-slate-900">Quem opera esta conta (além da matriz)</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Quem for marcado vê <b>Contas e Saldos</b> e <b>Extrato e Conciliação</b> só desta conta: importa o OFX,
            concilia e lança. Configurar a conta, o fluxo diário e o DRE continuam só da matriz.
          </p>
          <div className="mt-2"><ListaOperadores marcados={marcados} onChange={setOperadores} /></div>
        </div>
        {erro && <p className="text-sm text-rose-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvar.isPending || salvarOperadores.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ModalTransferencia({ onClose }: { onClose: () => void }) {
  const { data: contas } = useContasBancarias();
  const criar = useCriarTransferencia();
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeEmSaoPaulo());
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');
  const ativas = (contas ?? []).filter((c) => c.ativo);
  return (
    <Modal open onClose={onClose} title="Transferência entre contas" subtitulo="Muda o saldo de cada conta; não entra no DRE nem no saldo total">
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        setErro('');
        if (!origem || !destino || !valor) { setErro('Preencha origem, destino e valor.'); return; }
        criar.mutate({ origem, destino, valor, data, descricao }, { onSuccess: onClose, onError: (er) => setErro(mensagemErro(er)) });
      }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Sai de">
            <Select value={origem} onChange={(e) => setOrigem(e.target.value)}>
              <option value="">Escolha</option>
              {ativas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Entra em">
            <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Escolha</option>
              {ativas.filter((c) => c.id !== origem).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </FormField>
          <FormField label="Valor"><MoneyInput value={valor} onChange={setValor} /></FormField>
          <FormField label="Data"><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></FormField>
        </div>
        <FormField label="Descrição (opcional)"><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></FormField>
        {erro && <p className="text-sm text-rose-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={criar.isPending}>Registrar</Button>
        </div>
      </form>
    </Modal>
  );
}
