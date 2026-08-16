'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Bell, CheckCircle2, Loader2, Plus, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import {
  useAlertasVeiculo, useAbrirAlertaVeiculo, useResolverAlertaVeiculo, useTiposAlerta,
} from '@/hooks/use-veiculo-ficha';
import { formatDate } from '@/lib/utils';
import type { AlertaVeiculo, SeveridadeAlerta } from '@/lib/database.types';

const COR_SEVERIDADE: Record<SeveridadeAlerta, string> = {
  ALTA: 'bg-rose-100 text-rose-800',
  MEDIA: 'bg-amber-100 text-amber-900',
  BAIXA: 'bg-slate-200 text-slate-700',
};

/**
 * Alertas/pendencias do veiculo — MESMA fonte do contador do card do SAC
 * (`alertas_veiculo`, que le as linhas do veiculo e nao o catalogo). Usado na
 * ficha do SAC e no formulario de edicao do veiculo, para que o atendente veja
 * e RESOLVA a pendencia no lugar onde ela aparece.
 */
export function AlertasVeiculo({ veiculoId, titulo = 'Alertas / pendencias' }: {
  veiculoId: string;
  titulo?: string;
}) {
  const [historico, setHistorico] = useState(false);
  const { data: alertas, isLoading } = useAlertasVeiculo(veiculoId, historico);
  const { data: tipos } = useTiposAlerta();
  const abrir = useAbrirAlertaVeiculo();
  const resolver = useResolverAlertaVeiculo();
  const [novo, setNovo] = useState(false);
  const [tipoId, setTipoId] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [resolvendo, setResolvendo] = useState<AlertaVeiculo | null>(null);
  const [observacao, setObservacao] = useState('');

  const ativos = (alertas ?? []).filter((a) => a.ativo);
  const resolvidos = (alertas ?? []).filter((a) => !a.ativo);

  function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!tipoId) { toast.error('Selecione o tipo de alerta'); return; }
    abrir.mutate({ veiculo_id: veiculoId, tipo_alerta_id: tipoId, mensagem: mensagem.trim() || null }, {
      onSuccess: () => { toast.success('Alerta registrado'); setNovo(false); setTipoId(''); setMensagem(''); },
      onError: (e2) => toast.error(e2.message),
    });
  }

  function confirmarResolucao(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvendo) return;
    resolver.mutate({ alerta_id: resolvendo.id, veiculo_id: veiculoId, observacao: observacao.trim() || null }, {
      onSuccess: () => { toast.success('Pendencia resolvida'); setResolvendo(null); setObservacao(''); },
      onError: (e2) => toast.error(e2.message),
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Bell className="h-4 w-4 text-amber-500" /> {titulo}
          {ativos.length > 0 && (
            <span className="tnum rounded-full bg-amber-100 px-2 text-[11px] font-bold text-amber-900">{ativos.length}</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setHistorico((h) => !h)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
            <History className="h-3.5 w-3.5" /> {historico ? 'Ocultar resolvidos' : 'Ver resolvidos'}
          </button>
          <Button type="button" variant="secondary" onClick={() => setNovo(true)} className="!px-2.5 !py-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="py-2 text-xs text-slate-400"><Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Carregando alertas...</p>
      ) : ativos.length === 0 ? (
        <p className="py-1 text-xs text-slate-400">Nenhuma pendencia ativa neste veiculo.</p>
      ) : (
        <ul className="space-y-2">
          {ativos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-amber-50/60 p-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${COR_SEVERIDADE[a.severidade]}`}>{a.severidade}</span>
                  {a.nome}
                  {!a.tipo_ativo && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600" title="Tipo desativado no catalogo de alertas">
                      tipo desativado
                    </span>
                  )}
                </p>
                {a.mensagem && <p className="text-xs text-slate-600">{a.mensagem}</p>}
                <p className="text-[11px] text-slate-400">
                  Aberto em {formatDate(a.created_at)}{a.criado_por ? ` por ${a.criado_por}` : ''}
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setResolvendo(a)} className="!px-2.5 !py-1 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
              </Button>
            </li>
          ))}
        </ul>
      )}

      {historico && resolvidos.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2">
          {resolvidos.map((a) => (
            <li key={a.id} className="text-xs text-slate-500">
              <span className="font-medium text-slate-600">{a.nome}</span> — resolvido em {formatDate(a.resolvido_em ?? '')}
              {a.resolvido_por_nome ? ` por ${a.resolvido_por_nome}` : ''}
              {a.resolucao_observacao ? ` · ${a.resolucao_observacao}` : ''}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Alertas ativos aparecem no card do SAC ao localizar o associado.
      </p>

      {novo && (
        <Modal open onClose={() => setNovo(false)} title="Adicionar alerta ao veiculo">
          <form onSubmit={adicionar} className="space-y-3">
            <FormField label="Tipo de alerta">
              <Select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                <option value="">-- Selecione --</option>
                {(tipos ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.severidade})</option>)}
              </Select>
            </FormField>
            <FormField label="Observacao (opcional)">
              <Input value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Detalhe a pendencia" />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setNovo(false)}>Cancelar</Button>
              <Button type="submit" disabled={abrir.isPending}>
                {abrir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {resolvendo && (
        <Modal open onClose={() => setResolvendo(null)} title={`Resolver: ${resolvendo.nome}`}>
          <form onSubmit={confirmarResolucao} className="space-y-3">
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              A pendencia sai do card do SAC e fica registrada no historico do veiculo com o seu nome.
            </p>
            <FormField label="Como foi resolvido (opcional)">
              <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: CRLV recebido e anexado ao cadastro" />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setResolvendo(null)}>Cancelar</Button>
              <Button type="submit" disabled={resolver.isPending}>
                {resolver.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Resolver
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
