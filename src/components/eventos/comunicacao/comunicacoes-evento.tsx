'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Ban, CheckCircle2, ClipboardCheck, Copy, FileText, MessageCircle, PencilLine, Plus, QrCode, RefreshCw, Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { usePode } from '@/hooks/use-permissoes';
import { useTerceirosEvento } from '@/hooks/use-terceiros';
import { useSignedUrl } from '@/hooks/use-eventos';
import {
  useAcaoComunicacao, useAnexoComunicacaoEquipe, useComunicacoesEvento, useCriarComunicacao,
  useDeclaracaoEquipe, useRemoverAnexoComunicacao, type ComunicacaoCompleta,
} from '@/hooks/use-comunicacoes';
import { linkWhatsApp } from '@/lib/assistencia';
import {
  PAPEIS_COMUNICACAO, ROTULO_SITUACAO, compararDeclaracoes, ehTerceiro, linhasDaDeclaracao, linkComunicacao,
  mensagemComunicacao, rotuloPapel, situacaoComunicacao,
  type DadosComunicacao, type PapelComunicacao,
} from '@/lib/comunicacao-evento';
import { cn, formatDateTime } from '@/lib/utils';
import { FormularioComunicacao } from './formulario-comunicacao';

/**
 * Aba "Comunicacoes" da ficha do evento (0129): quem precisa comunicar, o link
 * de cada um (WhatsApp, copiar, QR), o que cada um declarou (versoes imutaveis),
 * pedir correcao, conferir, o comparador e o preenchimento PELA EQUIPE para quem
 * nao consegue usar o celular.
 */
export function ComunicacoesEvento({ eventoId, protocolo }: { eventoId: string; protocolo: string | null }) {
  const { data: lista, isLoading } = useComunicacoesEvento(eventoId);
  const acao = useAcaoComunicacao(eventoId);
  const podeTratar = usePode('eventos.editar');
  const [novo, setNovo] = useState(false);
  const [preencher, setPreencher] = useState<ComunicacaoCompleta | null>(null);
  const [qr, setQr] = useState<ComunicacaoCompleta | null>(null);

  const origem = typeof window !== 'undefined' ? window.location.origin : '';
  const link = (c: ComunicacaoCompleta) => linkComunicacao(origem, c.token);

  const respondidas = (lista ?? []).filter((c) => c.declaracoes.length > 0);
  const comparacao = useMemo(
    () => (respondidas.length >= 2 ? compararDeclaracoes(respondidas.map((c) => ultima(c).dados as DadosComunicacao)) : []),
    [respondidas],
  );

  async function executar(p: Parameters<typeof acao.mutateAsync>[0], ok: string) {
    try { await acao.mutateAsync(p); toast.success(ok); }
    catch (e) { toast.error((e as Error).message); }
  }

  function whatsapp(c: ComunicacaoCompleta) {
    const texto = mensagemComunicacao({ papel: c.papel, nome: c.nome, protocolo, link: link(c) });
    const url = linkWhatsApp(c.telefone, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener');
    void acao.mutateAsync({ tipo: 'envio', id: c.id, canal: 'WHATSAPP' }).catch(() => undefined);
  }

  async function copiar(c: ComunicacaoCompleta) {
    try {
      await navigator.clipboard.writeText(mensagemComunicacao({ papel: c.papel, nome: c.nome, protocolo, link: link(c) }));
      toast.success('Mensagem com o link copiada');
      void acao.mutateAsync({ tipo: 'envio', id: c.id, canal: 'COPIADO' }).catch(() => undefined);
    } catch { toast.error('Nao consegui copiar'); }
  }

  if (isLoading) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">Quem precisa comunicar</p>
          <p className="text-xs text-slate-500">
            Um link por envolvido. Quem nao consegue usar o celular, a equipe preenche por ele.
            {lista?.length ? ` ${respondidas.length} de ${lista.filter((c) => c.status !== 'REVOGADO').length} responderam.` : ''}
          </p>
        </div>
        <Button onClick={() => setNovo(true)}><Plus className="mr-1 h-4 w-4" /> Adicionar envolvido</Button>
      </div>

      {!lista?.length && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum envolvido ainda. Comece pelo associado e inclua os terceiros e testemunhas.
        </p>
      )}

      {(lista ?? []).map((c) => {
        const sit = situacaoComunicacao(c);
        const r = ROTULO_SITUACAO[sit];
        const ativo = sit !== 'REVOGADO';
        const respondeu = c.declaracoes.length > 0;
        return (
          <div key={c.id} className={cn('rounded-xl border border-slate-200 bg-superficie p-4', !ativo && 'opacity-60')}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">
                  {c.nome || 'Sem nome'} <span className="text-xs font-normal text-slate-500">· {rotuloPapel(c.papel)}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {[c.telefone, c.email].filter(Boolean).join(' · ') || 'sem contato'}
                  {c.ultimo_envio_em && <> · enviado {c.envios}x, ultimo {formatDateTime(c.ultimo_envio_em)}</>}
                  {c.primeiro_acesso_em && <> · abriu em {formatDateTime(c.primeiro_acesso_em)}</>}
                </p>
                {ativo && !respondeu && (
                  <p className="text-xs text-slate-500">Link vale ate {formatDateTime(c.expira_em)}</p>
                )}
              </div>
              <span className={cn('rounded-md px-2 py-1 text-xs font-medium', r.cor)}>{r.texto}</span>
            </div>

            {c.status === 'CORRECAO' && c.correcao_comentario && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Correcao pedida: {c.correcao_comentario}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {ativo && ['ABERTO', 'EM_PREENCHIMENTO', 'CORRECAO'].includes(sit) && (
                <>
                  <Button variant="secondary" onClick={() => whatsapp(c)}><MessageCircle className="mr-1 h-4 w-4" /> WhatsApp</Button>
                  <Button variant="secondary" onClick={() => copiar(c)}><Copy className="mr-1 h-4 w-4" /> Copiar</Button>
                  <Button variant="secondary" onClick={() => setQr(c)}><QrCode className="mr-1 h-4 w-4" /> QR</Button>
                </>
              )}
              {ativo && !['ENVIADO', 'CONFERIDO'].includes(c.status) && (
                <Button variant="secondary" onClick={() => setPreencher(c)}>
                  <PencilLine className="mr-1 h-4 w-4" /> Preencher pela equipe
                </Button>
              )}
              {ativo && (sit === 'EXPIRADO' || c.status === 'CORRECAO') && (
                <Button variant="ghost" onClick={() => executar({ tipo: 'renovar', id: c.id }, 'Link renovado por 7 dias')}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Renovar link
                </Button>
              )}
              {podeTratar && c.status === 'ENVIADO' && (
                <Button variant="ghost" onClick={() => executar({ tipo: 'conferir', id: c.id }, 'Marcada como conferida')}>
                  <ClipboardCheck className="mr-1 h-4 w-4" /> Conferido
                </Button>
              )}
              {podeTratar && ['ENVIADO', 'CONFERIDO'].includes(c.status) && (
                <Button variant="ghost" onClick={() => {
                  const comentario = window.prompt('O que o envolvido precisa corrigir ou completar?');
                  if (comentario?.trim()) void executar({ tipo: 'correcao', id: c.id, comentario }, 'Correcao pedida — reenvie o link');
                }}>
                  <Undo2 className="mr-1 h-4 w-4" /> Pedir correcao
                </Button>
              )}
              {ativo && !respondeu && (
                <Button variant="ghost" onClick={() => {
                  if (!window.confirm('Cancelar este link? Ele para de funcionar na hora.')) return;
                  void executar({ tipo: 'revogar', id: c.id }, 'Link cancelado');
                }}>
                  <Ban className="mr-1 h-4 w-4" /> Cancelar link
                </Button>
              )}
            </div>

            {respondeu && <Versoes c={c} />}
            <AnexosDoEnvolvido c={c} eventoId={eventoId} />
          </div>
        );
      })}

      {comparacao.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-superficie p-4">
          <p className="text-sm font-semibold text-slate-800">Comparar o que cada um disse</p>
          <p className="mb-2 text-xs text-slate-500">Em amarelo, onde as versoes nao batem. O comparador so destaca — quem decide e a analise.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="p-2">Campo</th>
                  {respondidas.map((c) => <th key={c.id} className="p-2">{c.nome || rotuloPapel(c.papel)}</th>)}
                </tr>
              </thead>
              <tbody>
                {comparacao.map((l) => (
                  <tr key={l.chave} className={cn('border-t border-slate-100', l.diverge && 'bg-amber-50')}>
                    <td className="p-2 font-medium text-slate-700">{l.rotulo}</td>
                    {l.valores.map((v, i) => <td key={i} className="whitespace-pre-wrap p-2 text-slate-700">{v || '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NovoEnvolvido open={novo} onClose={() => setNovo(false)} eventoId={eventoId} jaTemAssociado={(lista ?? []).some((c) => c.papel === 'associado' && c.status !== 'REVOGADO')} />
      {preencher && <PreencherPelaEquipe c={preencher} eventoId={eventoId} onClose={() => setPreencher(null)} />}
      {qr && <QrDoLink url={link(qr)} nome={qr.nome} onClose={() => setQr(null)} />}
    </div>
  );
}

const ultima = (c: ComunicacaoCompleta) => c.declaracoes[c.declaracoes.length - 1];

function Versoes({ c }: { c: ComunicacaoCompleta }) {
  const [aberta, setAberta] = useState(c.declaracoes.length - 1);
  const v = c.declaracoes[aberta];
  if (!v) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {c.declaracoes.map((d, i) => (
            <button key={d.id} onClick={() => setAberta(i)}
              className={cn('rounded-md px-2 py-1 text-xs', i === aberta ? 'bg-acao text-white' : 'bg-slate-100 text-slate-700')}>
              Versao {d.versao}
            </button>
          ))}
        </div>
        <a href={`/api/v1/eventos/comunicacao/pdf?declaracao=${v.id}`} target="_blank" rel="noopener"
          className="flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline">
          <FileText className="h-4 w-4" /> PDF
        </a>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {v.origem === 'EQUIPE' ? 'Registrada pela equipe' : 'Enviada pelo envolvido'} em {formatDateTime(v.created_at)}
        {v.ip && ` · IP ${v.ip}`}
      </p>
      <div className="mt-2 space-y-2">
        {linhasDaDeclaracao(c.papel as PapelComunicacao, v.dados as DadosComunicacao).map((s) => (
          <div key={s.secao}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{s.secao}</p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {s.itens.map(([k, val]) => (
                <div key={k} className={k === 'Relato' ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="whitespace-pre-wrap text-slate-800">{val}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-2 break-all font-mono text-[10px] text-slate-400">SHA-256 {v.hash_conteudo}</p>
    </div>
  );
}

function AnexosDoEnvolvido({ c, eventoId }: { c: ComunicacaoCompleta; eventoId: string }) {
  const url = useSignedUrl();
  const remover = useRemoverAnexoComunicacao(eventoId);
  if (!c.anexos.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fotos e documentos ({c.anexos.length})</p>
      <ul className="mt-1 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        {c.anexos.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1">
            <button className="truncate text-left text-cyan-700 hover:underline"
              onClick={async () => { try { window.open(await url.mutateAsync(a.arquivo_url), '_blank', 'noopener'); } catch (e) { toast.error((e as Error).message); } }}>
              {a.pose ?? a.tipo_documento} · {a.nome_original ?? 'arquivo'}
            </button>
            <span className="flex shrink-0 items-center gap-2 text-[10px] text-slate-400">
              {a.enviado_pelo_envolvido ? 'do envolvido' : 'da equipe'}
              {!a.enviado_pelo_envolvido && !['ENVIADO', 'CONFERIDO'].includes(c.status) && (
                <button className="text-rose-600" onClick={() => remover.mutate({ id: a.id, arquivo_url: a.arquivo_url })}>remover</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NovoEnvolvido({ open, onClose, eventoId, jaTemAssociado }: {
  open: boolean; onClose: () => void; eventoId: string; jaTemAssociado: boolean;
}) {
  const criar = useCriarComunicacao(eventoId);
  const { data: terceiros } = useTerceirosEvento(eventoId);
  const [papel, setPapel] = useState<PapelComunicacao>(jaTemAssociado ? 'terceiro_condutor' : 'associado');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [terceiroId, setTerceiroId] = useState('');

  useEffect(() => { if (open) setPapel(jaTemAssociado ? 'terceiro_condutor' : 'associado'); }, [open, jaTemAssociado]);

  function escolherTerceiro(id: string) {
    setTerceiroId(id);
    const t = terceiros?.find((x) => x.id === id);
    if (t) {
      setNome(t.nome ?? '');
      setTelefone(t.telefone ?? '');
      setEmail(t.email ?? '');
    }
  }

  async function salvar() {
    try {
      await criar.mutateAsync({ papel, nome, telefone, email, terceiro_id: ehTerceiro(papel) ? terceiroId || null : null });
      toast.success('Envolvido incluido — agora envie o link');
      setNome(''); setTelefone(''); setEmail(''); setTerceiroId('');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar envolvido" tamanho="md">
      <div className="space-y-3">
        <FormField label="Papel no evento">
          <Select value={papel} onChange={(e) => setPapel(e.target.value as PapelComunicacao)}>
            {PAPEIS_COMUNICACAO.filter((p) => p.valor !== 'associado' || !jaTemAssociado).map((p) => (
              <option key={p.valor} value={p.valor}>{p.rotulo} — {p.descricao}</option>
            ))}
          </Select>
        </FormField>
        {papel === 'associado' && (
          <p className="text-xs text-slate-500">Nome e telefone vem do cadastro do associado se ficarem em branco.</p>
        )}
        {ehTerceiro(papel) && !!terceiros?.length && (
          <FormField label="Terceiro ja cadastrado (opcional)">
            <Select value={terceiroId} onChange={(e) => escolherTerceiro(e.target.value)}>
              <option value="">— novo —</option>
              {terceiros.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nome}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Nome"><Input value={nome} onChange={(e) => setNome(e.target.value)} /></FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Celular (WhatsApp)"><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" /></FormField>
          <FormField label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={criar.isPending}>Incluir</Button>
        </div>
      </div>
    </Modal>
  );
}

function PreencherPelaEquipe({ c, eventoId, onClose }: { c: ComunicacaoCompleta; eventoId: string; onClose: () => void }) {
  const salvar = useDeclaracaoEquipe(eventoId);
  const anexar = useAnexoComunicacaoEquipe(eventoId);
  const remover = useRemoverAnexoComunicacao(eventoId);
  const { data: lista } = useComunicacoesEvento(eventoId);
  const atual = lista?.find((x) => x.id === c.id) ?? c;
  const [dados, setDados] = useState<DadosComunicacao>(
    () => ((c.rascunho && Object.keys(c.rascunho as object).length ? c.rascunho : ultima(c)?.dados ?? {}) as DadosComunicacao),
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function mudar(d: DadosComunicacao) {
    setDados(d);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { salvar.mutate({ id: c.id, dados: d, enviar: false }); }, 2000);
  }

  return (
    <Modal open onClose={onClose} title={`Preencher pela equipe — ${c.nome || rotuloPapel(c.papel)}`}
      subtitulo="Para quem nao consegue usar o link. Fica registrado que foi a equipe." tamanho="xl">
      <FormularioComunicacao
        papel={c.papel as PapelComunicacao}
        dados={dados}
        onChange={mudar}
        anexos={atual.anexos.map((a) => ({ id: a.id, pose: a.pose ?? null, nome_original: a.nome_original }))}
        onAnexar={async (pose, file) => { await anexar.mutateAsync({ comunicacaoId: c.id, pose, file }); }}
        onRemoverAnexo={async (id) => {
          const a = atual.anexos.find((x) => x.id === id);
          if (a) await remover.mutateAsync({ id: a.id, arquivo_url: a.arquivo_url });
        }}
        onEnviar={async () => {
          if (timer.current) clearTimeout(timer.current);
          try {
            await salvar.mutateAsync({ id: c.id, dados, enviar: true });
            toast.success('Comunicacao registrada');
            onClose();
          } catch (e) { toast.error((e as Error).message); }
        }}
        enviando={salvar.isPending}
        modo="equipe"
      />
    </Modal>
  );
}

function QrDoLink({ url, nome, onClose }: { url: string; nome: string | null; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void import('qrcode').then((q) => q.toDataURL(url, { width: 320, margin: 1 })).then((d) => { if (vivo) setImg(d); });
    return () => { vivo = false; };
  }, [url]);
  return (
    <Modal open onClose={onClose} title={`QR do link${nome ? ` — ${nome}` : ''}`} tamanho="md">
      <div className="flex flex-col items-center gap-3">
        {img ? <img src={img} alt="QR do link" className="h-64 w-64" /> : <p className="text-sm text-slate-500">Gerando...</p>}
        <p className="text-center text-xs text-slate-500">Para quem esta no balcao: aponte a camera do celular.</p>
        <p className="flex items-center gap-1 break-all text-xs text-slate-400"><CheckCircle2 className="h-3 w-3" /> {url}</p>
      </div>
    </Modal>
  );
}
