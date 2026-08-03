'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, UserRound, Search, Check, X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import {
  useAssociados,
  useSaveAssociado,
  useExcluirAssociado,
  type EnderecoAssociado,
} from '@/hooks/use-associados';
import {
  validarDocumento,
  formatarDocumento,
  calcularIdade,
  soDigitos,
} from '@/lib/documento';
import { buscarCep } from '@/lib/cep';
import type { ClientesRow, StatusCliente, TipoPessoa } from '@/lib/database.types';

const SITUACOES: { value: StatusCliente; label: string; cor: string }[] = [
  { value: 'ativo', label: 'Ativo', cor: 'bg-emerald-50 text-emerald-700' },
  { value: 'inativo', label: 'Inativo', cor: 'bg-slate-100 text-slate-600' },
  { value: 'suspenso', label: 'Suspenso', cor: 'bg-amber-50 text-amber-700' },
  { value: 'excluido', label: 'Excluido', cor: 'bg-rose-50 text-rose-700' },
  { value: 'inadimplente', label: 'Inadimplente', cor: 'bg-orange-50 text-orange-700' },
  { value: 'cancelado', label: 'Cancelado', cor: 'bg-slate-100 text-slate-500' },
];
const situacaoMeta = (s: StatusCliente) => SITUACOES.find((x) => x.value === s) ?? SITUACOES[0];

type FormAssociado = Omit<Partial<ClientesRow>, 'endereco'> & { endereco: EnderecoAssociado };

const vazio = (): FormAssociado => ({
  tipo_pessoa: 'PF',
  status: 'ativo',
  nome_razao_social: '',
  cpf_cnpj: '',
  endereco: {},
});

export default function AssociadosPage() {
  const { data: associados, isLoading } = useAssociados();
  const { data: regionais } = useRegionais();
  const salvar = useSaveAssociado();
  const excluir = useExcluirAssociado();

  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormAssociado>(vazio());
  const [buscandoCep, setBuscandoCep] = useState(false);

  const nomesRegionais = useMemo(
    () => new Map((regionais ?? []).map((r) => [r.id, r.nome])),
    [regionais],
  );

  const filtrados = useMemo(() => {
    const t = soDigitos(busca) || busca.toLowerCase();
    return (associados ?? []).filter(
      (a) =>
        a.nome_razao_social.toLowerCase().includes(busca.toLowerCase()) ||
        (a.cpf_cnpj ?? '').includes(soDigitos(busca)) ||
        (a.matricula ?? '').includes(t),
    );
  }, [associados, busca]);

  const tipo = (form.tipo_pessoa ?? 'PF') as TipoPessoa;
  const docValido = form.cpf_cnpj ? validarDocumento(form.cpf_cnpj, tipo) : null;
  const idade = calcularIdade(form.data_nascimento);
  const end = form.endereco ?? {};
  const setEnd = (patch: Partial<EnderecoAssociado>) =>
    setForm((p) => ({ ...p, endereco: { ...p.endereco, ...patch } }));

  function novo() {
    setForm(vazio());
    setAberto(true);
  }
  function editar(a: ClientesRow) {
    setForm({ ...a, endereco: (a.endereco as EnderecoAssociado) ?? {} });
    setAberto(true);
  }

  async function onCepBlur() {
    if (soDigitos(end.cep ?? '').length !== 8) return;
    setBuscandoCep(true);
    const res = await buscarCep(end.cep ?? '');
    setBuscandoCep(false);
    if (!res) return toast.error('CEP nao encontrado');
    setEnd({
      logradouro: res.logradouro || end.logradouro,
      bairro: res.bairro || end.bairro,
      cidade: res.cidade || end.cidade,
      estado: res.estado || end.estado,
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome_razao_social) return toast.error('Informe o nome/razao social');
    if (!validarDocumento(form.cpf_cnpj ?? '', tipo)) {
      return toast.error(tipo === 'PF' ? 'CPF invalido' : 'CNPJ invalido');
    }
    salvar.mutate(form, {
      onSuccess: () => {
        toast.success('Associado salvo');
        setAberto(false);
      },
      onError: (err) => {
        const msg = (err as Error).message;
        toast.error(msg.includes('cpf_cnpj') ? 'CPF/CNPJ ja cadastrado' : msg);
      },
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Associados</h1>
          <p className="text-sm text-slate-500">Cadastro de associados (mutuarios) da protecao veicular.</p>
        </div>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Novo Associado
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, CPF/CNPJ ou matricula"
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Matricula</th>
              <th className="px-4 py-2">Nome / Razao Social</th>
              <th className="px-4 py-2">CPF / CNPJ</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Regional</th>
              <th className="px-4 py-2">Situacao</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {filtrados.map((a) => {
              const meta = situacaoMeta(a.status);
              return (
                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-brand-600">{a.matricula ?? '-'}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-brand-500" /> {a.nome_razao_social}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {a.cpf_cnpj ? formatarDocumento(a.cpf_cnpj, a.tipo_pessoa) : '-'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{a.celular || a.telefone || a.email || '-'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {a.regional_id ? nomesRegionais.get(a.regional_id) ?? '-' : '-'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${meta.cor}`}>{meta.label}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => editar(a)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir o associado "${a.nome_razao_social}"?`))
                            excluir.mutate(a.id, {
                              onSuccess: () => toast.success('Associado excluido'),
                              onError: (e) => toast.error((e as Error).message),
                            });
                        }}
                        className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Nenhum associado encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title={form.id ? `Editar Associado ${form.matricula ?? ''}` : 'Novo Associado'}
      >
        <form onSubmit={submit} className="space-y-4">
          {/* Situacao + tipo */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Situacao">
              <Select
                value={form.status ?? 'ativo'}
                onChange={(e) => setForm({ ...form, status: e.target.value as StatusCliente })}
              >
                {SITUACOES.filter((s) => !['inadimplente', 'cancelado'].includes(s.value)).map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Tipo de pessoa">
              <Select
                value={tipo}
                onChange={(e) => setForm({ ...form, tipo_pessoa: e.target.value as TipoPessoa })}
              >
                <option value="PF">Pessoa Fisica (PF)</option>
                <option value="PJ">Pessoa Juridica (PJ)</option>
              </Select>
            </FormField>
          </div>

          <FormField label={tipo === 'PF' ? 'Nome completo *' : 'Razao social *'}>
            <Input
              value={form.nome_razao_social ?? ''}
              onChange={(e) => setForm({ ...form, nome_razao_social: e.target.value })}
            />
          </FormField>

          {/* Documento com validacao ao vivo */}
          <FormField label={tipo === 'PF' ? 'CPF *' : 'CNPJ *'}>
            <div className="relative">
              <Input
                value={form.cpf_cnpj ? formatarDocumento(form.cpf_cnpj, tipo) : ''}
                onChange={(e) => setForm({ ...form, cpf_cnpj: soDigitos(e.target.value) })}
                placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                className={
                  docValido === false ? 'border-rose-400 pr-9' : docValido ? 'border-emerald-400 pr-9' : 'pr-9'
                }
              />
              {docValido === true && <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-emerald-500" />}
              {docValido === false && <X className="absolute right-2.5 top-2.5 h-4 w-4 text-rose-500" />}
            </div>
            {docValido === false && (
              <p className="mt-1 text-xs text-rose-500">{tipo === 'PF' ? 'CPF' : 'CNPJ'} invalido</p>
            )}
          </FormField>

          {tipo === 'PF' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Data de nascimento" className="col-span-2">
                  <Input
                    type="date"
                    value={form.data_nascimento ?? ''}
                    onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
                  />
                </FormField>
                <FormField label="Idade">
                  <Input value={idade != null ? `${idade} anos` : '-'} disabled />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Sexo">
                  <Select value={form.sexo ?? ''} onChange={(e) => setForm({ ...form, sexo: e.target.value })}>
                    <option value="">-- Selecione --</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outro">Outro</option>
                  </Select>
                </FormField>
                <FormField label="RG">
                  <Input value={form.rg_ie ?? ''} onChange={(e) => setForm({ ...form, rg_ie: e.target.value })} />
                </FormField>
              </div>
              <FormField label="Nome da mae">
                <Input value={form.nome_mae ?? ''} onChange={(e) => setForm({ ...form, nome_mae: e.target.value })} />
              </FormField>
            </>
          )}
          {tipo === 'PJ' && (
            <FormField label="Inscricao Estadual">
              <Input value={form.rg_ie ?? ''} onChange={(e) => setForm({ ...form, rg_ie: e.target.value })} />
            </FormField>
          )}

          {/* Contatos */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="E-mail principal">
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
            <FormField label="E-mail adicional">
              <Input
                type="email"
                value={form.email_adicional ?? ''}
                onChange={(e) => setForm({ ...form, email_adicional: e.target.value })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Telefone">
              <Input value={form.telefone ?? ''} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </FormField>
            <FormField label="Celular">
              <Input value={form.celular ?? ''} onChange={(e) => setForm({ ...form, celular: e.target.value })} />
            </FormField>
          </div>

          <FormField label="Regional vinculada">
            <Select
              value={form.regional_id ?? ''}
              onChange={(e) => setForm({ ...form, regional_id: e.target.value || null })}
            >
              <option value="">-- Selecione --</option>
              {(regionais ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Select>
          </FormField>

          {/* Endereco */}
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <MapPin className="h-4 w-4" /> Endereco
            </p>
            <div className="grid grid-cols-4 gap-3">
              <FormField label="CEP">
                <Input
                  value={end.cep ?? ''}
                  onChange={(e) => setEnd({ cep: e.target.value })}
                  onBlur={onCepBlur}
                  placeholder={buscandoCep ? 'Buscando...' : '00000-000'}
                />
              </FormField>
              <FormField label="Rua / Logradouro" className="col-span-3">
                <Input value={end.logradouro ?? ''} onChange={(e) => setEnd({ logradouro: e.target.value })} />
              </FormField>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              <FormField label="Numero">
                <Input value={end.numero ?? ''} onChange={(e) => setEnd({ numero: e.target.value })} />
              </FormField>
              <FormField label="Complemento" className="col-span-3">
                <Input value={end.complemento ?? ''} onChange={(e) => setEnd({ complemento: e.target.value })} />
              </FormField>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              <FormField label="Bairro" className="col-span-2">
                <Input value={end.bairro ?? ''} onChange={(e) => setEnd({ bairro: e.target.value })} />
              </FormField>
              <FormField label="Cidade">
                <Input value={end.cidade ?? ''} onChange={(e) => setEnd({ cidade: e.target.value })} />
              </FormField>
              <FormField label="Estado">
                <Input
                  maxLength={2}
                  value={end.estado ?? ''}
                  onChange={(e) => setEnd({ estado: e.target.value.toUpperCase() })}
                />
              </FormField>
            </div>
          </div>

          {!form.id && (
            <p className="text-xs text-slate-400">
              A <strong>matricula</strong> sera gerada automaticamente ao salvar.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : 'Salvar associado'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
