'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, PercentInput, Select } from '@/components/ui/field';
import { useRegionais, useSaveRegional, useDeleteRegional, useUsuarios } from '@/hooks/use-config';
import type { RegionaisRow } from '@/lib/database.types';

type Endereco = { logradouro?: string; cidade?: string; uf?: string };

export default function RegionaisPage() {
  const { data: regionais, isLoading } = useRegionais();
  const { data: usuarios } = useUsuarios();
  const salvar = useSaveRegional();
  const excluir = useDeleteRegional();

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Partial<RegionaisRow> | null>(null);

  const nomesUsuarios = useMemo(
    () => new Map((usuarios ?? []).map((u) => [u.id, u.nome])),
    [usuarios],
  );

  function novo() {
    setEditando({ nome: '', cnpj: '', endereco: {}, responsavel_id: null, percentual_maximo_desconto_venda: 0,
      taxa_comissao_adesao: 0, taxa_comissao_recorrente: 0,
      dias_protecao_lead: 30, dias_sem_contato_lead: 7, distribuicao_lead: 'MANUAL' });
    setAberto(true);
  }
  function editar(r: RegionaisRow) {
    setEditando(r);
    setAberto(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!editando?.nome) return toast.error('Informe o nome da regional');
    salvar.mutate(editando, {
      onSuccess: () => {
        toast.success('Regional salva');
        setAberto(false);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  const endereco = (editando?.endereco ?? {}) as Endereco;
  const setEndereco = (patch: Partial<Endereco>) =>
    setEditando((p) => ({ ...p, endereco: { ...endereco, ...patch } }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Cadastre as regionais (franquias). Cada regional tem seus dados isolados por seguranca (RLS):
          usuarios, clientes, veiculos e financeiro ficam restritos a sua propria regional.
        </p>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Nova Regional
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">CNPJ</th>
              <th className="px-4 py-2">Cidade/UF</th>
              <th className="px-4 py-2">Responsavel</th>
              <th className="px-4 py-2">Desc. max.</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {(regionais ?? []).map((r) => {
              const end = (r.endereco ?? {}) as Endereco;
              return (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-brand-500" /> {r.nome}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.cnpj ?? '-'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {end.cidade ? `${end.cidade}/${end.uf ?? ''}` : '-'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.responsavel_id ? nomesUsuarios.get(r.responsavel_id) ?? '-' : '-'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`tnum rounded px-2 py-0.5 text-xs ${
                      Number(r.percentual_maximo_desconto_venda) > 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {Number(r.percentual_maximo_desconto_venda ?? 0).toFixed(2).replace('.', ',')}%
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => editar(r)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir a regional "${r.nome}"?`))
                            excluir.mutate(r.id, {
                              onSuccess: () => toast.success('Regional excluida'),
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
            {!isLoading && (regionais ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma regional cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={editando?.id ? 'Editar Regional' : 'Nova Regional'}>
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Nome da regional *">
            <Input
              value={editando?.nome ?? ''}
              onChange={(e) => setEditando((p) => ({ ...p, nome: e.target.value }))}
              placeholder="Ex.: Franquia Sao Paulo Centro"
            />
          </FormField>
          <FormField label="CNPJ">
            <Input
              value={editando?.cnpj ?? ''}
              onChange={(e) => setEditando((p) => ({ ...p, cnpj: e.target.value }))}
              placeholder="00.000.000/0000-00"
            />
          </FormField>
          <FormField label="Logradouro">
            <Input value={endereco.logradouro ?? ''} onChange={(e) => setEndereco({ logradouro: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Cidade" className="col-span-2">
              <Input value={endereco.cidade ?? ''} onChange={(e) => setEndereco({ cidade: e.target.value })} />
            </FormField>
            <FormField label="UF">
              <Input
                maxLength={2}
                value={endereco.uf ?? ''}
                onChange={(e) => setEndereco({ uf: e.target.value.toUpperCase() })}
              />
            </FormField>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              Comissao da franquia
            </p>
            <p className="mb-2 mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
              Quanto esta regional recebe da associacao. E o <b>teto</b> do que ela pode ceder aos
              seus vendedores — nenhum vendedor pode ter percentual maior que este.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Adesao">
                <PercentInput
                  value={editando?.taxa_comissao_adesao == null ? null : Number(editando.taxa_comissao_adesao) * 100}
                  onChange={(v) => setEditando((p) => ({ ...p, taxa_comissao_adesao: (v ?? 0) / 100 }))}
                />
              </FormField>
              <FormField label="Recorrencia">
                <PercentInput
                  value={editando?.taxa_comissao_recorrente == null ? null : Number(editando.taxa_comissao_recorrente) * 100}
                  onChange={(v) => setEditando((p) => ({ ...p, taxa_comissao_recorrente: (v ?? 0) / 100 }))}
                />
              </FormField>
            </div>
          </div>

          <FormField label="Desconto maximo de venda">
            <PercentInput
              value={editando?.percentual_maximo_desconto_venda ?? null}
              onChange={(v) => setEditando((p) => ({ ...p, percentual_maximo_desconto_venda: v ?? 0 }))}
            />
            <p className="mt-1 text-xs text-slate-500">
              Limite que o vendedor desta franquia pode conceder sozinho na cotacao (mensalidade e
              adesao). Acima disso, a cotacao trava e exige aprovacao de Gestor/Diretor.
            </p>
          </FormField>
          <FormField label="Observacao da politica de desconto">
            <Input
              value={editando?.desconto_observacao ?? ''}
              onChange={(e) => setEditando((p) => ({ ...p, desconto_observacao: e.target.value }))}
              placeholder="Ex.: ate 10% em campanhas de fim de ano"
            />
          </FormField>
          {/* Regras de atribuicao do lead (0041) — sao da franquia, nao do codigo. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <h4 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-600">
              Atribuicao de leads
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Protecao do lead (dias)">
                <Input
                  type="number" min={0} max={365} className="tnum"
                  value={editando?.dias_protecao_lead ?? 30}
                  onChange={(e) => setEditando((p) => ({ ...p, dias_protecao_lead: Number(e.target.value || 0) }))}
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Enquanto durar, o lead e de quem captou primeiro: um clique em outro hotlink nao
                  troca o dono, so registra a nova passagem. <b>0 desliga</b> (o ultimo clique leva).
                </p>
              </FormField>
              <FormField label="Devolver ao pool sem contato (dias)">
                <Input
                  type="number" min={0} max={365} className="tnum"
                  value={editando?.dias_sem_contato_lead ?? 7}
                  onChange={(e) => setEditando((p) => ({ ...p, dias_sem_contato_lead: Number(e.target.value || 0) }))}
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Lead sem interacao volta para a unidade redistribuir. <b>0 = nunca volta.</b>
                </p>
              </FormField>
            </div>
            <FormField label="Lead do hotlink DA UNIDADE" className="mt-3">
              <Select
                value={editando?.distribuicao_lead ?? 'MANUAL'}
                onChange={(e) => setEditando((p) => ({ ...p, distribuicao_lead: e.target.value }))}
              >
                <option value="MANUAL">Manual — o gestor distribui</option>
                <option value="RODIZIO">Rodizio — vai para o proximo da fila</option>
              </Select>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Vale so para o link da propria franquia (o do vendedor sempre fica com ele).
                No rodizio entra quem esta ha mais tempo sem receber lead.
              </p>
            </FormField>
          </div>

          <FormField label="Responsavel">
            <Select
              value={editando?.responsavel_id ?? ''}
              onChange={(e) => setEditando((p) => ({ ...p, responsavel_id: e.target.value || null }))}
            >
              <option value="">-- Nenhum --</option>
              {(usuarios ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
