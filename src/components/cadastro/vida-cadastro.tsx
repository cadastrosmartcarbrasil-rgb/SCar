'use client';

// A "vida" do associado e do veiculo nas fichas do administrativo:
// financeiro (SCar + Mutual), eventos (SCar + historico do Mutual), protocolos
// e acionamentos da 24h. As mesmas leituras do SAC, em tela cheia.
import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { HistoricoFinanceiroLista } from '@/components/sac/acoes-veiculo';
import { useTitulosCliente } from '@/hooks/use-protocolos';
import {
  useAcionamentosCadastro, useEventosCadastro, useProtocolosCadastro,
} from '@/hooks/use-vida-cadastro';
import { resumoHistoricoFinanceiro } from '@/lib/historico-financeiro';
import {
  ROTULO_SITUACAO_HISTORICO, type EventoUnificado, type SituacaoHistorico,
} from '@/lib/eventos-historico';
import { STATUS_EVENTO_LABEL } from '@/lib/sac-servicos';
import { CATEGORIAS_PROTOCOLO, PRIORIDADES, STATUS_PROTOCOLO } from '@/lib/protocolos';
import { STATUS_ACIONAMENTO_LABEL } from '@/lib/assistencia';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { StatusEvento } from '@/lib/database.types';

/** Limite das fichas: a vida inteira, nao so os ultimos 60 do SAC. */
const LIMITE_FICHA = 500;

type Alvo = { clienteId: string; veiculoId?: string | null };

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Placa({ placa }: { placa: string | null }) {
  return placa ? (
    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{placa}</span>
  ) : (
    <span className="text-slate-400">—</span>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-sm text-slate-400">{texto}</p>;
}

function Erro({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = (error as { message?: string })?.message ?? String(error);
  return <p className="text-sm text-rose-600">Nao foi possivel carregar: {msg}</p>;
}

// --- Financeiro ---------------------------------------------------------------
export function FinanceiroCadastro({ clienteId, veiculoId }: Alvo) {
  const { data } = useTitulosCliente(clienteId, veiculoId ?? null, LIMITE_FICHA);
  const r = resumoHistoricoFinanceiro(data ?? [], hojeIso());
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumo titulo={`Total (${r.qtd} boletos)`} valor={r.total} cor="text-slate-800" />
        <Resumo titulo="Pago" valor={r.pago} cor="text-emerald-600" />
        <Resumo titulo="A vencer" valor={r.aberto} cor="text-amber-600" />
        <Resumo titulo={`Vencido (${r.qtdVencidos})`} valor={r.vencido} cor="text-rose-600" />
      </div>
      <Card>
        <CardContent className="pt-5">
          <HistoricoFinanceiroLista clienteId={clienteId} veiculoId={veiculoId} limite={LIMITE_FICHA} alturaMaxima={false} />
        </CardContent>
      </Card>
    </div>
  );
}

function Resumo({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-slate-500">{titulo}</p>
        <p className={`tnum mt-1 text-lg font-semibold ${cor}`}>{formatCurrency(valor)}</p>
      </CardContent>
    </Card>
  );
}

// --- Eventos ------------------------------------------------------------------
/** A tabela de eventos (SCar + Mutual). Usada tambem pela aba Eventos do SAC. */
export function TabelaEventos({ eventos, mostrarPlaca = true }: { eventos: EventoUnificado[]; mostrarPlaca?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
            <th className="px-4 py-2.5">Protocolo</th>
            {mostrarPlaca && <th className="px-4 py-2.5">Veiculo</th>}
            <th className="px-4 py-2.5">Tipo</th>
            <th className="px-4 py-2.5">Data</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((e) => {
            const mutual = e.origem === 'MUTUAL';
            const st = mutual ? null : STATUS_EVENTO_LABEL[e.status as StatusEvento];
            return (
              <tr key={`${e.origem}-${e.id}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                  {e.numero_protocolo ?? '—'}
                  {mutual && <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-violet-700">Mutual</span>}
                </td>
                {mostrarPlaca && (
                  <td className="px-4 py-2.5">
                    {e.veiculo_id ? (
                      <Link href={`/veiculos/${e.veiculo_id}`} className="hover:opacity-80"><Placa placa={e.placa} /></Link>
                    ) : (
                      <Placa placa={e.placa} />
                    )}
                  </td>
                )}
                <td className="px-4 py-2.5 text-slate-600">
                  {e.tipo ?? '—'}
                  {e.envolvimento && <span className="block text-[11px] text-slate-400">{e.envolvimento}</span>}
                </td>
                <td className="tnum px-4 py-2.5 text-slate-600">{e.data_ocorrencia ? formatDate(e.data_ocorrencia) : '—'}</td>
                <td className="px-4 py-2.5">
                  {mutual ? (
                    <span className="text-xs text-slate-500">
                      {e.status === 'CONCLUIDO' && e.data_conclusao
                        ? `Concluido em ${formatDate(e.data_conclusao)}`
                        : ROTULO_SITUACAO_HISTORICO[e.status as SituacaoHistorico]}
                    </span>
                  ) : (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st?.cor ?? 'bg-slate-100 text-slate-600'}`}>{st?.label ?? e.status}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {mutual ? (
                    <span className="text-[11px] text-slate-400">so consulta</span>
                  ) : (
                    <Link href={`/eventos/${e.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-800">
                      <Settings2 className="h-3.5 w-3.5" /> Gerenciar
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EventosCadastro({ clienteId, veiculoId }: Alvo) {
  const { data, isLoading, error } = useEventosCadastro({ clienteId, veiculoId });
  if (isLoading) return <Vazio texto="Carregando..." />;
  if (error) return <Erro error={error} />;
  if (!data?.length) return <Vazio texto="Nenhum evento registrado — nem no SCar, nem no historico do Mutual." />;
  const mutual = data.filter((e) => e.origem === 'MUTUAL').length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {data.length} evento(s){mutual ? ` · ${mutual} do historico do Mutual (so consulta)` : ''}
      </p>
      <TabelaEventos eventos={data} mostrarPlaca={!veiculoId} />
    </div>
  );
}

// --- Protocolos ---------------------------------------------------------------
export function ProtocolosCadastro({ clienteId, veiculoId }: Alvo) {
  const { data, isLoading, error } = useProtocolosCadastro({ clienteId, veiculoId });
  if (isLoading) return <Vazio texto="Carregando..." />;
  if (error) return <Erro error={error} />;
  if (!data?.length) return <Vazio texto="Nenhum protocolo aberto." />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
            <th className="px-4 py-2.5">Protocolo</th>
            {!veiculoId && <th className="px-4 py-2.5">Veiculo</th>}
            <th className="px-4 py-2.5">Categoria</th>
            <th className="px-4 py-2.5">Assunto</th>
            <th className="px-4 py-2.5">Aberto em</th>
            <th className="px-4 py-2.5">Prioridade</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => {
            const st = STATUS_PROTOCOLO[p.status];
            const pr = PRIORIDADES.find((x) => x.value === p.prioridade);
            return (
              <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.numero_protocolo ?? '—'}</td>
                {!veiculoId && (
                  <td className="px-4 py-2.5">
                    {p.veiculo_id ? <Placa placa={p.veiculos?.placa ?? null} /> : <span className="text-xs text-slate-400">do associado</span>}
                  </td>
                )}
                <td className="px-4 py-2.5 text-slate-600">{CATEGORIAS_PROTOCOLO.find((c) => c.value === p.tipo)?.label ?? p.tipo}</td>
                <td className="px-4 py-2.5 text-slate-600">{p.assunto ?? '—'}</td>
                <td className="tnum px-4 py-2.5 text-slate-600">{formatDate(p.created_at)}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-xs ${pr?.cor ?? ''}`}>{pr?.label ?? p.prioridade}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-xs ${st?.cor ?? ''}`}>{st?.label ?? p.status}</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/protocolos?protocolo=${p.id}`} className="text-xs font-medium text-cyan-700 hover:text-cyan-800">
                    Abrir
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Assistencia 24h ----------------------------------------------------------
export function AcionamentosCadastro({ clienteId, veiculoId }: Alvo) {
  const { data, isLoading, error } = useAcionamentosCadastro({ clienteId, veiculoId });
  if (isLoading) return <Vazio texto="Carregando..." />;
  if (error) return <Erro error={error} />;
  if (!data?.length) return <Vazio texto="Nenhum acionamento da Assistencia 24h." />;
  const custo = data.filter((a) => a.status !== 'CANCELADO').reduce((s, a) => s + Number(a.valor_total || 0), 0);
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {data.length} acionamento(s) · custo (sem cancelados) <b className="tnum">{formatCurrency(custo)}</b>
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2.5">Protocolo / OS</th>
              {!veiculoId && <th className="px-4 py-2.5">Veiculo</th>}
              <th className="px-4 py-2.5">Servico</th>
              <th className="px-4 py-2.5">Prestador</th>
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5 text-right">Valor</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => {
              const st = STATUS_ACIONAMENTO_LABEL[a.status];
              return (
                <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                    {a.protocolo ?? '—'}
                    {a.codigo_os && <span className="block">{a.codigo_os}</span>}
                  </td>
                  {!veiculoId && <td className="px-4 py-2.5"><Placa placa={a.veiculos?.placa ?? null} /></td>}
                  <td className="px-4 py-2.5 text-slate-600">{a.servicos_assistencia?.descricao ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{a.fornecedores?.nome_fantasia || a.fornecedores?.razao_social || '—'}</td>
                  <td className="tnum px-4 py-2.5 text-slate-600">{formatDate(a.created_at)}</td>
                  <td className="tnum px-4 py-2.5 text-right text-slate-700">{formatCurrency(Number(a.valor_total || 0))}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-2 py-0.5 text-xs ${st?.cor ?? ''}`}>{st?.label ?? a.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/assistencia?acionamento=${a.id}`} className="text-xs font-medium text-cyan-700 hover:text-cyan-800">
                      Abrir OS
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
