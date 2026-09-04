'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Store, Search, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import { useFornecedores, useSaveFornecedor } from '@/hooks/use-fornecedores';
import { consultarCnpj } from '@/lib/cnpj';
import { buscarCep } from '@/lib/cep';
import { validarDocumento, formatarDocumento, soDigitos, formatarTelefone } from '@/lib/documento';
import type { FornecedoresRow, TipoPessoa, Json } from '@/lib/database.types';

interface EndForn {
  cep?: string; logradouro?: string; numero?: string; complemento?: string;
  bairro?: string; cidade?: string; uf?: string; [k: string]: string | undefined | null;
}
type FormForn = Omit<Partial<FornecedoresRow>, 'endereco'> & { endereco: EndForn };

export default function FornecedoresPage() {
  const { data: fornecedores, isLoading } = useFornecedores();
  const salvar = useSaveFornecedor();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<FormForn>({ tipo_pessoa: 'PJ', endereco: {} });
  const [consultando, setConsultando] = useState(false);

  const tipo = (form.tipo_pessoa ?? 'PJ') as TipoPessoa;
  const docValido = form.documento ? validarDocumento(form.documento, tipo) : null;
  const end = form.endereco ?? {};
  const setEnd = (p: Partial<EndForn>) => setForm((f) => ({ ...f, endereco: { ...f.endereco, ...p } }));
  const setF = (p: Partial<FormForn>) => setForm((f) => ({ ...f, ...p }));

  function novo() {
    setForm({ tipo_pessoa: 'PJ', endereco: {}, ativo: true });
    setAberto(true);
  }

  async function consultar() {
    if (!validarDocumento(form.documento ?? '', 'PJ')) return toast.error('CNPJ invalido');
    setConsultando(true);
    const d = await consultarCnpj(form.documento ?? '');
    setConsultando(false);
    if (!d.found) {
      toast.message('Consulta indisponivel - preencha os dados manualmente.');
      return;
    }
    setForm((f) => ({
      ...f,
      razao_social: d.razao_social ?? f.razao_social,
      nome_fantasia: d.nome_fantasia ?? f.nome_fantasia,
      situacao_cadastral: d.situacao_cadastral ?? f.situacao_cadastral,
      cnae_principal: d.cnae_principal ?? f.cnae_principal,
      email: d.email ?? f.email,
      telefone: d.telefone ?? f.telefone,
      endereco: { ...f.endereco, ...(d.endereco ?? {}) } as EndForn,
      dados_receita: (d.raw as Json) ?? f.dados_receita,
    }));
    toast.success('Dados da Receita preenchidos');
  }

  async function onCepBlur() {
    if (soDigitos(end.cep ?? '').length !== 8) return;
    const r = await buscarCep(end.cep ?? '');
    if (!r) return toast.error('CEP nao encontrado');
    setEnd({ logradouro: r.logradouro, bairro: r.bairro, cidade: r.cidade, uf: r.estado });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razao_social) return toast.error('Informe o nome/razao social');
    if (!validarDocumento(form.documento ?? '', tipo)) return toast.error(tipo === 'PF' ? 'CPF invalido' : 'CNPJ invalido');
    salvar.mutate(form, {
      onSuccess: () => { toast.success('Fornecedor salvo'); setAberto(false); },
      onError: (err) => toast.error(err.message.includes('documento') ? 'Documento ja cadastrado' : err.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Cadastro de fornecedores. Ao informar um CNPJ, use o botao Consultar para autopreencher via Receita.
        </p>
        <Button onClick={novo}><Plus className="h-4 w-4" /> Novo Fornecedor</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Razao Social</th>
              <th className="px-4 py-2">Documento</th>
              <th className="px-4 py-2">CNAE</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {(fornecedores ?? []).map((f) => (
              <tr key={f.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2"><Store className="h-4 w-4 text-brand-500" /> {f.razao_social}</span>
                </td>
                <td className="px-4 py-2 text-slate-600">{formatarDocumento(f.documento, f.tipo_pessoa)}</td>
                <td className="px-4 py-2 text-slate-500">{f.cnae_principal ?? '-'}</td>
                <td className="px-4 py-2 text-slate-600">{f.telefone || f.email || '-'}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => { setForm({ ...f, endereco: (f.endereco as EndForn) ?? {} }); setAberto(true); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && (fornecedores ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nenhum fornecedor.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={form.id ? 'Editar Fornecedor' : 'Novo Fornecedor'} tamanho="xl">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Tipo">
              <Select value={tipo} onChange={(e) => setF({ tipo_pessoa: e.target.value as TipoPessoa })}>
                <option value="PJ">CNPJ (PJ)</option>
                <option value="PF">CPF (PF)</option>
              </Select>
            </FormField>
            <FormField label={tipo === 'PJ' ? 'CNPJ *' : 'CPF *'} className="sm:col-span-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input value={form.documento ? formatarDocumento(form.documento, tipo) : ''} onChange={(e) => setF({ documento: soDigitos(e.target.value) })}
                    placeholder={tipo === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                    className={docValido === false ? 'border-rose-400 pr-8' : docValido ? 'border-emerald-400 pr-8' : 'pr-8'} />
                  {docValido === true && <Check className="absolute right-2 top-2.5 h-4 w-4 text-emerald-500" />}
                  {docValido === false && <X className="absolute right-2 top-2.5 h-4 w-4 text-rose-500" />}
                </div>
                {tipo === 'PJ' && (
                  <Button type="button" variant="secondary" onClick={consultar} disabled={consultando} className="mt-0 shrink-0">
                    {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Consultar
                  </Button>
                )}
              </div>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={tipo === 'PJ' ? 'Razao social *' : 'Nome *'}>
              <Input value={form.razao_social ?? ''} onChange={(e) => setF({ razao_social: e.target.value })} />
            </FormField>
            <FormField label="Nome fantasia">
              <Input value={form.nome_fantasia ?? ''} onChange={(e) => setF({ nome_fantasia: e.target.value })} />
            </FormField>
          </div>
          {tipo === 'PJ' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Situacao cadastral"><Input value={form.situacao_cadastral ?? ''} onChange={(e) => setF({ situacao_cadastral: e.target.value })} /></FormField>
              <FormField label="CNAE principal"><Input value={form.cnae_principal ?? ''} onChange={(e) => setF({ cnae_principal: e.target.value })} /></FormField>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="E-mail"><Input type="email" value={form.email ?? ''} onChange={(e) => setF({ email: e.target.value })} /></FormField>
            <FormField label="Telefone"><Input value={form.telefone ? formatarTelefone(form.telefone) : ''} onChange={(e) => setF({ telefone: soDigitos(e.target.value) })} /></FormField>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-sm font-medium text-slate-600">Endereco</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FormField label="CEP"><Input value={end.cep ?? ''} onChange={(e) => setEnd({ cep: e.target.value })} onBlur={onCepBlur} /></FormField>
              <FormField label="Logradouro" className="col-span-2 sm:col-span-3"><Input value={end.logradouro ?? ''} onChange={(e) => setEnd({ logradouro: e.target.value })} /></FormField>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FormField label="Numero"><Input value={end.numero ?? ''} onChange={(e) => setEnd({ numero: e.target.value })} /></FormField>
              <FormField label="Bairro" className="col-span-2"><Input value={end.bairro ?? ''} onChange={(e) => setEnd({ bairro: e.target.value })} /></FormField>
              <FormField label="UF"><Input maxLength={2} value={end.uf ?? ''} onChange={(e) => setEnd({ uf: e.target.value.toUpperCase() })} /></FormField>
            </div>
            <div className="mt-2">
              <FormField label="Cidade"><Input value={end.cidade ?? ''} onChange={(e) => setEnd({ cidade: e.target.value })} /></FormField>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
