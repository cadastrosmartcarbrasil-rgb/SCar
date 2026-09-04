'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { useRegionais } from '@/hooks/use-config';
import { useSaveAssociado, type EnderecoAssociado } from '@/hooks/use-associados';
import { validarDocumento, formatarDocumento, calcularIdade, soDigitos } from '@/lib/documento';
import { buscarCep } from '@/lib/cep';
import type { ClientesRow, StatusCliente, TipoPessoa } from '@/lib/database.types';

const SITUACOES: { value: StatusCliente; label: string }[] = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'suspenso', label: 'Suspenso' },
  { value: 'excluido', label: 'Excluido' },
];

export type FormAssociado = Omit<Partial<ClientesRow>, 'endereco'> & { endereco: EnderecoAssociado };

export function novoAssociadoVazio(): FormAssociado {
  return { tipo_pessoa: 'PF', status: 'ativo', nome_razao_social: '', cpf_cnpj: '', endereco: {} };
}

export function AssociadoForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: FormAssociado;
  onSaved: (id?: string) => void;
  onCancel?: () => void;
}) {
  const { data: regionais } = useRegionais();
  const salvar = useSaveAssociado();
  const [form, setForm] = useState<FormAssociado>(initial);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const tipo = (form.tipo_pessoa ?? 'PF') as TipoPessoa;
  const docValido = form.cpf_cnpj ? validarDocumento(form.cpf_cnpj, tipo) : null;
  const idade = calcularIdade(form.data_nascimento);
  const end = form.endereco ?? {};
  const setEnd = (patch: Partial<EnderecoAssociado>) =>
    setForm((p) => ({ ...p, endereco: { ...p.endereco, ...patch } }));

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
        onSaved(form.id);
      },
      onError: (err) => {
        const msg = (err as Error).message;
        toast.error(msg.includes('cpf_cnpj') ? 'CPF/CNPJ ja cadastrado' : msg);
      },
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Situacao">
          <Select value={form.status ?? 'ativo'} onChange={(e) => setForm({ ...form, status: e.target.value as StatusCliente })}>
            {SITUACOES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Tipo de pessoa">
          <Select value={tipo} onChange={(e) => setForm({ ...form, tipo_pessoa: e.target.value as TipoPessoa })}>
            <option value="PF">Pessoa Fisica (PF)</option>
            <option value="PJ">Pessoa Juridica (PJ)</option>
          </Select>
        </FormField>
      </div>

      <FormField label={tipo === 'PF' ? 'Nome completo *' : 'Razao social *'}>
        <Input value={form.nome_razao_social ?? ''} onChange={(e) => setForm({ ...form, nome_razao_social: e.target.value })} />
      </FormField>

      <FormField label={tipo === 'PF' ? 'CPF *' : 'CNPJ *'}>
        <div className="relative">
          <Input
            value={form.cpf_cnpj ? formatarDocumento(form.cpf_cnpj, tipo) : ''}
            onChange={(e) => setForm({ ...form, cpf_cnpj: soDigitos(e.target.value) })}
            placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
            className={docValido === false ? 'border-rose-400 pr-9' : docValido ? 'border-emerald-400 pr-9' : 'pr-9'}
          />
          {docValido === true && <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-emerald-500" />}
          {docValido === false && <X className="absolute right-2.5 top-2.5 h-4 w-4 text-rose-500" />}
        </div>
      </FormField>

      {tipo === 'PF' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Data de nascimento" className="sm:col-span-2">
              <Input type="date" value={form.data_nascimento ?? ''} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
            </FormField>
            <FormField label="Idade">
              <Input value={idade != null ? `${idade} anos` : '-'} disabled />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="E-mail principal">
          <Input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <FormField label="E-mail adicional">
          <Input type="email" value={form.email_adicional ?? ''} onChange={(e) => setForm({ ...form, email_adicional: e.target.value })} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Telefone">
          <Input value={form.telefone ?? ''} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
        </FormField>
        <FormField label="Celular">
          <Input value={form.celular ?? ''} onChange={(e) => setForm({ ...form, celular: e.target.value })} />
        </FormField>
      </div>

      <FormField label="Regional vinculada">
        <Select value={form.regional_id ?? ''} onChange={(e) => setForm({ ...form, regional_id: e.target.value || null })}>
          <option value="">-- Selecione --</option>
          {(regionais ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <MapPin className="h-4 w-4" /> Endereco
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FormField label="CEP">
            <Input value={end.cep ?? ''} onChange={(e) => setEnd({ cep: e.target.value })} onBlur={onCepBlur} placeholder={buscandoCep ? 'Buscando...' : '00000-000'} />
          </FormField>
          <FormField label="Rua / Logradouro" className="col-span-2 sm:col-span-3">
            <Input value={end.logradouro ?? ''} onChange={(e) => setEnd({ logradouro: e.target.value })} />
          </FormField>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FormField label="Numero">
            <Input value={end.numero ?? ''} onChange={(e) => setEnd({ numero: e.target.value })} />
          </FormField>
          <FormField label="Complemento" className="col-span-2 sm:col-span-3">
            <Input value={end.complemento ?? ''} onChange={(e) => setEnd({ complemento: e.target.value })} />
          </FormField>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FormField label="Bairro" className="col-span-2">
            <Input value={end.bairro ?? ''} onChange={(e) => setEnd({ bairro: e.target.value })} />
          </FormField>
          <FormField label="Cidade">
            <Input value={end.cidade ?? ''} onChange={(e) => setEnd({ cidade: e.target.value })} />
          </FormField>
          <FormField label="Estado">
            <Input maxLength={2} value={end.estado ?? ''} onChange={(e) => setEnd({ estado: e.target.value.toUpperCase() })} />
          </FormField>
        </div>
      </div>

      {!form.id && (
        <p className="text-xs text-slate-400">
          A <strong>matricula</strong> sera gerada automaticamente ao salvar.
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? 'Salvando...' : 'Salvar associado'}
        </Button>
      </div>
    </form>
  );
}
