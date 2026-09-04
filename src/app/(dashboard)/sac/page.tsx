'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Search, User, Phone, Mail, Loader2, CheckCircle2, XCircle, ShieldCheck,
  Layers, SplitSquareHorizontal, ChevronLeft, Send,
  Car, AlertTriangle, LifeBuoy, Settings2, Bell, FileSignature, ClipboardCheck, X, Ticket, Satellite,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input, Select, Textarea, FormField } from '@/components/ui/field';
import {
  useSacBusca, useVisao360, useVeiculoDetalhe, useToggleFaturamento, useGerarBoleto,
  useAbrirAtendimento, useAtendimentosVeiculo, type BuscaHit, type Visao360, type VeiculoDetalhe,
} from '@/hooks/use-sac';
import { SERVICOS_SAC, STATUS_ATENDIMENTO_LABEL, STATUS_EVENTO_LABEL, type ServicoSac } from '@/lib/sac-servicos';
import { formatarChip } from '@/lib/rastreador';
import { useContratosVeiculo, useVistoriasVeiculo } from '@/hooks/use-veiculo-ficha';
import { useHistoricoAssistenciaVeiculo } from '@/hooks/use-assistencia';
import { ModalHistoricoFinanceiro, ModalWhatsApp, ModalEmail } from '@/components/sac/acoes-veiculo';
import { AlertasVeiculo } from '@/components/veiculos/alertas-veiculo';
import { useAbrirProtocolo } from '@/hooks/use-protocolos';
import { CATEGORIAS_PROTOCOLO, PRIORIDADES } from '@/lib/protocolos';
import { CentralProtocolos } from '@/components/protocolos/central-protocolos';
import { STATUS_ACIONAMENTO_LABEL } from '@/lib/assistencia';
import { statusVeiculoResumo } from '@/lib/sac';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  ClientesRow, OpcionalVeiculo, PrioridadeAtendimento, TipoAtendimento, TipoFaturamento,
} from '@/lib/database.types';

type Aba = 'veiculos' | 'eventos' | 'protocolos';

export default function SacPage() {
  const [q, setQ] = useState('');
  const [clienteId, setClienteId] = useState<string | undefined>();
  const [veiculoId, setVeiculoId] = useState<string | undefined>();
  const [aba, setAba] = useState<Aba>('veiculos');
  const busca = useSacBusca(q);
  const { data: v360, isLoading, error: erro360 } = useVisao360(clienteId);

  useEffect(() => {
    if (v360 && !veiculoId && v360.veiculos.length === 1) setVeiculoId(v360.veiculos[0].id);
  }, [v360, veiculoId]);

  // Busca por PLACA vai direto ao atendimento daquele veiculo; por Nome ou
  // CPF/CNPJ continua abrindo a ficha do associado com a lista de veiculos.
  function abrirHit(h: BuscaHit) {
    setClienteId(h.cliente_id);
    setVeiculoId(h.veiculo_id ?? undefined);
    setAba('veiculos');
    setQ('');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">SAC · Atendimento</h1>
        <p className="mt-0.5 text-sm text-slate-500">Selecione o associado, depois o veiculo. O detalhe carrega ao clicar.</p>
      </div>

      {/* Busca global */}
      <div className="relative max-w-xl">
        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-superficie px-3.5 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-cyan-500/40">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por Nome, CPF/CNPJ ou Placa..." className="w-full text-sm outline-none" />
          {busca.isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
        </div>
        {q.trim().length >= 2 && (busca.data?.length ?? 0) > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-superficie shadow-lg">
            {busca.data!.map((h) => (
              <li key={h.veiculo_id ?? h.cliente_id}>
                <button onClick={() => abrirHit(h)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                  {h.veiculo_id ? <Car className="h-4 w-4 text-cyan-500" /> : <User className="h-4 w-4 text-slate-400" />}
                  <span className="flex-1"><b className="text-slate-800">{h.nome}</b> <span className="text-slate-400">· {h.cpf_cnpj}</span></span>
                  {h.via && <span className="rounded bg-cyan-50 px-2 py-0.5 text-[11px] text-cyan-700">{h.via}</span>}
                  {h.veiculo_id && <span className="text-[11px] font-medium text-cyan-700">Atender →</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!clienteId && <p className="text-sm text-slate-400">Busque um associado para iniciar o atendimento.</p>}
      {clienteId && isLoading && <p className="py-10 text-center text-sm text-slate-400">Carregando dados...</p>}
      {busca.error && (
        <p className="text-sm text-rose-600">Falha na busca: {(busca.error as Error).message}</p>
      )}
      {erro360 && (
        // Erro visivel em vez de tela vazia: dado que nao carregou nao pode
        // passar a impressao de "associado sem veiculo/sem pendencia".
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Nao foi possivel carregar o atendimento: {(erro360 as Error).message}
        </div>
      )}

      {v360 && (
        <div className="space-y-5">
          <AssociadoHeader v360={v360} />
          <AlertasBanner alertas={v360.alertas} />

          {/* Abas: Veiculos | Eventos do associado */}
          <div className="flex gap-1 border-b border-slate-200">
            {([['veiculos', 'Veiculos', Car, v360.veiculos.length], ['eventos', 'Eventos', AlertTriangle, v360.eventos.length], ['protocolos', 'Protocolos', Ticket, null]] as const).map(([id, label, Icon, n]) => (
              <button key={id} onClick={() => setAba(id)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${aba === id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                <Icon className="h-4 w-4" /> {label}
                {n !== null && (
                  <span className={`tnum rounded-full px-1.5 text-[11px] ${aba === id ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
                )}
              </button>
            ))}
          </div>

          {aba === 'protocolos' ? (
            // Central filtrada pelo associado em atendimento (a fila completa
            // fica em /protocolos, com o atalho do dashboard).
            <CentralProtocolos filtroInicial={{ status: null, busca: v360.associado.nome_razao_social }} />
          ) : aba === 'eventos' ? (
            <ListaEventos v360={v360} />
          ) : !veiculoId ? (
            <ListaVeiculos v360={v360} onSelect={setVeiculoId} />
          ) : (
            <AtendimentoVeiculo
              clienteId={v360.associado.id}
              associado={v360.associado}
              veiculoId={veiculoId}
              podeTrocar={v360.veiculos.length > 1}
              onTrocar={() => setVeiculoId(undefined)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Aba Eventos: sinistros do associado com atalhos de gerenciamento.
function ListaEventos({ v360 }: { v360: Visao360 }) {
  if (v360.eventos.length === 0) {
    return <p className="text-sm text-slate-400">Nenhum evento registrado para este associado.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
            <th className="px-4 py-2.5">Protocolo</th>
            <th className="px-4 py-2.5">Veiculo</th>
            <th className="px-4 py-2.5">Tipo</th>
            <th className="px-4 py-2.5">Data</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {v360.eventos.map((e) => {
            const st = STATUS_EVENTO_LABEL[e.status];
            return (
              <tr key={e.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{e.numero_protocolo}</td>
                <td className="px-4 py-2.5"><span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{e.placa}</span></td>
                <td className="px-4 py-2.5 text-slate-600">{e.tipo ?? '—'}</td>
                <td className="tnum px-4 py-2.5 text-slate-600">{formatDate(e.data_ocorrencia)}</td>
                <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st?.cor ?? 'bg-slate-100 text-slate-600'}`}>{st?.label ?? e.status}</span></td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/sinistros/${e.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-800">
                    <Settings2 className="h-3.5 w-3.5" /> Gerenciar
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

// Alertas ativos do associado — abrem no mesmo instante ao localizar.
function AlertasBanner({ alertas }: { alertas: Visao360['alertas'] }) {
  const [fechado, setFechado] = useState(false);
  if (alertas.length === 0 || fechado) return null;
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Bell className="h-4 w-4" /> {alertas.length} alerta(s) neste associado
        </div>
        <button onClick={() => setFechado(true)} className="text-amber-500 hover:text-amber-700"><X className="h-4 w-4" /></button>
      </div>
      <ul className="mt-2 space-y-1">
        {alertas.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm text-amber-800">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${a.severidade === 'ALTA' ? 'bg-rose-200 text-rose-800' : a.severidade === 'BAIXA' ? 'bg-slate-200 text-slate-700' : 'bg-amber-200 text-amber-900'}`}>{a.severidade}</span>
            <b>{a.nome}</b>
            {a.placa && <span className="font-mono text-xs text-amber-700">· {a.placa}</span>}
            {a.mensagem && <span className="text-amber-700">— {a.mensagem}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssociadoHeader({ v360 }: { v360: Visao360 }) {
  const a = v360.associado;
  const r = v360.financeiro.resumo;
  // Protocolo da PESSOA (sem veiculo): assunto geral, cadastro, financeiro do
  // associado. O banco aceita p_veiculo_id nulo em abrir_protocolo.
  const [abrindo, setAbrindo] = useState(false);
  return (
    <Card>
      {abrindo && <ModalProtocoloAssociado associado={a} onClose={() => setAbrindo(false)} />}
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-acao to-faixa text-sm font-bold text-white">
            {a.nome_razao_social.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{a.nome_razao_social}</h2>
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
              <span>{a.tipo_pessoa} · {a.cpf_cnpj}</span>
              {a.telefone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {a.telefone}</span>}
              {a.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {a.email}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.adimplente
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Adimplente</span>
            : <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"><XCircle className="h-3.5 w-3.5" /> {r.vencidos} vencido(s) · {formatCurrency(r.valorEmAberto)}</span>}
          <Button type="button" variant="secondary" onClick={() => setAbrindo(true)}>
            <Ticket className="h-4 w-4" /> Abrir protocolo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Abertura de protocolo pela ficha do ASSOCIADO (sem veiculo vinculado).
function ModalProtocoloAssociado({ associado, onClose }: { associado: ClientesRow; onClose: () => void }) {
  const abrir = useAbrirProtocolo();
  const [tipo, setTipo] = useState<TipoAtendimento>('DUVIDAS');
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<PrioridadeAtendimento>('NORMAL');

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!assunto.trim()) { toast.error('Informe o assunto do protocolo.'); return; }
    abrir.mutate(
      { cliente_id: associado.id, tipo, assunto: assunto.trim(), descricao, prioridade },
      {
        onSuccess: (a) => { toast.success(`Protocolo aberto: ${a.numero_protocolo}`); onClose(); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Abrir protocolo do associado">
      <form onSubmit={enviar} className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Associado</p>
          <p className="mt-0.5 font-medium text-slate-700">{associado.nome_razao_social}</p>
          <p className="text-xs text-slate-400">
            {associado.cpf_cnpj} · protocolo sem veiculo vinculado (assunto geral)
          </p>
        </div>

        <FormField label="Categoria">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAtendimento)}>
            {CATEGORIAS_PROTOCOLO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Prioridade">
          <Select value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeAtendimento)}>
            {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Assunto">
          <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Resumo da solicitacao" />
        </FormField>
        <FormField label="Descricao">
          <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhe a solicitacao..." />
        </FormField>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={abrir.isPending}>
            {abrir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Abrir protocolo
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Passo 1: LISTA resumida (tabela leve). So Placa, Marca/Modelo, Ano e Status.
function ListaVeiculos({ v360, onSelect }: { v360: Visao360; onSelect: (id: string) => void }) {
  if (v360.veiculos.length === 0) {
    return <p className="text-sm text-slate-400">Este associado nao possui veiculos cadastrados.</p>;
  }
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">Veiculos ({v360.veiculos.length}) — clique para atender</p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2.5">Placa</th>
              <th className="px-4 py-2.5">Marca / Modelo</th>
              <th className="px-4 py-2.5">Ano</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {v360.veiculos.map((v) => {
              const st = statusVeiculoResumo(v.status, v.inadimplente);
              return (
                <tr key={v.id} onClick={() => onSelect(v.id)} className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-cyan-50/40">
                  <td className="px-4 py-2.5"><span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono font-semibold text-slate-700">{v.placa}</span></td>
                  <td className="px-4 py-2.5 text-slate-700">
                    <span>{[v.marca, v.modelo].filter(Boolean).join(' ') || '—'}</span>
                    {v.eventos_qtd > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        <AlertTriangle className="h-3 w-3" /> {v.eventos_qtd > 1 ? `${v.eventos_qtd} eventos` : 'Evento'}
                      </span>
                    )}
                    {v.tem_assistencia && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                        <LifeBuoy className="h-3 w-3" /> Assist 24h
                      </span>
                    )}
                    {v.alertas_qtd > 0 && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        <Bell className="h-3 w-3" /> {v.alertas_qtd} alerta{v.alertas_qtd > 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td className="tnum px-4 py-2.5 text-slate-600">{v.ano_modelo ?? '—'}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cor}`}>{st.label}</span></td>
                  <td className="px-4 py-2.5 text-right"><span className="text-xs font-medium text-cyan-700">Atender →</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Passo 2: detalhe do veiculo carregado SOB DEMANDA + menu modular de servicos.
function AtendimentoVeiculo({ clienteId, associado, veiculoId, podeTrocar, onTrocar }: {
  clienteId: string; associado: ClientesRow; veiculoId: string; podeTrocar: boolean; onTrocar: () => void;
}) {
  const router = useRouter();
  const { data: veiculo, isLoading } = useVeiculoDetalhe(veiculoId);
  const [servico, setServico] = useState<ServicoSac | null>(null);
  // VCards de acao rapida (0029)
  const [financeiro, setFinanceiro] = useState(false);
  const [whats, setWhats] = useState(false);
  const [email, setEmail] = useState(false);
  const gerarBoleto = useGerarBoleto();
  const { data: atendimentos } = useAtendimentosVeiculo(veiculoId);
  // Historico da Assistencia 24h na propria ficha do veiculo.
  const { data: acionamentos24h } = useHistoricoAssistenciaVeiculo(veiculoId);

  function acionar(s: ServicoSac) {
    // Evento (sinistro): vai DIRETO para o registro completo, com o veiculo ja selecionado.
    if (s.modo === 'evento') {
      router.push(`/sinistros/novo?placa=${encodeURIComponent(veiculo?.placa ?? '')}`);
      return;
    }
    // Assistencia 24h: painel proprio, com trava financeira e limites do opcional.
    if (s.modo === 'assistencia') {
      router.push(`/assistencia?placa=${encodeURIComponent(veiculo?.placa ?? '')}`);
      return;
    }
    // Editar Veiculo/Item: unifica os antigos cards Cadastro e Upgrade.
    if (s.modo === 'editar') {
      router.push(`/veiculos?editar=${veiculoId}`);
      return;
    }
    if (s.modo === 'financeiro') { setFinanceiro(true); return; }
    if (s.modo === 'whatsapp') { setWhats(true); return; }
    if (s.modo === 'email') { setEmail(true); return; }
    if (s.modo === 'boleto') {
      gerarBoleto.mutate({ cliente_id: clienteId }, {
        onSuccess: (d) => toast.success(`Faturas da competencia ${d.competencia} prontas (${d.faturas.length})`),
        onError: (e) => toast.error(e.message),
      });
      return;
    }
    setServico(s);
  }

  return (
    <div className="space-y-5">
      {podeTrocar && (
        <button onClick={onTrocar} className="inline-flex items-center gap-1 text-sm font-medium text-cyan-700 hover:text-cyan-800">
          <ChevronLeft className="h-4 w-4" /> Voltar a lista de veiculos
        </button>
      )}

      {isLoading || !veiculo ? (
        <Card><CardContent className="py-10 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /> Carregando detalhes do veiculo...</CardContent></Card>
      ) : (
        <>
          <VeiculoDetalheCard clienteId={clienteId} veiculo={veiculo} />

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">O que voce precisa para este veiculo?</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICOS_SAC.map((s) => (
                <button key={s.id} onClick={() => acionar(s)} disabled={s.modo === 'boleto' && gerarBoleto.isPending}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-superficie p-4 text-left shadow-sm transition hover:border-cyan-400 hover:shadow-md disabled:opacity-60">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${s.cor}`}>
                    {s.modo === 'boleto' && gerarBoleto.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <s.icon className="h-5 w-5" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{s.titulo}</span>
                    <span className="block text-xs text-slate-500">{s.descricao}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {(atendimentos?.length ?? 0) > 0 && (
            <Card>
              <CardContent className="pt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Atendimentos deste veiculo</p>
                <ul className="divide-y divide-slate-100">
                  {atendimentos!.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{a.numero_protocolo}</span>
                        <b className="text-slate-700">{a.assunto || a.tipo}</b>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-slate-400">
                        {formatDate(a.created_at)}
                        <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_ATENDIMENTO_LABEL[a.status].cor}`}>{STATUS_ATENDIMENTO_LABEL[a.status].label}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {(acionamentos24h?.length ?? 0) > 0 && (
            <Card>
              <CardContent className="pt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Assistencia 24h deste veiculo</p>
                <ul className="divide-y divide-slate-100">
                  {acionamentos24h!.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{h.codigo_os ?? h.protocolo}</span>
                        <b className="text-slate-700">{h.servico}</b>
                        {h.computa_limite && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">conta no limite</span>}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-slate-400">
                        {h.prestador ?? ''}
                        {formatDate(h.criado_em)}
                        <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_ACIONAMENTO_LABEL[h.status].cor}`}>
                          {STATUS_ACIONAMENTO_LABEL[h.status].label}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href={`/assistencia?placa=${encodeURIComponent(veiculo.placa)}`}
                  className="mt-2 inline-block text-xs font-medium text-cyan-700 hover:underline">
                  Abrir painel da Assistencia 24h
                </Link>
              </CardContent>
            </Card>
          )}

          {servico && (
            <ServicoModal servico={servico} veiculo={veiculo} clienteId={clienteId} onClose={() => setServico(null)} />
          )}
          {financeiro && (
            <ModalHistoricoFinanceiro
              clienteId={clienteId}
              veiculoId={veiculo.id}
              placa={veiculo.placa}
              onClose={() => setFinanceiro(false)}
            />
          )}
          {whats && <ModalWhatsApp associado={associado} placa={veiculo.placa} onClose={() => setWhats(false)} />}
          {email && <ModalEmail associado={associado} placa={veiculo.placa} onClose={() => setEmail(false)} />}
        </>
      )}
    </div>
  );
}

function VeiculoDetalheCard({ clienteId, veiculo }: { clienteId: string; veiculo: VeiculoDetalhe }) {
  const toggle = useToggleFaturamento();
  const setModo = (tipo: TipoFaturamento) => {
    if (tipo === veiculo.tipo_faturamento) return;
    toggle.mutate({ veiculo_id: veiculo.id, tipo, cliente_id: clienteId }, {
      onSuccess: () => toast.success('Modo de faturamento atualizado'),
      onError: (e) => toast.error(e.message),
    });
  };
  const dado = (label: string, valor?: string | number | null) => (
    <div><p className="text-[11px] uppercase text-slate-400">{label}</p><p className="text-sm font-medium text-slate-700">{valor || '—'}</p></div>
  );
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-acao px-2.5 py-1 font-mono text-sm font-bold text-white">{veiculo.placa}</span>
            <span className="text-base font-semibold text-slate-800">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ')}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${veiculo.status === 'ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{veiculo.status}</span>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
            <button onClick={() => setModo('AGRUPADO_ASSOCIADO')} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${veiculo.tipo_faturamento === 'AGRUPADO_ASSOCIADO' ? 'bg-acao text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Layers className="h-3.5 w-3.5" /> Agrupado
            </button>
            <button onClick={() => setModo('INDIVIDUAL_VEICULO')} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${veiculo.tipo_faturamento === 'INDIVIDUAL_VEICULO' ? 'bg-acao text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              <SplitSquareHorizontal className="h-3.5 w-3.5" /> Individual
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {dado('Chassi', veiculo.chassi)}
          {dado('Renavam', veiculo.renavam)}
          {dado('Ano', veiculo.ano_modelo)}
          {dado('Cor', veiculo.cor)}
          {dado('Combustivel', veiculo.combustivel)}
          {dado('Categoria', veiculo.categoria)}
          {dado('FIPE', veiculo.valor_fipe != null ? formatCurrency(veiculo.valor_fipe) : null)}
          {dado('Plano', veiculo.plano_nome)}
        </div>

        {(veiculo.rastreadora || veiculo.rastreador_imei) && (
          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Satellite className="h-3.5 w-3.5 text-cyan-600" /> Rastreamento
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {dado('Rastreador por', veiculo.rastreadora?.nome)}
              {dado('IMEI', veiculo.rastreador_imei)}
              {dado('Nº do chip', formatarChip(veiculo.rastreador_chip))}
            </div>
            {(veiculo.rastreadora?.telefone || veiculo.rastreadora?.plataforma_url) && (
              <p className="mt-2 text-xs text-slate-500">
                {veiculo.rastreadora?.telefone && <span>Central: {veiculo.rastreadora.telefone}</span>}
                {veiculo.rastreadora?.telefone && veiculo.rastreadora?.plataforma_url && <span> · </span>}
                {veiculo.rastreadora?.plataforma_url && (
                  <a href={veiculo.rastreadora.plataforma_url} target="_blank" rel="noreferrer" className="text-cyan-700 hover:underline">
                    Abrir plataforma
                  </a>
                )}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Cobertura contratada deste veiculo
          </p>
          {veiculo.opcionais.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum item contratado (defina o plano na ficha do veiculo).</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {veiculo.opcionais.map((o) => <OpcionalRow key={o.produto_id} o={o} />)}
            </ul>
          )}
        </div>

        {/* Pendencias do veiculo: o mesmo alerta que aparece no card da lista,
            aqui com o botao de resolver (0030). */}
        <div className="mt-4">
          <AlertasVeiculo veiculoId={veiculo.id} titulo="Alertas / pendencias deste veiculo" />
        </div>

        <FichaExtras veiculoId={veiculo.id} />
      </CardContent>
    </Card>
  );
}

// Seções da ficha do veículo: Contratos de adesão e Vistorias (anexos).
function FichaExtras({ veiculoId }: { veiculoId: string }) {
  const { data: contratos } = useContratosVeiculo(veiculoId);
  const { data: vistorias } = useVistoriasVeiculo(veiculoId);
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <FileSignature className="h-3.5 w-3.5" /> Contratos de adesao
        </p>
        {(contratos?.length ?? 0) === 0 ? (
          <p className="text-xs text-slate-400">Nenhum contrato. O termo sera emitido ao concluir a venda (aceite eletronico).</p>
        ) : (
          <ul className="space-y-1.5">
            {contratos!.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{formatDate(c.created_at)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{c.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <ClipboardCheck className="h-3.5 w-3.5" /> Vistorias
        </p>
        {(vistorias?.length ?? 0) === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma vistoria registrada para este veiculo.</p>
        ) : (
          <ul className="space-y-1.5">
            {vistorias!.map((vi) => (
              <li key={vi.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{vi.tipo || 'Vistoria'} · {vi.data_vistoria ? formatDate(vi.data_vistoria) : formatDate(vi.created_at)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{vi.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Item do pacote do veiculo. Produto com limite mostra o consumo; os demais
// mostram so a origem (plano ou opcional avulso) e o valor.
function OpcionalRow({ o }: { o: OpcionalVeiculo }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-slate-700">
        {o.nome}
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${
          o.origem === 'AVULSO' ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'
        }`}>
          {o.origem === 'AVULSO' ? 'opcional' : 'plano'}
        </span>
      </span>
      <div className="flex items-center gap-3">
        <span className="tnum text-xs text-slate-500">{formatCurrency(Number(o.valor))}</span>
        {o.tem_limite && (
          <>
            <span className="tnum text-xs text-slate-500">{o.usados}/{o.quantidade_limite} usados</span>
            {o.elegivel ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> DISPONIVEL</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700" title={o.ultimo_uso ? `Ultimo uso em ${formatDate(o.ultimo_uso)}` : undefined}><XCircle className="h-3.5 w-3.5" /> LIMITE EXCEDIDO</span>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function ServicoModal({ servico, veiculo, clienteId, onClose }: {
  servico: ServicoSac; veiculo: VeiculoDetalhe; clienteId: string; onClose: () => void;
}) {
  const abrir = useAbrirProtocolo();
  const [tipo, setTipo] = useState<TipoAtendimento>(servico.tipos[0].value);
  const [subtipo, setSubtipo] = useState(servico.subtipos?.[0] ?? '');
  const [assunto, setAssunto] = useState(servico.titulo);
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<PrioridadeAtendimento>('NORMAL');

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    abrir.mutate(
      {
        cliente_id: clienteId,
        veiculo_id: veiculo.id,
        tipo,
        assunto: subtipo ? `${assunto} — ${subtipo}` : assunto,
        descricao,
        prioridade,
      },
      {
        onSuccess: (a) => { toast.success(`Protocolo aberto: ${a.numero_protocolo}`); onClose(); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={servico.titulo}>
      <form onSubmit={enviar} className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-[11px] font-semibold uppercase text-slate-400">Veiculo do atendimento</p>
          <p className="mt-0.5 font-medium text-slate-700">
            <span className="font-mono">{veiculo.placa}</span> · {[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ')} {veiculo.ano_modelo ?? ''}
          </p>
          <p className="text-xs text-slate-400">Chassi: {veiculo.chassi || '—'}</p>
        </div>

        {servico.tipos.length > 1 && (
          <FormField label="Tipo de solicitacao">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAtendimento)}>
              {servico.tipos.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </FormField>
        )}
        {servico.subtipos && (
          <FormField label="Categoria">
            <Select value={subtipo} onChange={(e) => setSubtipo(e.target.value)}>
              {servico.subtipos.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Prioridade">
          <Select value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeAtendimento)}>
            {PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Assunto">
          <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </FormField>
        <FormField label="Descricao">
          <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhe a solicitacao..." />
        </FormField>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={abrir.isPending}>
            {abrir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Abrir solicitacao
          </Button>
        </div>
      </form>
    </Modal>
  );
}
