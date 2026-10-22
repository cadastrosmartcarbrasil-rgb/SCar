'use client';

// A fila da revistoria do boleto vencido (0137): o que o associado ja mandou
// (analisar), o que esta com ele (link enviado), quem precisa e ainda nao tem
// pedido (a mesma lista que o robo de cobranca vai usar), e o historico.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, Receipt, Search, ShieldCheck, Video, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/field';
import {
  linkDaRevistoria, useAnalisarRevistoria, useCancelarRevistoria, useRevistoriaMidias, useRevistorias,
  useRevistoriasASolicitar, useSolicitarRevistoria,
} from '@/hooks/use-revistoria';
import { useUrlsAssinadasVendas } from '@/hooks/use-vendas';
import { usePode } from '@/hooks/use-permissoes';
import {
  formatarSegundos, mensagemRevistoria, MOTIVOS_REPROVACAO, ROTULO_SITUACAO_REVISTORIA,
} from '@/lib/revistoria';
import { linkWhatsAppAssociado } from '@/lib/protocolos';
import { identificacaoVeiculo } from '@/lib/placa';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { RevistoriaLinha, RevistoriaMidia } from '@/lib/database.types';
import { ModalBoletoAposRevistoria } from '@/components/revistoria/boleto-apos-revistoria';

type Aba = 'EM_ANALISE' | 'AGUARDANDO' | 'A_PEDIR' | 'LIBERADAS' | 'TODAS';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'EM_ANALISE', rotulo: 'Para analisar' },
  { id: 'AGUARDANDO', rotulo: 'Com o associado' },
  { id: 'A_PEDIR', rotulo: 'Precisam de revistoria' },
  { id: 'LIBERADAS', rotulo: 'Aprovadas / liberadas' },
  { id: 'TODAS', rotulo: 'Histórico' },
];

function dataHora(v: string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
}

export function FilaRevistorias() {
  const [aba, setAba] = useState<Aba>('EM_ANALISE');
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const lista = useRevistorias(null, termo);
  const aPedir = useRevistoriasASolicitar(aba === 'A_PEDIR');

  // `?id=` abre a analise direto (atalho do modal da 2a via).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setAberta(id);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const linhas = useMemo(() => {
    const todas = lista.data ?? [];
    if (aba === 'EM_ANALISE') return todas.filter((r) => r.situacao === 'EM_ANALISE');
    if (aba === 'AGUARDANDO') return todas.filter((r) => r.situacao === 'AGUARDANDO');
    if (aba === 'LIBERADAS') return todas.filter((r) => r.situacao === 'APROVADA' || r.situacao === 'DISPENSADA');
    return todas;
  }, [lista.data, aba]);

  const conta = (s: string) => (lista.data ?? []).filter((r) => r.situacao === s).length;
  const selecionada = (lista.data ?? []).find((r) => r.id === aberta) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {ABAS.map((a) => {
          const n = a.id === 'EM_ANALISE' ? conta('EM_ANALISE') : a.id === 'AGUARDANDO' ? conta('AGUARDANDO') : null;
          return (
            <button key={a.id} type="button" onClick={() => setAba(a.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                aba === a.id ? 'bg-acao text-white' : 'border border-slate-200 bg-superficie text-slate-600 hover:bg-slate-50'}`}>
              {a.rotulo}{n ? <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">{n}</span> : null}
            </button>
          );
        })}
        {aba !== 'A_PEDIR' && (
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-8" placeholder="Associado, CPF, placa ou chassi" value={busca}
              onChange={(e) => setBusca(e.target.value)} />
          </div>
        )}
      </div>

      {aba === 'A_PEDIR'
        ? <TabelaAPedir q={aPedir} />
        : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie">
            {lista.isLoading ? (
              <p className="p-6 text-sm text-slate-500">Carregando…</p>
            ) : lista.error ? (
              <p className="p-6 text-sm text-rose-700">Não consegui ler a fila: {(lista.error as Error).message}</p>
            ) : linhas.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">Nada aqui.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-superficie-alta text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Associado</th>
                    <th className="px-3 py-2">Veículo</th>
                    <th className="px-3 py-2">Atraso</th>
                    <th className="px-3 py-2">Situação</th>
                    <th className="px-3 py-2">Quando</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((r) => <LinhaFila key={r.id} r={r} onAbrir={() => setAberta(r.id)} />)}
                </tbody>
              </table>
            )}
          </div>
        )}

      {selecionada && <ModalAnalise r={selecionada} onClose={() => setAberta(null)} />}
    </div>
  );
}

function LinhaFila({ r, onAbrir }: { r: RevistoriaLinha; onAbrir: () => void }) {
  const rot = ROTULO_SITUACAO_REVISTORIA[r.situacao];
  const cancelar = useCancelarRevistoria();
  const podeCancelar = usePode('revistoria.criar');
  const [boleto, setBoleto] = useState(false);
  const viva = ['AGUARDANDO', 'EM_ANALISE', 'APROVADA', 'DISPENSADA'].includes(r.situacao);
  const quando = r.situacao === 'EM_ANALISE' ? `enviada ${dataHora(r.enviado_em)}`
    : r.situacao === 'AGUARDANDO' ? `link até ${formatDate(r.token_expira_em)}`
      : r.analisado_em ? `${dataHora(r.analisado_em)}${r.analisado_por_nome ? ` · ${r.analisado_por_nome}` : ''}` : dataHora(r.created_at);

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-3 py-2">
        <Link href={`/associados/${r.cliente_id}?aba=financeiro`} className="font-medium text-slate-800 hover:underline">{r.associado}</Link>
        <p className="text-xs text-slate-500">{r.regional ?? 'Matriz'}{r.origem === 'ROTINA' ? ' · pedido automático' : ''}</p>
      </td>
      <td className="px-3 py-2">
        <span className="font-mono font-semibold">{identificacaoVeiculo(r.placa, r.chassi)}</span>
        {r.modelo && <p className="text-xs text-slate-500">{r.modelo}</p>}
      </td>
      <td className="px-3 py-2 tnum">{r.dias_atraso != null ? `${r.dias_atraso}d` : '—'}</td>
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${rot.tom}`}>{rot.rotulo}</span>
        {r.reprovacoes > 0 && <p className="mt-0.5 text-xs text-amber-700">{r.reprovacoes} reprovação(ões)</p>}
        {r.dispensa_justificativa && <p className="mt-0.5 max-w-xs text-xs text-violet-700">{r.dispensa_justificativa}</p>}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{quando}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap justify-end gap-1.5">
          {r.situacao === 'EM_ANALISE' && <Button className="px-2.5 py-1.5 text-xs" onClick={onAbrir}>Analisar</Button>}
          {r.situacao === 'AGUARDANDO' && <BotoesLink r={r} />}
          {(r.situacao === 'APROVADA' || r.situacao === 'DISPENSADA') && !r.renegociacao_id && (
            <Button className="bg-emerald-600 px-2.5 py-1.5 text-xs hover:bg-emerald-700" onClick={() => setBoleto(true)}>
              <Receipt className="h-3.5 w-3.5" /> Gerar a 2ª via
            </Button>
          )}
          {boleto && (
            <ModalBoletoAposRevistoria clienteId={r.cliente_id} veiculoId={r.veiculo_id} onClose={() => setBoleto(false)} />
          )}
          {!viva && r.situacao !== 'CANCELADA' && (
            <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={onAbrir}>Ver</Button>
          )}
          {viva && podeCancelar && !r.renegociacao_id && (
            <Button variant="ghost" className="px-2 py-1.5 text-xs" disabled={cancelar.isPending}
              onClick={() => {
                const motivo = window.prompt('Motivo do cancelamento deste pedido de revistoria:');
                if (!motivo?.trim()) return;
                cancelar.mutate({ id: r.id, motivo }, {
                  onSuccess: () => toast.success('Pedido cancelado.'), onError: (e) => toast.error(e.message),
                });
              }}>
              Cancelar
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function BotoesLink({ r }: { r: RevistoriaLinha }) {
  const link = linkDaRevistoria(r.token);
  const texto = mensagemRevistoria({
    nome: r.associado, placa: identificacaoVeiculo(r.placa, r.chassi), link, expiraEm: r.token_expira_em,
    motivo: r.motivo_reprovacao,
  });
  const whats = linkWhatsAppAssociado(r.celular, texto);
  return (
    <>
      {whats && (
        <a href={whats} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
      )}
      <Button variant="secondary" className="px-2.5 py-1.5 text-xs"
        onClick={() => { navigator.clipboard?.writeText(texto); toast.success('Mensagem copiada'); }}>
        <Copy className="h-3.5 w-3.5" /> Copiar
      </Button>
    </>
  );
}

function TabelaAPedir({ q }: { q: ReturnType<typeof useRevistoriasASolicitar> }) {
  const solicitar = useSolicitarRevistoria();
  const podePedir = usePode('revistoria.criar');
  const [gerados, setGerados] = useState<Record<string, { token: string; expira: string }>>({});

  if (q.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (q.error) return <p className="text-sm text-rose-700">Não consegui ler: {(q.error as Error).message}</p>;
  const linhas = q.data ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Veículos na base com boleto vencido acima do limite e sem pedido de revistoria. É a lista que o robô de
        cobrança vai usar para mandar o link sozinho; até lá, gere e envie daqui.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-superficie">
        {linhas.length === 0 ? <p className="p-6 text-sm text-slate-500">Ninguém precisando agora.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-superficie-alta text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Associado</th><th className="px-3 py-2">Veículo</th>
                <th className="px-3 py-2">Atraso</th><th className="px-3 py-2">Vencido</th>
                <th className="px-3 py-2 text-right">Link</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const g = gerados[l.veiculo_id];
                const veiculo = identificacaoVeiculo(l.placa, l.chassi);
                const link = g ? linkDaRevistoria(g.token) : null;
                const texto = link ? mensagemRevistoria({ nome: l.associado, placa: veiculo, link, expiraEm: g?.expira }) : '';
                const whats = link ? linkWhatsAppAssociado(l.celular, texto) : null;
                return (
                  <tr key={l.veiculo_id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <Link href={`/associados/${l.cliente_id}?aba=financeiro`} className="font-medium text-slate-800 hover:underline">{l.associado}</Link>
                      <p className="text-xs text-slate-500">{l.regional ?? 'Matriz'}</p>
                    </td>
                    <td className="px-3 py-2"><span className="font-mono font-semibold">{veiculo}</span>
                      {l.modelo && <p className="text-xs text-slate-500">{l.modelo}</p>}</td>
                    <td className="px-3 py-2 tnum">{l.dias_atraso}d <span className="text-xs text-slate-500">desde {formatDate(l.vencimento)}</span></td>
                    <td className="px-3 py-2 tnum">{formatCurrency(Number(l.valor_vencido))}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {!g && podePedir && (
                          <Button className="px-2.5 py-1.5 text-xs" disabled={solicitar.isPending}
                            onClick={() => solicitar.mutate(l.veiculo_id, {
                              onSuccess: (r) => setGerados((m) => ({ ...m, [l.veiculo_id]: { token: r.token, expira: r.expira_em } })),
                              onError: (e) => toast.error(e.message),
                            })}>
                            Gerar link
                          </Button>
                        )}
                        {g && whats && (
                          <a href={whats} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                          </a>
                        )}
                        {g && (
                          <Button variant="secondary" className="px-2.5 py-1.5 text-xs"
                            onClick={() => { navigator.clipboard?.writeText(texto); toast.success('Mensagem copiada'); }}>
                            <Copy className="h-3.5 w-3.5" /> Copiar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A analise: o carro de hoje (rodada atual) ao lado do de antes
// ---------------------------------------------------------------------------
function ModalAnalise({ r, onClose }: { r: RevistoriaLinha; onClose: () => void }) {
  const midias = useRevistoriaMidias(r.id);
  const analisar = useAnalisarRevistoria();
  const podeAnalisar = usePode('revistoria.fechar');
  const [reprovando, setReprovando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const urls = useUrlsAssinadasVendas((midias.data ?? []).map((m) => m.url));

  const atuais = (midias.data ?? []).filter((m) => m.grupo === 'ATUAL' && m.rodada_atual);
  const reprovadas = (midias.data ?? []).filter((m) => m.grupo === 'ATUAL' && !m.rodada_atual);
  const anteriores = (midias.data ?? []).filter((m) => m.grupo === 'ANTERIOR');
  const rot = ROTULO_SITUACAO_REVISTORIA[r.situacao];

  // Aprovou -> pergunta na hora se gera o boleto (pedido do usuario, 22/10/2026).
  const [aposAprovar, setAposAprovar] = useState<'perguntar' | 'boleto' | null>(null);

  function decidir(aprovar: boolean) {
    analisar.mutate({ id: r.id, aprovar, motivo: aprovar ? (obs || null) : motivo }, {
      onSuccess: (res) => {
        if (res === 'APROVADA') {
          toast.success('Revistoria aprovada.');
          setAposAprovar('perguntar');
          return;
        }
        toast.success('Reprovada: o link reabriu com o motivo.');
        onClose();
      },
      onError: (e) => toast.error(e.message),
    });
  }

  if (aposAprovar === 'boleto') {
    return <ModalBoletoAposRevistoria clienteId={r.cliente_id} veiculoId={r.veiculo_id} onClose={onClose} />;
  }
  if (aposAprovar === 'perguntar') {
    return (
      <Modal open onClose={onClose} title="Revistoria aprovada">
        <div className="space-y-4 text-sm text-slate-600">
          <p className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              <b>{r.associado}</b> · <span className="font-mono">{identificacaoVeiculo(r.placa, r.chassi)}</span> está liberado.
              Gerar a 2ª via agora? O boleto sai no Sicredi e você já envia ao associado.
            </span>
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Depois</Button>
            <Button onClick={() => setAposAprovar('boleto')}><Receipt className="h-4 w-4" /> Sim, gerar a 2ª via</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Revistoria do veículo" tamanho="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
          <span>
            <b>{r.associado}</b> · <span className="font-mono">{identificacaoVeiculo(r.placa, r.chassi)}</span>
            {r.modelo && <> · {r.modelo}</>}
            {r.dias_atraso != null && <span className="ml-2 text-rose-700">{r.dias_atraso}d de atraso</span>}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${rot.tom}`}>{rot.rotulo}</span>
        </div>

        {midias.isLoading ? <p className="text-sm text-slate-500">Carregando fotos e vídeo…</p> : (
          <div className="grid gap-4 lg:grid-cols-2">
            <GrupoMidias titulo="Agora (enviado pelo associado)" itens={atuais} urls={urls.data ?? {}} vazio="Nada enviado nesta rodada." />
            <GrupoMidias titulo="Antes (última vistoria do veículo)" itens={anteriores} urls={urls.data ?? {}}
              vazio="Sem vistoria anterior com fotos para comparar." />
          </div>
        )}
        {reprovadas.length > 0 && (
          <details className="rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer text-slate-600">Rodada(s) reprovada(s) — {reprovadas.length} arquivo(s)</summary>
            <div className="mt-3"><GrupoMidias titulo="" itens={reprovadas} urls={urls.data ?? {}} vazio="" /></div>
          </details>
        )}
        {r.motivo_reprovacao && <p className="text-xs text-amber-800">Última reprovação: {r.motivo_reprovacao}</p>}

        {r.situacao === 'EM_ANALISE' && podeAnalisar && (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            {!reprovando ? (
              <>
                <Input placeholder="Observação da aprovação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => setReprovando(true)}><XCircle className="h-4 w-4" /> Reprovar</Button>
                  <Button onClick={() => decidir(true)} disabled={analisar.isPending}>
                    {analisar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Aprovar (libera a 2ª via)
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIVOS_REPROVACAO.map((m) => (
                    <button key={m} type="button" onClick={() => setMotivo(m)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${motivo === m ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-200 text-slate-600'}`}>
                      {m}
                    </button>
                  ))}
                </div>
                <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={2}
                  placeholder="O que o associado deve refazer (ele lê esta mensagem no link)"
                  value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setReprovando(false)}>Voltar</Button>
                  <Button variant="danger" onClick={() => decidir(false)} disabled={analisar.isPending || motivo.trim().length < 5}>
                    Reprovar e pedir para refazer
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {r.situacao === 'EM_ANALISE' && !podeAnalisar && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Aprovar ou reprovar exige a permissão &quot;Revistoria — aprovar ou reprovar&quot;.
          </p>
        )}
      </div>
    </Modal>
  );
}

function GrupoMidias({ titulo, itens, urls, vazio }: {
  titulo: string; itens: RevistoriaMidia[]; urls: Record<string, string>; vazio: string;
}) {
  return (
    <div>
      {titulo && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>}
      {itens.length === 0 ? <p className="text-sm text-slate-500">{vazio}</p> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {itens.map((m) => {
            const u = urls[m.url];
            return (
              <figure key={m.anexo_id} className={`overflow-hidden rounded-lg border border-slate-200 ${m.midia === 'VIDEO' ? 'sm:col-span-2' : ''}`}>
                {!u ? (
                  <div className="grid aspect-video place-items-center bg-slate-100 text-xs text-slate-500">carregando…</div>
                ) : m.midia === 'VIDEO' ? (
                  <video src={u} controls playsInline className="aspect-video w-full bg-black object-contain" />
                ) : (
                  <a href={u} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={m.nome} className="aspect-video w-full bg-slate-100 object-cover" />
                  </a>
                )}
                <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    {m.midia === 'VIDEO' && <Video className="h-3.5 w-3.5" />}{m.nome}
                    {m.duracao_segundos ? ` · ${formatarSegundos(Number(m.duracao_segundos))}` : ''}
                  </span>
                  <span className="flex items-center gap-1 text-slate-400">
                    {dataHora(m.enviado_em)}
                    {u && <a href={u} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>}
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
