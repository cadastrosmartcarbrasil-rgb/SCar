'use client';

// Prazo regulatorio do evento (0113 — Art. 22, CNSP 491/2026): o selo e a barra
// (Kanban, painel, ficha), o cartao da ficha e o checklist de documentos.
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertOctagon, BellRing, CheckCircle2, Clock, FileCheck2, FileX2, ListChecks, Plus, RotateCcw, Trash2, Undo2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { usePode } from '@/hooks/use-permissoes';
import { usePerfilAtual } from '@/hooks/use-config';
import { useAnexos } from '@/hooks/use-eventos';
import {
  useAdicionarDocumentoEvento,
  useAplicarListaPadrao,
  useAtualizarDocumentoEvento,
  useDarCienciaPrazo,
  useDocumentosEvento,
  useEventoPrazo,
  useHistoricoPrazo,
  useMarcarDocumentacaoCompleta,
  useMarcosPrazo,
  useReabrirDocumentacao,
  useRemoverDocumentoEvento,
} from '@/hooks/use-prazo-eventos';
import {
  PRAZO_REGULATORIO_DIAS,
  descricaoDoNivel,
  estiloDoNivel,
  fracaoDoPrazo,
  nivelGrave,
  rotuloMarco,
  textoDoPrazo,
} from '@/lib/prazo-regulatorio';
import { hojeEmSaoPaulo } from '@/lib/baixa-banco';
import { cn, formatDate } from '@/lib/utils';
import type { EventoDocumentosRow, EventoPrazo } from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Selo e barra
// ---------------------------------------------------------------------------
export function SeloPrazo({ prazo, compacto = false }: { prazo: EventoPrazo; compacto?: boolean }) {
  const e = estiloDoNivel(prazo.nivel);
  const texto = compacto
    ? prazo.nivel === 'DOCUMENTACAO_PENDENTE'
      ? `Doc. pendente`
      : prazo.dias_transcorridos != null
        ? prazo.nivel === 'VENCIDO'
          ? `Vencido · ${prazo.dias_transcorridos}d`
          : `${prazo.dias_transcorridos}/${PRAZO_REGULATORIO_DIAS}d`
        : e.rotulo
    : e.rotulo;
  return (
    <span
      title={`${e.rotulo} — ${textoDoPrazo(prazo)}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
        e.selo,
        prazo.nivel === 'VENCIDO' && 'animate-pulse',
      )}
    >
      {prazo.nivel === 'VENCIDO' || prazo.nivel === 'CRITICO' ? (
        <AlertOctagon className="h-3 w-3" />
      ) : prazo.nivel === 'DOCUMENTACAO_PENDENTE' ? (
        <FileX2 className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {texto}
    </span>
  );
}

/** A barra dos 90 dias, com as faixas de cor ao fundo e as marcas de alerta (configuradas, 0114). */
export function BarraPrazo({ prazo, fina = false }: { prazo: EventoPrazo; fina?: boolean }) {
  const { marcos } = useMarcosPrazo();
  const e = estiloDoNivel(prazo.nivel);
  const frac = fracaoDoPrazo(prazo.dias_transcorridos);
  const MARCAS_BARRA = [marcos.aviso, marcos.atencao, marcos.urgencia, marcos.critico];
  const pct = (d: number) => `${(d / PRAZO_REGULATORIO_DIAS) * 100}%`;
  return (
    <div className="w-full">
      <div className={cn('relative w-full overflow-hidden rounded-full bg-slate-100', fina ? 'h-1.5' : 'h-3')}>
        {/* faixas: verde ate a atencao · amarelo ate a urgencia · laranja ate o critico · vermelho ate 90 */}
        <div className="absolute inset-0 flex opacity-25">
          <div className="h-full bg-emerald-400" style={{ width: pct(marcos.atencao) }} />
          <div className="h-full bg-amber-400" style={{ width: pct(marcos.urgencia - marcos.atencao) }} />
          <div className="h-full bg-orange-400" style={{ width: pct(marcos.critico - marcos.urgencia) }} />
          <div className="h-full bg-rose-500" style={{ width: pct(PRAZO_REGULATORIO_DIAS - marcos.critico) }} />
        </div>
        <div className={cn('relative h-full rounded-full transition-all', e.barra)} style={{ width: `${frac * 100}%` }} />
        {!fina &&
          MARCAS_BARRA.map((m) => (
            <span key={m} className="absolute top-0 h-full w-px bg-slate-500/50" style={{ left: pct(m) }} />
          ))}
      </div>
      {!fina && (
        <div className="relative mt-1 h-3 text-[10px] text-slate-500">
          {[...MARCAS_BARRA, 90].map((m) => (
            <span key={m} className="tnum absolute -translate-x-1/2" style={{ left: pct(m) }}>
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cartao da ficha do evento
// ---------------------------------------------------------------------------
export function CartaoPrazoEvento({ eventoId, onVerDocumentos }: { eventoId: string; onVerDocumentos?: () => void }) {
  const { data: prazo, isLoading } = useEventoPrazo(eventoId);
  const { marcos } = useMarcosPrazo();
  const podeTratar = usePode('eventos.editar');
  const { data: perfil } = usePerfilAtual();
  const global = perfil?.papel === 'admin' || perfil?.papel === 'financeiro';
  const ciencia = useDarCienciaPrazo();
  const [marcar, setMarcar] = useState(false);
  const [reabrir, setReabrir] = useState(false);

  if (isLoading || !prazo) return null;
  const e = estiloDoNivel(prazo.nivel);
  const grave = nivelGrave(prazo.nivel);
  const docCompleta = !!prazo.documentacao_completa_em;

  return (
    <Card className={cn(grave && 'border-rose-300 ring-1 ring-rose-200')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Prazo regulatório · Art. 22 (CNSP 491/2026)
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-800">{textoDoPrazo(prazo)}</p>
          </div>
          <SeloPrazo prazo={prazo} />
        </div>

        {docCompleta && <BarraPrazo prazo={prazo} />}

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Data do aviso</dt>
            <dd className="tnum text-slate-800">{formatDate(prazo.aviso_em)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Documentação</dt>
            <dd className={cn('font-medium', docCompleta ? 'text-emerald-700' : 'text-amber-700')}>
              {docCompleta ? (
                <>
                  Completa em {formatDate(prazo.documentacao_completa_em)}
                  <span className="block text-[11px] font-normal text-slate-500">
                    {prazo.documentacao_origem === 'MANUAL' ? 'marcada a mão' : 'pela entrega do último documento'}
                  </span>
                </>
              ) : (
                <>
                  Pendente
                  <span className="block text-[11px] font-normal text-slate-500">
                    {prazo.docs_pendentes} de {prazo.docs_obrigatorios} obrigatório(s) faltando
                  </span>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Dias transcorridos</dt>
            <dd className="tnum text-slate-800">
              {prazo.dias_transcorridos != null ? `${prazo.dias_transcorridos} de ${PRAZO_REGULATORIO_DIAS}` : '— (não iniciado)'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Prazo limite</dt>
            <dd className={cn('tnum font-medium', grave ? 'text-rose-700' : 'text-slate-800')}>
              {prazo.limite_prazo ? formatDate(prazo.limite_prazo) : '—'}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-slate-500">{descricaoDoNivel(prazo.nivel, marcos)}</p>

        {prazo.nivel === 'VENCIDO' && (
          <p className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs font-medium text-rose-800">
            O prazo de 90 dias venceu: a associação perdeu o direito de recusar a cobertura deste evento. Negar o evento agora
            só pela diretoria, e fica registrado como recusa fora do prazo.
          </p>
        )}
        {prazo.recusa_fora_do_prazo && (
          <p className="rounded-md border border-rose-300 bg-rose-50 p-2 text-xs font-medium text-rose-800">
            Evento negado com o prazo regulatório vencido.
          </p>
        )}
        {prazo.docs_complementares > 0 && (
          <p className="text-xs text-amber-700">
            {prazo.docs_complementares} documento(s) complementar(es) pedido(s) depois do início do prazo — o relógio NÃO para.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {prazo.alertas_sem_ciencia > 0 && (
            <Button
              variant={grave ? 'danger' : 'secondary'}
              disabled={ciencia.isPending}
              onClick={() =>
                ciencia.mutate(eventoId, {
                  onSuccess: (n) => toast.success(`Ciência registrada em ${n} alerta(s).`),
                  onError: (er) => toast.error((er as Error).message),
                })
              }
            >
              <BellRing className="h-4 w-4" /> Dar ciência do alerta de {rotuloMarco(prazo.maior_marco_sem_ciencia ?? 0)}
            </Button>
          )}
          {onVerDocumentos && (
            <Button variant="secondary" onClick={onVerDocumentos}>
              <ListChecks className="h-4 w-4" /> Documentos
            </Button>
          )}
          {!docCompleta && podeTratar && !prazo.encerrado_em && (
            <Button variant="secondary" onClick={() => setMarcar(true)}>
              <FileCheck2 className="h-4 w-4" /> Marcar documentação completa
            </Button>
          )}
          {docCompleta && global && (
            <Button variant="ghost" onClick={() => setReabrir(true)}>
              <RotateCcw className="h-4 w-4" /> Reabrir documentação
            </Button>
          )}
        </div>
      </CardContent>
      <ModalMarcarCompleta eventoId={eventoId} aviso={prazo.aviso_em} open={marcar} onClose={() => setMarcar(false)} />
      <ModalReabrir eventoId={eventoId} open={reabrir} onClose={() => setReabrir(false)} />
    </Card>
  );
}

function ModalMarcarCompleta({ eventoId, aviso, open, onClose }: { eventoId: string; aviso: string; open: boolean; onClose: () => void }) {
  const marcar = useMarcarDocumentacaoCompleta();
  const hoje = hojeEmSaoPaulo();
  const [data, setData] = useState(hoje);
  const [obs, setObs] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Documentação completa" subtitulo="A partir desta data correm os 90 dias.">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Use quando a documentação exigida foi entregue fora do checklist. Informe o dia em que a ÚLTIMA peça chegou —
          e a data que a norma conta, não a de hoje.
        </p>
        <FormField label="Entregue completa em">
          <Input type="date" value={data} min={aviso} max={hoje} onChange={(e) => setData(e.target.value)} />
        </FormField>
        <FormField label="Observação (opcional)">
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!data || marcar.isPending}
            onClick={() =>
              marcar.mutate(
                { eventoId, data, observacao: obs },
                {
                  onSuccess: () => {
                    toast.success('Documentação completa — o prazo de 90 dias começou a correr.');
                    onClose();
                  },
                  onError: (er) => toast.error((er as Error).message),
                },
              )
            }
          >
            Confirmar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ModalReabrir({ eventoId, open, onClose }: { eventoId: string; open: boolean; onClose: () => void }) {
  const reabrir = useReabrirDocumentacao();
  const [motivo, setMotivo] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Reabrir documentação" subtitulo="Desfaz o marco e para o relógio.">
      <div className="space-y-3">
        <p className="text-sm text-amber-800">
          Só reabra se o marco foi registrado por engano. Pedir documento complementar NÃO exige reabrir — o pedido entra
          no checklist e o prazo continua correndo. A reabertura fica na trilha com o seu nome.
        </p>
        <FormField label="Motivo">
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            disabled={motivo.trim().length < 5 || reabrir.isPending}
            onClick={() =>
              reabrir.mutate(
                { eventoId, motivo },
                {
                  onSuccess: () => {
                    toast.success('Documentação reaberta.');
                    setMotivo('');
                    onClose();
                  },
                  onError: (er) => toast.error((er as Error).message),
                },
              )
            }
          >
            Reabrir
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Checklist de documentos (aba da ficha)
// ---------------------------------------------------------------------------
const SELO_DOC: Record<string, string> = {
  PENDENTE: 'border-amber-200 bg-amber-50 text-amber-800',
  ENTREGUE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  DISPENSADO: 'border-slate-200 bg-slate-100 text-slate-600',
};

const ROTULO_TRILHA: Record<string, string> = {
  LISTA_PADRAO: 'Lista padrão aplicada',
  DOC_SOLICITADO: 'Documento solicitado',
  DOC_COMPLEMENTAR: 'Documento complementar solicitado',
  DOC_ENTREGUE: 'Documento entregue',
  DOC_DISPENSADO: 'Documento dispensado',
  DOC_PENDENTE: 'Documento voltou a pendente',
  DOC_REMOVIDO: 'Documento removido',
  DOCUMENTACAO_COMPLETA: 'Documentação completa — prazo iniciado',
  DOCUMENTACAO_REABERTA: 'Documentação reaberta',
  AVISO_ALTERADO: 'Data do aviso alterada',
  ALERTA: 'Alerta de prazo',
  ALERTA_CIENCIA: 'Ciência do alerta',
  REGULACAO_ENCERRADA: 'Regulação encerrada',
  REGULACAO_REABERTA: 'Regulação reaberta',
  RECUSA_FORA_DO_PRAZO: 'Recusa fora do prazo',
};

export function DocumentosEvento({ eventoId }: { eventoId: string }) {
  const { data: docs, isLoading } = useDocumentosEvento(eventoId);
  const { data: prazo } = useEventoPrazo(eventoId);
  const { data: trilha } = useHistoricoPrazo(eventoId);
  const podeTratar = usePode('eventos.editar');
  const aplicar = useAplicarListaPadrao();
  const adicionar = useAdicionarDocumentoEvento();
  const remover = useRemoverDocumentoEvento();
  const atualizar = useAtualizarDocumentoEvento();
  const [novo, setNovo] = useState('');
  const [novoObrig, setNovoObrig] = useState(true);
  const [entregar, setEntregar] = useState<EventoDocumentosRow | null>(null);
  const [dispensar, setDispensar] = useState<EventoDocumentosRow | null>(null);

  const completa = !!prazo?.documentacao_completa_em;
  const erro = (er: unknown) => toast.error((er as Error).message);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Os 90 dias começam quando o último documento <b>obrigatorio</b> e entregue (ou dispensado). A data que conta e a
          da entrega.
        </p>
        <Button
          variant="secondary"
          disabled={aplicar.isPending}
          onClick={() =>
            aplicar.mutate(eventoId, {
              onSuccess: (n) => toast.success(n > 0 ? `${n} documento(s) da lista padrão incluído(s).` : 'A lista padrão já está aplicada.'),
              onError: erro,
            })
          }
        >
          <ListChecks className="h-4 w-4" /> Aplicar lista padrão
        </Button>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-superficie">
        {isLoading && <li className="px-4 py-3 text-sm text-slate-400">Carregando...</li>}
        {(docs ?? []).map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                {d.nome}
                <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold', SELO_DOC[d.situacao])}>{d.situacao}</span>
                {d.obrigatorio ? (
                  <span className="text-[10px] font-semibold uppercase text-slate-500">obrigatorio</span>
                ) : (
                  <span className="text-[10px] uppercase text-slate-400">opcional</span>
                )}
                {d.complementar && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">complementar</span>
                )}
              </p>
              <p className="text-xs text-slate-500">
                Solicitado em {formatDate(d.solicitado_em)}
                {d.situacao === 'ENTREGUE' && d.entregue_em && ` · entregue em ${formatDate(d.entregue_em)}`}
                {d.situacao === 'DISPENSADO' && d.observacao && ` · dispensado: ${d.observacao}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {d.situacao === 'PENDENTE' && (
                <>
                  <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setEntregar(d)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Entregue
                  </Button>
                  {podeTratar && (
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setDispensar(d)}>
                      Dispensar
                    </Button>
                  )}
                  {podeTratar && (
                    <button
                      title="Remover (só pendente)"
                      onClick={() => {
                        if (confirm(`Remover "${d.nome}" do checklist?`)) remover.mutate({ eventoId, id: d.id }, { onError: erro });
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rose-400 hover:text-rose-600" />
                    </button>
                  )}
                </>
              )}
              {d.situacao !== 'PENDENTE' && podeTratar && (
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => {
                    if (!confirm(completa
                      ? 'O prazo já começou: voltar para pendente NÃO para o relógio. Continuar?'
                      : `Voltar "${d.nome}" para pendente?`)) return;
                    atualizar.mutate({ eventoId, id: d.id, situacao: 'PENDENTE' }, { onError: erro });
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Pendente
                </Button>
              )}
            </div>
          </li>
        ))}
        {!isLoading && (docs ?? []).length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-400">
            Nenhum documento no checklist. Aplique a lista padrão, inclua um documento ou marque a documentação completa
            no cartão do prazo.
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Pedir documento" className="min-w-[220px] flex-1">
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Ex.: Laudo pericial" />
        </FormField>
        <label className="mb-2 flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={novoObrig} onChange={(e) => setNovoObrig(e.target.checked)} /> Obrigatório
        </label>
        <Button
          disabled={!novo.trim() || adicionar.isPending}
          onClick={() =>
            adicionar.mutate(
              { eventoId, nome: novo.trim(), obrigatorio: novoObrig },
              {
                onSuccess: () => {
                  setNovo('');
                  toast.success(completa ? 'Pedido registrado como complementar — o prazo continua correndo.' : 'Documento incluído.');
                },
                onError: erro,
              },
            )
          }
        >
          <Plus className="h-4 w-4" /> Incluir
        </Button>
      </div>
      {completa && (
        <p className="text-xs text-amber-700">
          A documentação já está completa: o que for pedido agora entra como complementar e NÃO suspende os 90 dias.
        </p>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Trilha do prazo</h3>
        <ol className="relative space-y-3 border-l border-slate-200 pl-4">
          {(trilha ?? []).map((h) => (
            <li key={h.id} className="relative">
              <span
                className={cn(
                  'absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full',
                  h.tipo === 'ALERTA' || h.tipo === 'RECUSA_FORA_DO_PRAZO' ? 'bg-rose-500' : 'bg-brand-500',
                )}
              />
              <p className="text-sm font-medium text-slate-800">{ROTULO_TRILHA[h.tipo] ?? h.tipo}</p>
              {h.detalhe && <p className="text-xs text-slate-600">{h.detalhe}</p>}
              <p className="text-[11px] text-slate-400">
                {new Date(h.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                {h.usuarios?.nome ? ` · ${h.usuarios.nome}` : ''}
              </p>
            </li>
          ))}
          {(trilha ?? []).length === 0 && <li className="text-sm text-slate-400">Sem registros.</li>}
        </ol>
      </div>

      <ModalEntrega eventoId={eventoId} doc={entregar} onClose={() => setEntregar(null)} />
      <ModalDispensa eventoId={eventoId} doc={dispensar} onClose={() => setDispensar(null)} />
    </div>
  );
}

function ModalEntrega({ eventoId, doc, onClose }: { eventoId: string; doc: EventoDocumentosRow | null; onClose: () => void }) {
  const atualizar = useAtualizarDocumentoEvento();
  const { data: anexos } = useAnexos(eventoId);
  const hoje = hojeEmSaoPaulo();
  const [data, setData] = useState(hoje);
  const [anexo, setAnexo] = useState('');
  return (
    <Modal open={!!doc} onClose={onClose} title="Registrar entrega" subtitulo={doc?.nome}>
      <div className="space-y-3">
        <FormField label="Entregue em">
          <Input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
        </FormField>
        <FormField label="Arquivo nos anexos (opcional)">
          <Select value={anexo} onChange={(e) => setAnexo(e.target.value)}>
            <option value="">— sem vínculo —</option>
            {(anexos ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.tipo_documento} · {a.nome_original ?? 'arquivo'} ({formatDate(a.created_at)})
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!data || atualizar.isPending}
            onClick={() =>
              doc &&
              atualizar.mutate(
                { eventoId, id: doc.id, situacao: 'ENTREGUE', entregueEm: data, anexoId: anexo || null },
                {
                  onSuccess: () => {
                    toast.success('Entrega registrada.');
                    setAnexo('');
                    onClose();
                  },
                  onError: (er) => toast.error((er as Error).message),
                },
              )
            }
          >
            Confirmar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ModalDispensa({ eventoId, doc, onClose }: { eventoId: string; doc: EventoDocumentosRow | null; onClose: () => void }) {
  const atualizar = useAtualizarDocumentoEvento();
  const [motivo, setMotivo] = useState('');
  return (
    <Modal open={!!doc} onClose={onClose} title="Dispensar documento" subtitulo={doc?.nome}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Dispensar conta como entregue para o prazo: se era o último obrigatório, os 90 dias começam hoje.
        </p>
        <FormField label="Motivo">
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={motivo.trim().length < 3 || atualizar.isPending}
            onClick={() =>
              doc &&
              atualizar.mutate(
                { eventoId, id: doc.id, situacao: 'DISPENSADO', observacao: motivo.trim() },
                {
                  onSuccess: () => {
                    toast.success('Documento dispensado.');
                    setMotivo('');
                    onClose();
                  },
                  onError: (er) => toast.error((er as Error).message),
                },
              )
            }
          >
            Dispensar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

