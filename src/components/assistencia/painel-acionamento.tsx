'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Search, ShieldCheck, ShieldAlert, LifeBuoy, Loader2, Lock, Send, CheckCircle2, Ban,
  Copy, MessageCircle, FileText, Truck, History, Pencil, Repeat, ClipboardList,
  Route, MapPin, Navigation, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, MoneyInput } from '@/components/ui/field';
import {
  useBuscaVeiculoAssistencia, useSituacaoAssistencia, useElegibilidadeAssistencia,
  useServicosAssistencia, useAbrirAcionamento, usePrestadoresDoServico, useCotacoes,
  useRegistrarCotacao, useConfirmarPrestador, useConcluirAcionamento, useCancelarAcionamento,
  useEnviarVoucher, useAcionamento, useHistoricoAssistenciaVeiculo,
  useAtualizarAcionamento, useTrocarPrestador, useEdicoesAcionamento, useDefinirTrajeto,
  type VeiculoAssistencia, type AbrirAcionamentoInput, type AcionamentoComRel,
} from '@/hooks/use-assistencia';
import { MapaRota } from '@/components/mapa/mapa-rota';
import {
  TrajetoAcionamento, type RotaCalculada,
} from '@/components/assistencia/trajeto-acionamento';
import {
  coordenadaDe, enderecoLinha, linksNavegacao, rotuloRota, type EnderecoGeo,
} from '@/lib/geo';
import {
  avaliarBloqueio, rotuloLimite, calcularKmExcedente, calcularTotalOS,
  STATUS_ACIONAMENTO_LABEL,
} from '@/lib/assistencia';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { Json, ServicosAssistenciaRow } from '@/lib/database.types';

export function PainelAcionamento({ placaInicial }: { placaInicial?: string | null }) {
  const [termo, setTermo] = useState(placaInicial ?? '');
  const [veiculo, setVeiculo] = useState<VeiculoAssistencia | null>(null);
  const [acionamentoId, setAcionamentoId] = useState<string | null>(null);

  const { data: achados, isFetching } = useBuscaVeiculoAssistencia(termo);
  const { data: situacao } = useSituacaoAssistencia(veiculo?.id ?? null);
  const { data: elegibilidade } = useElegibilidadeAssistencia(veiculo?.id ?? null);
  const { data: servicos } = useServicosAssistencia(true);
  const { data: historico } = useHistoricoAssistenciaVeiculo(veiculo?.id ?? null);

  // Placa vinda do SAC: seleciona sozinho quando ha um unico resultado.
  useEffect(() => {
    if (!veiculo && placaInicial && (achados?.length ?? 0) === 1) setVeiculo(achados![0]);
  }, [achados, placaInicial, veiculo]);

  const [servicoAcionar, setServicoAcionar] = useState<ServicosAssistenciaRow | null>(null);

  if (acionamentoId) {
    return (
      <OrdemServico
        acionamentoId={acionamentoId}
        onVoltar={() => setAcionamentoId(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Busca do veiculo pela placa */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <FormField label="Placa do veiculo">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              autoFocus
              placeholder="Digite a placa (min. 3 caracteres)"
              value={termo}
              onChange={(e) => { setTermo(e.target.value.toUpperCase()); setVeiculo(null); }}
            />
          </div>
        </FormField>

        {isFetching && <p className="mt-2 text-sm text-slate-400">Buscando...</p>}
        {!veiculo && (achados?.length ?? 0) > 0 && (
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {achados!.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => setVeiculo(v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>
                    <span className="font-semibold text-slate-800">{v.placa}</span>
                    <span className="ml-2 text-slate-500">{[v.marca, v.modelo].filter(Boolean).join(' ')}</span>
                  </span>
                  <span className="text-xs text-slate-400">{v.associado}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!isFetching && termo.length >= 3 && (achados?.length ?? 0) === 0 && (
          <p className="mt-2 text-sm text-slate-400">Nenhum veiculo com essa placa.</p>
        )}
      </div>

      {veiculo && (
        <>
          {/* Trava: situacao do veiculo */}
          <div className={`rounded-2xl border p-4 ${situacao?.pode_acionar ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  {situacao?.pode_acionar ? (
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-rose-600" />
                  )}
                  {veiculo.placa} — {[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ')}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {veiculo.associado}
                  {veiculo.telefone ? ` · ${veiculo.telefone}` : ''}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${situacao?.pode_acionar ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {situacao?.pode_acionar ? 'Liberado para acionar' : 'Acionamento bloqueado'}
              </span>
            </div>
            {!situacao?.pode_acionar && (situacao?.motivos?.length ?? 0) > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-rose-700">
                {situacao!.motivos.map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
            {situacao && situacao.valor_em_atraso > 0 && (
              <p className="mt-1 text-xs text-rose-600">
                Total em atraso: {formatCurrency(Number(situacao.valor_em_atraso))}
              </p>
            )}
          </div>

          {/* Servicos com o limite em TEMPO REAL */}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Servico solicitado</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(servicos ?? []).map((s) => {
                const e = elegibilidade?.find((x) => x.servico_id === s.id);
                const esgotado = !!e && e.computa_limite && !e.elegivel;
                return (
                  <button
                    key={s.id}
                    onClick={() => setServicoAcionar(s)}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-400 hover:shadow-md"
                  >
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${esgotado ? 'bg-rose-50 text-rose-600' : 'bg-cyan-50 text-cyan-600'}`}>
                      <LifeBuoy className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800">{s.descricao}</span>
                      <span className="block text-xs text-slate-500">
                        {formatCurrency(Number(s.valor_padrao))}
                        {s.cobra_km_excedente ? ` + ${formatCurrency(Number(s.valor_km_excedente))}/km apos ${s.km_franquia}km` : ''}
                      </span>
                      {e && (
                        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] ${esgotado ? 'bg-rose-50 text-rose-700' : e.computa_limite ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          {rotuloLimite(e)}
                          {e.ultimo_uso ? ` · ultimo ${formatDate(e.ultimo_uso)}` : ''}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Historico do veiculo */}
          {(historico?.length ?? 0) > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
                <History className="h-4 w-4 text-brand-700" />
                <h2 className="text-sm font-semibold text-slate-900">Acionamentos deste veiculo</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {historico!.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{h.codigo_os ?? h.protocolo}</span>
                      <span className="text-slate-700">{h.servico}</span>
                      {h.computa_limite && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">conta no limite</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">{formatDate(h.criado_em)}</span>
                      <span className="tnum text-slate-600">{formatCurrency(Number(h.valor_total))}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_ACIONAMENTO_LABEL[h.status].cor}`}>
                        {STATUS_ACIONAMENTO_LABEL[h.status].label}
                      </span>
                      <button onClick={() => setAcionamentoId(h.id)} className="text-xs font-medium text-cyan-700 hover:underline">
                        Abrir
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {servicoAcionar && veiculo && (
        <ModalAcionar
          veiculo={veiculo}
          servico={servicoAcionar}
          bloqueio={avaliarBloqueio(situacao, elegibilidade?.find((e) => e.servico_id === servicoAcionar.id))}
          onClose={() => setServicoAcionar(null)}
          onAberto={(id) => { setServicoAcionar(null); setAcionamentoId(id); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de abertura (com liberacao de superior quando bloqueado)
// ---------------------------------------------------------------------------
function ModalAcionar({
  veiculo, servico, bloqueio, onClose, onAberto,
}: {
  veiculo: VeiculoAssistencia;
  servico: ServicosAssistenciaRow;
  bloqueio: ReturnType<typeof avaliarBloqueio>;
  onClose: () => void;
  onAberto: (id: string) => void;
}) {
  const abrir = useAbrirAcionamento();
  const definirTrajeto = useDefinirTrajeto();
  const [form, setForm] = useState({
    solicitante: veiculo.associado,
    telefone: veiculo.telefone ?? '',
    km_previsto: '' as string,
    observacoes: '',
  });
  // Trajeto (0031): origem/destino com geocodificacao + rota calculada.
  const [origem, setOrigem] = useState<EnderecoGeo>({});
  const [destino, setDestino] = useState<EnderecoGeo>({});
  const [rota, setRota] = useState<RotaCalculada | null>(null);
  const [liberacao, setLiberacao] = useState<{ email: string; senha: string; justificativa: string } | null>(
    bloqueio.bloqueado ? { email: '', senha: '', justificativa: '' } : null,
  );

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueio.bloqueado) {
      if (!liberacao?.email || !liberacao.senha || !liberacao.justificativa.trim()) {
        return toast.error('Preencha as credenciais do gestor e a justificativa');
      }
    }
    const payload: AbrirAcionamentoInput = {
      veiculo_id: veiculo.id,
      servico_id: servico.id,
      solicitante: form.solicitante || null,
      telefone: form.telefone || null,
      origem: origem as Json,
      destino: destino as Json,
      // KM previsto: o da rota calculada; o campo manual continua valendo
      // quando o provedor de mapas nao respondeu.
      km_previsto: rota?.distancia_km ?? (form.km_previsto ? Number(form.km_previsto) : null),
      observacoes: form.observacoes || null,
      liberacao: bloqueio.bloqueado ? liberacao : null,
    };
    abrir.mutate(payload, {
      onSuccess: async (r) => {
        // Rota calculada entra na OS (distancia, duracao e tracado) pela funcao
        // que tambem recalcula o KM excedente.
        if (rota) {
          try {
            await definirTrajeto.mutateAsync({
              acionamento_id: r.acionamento.id,
              distancia_km: rota.distancia_km,
              duracao_min: rota.duracao_min,
              polyline: rota.polyline,
              motivo: 'Rota calculada na abertura',
            });
          } catch {
            toast.message('Acionamento aberto, mas a rota nao foi gravada — recalcule na OS.');
          }
        }
        toast.success(
          r.liberado_por
            ? `Acionamento ${r.acionamento.protocolo} aberto com liberacao de ${r.liberado_por}`
            : `Acionamento ${r.acionamento.protocolo} aberto`,
        );
        onAberto(r.acionamento.id);
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <Modal open onClose={onClose} title={`Acionar ${servico.descricao} — ${veiculo.placa}`} tamanho="xl">
      <form onSubmit={enviar} className="space-y-3">
        {bloqueio.bloqueado && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-rose-700">
              <Lock className="h-4 w-4" /> Acionamento bloqueado
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-rose-700">
              {bloqueio.motivos.map((m) => <li key={m}>{m}</li>)}
            </ul>
            <p className="mt-2 text-xs text-rose-600">
              Para prosseguir, um gestor (admin, financeiro ou gestor regional) precisa autorizar
              com as proprias credenciais.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <FormField label="E-mail do gestor">
                <Input
                  type="email" autoComplete="off"
                  value={liberacao?.email ?? ''}
                  onChange={(e) => setLiberacao((l) => ({ ...(l ?? { senha: '', justificativa: '' }), email: e.target.value }))}
                />
              </FormField>
              <FormField label="Senha do gestor">
                <Input
                  type="password" autoComplete="new-password"
                  value={liberacao?.senha ?? ''}
                  onChange={(e) => setLiberacao((l) => ({ ...(l ?? { email: '', justificativa: '' }), senha: e.target.value }))}
                />
              </FormField>
              <FormField label="Justificativa da liberacao" className="sm:col-span-2">
                <Input
                  value={liberacao?.justificativa ?? ''}
                  onChange={(e) => setLiberacao((l) => ({ ...(l ?? { email: '', senha: '' }), justificativa: e.target.value }))}
                  placeholder="Ex.: veiculo parado em rodovia, risco ao associado"
                />
              </FormField>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Solicitante">
            <Input value={form.solicitante} onChange={(e) => setForm({ ...form, solicitante: e.target.value })} />
          </FormField>
          <FormField label="Telefone de contato">
            <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </FormField>
          <FormField label="KM previsto (manual)">
            <Input type="number" min={0} value={rota ? String(rota.distancia_km) : form.km_previsto}
              disabled={!!rota}
              onChange={(e) => setForm({ ...form, km_previsto: e.target.value })}
              placeholder="preenchido pela rota" />
          </FormField>
          <FormField label="Observacoes">
            <Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </FormField>
        </div>

        {/* Origem, destino, mapa da rota e simulacao do KM excedente */}
        <TrajetoAcionamento
          origem={origem}
          destino={destino}
          rota={rota}
          servico={servico}
          onChange={(v) => { setOrigem(v.origem); setDestino(v.destino); setRota(v.rota); }}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant={bloqueio.bloqueado ? 'danger' : 'primary'} disabled={abrir.isPending}>
            {abrir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LifeBuoy className="h-4 w-4" />}
            {bloqueio.bloqueado ? 'Liberar e acionar' : 'Abrir acionamento'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Ordem de Servico: cotacao -> prestador -> voucher -> conclusao
// ---------------------------------------------------------------------------
export function OrdemServico({ acionamentoId, onVoltar }: { acionamentoId: string; onVoltar?: () => void }) {
  const { data: a } = useAcionamento(acionamentoId);
  const { data: servicos } = useServicosAssistencia();
  const { data: prestadores } = usePrestadoresDoServico(a?.servico_id ?? null);
  const { data: cotacoes } = useCotacoes(acionamentoId);
  const registrar = useRegistrarCotacao();
  const confirmar = useConfirmarPrestador();
  const concluir = useConcluirAcionamento();
  const cancelar = useCancelarAcionamento();
  const voucher = useEnviarVoucher();

  const [cot, setCot] = useState({ fornecedor_id: '', valor: 0 as number | null, valor_km: 0 as number | null, prazo: '' });
  const [kmReal, setKmReal] = useState('');
  const [textoVoucher, setTextoVoucher] = useState<{ texto: string; whatsapp: string | null } | null>(null);
  const [editando, setEditando] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const servico = useMemo(
    () => servicos?.find((s) => s.id === a?.servico_id) ?? null,
    [servicos, a?.servico_id],
  );

  if (!a) return <p className="text-sm text-slate-400">Carregando acionamento...</p>;

  const finalizado = a.status === 'CONCLUIDO' || a.status === 'CANCELADO';
  // Base do KM excedente: o KM informado > a rota calculada > o previsto.
  const kmBase = Number(kmReal || a.distancia_km_calculada || a.km_previsto || 0);
  const kmExc = servico ? calcularKmExcedente(kmBase, Number(servico.km_franquia)) : 0;

  function escolher(fornecedorId: string, valor: number, valorKm: number | null, prazo: number | null) {
    if (!servico) return;
    const total = calcularTotalOS(servico, valor, kmExc, valorKm);
    confirmar.mutate(
      {
        acionamento_id: a!.id,
        fornecedor_id: fornecedorId,
        valor_servico: valor,
        km_excedente: kmExc,
        valor_km: valorKm,
        prazo_min: prazo,
      },
      {
        onSuccess: (os) => toast.success(`OS ${os.codigo_os} gerada — ${formatCurrency(total.total)}`),
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="space-y-5">
      {onVoltar && (
        <button onClick={onVoltar} className="text-sm font-medium text-cyan-700 hover:text-cyan-800">
          ← Voltar ao painel
        </button>
      )}

      {/* Cabecalho da OS */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-slate-400">{a.protocolo}{a.codigo_os ? ` · ${a.codigo_os}` : ''}</p>
            <h2 className="text-lg font-semibold text-slate-900">{a.servicos_assistencia?.descricao}</h2>
            <p className="text-sm text-slate-600">
              {a.veiculos?.placa} — {a.clientes?.nome_razao_social}
            </p>
          </div>
          <div className="text-right">
            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_ACIONAMENTO_LABEL[a.status].cor}`}>
              {STATUS_ACIONAMENTO_LABEL[a.status].label}
            </span>
            <p className="tnum mt-1 text-xl font-semibold text-slate-900">{formatCurrency(Number(a.valor_total))}</p>
            {Number(a.valor_km_excedente) > 0 && (
              <p className="text-xs text-slate-400">
                servico {formatCurrency(Number(a.valor_servico))} + km {formatCurrency(Number(a.valor_km_excedente))}
              </p>
            )}
          </div>
        </div>

        {a.liberado_por && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            <Lock className="mr-1 inline h-3 w-3" />
            Liberado por superior — {a.liberacao_justificativa}
            {a.bloqueio_motivos?.length ? ` (motivos: ${a.bloqueio_motivos.join('; ')})` : ''}
          </p>
        )}
        {a.lancamento_id && (
          <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
            <FileText className="mr-1 inline h-3 w-3" />
            Lancado em Contas a Pagar para {a.fornecedores?.razao_social}.
          </p>
        )}
      </div>

      {/* Trajeto: mapa da rota, distancia e navegacao do prestador */}
      <CardTrajeto acionamento={a} servico={servico} editavel={!finalizado} />

      {/* Cotacao */}
      {!finalizado && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">Cotacao com prestadores</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <FormField label="Prestador" className="md:col-span-2">
              <Select
                value={cot.fornecedor_id}
                onChange={(e) => {
                  const p = prestadores?.find((x) => x.fornecedor_id === e.target.value);
                  setCot({
                    fornecedor_id: e.target.value,
                    valor: p?.valor_acordado ?? Number(servico?.valor_padrao ?? 0),
                    valor_km: p?.valor_km ?? Number(servico?.valor_km_excedente ?? 0),
                    prazo: p?.prazo_medio_min ? String(p.prazo_medio_min) : '',
                  });
                }}
              >
                <option value="">Selecione...</option>
                {(prestadores ?? []).map((p) => (
                  <option key={p.fornecedor_id} value={p.fornecedor_id}>
                    {p.razao_social}{p.cobertura ? ` — ${p.cobertura}` : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Valor negociado">
              <MoneyInput value={cot.valor} onChange={(v) => setCot({ ...cot, valor: v })} />
            </FormField>
            {servico?.cobra_km_excedente && (
              <FormField label="Valor do KM">
                <MoneyInput value={cot.valor_km} onChange={(v) => setCot({ ...cot, valor_km: v })} />
              </FormField>
            )}
            <FormField label="Prazo (min)">
              <Input type="number" min={0} value={cot.prazo} onChange={(e) => setCot({ ...cot, prazo: e.target.value })} />
            </FormField>
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                if (!cot.fornecedor_id) return toast.error('Selecione o prestador');
                registrar.mutate(
                  {
                    acionamento_id: a.id,
                    fornecedor_id: cot.fornecedor_id,
                    valor: cot.valor ?? 0,
                    valor_km: cot.valor_km,
                    prazo_min: cot.prazo ? Number(cot.prazo) : null,
                  },
                  { onSuccess: () => toast.success('Cotacao registrada'), onError: (e) => toast.error(e.message) },
                );
              }}
            >
              Registrar cotacao
            </Button>
          </div>

          {(cotacoes?.length ?? 0) > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {cotacoes!.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-700">{c.fornecedores?.razao_social}</span>
                    {c.escolhida && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">escolhido</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tnum text-slate-700">{formatCurrency(Number(c.valor))}</span>
                    {c.prazo_estimado_min && <span className="text-xs text-slate-400">{c.prazo_estimado_min} min</span>}
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      onClick={() => escolher(c.fornecedor_id, Number(c.valor), c.valor_km, c.prazo_estimado_min)}
                      disabled={confirmar.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar e gerar OS
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {servico?.cobra_km_excedente && (
            <p className="mt-2 text-xs text-slate-500">
              KM excedente calculado: <strong>{kmExc} km</strong> (franquia de {servico.km_franquia} km).
              Informe o KM real abaixo antes de confirmar para ajustar o valor.
            </p>
          )}
        </div>
      )}

      {/* Voucher + conclusao */}
      {a.codigo_os && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">Comunicado ao prestador e fechamento</h3>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Button
              variant="secondary"
              disabled={voucher.isPending}
              onClick={() =>
                voucher.mutate(
                  { acionamento_id: a.id },
                  {
                    onSuccess: (r) => {
                      setTextoVoucher({ texto: r.texto, whatsapp: r.whatsapp });
                      toast.success(r.email_enviado ? `Voucher enviado para ${r.destinatario}` : 'Voucher gerado');
                    },
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              <Send className="h-4 w-4" /> Gerar/enviar voucher
            </Button>

            {!finalizado && (
              <>
                <FormField label="KM percorrido">
                  <Input type="number" min={0} value={kmReal} onChange={(e) => setKmReal(e.target.value)} className="w-32" />
                </FormField>
                <Button
                  disabled={concluir.isPending}
                  onClick={() =>
                    concluir.mutate(
                      { acionamento_id: a.id, km_percorrido: kmReal ? Number(kmReal) : null },
                      {
                        onSuccess: () => toast.success('OS concluida e lancada em Contas a Pagar'),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  <CheckCircle2 className="h-4 w-4" /> Concluir OS
                </Button>
                <Button variant="secondary" onClick={() => setEditando(true)}>
                  <Pencil className="h-4 w-4" /> Editar OS
                </Button>
                <Button variant="secondary" onClick={() => setTrocando(true)}>
                  <Repeat className="h-4 w-4" /> Trocar prestador
                </Button>
                <Button variant="ghost" className="text-rose-600" onClick={() => setCancelando(true)}>
                  <Ban className="h-4 w-4" /> Cancelar OS
                </Button>
              </>
            )}
          </div>

          {textoVoucher && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <pre className="whitespace-pre-wrap text-xs text-slate-700">{textoVoucher.texto}</pre>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  className="px-2 py-1 text-xs"
                  onClick={() => {
                    navigator.clipboard?.writeText(textoVoucher.texto);
                    toast.success('Comunicado copiado');
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
                {textoVoucher.whatsapp && (
                  <a
                    href={textoVoucher.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Enviar no WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auditoria das edicoes */}
      <TrilhaEdicoes acionamentoId={a.id} />

      {editando && (
        <ModalEditarOS acionamento={a} servico={servico} onClose={() => setEditando(false)} />
      )}
      {trocando && (
        <ModalTrocarPrestador acionamento={a} onClose={() => setTrocando(false)} />
      )}
      {cancelando && (
        <ModalCancelar
          onClose={() => setCancelando(false)}
          onConfirmar={(motivo) =>
            cancelar.mutate(
              { acionamento_id: a.id, motivo },
              {
                onSuccess: () => { toast.success('Acionamento cancelado'); setCancelando(false); },
                onError: (e) => toast.error(e.message),
              },
            )
          }
          carregando={cancelar.isPending}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trajeto da OS: mapa, distancia calculada e links de navegacao (0031)
// ---------------------------------------------------------------------------
function CardTrajeto({ acionamento, servico, editavel }: {
  acionamento: AcionamentoComRel;
  servico?: ServicosAssistenciaRow | null;
  editavel: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const origem = (acionamento.origem ?? {}) as EnderecoGeo;
  const destino = (acionamento.destino ?? {}) as EnderecoGeo;
  const links = linksNavegacao(origem, destino);
  const km = acionamento.distancia_km_calculada != null ? Number(acionamento.distancia_km_calculada) : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Route className="h-4 w-4 text-cyan-600" /> Trajeto do atendimento
        </h3>
        {editavel && (
          <Button variant="secondary" onClick={() => setEditando(true)}>
            <MapPin className="h-4 w-4" /> Editar trajeto
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <MapaRota origem={coordenadaDe(origem)} destino={coordenadaDe(destino)} altura={220} />
        <div className="space-y-2 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Origem (resgate)</p>
            <p className="font-medium text-slate-700">{enderecoLinha(origem) || '—'}</p>
            {origem.referencia && <p className="text-xs text-slate-500">Ref.: {origem.referencia}</p>}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Destino</p>
            <p className="font-medium text-slate-700">{enderecoLinha(destino) || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Distancia autorizada</p>
            <p className="tnum text-lg font-semibold text-slate-900">
              {rotuloRota(km, acionamento.duracao_minutos)}
            </p>
            {servico?.cobra_km_excedente && km != null && (
              <p className="text-xs text-slate-500">
                Franquia {servico.km_franquia} km · excedente {calcularKmExcedente(km, Number(servico.km_franquia))} km
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {links.googleRota && (
              <a href={links.googleRota} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <ExternalLink className="h-3.5 w-3.5" /> Rota (Google Maps)
              </a>
            )}
            {links.wazeOrigem && (
              <a href={links.wazeOrigem} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Navigation className="h-3.5 w-3.5" /> Navegar (Waze)
              </a>
            )}
          </div>
        </div>
      </div>

      {editando && (
        <ModalEditarTrajeto acionamento={acionamento} servico={servico} onClose={() => setEditando(false)} />
      )}
    </div>
  );
}

// Edicao do trajeto: recalcula rota, KM excedente e sincroniza Contas a Pagar.
function ModalEditarTrajeto({ acionamento, servico, onClose }: {
  acionamento: AcionamentoComRel;
  servico?: ServicosAssistenciaRow | null;
  onClose: () => void;
}) {
  const definir = useDefinirTrajeto();
  const [origem, setOrigem] = useState<EnderecoGeo>((acionamento.origem ?? {}) as EnderecoGeo);
  const [destino, setDestino] = useState<EnderecoGeo>((acionamento.destino ?? {}) as EnderecoGeo);
  const [rota, setRota] = useState<RotaCalculada | null>(
    acionamento.distancia_km_calculada != null
      ? {
          distancia_km: Number(acionamento.distancia_km_calculada),
          duracao_min: Number(acionamento.duracao_minutos ?? 0),
          polyline: acionamento.rota_polyline, pontos: [],
        }
      : null,
  );
  const [motivo, setMotivo] = useState('');

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!motivo.trim()) return toast.error('Informe o motivo da alteracao do trajeto (fica na auditoria)');
    definir.mutate(
      {
        acionamento_id: acionamento.id,
        origem: origem as Json,
        destino: destino as Json,
        distancia_km: rota?.distancia_km ?? null,
        duracao_min: rota?.duracao_min ?? null,
        polyline: rota?.polyline ?? null,
        motivo,
      },
      {
        onSuccess: (os) => {
          toast.success(`Trajeto atualizado — total ${formatCurrency(Number(os.valor_total))}`);
          onClose();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={`Trajeto da OS ${acionamento.codigo_os ?? acionamento.protocolo ?? ''}`} tamanho="xl">
      <form onSubmit={salvar} className="space-y-3">
        <TrajetoAcionamento
          origem={origem} destino={destino} rota={rota} servico={servico}
          onChange={(v) => { setOrigem(v.origem); setDestino(v.destino); setRota(v.rota); }}
        />
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Ao salvar, o KM excedente e o valor da OS sao recalculados pela distancia da rota e o
          titulo em Contas a Pagar e sincronizado (se ja houver baixa, o valor pago nao e alterado).
        </p>
        <FormField label="Motivo da alteracao *">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: associado pediu para levar a outra oficina" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={definir.isPending}>
            {definir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
            Salvar trajeto
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edicao dinamica: valores, trajeto e KM (sincroniza o Contas a Pagar)
// ---------------------------------------------------------------------------
function ModalEditarOS({
  acionamento, servico, onClose,
}: {
  acionamento: AcionamentoComRel;
  servico: ServicosAssistenciaRow | null;
  onClose: () => void;
}) {
  const atualizar = useAtualizarAcionamento();
  const destinoAtual = (acionamento.destino ?? {}) as Record<string, string | undefined>;
  const [form, setForm] = useState({
    valor_servico: Number(acionamento.valor_servico) as number | null,
    km_excedente: String(acionamento.km_excedente ?? 0),
    valor_km: (Number(acionamento.km_excedente) > 0
      ? Number(acionamento.valor_km_excedente) / Number(acionamento.km_excedente)
      : Number(servico?.valor_km_excedente ?? 0)) as number | null,
    km_percorrido: acionamento.km_percorrido != null ? String(acionamento.km_percorrido) : '',
    destino: destinoAtual.logradouro ?? '',
    prazo: acionamento.prazo_estimado_min != null ? String(acionamento.prazo_estimado_min) : '',
    observacoes: acionamento.observacoes ?? '',
    motivo: '',
  });

  const previa = calcularTotalOS(
    servico ?? { cobra_km_excedente: false, valor_km_excedente: 0, km_franquia: 0 },
    form.valor_servico ?? 0,
    Number(form.km_excedente || 0),
    form.valor_km,
  );

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.motivo.trim()) return toast.error('Descreva o motivo da alteracao (fica na auditoria)');
    atualizar.mutate(
      {
        acionamento_id: acionamento.id,
        valor_servico: form.valor_servico,
        km_excedente: Number(form.km_excedente || 0),
        valor_km: form.valor_km,
        km_percorrido: form.km_percorrido ? Number(form.km_percorrido) : null,
        destino: form.destino ? { logradouro: form.destino } : null,
        prazo_min: form.prazo ? Number(form.prazo) : null,
        observacoes: form.observacoes || null,
        motivo: form.motivo,
      },
      {
        onSuccess: (os) => {
          toast.success(`OS atualizada — novo total ${formatCurrency(Number(os.valor_total))}`);
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={`Editar ${acionamento.codigo_os ?? acionamento.protocolo}`}>
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Valor do servico">
            <MoneyInput value={form.valor_servico} onChange={(v) => setForm({ ...form, valor_servico: v })} />
          </FormField>
          {servico?.cobra_km_excedente && (
            <>
              <FormField label="KM excedente">
                <Input type="number" min={0} value={form.km_excedente}
                  onChange={(e) => setForm({ ...form, km_excedente: e.target.value })} />
              </FormField>
              <FormField label="Valor do KM">
                <MoneyInput value={form.valor_km} onChange={(v) => setForm({ ...form, valor_km: v })} />
              </FormField>
            </>
          )}
          <FormField label="KM percorrido">
            <Input type="number" min={0} value={form.km_percorrido}
              onChange={(e) => setForm({ ...form, km_percorrido: e.target.value })} />
          </FormField>
          <FormField label="Destino do reboque" className="sm:col-span-2">
            <Input value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })}
              placeholder="Oficina, residencia, patio..." />
          </FormField>
          <FormField label="Prazo (min)">
            <Input type="number" min={0} value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
          </FormField>
          <FormField label="Observacoes">
            <Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </FormField>
          <FormField label="Motivo da alteracao (auditoria)" className="sm:col-span-2">
            <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              placeholder="Ex.: trajeto maior que o previsto" />
          </FormField>
        </div>

        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Novo total: <strong className="tnum">{formatCurrency(previa.total)}</strong>
          {previa.valorKmExcedente > 0 && (
            <span className="text-xs text-slate-400"> (servico {formatCurrency(previa.valorServico)} + km {formatCurrency(previa.valorKmExcedente)})</span>
          )}
          <span className="mt-1 block text-xs text-slate-500">
            O titulo no Contas a Pagar e recalculado automaticamente, desde que ainda nao tenha baixa.
          </span>
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={atualizar.isPending}>Salvar alteracoes</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Troca de prestador (cancela o lancamento anterior e gera o novo)
// ---------------------------------------------------------------------------
function ModalTrocarPrestador({ acionamento, onClose }: { acionamento: AcionamentoComRel; onClose: () => void }) {
  const { data: prestadores } = usePrestadoresDoServico(acionamento.servico_id);
  const trocar = useTrocarPrestador();
  const [form, setForm] = useState({ fornecedor_id: '', valor: null as number | null, valor_km: null as number | null, prazo: '', motivo: '' });

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fornecedor_id) return toast.error('Selecione o novo prestador');
    if (!form.motivo.trim()) return toast.error('Informe a justificativa da troca');
    trocar.mutate(
      {
        acionamento_id: acionamento.id,
        fornecedor_id: form.fornecedor_id,
        motivo: form.motivo,
        valor_servico: form.valor,
        valor_km: form.valor_km,
        prazo_min: form.prazo ? Number(form.prazo) : null,
      },
      {
        onSuccess: (os) => {
          toast.success(`Prestador trocado — novo total ${formatCurrency(Number(os.valor_total))}`);
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Trocar prestador da OS">
      <form onSubmit={confirmar} className="space-y-3">
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          O lancamento do prestador atual ({acionamento.fornecedores?.razao_social ?? '-'}) sera
          cancelado no Contas a Pagar (se ainda nao tiver baixa) e um novo sera gerado para o
          substituto. O voucher precisa ser reenviado.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Novo prestador" className="sm:col-span-2">
            <Select
              value={form.fornecedor_id}
              onChange={(e) => {
                const p = prestadores?.find((x) => x.fornecedor_id === e.target.value);
                setForm({
                  ...form,
                  fornecedor_id: e.target.value,
                  valor: p?.valor_acordado ?? null,
                  valor_km: p?.valor_km ?? null,
                  prazo: p?.prazo_medio_min ? String(p.prazo_medio_min) : '',
                });
              }}
            >
              <option value="">Selecione...</option>
              {(prestadores ?? [])
                .filter((p) => p.fornecedor_id !== acionamento.prestador_id)
                .map((p) => (
                  <option key={p.fornecedor_id} value={p.fornecedor_id}>
                    {p.razao_social}{p.cobertura ? ` — ${p.cobertura}` : ''}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Valor negociado">
            <MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
          </FormField>
          <FormField label="Valor do KM">
            <MoneyInput value={form.valor_km} onChange={(v) => setForm({ ...form, valor_km: v })} />
          </FormField>
          <FormField label="Prazo (min)">
            <Input type="number" min={0} value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} />
          </FormField>
          <FormField label="Justificativa (obrigatoria)" className="sm:col-span-2">
            <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              placeholder="Ex.: guincho desistiu / demora acima do combinado" />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="submit" disabled={trocar.isPending}>Confirmar troca</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Cancelamento com justificativa obrigatoria
// ---------------------------------------------------------------------------
function ModalCancelar({
  onClose, onConfirmar, carregando,
}: {
  onClose: () => void;
  onConfirmar: (motivo: string) => void;
  carregando?: boolean;
}) {
  const [motivo, setMotivo] = useState('');
  return (
    <Modal open onClose={onClose} title="Cancelar acionamento">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!motivo.trim()) return toast.error('A justificativa e obrigatoria');
          onConfirmar(motivo);
        }}
        className="space-y-3"
      >
        <p className="text-sm text-slate-600">
          O lancamento no Contas a Pagar tambem sera cancelado, se ainda nao tiver baixa.
        </p>
        <FormField label="Justificativa (obrigatoria)">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: associado resolveu com terceiro / prestador nao compareceu" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="submit" variant="danger" disabled={carregando}>Cancelar OS</Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Trilha de auditoria da OS
// ---------------------------------------------------------------------------
const CAMPO_LABEL: Record<string, string> = {
  prestador: 'Prestador',
  valor_servico: 'Valor do servico',
  km_excedente: 'KM excedente',
  valor_km_excedente: 'Valor do KM excedente',
  valor_total: 'Valor total',
  destino: 'Destino',
  km_percorrido: 'KM percorrido',
  prazo_estimado_min: 'Prazo (min)',
  status: 'Status',
  contas_a_pagar: 'Contas a pagar',
};

function TrilhaEdicoes({ acionamentoId }: { acionamentoId: string }) {
  const { data: edicoes } = useEdicoesAcionamento(acionamentoId);
  if (!edicoes || edicoes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <ClipboardList className="h-4 w-4 text-brand-700" />
        <h3 className="text-sm font-semibold text-slate-900">Historico de alteracoes</h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {edicoes.map((e) => (
          <li key={e.id} className="px-5 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-700">
                <b>{CAMPO_LABEL[e.campo] ?? e.campo}</b>
                {e.valor_anterior || e.valor_novo ? (
                  <span className="text-slate-500">
                    {' '}: {e.valor_anterior ?? '—'} → {e.valor_novo ?? '—'}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-slate-400">
                {formatDateTime(e.created_at)} · {e.operador}
              </span>
            </div>
            {e.motivo && <p className="text-xs text-slate-500">Motivo: {e.motivo}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
