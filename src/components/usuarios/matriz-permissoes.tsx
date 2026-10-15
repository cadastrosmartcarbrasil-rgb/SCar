'use client';

import { useState } from 'react';
import { Check, Minus, Lock, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PAPEIS_USUARIO, rotuloPapel } from '@/lib/usuario';
import {
  ACOES, ALCADAS, MODULOS, ROTULO_ACAO, chaveCelula, celulaAplica, celulaEditavel,
  temPermissao, mudancasDoPerfil, permissoesDoPapel, rotuloDaChave, type Concessoes,
} from '@/lib/permissoes';
import { useConcessoesPapeis, useSalvarPermissoesPerfil } from '@/hooks/use-permissoes';
import { cn } from '@/lib/utils';

/** Uma celula: ✓ (pode), — (nao pode), vazio (nao se aplica ao modulo). */
function Celula({ aplica, ok, editando, onClick, titulo }: {
  aplica: boolean; ok: boolean; editando: boolean; onClick?: () => void; titulo: string;
}) {
  if (!aplica) return <span className="text-slate-200" aria-hidden>·</span>;
  if (editando && onClick) {
    return (
      <button type="button" onClick={onClick} title={titulo} aria-pressed={ok}
        className={cn('inline-flex h-6 w-6 items-center justify-center rounded border transition',
          ok ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-superficie hover:border-cyan-500')}>
        {ok && <Check className="h-3.5 w-3.5" />}
      </button>
    );
  }
  return ok
    ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Sim" />
    : <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="Nao" />;
}

function CartaoPerfil({ papel, concessoes, podeEditar, usuarios }: {
  papel: string; concessoes?: Concessoes; podeEditar: boolean; usuarios?: number;
}) {
  const salvar = useSalvarPermissoesPerfil();
  const [rascunho, setRascunho] = useState<Record<string, boolean> | null>(null);
  const editando = rascunho !== null;
  const meta = PAPEIS_USUARIO.find((p) => p.valor === papel);
  const ehAdmin = papel === 'admin';

  const valor = (chave: string) => rascunho?.[chave] ?? temPermissao(papel, chave, concessoes);
  const alternar = (chave: string) =>
    setRascunho((r) => ({ ...(r ?? {}), [chave]: !valor(chave) }));

  function gravar() {
    const celulas = mudancasDoPerfil(papel, concessoes, rascunho ?? {});
    if (celulas.length === 0) { setRascunho(null); return; }
    const resumo = celulas.slice(0, 12).map((c) =>
      `${c.concedida ? '+' : '-'} ${rotuloDaChave(c.modulo === 'alcada' ? c.acao : `${c.modulo}.${c.acao}`)}`);
    if (!confirm(
      `Salvar ${celulas.length} alteracao(oes) no perfil ${rotuloPapel(papel)}?\n\n${resumo.join('\n')}`
      + `${celulas.length > 12 ? '\n...' : ''}\n\nAfeta ${usuarios ?? 0} usuario(s) ativo(s) e vale na hora.`,
    )) return;
    salvar.mutate({ papel, celulas }, {
      onSuccess: (n) => { toast.success(`${n} permissao(oes) alterada(s) em ${rotuloPapel(papel)}`); setRascunho(null); },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold uppercase tracking-wide text-slate-900">{rotuloPapel(papel)}</h3>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
              {ehAdmin ? 'sistema' : 'perfil'}
            </span>
            {usuarios !== undefined && (
              <span className="text-[11px] text-slate-400">{usuarios} usuario(s) ativo(s)</span>
            )}
          </div>
          <p className="mt-0.5 text-xs uppercase text-slate-500">
            {ehAdmin ? 'Administrador — acesso total, nao ajustavel' : (meta && 'nota' in meta ? meta.nota : '')}
          </p>
        </div>
        {podeEditar && !ehAdmin && (
          editando ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRascunho(null)} disabled={salvar.isPending}>
                <X className="h-4 w-4" /> Cancelar
              </Button>
              <Button onClick={gravar} disabled={salvar.isPending}>
                <Save className="h-4 w-4" /> {salvar.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          ) : (
            <Button onClick={() => setRascunho({})}><Pencil className="h-4 w-4" /> Editar</Button>
          )
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">Modulo</th>
              {ACOES.map((a) => <th key={a} className="px-2 py-2 text-center">{ROTULO_ACAO[a]}</th>)}
            </tr>
          </thead>
          <tbody>
            {MODULOS.map((m) => (
              <tr key={m.chave} className="border-t border-slate-100">
                <td className="sticky left-0 bg-superficie px-3 py-2 text-xs font-medium uppercase text-slate-700">
                  <span className="flex items-center gap-1">
                    {m.rotulo}
                    {m.fixo && <span title="Fixo pela estrutura do sistema"><Lock className="h-3 w-3 text-slate-300" /></span>}
                  </span>
                </td>
                {ACOES.map((a) => {
                  const k = chaveCelula(m.chave, a);
                  const nota = m.notas?.[a];
                  return (
                    <td key={a} className="px-2 py-2 text-center">
                      <Celula aplica={celulaAplica(m, a)} ok={valor(k)} editando={editando}
                        titulo={`${m.rotulo}: ${ROTULO_ACAO[a]}${nota ? ` (${nota})` : ''}`}
                        onClick={celulaEditavel(m, a, papel) ? () => alternar(k) : undefined} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Alcadas especiais</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {ALCADAS.map((al) => (
            <div key={al.chave} className="flex items-start gap-2 text-xs text-slate-600">
              <span className="mt-0.5 shrink-0">
                <Celula aplica ok={valor(al.chave)} editando={editando} titulo={al.rotulo}
                  onClick={!ehAdmin ? () => alternar(al.chave) : undefined} />
              </span>
              {al.rotulo}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A grade inteira: um cartao por perfil. O admin edita. */
export function MatrizPermissoes({ contagem, editavel = false }: {
  contagem?: Record<string, number>; editavel?: boolean;
}) {
  const { data: concessoes, isLoading } = useConcessoesPapeis();
  const [papel, setPapel] = useState<string>('gestor_regional');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PAPEIS_USUARIO.map((p) => (
          <button key={p.valor} type="button" onClick={() => setPapel(p.valor)}
            className={cn('rounded-full border px-3 py-1 text-xs',
              papel === p.valor
                ? 'border-brand-600 bg-acao text-white'
                : 'border-slate-200 bg-superficie text-slate-600 hover:border-slate-400')}>
            {p.rotulo}
            {contagem && <span className="ml-1 opacity-70">({contagem[p.valor] ?? 0})</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">Carregando permissoes...</p>
      ) : (
        <CartaoPerfil key={papel} papel={papel} concessoes={concessoes}
          podeEditar={editavel} usuarios={contagem?.[papel]} />
      )}

      <p className="text-xs leading-relaxed text-slate-400">
        <b className="text-slate-500">Como vale:</b> o <b>Ver</b> controla o menu e a abertura da tela; as demais
        acoes controlam os botoes, e <b>Excluir</b>, a 24h, o tratamento do evento, a Auditoria, a tabela de
        precos, fornecedores e comunicados tambem sao conferidos pelo banco. Celula com <b>·</b> nao se aplica ao
        modulo. Modulos com cadeado sao estrutura do sistema (so admin/financeiro). O alcance continua sendo a
        unidade do cadastro do usuario.
      </p>
    </div>
  );
}

/** O que UM papel libera — aparece embaixo do seletor de papel no cadastro. */
export function ResumoDoPapel({ papel }: { papel: string }) {
  const { data: concessoes } = useConcessoesPapeis();
  const chaves = permissoesDoPapel(papel, concessoes);
  if (chaves.length === 0) return null;
  // agrupa por modulo: "Veiculos: ver, criar, editar"
  const porModulo = new Map<string, string[]>();
  const alcadas: string[] = [];
  for (const k of chaves) {
    const [mod, acao] = k.split('.');
    if (!acao) { alcadas.push(rotuloDaChave(k)); continue; }
    const m = MODULOS.find((x) => x.chave === mod);
    const nome = m?.rotulo ?? mod;
    porModulo.set(nome, [...(porModulo.get(nome) ?? []), ROTULO_ACAO[acao as keyof typeof ROTULO_ACAO].toLowerCase()]);
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-superficie p-2.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Este perfil libera</p>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {[...porModulo.entries()].map(([nome, acoes]) => (
          <li key={nome} className="text-[12px] text-slate-600">
            <b className="font-medium text-slate-700">{nome}:</b> {acoes.join(', ')}
          </li>
        ))}
        {alcadas.map((a) => <li key={a} className="text-[12px] text-slate-600">{a}</li>)}
      </ul>
    </div>
  );
}
