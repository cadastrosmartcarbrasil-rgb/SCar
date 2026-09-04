'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ChevronLeft, Satellite, Car, Wrench, ArrowRightLeft, History, ExternalLink, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, Textarea, MoneyInput } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import { useVeiculos } from '@/hooks/use-veiculos';
import {
  useRastreadorFicha, useRastreadorHistorico, useInstalarRastreador, useDesinstalarRastreador,
  useMoverStatusRastreador, useTransferirRastreador, useAbrirManutencao, useConcluirManutencao,
} from '@/hooks/use-rastreadores';
import {
  statusMeta, rotuloStatus, statusEscolhiveis, exigeMotivo, alertaDePrazo, formatarChip,
} from '@/lib/rastreador';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { StatusRastreador } from '@/lib/database.types';

type Acao = 'instalar' | 'desinstalar' | 'status' | 'transferir' | 'manutencao' | 'concluir' | null;

export default function FichaRastreadorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r, isLoading } = useRastreadorFicha(id);
  const { data: historico } = useRastreadorHistorico(id);
  const [acao, setAcao] = useState<Acao>(null);

  if (isLoading) return <p className="text-sm text-slate-400">Carregando...</p>;
  if (!r) return <p className="text-sm text-slate-400">Equipamento nao encontrado.</p>;

  const meta = statusMeta(r.status);
  const alerta = alertaDePrazo(r.status, r.status_desde);

  return (
    <div className="space-y-5">
      <Link href="/rastreadores" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-4 w-4" /> Rastreadores
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Satellite className="h-6 w-6 text-cyan-600" />
            <span className="font-mono">{r.imei}</span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.cor}`}>{rotuloStatus(r.status)}</span>
            <span>ha {r.dias_no_status} dia(s)</span>
            {r.plataforma && <span>· {r.plataforma}</span>}
            {r.regional && <span>· {r.regional}</span>}
          </p>
          {alerta && <p className="mt-1 text-xs font-medium text-amber-600">{alerta.mensagem}</p>}
        </div>

        {r.pode_editar && (
          <div className="flex flex-wrap gap-2">
            {r.status === 'DISPONIVEL' && (
              <Button onClick={() => setAcao('instalar')}><Car className="h-4 w-4" /> Instalar em veiculo</Button>
            )}
            {r.status === 'ATIVO' && (
              <Button variant="secondary" onClick={() => setAcao('desinstalar')}>Desinstalar</Button>
            )}
            {r.manutencao_aberta_id
              ? <Button variant="secondary" onClick={() => setAcao('concluir')}><Wrench className="h-4 w-4" /> Concluir manutencao</Button>
              : <Button variant="secondary" onClick={() => setAcao('manutencao')}><Wrench className="h-4 w-4" /> Manutencao</Button>}
            <Button variant="secondary" onClick={() => setAcao('transferir')}><ArrowRightLeft className="h-4 w-4" /> Transferir</Button>
            <Button variant="secondary" onClick={() => setAcao('status')}>Mudar status</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Equipamento */}
        <section className="rounded-lg border border-slate-200 bg-superficie p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Equipamento</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Dado rotulo="Nº do chip (linha)" valor={formatarChip(r.linha)} />
            <Dado rotulo="ICCID" valor={r.iccid} />
            <Dado rotulo="Operadora" valor={r.operadora} />
            <Dado rotulo="Modelo" valor={r.modelo} />
            <Dado rotulo="Fabricante" valor={r.fabricante} />
            <Dado rotulo="Nº de serie" valor={r.numero_serie} />
            <Dado rotulo="Aquisicao" valor={r.data_aquisicao ? formatDate(r.data_aquisicao) : null} />
            <Dado rotulo="Valor" valor={r.valor_aquisicao != null ? formatCurrency(r.valor_aquisicao) : null} />
            <Dado rotulo="Nota fiscal" valor={r.nota_fiscal} />
          </div>
          {r.observacoes && <p className="mt-3 text-sm text-slate-600">{r.observacoes}</p>}
          {r.plataforma_url && (
            <a href={r.plataforma_url} target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm text-cyan-700 hover:underline">
              Abrir plataforma <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </section>

        {/* Veiculo vinculado */}
        <section className="rounded-lg border border-slate-200 bg-superficie p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Instalacao</h2>
          {r.veiculo_id ? (
            <div className="space-y-2 text-sm">
              <p className="font-mono text-lg font-semibold text-slate-900">{r.placa}</p>
              <p className="text-slate-600">{r.veiculo}</p>
              <p className="text-slate-600">{r.associado}</p>
              <p className="text-xs text-slate-400">{r.associado_documento}</p>
              <div className="pt-2 text-xs text-slate-500">
                <p>Instalado em {r.data_instalacao ? formatDate(r.data_instalacao) : '—'}</p>
                {r.local_instalacao && <p>Local: {r.local_instalacao}</p>}
                {r.instalador && <p>Instalador: {r.instalador}</p>}
              </div>
              <Link href={`/veiculos?editar=${r.veiculo_id}`} className="inline-flex items-center gap-1 text-sm text-cyan-700 hover:underline">
                Abrir a ficha do veiculo <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Equipamento sem veiculo. {r.status === 'DISPONIVEL' ? 'Pronto para instalar.' : ''}
            </p>
          )}
        </section>
      </div>

      {/* Historico */}
      <section className="rounded-lg border border-slate-200 bg-superficie p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <History className="h-4 w-4 text-slate-400" /> Historico do equipamento
        </h2>
        <ol className="space-y-2">
          {(historico ?? []).map((e) => (
            <li key={e.id} className="border-l-2 border-slate-200 pl-3 text-sm">
              <p className="text-slate-700">
                <span className="font-medium">{rotuloEvento(e.tipo)}</span>
                {e.status_anterior && e.status_novo && (
                  <span className="text-slate-500"> · {rotuloStatus(e.status_anterior)} → {rotuloStatus(e.status_novo)}</span>
                )}
                {e.veiculo_novo && <span className="text-slate-500"> · {e.veiculo_novo}</span>}
                {e.veiculo_anterior && !e.veiculo_novo && <span className="text-slate-500"> · saiu de {e.veiculo_anterior}</span>}
                {e.regional_nova && <span className="text-slate-500"> · {e.regional_anterior} → {e.regional_nova}</span>}
              </p>
              {e.descricao && <p className="text-xs text-slate-500">{e.descricao}</p>}
              <p className="text-[11px] text-slate-400">
                {formatDate(e.created_at)} {e.autor ? `· ${e.autor}` : ''}
              </p>
            </li>
          ))}
          {(historico ?? []).length === 0 && <li className="text-sm text-slate-400">Sem movimentacao registrada.</li>}
        </ol>
      </section>

      {acao && <ModalAcao acao={acao} ficha={r} onClose={() => setAcao(null)} />}
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div>
      <p className="text-[11px] uppercase text-slate-400">{rotulo}</p>
      <p className="text-sm font-medium text-slate-700">{valor || '—'}</p>
    </div>
  );
}

function rotuloEvento(tipo: string) {
  return ({
    CADASTRO: 'Cadastrado', STATUS: 'Status alterado', INSTALACAO: 'Instalado',
    DESINSTALACAO: 'Desinstalado', TRANSFERENCIA_FILIAL: 'Transferido de unidade',
    TROCA_PLATAFORMA: 'Troca de plataforma', MANUTENCAO: 'Manutencao',
    IMPORTACAO: 'Importado', OBSERVACAO: 'Observacao',
  } as Record<string, string>)[tipo] ?? tipo;
}

// --- acoes -----------------------------------------------------------------
function ModalAcao({ acao, ficha, onClose }: {
  acao: Exclude<Acao, null>;
  ficha: { id: string; status: StatusRastreador; regional_id: string | null; manutencao_aberta_id: string | null };
  onClose: () => void;
}) {
  const { data: veiculos } = useVeiculos();
  const { data: regionais } = useRegionais();
  const instalar = useInstalarRastreador();
  const desinstalar = useDesinstalarRastreador();
  const mover = useMoverStatusRastreador();
  const transferir = useTransferirRastreador();
  const abrirManut = useAbrirManutencao();
  const concluirManut = useConcluirManutencao();

  const [veiculoId, setVeiculoId] = useState('');
  const [local, setLocal] = useState('');
  const [instalador, setInstalador] = useState('');
  const [status, setStatus] = useState<StatusRastreador | ''>('');
  const [regionalId, setRegionalId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [defeito, setDefeito] = useState('');
  const [solucao, setSolucao] = useState('');
  const [custo, setCusto] = useState<number | null>(null);
  const [semReparo, setSemReparo] = useState(false);

  const opcoesStatus = useMemo(() => statusEscolhiveis(ficha.status), [ficha.status]);
  const pendente = instalar.isPending || desinstalar.isPending || mover.isPending
    || transferir.isPending || abrirManut.isPending || concluirManut.isPending;

  const erro = (e: Error) => toast.error(e.message);
  const feito = (msg: string) => { toast.success(msg); onClose(); };

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (acao === 'instalar') {
      if (!veiculoId) return toast.error('Selecione o veiculo');
      return instalar.mutate(
        { p_rastreador_id: ficha.id, p_veiculo_id: veiculoId, p_local: local || null, p_instalador: instalador || null },
        { onSuccess: () => feito('Equipamento instalado'), onError: erro },
      );
    }
    if (acao === 'desinstalar') {
      return desinstalar.mutate(
        { p_rastreador_id: ficha.id, p_status_novo: status || 'DISPONIVEL', p_motivo: motivo || null },
        { onSuccess: () => feito('Equipamento retirado do veiculo'), onError: erro },
      );
    }
    if (acao === 'status') {
      if (!status) return toast.error('Escolha o novo status');
      if (exigeMotivo(status) && !motivo.trim()) return toast.error('Este status exige um motivo');
      return mover.mutate(
        { p_rastreador_id: ficha.id, p_status: status, p_motivo: motivo || null },
        { onSuccess: () => feito('Status atualizado'), onError: erro },
      );
    }
    if (acao === 'transferir') {
      if (!regionalId) return toast.error('Escolha a unidade de destino');
      return transferir.mutate(
        { p_rastreador_id: ficha.id, p_regional_id: regionalId, p_motivo: motivo || null },
        { onSuccess: () => feito('Equipamento transferido'), onError: erro },
      );
    }
    if (acao === 'manutencao') {
      if (!defeito.trim()) return toast.error('Descreva o defeito');
      return abrirManut.mutate(
        { p_rastreador_id: ficha.id, p_defeito: defeito },
        { onSuccess: () => feito('Manutencao aberta'), onError: erro },
      );
    }
    if (acao === 'concluir') {
      if (!ficha.manutencao_aberta_id) return toast.error('Nao ha manutencao aberta');
      if (!solucao.trim()) return toast.error('Descreva o que foi feito');
      return concluirManut.mutate(
        { p_manutencao_id: ficha.manutencao_aberta_id, p_solucao: solucao, p_custo: custo, p_sem_reparo: semReparo },
        { onSuccess: () => feito('Manutencao concluida'), onError: erro },
      );
    }
  }

  const titulos: Record<Exclude<Acao, null>, string> = {
    instalar: 'Instalar em veiculo', desinstalar: 'Desinstalar equipamento',
    status: 'Mudar status', transferir: 'Transferir de unidade',
    manutencao: 'Abrir manutencao', concluir: 'Concluir manutencao',
  };

  return (
    <Modal open onClose={onClose} title={titulos[acao]} tamanho="lg">
      <form onSubmit={enviar} className="space-y-3">
        {acao === 'instalar' && (
          <>
            <FormField label="Veiculo *">
              <Select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                <option value="">-- Selecione o veiculo --</option>
                {(veiculos ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} — {[v.marca, v.modelo].filter(Boolean).join(' ')} ({v.clientes?.nome_razao_social ?? ''})
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Local no veiculo">
                <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: sob o painel" />
              </FormField>
              <FormField label="Instalador">
                <Input value={instalador} onChange={(e) => setInstalador(e.target.value)} />
              </FormField>
            </div>
            <p className="text-xs text-slate-400">
              Ao instalar, a ficha do veiculo passa a mostrar este IMEI, o chip e a rastreadora.
            </p>
          </>
        )}

        {acao === 'desinstalar' && (
          <>
            <FormField label="Para onde vai o equipamento">
              <Select value={status} onChange={(e) => setStatus(e.target.value as StatusRastreador)}>
                <option value="DISPONIVEL">1 - Disponivel (volta ao estoque)</option>
                <option value="MANUTENCAO">9 - Manutencao</option>
                <option value="BAIXADO">11 - Baixado</option>
              </Select>
            </FormField>
            <FormField label={status === 'BAIXADO' ? 'Motivo *' : 'Motivo'}>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </FormField>
          </>
        )}

        {acao === 'status' && (
          <>
            <FormField label="Novo status *">
              <Select value={status} onChange={(e) => setStatus(e.target.value as StatusRastreador)}>
                <option value="">-- Selecione --</option>
                {opcoesStatus.map((s) => <option key={s} value={s}>{rotuloStatus(s)}</option>)}
              </Select>
            </FormField>
            <FormField label={status && exigeMotivo(status) ? 'Motivo *' : 'Motivo'}>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </FormField>
            <p className="text-xs text-slate-400">
              A lista mostra so as transicoes que o banco aceita a partir de {rotuloStatus(ficha.status)}.
            </p>
          </>
        )}

        {acao === 'transferir' && (
          <>
            <FormField label="Unidade de destino *">
              <Select value={regionalId} onChange={(e) => setRegionalId(e.target.value)}>
                <option value="">-- Selecione --</option>
                {(regionais ?? []).filter((r) => r.id !== ficha.regional_id).map((r) => (
                  <option key={r.id} value={r.id}>{r.nome}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Motivo">
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </FormField>
          </>
        )}

        {acao === 'manutencao' && (
          <FormField label="Defeito *">
            <Textarea rows={3} value={defeito} onChange={(e) => setDefeito(e.target.value)}
              placeholder="Ex.: nao comunica ha 15 dias" />
          </FormField>
        )}

        {acao === 'concluir' && (
          <>
            <FormField label="O que foi feito *">
              <Textarea rows={3} value={solucao} onChange={(e) => setSolucao(e.target.value)} />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Custo do reparo">
                <MoneyInput value={custo} onChange={setCusto} />
              </FormField>
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input type="checkbox" checked={semReparo} onChange={(e) => setSemReparo(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300" />
                Sem reparo — dar baixa no equipamento
              </label>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirmar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
