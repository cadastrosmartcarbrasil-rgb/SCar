'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Building2, Power, PowerOff, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, PercentInput, Select } from '@/components/ui/field';
import {
  useRegionais,
  useRegionaisPainel,
  useSaveRegional,
  useDeleteRegional,
  useSituacaoRegional,
  useUsuarios,
} from '@/hooks/use-config';
import { buscarCep } from '@/lib/cep';
import { avisoDeInativacao, pendenciasDaUnidade } from '@/lib/regional';
import type { RegionaisRow } from '@/lib/database.types';

/** O endereco da unidade e jsonb; estes sao os campos que a tela mantem. */
type Endereco = {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '');

export default function RegionaisPage() {
  const { data: regionais } = useRegionais();
  const { data: painel, isLoading } = useRegionaisPainel(true);
  const { data: usuarios } = useUsuarios();
  const salvar = useSaveRegional();
  const excluir = useDeleteRegional();
  const situacao = useSituacaoRegional();

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Partial<RegionaisRow> | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [verInativas, setVerInativas] = useState(true);

  const porId = useMemo(
    () => new Map((regionais ?? []).map((r) => [r.id, r])),
    [regionais],
  );

  const linhas = useMemo(
    () => (painel ?? []).filter((r) => verInativas || r.ativo),
    [painel, verInativas],
  );

  const ativas = (painel ?? []).filter((r) => r.ativo).length;
  const inativas = (painel ?? []).length - ativas;

  function novo() {
    setEditando({
      nome: '', cnpj: '', endereco: {}, responsavel_id: null,
      telefone: '', email: '', ativo: true,
      percentual_maximo_desconto_venda: 0,
      taxa_comissao_adesao: 0, taxa_comissao_recorrente: 0,
      dias_protecao_lead: 30, dias_sem_contato_lead: 7, distribuicao_lead: 'MANUAL',
    });
    setAberto(true);
  }

  function editar(id: string) {
    const r = porId.get(id);
    if (!r) return toast.error('Unidade nao encontrada — recarregue a pagina');
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

  async function buscarEnderecoPorCep() {
    const cep = soDigitos(endereco.cep ?? '');
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    const r = await buscarCep(cep);
    setBuscandoCep(false);
    if (!r) return toast.error('CEP nao encontrado');
    setEndereco({
      logradouro: r.logradouro,
      bairro: r.bairro,
      cidade: r.cidade,
      uf: r.estado,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="max-w-3xl text-sm text-slate-500">
            Cadastre as unidades (franquias). Cada uma tem seus dados isolados por seguranca
            (RLS): usuarios, associados, veiculos e financeiro ficam restritos a propria unidade.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            <b className="text-slate-500">{ativas}</b> em operacao
            {inativas > 0 && <> · <b className="text-slate-500">{inativas}</b> inativa(s)</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={verInativas}
              onChange={(e) => setVerInativas(e.target.checked)}
              className="rounded border-slate-300"
            />
            Mostrar inativas
          </label>
          <Button onClick={novo}>
            <Plus className="h-4 w-4" /> Nova Regional
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Unidade</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Responsavel</th>
              <th className="px-4 py-2 text-right">Equipe</th>
              <th className="px-4 py-2 text-right">Carteira</th>
              <th className="px-4 py-2">Desc. max.</th>
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
            {linhas.map((r) => {
              const bruta = porId.get(r.id);
              const pendencias = pendenciasDaUnidade(r);
              return (
                <tr
                  key={r.id}
                  className={`border-b border-slate-50 last:border-0 ${r.ativo ? '' : 'bg-slate-50/60'}`}
                >
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      <Building2 className={`h-4 w-4 ${r.ativo ? 'text-brand-500' : 'text-slate-400'}`} />
                      <span className={r.ativo ? '' : 'text-slate-500'}>{r.nome}</span>
                      {!r.ativo && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                          Inativa
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {r.cidade ? `${r.cidade}/${r.uf ?? ''}` : 'Sem endereco'}
                      {r.cnpj && <> · {r.cnpj}</>}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.telefone ? <span className="tnum block">{r.telefone}</span> : null}
                    {r.email ? <span className="block text-xs text-slate-400">{r.email}</span> : null}
                    {!r.telefone && !r.email && <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.responsavel_nome ?? '-'}</td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    <span className="tnum">{r.vendedores_ativos}</span>
                    <span className="text-xs text-slate-400">
                      {r.vendedores !== r.vendedores_ativos && `/${r.vendedores}`} vend.
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-600">
                    <span className="tnum block">{r.associados} assoc.</span>
                    <span className="tnum block text-xs text-slate-400">
                      {r.veiculos_ativos} veic. ativos
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`tnum rounded px-2 py-0.5 text-xs ${
                      Number(bruta?.percentual_maximo_desconto_venda) > 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {Number(bruta?.percentual_maximo_desconto_venda ?? 0).toFixed(2).replace('.', ',')}%
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => editar(r.id)}
                        title="Editar unidade"
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          const msg = r.ativo
                            ? avisoDeInativacao(r.nome, r)
                            : `Reativar "${r.nome}"? Ela volta para as listas de escolha e para os hotlinks.`;
                          if (!confirm(msg)) return;
                          situacao.mutate(
                            { id: r.id, ativo: !r.ativo },
                            {
                              onSuccess: () =>
                                toast.success(r.ativo ? 'Unidade inativada' : 'Unidade reativada'),
                              onError: (e) => toast.error((e as Error).message),
                            },
                          );
                        }}
                        title={r.ativo ? 'Inativar unidade' : 'Reativar unidade'}
                        className={`rounded p-1.5 hover:bg-slate-100 ${
                          r.ativo ? 'text-amber-600' : 'text-emerald-600'
                        }`}
                      >
                        {r.ativo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </button>
                      <button
                        disabled={!r.pode_excluir}
                        title={
                          r.pode_excluir
                            ? 'Excluir unidade (nao tem nenhum registro vinculado)'
                            : `Nao da para excluir: ${pendencias.join(', ')}. Migre os registros ou inative a unidade.`
                        }
                        onClick={() => {
                          if (!confirm(`Excluir definitivamente a unidade "${r.nome}"?`)) return;
                          excluir.mutate(r.id, {
                            onSuccess: () => toast.success('Regional excluida'),
                            onError: (e) => toast.error((e as Error).message),
                          });
                        }}
                        className="rounded p-1.5 text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma regional cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        <b className="text-slate-500">Inativar</b> tira a unidade das listas de escolha, dos
        hotlinks e do rodizio — mas o que ela ja produziu continua inteiro nos relatorios e no
        DRE. <b className="text-slate-500">Excluir</b> so e liberado para unidade sem nenhum
        registro: apagar uma unidade com carteira jogaria os associados, veiculos e lancamentos
        dela no escopo da matriz.
      </p>

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title={editando?.id ? 'Editar Regional' : 'Nova Regional'}
        tamanho="xl"
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Nome da unidade *" className="sm:col-span-2">
              <Input
                value={editando?.nome ?? ''}
                onChange={(e) => setEditando((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex.: Franquia Cuiaba"
              />
            </FormField>
            <FormField label="Situacao">
              <Select
                value={editando?.ativo === false ? 'INATIVA' : 'ATIVA'}
                onChange={(e) => setEditando((p) => ({ ...p, ativo: e.target.value === 'ATIVA' }))}
              >
                <option value="ATIVA">Ativa — em operacao</option>
                <option value="INATIVA">Inativa — encerrada</option>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="CNPJ">
              <Input
                value={editando?.cnpj ?? ''}
                onChange={(e) => setEditando((p) => ({ ...p, cnpj: e.target.value }))}
                placeholder="00.000.000/0000-00"
              />
            </FormField>
            <FormField label="Telefone">
              <Input
                value={editando?.telefone ?? ''}
                onChange={(e) => setEditando((p) => ({ ...p, telefone: e.target.value }))}
                placeholder="(65) 3000-0000"
              />
            </FormField>
            <FormField label="E-mail">
              <Input
                type="email"
                value={editando?.email ?? ''}
                onChange={(e) => setEditando((p) => ({ ...p, email: e.target.value }))}
                placeholder="unidade@smartcarbrasil.com.br"
              />
            </FormField>
          </div>

          {/* Endereco completo, com busca por CEP (mesmo padrao do fornecedor). */}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              Endereco
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FormField label="CEP">
                <div className="flex gap-1">
                  <Input
                    value={endereco.cep ?? ''}
                    onChange={(e) => setEndereco({ cep: e.target.value })}
                    onBlur={buscarEnderecoPorCep}
                    placeholder="00000-000"
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={buscarEnderecoPorCep}
                    disabled={buscandoCep || soDigitos(endereco.cep ?? '').length !== 8}
                    title="Buscar endereco pelo CEP"
                    className="mt-1 shrink-0 rounded-md border border-slate-300 px-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </FormField>
              <FormField label="Logradouro" className="col-span-2 sm:col-span-3">
                <Input
                  value={endereco.logradouro ?? ''}
                  onChange={(e) => setEndereco({ logradouro: e.target.value })}
                />
              </FormField>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FormField label="Numero">
                <Input value={endereco.numero ?? ''} onChange={(e) => setEndereco({ numero: e.target.value })} />
              </FormField>
              <FormField label="Complemento">
                <Input
                  value={endereco.complemento ?? ''}
                  onChange={(e) => setEndereco({ complemento: e.target.value })}
                />
              </FormField>
              <FormField label="Bairro" className="col-span-2">
                <Input value={endereco.bairro ?? ''} onChange={(e) => setEndereco({ bairro: e.target.value })} />
              </FormField>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <FormField label="Cidade" className="sm:col-span-3">
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
            {buscandoCep && <p className="mt-1 text-xs text-slate-400">Buscando o CEP...</p>}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              Comissao da franquia
            </p>
            <p className="mb-2 mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
              Quanto esta regional recebe da associacao. E o <b>teto</b> do que ela pode ceder aos
              seus vendedores — nenhum vendedor pode ter percentual maior que este.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <FormField label="Lead que chega sem dono" className="mt-3">
              <Select
                value={editando?.distribuicao_lead ?? 'MANUAL'}
                onChange={(e) => setEditando((p) => ({ ...p, distribuicao_lead: e.target.value }))}
              >
                <option value="MANUAL">Manual — o gestor distribui</option>
                <option value="RODIZIO">Rodizio — vai para o proximo da fila</option>
              </Select>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Vale para o lead que entra sem vendedor (devolvido ao pool ou cadastrado pela
                unidade). O lead do hotlink do vendedor sempre fica com ele. No rodizio entra quem
                esta ha mais tempo sem receber lead.
              </p>
            </FormField>
          </div>

          <FormField label="Responsavel pela unidade">
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
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              Quem responde pela franquia. O <b>link de vendas e do vendedor</b>, nao da unidade —
              cadastre o responsavel tambem como vendedor em Configuracoes &rarr; Vendedores para
              ele ter o hotlink proprio.
            </p>
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
