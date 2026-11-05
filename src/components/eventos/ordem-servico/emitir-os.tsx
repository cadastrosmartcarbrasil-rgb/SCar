'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Eye, FileSignature, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { SeletorFornecedor } from '@/components/fornecedores/seletor-fornecedor';
import { AvisoCamposVazios } from '@/components/termos/previa-termo';
import { useEvento } from '@/hooks/use-eventos';
import {
  useDataLimiteSugerida, useEmitirOS, useModeloOS, useOrdensServicoEvento, usePreviaOS,
  type DadosEmissaoOS, type OrdemServicoLista,
} from '@/hooks/use-ordens-servico';
import {
  ROTULO_TIPO_ITEM, problemasDaOS, subtotalItem, totaisDaOS, type ItemOS, type TipoItemOS,
} from '@/lib/ordem-servico';
import { formatCurrency } from '@/lib/utils';
import type { OrdemServicoRow } from '@/lib/database.types';
import { EnvioOS } from './envio-os';

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export type OrigemOS = {
  eventoId: string;
  cotacaoId?: string | null;
  terceiroId?: string | null;
  fornecedorId?: string | null;
  fornecedorNome?: string | null;
  itens: ItemOS[];
  /** Retificar uma OS ja emitida (nasce com os dados dela). */
  anterior?: OrdemServicoLista | null;
};

/**
 * Emissao da ORDEM DE SERVICO (0181): a formalizacao do reparo aprovado,
 * pelo modelo publicado em Configuracoes -> Termos. Contas a pagar NAO e
 * gerado aqui (segue pela cotacao, 0132).
 */
export function EmitirOrdemServicoModal({ origem, onClose, onEmitida }: {
  origem: OrigemOS; onClose: () => void; onEmitida?: (os: OrdemServicoRow) => void;
}) {
  const { data: evento } = useEvento(origem.eventoId);
  const modelo = useModeloOS();
  const anteriores = useOrdensServicoEvento(origem.eventoId);
  const previa = usePreviaOS();
  const emitir = useEmitirOS();
  const ant = origem.anterior ?? null;

  const [fornecedorId, setFornecedorId] = useState<string>(ant?.fornecedor_id ?? origem.fornecedorId ?? '');
  const [documento, setDocumento] = useState<'AUTORIZACAO' | 'RETIFICACAO'>(ant ? 'RETIFICACAO' : 'AUTORIZACAO');
  const [osAnteriorId, setOsAnteriorId] = useState<string>(ant?.id ?? '');
  const [itens, setItens] = useState<ItemOS[]>(
    ant?.ordens_servico_itens?.length
      ? [...ant.ordens_servico_itens].sort((a, b) => a.ordem - b.ordem).map((i) => ({
        tipo: i.tipo, descricao: i.descricao, codigo: i.codigo, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario),
      }))
      : origem.itens.length ? origem.itens : [{ tipo: 'MAO_DE_OBRA', descricao: '', quantidade: 1, valor_unitario: 0 }],
  );
  const [participacao, setParticipacao] = useState<number | null>(ant ? Number(ant.participacao_associado) : null);
  const [pecasSmartcar, setPecasSmartcar] = useState<number | null>(ant ? Number(ant.pecas_smartcar) : 0);
  const [inicio, setInicio] = useState<string>(ant?.data_inicio_prevista ?? hojeSP());
  const [prazo, setPrazo] = useState<number | null>(ant?.prazo_dias_uteis ?? 10);
  const [limite, setLimite] = useState<string>(ant?.data_limite_entrega ?? '');
  const [limiteManual, setLimiteManual] = useState<boolean>(!!ant);
  const [local, setLocal] = useState(ant?.local_entrega ?? '');
  const [garantia, setGarantia] = useState<number | null>(ant?.garantia_dias ?? 90);
  const [pagamento, setPagamento] = useState(ant?.pagamento_previsto ?? '');
  const [obs, setObs] = useState(ant?.observacoes ?? '');
  const [verPrevia, setVerPrevia] = useState(false);
  const [emitida, setEmitida] = useState<OrdemServicoRow | null>(null);

  // participacao: a do evento quando nao foi digitada
  useEffect(() => {
    if (participacao == null && evento && (evento as { valor_participacao?: number | null }).valor_participacao != null) {
      setParticipacao(Number((evento as { valor_participacao?: number | null }).valor_participacao));
    }
  }, [evento, participacao]);

  const sugerida = useDataLimiteSugerida(inicio || null, prazo);
  useEffect(() => {
    if (!limiteManual && sugerida.data) setLimite(sugerida.data);
  }, [sugerida.data, limiteManual]);

  const totais = useMemo(() => totaisDaOS(itens, participacao ?? 0, pecasSmartcar ?? 0), [itens, participacao, pecasSmartcar]);
  const problemas = problemasDaOS({
    fornecedorId, itens, inicio, dataLimite: limite || null, documento, osAnteriorId: osAnteriorId || null, totais,
  });

  const dados: DadosEmissaoOS = {
    evento_id: origem.eventoId,
    cotacao_id: origem.cotacaoId ?? ant?.cotacao_id ?? null,
    evento_terceiro_id: origem.terceiroId ?? ant?.evento_terceiro_id ?? null,
    fornecedor_id: fornecedorId,
    documento,
    os_anterior_id: documento === 'RETIFICACAO' ? osAnteriorId || null : null,
    itens,
    participacao_associado: participacao ?? 0,
    pecas_smartcar: pecasSmartcar ?? 0,
    data_inicio_prevista: inicio || null,
    prazo_dias_uteis: prazo,
    data_limite_entrega: limite || null,
    local_entrega: local || null,
    garantia_dias: garantia,
    pagamento_previsto: pagamento || null,
    observacoes: obs || null,
  };

  const set = (n: number, patch: Partial<ItemOS>) => setItens((l) => l.map((i, k) => (k === n ? { ...i, ...patch } : i)));
  const retificaveis = (anteriores.data ?? []).filter((o) => !['CANCELADA', 'SUBSTITUIDA'].includes(o.status));

  async function abrirPrevia() {
    setVerPrevia(true);
    try { await previa.mutateAsync(dados); } catch (e) { toast.error((e as Error).message); }
  }

  async function confirmar() {
    if (problemas.length) return toast.error(problemas[0]);
    try {
      const r = await emitir.mutateAsync(dados);
      toast.success(`Ordem de Serviço ${r.os.numero} emitida e registrada no histórico do evento.`);
      if (r.aviso) toast.warning(r.aviso, { duration: 12000 });
      setEmitida(r.os);
      onEmitida?.(r.os);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (emitida) {
    return (
      <Modal open onClose={onClose} title={`Ordem de Serviço ${emitida.numero}`} subtitulo="Emitida" tamanho="lg">
        <div className="space-y-4">
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            Emitida, salva no histórico e nos anexos do evento. Agora envie ao prestador.
          </p>
          <EnvioOS osId={emitida.id} eventoId={emitida.evento_id} />
          <div className="flex justify-end border-t border-slate-200 pt-3">
            <Button variant="secondary" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} tamanho="xl"
      title={documento === 'RETIFICACAO' ? 'Retificar Ordem de Serviço' : 'Gerar Ordem de Serviço'}
      subtitulo={`${(evento as { numero_protocolo?: string } | undefined)?.numero_protocolo ?? 'Evento'} · formalização do reparo aprovado`}>
      <div className="space-y-5">
        {modelo.data === null || (modelo.data && !modelo.data.publicado) ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Não há modelo de Ordem de Serviço publicado. Em{' '}
              <Link href="/configuracoes/termos" className="underline">Configurações → Termos</Link>, importe o Word do
              modelo (tipo &quot;Ordem de Serviço&quot;) e publique a versão.
            </span>
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2">
          <FormField label="Prestador (fornecedor)">
            <SeletorFornecedor value={fornecedorId} nomeSugerido={origem.fornecedorNome ?? undefined}
              onChange={(id) => setFornecedorId(id)} placeholder="Busque o prestador cadastrado" />
          </FormField>
          <FormField label="Documento">
            <Select value={documento} onChange={(e) => setDocumento(e.target.value as 'AUTORIZACAO' | 'RETIFICACAO')}>
              <option value="AUTORIZACAO">Autorização</option>
              <option value="RETIFICACAO" disabled={!retificaveis.length && !ant}>Retificação de uma OS anterior</option>
            </Select>
          </FormField>
          {documento === 'RETIFICACAO' && (
            <FormField label="OS que está sendo retificada" className="sm:col-span-2">
              <Select value={osAnteriorId} onChange={(e) => setOsAnteriorId(e.target.value)}>
                <option value="">— escolha —</option>
                {retificaveis.map((o) => (
                  <option key={o.id} value={o.id}>{o.numero} · {formatCurrency(o.total_autorizado)} · {o.fornecedores?.nome_fantasia || o.fornecedores?.razao_social}</option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">A anterior passa a &quot;substituída&quot; quando esta for emitida.</p>
            </FormField>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Serviços e peças</h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-superficie-alta text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">Tipo</th><th className="px-2">Descrição</th><th className="px-2">Código</th>
                  <th className="px-2 text-right">Qtd.</th><th className="px-2 text-right">Unitário</th>
                  <th className="px-2 text-right">Subtotal</th><th />
                </tr>
              </thead>
              <tbody>
                {itens.map((i, n) => (
                  <tr key={n} className="border-t border-slate-100">
                    <td className="px-2 py-1">
                      <select value={i.tipo} onChange={(e) => set(n, { tipo: e.target.value as TipoItemOS })}
                        className="rounded border border-slate-300 bg-superficie px-1 py-1 text-xs">
                        {(['MAO_DE_OBRA', 'PECA'] as TipoItemOS[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO_ITEM[t]}</option>)}
                      </select>
                    </td>
                    <td className="px-2"><Input value={i.descricao} onChange={(e) => set(n, { descricao: e.target.value })} className="py-1 text-xs" /></td>
                    <td className="w-28 px-2"><Input value={i.codigo ?? ''} onChange={(e) => set(n, { codigo: e.target.value })} className="py-1 text-xs" /></td>
                    <td className="w-20 px-2">
                      <input type="number" min={0.01} step="0.01" value={i.quantidade}
                        onChange={(e) => set(n, { quantidade: Number(e.target.value) })}
                        className="w-full rounded border border-slate-300 bg-superficie px-2 py-1 text-right text-xs" aria-label="Quantidade" />
                    </td>
                    <td className="w-32 px-2"><MoneyInput value={i.valor_unitario} onChange={(v) => set(n, { valor_unitario: v ?? 0 })} className="py-1 text-xs" /></td>
                    <td className="tnum px-2 text-right">{formatCurrency(subtotalItem(i))}</td>
                    <td className="px-1">
                      <button type="button" onClick={() => setItens((l) => l.filter((_x, k) => k !== n))} aria-label="Remover item">
                        <Trash2 className="h-3.5 w-3.5 text-rose-400 hover:text-rose-600" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setItens((l) => [...l, { tipo: 'PECA', descricao: '', quantidade: 1, valor_unitario: 0 }])}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            <Plus className="h-3.5 w-3.5" /> Incluir item
          </button>
          {origem.cotacaoId && !ant && (
            <p className="mt-1 text-xs text-slate-500">Itens trazidos da cotação aprovada. Ajustar aqui não muda a cotação.</p>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <h3 className="text-sm font-semibold text-slate-700 sm:col-span-2">Prazo combinado de entrega</h3>
            <FormField label="Início previsto"><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></FormField>
            <FormField label="Prazo (dias úteis)">
              <input type="number" min={0} max={365} value={prazo ?? ''}
                onChange={(e) => { setPrazo(e.target.value === '' ? null : Number(e.target.value)); setLimiteManual(false); }}
                className="w-full rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm" />
            </FormField>
            <FormField label="Data limite de entrega">
              <Input type="date" value={limite} onChange={(e) => { setLimite(e.target.value); setLimiteManual(true); }} />
              <p className="mt-1 text-[0.6875rem] text-slate-500">
                {limiteManual ? 'Ajustada à mão.' : 'Sugerida: início + dias úteis (sem fins de semana e feriados).'}
              </p>
            </FormField>
            <FormField label="Garantia (dias)">
              <input type="number" min={0} value={garantia ?? ''} onChange={(e) => setGarantia(e.target.value === '' ? null : Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm" />
            </FormField>
            <FormField label="Local de entrega / retirada" className="sm:col-span-2">
              <Input value={local} onChange={(e) => setLocal(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <h3 className="text-sm font-semibold text-slate-700 sm:col-span-2">Valores</h3>
            <FormField label="Participação do associado">
              <MoneyInput value={participacao} onChange={setParticipacao} />
              <p className="mt-1 text-[0.6875rem] text-slate-500">Vem do evento; ajuste se combinado diferente.</p>
            </FormField>
            <FormField label="Peças fornecidas pela Smart Car">
              <MoneyInput value={pecasSmartcar} onChange={setPecasSmartcar} />
            </FormField>
            <FormField label="Pagamento previsto"><Input type="date" value={pagamento} onChange={(e) => setPagamento(e.target.value)} /></FormField>
            <dl className="tnum space-y-0.5 rounded-lg bg-superficie-alta p-3 text-sm sm:col-span-2">
              <div className="flex justify-between"><dt>Mão de obra</dt><dd>{formatCurrency(totais.mao_obra)}</dd></div>
              <div className="flex justify-between"><dt>Peças</dt><dd>{formatCurrency(totais.pecas)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Total autorizado</dt><dd>{formatCurrency(totais.autorizado)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>− Participação do associado</dt><dd>{formatCurrency(totais.participacao)}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>− Peças da Smart Car</dt><dd>{formatCurrency(totais.pecas_smartcar)}</dd></div>
              <div className={`flex justify-between font-semibold ${totais.liquido < 0 ? 'text-rose-700' : 'text-brand-700'}`}>
                <dt>Líquido a faturar</dt><dd>{formatCurrency(totais.liquido)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <FormField label="Observações (vão na OS)">
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </FormField>

        {problemas.length > 0 && (
          <ul className="list-disc space-y-0.5 rounded-lg bg-amber-50 px-6 py-2 text-xs text-amber-800">
            {problemas.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}

        {verPrevia && (
          <div className="space-y-2">
            {previa.isPending && <div className="h-40 animate-pulse rounded-lg bg-slate-100" />}
            {previa.data && (
              <>
                <p className="text-xs text-slate-500">Modelo: {previa.data.modelo}</p>
                <AvisoCamposVazios vazios={previa.data.vazios} />
                <div className="termo-previa max-h-[55vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 text-slate-900"
                  dangerouslySetInnerHTML={{ __html: previa.data.html }} />
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3">
          <p className="mr-auto self-center text-xs text-slate-500">
            A OS formaliza o reparo; o contas a pagar continua pela cotação.
          </p>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary" onClick={abrirPrevia} disabled={previa.isPending || !fornecedorId}>
            <Eye className="h-4 w-4" /> Prévia
          </Button>
          <Button onClick={confirmar} disabled={emitir.isPending || problemas.length > 0 || !modelo.data?.publicado}>
            <FileSignature className="h-4 w-4" /> {emitir.isPending ? 'Emitindo…' : 'Emitir Ordem de Serviço'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
