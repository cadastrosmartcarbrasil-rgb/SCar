'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, UserCog, Pencil, KeyRound, ShieldAlert, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import {
  useUsuarios,
  useRegionais,
  useCreateUsuario,
  useUpdateUsuario,
  usePerfilAtual,
  type NovoUsuario,
} from '@/hooks/use-config';
import type { PapelUsuario, UsuariosRow } from '@/lib/database.types';

const PAPEIS: { value: PapelUsuario; label: string; nota?: string }[] = [
  { value: 'admin', label: 'Administrador', nota: 'acesso global e gestao da equipe' },
  { value: 'gestor_regional', label: 'Gestor Regional', nota: 'a unidade dele' },
  { value: 'consultor_vendas', label: 'Consultor de Vendas', nota: 'a carteira dele' },
  { value: 'financeiro', label: 'Financeiro', nota: 'acesso global ao dinheiro' },
  { value: 'sinistro', label: 'Sinistro' },
  { value: 'cotador', label: 'Cotador' },
  { value: 'auditoria', label: 'Auditoria', nota: 'autoriza a entrada na base' },
  { value: 'assistencia_24h', label: 'Assistencia 24h' },
];
const papelLabel = (p: PapelUsuario) => PAPEIS.find((x) => x.value === p)?.label ?? p;

type FormEdicao = {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  regional_id: string | null;
  ativo: boolean;
  senha: string;
};

export default function UsuariosPage() {
  const { data: usuarios, isLoading } = useUsuarios();
  const { data: regionais } = useRegionais();
  const { data: perfil } = usePerfilAtual();
  const criar = useCreateUsuario();
  const atualizar = useUpdateUsuario();

  const [busca, setBusca] = useState('');
  const [novoAberto, setNovoAberto] = useState(false);
  const [edicao, setEdicao] = useState<FormEdicao | null>(null);
  const [form, setForm] = useState<NovoUsuario>({
    nome: '', email: '', senha: '', papel: 'consultor_vendas', regional_id: null,
  });

  // Gestao de equipe e do ADMIN. Antes a tela mostrava os campos para todo
  // mundo e o salvamento falhava calado; agora ela diz o que esta acontecendo.
  const podeGerenciar = perfil?.papel === 'admin';

  const nomeRegional = useMemo(
    () => new Map((regionais ?? []).map((r) => [r.id, r.nome])),
    [regionais],
  );

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return usuarios ?? [];
    return (usuarios ?? []).filter(
      (u) => u.nome.toLowerCase().includes(t) || u.email.toLowerCase().includes(t),
    );
  }, [usuarios, busca]);

  function novo() {
    setForm({ nome: '', email: '', senha: '', papel: 'consultor_vendas', regional_id: null });
    setNovoAberto(true);
  }

  function abrirEdicao(u: UsuariosRow) {
    setEdicao({
      id: u.id, nome: u.nome, email: u.email, papel: u.papel,
      regional_id: u.regional_id, ativo: u.ativo, senha: '',
    });
  }

  function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    criar.mutate(form, {
      onSuccess: () => { toast.success('Usuario criado'); setNovoAberto(false); },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!edicao) return;
    if (!edicao.nome.trim()) return toast.error('Informe o nome');
    if (!edicao.email.trim()) return toast.error('Informe o e-mail');
    if (edicao.senha && edicao.senha.length < 6) {
      return toast.error('A senha nova deve ter ao menos 6 caracteres');
    }
    atualizar.mutate(
      {
        id: edicao.id,
        nome: edicao.nome,
        email: edicao.email,
        papel: edicao.papel,
        regional_id: edicao.regional_id,
        ativo: edicao.ativo,
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

  /** Liga/desliga direto na lista — com erro visivel se nao puder. */
  function alternarAtivo(u: UsuariosRow, ativo: boolean) {
    atualizar.mutate(
      { id: u.id, ativo },
      {
        onSuccess: () => toast.success(ativo ? 'Usuario reativado' : 'Usuario desativado'),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Equipe interna: papel (permissoes), unidade, ativacao e redefinicao de senha. O papel
          decide o que a pessoa enxerga — <strong>admin</strong> e <strong>financeiro</strong> tem
          acesso global; os demais ficam na unidade escolhida.
        </p>
        {podeGerenciar && <Button onClick={novo}><Plus className="h-4 w-4" /> Novo usuario</Button>}
      </div>

      {perfil && !podeGerenciar && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Somente o <strong>administrador</strong> cria, edita e redefine senha da equipe. Voce esta
          como <strong>{papelLabel(perfil.papel)}</strong> e ve esta lista em modo leitura.
        </p>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">E-mail</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Unidade</th>
              <th className="px-4 py-2">Ativo</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>
            )}
            {filtrados.map((u) => (
              <tr key={u.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-brand-500" /> {u.nome}
                    {u.id === perfil?.id && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">voce</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{u.email}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {papelLabel(u.papel)}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {u.regional_id ? nomeRegional.get(u.regional_id) ?? '—' : 'Global'}
                </td>
                <td className="px-4 py-2">
                  <input type="checkbox" checked={u.ativo} disabled={!podeGerenciar || atualizar.isPending}
                    onChange={(e) => alternarAtivo(u, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300" />
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
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nenhum usuario encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------ novo */}
      <Modal open={novoAberto} onClose={() => setNovoAberto(false)} title="Novo usuario" tamanho="lg">
        <form onSubmit={criarUsuario} className="space-y-3">
          <FormField label="Nome completo *">
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </FormField>
          <FormField label="E-mail *">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormField label="Senha provisoria * (min. 6 caracteres)">
            <Input type="text" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })}
              placeholder="O usuario podera troca-la depois" />
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Papel *">
              <Select value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value as PapelUsuario })}>
                {PAPEIS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </FormField>
            <FormField label="Unidade">
              <Select value={form.regional_id ?? ''}
                onChange={(e) => setForm({ ...form, regional_id: e.target.value || null })}>
                <option value="">-- Global --</option>
                {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </Select>
            </FormField>
          </div>
          <p className="text-xs text-slate-400">
            O <strong>gestor regional</strong> so funciona com uma unidade escolhida — e ela que
            define o portal da franquia e o que ele enxerga.
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setNovoAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? 'Criando...' : 'Criar usuario'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* --------------------------------------------------------- edicao */}
      <Modal open={!!edicao} onClose={() => setEdicao(null)} tamanho="lg"
        title={edicao ? `Editar ${edicao.nome}` : 'Editar usuario'}
        subtitulo="Nome, e-mail, papel, unidade, ativacao e redefinicao de senha.">
        {edicao && (
          <form onSubmit={salvarEdicao} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Nome completo *">
                <Input value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
              </FormField>
              <FormField label="E-mail (login) *">
                <Input type="email" value={edicao.email}
                  onChange={(e) => setEdicao({ ...edicao, email: e.target.value })} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Papel *">
                <Select value={edicao.papel}
                  onChange={(e) => setEdicao({ ...edicao, papel: e.target.value as PapelUsuario })}>
                  {PAPEIS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </FormField>
              <FormField label="Unidade">
                <Select value={edicao.regional_id ?? ''}
                  onChange={(e) => setEdicao({ ...edicao, regional_id: e.target.value || null })}>
                  <option value="">-- Global --</option>
                  {(regionais ?? []).map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </Select>
              </FormField>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={edicao.ativo}
                onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300" />
              Usuario ativo (desmarcar tira o acesso sem apagar o historico)
            </label>

            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                <KeyRound className="h-4 w-4 text-amber-500" /> Redefinir senha
              </p>
              <FormField label="Senha nova (deixe em branco para nao mexer)">
                <Input type="text" value={edicao.senha} placeholder="min. 6 caracteres"
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
