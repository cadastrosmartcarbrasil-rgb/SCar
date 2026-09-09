'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, UserCog, Pencil, KeyRound, ShieldAlert, Search, Loader2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import {
  useUsuariosPainel,
  useRegionais,
  useCreateUsuario,
  useUpdateUsuario,
  usePerfilAtual,
  type NovoUsuario,
} from '@/hooks/use-config';
import { opcoesParaEscolher } from '@/lib/regional';
import {
  PAPEIS_USUARIO,
  rotuloPapel,
  exigeUnidade,
  validarFichaUsuario,
  situacaoUsuario,
  tempoDeCasa,
  avisoDeDesativacao,
} from '@/lib/usuario';
import type { PapelUsuario, UsuarioListado } from '@/lib/database.types';

type FormEdicao = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  documento: string;
  cargo: string;
  papel: PapelUsuario;
  regional_id: string | null;
  ativo: boolean;
  data_inicio: string;
  data_desligamento: string;
  observacoes: string;
  senha: string;
};

const VAZIO: NovoUsuario = {
  nome: '', email: '', senha: '', papel: 'consultor_vendas', regional_id: null,
  telefone: '', documento: '', cargo: '', data_inicio: '', observacoes: '',
};

export default function UsuariosPage() {
  const { data: usuarios, isLoading } = useUsuariosPainel(true);
  const { data: regionais } = useRegionais();
  const { data: perfil } = usePerfilAtual();
  const criar = useCreateUsuario();
  const atualizar = useUpdateUsuario();

  const [busca, setBusca] = useState('');
  const [verInativos, setVerInativos] = useState(true);
  const [novoAberto, setNovoAberto] = useState(false);
  const [edicao, setEdicao] = useState<FormEdicao | null>(null);
  const [form, setForm] = useState<NovoUsuario>(VAZIO);

  // Gestao de equipe e do ADMIN. Antes a tela mostrava os campos para todo
  // mundo e o salvamento falhava calado; agora ela diz o que esta acontecendo.
  const podeGerenciar = perfil?.papel === 'admin';

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (usuarios ?? [])
      .filter((u) => verInativos || u.ativo)
      .filter((u) =>
        !t ||
        u.nome.toLowerCase().includes(t) ||
        u.email.toLowerCase().includes(t) ||
        (u.cargo ?? '').toLowerCase().includes(t) ||
        (u.telefone ?? '').includes(t),
      );
  }, [usuarios, busca, verInativos]);

  const ativos = (usuarios ?? []).filter((u) => u.ativo).length;
  const inativos = (usuarios ?? []).length - ativos;

  function novo() {
    setForm(VAZIO);
    setNovoAberto(true);
  }

  function abrirEdicao(u: UsuarioListado) {
    setEdicao({
      id: u.id, nome: u.nome, email: u.email,
      telefone: u.telefone ?? '', documento: u.documento ?? '', cargo: u.cargo ?? '',
      papel: u.papel, regional_id: u.regional_id, ativo: u.ativo,
      data_inicio: u.data_inicio ?? '', data_desligamento: u.data_desligamento ?? '',
      observacoes: u.observacoes ?? '', senha: '',
    });
  }

  function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    const erros = validarFichaUsuario(form);
    if (erros.length) return toast.error(erros[0]);
    if (!form.senha || form.senha.length < 6) {
      return toast.error('A senha provisoria deve ter ao menos 6 caracteres');
    }
    criar.mutate(form, {
      onSuccess: (r: { aviso?: string }) => {
        if (r?.aviso) toast.warning(r.aviso);
        else toast.success('Usuario criado');
        setNovoAberto(false);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!edicao) return;
    const erros = validarFichaUsuario(edicao);
    if (erros.length) return toast.error(erros[0]);
    if (edicao.senha && edicao.senha.length < 6) {
      return toast.error('A senha nova deve ter ao menos 6 caracteres');
    }
    atualizar.mutate(
      {
        id: edicao.id,
        nome: edicao.nome,
        email: edicao.email,
        telefone: edicao.telefone,
        documento: edicao.documento,
        cargo: edicao.cargo,
        papel: edicao.papel,
        regional_id: edicao.regional_id,
        ativo: edicao.ativo,
        data_inicio: edicao.data_inicio || null,
        data_desligamento: edicao.data_desligamento || null,
        observacoes: edicao.observacoes,
        senha: edicao.senha || undefined,
      },
      {
        onSuccess: (r) => {
          toast.success(r.senha_redefinida ? 'Usuario salvo e senha redefinida' : 'Usuario salvo');
          setEdicao(null);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  /**
   * Liga/desliga direto na lista. Desde a 0068 isto CORTA O ACESSO de verdade
   * (`is_staff()`/`auth_papel()` exigem `ativo`), entao a confirmacao diz o que
   * mais cai junto — a unidade que fica sem responsavel, o portal do vendedor.
   */
  function alternarAtivo(u: UsuarioListado, ativo: boolean) {
    if (!ativo && !confirm(avisoDeDesativacao(u))) return;
    atualizar.mutate(
      { id: u.id, ativo },
      {
        onSuccess: () => toast.success(ativo ? 'Acesso reativado' : 'Acesso cortado'),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="max-w-2xl text-sm text-slate-500">
            Equipe interna: ficha, papel (permissoes), unidade, acesso e redefinicao de senha. O
            papel decide o que a pessoa enxerga — <strong>admin</strong> e <strong>financeiro</strong>{' '}
            tem acesso global; os demais ficam na unidade escolhida.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            <b className="text-slate-500">{ativos}</b> com acesso
            {inativos > 0 && <> · <b className="text-slate-500">{inativos}</b> desativado(s)</>}
          </p>
        </div>
        {podeGerenciar && <Button onClick={novo}><Plus className="h-4 w-4" /> Novo usuario</Button>}
      </div>

      {perfil && !podeGerenciar && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Somente o <strong>administrador</strong> cria, edita e redefine senha da equipe. Voce esta
          como <strong>{rotuloPapel(perfil.papel)}</strong> e ve esta lista em modo leitura.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail, cargo ou telefone"
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={verInativos} className="rounded border-slate-300"
            onChange={(e) => setVerInativos(e.target.checked)} />
          Mostrar desativados
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Pessoa</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Unidade</th>
              <th className="px-4 py-2">Desde</th>
              <th className="px-4 py-2">Acesso</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>
            )}
            {filtrados.map((u) => (
              <tr key={u.id} className={`border-b border-slate-50 last:border-0 ${u.ativo ? '' : 'bg-slate-50/60'}`}>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2 font-medium text-slate-800">
                    <UserCog className={`h-4 w-4 ${u.ativo ? 'text-brand-500' : 'text-slate-400'}`} />
                    <span className={u.ativo ? '' : 'text-slate-500'}>{u.nome}</span>
                    {u.id === perfil?.id && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">voce</span>
                    )}
                    {u.vendedor_ativo && (
                      <span title={`Tambem e vendedor (hotlink /v/${u.vendedor_codigo ?? ''})`}
                        className="inline-flex items-center gap-0.5 rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                        <Link2 className="h-3 w-3" /> vendedor
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {u.cargo || 'Cargo nao informado'}
                    {u.responsavel_por > 0 && (
                      <> · responde por {u.responsavel_por} unidade{u.responsavel_por > 1 ? 's' : ''}</>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  <span className="block">{u.email}</span>
                  {u.telefone && <span className="tnum block text-xs text-slate-400">{u.telefone}</span>}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {rotuloPapel(u.papel)}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{u.regional_nome ?? 'Global'}</td>
                <td className="px-4 py-2 text-slate-600">
                  {u.data_inicio ? (
                    <>
                      <span className="tnum block">{u.data_inicio.slice(0, 10).split('-').reverse().join('/')}</span>
                      <span className="block text-xs text-slate-400">{tempoDeCasa(u.data_inicio)}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <label className="flex items-center gap-2" title={situacaoUsuario(u)}>
                    <input type="checkbox" checked={u.ativo} disabled={!podeGerenciar || atualizar.isPending}
                      onChange={(e) => alternarAtivo(u, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300" />
                    {!u.ativo && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                        sem acesso
                      </span>
                    )}
                  </label>
                </td>
                <td className="px-4 py-2 text-right">
                  {podeGerenciar && (
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => abrirEdicao(u)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && filtrados.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Nenhum usuario encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        <b className="text-slate-500">Desativar corta o acesso na hora</b> — a pessoa deixa de
        entrar e deixa de ser reconhecida como equipe pela seguranca do banco. O historico do que
        ela ja fez continua inteiro. O sistema recusa desativar o <b>ultimo administrador ativo</b>.
      </p>

      {/* ------------------------------------------------------------ novo */}
      <Modal open={novoAberto} onClose={() => setNovoAberto(false)} title="Novo usuario" tamanho="xl">
        <form onSubmit={criarUsuario} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Nome completo *" className="sm:col-span-2">
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </FormField>
            <FormField label="CPF">
              <Input value={form.documento ?? ''} caixa="original"
                onChange={(e) => setForm({ ...form, documento: e.target.value })}
                placeholder="000.000.000-00" />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="E-mail (login) *">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormField>
            <FormField label="Telefone">
              <Input value={form.telefone ?? ''} placeholder="(65) 99999-0000"
                onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </FormField>
            <FormField label="Data de inicio">
              <Input type="date" value={form.data_inicio ?? ''}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Senha provisoria * (min. 6 caracteres)">
            <Input type="text" value={form.senha} caixa="original"
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              placeholder="O usuario podera troca-la depois" />
          </FormField>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              Funcao e permissao
            </p>
            <p className="mb-2 mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
              <b>Cargo</b> e a funcao na empresa (aparece nas telas de equipe). <b>Papel</b> e o que
              o sistema deixa fazer — sao coisas diferentes de proposito.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Cargo">
                <Input value={form.cargo ?? ''} placeholder="Ex.: Supervisora de Atendimento"
                  onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
              </FormField>
              <FormField label="Papel *">
                <Select value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value as PapelUsuario })}>
                  {PAPEIS_USUARIO.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                </Select>
              </FormField>
              <FormField label={exigeUnidade(form.papel) ? 'Unidade *' : 'Unidade'}>
                <Select value={form.regional_id ?? ''}
                  onChange={(e) => setForm({ ...form, regional_id: e.target.value || null })}>
                  <option value="">-- Global --</option>
                  {opcoesParaEscolher(regionais, form.regional_id).map((r) => (
                    <option key={r.id} value={r.id}>{r.nome}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            {exigeUnidade(form.papel) && !form.regional_id && (
              <p className="mt-1.5 text-[11px] text-amber-700">
                O <b>gestor regional</b> so funciona com uma unidade escolhida — e ela que define o
                portal da franquia e o que ele enxerga.
              </p>
            )}
          </div>

          <FormField label="Observacoes">
            <textarea rows={2} value={form.observacoes ?? ''}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Ex.: contratada como PJ, atende de segunda a sexta" />
          </FormField>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setNovoAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? 'Criando...' : 'Criar usuario'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* --------------------------------------------------------- edicao */}
      <Modal open={!!edicao} onClose={() => setEdicao(null)} tamanho="xl"
        title={edicao ? `Editar ${edicao.nome}` : 'Editar usuario'}
        subtitulo="Ficha, papel, unidade, acesso e redefinicao de senha.">
        {edicao && (
          <form onSubmit={salvarEdicao} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Nome completo *" className="sm:col-span-2">
                <Input value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
              </FormField>
              <FormField label="CPF">
                <Input value={edicao.documento} caixa="original" placeholder="000.000.000-00"
                  onChange={(e) => setEdicao({ ...edicao, documento: e.target.value })} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="E-mail (login) *">
                <Input type="email" value={edicao.email}
                  onChange={(e) => setEdicao({ ...edicao, email: e.target.value })} />
              </FormField>
              <FormField label="Telefone">
                <Input value={edicao.telefone} placeholder="(65) 99999-0000"
                  onChange={(e) => setEdicao({ ...edicao, telefone: e.target.value })} />
              </FormField>
              <FormField label="Cargo">
                <Input value={edicao.cargo} placeholder="Ex.: Supervisora de Atendimento"
                  onChange={(e) => setEdicao({ ...edicao, cargo: e.target.value })} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Papel *">
                <Select value={edicao.papel}
                  onChange={(e) => setEdicao({ ...edicao, papel: e.target.value as PapelUsuario })}>
                  {PAPEIS_USUARIO.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                </Select>
              </FormField>
              <FormField label={exigeUnidade(edicao.papel) ? 'Unidade *' : 'Unidade'}>
                <Select value={edicao.regional_id ?? ''}
                  onChange={(e) => setEdicao({ ...edicao, regional_id: e.target.value || null })}>
                  <option value="">-- Global --</option>
                  {opcoesParaEscolher(regionais, edicao.regional_id).map((r) => (
                    <option key={r.id} value={r.id}>{r.nome}</option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                Periodo e acesso
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Data de inicio">
                  <Input type="date" value={edicao.data_inicio}
                    onChange={(e) => setEdicao({ ...edicao, data_inicio: e.target.value })} />
                </FormField>
                <FormField label="Data de desligamento">
                  <Input type="date" value={edicao.data_desligamento}
                    onChange={(e) => setEdicao({ ...edicao, data_desligamento: e.target.value })} />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Preenchida sozinha ao desativar e limpa ao reativar.
                  </p>
                </FormField>
              </div>
              <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={edicao.ativo} className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })} />
                <span>
                  Acesso ativo
                  <span className="block text-[11px] leading-relaxed text-slate-500">
                    Desmarcar <b>corta o acesso na hora</b>: a pessoa deixa de entrar e de ser
                    reconhecida como equipe pela seguranca do banco. O historico fica intacto.
                  </span>
                </span>
              </label>
            </div>

            <FormField label="Observacoes">
              <textarea rows={2} value={edicao.observacoes}
                onChange={(e) => setEdicao({ ...edicao, observacoes: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </FormField>

            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <KeyRound className="h-4 w-4 text-amber-500" /> Redefinir senha
              </p>
              <FormField label="Senha nova (deixe em branco para nao mexer)">
                <Input type="text" value={edicao.senha} placeholder="min. 6 caracteres" caixa="original"
                  onChange={(e) => setEdicao({ ...edicao, senha: e.target.value })} />
              </FormField>
              <p className="text-xs text-slate-400">
                A senha e trocada na hora e a pessoa entra com ela no proximo acesso. Avise por um
                canal separado — nada e enviado por e-mail daqui.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button type="button" variant="secondary" onClick={() => setEdicao(null)}>Cancelar</Button>
              <Button type="submit" disabled={atualizar.isPending}>
                {atualizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
