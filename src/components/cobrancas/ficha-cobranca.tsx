'use client';

import { useMemo, useState } from 'react';
import { Ban, Loader2, MessageCircle, Phone, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { ErroLeitura } from '@/components/integracao/erro-leitura';
import {
  useCancelarAcordoCobranca, useCobrancaAcordosCliente, useCobrancaBoletosCliente,
  useCobrancaContatosCliente, useRegistrarContatoCobranca,
} from '@/hooks/use-cobranca-fila';
import {
  CANAIS, RESULTADOS, ROTULO_PARCELA, STATUS_ACORDO, mensagemCobranca, parcelasIguais,
  somarDias, validarAcordo, type Canal, type ParcelaRascunho, type Resultado, type TipoAcordo,
} from '@/lib/cobranca-fila';
import { ROTULO_SITUACAO, type SituacaoBoleto } from '@/lib/cobranca-painel';
import { linkWhatsAppAssociado } from '@/lib/protocolos';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { CobrancaAcordoSituacao, CobrancaFilaLinha } from '@/lib/database.types';

const hoje = () => new Date().toLocaleDateString('sv-SE'); // aaaa-mm-dd no fuso local

const CLASSE_STATUS: Record<string, string> = {
  EM_ANDAMENTO: 'bg-cyan-50 text-cyan-700',
  CUMPRIDO: 'bg-emerald-50 text-emerald-700',
  QUEBRADO: 'bg-rose-50 text-rose-700',
  CANCELADO: 'bg-slate-100 text-slate-500',
  cumprida: 'text-emerald-700',
  quebrada: 'text-rose-700',
  aguardando_baixa: 'text-amber-700',
  a_vencer: 'text-slate-500',
};

/**
 * A ficha do associado na cobranca: a divida aberta, o registro do contato
 * (com a promessa/acordo, quando ele prometeu) e o historico — que nao se
 * edita nem se apaga.
 */
export function FichaCobranca({ linha, onClose }: { linha: CobrancaFilaLinha | null; onClose: () => void }) {
  const clienteId = linha?.cliente_id ?? null;
  return (
    <Modal open={!!linha} onClose={onClose} tamanho="xl"
      title={linha?.associado ?? 'Associado'}
      subtitulo={linha ? `${linha.regional} · ${linha.placas ?? 'sem placa ativa'} · CPF/CNPJ ${linha.cpf_cnpj}` : undefined}>
      {linha && clienteId && (
        <div className="space-y-5">
          <Cabecalho linha={linha} />
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-5">
              <NovoContato linha={linha} />
              <Acordos clienteId={clienteId} />
            </div>
            <div className="space-y-5">
              <Boletos clienteId={clienteId} />
              <Historico clienteId={clienteId} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Cabecalho({ linha }: { linha: CobrancaFilaLinha }) {
  const fone = linha.celular || linha.telefone;
  const zap = linkWhatsAppAssociado(fone, mensagemCobranca({
    associado: linha.associado, boletos: Number(linha.boletos_vencidos),
    valor: Number(linha.valor_vencido), placas: linha.placas,
  }));
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
      <span><b className="tnum text-rose-700">{formatCurrency(Number(linha.valor_vencido))}</b> vencidos</span>
      <span className="tnum">{linha.boletos_vencidos} boleto(s)</span>
      <span className="tnum">{linha.dias_atraso} dias de atraso · desde {formatDate(linha.vencido_desde)}</span>
      <span className="ml-auto flex gap-2">
        {fone && (
          <a href={`tel:${fone.replace(/\D/g, '')}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-superficie px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Phone className="h-3.5 w-3.5" /> {fone}
          </a>
        )}
        {zap ? (
          <a href={zap} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
        ) : (
          <span className="text-xs text-amber-700">sem telefone válido no cadastro</span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registrar contato (+ promessa/acordo)
// ---------------------------------------------------------------------------
function NovoContato({ linha }: { linha: CobrancaFilaLinha }) {
  const registrar = useRegistrarContatoCobranca();
  const [canal, setCanal] = useState<Canal>('WHATSAPP');
  const [resultado, setResultado] = useState<Resultado>('FALOU');
  const [obs, setObs] = useState('');
  const [retorno, setRetorno] = useState('');
  const [acao, setAcao] = useState('');
  const [tipo, setTipo] = useState<TipoAcordo>('PROMESSA');
  const [parcelas, setParcelas] = useState<ParcelaRascunho[]>([
    { vencimento: hoje(), valor: Number(linha.valor_vencido) },
  ]);
  const [ok, setOk] = useState(false);
  const prometeu = resultado === 'PROMETEU';
  const erros = useMemo(() => (prometeu ? validarAcordo(tipo, parcelas, hoje()) : []), [prometeu, tipo, parcelas]);
  const total = parcelas.reduce((s, p) => s + (p.valor ?? 0), 0);

  const trocarTipo = (t: TipoAcordo) => {
    setTipo(t);
    setParcelas(t === 'PROMESSA'
      ? [{ vencimento: hoje(), valor: Number(linha.valor_vencido) }]
      : parcelasIguais(Number(linha.valor_vencido), 3, somarDias(hoje(), 1)));
  };
  const mudar = (i: number, p: Partial<ParcelaRascunho>) =>
    setParcelas((ps) => ps.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const salvar = () => {
    setOk(false);
    registrar.mutate({
      clienteId: linha.cliente_id, canal, resultado,
      observacao: obs, proximaAcaoEm: retorno || null, proximaAcao: acao,
      acordo: prometeu ? { tipo, parcelas } : null,
    }, {
      onSuccess: () => { setObs(''); setRetorno(''); setAcao(''); setResultado('FALOU'); setOk(true); },
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Registrar contato</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Canal">
          <Select value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
            {Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FormField>
        <FormField label="Resultado">
          <Select value={resultado} onChange={(e) => setResultado(e.target.value as Resultado)}>
            {Object.entries(RESULTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </FormField>
        <FormField label="Observação" className="sm:col-span-2">
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="o que foi conversado" />
        </FormField>
        {!prometeu && (
          <>
            <FormField label="Próximo retorno">
              <Input type="date" min={hoje()} value={retorno} onChange={(e) => setRetorno(e.target.value)} />
            </FormField>
            <FormField label="Próxima ação">
              <Input value={acao} onChange={(e) => setAcao(e.target.value)} placeholder="ex.: ligar após o dia 15" />
            </FormField>
            <p className="text-[11px] text-slate-500 sm:col-span-2">
              Sem data, o associado volta para a fila em 2 dias.
            </p>
          </>
        )}
      </div>

      {prometeu && (
        <div className="mt-4 rounded-lg bg-cyan-50/50 p-3 ring-1 ring-cyan-100">
          <div className="flex flex-wrap items-center gap-2">
            {(['PROMESSA', 'ACORDO'] as TipoAcordo[]).map((t) => (
              <button key={t} type="button" onClick={() => trocarTipo(t)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${tipo === t ? 'bg-acao text-white' : 'bg-superficie text-slate-600 ring-1 ring-slate-200'}`}>
                {t === 'PROMESSA' ? 'Promessa (1 pagamento)' : 'Acordo parcelado'}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-600">
              total <b className="tnum">{formatCurrency(total)}</b> de {formatCurrency(Number(linha.valor_vencido))} vencidos
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {parcelas.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <span className="w-6 pb-2 text-xs text-slate-500">{i + 1}ª</span>
                <FormField label="Vencimento" className="flex-1">
                  <Input type="date" min={hoje()} value={p.vencimento} onChange={(e) => mudar(i, { vencimento: e.target.value })} />
                </FormField>
                <FormField label="Valor" className="flex-1">
                  <MoneyInput value={p.valor} onChange={(v) => mudar(i, { valor: v })} />
                </FormField>
                {tipo === 'ACORDO' && parcelas.length > 2 && (
                  <button type="button" onClick={() => setParcelas((ps) => ps.filter((_, j) => j !== i))}
                    className="pb-2 text-slate-400 hover:text-rose-600" title="Remover parcela">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {tipo === 'ACORDO' && parcelas.length < 36 && (
            <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cyan-700"
              onClick={() => setParcelas((ps) => [...ps, {
                vencimento: somarDias(ps[ps.length - 1]?.vencimento ?? hoje(), 30), valor: null,
              }])}>
              <Plus className="h-3.5 w-3.5" /> parcela
            </button>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            A promessa é sobre a dívida que já existe — nenhum boleto novo é emitido. Ela conta como
            cumprida quando os boletos vencidos são pagos até a data; passados 3 dias sem pagamento
            (prazo de baixa do banco), conta como quebrada e o associado volta ao topo da fila.
          </p>
          {erros.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-rose-600">{erros.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
        </div>
      )}

      {registrar.error && <p className="mt-2 text-xs text-rose-600">{(registrar.error as Error).message}</p>}
      {ok && <p className="mt-2 text-xs text-emerald-700">Contato registrado.</p>}
      <div className="mt-3 flex justify-end">
        <Button onClick={salvar} disabled={registrar.isPending || erros.length > 0}>
          {registrar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Registrar contato
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Promessas e acordos
// ---------------------------------------------------------------------------
function Acordos({ clienteId }: { clienteId: string }) {
  const q = useCobrancaAcordosCliente(clienteId);
  const [cancelando, setCancelando] = useState<CobrancaAcordoSituacao | null>(null);
  const lista = q.data ?? [];
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Promessas e acordos</h3>
      <ErroLeitura q={q} />
      {!q.isLoading && lista.length === 0 && <p className="mt-2 text-xs text-slate-400">Nenhuma promessa registrada.</p>}
      <ul className="mt-2 space-y-3">
        {lista.map((a) => (
          <li key={a.acordo_id} className="rounded-lg bg-slate-50 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 font-medium ${CLASSE_STATUS[a.status]}`}>{STATUS_ACORDO[a.status]}</span>
              <span className="font-medium text-slate-700">{a.tipo === 'PROMESSA' ? 'Promessa' : `Acordo em ${a.parcelas.length}x`}</span>
              <span className="tnum text-slate-600">{formatCurrency(Number(a.valor_total))} · pago {formatCurrency(Number(a.valor_pago))}</span>
              <span className="ml-auto text-slate-400">{formatDate(a.data_base)} · {a.criado_por_nome ?? '—'}</span>
            </div>
            <table className="mt-2 w-full">
              <tbody>
                {a.parcelas.map((p) => (
                  <tr key={p.numero} className="tnum">
                    <td className="py-0.5 text-slate-500">{p.numero}ª</td>
                    <td>{formatDate(p.vencimento)}</td>
                    <td className="text-right">{formatCurrency(Number(p.valor))}</td>
                    <td className={`pl-3 text-right font-medium ${CLASSE_STATUS[p.situacao]}`}>{ROTULO_PARCELA[p.situacao]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {a.cancelado_em && <p className="mt-1 text-slate-500">Cancelado em {formatDateTime(a.cancelado_em)}: {a.motivo_cancelamento}</p>}
            {a.status === 'EM_ANDAMENTO' || a.status === 'QUEBRADO' ? (
              <button type="button" onClick={() => setCancelando(a)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:underline">
                <Ban className="h-3 w-3" /> cancelar
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <CancelarAcordo acordo={cancelando} onClose={() => setCancelando(null)} />
    </section>
  );
}

function CancelarAcordo({ acordo, onClose }: { acordo: CobrancaAcordoSituacao | null; onClose: () => void }) {
  const cancelar = useCancelarAcordoCobranca();
  const [motivo, setMotivo] = useState('');
  return (
    <Modal open={!!acordo} onClose={onClose} title="Cancelar promessa/acordo">
      <p className="text-sm text-slate-600">
        O registro não é apagado: fica no histórico como cancelado, com o motivo. Use quando a promessa
        foi lançada errada ou foi substituída por outra negociação.
      </p>
      <FormField label="Motivo" className="mt-3">
        <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </FormField>
      {cancelar.error && <p className="mt-2 text-xs text-rose-600">{(cancelar.error as Error).message}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Voltar</Button>
        <Button variant="danger" disabled={motivo.trim().length < 5 || cancelar.isPending}
          onClick={() => acordo && cancelar.mutate({ acordoId: acordo.acordo_id, motivo },
            { onSuccess: () => { setMotivo(''); onClose(); } })}>
          Cancelar promessa
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Boletos e historico
// ---------------------------------------------------------------------------
const CLASSE_BOLETO: Record<string, string> = {
  vencido: 'text-rose-700', vence_hoje: 'text-cyan-700', a_vencer: 'text-slate-500',
  pago_no_prazo: 'text-emerald-700', pago_em_atraso: 'text-amber-700', cancelado: 'text-slate-400 line-through',
};

function Boletos({ clienteId }: { clienteId: string }) {
  const q = useCobrancaBoletosCliente(clienteId);
  const lista = q.data ?? [];
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Boletos</h3>
      <ErroLeitura q={q} />
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-superficie text-left text-[10.5px] uppercase tracking-wide text-slate-400">
            <tr><th className="py-1">Vencimento</th><th>Placa</th><th className="text-right">Valor</th><th className="pl-3">Situação</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((b) => (
              <tr key={b.boleto_id} className="tnum">
                <td className="py-1">{formatDate(b.vencimento)}</td>
                <td>{b.placa ?? '—'}</td>
                <td className="text-right">{formatCurrency(Number(b.valor))}</td>
                <td className={`pl-3 ${CLASSE_BOLETO[b.situacao] ?? ''}`}>
                  {ROTULO_SITUACAO[b.situacao as SituacaoBoleto] ?? b.situacao}
                  {b.situacao === 'vencido' && ` · ${b.dias_atraso}d`}
                  {b.data_pagamento && ` · ${formatDate(b.data_pagamento)}`}
                  {b.em_serasa && ' · Serasa'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && lista.length === 0 && <p className="text-xs text-slate-400">Nenhum boleto.</p>}
      </div>
    </section>
  );
}

function Historico({ clienteId }: { clienteId: string }) {
  const q = useCobrancaContatosCliente(clienteId);
  const lista = q.data ?? [];
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Histórico de contatos</h3>
      <p className="text-[11px] text-slate-400">Não se edita nem se apaga — quem errou registra outro contato corrigindo.</p>
      <ErroLeitura q={q} />
      {!q.isLoading && lista.length === 0 && <p className="mt-2 text-xs text-slate-400">Nenhum contato ainda.</p>}
      <ol className="mt-2 max-h-80 space-y-2 overflow-auto">
        {lista.map((c) => (
          <li key={c.id} className="border-l-2 border-cyan-200 pl-3 text-xs">
            <p className="text-slate-500">
              {formatDateTime(c.created_at)} · {c.usuario ?? 'sistema'} ·{' '}
              {CANAIS[c.canal as Canal] ?? c.canal}
            </p>
            <p className="font-medium text-slate-800">
              {RESULTADOS[c.resultado as Resultado] ?? c.resultado}
              {c.acordo_id && <span className="ml-1 text-cyan-700">· gerou promessa</span>}
            </p>
            {c.observacao && <p className="text-slate-600">{c.observacao}</p>}
            {(c.proxima_acao_em || c.proxima_acao) && (
              <p className="text-slate-500">
                Retorno: {c.proxima_acao_em ? formatDate(c.proxima_acao_em) : '—'}{c.proxima_acao ? ` · ${c.proxima_acao}` : ''}
              </p>
            )}
            <p className="tnum text-[10.5px] text-slate-400">
              na hora: {c.boletos_vencidos} boleto(s) · {formatCurrency(Number(c.valor_vencido))} · {c.dias_atraso} dias
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
