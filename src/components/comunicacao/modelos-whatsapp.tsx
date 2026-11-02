'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { History, Loader2, MessageCircle, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { usePode } from '@/hooks/use-permissoes';
import { useModelosGravados, useSalvarModelo, useVersoesModelo } from '@/hooks/use-modelos-comunicacao';
import type { TextosModelo } from '@/lib/comunicacao/modelos';
import {
  MODELOS_WHATSAPP, previaWhatsApp, textosEfetivosWhatsApp, textosWhatsAppParaGravar, validarTextosWhatsApp,
  type CodigoModeloWhatsApp, type ModeloWhatsApp,
} from '@/lib/comunicacao/modelos-whatsapp';
import { cn, formatDate } from '@/lib/utils';

const iguais = (a: TextosModelo, b: TextosModelo) => {
  const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

/** Os textos que os botões "WhatsApp" do sistema abrem prontos (0172). */
export function ModelosWhatsApp() {
  const gravados = useModelosGravados('WHATSAPP');
  const [codigo, setCodigo] = useState<CodigoModeloWhatsApp>('proposta');
  const porCodigo = useMemo(() => new Map((gravados.data ?? []).map((g) => [g.codigo, g])), [gravados.data]);
  const grupos = useMemo(() => {
    const g = new Map<string, ModeloWhatsApp[]>();
    for (const m of MODELOS_WHATSAPP) g.set(m.grupo, [...(g.get(m.grupo) ?? []), m]);
    return Array.from(g.entries());
  }, []);
  const modelo = MODELOS_WHATSAPP.find((m) => m.codigo === codigo)!;

  if (gravados.error) {
    return (
      <p className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
        Não consegui ler os modelos: {(gravados.error as Error).message}
      </p>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <nav className="space-y-4">
        {grupos.map(([grupo, lista]) => (
          <div key={grupo}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{grupo}</p>
            <ul className="space-y-1">
              {lista.map((m) => {
                const g = porCodigo.get(m.codigo);
                const alterado = g && Object.keys(g.textos ?? {}).length > 0;
                return (
                  <li key={m.codigo}>
                    <button
                      type="button"
                      onClick={() => setCodigo(m.codigo)}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2 text-left text-sm transition',
                        m.codigo === codigo
                          ? 'border-cyan-500 bg-cyan-50 text-slate-900'
                          : 'border-slate-200 bg-superficie text-slate-700 hover:border-slate-300',
                      )}
                    >
                      <span className="block font-medium">{m.nome}</span>
                      <span className="block text-xs text-slate-500">
                        {alterado ? `Texto alterado · versão ${g!.versao}` : 'Texto original'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {gravados.isLoading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <Editor
          key={`${codigo}:${porCodigo.get(codigo)?.versao ?? 0}`}
          modelo={modelo}
          gravado={porCodigo.get(codigo)?.textos ?? {}}
          versao={porCodigo.get(codigo)?.versao ?? 0}
          atualizado={porCodigo.get(codigo)}
        />
      )}
    </div>
  );
}

function Editor({
  modelo, gravado, versao, atualizado,
}: {
  modelo: ModeloWhatsApp;
  gravado: TextosModelo;
  versao: number;
  atualizado?: { atualizado_em: string; usuarios: { nome: string } | null };
}) {
  const podeEditar = usePode('comunicacao_modelos.editar');
  const [textos, setTextos] = useState<TextosModelo>(() => textosEfetivosWhatsApp(modelo.codigo, gravado));
  const [foco, setFoco] = useState<string>(modelo.partes[0].chave);
  const campos = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const [motivo, setMotivo] = useState('');
  const [historico, setHistorico] = useState(false);
  const salvar = useSalvarModelo();

  const erros = validarTextosWhatsApp(modelo.codigo, textos);
  const novo = textosWhatsAppParaGravar(modelo.codigo, textos);
  const sujo = !iguais(novo, gravado);
  const alterado = Object.keys(gravado).length > 0;
  const previas = previaWhatsApp(modelo.codigo, textos);

  function inserirCampo(chave: string) {
    const el = campos.current[foco];
    const atual = textos[foco] ?? '';
    const marca = `{${chave}}`;
    if (!el) { setTextos({ ...textos, [foco]: atual + marca }); return; }
    const ini = el.selectionStart ?? atual.length;
    const fim = el.selectionEnd ?? atual.length;
    setTextos({ ...textos, [foco]: atual.slice(0, ini) + marca + atual.slice(fim) });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + marca.length, ini + marca.length); });
  }

  function gravar() {
    salvar.mutate(
      { canal: 'WHATSAPP', codigo: modelo.codigo, textos, motivo: motivo || undefined },
      {
        onSuccess: (r) => {
          toast.success(r.alterados ? `Gravado (versão ${r.versao}). Os botões passam a abrir este texto.` : 'Gravado: voltou ao texto original.');
          setMotivo('');
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function voltarAoOriginal() {
    if (!window.confirm(`Voltar "${modelo.nome}" ao texto original? A versão atual fica no histórico.`)) return;
    salvar.mutate(
      { canal: 'WHATSAPP', codigo: modelo.codigo, original: true, motivo: motivo || 'Voltou ao texto original' },
      { onSuccess: () => toast.success('Voltou ao texto original.'), onError: (e) => toast.error(e.message) },
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-superficie p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">{modelo.nome}</h2>
            <p className="text-sm text-slate-600">{modelo.descricao}</p>
            <p className="mt-1 text-xs text-slate-500">Onde: {modelo.onde}</p>
            <p className="mt-1 text-xs text-slate-500">
              {alterado
                ? `Versão ${versao}${atualizado ? ` · ${formatDate(atualizado.atualizado_em)} · ${atualizado.usuarios?.nome ?? ''}` : ''}`
                : versao ? `Texto original (versão ${versao})` : 'Texto original'}
            </p>
          </div>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setHistorico(true)}>
            <History className="mr-1 h-4 w-4" /> Histórico
          </Button>
        </div>

        {!podeEditar && (
          <p className="rounded-xl border border-slate-200 bg-superficie-alta p-3 text-sm text-slate-700">
            Acesso só de consulta. Para alterar, o administrador libera
            “Comunicação — modelos de mensagens: editar”.
          </p>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Campos — clique para inserir onde está o cursor:</p>
          <div className="flex flex-wrap gap-1.5">
            {modelo.campos.map((c) => (
              <button
                key={c.chave}
                type="button"
                disabled={!podeEditar}
                onClick={() => inserirCampo(c.chave)}
                title={`${c.descricao} — ex.: ${c.exemplo}`}
                className="rounded-md border border-slate-300 bg-superficie-alta px-2 py-0.5 font-mono text-xs text-slate-700 hover:border-cyan-500 disabled:opacity-50"
              >
                {`{${c.chave}}`}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Campo sem dado some sozinho, sem deixar espaço sobrando. *texto* sai em negrito no WhatsApp.
            Quem envia ainda pode mudar a mensagem antes de mandar.
          </p>
        </div>

        <fieldset disabled={!podeEditar} className="space-y-3">
          {modelo.partes.map((parte) => {
            const v = textos[parte.chave] ?? '';
            const mudou = v.trim() !== parte.padrao;
            return (
              <div key={parte.chave}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-slate-700">
                    {parte.rotulo}{parte.obrigatorio && <span className="text-rose-600"> *</span>}
                  </label>
                  {mudou && (
                    <button
                      type="button"
                      className="text-xs text-cyan-700 hover:underline"
                      onClick={() => setTextos({ ...textos, [parte.chave]: parte.padrao })}
                    >
                      Usar o original
                    </button>
                  )}
                </div>
                <Textarea
                  rows={parte.linhas}
                  className={cn(mudou && 'border-cyan-500')}
                  value={v}
                  onFocus={(e) => { setFoco(parte.chave); campos.current[parte.chave] = e.currentTarget; }}
                  onChange={(e) => setTextos({ ...textos, [parte.chave]: e.target.value })}
                />
                <p className="mt-0.5 text-right text-[0.6875rem] text-slate-500">{v.trim().length}/{parte.limite}</p>
              </div>
            );
          })}
        </fieldset>

        {erros.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
            {erros.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        {podeEditar && (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <Input
              caixa="original"
              placeholder="O que mudou? (opcional, fica no histórico)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={!sujo || erros.length > 0 || salvar.isPending} onClick={gravar}>
                {salvar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                Gravar
              </Button>
              {sujo && (
                <Button variant="secondary" onClick={() => setTextos(textosEfetivosWhatsApp(modelo.codigo, gravado))}>
                  Desfazer as mudanças
                </Button>
              )}
              {alterado && (
                <Button variant="ghost" disabled={salvar.isPending} onClick={voltarAoOriginal}>
                  <RotateCcw className="mr-1 h-4 w-4" /> Voltar ao texto original
                </Button>
              )}
            </div>
            {sujo && <p className="text-xs text-amber-700">Há mudanças não gravadas.</p>}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-superficie p-4">
        <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-slate-900">
          <MessageCircle className="h-4 w-4 text-emerald-600" /> Pré-visualização (dados de exemplo)
        </h3>
        <div className="space-y-4 rounded-xl bg-[#e5ddd5] p-4 dark:bg-slate-200">
          {previas.map((p) => (
            <div key={p.titulo}>
              {previas.length > 1 && <p className="mb-1 text-xs font-medium text-slate-700">{p.titulo}</p>}
              <div className="ml-auto max-w-[90%] whitespace-pre-wrap break-words rounded-lg rounded-tr-none bg-[#dcf8c6] px-3 py-2 text-sm text-[#111b21] shadow-sm">
                {p.texto}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          A lista de boletos (vencimento, valor, linha digitável e PIX) é montada pelo sistema e não muda aqui.
        </p>
      </section>

      <Historico
        aberto={historico}
        fechar={() => setHistorico(false)}
        modelo={modelo}
        podeEditar={podeEditar}
        usar={(t) => { setTextos(textosEfetivosWhatsApp(modelo.codigo, t)); setHistorico(false); toast.info('Versão carregada. Confira e clique em Gravar.'); }}
      />
    </div>
  );
}

function Historico({
  aberto, fechar, modelo, podeEditar, usar,
}: {
  aberto: boolean; fechar: () => void; modelo: ModeloWhatsApp; podeEditar: boolean; usar: (t: TextosModelo) => void;
}) {
  const versoes = useVersoesModelo(aberto ? modelo.codigo : null, 'WHATSAPP');
  return (
    <Modal open={aberto} onClose={fechar} title={`Histórico — ${modelo.nome}`} tamanho="lg">
      {versoes.isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {versoes.error && <p className="text-sm text-rose-700">{(versoes.error as Error).message}</p>}
      {versoes.data && versoes.data.length === 0 && (
        <p className="text-sm text-slate-500">Nunca foi alterado: está com o texto original.</p>
      )}
      <ul className="space-y-2">
        {(versoes.data ?? []).map((v) => {
          const partes = Object.keys(v.textos ?? {});
          return (
            <li key={v.id} className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-800">
                  Versão {v.versao} · {formatDate(v.criado_em)} · {v.usuarios?.nome ?? '—'}
                </span>
                {podeEditar && (
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => usar(v.textos ?? {})}>
                    Usar esta versão
                  </Button>
                )}
              </div>
              <p className="text-slate-600">
                {partes.length
                  ? `Alterado: ${partes.map((k) => modelo.partes.find((x) => x.chave === k)?.rotulo ?? k).join(', ')}`
                  : 'Texto original'}
              </p>
              {v.motivo && <p className="text-xs text-slate-500">“{v.motivo}”</p>}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
