'use client';

import { useState } from 'react';
import { Check, Minus, Lock, Pencil, Save, X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { PAPEIS_USUARIO, rotuloPapel } from '@/lib/usuario';
import {
  ACOES, ALCADAS, MODULOS, ROTULO_ACAO, chaveCelula, celulaAplica, celulaEditavel, basesDosPerfis,
  temPermissao, mudancasDoPerfil, permissoesDoPapel, rotuloDaChave,
  type Concessoes, type BasesDePerfil, type PerfilAcesso,
} from '@/lib/permissoes';
import {
  useConcessoesPapeis, useSalvarPermissoesPerfil, usePerfisAcesso, useSalvarPerfilAcesso, useExcluirPerfilAcesso,
} from '@/hooks/use-permissoes';
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

function CartaoPerfil({ papel, concessoes, podeEditar, usuarios, perfil, bases, onEditarPerfil, onExcluido }: {
  papel: string; concessoes?: Concessoes; podeEditar: boolean; usuarios?: number;
  /** perfil personalizado (0130); `papel` e o id dele */
  perfil?: PerfilAcesso; bases?: BasesDePerfil;
  onEditarPerfil?: () => void; onExcluido?: () => void;
}) {
  const salvar = useSalvarPermissoesPerfil();
  const excluir = useExcluirPerfilAcesso();
  const [rascunho, setRascunho] = useState<Record<string, boolean> | null>(null);
  const editando = rascunho !== null;
  const meta = PAPEIS_USUARIO.find((p) => p.valor === papel);
  const ehAdmin = papel === 'admin';
  const nome = perfil?.nome ?? rotuloPapel(papel);
  const base = perfil?.papel_base ?? papel;

  const valor = (chave: string) => rascunho?.[chave] ?? temPermissao(papel, chave, concessoes, bases);

  function apagar() {
    if (!perfil) return;
    if ((usuarios ?? 0) > 0) {
      toast.error(`O perfil tem ${usuarios} usuario(s) ativo(s): troque o perfil deles antes de excluir.`);
      return;
    }
    if (!confirm(`Excluir o perfil ${perfil.nome}? A grade dele e apagada junto.`)) return;
    excluir.mutate(perfil.id, {
      onSuccess: () => { toast.success('Perfil excluido'); onExcluido?.(); },
      onError: (e) => toast.error(e.message),
    });
  }
  const alternar = (chave: string) =>
    setRascunho((r) => ({ ...(r ?? {}), [chave]: !valor(chave) }));

  function gravar() {
    const celulas = mudancasDoPerfil(papel, concessoes, rascunho ?? {}, bases);
    if (celulas.length === 0) { setRascunho(null); return; }
    const resumo = celulas.slice(0, 12).map((c) =>
      `${c.concedida ? '+' : '-'} ${rotuloDaChave(c.modulo === 'alcada' ? c.acao : `${c.modulo}.${c.acao}`)}`);
    if (!confirm(
      `Salvar ${celulas.length} alteracao(oes) no perfil ${nome}?\n\n${resumo.join('\n')}`
      + `${celulas.length > 12 ? '\n...' : ''}\n\nAfeta ${usuarios ?? 0} usuario(s) ativo(s) e vale na hora.`,
    )) return;
    salvar.mutate({ papel, celulas }, {
      onSuccess: (n) => { toast.success(`${n} permissao(oes) alterada(s) em ${nome}`); setRascunho(null); },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-superficie p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold uppercase tracking-wide text-slate-900">{nome}</h3>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
              perfil ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500')}>
              {ehAdmin ? 'sistema' : perfil ? 'personalizado' : 'perfil'}
            </span>
            {usuarios !== undefined && (
              <span className="text-[11px] text-slate-400">{usuarios} usuario(s) ativo(s)</span>
            )}
          </div>
          <p className="mt-0.5 text-xs uppercase text-slate-500">
            {ehAdmin ? 'Administrador — acesso total, nao ajustavel'
              : perfil ? `Alcance de ${rotuloPapel(base)}${perfil.descricao ? ` · ${perfil.descricao}` : ''}`
              : (meta && 'nota' in meta ? meta.nota : '')}
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
            <div className="flex flex-wrap gap-2">
              {perfil && (
                <>
                  <Button variant="secondary" onClick={onEditarPerfil}>Renomear</Button>
                  <Button variant="ghost" onClick={apagar} disabled={excluir.isPending}>
                    <Trash2 className="h-4 w-4" /> Excluir
                  </Button>
                </>
              )}
              <Button onClick={() => setRascunho({})}><Pencil className="h-4 w-4" /> Editar permissoes</Button>
            </div>
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
                        onClick={celulaEditavel(m, a, base) ? () => alternar(k) : undefined} />
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

/** A grade inteira: um cartao por perfil. O admin edita e cria perfis (0130). */
export function MatrizPermissoes({ contagem, editavel = false }: {
  contagem?: Record<string, number>; editavel?: boolean;
}) {
  const { data: concessoes, isLoading } = useConcessoesPapeis();
  const { data: perfis } = usePerfisAcesso();
  const bases = basesDosPerfis(perfis);
  const [papel, setPapel] = useState<string>('gestor_regional');
  const [modal, setModal] = useState<{ perfil?: PerfilAcesso } | null>(null);
  const perfilAtual = (perfis ?? []).find((p) => p.id === papel);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
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
        {(perfis ?? []).map((p) => (
          <button key={p.id} type="button" onClick={() => setPapel(p.id)}
            title={`Perfil personalizado · alcance de ${rotuloPapel(p.papel_base)}`}
            className={cn('rounded-full border px-3 py-1 text-xs',
              papel === p.id
                ? 'border-cyan-600 bg-cyan-600 text-white'
                : 'border-cyan-200 bg-cyan-50 text-cyan-800 hover:border-cyan-400')}>
            {p.nome}
            {contagem && <span className="ml-1 opacity-70">({contagem[p.id] ?? 0})</span>}
          </button>
        ))}
        {editavel && (
          <button type="button" onClick={() => setModal({})}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-cyan-500 px-3 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50">
            <Plus className="h-3.5 w-3.5" /> Novo perfil
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">Carregando permissoes...</p>
      ) : (
        <CartaoPerfil key={papel} papel={papel} concessoes={concessoes} bases={bases}
          perfil={perfilAtual} podeEditar={editavel} usuarios={contagem?.[papel]}
          onEditarPerfil={() => perfilAtual && setModal({ perfil: perfilAtual })}
          onExcluido={() => setPapel('gestor_regional')} />
      )}

      <p className="text-xs leading-relaxed text-slate-400">
        <b className="text-slate-500">Como vale:</b> o <b>Ver</b> controla o menu e a abertura da tela; as demais
        acoes controlam os botoes, e <b>Excluir</b>, a 24h, o tratamento do evento, a Auditoria, a tabela de
        precos, fornecedores e comunicados tambem sao conferidos pelo banco. Celula com <b>·</b> nao se aplica ao
        modulo. Modulos com cadeado sao estrutura do sistema (so admin/financeiro). O alcance continua sendo a
        unidade do cadastro do usuario. <b>Perfil personalizado</b> tem grade propria e o alcance do papel de base.
      </p>

      {modal && (
        <ModalPerfil perfil={modal.perfil} perfis={perfis ?? []} onClose={() => setModal(null)}
          onCriado={(id) => { setModal(null); setPapel(id); }} />
      )}
    </div>
  );
}

/** Criar (do zero, copiando a grade de um papel ou de outro perfil) ou renomear um perfil. */
function ModalPerfil({ perfil, perfis, onClose, onCriado }: {
  perfil?: PerfilAcesso; perfis: PerfilAcesso[]; onClose: () => void; onCriado: (id: string) => void;
}) {
  const salvar = useSalvarPerfilAcesso();
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [descricao, setDescricao] = useState(perfil?.descricao ?? '');
  const [base, setBase] = useState(perfil?.papel_base ?? 'consultor_vendas');
  const [copiarDe, setCopiarDe] = useState('');
  const bases = PAPEIS_USUARIO.filter((p) => p.valor !== 'admin');

  function gravar(e: React.FormEvent) {
    e.preventDefault();
    salvar.mutate(
      { id: perfil?.id ?? null, nome, descricao, papelBase: perfil ? null : base, copiarDe: perfil ? null : copiarDe || null },
      {
        onSuccess: (id) => { toast.success(perfil ? 'Perfil salvo' : 'Perfil criado: ajuste a grade e salve'); onCriado(id); },
        onError: (er) => toast.error(er.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title={perfil ? `Renomear ${perfil.nome}` : 'Novo perfil'} tamanho="lg"
      subtitulo={perfil ? undefined : 'O perfil nasce com a grade de outro e voce ajusta modulo por modulo.'}>
      <form onSubmit={gravar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Nome do perfil *">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: ATENDENTE SAC" />
          </FormField>
          <FormField label="Descricao">
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Para que serve" />
          </FormField>
        </div>
        {!perfil && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Alcance (papel de base) *">
              <Select value={base} onChange={(e) => setBase(e.target.value)}>
                {bases.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </Select>
            </FormField>
            <FormField label="Comecar com a grade de">
              <Select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)}>
                <option value="">O proprio papel de base</option>
                {bases.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome} (personalizado)</option>)}
              </Select>
            </FormField>
          </div>
        )}
        {!perfil && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[12px] leading-relaxed text-slate-600">
            O <b>alcance</b> diz o que a pessoa enxerga: <b>Financeiro</b> ve a empresa inteira; <b>Gestor regional</b>,
            <b> Consultor</b>, <b>Auditoria</b>, <b>24h</b> e <b>Eventos</b> veem a unidade do cadastro (Eventos tambem as
            unidades de atuacao); <b>Supervisor</b> ve as unidades marcadas; <b>Cobranca</b>, a cobranca do Brasil ou da
            unidade. O que ela pode FAZER e a grade, que voce ajusta depois. O alcance nao muda depois que houver usuarios no perfil.
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : perfil ? 'Salvar' : 'Criar perfil'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** O que UM papel libera — aparece embaixo do seletor de papel no cadastro. */
export function ResumoDoPapel({ papel }: { papel: string }) {
  const { data: concessoes } = useConcessoesPapeis();
  const { data: perfis } = usePerfisAcesso();
  const chaves = permissoesDoPapel(papel, concessoes, basesDosPerfis(perfis));
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
