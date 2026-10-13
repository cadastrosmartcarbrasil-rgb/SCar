'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Car, FileWarning, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { useSalvarTerceiro } from '@/hooks/use-terceiros';
import { buscarCep } from '@/lib/cep';
import { normalizarPlaca } from '@/lib/placa';
import { soDigitos } from '@/lib/documento';
import { STATUS_TERCEIRO, validarTerceiro, type TerceiroForm } from '@/lib/terceiros';
import type { Json, StatusTerceiro, TipoEnvolvimento, TipoPessoa } from '@/lib/database.types';

interface Endereco {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  [key: string]: string | undefined;
}

/**
 * Cadastro/edicao do terceiro de um evento. O vinculo (evento + associado)
 * vem de fora e nao e editavel aqui: o banco amarra o terceiro ao evento e
 * ao associado dono dele.
 */
export function TerceiroForm({
  eventoId,
  clienteId,
  inicial,
  onSalvo,
  onCancelar,
  somenteLeitura = false,
}: {
  eventoId: string;
  clienteId: string;
  inicial?: TerceiroForm;
  onSalvo: (r: { id: string; codigo: string }) => void;
  onCancelar?: () => void;
  /** Quem nao trata o evento (0077) ve o cadastro, mas nao altera. */
  somenteLeitura?: boolean;
}) {
  const salvar = useSalvarTerceiro(eventoId, clienteId);
  const [t, setT] = useState<TerceiroForm>(
    inicial ?? {
      tipo_pessoa: 'PF',
      status: 'EM_ANALISE',
      condutor_e_proprietario: true,
      possui_veiculo: true,
      possui_seguro: false,
      endereco: {},
    },
  );
  const [buscandoCep, setBuscandoCep] = useState(false);
  const end = ((t.endereco as Json) ?? {}) as Endereco;
  const set = (patch: TerceiroForm) => setT((x) => ({ ...x, ...patch }));
  const setEnd = (patch: Endereco) => set({ endereco: { ...end, ...patch } });

  async function onCepBlur() {
    if (soDigitos(end.cep ?? '').length !== 8) return;
    setBuscandoCep(true);
    const r = await buscarCep(end.cep ?? '');
    setBuscandoCep(false);
    if (!r) return toast.error('CEP nao encontrado');
    setEnd({ logradouro: r.logradouro || end.logradouro, bairro: r.bairro || end.bairro, cidade: r.cidade || end.cidade, estado: r.estado || end.estado });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const erros = validarTerceiro(t);
    if (erros.length) return toast.error(erros[0]);
    salvar.mutate(t, {
      onSuccess: (r) => {
        toast.success(t.id ? `Terceiro ${r.codigo} atualizado` : `Terceiro ${r.codigo} cadastrado`);
        onSalvo(r);
      },
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {somenteLeitura && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Somente leitura: alterar o terceiro e tratar o evento (time de sinistro, gestor da unidade ou financeiro).
        </p>
      )}
      <fieldset disabled={somenteLeitura} className="space-y-5">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <FileWarning className="h-4 w-4" /> Envolvimento no evento
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Papel do terceiro">
              <Select value={t.papel ?? ''} onChange={(e) => set({ papel: (e.target.value || null) as TipoEnvolvimento | null })}>
                <option value="">A apurar</option>
                <option value="VITIMA">Vitima</option>
                <option value="CAUSADOR">Causador</option>
              </Select>
            </FormField>
            <FormField label="Situacao da tratativa">
              <Select value={t.status ?? 'EM_ANALISE'} onChange={(e) => set({ status: e.target.value as StatusTerceiro })}>
                {Object.entries(STATUS_TERCEIRO).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <UserRound className="h-4 w-4" /> Dados do terceiro
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Pessoa">
              <Select value={t.tipo_pessoa ?? 'PF'} onChange={(e) => set({ tipo_pessoa: e.target.value as TipoPessoa })}>
                <option value="PF">Fisica</option>
                <option value="PJ">Juridica</option>
              </Select>
            </FormField>
            <FormField label="Nome / Razao social *" className="sm:col-span-3">
              <Input value={t.nome ?? ''} onChange={(e) => set({ nome: e.target.value })} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label={t.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'}>
              <Input value={t.cpf_cnpj ?? ''} onChange={(e) => set({ cpf_cnpj: e.target.value })} />
            </FormField>
            {t.tipo_pessoa !== 'PJ' && (
              <>
                <FormField label="RG">
                  <Input value={t.rg ?? ''} onChange={(e) => set({ rg: e.target.value })} />
                </FormField>
                <FormField label="Nascimento">
                  <Input type="date" value={t.data_nascimento ?? ''} onChange={(e) => set({ data_nascimento: e.target.value })} />
                </FormField>
              </>
            )}
            <FormField label="Celular">
              <Input value={t.celular ?? ''} onChange={(e) => set({ celular: e.target.value })} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Telefone">
              <Input value={t.telefone ?? ''} onChange={(e) => set({ telefone: e.target.value })} />
            </FormField>
            <FormField label="E-mail">
              <Input type="email" value={t.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="CEP">
              <Input value={end.cep ?? ''} onChange={(e) => setEnd({ cep: e.target.value })} onBlur={onCepBlur} placeholder={buscandoCep ? 'Buscando...' : '00000-000'} />
            </FormField>
            <FormField label="Logradouro" className="sm:col-span-2">
              <Input value={end.logradouro ?? ''} onChange={(e) => setEnd({ logradouro: e.target.value })} />
            </FormField>
            <FormField label="Numero">
              <Input value={end.numero ?? ''} onChange={(e) => setEnd({ numero: e.target.value })} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Bairro" className="sm:col-span-2">
              <Input value={end.bairro ?? ''} onChange={(e) => setEnd({ bairro: e.target.value })} />
            </FormField>
            <FormField label="Cidade">
              <Input value={end.cidade ?? ''} onChange={(e) => setEnd({ cidade: e.target.value })} />
            </FormField>
            <FormField label="UF">
              <Input maxLength={2} value={end.estado ?? ''} onChange={(e) => setEnd({ estado: e.target.value.toUpperCase() })} />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Car className="h-4 w-4" /> Veiculo e condutor
            </h2>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={t.possui_veiculo !== false} onChange={(e) => set({ possui_veiculo: e.target.checked })} />
              Terceiro envolvido com veiculo
            </label>
          </div>
          {t.possui_veiculo !== false && (
            <div className="grid gap-3 sm:grid-cols-6">
              <FormField label="Placa">
                <Input className="font-mono uppercase" value={t.veiculo_placa ?? ''} onChange={(e) => set({ veiculo_placa: normalizarPlaca(e.target.value) })} />
              </FormField>
              <FormField label="Marca">
                <Input value={t.veiculo_marca ?? ''} onChange={(e) => set({ veiculo_marca: e.target.value })} />
              </FormField>
              <FormField label="Modelo" className="sm:col-span-2">
                <Input value={t.veiculo_modelo ?? ''} onChange={(e) => set({ veiculo_modelo: e.target.value })} />
              </FormField>
              <FormField label="Ano">
                <Input type="number" className="tnum" value={t.veiculo_ano ?? ''} onChange={(e) => set({ veiculo_ano: e.target.value ? Number(e.target.value) : null })} />
              </FormField>
              <FormField label="Cor">
                <Input value={t.veiculo_cor ?? ''} onChange={(e) => set({ veiculo_cor: e.target.value })} />
              </FormField>
              <FormField label="Valor FIPE" className="sm:col-span-2">
                <MoneyInput value={t.veiculo_valor_fipe ?? null} onChange={(v) => set({ veiculo_valor_fipe: v })} />
              </FormField>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={t.condutor_e_proprietario !== false}
              onChange={(e) => set({ condutor_e_proprietario: e.target.checked })}
            />
            O condutor e o proprio terceiro
          </label>
          <div className="grid gap-3 sm:grid-cols-4">
            {t.condutor_e_proprietario === false && (
              <>
                <FormField label="Nome do condutor *" className="sm:col-span-2">
                  <Input value={t.condutor_nome ?? ''} onChange={(e) => set({ condutor_nome: e.target.value })} />
                </FormField>
                <FormField label="CPF do condutor">
                  <Input value={t.condutor_cpf ?? ''} onChange={(e) => set({ condutor_cpf: e.target.value })} />
                </FormField>
              </>
            )}
            <FormField label="CNH do condutor">
              <Input value={t.condutor_cnh ?? ''} onChange={(e) => set({ condutor_cnh: e.target.value })} />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <ShieldCheck className="h-4 w-4" /> Seguro do terceiro
            </h2>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={!!t.possui_seguro} onChange={(e) => set({ possui_seguro: e.target.checked })} />
              Possui seguro/protecao
            </label>
          </div>
          {t.possui_seguro && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Seguradora / associacao *">
                <Input value={t.seguradora ?? ''} onChange={(e) => set({ seguradora: e.target.value })} />
              </FormField>
              <FormField label="Apolice / sinistro">
                <Input value={t.numero_apolice ?? ''} onChange={(e) => set({ numero_apolice: e.target.value })} />
              </FormField>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Wrench className="h-4 w-4" /> Danos
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Descricao dos danos" className="sm:col-span-3">
              <Textarea rows={3} value={t.descricao_danos ?? ''} onChange={(e) => set({ descricao_danos: e.target.value })} />
            </FormField>
            <FormField label="Estimativa (R$)">
              <MoneyInput value={t.valor_estimado_danos ?? null} onChange={(v) => set({ valor_estimado_danos: v })} />
            </FormField>
          </div>
          <FormField label="Observacoes internas">
            <Textarea rows={2} value={t.observacoes ?? ''} onChange={(e) => set({ observacoes: e.target.value })} />
          </FormField>
        </CardContent>
      </Card>

      </fieldset>

      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button type="button" variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={salvar.isPending || somenteLeitura}>
          {salvar.isPending ? 'Salvando...' : t.id ? 'Salvar alteracoes' : 'Cadastrar terceiro'}
        </Button>
      </div>
    </form>
  );
}
