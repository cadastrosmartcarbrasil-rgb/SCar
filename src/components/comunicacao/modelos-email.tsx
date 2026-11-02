'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { History, Loader2, RotateCcw, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { usePode } from '@/hooks/use-permissoes';
import {
  useModelosGravados, usePreviaModelo, useSalvarModelo, useVersoesModelo,
} from '@/hooks/use-modelos-comunicacao';
import {
  MODELOS_EMAIL, textosEfetivos, textosParaGravar, validarTextos,
  type CodigoModeloEmail, type ModeloEmail, type TextosModelo,
} from '@/lib/comunicacao/modelos';
import { cn, formatDate } from '@/lib/utils';

const iguais = (a: TextosModelo, b: TextosModelo) => {
  const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

export function ModelosEmail() {
  const gravados = useModelosGravados();
  const [codigo, setCodigo] = useState<CodigoModeloEmail>('lembrete');
  const porCodigo = useMemo(
    () => new Map((gravados.data ?? []).map((g) => [g.codigo, g])),
    [gravados.data],
  );
  const grupos = useMemo(() => {
    const g = new Map<string, ModeloEmail[]>();
    for (const m of MODELOS_EMAIL) g.set(m.grupo, [...(g.get(m.grupo) ?? []), m]);
    return Array.from(g.entries());
  }, []);
  const modelo = MODELOS_EMAIL.find((m) => m.codigo === codigo)!;

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
        <EditorModelo
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

function EditorModelo({
  modelo, gravado, versao, atualizado,
}: {
  modelo: ModeloEmail;
  gravado: TextosModelo;
  versao: number;
  atualizado?: { atualizado_em: string; usuarios: { nome: string } | null };
}) {
  const podeEditar = usePode('comunicacao_modelos.editar');
  const [textos, setTextos] = useState<TextosModelo>(() => textosEfetivos(modelo.codigo, gravado));
  const [foco, setFoco] = useState<string>('corpo');
  const campos = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const [motivo, setMotivo] = useState('');
  const [emailTeste, setEmailTeste] = useState('');
  const [historico, setHistorico] = useState(false);
  const [previa, setPrevia] = useState<{ assunto: string; html: string } | null>(null);
  const salvar = useSalvarModelo();
  const gerarPrevia = usePreviaModelo();
  const teste = usePreviaModelo();

  const erros = validarTextos(modelo.codigo, textos);
  const novo = textosParaGravar(modelo.codigo, textos);
  const sujo = !iguais(novo, gravado);
  const alterado = Object.keys(gravado).length > 0;

  // pre-visualizacao: refaz meio segundo depois da ultima tecla
  const chavePrevia = JSON.stringify(textos);
  useEffect(() => {
    const t = setTimeout(() => {
      gerarPrevia.mutate(
        { codigo: modelo.codigo, textos },
        { onSuccess: (r) => r.html && setPrevia({ assunto: r.assunto ?? '', html: r.html }) },
      );
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chavePrevia, modelo.codigo]);

  function inserirCampo(chave: string) {
    const el = campos.current[foco];
    const atual = textos[foco] ?? '';
    const marca = `{${chave}}`;
    if (!el) { setTextos({ ...textos, [foco]: atual + marca }); return; }
    const ini = el.selectionStart ?? atual.length;
    const fim = el.selectionEnd ?? atual.length;
    setTextos({ ...textos, [foco]: atual.slice(0, ini) + marca + atual.slice(fim) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + marca.length, ini + marca.length);
    });
  }

  function gravar() {
    salvar.mutate(
      { codigo: modelo.codigo, textos, motivo: motivo || undefined },
      {
        onSuccess: (r) => {
          toast.success(r.alterados ? `Gravado (versão ${r.versao}). Vale para os próximos envios.` : 'Gravado: voltou ao texto original.');
          setMotivo('');
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function voltarAoOriginal() {
    if (!window.confirm(`Voltar "${modelo.nome}" ao texto original? A versão atual fica no histórico.`)) return;
    salvar.mutate(
      { codigo: modelo.codigo, original: true, motivo: motivo || 'Voltou ao texto original' },
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
          <p className="mb-1 text-xs font-medium text-slate-600">
            Campos — clique para inserir no texto em que está o cursor:
          </p>
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
            Linha em branco separa parágrafos. **texto** fica em negrito. Boleto, PIX, botões, contatos e rodapé
            não mudam aqui.
          </p>
        </div>

        <fieldset disabled={!podeEditar} className="space-y-3">
          {modelo.partes.map((parte) => {
            const v = textos[parte.chave] ?? '';
            const mudou = v.trim() !== parte.padrao;
            const props = {
              value: v,
              onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                setFoco(parte.chave);
                campos.current[parte.chave] = e.currentTarget;
              },
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setTextos({ ...textos, [parte.chave]: e.target.value }),
            };
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
                {parte.linhas > 1 ? (
                  <Textarea
                    rows={parte.linhas}
                    className={cn(mudou && 'border-cyan-500')}
                    {...props}
                  />
                ) : (
                  <Input
                    caixa="original"
                    className={cn(mudou && 'border-cyan-500')}
                    {...props}
                  />
                )}
                <p className="mt-0.5 text-right text-[0.6875rem] text-slate-500">
                  {v.trim().length}/{parte.limite}
                </p>
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
                <Button variant="secondary" onClick={() => setTextos(textosEfetivos(modelo.codigo, gravado))}>
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
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900">Pré-visualização (dados de exemplo)</h3>
          {gerarPrevia.isPending && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
        </div>
        {gerarPrevia.error && (
          <p className="text-sm text-rose-700">Não consegui montar a prévia: {(gerarPrevia.error as Error).message}</p>
        )}
        {previa ? (
          <>
            <p className="text-sm text-slate-700">
              <span className="text-slate-500">Assunto:</span> <strong>{previa.assunto}</strong>
            </p>
            <iframe
              title="Pré-visualização do e-mail"
              srcDoc={previa.html}
              sandbox=""
              className="h-[720px] w-full rounded-xl border border-slate-200 bg-white"
            />
          </>
        ) : (
          <p className="text-sm text-slate-500">Montando…</p>
        )}
        {podeEditar && (
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row">
            <Input
              caixa="original"
              type="email"
              placeholder="Enviar teste para…"
              value={emailTeste}
              onChange={(e) => setEmailTeste(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!emailTeste.trim() || erros.length > 0 || teste.isPending}
              onClick={() => teste.mutate(
                { codigo: modelo.codigo, textos, email: emailTeste },
                { onSuccess: () => toast.success('Teste enviado (com os textos da tela).'), onError: (e) => toast.error(e.message) },
              )}
            >
              {teste.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Enviar teste
            </Button>
          </div>
        )}
      </section>

      <HistoricoModelo
        aberto={historico}
        fechar={() => setHistorico(false)}
        modelo={modelo}
        podeEditar={podeEditar}
        usar={(t) => { setTextos(textosEfetivos(modelo.codigo, t)); setHistorico(false); toast.info('Versão carregada. Confira e clique em Gravar.'); }}
      />
    </div>
  );
}

function HistoricoModelo({
  aberto, fechar, modelo, podeEditar, usar,
}: {
  aberto: boolean;
  fechar: () => void;
  modelo: ModeloEmail;
  podeEditar: boolean;
  usar: (t: TextosModelo) => void;
}) {
  const versoes = useVersoesModelo(aberto ? modelo.codigo : null);
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
