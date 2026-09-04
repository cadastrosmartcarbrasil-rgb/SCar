'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, MoneyInput } from '@/components/ui/field';
import {
  usePrestadores, useSalvarPrestador, useServicosAssistencia, useServicosDoPrestador,
} from '@/hooks/use-assistencia';
import { consultarCnpj } from '@/lib/cnpj';
import { formatCurrency } from '@/lib/utils';
import { formatarDocumento } from '@/lib/documento';
import type { FornecedoresRow } from '@/lib/database.types';

interface ServicoPrestador {
  servico_id: string;
  valor_acordado: number | null;
  valor_km: number | null;
  prazo_medio_min: number | null;
}

// Cadastro de prestadores (guincho, chaveiro...) — reusa `fornecedores`, com os
// campos do modulo 24h. O atendente 24h tem permissao para cadastrar aqui.
export function Prestadores24h() {
  const { data: prestadores, isLoading } = usePrestadores();
  const { data: servicos } = useServicosAssistencia(true);
  const salvar = useSalvarPrestador();
  const [edit, setEdit] = useState<Partial<FornecedoresRow> | null>(null);
  const [vinculos, setVinculos] = useState<ServicoPrestador[]>([]);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const { data: vinculosSalvos } = useServicosDoPrestador(edit?.id ?? null);

  useEffect(() => {
    if (edit?.id && vinculosSalvos) {
      setVinculos(vinculosSalvos.map((v) => ({
        servico_id: v.servico_id,
        valor_acordado: v.valor_acordado,
        valor_km: v.valor_km,
        prazo_medio_min: v.prazo_medio_min,
      })));
    }
  }, [edit?.id, vinculosSalvos]);

  async function preencherPorCnpj() {
    const doc = (edit?.documento ?? '').replace(/\D/g, '');
    if (doc.length !== 14) return toast.error('Informe um CNPJ valido');
    setBuscandoCnpj(true);
    try {
      const d = await consultarCnpj(doc);
      if (!d.found) return toast.error('CNPJ nao encontrado');
      setEdit((p) => ({
        ...p,
        razao_social: d.razao_social ?? p?.razao_social,
        nome_fantasia: d.nome_fantasia ?? p?.nome_fantasia,
        email: d.email ?? p?.email,
        telefone: d.telefone ?? p?.telefone,
      }));
      toast.success('Dados do CNPJ preenchidos');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuscandoCnpj(false);
    }
  }

  function alternarServico(servicoId: string, marcado: boolean) {
    setVinculos((v) =>
      marcado
        ? [...v, { servico_id: servicoId, valor_acordado: null, valor_km: null, prazo_medio_min: null }]
        : v.filter((x) => x.servico_id !== servicoId),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit?.razao_social?.trim()) return toast.error('Informe a razao social');
    if (!(edit?.documento ?? '').replace(/\D/g, '')) return toast.error('Informe o CPF/CNPJ');
    salvar.mutate(
      { ...edit, servicos: vinculos },
      {
        onSuccess: () => { toast.success('Prestador salvo'); setEdit(null); setVinculos([]); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Prestadores de guincho e servicos 24h, com os servicos que atendem e os valores acordados
          (usados na cotacao).
        </p>
        <Button onClick={() => { setEdit({ tipo_pessoa: 'PJ', ativo: true }); setVinculos([]); }}>
          <Plus className="h-4 w-4" /> Novo prestador
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Prestador</th>
              <th className="px-4 py-2">Documento</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Cobertura</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {!isLoading && (prestadores ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhum prestador cadastrado.</td></tr>
            )}
            {(prestadores ?? []).map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2">
                  <p className="font-medium text-slate-700">{p.razao_social}</p>
                  {p.nome_fantasia && <p className="text-xs text-slate-400">{p.nome_fantasia}</p>}
                </td>
                <td className="px-4 py-2 text-slate-600">{formatarDocumento(p.documento, p.tipo_pessoa)}</td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {p.whatsapp ?? p.telefone ?? '-'}
                  {p.email && <span className="block text-slate-400">{p.email}</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{p.cobertura ?? '-'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${p.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar prestador' : 'Novo prestador 24h'} tamanho="lg">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Tipo">
              <Select
                value={edit?.tipo_pessoa ?? 'PJ'}
                onChange={(e) => setEdit({ ...edit, tipo_pessoa: e.target.value as 'PF' | 'PJ' })}
              >
                <option value="PJ">Pessoa juridica</option>
                <option value="PF">Pessoa fisica</option>
              </Select>
            </FormField>
            <FormField label="CPF / CNPJ">
              <div className="flex gap-2">
                <Input
                  value={edit?.documento ?? ''}
                  onChange={(e) => setEdit({ ...edit, documento: e.target.value })}
                />
                {edit?.tipo_pessoa !== 'PF' && (
                  <Button type="button" variant="secondary" onClick={preencherPorCnpj} disabled={buscandoCnpj}>
                    {buscandoCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </FormField>
            <FormField label="Razao social / Nome" className="sm:col-span-2">
              <Input value={edit?.razao_social ?? ''} onChange={(e) => setEdit({ ...edit, razao_social: e.target.value })} />
            </FormField>
            <FormField label="Nome fantasia">
              <Input value={edit?.nome_fantasia ?? ''} onChange={(e) => setEdit({ ...edit, nome_fantasia: e.target.value })} />
            </FormField>
            <FormField label="Cobertura (regiao atendida)">
              <Input value={edit?.cobertura ?? ''} onChange={(e) => setEdit({ ...edit, cobertura: e.target.value })} placeholder="Grande SP, litoral..." />
            </FormField>
            <FormField label="Telefone">
              <Input value={edit?.telefone ?? ''} onChange={(e) => setEdit({ ...edit, telefone: e.target.value })} />
            </FormField>
            <FormField label="WhatsApp (recebe o voucher)">
              <Input value={edit?.whatsapp ?? ''} onChange={(e) => setEdit({ ...edit, whatsapp: e.target.value })} />
            </FormField>
            <FormField label="E-mail (recebe o voucher)">
              <Input type="email" value={edit?.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </FormField>
            <FormField label="Chave PIX (pagamento)">
              <Input value={edit?.chave_pix ?? ''} onChange={(e) => setEdit({ ...edit, chave_pix: e.target.value })} />
            </FormField>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Servicos atendidos</p>
            <div className="space-y-2">
              {(servicos ?? []).map((s) => {
                const v = vinculos.find((x) => x.servico_id === s.id);
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <label className="flex min-w-[180px] items-center gap-2">
                      <input type="checkbox" checked={!!v} onChange={(e) => alternarServico(s.id, e.target.checked)} />
                      <span className="text-slate-700">{s.descricao}</span>
                    </label>
                    {v && (
                      <>
                        <span className="text-xs text-slate-400">valor</span>
                        <div className="w-32">
                          <MoneyInput
                            value={v.valor_acordado ?? 0}
                            onChange={(val) => setVinculos((lst) => lst.map((x) => x.servico_id === s.id ? { ...x, valor_acordado: val } : x))}
                          />
                        </div>
                        {s.cobra_km_excedente && (
                          <>
                            <span className="text-xs text-slate-400">km</span>
                            <div className="w-24">
                              <MoneyInput
                                value={v.valor_km ?? 0}
                                onChange={(val) => setVinculos((lst) => lst.map((x) => x.servico_id === s.id ? { ...x, valor_km: val } : x))}
                              />
                            </div>
                          </>
                        )}
                        <span className="text-xs text-slate-400">prazo (min)</span>
                        <Input
                          type="number" min={0} className="mt-0 w-20"
                          value={v.prazo_medio_min ?? ''}
                          onChange={(e) => setVinculos((lst) => lst.map((x) => x.servico_id === s.id ? { ...x, prazo_medio_min: e.target.value ? Number(e.target.value) : null } : x))}
                        />
                      </>
                    )}
                  </div>
                );
              })}
              {(servicos ?? []).length === 0 && (
                <p className="text-sm text-slate-400">Cadastre os servicos 24h primeiro.</p>
              )}
            </div>
            {vinculos.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Menor valor acordado: {formatCurrency(Math.min(...vinculos.map((v) => Number(v.valor_acordado ?? 0))))}
              </p>
            )}
          </div>

          <FormField label="Observacoes">
            <Input value={edit?.observacoes ?? ''} onChange={(e) => setEdit({ ...edit, observacoes: e.target.value })} />
          </FormField>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
