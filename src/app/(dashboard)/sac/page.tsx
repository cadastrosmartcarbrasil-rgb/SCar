'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Search, User, Car, Phone, Mail, Loader2, CheckCircle2, XCircle, ShieldCheck,
  Layers, SplitSquareHorizontal, ChevronLeft, ChevronRight, ExternalLink, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Input, Select, Textarea, FormField } from '@/components/ui/field';
import {
  useSacBusca, useVisao360, useToggleFaturamento, useGerarBoleto,
  useAbrirAtendimento, useAtendimentosVeiculo, type Visao360, type Veiculo360,
} from '@/hooks/use-sac';
import { SERVICOS_SAC, STATUS_ATENDIMENTO_LABEL, type ServicoSac } from '@/lib/sac-servicos';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { OpcionalElegibilidade, TipoAtendimento, TipoFaturamento } from '@/lib/database.types';

export default function SacPage() {
  const [q, setQ] = useState('');
  const [clienteId, setClienteId] = useState<string | undefined>();
  const [veiculoId, setVeiculoId] = useState<string | undefined>();
  const busca = useSacBusca(q);
  const { data: v360, isLoading } = useVisao360(clienteId);

  // Auto-seleciona quando o associado tem um unico veiculo.
  useEffect(() => {
    if (v360 && !veiculoId && v360.veiculos.length === 1) setVeiculoId(v360.veiculos[0].id);
  }, [v360, veiculoId]);

  function abrirAssociado(id: string) {
    setClienteId(id);
    setVeiculoId(undefined);
    setQ('');
  }

  const veiculo = useMemo(
    () => v360?.veiculos.find((x) => x.id === veiculoId),
    [v360, veiculoId],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">SAC · Atendimento</h1>
        <p className="mt-0.5 text-sm text-slate-500">Selecione o associado, depois o veiculo. O atendimento fica isolado no item escolhido.</p>
      </div>

      {/* Busca global */}
      <div className="relative max-w-xl">
        <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-cyan-500/40">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por Nome, CPF/CNPJ ou Placa..." className="w-full text-sm outline-none" />
          {busca.isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
        </div>
        {q.trim().length >= 2 && (busca.data?.length ?? 0) > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {busca.data!.map((h) => (
              <li key={h.cliente_id}>
                <button onClick={() => abrirAssociado(h.cliente_id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="flex-1"><b className="text-slate-800">{h.nome}</b> <span className="text-slate-400">· {h.cpf_cnpj}</span></span>
                  {h.via && <span className="rounded bg-cyan-50 px-2 py-0.5 text-[11px] text-cyan-700">{h.via}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!clienteId && <p className="text-sm text-slate-400">Busque um associado para iniciar o atendimento.</p>}
      {clienteId && isLoading && <p className="py-10 text-center text-sm text-slate-400">Carregando dados...</p>}

      {v360 && (
        <div className="space-y-5">
          <AssociadoHeader v360={v360} />

          {!veiculo ? (
            <SeletorVeiculo v360={v360} onSelect={setVeiculoId} />
          ) : (
            <AtendimentoVeiculo
              v360={v360}
              veiculo={veiculo}
              podeTrocar={v360.veiculos.length > 1}
              onTrocar={() => setVeiculoId(undefined)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AssociadoHeader({ v360 }: { v360: Visao360 }) {
  const a = v360.associado;
  const r = v360.financeiro.resumo;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-sm font-bold text-white">
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
        {r.adimplente
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Adimplente</span>
          : <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700"><XCircle className="h-3.5 w-3.5" /> {r.vencidos} vencido(s) · {formatCurrency(r.valorEmAberto)}</span>}
      </CardContent>
    </Card>
  );
}

// Passo 1: escolher o veiculo (so a lista, sem detalhar nenhum ainda).
function SeletorVeiculo({ v360, onSelect }: { v360: Visao360; onSelect: (id: string) => void }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Car className="h-4 w-4 text-cyan-600" /> Selecione o veiculo do atendimento
      </p>
      {v360.veiculos.length === 0 ? (
        <p className="text-sm text-slate-400">Este associado nao possui veiculos cadastrados.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {v360.veiculos.map((v) => (
            <button key={v.id} onClick={() => onSelect(v.id)} className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-400 hover:shadow-md">
              <div>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-sm font-semibold text-slate-700">{v.placa}</span>
                <p className="mt-1.5 text-sm text-slate-600">{[v.marca, v.modelo].filter(Boolean).join(' ') || 'Veiculo'} {v.ano_modelo ?? ''}</p>
                <p className="text-xs text-slate-400">{v.plano_nome ?? 'Sem plano'} · {v.status}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:text-cyan-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Passo 2: veiculo isolado + menu modular de servicos.
function AtendimentoVeiculo({ v360, veiculo, podeTrocar, onTrocar }: {
  v360: Visao360; veiculo: Veiculo360; podeTrocar: boolean; onTrocar: () => void;
}) {
  const [servico, setServico] = useState<ServicoSac | null>(null);
  const gerarBoleto = useGerarBoleto();
  const { data: atendimentos } = useAtendimentosVeiculo(veiculo.id);

  function acionar(s: ServicoSac) {
    if (s.modo === 'boleto') {
      gerarBoleto.mutate({ cliente_id: v360.associado.id }, {
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
          <ChevronLeft className="h-4 w-4" /> Trocar veiculo
        </button>
      )}

      {/* Veiculo isolado */}
      <VeiculoDetalhe v360={v360} veiculo={veiculo} />

      {/* Menu modular de servicos */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">O que voce precisa para este veiculo?</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICOS_SAC.map((s) => (
            <button key={s.id} onClick={() => acionar(s)} disabled={s.modo === 'boleto' && gerarBoleto.isPending}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-cyan-400 hover:shadow-md disabled:opacity-60">
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

      {/* Acompanhamento */}
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

      {servico && <ServicoModal servico={servico} veiculo={veiculo} onClose={() => setServico(null)} />}
    </div>
  );
}

function VeiculoDetalhe({ v360, veiculo }: { v360: Visao360; veiculo: Veiculo360 }) {
  const toggle = useToggleFaturamento();
  const setModo = (tipo: TipoFaturamento) => {
    if (tipo === veiculo.tipo_faturamento) return;
    toggle.mutate({ veiculo_id: veiculo.id, tipo, cliente_id: v360.associado.id }, {
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
            <span className="rounded-md bg-brand-600 px-2.5 py-1 font-mono text-sm font-bold text-white">{veiculo.placa}</span>
            <span className="text-base font-semibold text-slate-800">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ')}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${veiculo.status === 'ativo' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{veiculo.status}</span>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
            <button onClick={() => setModo('AGRUPADO_ASSOCIADO')} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${veiculo.tipo_faturamento === 'AGRUPADO_ASSOCIADO' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Layers className="h-3.5 w-3.5" /> Agrupado
            </button>
            <button onClick={() => setModo('INDIVIDUAL_VEICULO')} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${veiculo.tipo_faturamento === 'INDIVIDUAL_VEICULO' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              <SplitSquareHorizontal className="h-3.5 w-3.5" /> Individual
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {dado('Chassi', veiculo.chassi)}
          {dado('Ano', veiculo.ano_modelo)}
          {dado('Cor', veiculo.cor)}
          {dado('Plano', veiculo.plano_nome)}
        </div>

        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Opcionais — uso nos ultimos 12 meses
          </p>
          {veiculo.opcionais.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum opcional com limite configurado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {veiculo.opcionais.map((o) => <OpcionalRow key={o.produto_id} o={o} />)}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OpcionalRow({ o }: { o: OpcionalElegibilidade }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-slate-700">{o.nome}</span>
      <div className="flex items-center gap-3">
        <span className="tnum text-xs text-slate-500">{o.usados}/{o.quantidade_limite} usados</span>
        {o.elegivel ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> DISPONIVEL</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700" title={o.ultimo_uso ? `Ultimo uso em ${formatDate(o.ultimo_uso)}` : undefined}><XCircle className="h-3.5 w-3.5" /> LIMITE EXCEDIDO</span>
        )}
      </div>
    </li>
  );
}

// Fluxo especifico do servico (chamado), com dados do veiculo pre-carregados.
function ServicoModal({ servico, veiculo, onClose }: { servico: ServicoSac; veiculo: Veiculo360; onClose: () => void }) {
  const abrir = useAbrirAtendimento();
  const [tipo, setTipo] = useState<TipoAtendimento>(servico.tipos[0].value);
  const [subtipo, setSubtipo] = useState(servico.subtipos?.[0] ?? '');
  const [assunto, setAssunto] = useState(servico.titulo);
  const [descricao, setDescricao] = useState('');

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    abrir.mutate(
      {
        veiculo_id: veiculo.id,
        tipo,
        canal: 'SAC_INTERNO',
        assunto,
        descricao,
        dados: subtipo ? { subtipo } : {},
      },
      {
        onSuccess: (d) => { toast.success(`Solicitacao aberta: ${d.atendimento.numero_protocolo}`); onClose(); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={servico.titulo}>
      <form onSubmit={enviar} className="space-y-3">
        {/* Veiculo pre-carregado (read-only) */}
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
        <FormField label="Assunto">
          <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
        </FormField>
        <FormField label="Descricao">
          <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhe a solicitacao..." />
        </FormField>

        {servico.linkSinistro && (
          <Link href={`/sinistros/novo?veiculo=${veiculo.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:text-cyan-800">
            <ExternalLink className="h-3.5 w-3.5" /> Abrir sinistro completo (com pecas e reparo)
          </Link>
        )}

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
