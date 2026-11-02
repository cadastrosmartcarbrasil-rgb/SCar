'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Ban, Copy, Eye, Loader2, Pencil, Plus, Save, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { SeletorAssociado } from '@/components/associados/seletor-associado';
import { usePode } from '@/hooks/use-permissoes';
import { useRegionais } from '@/hooks/use-config';
import { usePlanos, useTiposVeiculo } from '@/hooks/use-precificacao';
import { useAdiado } from '@/hooks/use-adiado';
import {
  useCancelarComunicado, useComunicado, useComunicados, useEnviarComunicado, usePreviaComunicado,
  usePreviaPublico, useSalvarComunicado,
} from '@/hooks/use-comunicados';
import {
  COMUNICADO_VAZIO, FINALIDADES, SITUACOES_PADRAO, SITUACOES_VEICULO, foraDoEnvio, validarComunicado,
  type DadosComunicado, type FiltrosComunicado,
} from '@/lib/comunicacao/comunicados';
import type { ComunicadosEmailRow } from '@/lib/database.types';
import { cn, formatDate } from '@/lib/utils';

const SITUACAO: Record<string, { rotulo: string; cls: string }> = {
  RASCUNHO: { rotulo: 'Rascunho', cls: 'bg-slate-100 text-slate-700' },
  ENVIADO: { rotulo: 'Enviado', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELADO: { rotulo: 'Cancelado', cls: 'bg-rose-100 text-rose-700' },
};

function dadosDoRegistro(c: ComunicadosEmailRow, copia = false): DadosComunicado {
  return {
    nome_interno: copia ? `${c.nome_interno} (cópia)` : c.nome_interno,
    finalidade: c.finalidade,
    assunto: c.assunto,
    titulo: c.titulo,
    previa: c.previa ?? '',
    corpo: c.corpo,
    botao_texto: c.botao_texto ?? '',
    botao_url: c.botao_url ?? '',
    filtros: (c.filtros ?? {}) as FiltrosComunicado,
  };
}

export function ComunicadosEmail() {
  const [aberto, setAberto] = useState<{ id: string | null; copiaDe?: string } | null>(null);
  if (aberto) {
    return <EditorComunicado id={aberto.id} copiaDe={aberto.copiaDe} fechar={() => setAberto(null)} abrir={(id) => setAberto({ id })} />;
  }
  return <ListaComunicados abrir={(id, copiaDe) => setAberto({ id, copiaDe })} />;
}

function ListaComunicados({ abrir }: { abrir: (id: string | null, copiaDe?: string) => void }) {
  const lista = useComunicados();
  const podeCriar = usePode('comunicacao_envios.criar');
  const cancelar = useCancelarComunicado();
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-slate-900">Comunicados</h2>
        {podeCriar && (
          <Button onClick={() => abrir(null)}><Plus className="mr-1 h-4 w-4" /> Novo comunicado</Button>
        )}
      </div>
      {lista.isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {lista.error && <p className="text-sm text-rose-700">Erro ao ler: {(lista.error as Error).message}</p>}
      {lista.data && lista.data.length === 0 && (
        <p className="text-sm text-slate-500">Nenhum comunicado ainda.</p>
      )}
      {lista.data && lista.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-superficie-alta text-left text-xs text-slate-500">
              <tr>
                <th className="p-2">Comunicado</th><th className="p-2">Situação</th><th className="p-2">Envio</th>
                <th className="p-2 text-right">Na fila</th><th className="p-2 text-right">Enviados</th>
                <th className="p-2 text-right">Entregues</th><th className="p-2 text-right">Falhas</th><th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {lista.data.map((c) => (
                <tr key={c.id} className="border-t border-slate-200 align-top">
                  <td className="p-2">
                    <div className="font-medium text-slate-800">{c.nome_interno}</div>
                    <div className="text-xs text-slate-500">
                      {c.finalidade === 'SERVICO' ? 'Aviso de serviço' : 'Informativo'} · {c.assunto || 'sem assunto'}
                    </div>
                    <div className="text-xs text-slate-500">por {c.criado_por_nome ?? '—'} em {formatDate(c.criado_em)}</div>
                  </td>
                  <td className="p-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', SITUACAO[c.situacao]?.cls)}>
                      {SITUACAO[c.situacao]?.rotulo ?? c.situacao}
                    </span>
                  </td>
                  <td className="p-2 text-slate-700">{c.enviado_em ? `${formatDate(c.enviado_em)} · ${c.total ?? 0}` : '—'}</td>
                  <td className="p-2 text-right tnum">{c.pendentes}</td>
                  <td className="p-2 text-right tnum">{c.enviados}</td>
                  <td className="p-2 text-right tnum">{c.entregues}</td>
                  <td className="p-2 text-right tnum">{c.falhas}</td>
                  <td className="whitespace-nowrap p-2 text-right">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => abrir(c.id)}>
                      {c.situacao === 'RASCUNHO' && podeCriar ? <Pencil className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                      {c.situacao === 'RASCUNHO' && podeCriar ? 'Editar' : 'Ver'}
                    </Button>
                    {podeCriar && (
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => abrir(null, c.id)}>
                        <Copy className="mr-1 h-3.5 w-3.5" /> Duplicar
                      </Button>
                    )}
                    {podeCriar && c.situacao !== 'CANCELADO' && (c.situacao === 'RASCUNHO' || c.pendentes > 0) && (
                      <Button
                        variant="ghost" className="px-2 py-1 text-xs text-rose-700"
                        onClick={() => {
                          const msg = c.situacao === 'RASCUNHO'
                            ? `Cancelar o rascunho "${c.nome_interno}"?`
                            : `Parar o envio de "${c.nome_interno}"? ${c.pendentes} e-mail(s) ainda na fila não saem. O que já saiu, saiu.`;
                          if (!window.confirm(msg)) return;
                          cancelar.mutate(c.id, {
                            onSuccess: (n) => toast.success(n ? `${n} e-mail(s) tirados da fila.` : 'Cancelado.'),
                            onError: (e) => toast.error(e.message),
                          });
                        }}
                      >
                        <Ban className="mr-1 h-3.5 w-3.5" /> {c.situacao === 'RASCUNHO' ? 'Cancelar' : 'Parar envio'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        O envio usa a mesma fila dos e-mails de cobrança: horário, ritmo, modo de teste e lista de supressão do painel
        Cobrança → E-mails de Cobrança valem aqui. No modo teste, só a lista de teste recebe.
      </p>
    </section>
  );
}

function EditorComunicado({
  id, copiaDe, fechar, abrir,
}: { id: string | null; copiaDe?: string; fechar: () => void; abrir: (id: string) => void }) {
  const registro = useComunicado(id ?? copiaDe ?? null);
  const [dados, setDados] = useState<DadosComunicado | null>(id || copiaDe ? null : COMUNICADO_VAZIO);
  useEffect(() => {
    if (!dados && registro.data) setDados(dadosDoRegistro(registro.data, !!copiaDe));
  }, [registro.data, dados, copiaDe]);

  if (registro.error) return <p className="text-sm text-rose-700">{(registro.error as Error).message}</p>;
  if (!dados) return <p className="text-sm text-slate-500">Carregando…</p>;
  const situacao = id ? registro.data?.situacao ?? 'RASCUNHO' : 'RASCUNHO';
  return (
    <FormComunicado
      id={id} dados={dados} setDados={setDados} situacao={situacao} fechar={fechar} abrir={abrir}
      enviadoEm={id ? registro.data?.enviado_em ?? null : null}
    />
  );
}

function Marcar<T extends string>({
  opcoes, marcados, alterar,
}: { opcoes: { valor: T; rotulo: string }[]; marcados: T[]; alterar: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => {
        const on = marcados.includes(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => alterar(on ? marcados.filter((x) => x !== o.valor) : [...marcados, o.valor])}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs',
              on ? 'border-cyan-500 bg-cyan-50 text-slate-900' : 'border-slate-300 text-slate-600 hover:border-slate-400',
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

function FormComunicado({
  id, dados, setDados, situacao, fechar, abrir, enviadoEm,
}: {
  id: string | null;
  dados: DadosComunicado;
  setDados: (d: DadosComunicado) => void;
  situacao: string;
  fechar: () => void;
  abrir: (id: string) => void;
  enviadoEm: string | null;
}) {
  const podeCriar = usePode('comunicacao_envios.criar');
  const editavel = podeCriar && situacao === 'RASCUNHO';
  const regionais = useRegionais();
  const planos = usePlanos();
  const tipos = useTiposVeiculo();
  const salvar = useSalvarComunicado();
  const enviar = useEnviarComunicado();
  const previa = usePreviaComunicado();
  const teste = usePreviaComunicado();
  const [html, setHtml] = useState<{ assunto: string; html: string } | null>(null);
  const [emailTeste, setEmailTeste] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const corpoRef = useRef<HTMLTextAreaElement | null>(null);

  const f = dados.filtros;
  const modo: 'um' | 'lista' = f.cliente_id !== undefined && f.cliente_id !== null ? 'um' : 'lista';
  const set = (p: Partial<DadosComunicado>) => setDados({ ...dados, ...p });
  const setF = (p: Partial<FiltrosComunicado>) => setDados({ ...dados, filtros: { ...dados.filtros, ...p } });

  const filtrosAdiados = useAdiado(f, 500);
  const publico = usePreviaPublico(filtrosAdiados, dados.finalidade, !(modo === 'um' && !f.cliente_id));
  const erros = validarComunicado(dados, false);
  const errosEnvio = validarComunicado(dados, true);

  const chave = JSON.stringify([dados.finalidade, dados.assunto, dados.titulo, dados.previa, dados.corpo, dados.botao_texto, dados.botao_url]);
  useEffect(() => {
    const t = setTimeout(() => {
      previa.mutate({ dados }, { onSuccess: (r) => r.html && setHtml({ assunto: r.assunto ?? '', html: r.html }) });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  function gravar(depois?: (id: string) => void) {
    salvar.mutate(
      { id, dados },
      {
        onSuccess: (novo) => {
          toast.success('Rascunho gravado.');
          if (depois) depois(novo);
          else if (!id) abrir(novo);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function enviarAgora() {
    gravar((novoId) => {
      enviar.mutate(novoId, {
        onSuccess: (n) => {
          toast.success(`${n} e-mail(s) na fila. Saem no ritmo e no horário configurados.`);
          setConfirmar(false);
          fechar();
        },
        onError: (e) => toast.error(e.message),
      });
    });
  }

  function inserirNome() {
    const el = corpoRef.current;
    const atual = dados.corpo;
    if (!el) { set({ corpo: `${atual}{nome}` }); return; }
    const ini = el.selectionStart ?? atual.length;
    const fim = el.selectionEnd ?? atual.length;
    set({ corpo: atual.slice(0, ini) + '{nome}' + atual.slice(fim) });
  }

  const p = publico.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={fechar}>← Voltar à lista</Button>
        {situacao !== 'RASCUNHO' && (
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', SITUACAO[situacao]?.cls)}>
            {SITUACAO[situacao]?.rotulo}{enviadoEm ? ` em ${formatDate(enviadoEm)}` : ''} — não pode mais ser alterado
          </span>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <fieldset disabled={!editavel} className="space-y-4">
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-superficie p-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Nome do comunicado (só a equipe vê)</span>
              <Input caixa="original" value={dados.nome_interno} onChange={(e) => set({ nome_interno: e.target.value })} />
            </label>
            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Tipo</span>
              {FINALIDADES.map((o) => (
                <label key={o.valor} className="flex cursor-pointer gap-2 rounded-lg border border-slate-200 p-2.5">
                  <input type="radio" checked={dados.finalidade === o.valor} onChange={() => set({ finalidade: o.valor })} />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{o.rotulo}</span>
                    <span className="block text-xs text-slate-500">{o.explicacao}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-superficie p-4">
            <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4" /> Para quem
            </h3>
            <div className="flex gap-2">
              <Button variant={modo === 'lista' ? 'primary' : 'secondary'} onClick={() => setF({ cliente_id: undefined })}>
                Uma lista
              </Button>
              <Button variant={modo === 'um' ? 'primary' : 'secondary'} onClick={() => setF({ cliente_id: null })}>
                Um associado
              </Button>
            </div>
            {modo === 'um' ? (
              <SeletorAssociado value={f.cliente_id ?? null} onChange={(v) => setF({ cliente_id: v || null })} />
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">Unidades (nenhuma marcada = todas que você alcança)</p>
                  <Marcar
                    opcoes={(regionais.data ?? []).map((r) => ({ valor: r.id, rotulo: r.nome }))}
                    marcados={f.regional_ids ?? []}
                    alterar={(v) => setF({ regional_ids: v })}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">Situação do veículo (o associado entra se tiver UM veículo assim)</p>
                  <Marcar opcoes={SITUACOES_VEICULO} marcados={f.situacoes ?? SITUACOES_PADRAO} alterar={(v) => setF({ situacoes: v })} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">Plano (nenhum = todos)</p>
                  <Marcar
                    opcoes={(planos.data ?? []).filter((x) => x.ativo !== false).map((x) => ({ valor: x.id, rotulo: x.nome }))}
                    marcados={f.plano_ids ?? []}
                    alterar={(v) => setF({ plano_ids: v })}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">Tipo de veículo (nenhum = todos)</p>
                  <Marcar
                    opcoes={(tipos.data ?? []).map((x) => ({ valor: x.id, rotulo: x.nome }))}
                    marcados={f.tipo_veiculo_ids ?? []}
                    alterar={(v) => setF({ tipo_veiculo_ids: v })}
                  />
                </div>
              </div>
            )}
            <div className="rounded-xl bg-superficie-alta p-3 text-sm">
              {publico.isFetching && <Loader2 className="mb-1 h-4 w-4 animate-spin text-slate-500" />}
              {publico.error && <p className="text-rose-700">{(publico.error as Error).message}</p>}
              {modo === 'um' && !f.cliente_id && <p className="text-slate-500">Escolha o associado.</p>}
              {p && !(modo === 'um' && !f.cliente_id) && (
                <>
                  <p className="text-slate-800">
                    <strong className="tnum text-lg">{p.recebem}</strong> pessoa(s) recebem
                    <span className="text-slate-500"> · {p.associados} associado(s) no filtro</span>
                  </p>
                  {foraDoEnvio(p).map((l) => <p key={l} className="text-xs text-slate-500">Fora: {l}</p>)}
                  {p.amostra.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Ex.: {p.amostra.slice(0, 5).map((a) => a.nome).join(', ')}{p.recebem > 5 ? '…' : ''}
                    </p>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-slate-200 bg-superficie p-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">Texto</h3>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Assunto *</span>
              <Input caixa="original" value={dados.assunto} onChange={(e) => set({ assunto: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Prévia (texto ao lado do assunto na caixa de entrada)</span>
              <Input caixa="original" value={dados.previa} onChange={(e) => set({ previa: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Título *</span>
              <Input caixa="original" value={dados.titulo} onChange={(e) => set({ titulo: e.target.value })} />
            </label>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Texto *</span>
                <button
                  type="button" onClick={inserirNome}
                  className="rounded-md border border-slate-300 bg-superficie-alta px-2 py-0.5 font-mono text-xs hover:border-cyan-500"
                >
                  {'{nome}'}
                </button>
              </div>
              <Textarea
                rows={10}
                value={dados.corpo}
                onFocus={(e) => { corpoRef.current = e.currentTarget; }}
                onChange={(e) => set({ corpo: e.target.value })}
              />
              <p className="mt-0.5 text-xs text-slate-500">
                Linha em branco separa parágrafos. **texto** fica em negrito. {'{nome}'} vira o primeiro nome.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Botão (opcional)</span>
                <Input caixa="original" placeholder="Ex.: Ver o regimento" value={dados.botao_texto} onChange={(e) => set({ botao_texto: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Link do botão</span>
                <Input caixa="original" placeholder="https://" value={dados.botao_url} onChange={(e) => set({ botao_url: e.target.value })} />
              </label>
            </div>
          </section>
        </fieldset>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-superficie p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900">Pré-visualização</h3>
            {previa.isPending && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
          </div>
          {html ? (
            <>
              <p className="text-sm text-slate-700"><span className="text-slate-500">Assunto:</span> <strong>{html.assunto}</strong></p>
              <iframe title="Pré-visualização" srcDoc={html.html} sandbox="" className="h-[720px] w-full rounded-xl border border-slate-200 bg-white" />
            </>
          ) : <p className="text-sm text-slate-500">Montando…</p>}

          {editavel && (
            <>
              {erros.length + errosEnvio.length > 0 && (
                <ul className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  {Array.from(new Set([...erros, ...errosEnvio])).map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
              <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row">
                <Input caixa="original" type="email" placeholder="Enviar teste para…" value={emailTeste} onChange={(e) => setEmailTeste(e.target.value)} />
                <Button
                  variant="secondary"
                  disabled={!emailTeste.trim() || errosEnvio.length > 0 || teste.isPending}
                  onClick={() => teste.mutate(
                    { dados, email: emailTeste },
                    { onSuccess: () => toast.success('Teste enviado.'), onError: (e) => toast.error(e.message) },
                  )}
                >
                  {teste.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                  Enviar teste
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={erros.length > 0 || salvar.isPending} onClick={() => gravar()}>
                  <Save className="mr-1 h-4 w-4" /> Gravar rascunho
                </Button>
                <Button
                  disabled={errosEnvio.length > 0 || !p || p.recebem === 0 || salvar.isPending || enviar.isPending}
                  onClick={() => setConfirmar(true)}
                >
                  <Send className="mr-1 h-4 w-4" /> Enviar…
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Enviar o comunicado?">
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            <strong>{p?.recebem ?? 0}</strong> pessoa(s) vão receber <strong>“{dados.assunto}”</strong>
            {dados.finalidade === 'INFORMATIVO' ? ' (informativo, com o link para não receber mais)' : ' (aviso de serviço)'}.
          </p>
          <p>
            Depois de enviado o comunicado não muda mais. Os e-mails saem no horário e no ritmo do painel de e-mails; dá para
            parar o que ainda estiver na fila.
          </p>
          <p className="text-xs text-slate-500">No modo teste do painel de e-mails, só quem está na lista de teste recebe.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmar(false)}>Voltar</Button>
            <Button disabled={salvar.isPending || enviar.isPending} onClick={enviarAgora}>
              {(salvar.isPending || enviar.isPending) && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enviar agora
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
