'use client';

// CANCELAMENTO DO VEICULO e o boleto PRO-RATA (0144). Cancela SO o veiculo
// escolhido: os outros do associado e o cadastro dele ficam como estao.
// Decisoes do usuario: ciclo POS-PAGO; boletos futuros do veiculo BAIXADOS
// (com opcao de desmarcar); retorno previsto vira lead no CRM.
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Ban, CalendarClock, Copy, Loader2, MessageCircle, RefreshCw, TriangleAlert, Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Textarea } from '@/components/ui/field';
import { usePode } from '@/hooks/use-permissoes';
import { useTitulosCliente } from '@/hooks/use-protocolos';
import {
  useCancelamentosVeiculo, useCancelarVeiculo, useEmitirProRata, useProRataVeiculo,
  type ResultadoCancelamento,
} from '@/hooks/use-cancelamento';
import { useContatoAssociado } from '@/components/cobrancas/negociacao-boletos';
import {
  boletosFuturosDoVeiculo, cicloJaPago, somarDias, validarCancelamento,
} from '@/lib/pro-rata';
import { mensagemDoBoleto } from '@/lib/renegociacao';
import { linkWhatsAppAssociado } from '@/lib/protocolos';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { ProRataVeiculo } from '@/lib/database.types';

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export interface VeiculoParaCancelar {
  id: string;
  cliente_id: string;
  placa: string | null;
  chassi?: string | null;
  status: string;
  cobranca_externa?: boolean | null;
  data_ativacao?: string | null;
  cancelado_em?: string | null;
}

const FORA_DA_BASE = ['inativo', 'baixado', 'excluido'];

function identificacao(v: VeiculoParaCancelar) {
  return v.placa ?? `0 KM ${(v.chassi ?? '').slice(-6)}`;
}

/** A conta do pro-rata, escrita, para quem atende explicar ao associado. */
export function ContaProRata({ p }: { p: ProRataVeiculo }) {
  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-3 text-sm">
      <p className="mb-1 flex items-center gap-1.5 font-semibold text-slate-800">
        <Calculator className="h-4 w-4 text-cyan-700" /> Pró-rata dos dias usados
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div><dt className="text-slate-500">Mensalidade</dt><dd className="tnum font-medium">{formatCurrency(Number(p.valor_mensal))}</dd></div>
        <div><dt className="text-slate-500">Vencimento do veículo</dt><dd className="font-medium">dia {p.dia_vencimento}</dd></div>
        <div><dt className="text-slate-500">Ciclo (pós-pago)</dt><dd className="font-medium">{formatDate(p.ciclo_inicio)} a {formatDate(p.ciclo_fim)}</dd></div>
        <div><dt className="text-slate-500">Boleto do ciclo</dt><dd className="font-medium">vence {formatDate(p.vencimento_ciclo)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-slate-600">
        {formatCurrency(Number(p.valor_mensal))} ÷ <b className="tnum">{p.dias_ciclo}</b> dias do ciclo ×{' '}
        <b className="tnum">{p.dias_usados}</b> dia(s) usado(s) ({formatDate(p.desde)} a {formatDate(p.ate)}) ={' '}
        <b className="tnum text-base text-slate-900">{formatCurrency(Number(p.valor))}</b>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// O modal do cancelamento
// ---------------------------------------------------------------------------
export function ModalCancelamentoVeiculo({ veiculo, onClose }: { veiculo: VeiculoParaCancelar; onClose: () => void }) {
  const hoje = hojeSP();
  const pode = usePode('veiculos.cancelar');
  const cancelar = useCancelarVeiculo();
  const jaFora = FORA_DA_BASE.includes(veiculo.status);

  const [motivo, setMotivo] = useState('');
  const [data, setData] = useState(hoje);
  const [retorno, setRetorno] = useState(false);
  const [dataRetorno, setDataRetorno] = useState('');
  const [observacao, setObservacao] = useState('');
  const [cobrarEscolha, setCobrarEscolha] = useState<boolean | null>(null);
  const [vencimento, setVencimento] = useState(somarDias(hoje, 5));
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [resultado, setResultado] = useState<ResultadoCancelamento | null>(null);

  const pr = useProRataVeiculo(jaFora ? null : veiculo.id, data || null);
  const titulos = useTitulosCliente(veiculo.cliente_id, veiculo.id, 120);
  const futuros = useMemo(
    () => boletosFuturosDoVeiculo(titulos.data ?? [], veiculo.id, data || hoje),
    [titulos.data, veiculo.id, data, hoje],
  );
  const pago = !!pr.data && cicloJaPago(titulos.data ?? [], veiculo.id, {
    inicio: pr.data.ciclo_inicio, fim: pr.data.ciclo_fim, vencimento: pr.data.vencimento_ciclo, dias: pr.data.dias_ciclo,
  });
  // Padrao: cobra, salvo se o ciclo ja foi pago (cobraria os mesmos dias de novo) ou se da zero.
  const cobrar = cobrarEscolha ?? (!pago && Number(pr.data?.valor ?? 0) > 0);
  const baixar = futuros.filter((f) => f.baixavel && !desmarcados.has(f.boleto.id));

  const erro = validarCancelamento({
    motivo, data, hoje, dataAtivacao: veiculo.data_ativacao, previsaoRetorno: retorno,
    dataRetorno, cobrar, vencimento,
  });

  async function confirmar() {
    if (erro) { toast.error(erro); return; }
    try {
      const r = await cancelar.mutateAsync({
        veiculo_id: veiculo.id, data, motivo: motivo.trim(), previsao_retorno: retorno,
        data_retorno: retorno ? dataRetorno : null, observacao: observacao.trim() || null,
        cobrar, vencimento: cobrar ? vencimento : null,
        origens: baixar.map((f) => ({ origem: f.boleto.origem === 'MUTUAL' ? 'MUTUAL' : 'SCAR', id: f.boleto.id })),
      });
      setResultado(r);
      toast.success('Veículo cancelado');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (resultado) {
    return (
      <Modal open onClose={onClose} title={`Cancelamento — ${identificacao(veiculo)}`} tamanho="lg">
        <ResultadoDoCancelamento r={resultado} veiculoId={veiculo.id} clienteId={veiculo.cliente_id}
          retentar={{ cobrar, vencimento, origens: baixar.map((f) => ({ origem: f.boleto.origem === 'MUTUAL' ? 'MUTUAL' as const : 'SCAR' as const, id: f.boleto.id })) }}
          onNovo={setResultado} onClose={onClose} />
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Cancelamento de proteção veicular — ${identificacao(veiculo)}`} tamanho="xl"
      subtitulo="Cancela SÓ este veículo. Os outros veículos do associado continuam ativos.">
      {jaFora ? (
        <div className="space-y-3">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Este veículo já está fora da base ({veiculo.status}). Para voltar a protegê-lo, edite o cadastro e reative.
          </p>
          <CancelamentosRegistrados veiculoId={veiculo.id} />
        </div>
      ) : !pode ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Seu perfil não pode cancelar veículo (permissão <b>Veículos: Cancelar</b>). Peça ao administrador para liberar,
          ou registre o pedido em <b>Abrir Protocolo</b> para quem pode cancelar.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <FormField label="Motivo do cancelamento *">
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: vendeu o carro; dificuldade financeira; mudou de cidade..." />
            </FormField>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Data do pedido de cancelamento">
                <Input type="date" value={data} max={hoje} onChange={(e) => { setData(e.target.value); setCobrarEscolha(null); }} />
              </FormField>
              <FormField label="Previsão de retorno?">
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant={!retorno ? 'primary' : 'secondary'} className="px-3 py-1.5 text-sm" onClick={() => setRetorno(false)}>Não</Button>
                  <Button type="button" variant={retorno ? 'primary' : 'secondary'} className="px-3 py-1.5 text-sm" onClick={() => setRetorno(true)}>Sim</Button>
                </div>
              </FormField>
            </div>
            {retorno && (
              <FormField label="Data prevista do retorno *">
                <Input type="date" value={dataRetorno} min={somarDias(data || hoje, 1)} onChange={(e) => setDataRetorno(e.target.value)} />
                <p className="mt-1 text-xs text-slate-500">
                  Vira um lead em Vendas, com o vendedor do veículo e o retorno agendado nesta data.
                </p>
              </FormField>
            )}

            {pr.isLoading && <p className="text-sm text-slate-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Calculando o pró-rata...</p>}
            {pr.error && <p className="text-sm text-rose-600">{(pr.error as Error).message}</p>}
            {pr.data && <ContaProRata p={pr.data} />}
            {pago && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                O boleto deste ciclo (vence {formatDate(pr.data!.vencimento_ciclo)}) já foi <b>pago</b>: cobrar o pró-rata
                cobraria os mesmos dias de novo. A cobrança veio desligada.
              </p>
            )}
            {pr.data && Number(pr.data.valor) > 0 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" className="h-4 w-4" checked={cobrar} onChange={(e) => setCobrarEscolha(e.target.checked)} />
                  Gerar o boleto do pró-rata de {formatCurrency(Number(pr.data.valor))}
                </label>
                {cobrar && (
                  <div className="mt-2 max-w-xs">
                    <FormField label="Vencimento do boleto">
                      <Input type="date" value={vencimento} min={hoje} max={somarDias(hoje, 60)} onChange={(e) => setVencimento(e.target.value)} />
                    </FormField>
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-semibold text-slate-700">Boletos futuros deste veículo</p>
              <p className="mb-2 text-xs text-slate-500">
                Os que vencem depois do pedido recebem baixa no banco. Desmarque o que deve continuar valendo.
                Boletos sem veículo (fatura do associado) e de outros veículos não são tocados.
              </p>
              {titulos.isLoading && <p className="text-xs text-slate-400">Carregando...</p>}
              {!titulos.isLoading && futuros.length === 0 && (
                <p className="text-xs text-slate-400">Nenhum boleto em aberto deste veículo vence depois de {formatDate(data || hoje)}.</p>
              )}
              <ul className="space-y-1">
                {futuros.map((f) => (
                  <li key={f.boleto.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="h-4 w-4" disabled={!f.baixavel}
                        checked={f.baixavel && !desmarcados.has(f.boleto.id)}
                        onChange={() => setDesmarcados((s) => {
                          const n = new Set(s); if (n.has(f.boleto.id)) n.delete(f.boleto.id); else n.add(f.boleto.id); return n;
                        })} />
                      <span>
                        <b className="tnum">{formatCurrency(Number(f.boleto.valor))}</b>
                        <span className="text-slate-500"> · vence {formatDate(f.boleto.data_vencimento)}</span>
                        {f.boleto.origem === 'MUTUAL' && <span className="ml-1 rounded bg-brand-50 px-1.5 text-xs text-brand-600">Mutual</span>}
                      </span>
                    </label>
                    {f.motivo && <span className="text-xs text-amber-700">{f.motivo}</span>}
                  </li>
                ))}
              </ul>
            </div>

            <FormField label="Observação (opcional)">
              <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </FormField>
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-fundo p-3 text-sm">
              <p className="mb-2 font-semibold text-slate-800">O que vai acontecer</p>
              <ul className="space-y-1.5 text-xs text-slate-600">
                <li>• O veículo <b>{identificacao(veiculo)}</b> passa para <b>Inativo</b>, com o motivo no histórico.</li>
                <li>• A partir de <b>{formatDate(data || hoje)}</b>: sem Assistência 24h e sem abertura de evento para ele.</li>
                <li>• Nenhum boleto novo é gerado para este veículo; o rastreador vai para devolução.</li>
                <li>• <b>{baixar.length}</b> boleto(s) futuro(s) recebe(m) baixa no banco.</li>
                <li>• {cobrar && pr.data ? <>Boleto do pró-rata de <b>{formatCurrency(Number(pr.data.valor))}</b>, vence {formatDate(vencimento)}.</> : 'Sem boleto do pró-rata.'}</li>
                {retorno && dataRetorno && <li>• Lead de retorno em Vendas, agendado para <b>{formatDate(dataRetorno)}</b>.</li>}
                <li>• Os outros veículos do associado <b>não mudam</b>.</li>
              </ul>
            </div>
            {veiculo.cobranca_externa && (
              <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                Este veículo é cobrado pelo <b>Mutual</b>. Cancele também lá: enquanto ele estiver ativo no Mutual, o
                Mutual continua emitindo boletos dele. A rotina do SCar não o reativa.
              </p>
            )}
            {erro && <p className="text-xs text-rose-600">{erro}</p>}
            <Button variant="danger" className="w-full" disabled={!!erro || cancelar.isPending || pr.isLoading} onClick={confirmar}>
              {cancelar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Confirmar o cancelamento
            </Button>
            <CancelamentosRegistrados veiculoId={veiculo.id} />
          </aside>
        </div>
      )}
    </Modal>
  );
}

function ResultadoDoCancelamento({ r, veiculoId, clienteId, retentar, onNovo, onClose }: {
  r: ResultadoCancelamento;
  veiculoId: string;
  clienteId: string;
  retentar: { cobrar: boolean; vencimento: string; origens: { origem: 'MUTUAL' | 'SCAR'; id: string }[] };
  onNovo: (r: ResultadoCancelamento) => void;
  onClose: () => void;
}) {
  const cancelar = useCancelarVeiculo();
  const contato = useContatoAssociado(clienteId);
  const c = r.cobranca;
  const titulo = c && c.ok ? c.titulo : null;
  const msg = titulo ? mensagemDoBoleto({
    nome: contato.data?.nome_razao_social ?? '', substitui: false,
    boletos: [{ parcela: 1, vencimento: titulo.data_vencimento, valor: Number(titulo.valor),
      linha_digitavel: titulo.linha_digitavel, pix_copia_cola: titulo.pix_copia_cola }],
  }) : null;

  async function tentarDeNovo() {
    try {
      const novo = await cancelar.mutateAsync({ acao: 'cobrar', cancelamento_id: r.cancelamento_id, ...retentar });
      onNovo(novo);
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
        Veículo cancelado. Assistência 24h e eventos bloqueados a partir da data do pedido.
      </p>
      {c && c.ok && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          {titulo ? (
            <>
              <p className="font-semibold text-slate-800">Boleto do pró-rata: {formatCurrency(Number(titulo.valor))} · vence {formatDate(titulo.data_vencimento)}</p>
              <div className="flex flex-wrap gap-2">
                {titulo.linha_digitavel && (
                  <Button variant="secondary" className="px-2 py-1 text-xs"
                    onClick={() => { navigator.clipboard?.writeText(titulo.linha_digitavel ?? ''); toast.success('Linha copiada'); }}>
                    <Copy className="h-3.5 w-3.5" /> Linha digitável
                  </Button>
                )}
                <a href={`/api/v1/cobrancas/boleto?titulo_id=${titulo.id}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">PDF (Sicredi)</a>
                {msg && linkWhatsAppAssociado(contato.data?.celular ?? contato.data?.telefone, msg) && (
                  <a href={linkWhatsAppAssociado(contato.data?.celular ?? contato.data?.telefone, msg)!} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                    <MessageCircle className="h-3.5 w-3.5" /> Enviar no WhatsApp
                  </a>
                )}
              </div>
            </>
          ) : <p className="text-slate-600">Sem boleto do pró-rata.</p>}
          {c.erros_baixa > 0
            ? <p className="text-xs text-amber-700">{c.erros_baixa} baixa(s) recusada(s) pelo banco — tente de novo no Histórico Financeiro (Boletos negociados).</p>
            : <p className="text-xs text-slate-500">Boletos futuros escolhidos: baixa registrada.</p>}
        </div>
      )}
      {c && !c.ok && (
        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
          <p className="text-rose-700">A cobrança não saiu: {c.erro}</p>
          <p className="text-xs text-slate-600">O cancelamento está gravado. Os boletos futuros não foram baixados.</p>
          <Button variant="secondary" disabled={cancelar.isPending} onClick={tentarDeNovo}>
            <RefreshCw className="h-4 w-4" /> Tentar a cobrança de novo
          </Button>
        </div>
      )}
      <CancelamentosRegistrados veiculoId={veiculoId} />
      <div className="flex justify-end"><Button onClick={onClose}>Fechar</Button></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A trilha do cancelamento (SAC e ficha do veiculo)
// ---------------------------------------------------------------------------
export function CancelamentosRegistrados({ veiculoId }: { veiculoId: string }) {
  const { data } = useCancelamentosVeiculo(veiculoId);
  if (!data?.length) return null;
  return (
    <div className="space-y-2">
      {data.map((k) => (
        <div key={k.id} className={`rounded-xl border p-3 text-xs ${k.reativado_em ? 'border-slate-200 text-slate-500' : 'border-rose-200 bg-rose-50/40 text-slate-700'}`}>
          <p className="text-sm font-semibold text-slate-800">
            Cancelado em {formatDate(k.data_cancelamento)}
            {k.reativado_em && <span className="ml-2 font-normal text-emerald-700">· reativado em {formatDate(k.reativado_em)}</span>}
          </p>
          <p><b>Motivo:</b> {k.motivo}</p>
          {k.previsao_retorno && k.data_retorno && (
            <p className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Retorno previsto: {formatDate(k.data_retorno)} (lead em Vendas)</p>
          )}
          {k.pro_rata && (
            <p>Pró-rata: {k.pro_rata.dias_usados} de {k.pro_rata.dias_ciclo} dias = {formatCurrency(Number(k.pro_rata.valor))}
              {k.renegociacao_situacao ? ` · cobrança ${k.renegociacao_situacao === 'EMITIDA' ? 'emitida' : k.renegociacao_situacao === 'ERRO' ? 'recusada pelo banco' : 'em emissão'}` : ' · sem cobrança'}
            </p>
          )}
          {k.observacao && <p>{k.observacao}</p>}
          <p className="text-slate-400">Registrado por {k.criado_por ?? '—'} em {formatDate(k.created_at)}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boleto PRO-RATA avulso (Historico Financeiro do veiculo)
// ---------------------------------------------------------------------------
export function ModalBoletoProRata({ veiculoId, placa, onClose }: {
  veiculoId: string; placa?: string | null; onClose: () => void;
}) {
  const hoje = hojeSP();
  const [ate, setAte] = useState(hoje);
  const [desde, setDesde] = useState('');
  const [vencimento, setVencimento] = useState(somarDias(hoje, 5));
  const pr = useProRataVeiculo(veiculoId, ate || null, desde || null);
  const emitir = useEmitirProRata();

  async function gerar() {
    if (!pr.data || Number(pr.data.valor) <= 0) { toast.error('Nada a cobrar.'); return; }
    try {
      await emitir.mutateAsync({ veiculo_id: veiculoId, ate, desde: desde || null, vencimento });
      toast.success('Boleto do pró-rata emitido');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Modal open onClose={onClose} title={`Boleto pró-rata${placa ? ` — ${placa}` : ''}`} tamanho="lg"
      subtitulo="Cobra os dias de um ciclo, sempre pela data de vencimento do veículo (pós-pago).">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Do dia (vazio = início do ciclo)">
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </FormField>
          <FormField label="Até o dia">
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </FormField>
          <FormField label="Vencimento do boleto">
            <Input type="date" value={vencimento} min={hoje} max={somarDias(hoje, 60)} onChange={(e) => setVencimento(e.target.value)} />
          </FormField>
        </div>
        {pr.isLoading && <p className="text-sm text-slate-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Calculando...</p>}
        {pr.error && <p className="text-sm text-rose-600">{(pr.error as Error).message}</p>}
        {pr.data && <ContaProRata p={pr.data} />}
        <p className="text-xs text-slate-500">
          O boleto sai na hora no Sicredi e aparece no histórico. Para não cobrar o mesmo período duas vezes, confira se o
          boleto do ciclo já não foi pago.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!pr.data || Number(pr.data.valor) <= 0 || emitir.isPending} onClick={gerar}>
            {emitir.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Emitir boleto de {formatCurrency(Number(pr.data?.valor ?? 0))}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
