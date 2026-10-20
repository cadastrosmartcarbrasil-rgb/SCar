'use client';

// PERMISSAO EXTRA POR USUARIO e COPIAR PERFIL (0116). Quem decide e o banco
// (`salvar_permissoes_usuario`, `copiar_perfil_usuario`, so admin); esta tela
// mostra o que o PAPEL ja da, deixa marcar o que vai A MAIS para a pessoa e
// diz, antes de salvar, o que muda.
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Lock, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { rotuloPapel } from '@/lib/usuario';
import {
  ACOES, ALCADAS, MODULOS, ROTULO_ACAO, chaveCelula, celulaAplica, chavePermiteExtra,
  temPermissao, extraVigente, hojeSaoPaulo, mudancasDosExtras, resumoDaCopia, rotuloDaChave,
  basesDosPerfis, chaveDoUsuario,
  type ExtraUsuario,
} from '@/lib/permissoes';
import {
  useConcessoesPapeis, useExtrasUsuarios, useSalvarPermissoesUsuario, useCopiarPerfilUsuario, usePerfisAcesso,
} from '@/hooks/use-permissoes';

/** Nome do perfil do usuario: o personalizado (0130) ou o papel. */
const rotuloDoPerfil = (u: { papel: string; perfil_nome?: string | null }) => u.perfil_nome ?? rotuloPapel(u.papel);
import { cn } from '@/lib/utils';
import type { UsuarioListado } from '@/lib/database.types';

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

/** Selo da lista: quantos extras vigentes a pessoa tem. */
export function SeloExtras({ extras }: { extras?: ExtraUsuario[] }) {
  const hoje = hojeSaoPaulo();
  const n = (extras ?? []).filter((e) => extraVigente(e.expira_em, hoje)).length;
  if (!n) return null;
  return (
    <span title="Permissões concedidas a esta pessoa além do papel"
      className="ml-1 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-800">
      +{n} extra{n > 1 ? 's' : ''}
    </span>
  );
}

// --------------------------------------------------------------------------
// Permissoes extras
// --------------------------------------------------------------------------
export function ModalPermissoesExtras({ usuario, onClose }: { usuario: UsuarioListado | null; onClose: () => void }) {
  const { data: concessoes } = useConcessoesPapeis();
  const { data: perfis } = usePerfisAcesso();
  const { data: extrasPorUsuario, isLoading } = useExtrasUsuarios();
  const salvar = useSalvarPermissoesUsuario();
  const hoje = hojeSaoPaulo();

  const gravados = useMemo(
    () => (usuario ? extrasPorUsuario?.[usuario.id] ?? [] : []),
    [usuario, extrasPorUsuario],
  );
  const [marcados, setMarcados] = useState<Record<string, string | null>>({});
  const [validade, setValidade] = useState('');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    const m: Record<string, string | null> = {};
    for (const e of gravados) m[e.chave] = e.expira_em;
    setMarcados(m);
    setValidade('');
    setMotivo('');
  }, [gravados, usuario?.id]);

  if (!usuario) return null;
  const papel = usuario.papel;
  const ehAdmin = papel === 'admin';
  const doPapel = (k: string) => temPermissao(chaveDoUsuario(usuario), k, concessoes, basesDosPerfis(perfis));
  const alternar = (k: string) =>
    setMarcados((m) => {
      const n = { ...m };
      if (k in n) delete n[k];
      else n[k] = validade || null;
      return n;
    });

  const { entram, saem } = mudancasDosExtras(gravados.map((e) => e.chave), Object.keys(marcados));
  const prazoMudou = gravados.some((e) => e.chave in marcados && (marcados[e.chave] ?? null) !== (e.expira_em ?? null));
  const mudou = entram.length > 0 || saem.length > 0 || prazoMudou;

  function gravar() {
    if (!usuario) return;
    if (entram.length > 0 && !motivo.trim()) return toast.error('Informe o motivo da permissão extra.');
    if (validade && validade < hoje) return toast.error('A validade já passou.');
    const linhas = [
      ...entram.map((k) => `+ ${rotuloDaChave(k)}${marcados[k] ? ` (ate ${dataBR(marcados[k])})` : ''}`),
      ...saem.map((k) => `- ${rotuloDaChave(k)}`),
    ];
    if (!confirm(`Salvar as permissões extras de ${usuario.nome}?\n\n${linhas.join('\n') || 'Ajuste de validade'}\n\nVale na hora, só para esta pessoa.`)) return;
    salvar.mutate(
      { usuarioId: usuario.id, extras: Object.entries(marcados).map(([chave, expira_em]) => ({ chave, expira_em })), motivo },
      {
        onSuccess: (n) => { toast.success(`${n} alteração(oes) nas permissões de ${usuario.nome}`); onClose(); },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const Celula = ({ k, aplica }: { k: string; aplica: boolean }) => {
    if (!aplica) return <span className="text-slate-200" aria-hidden>·</span>;
    if (doPapel(k)) {
      return <span title="Já vem do papel"><Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Pelo papel" /></span>;
    }
    if (!chavePermiteExtra(k) || ehAdmin) return <Lock className="mx-auto h-3 w-3 text-slate-300" aria-label="Não ajustável" />;
    const on = k in marcados;
    const venc = on && marcados[k] && !extraVigente(marcados[k], hoje);
    return (
      <button type="button" onClick={() => alternar(k)} aria-pressed={on}
        title={on ? `Extra${marcados[k] ? ` até ${dataBR(marcados[k])}` : ''} — clique para retirar` : 'Conceder como extra'}
        className={cn('inline-flex h-6 w-6 items-center justify-center rounded border transition',
          on ? (venc ? 'border-amber-500 bg-amber-400 text-white' : 'border-cyan-600 bg-cyan-600 text-white')
            : 'border-slate-300 bg-superficie hover:border-cyan-500')}>
        {on && <span className="text-[11px] font-bold">+</span>}
      </button>
    );
  };

  return (
    <Modal open={!!usuario} onClose={onClose} tamanho="xl"
      title={`Permissões extras — ${usuario.nome}`}
      subtitulo={`Perfil ${rotuloDoPerfil(usuario)}. O que vem do papel aparece com ✓; marque o que esta pessoa recebe A MAIS.`}>
      {ehAdmin ? (
        <p className="text-sm text-slate-600">O administrador já tem todas as permissões.</p>
      ) : isLoading ? (
        <p className="py-6 text-center text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Motivo (obrigatório ao conceder)" className="sm:col-span-2">
              <Input value={motivo} caixa="original" placeholder="Ex.: cobre o gestor nas férias"
                onChange={(e) => setMotivo(e.target.value)} />
            </FormField>
            <FormField label="Válido até (opcional)">
              <Input type="date" value={validade} min={hoje} onChange={(e) => setValidade(e.target.value)} />
              <p className="mt-1 text-[11px] text-slate-500">Vale para o que você marcar agora. Vencido, deixa de valer sozinho.</p>
            </FormField>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">Módulo</th>
                  {ACOES.map((a) => <th key={a} className="px-2 py-2 text-center">{ROTULO_ACAO[a]}</th>)}
                </tr>
              </thead>
              <tbody>
                {MODULOS.map((m) => (
                  <tr key={m.chave} className="border-t border-slate-100">
                    <td className="sticky left-0 bg-superficie px-3 py-1.5 text-xs font-medium uppercase text-slate-700">
                      {m.rotulo}
                    </td>
                    {ACOES.map((a) => (
                      <td key={a} className="px-2 py-1.5 text-center">
                        <Celula k={chaveCelula(m.chave, a)} aplica={celulaAplica(m, a)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Alçadas especiais</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {ALCADAS.map((al) => (
                <div key={al.chave} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="mt-0.5 shrink-0"><Celula k={al.chave} aplica /></span>
                  {al.rotulo}
                </div>
              ))}
            </div>
          </div>

          {gravados.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Extras gravados</p>
              <ul className="space-y-1">
                {gravados.map((e) => (
                  <li key={e.chave} className="text-[12px] text-slate-600">
                    <b className="font-medium text-slate-700">{rotuloDaChave(e.chave)}</b>
                    {e.expira_em
                      ? <> · até {dataBR(e.expira_em)}{!extraVigente(e.expira_em, hoje) && <span className="text-amber-700"> (vencido)</span>}</>
                      : ' · sem prazo'}
                    {e.motivo && <span className="text-slate-400"> · {e.motivo}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs leading-relaxed text-slate-400">
            O extra <b className="text-slate-500">só soma</b>: para tirar algo de alguém, troque o papel. Ele vale
            para esta pessoa e obedece a mesma conferência do banco que o perfil (inclusive Excluir). Módulos com
            cadeado são estrutura do sistema. Toda concessão fica registrada (quem, quando, motivo).
          </p>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="button" disabled={!mudou || salvar.isPending} onClick={gravar}>
              {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar extras
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// --------------------------------------------------------------------------
// Copiar perfil de outro usuario
// --------------------------------------------------------------------------
export function ModalCopiarPerfil({ destino, usuarios, regionalNome, onClose }: {
  destino: UsuarioListado | null;
  usuarios: UsuarioListado[];
  regionalNome: (id: string | null) => string;
  onClose: () => void;
}) {
  const { data: concessoes } = useConcessoesPapeis();
  const { data: extras } = useExtrasUsuarios();
  const { data: perfis } = usePerfisAcesso();
  const copiar = useCopiarPerfilUsuario();
  const [origemId, setOrigemId] = useState('');
  const [copiarUnidade, setCopiarUnidade] = useState(true);
  const [motivo, setMotivo] = useState('');
  const hoje = hojeSaoPaulo();

  useEffect(() => { setOrigemId(''); setCopiarUnidade(true); setMotivo(''); }, [destino?.id]);

  if (!destino) return null;
  const origem = usuarios.find((u) => u.id === origemId);
  const opcoes = usuarios.filter((u) => u.id !== destino.id).sort((a, b) => a.nome.localeCompare(b.nome));
  const resumo = origem && resumoDaCopia(
    { papel: chaveDoUsuario(origem), regional_id: origem.regional_id, extras: extras?.[origem.id] ?? [] },
    { papel: chaveDoUsuario(destino), regional_id: destino.regional_id, extras: extras?.[destino.id] ?? [] },
    concessoes, copiarUnidade, hoje, basesDosPerfis(perfis),
  );
  const unidadeFinal = origem ? (copiarUnidade ? origem.regional_id : destino.regional_id) : null;

  function confirmar() {
    if (!origem || !destino || !resumo) return;
    const linhas = [
      resumo.trocaPapel ? `Perfil: ${rotuloDoPerfil(destino)} -> ${rotuloDoPerfil(origem)}` : `Perfil: ${rotuloDoPerfil(origem)} (igual)`,
      resumo.trocaUnidade ? `Unidade: ${regionalNome(destino.regional_id)} -> ${regionalNome(origem.regional_id)}` : null,
      `Extras copiados: ${resumo.extrasCopiados}`,
      resumo.ganha.length ? `Ganha ${resumo.ganha.length} permissao(oes)` : null,
      resumo.perde.length ? `Perde ${resumo.perde.length} permissao(oes)` : null,
    ].filter(Boolean);
    if (!confirm(`Copiar o perfil de ${origem.nome} para ${destino.nome}?\n\n${linhas.join('\n')}\n\nOs extras atuais de ${destino.nome} são substituídos. Vale na hora.`)) return;
    copiar.mutate({ origemId: origem.id, destinoId: destino.id, copiarUnidade, motivo }, {
      onSuccess: (r) => {
        if (r?.aviso) toast.warning(r.aviso);
        else toast.success(`${destino.nome} agora tem o perfil de ${origem.nome}`);
        onClose();
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <Modal open={!!destino} onClose={onClose} tamanho="lg"
      title={`Copiar perfil para ${destino.nome}`}
      subtitulo="O destino passa a ter o mesmo acesso da origem: papel, permissões extras, unidades de supervisor e, se marcado, a unidade.">
      <div className="space-y-3">
        <FormField label="Copiar o perfil de *">
          <Select value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
            <option value="">-- escolha o usuário --</option>
            {opcoes.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} · {rotuloDoPerfil(u)}{u.regional_nome ? ` · ${u.regional_nome}` : ''}{!u.ativo ? ' (inativo)' : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={copiarUnidade} onChange={(e) => setCopiarUnidade(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>
            Copiar também a unidade
            <span className="block text-[11px] text-slate-500">
              Desmarcado, {destino.nome} continua em {regionalNome(destino.regional_id)}.
            </span>
          </span>
        </label>
        <FormField label="Motivo (opcional, vai para a trilha)">
          <Input value={motivo} caixa="original" placeholder="Ex.: substitui a supervisora de Natal"
            onChange={(e) => setMotivo(e.target.value)} />
        </FormField>

        {origem && resumo && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-[12.5px] text-slate-600">
            <p>
              <b className="text-slate-700">Papel:</b>{' '}
              {resumo.trocaPapel
                ? <>{rotuloDoPerfil(destino)} → <b>{rotuloDoPerfil(origem)}</b></>
                : <>{rotuloDoPerfil(origem)} (o mesmo)</>}
              {' · '}<b className="text-slate-700">Unidade:</b> {regionalNome(unidadeFinal)}
              {' · '}<b className="text-slate-700">Extras copiados:</b> {resumo.extrasCopiados}
            </p>
            {origem.papel === 'supervisor' && <p>As unidades de supervisor de {origem.nome} também são copiadas.</p>}
            {origem.papel === 'admin' && (
              <p className="font-medium text-amber-700">Atenção: {destino.nome} vira ADMINISTRADOR, com acesso total.</p>
            )}
            {origem.papel === 'gestor_regional' && !unidadeFinal && (
              <p className="text-amber-700">O gestor regional só funciona com uma unidade: marque &quot;copiar a unidade&quot; ou ajuste depois.</p>
            )}
            {resumo.ganha.length > 0 && (
              <p><b className="text-emerald-700">Ganha ({resumo.ganha.length}):</b> {resumo.ganha.join(' · ')}</p>
            )}
            {resumo.perde.length > 0 && (
              <p><b className="text-red-700">Perde ({resumo.perde.length}):</b> {resumo.perde.join(' · ')}</p>
            )}
            {resumo.ganha.length === 0 && resumo.perde.length === 0 && <p>O acesso efetivo não muda.</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={!origem || copiar.isPending} onClick={confirmar}>
            {copiar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Copiar perfil
          </Button>
        </div>
      </div>
    </Modal>
  );
}
