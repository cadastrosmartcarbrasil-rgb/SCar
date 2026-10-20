'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Landmark, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { BancadaSicredi } from '@/components/pagamentos/bancada-sicredi';
import { FormField, Input, Select } from '@/components/ui/field';
import {
  useIntegracoes,
  useSaveIntegracao,
  useDeleteIntegracao,
  useRegionais,
} from '@/hooks/use-config';
import type { IntegracoesBancariasRow, ProvedorBanco, AmbienteIntegracao } from '@/lib/database.types';

const PROVEDORES: ProvedorBanco[] = ['SICREDI', 'ASAAS', 'PJBANK', 'CORA', 'INTER', 'GERENCIANET', 'OUTRO'];

// O Sicredi le as credenciais das variaveis SICREDI_* do servidor, nunca desta tabela.
const credencialNoServidor = (p?: ProvedorBanco | null) => p === 'SICREDI';

const mask = (s: string | null) => (s ? '••••••••' + s.slice(-4) : '-');

export default function IntegracoesPage() {
  const { data: integracoes, isLoading } = useIntegracoes();
  const { data: regionais } = useRegionais();
  const salvar = useSaveIntegracao();
  const excluir = useDeleteIntegracao();

  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState<Partial<IntegracoesBancariasRow> | null>(null);

  function novo() {
    setEd({ nome: '', provedor: 'ASAAS', ambiente: 'sandbox', ativo: true, is_padrao: false, regional_id: null });
    setAberto(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.nome) return toast.error('Informe um nome');
    salvar.mutate(ed, {
      onSuccess: () => {
        toast.success('Integração salva');
        setAberto(false);
      },
      onError: (err) => toast.error((err as Error).message),
    });
  }

  return (
    <div className="space-y-4">
      <BancadaSicredi />
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Cadastre as APIs de banco/gateway (Asaas, PJBank, Cora...) usadas para gerar boletos. As
          chaves ficam protegidas e são usadas apenas no servidor.
        </p>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Nova Integração
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Provedor</th>
              <th className="px-4 py-2">Ambiente</th>
              <th className="px-4 py-2">Chave (API)</th>
              <th className="px-4 py-2">Regional</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Ações</th>
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
            {(integracoes ?? []).map((i) => (
              <tr key={i.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-brand-500" /> {i.nome}
                    {i.is_padrao && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{i.provedor}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      i.ambiente === 'producao'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {i.ambiente}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  {credencialNoServidor(i.provedor) ? 'no servidor (SICREDI_*)' : mask(i.api_key)}
                </td>
                <td className="px-4 py-2 text-slate-600">{i.regionais?.nome ?? 'Global'}</td>
                <td className="px-4 py-2">
                  <span className={i.ativo ? 'text-emerald-600' : 'text-slate-400'}>
                    {i.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => {
                        setEd(i);
                        setAberto(true);
                      }}
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Excluir a integração "${i.nome}"?`))
                          excluir.mutate(i.id, {
                            onSuccess: () => toast.success('Integração excluída'),
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
            ))}
            {!isLoading && (integracoes ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma integração cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title={ed?.id ? 'Editar Integração' : 'Nova Integração Bancária'} tamanho="lg">
        <form onSubmit={submit} className="space-y-3">
          <FormField label="Nome / apelido *">
            <Input value={ed?.nome ?? ''} onChange={(e) => setEd((p) => ({ ...p, nome: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Provedor">
              <Select
                value={ed?.provedor ?? 'ASAAS'}
                onChange={(e) => setEd((p) => ({ ...p, provedor: e.target.value as ProvedorBanco }))}
              >
                {PROVEDORES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Ambiente">
              <Select
                value={ed?.ambiente ?? 'sandbox'}
                onChange={(e) => setEd((p) => ({ ...p, ambiente: e.target.value as AmbienteIntegracao }))}
              >
                <option value="sandbox">Sandbox (teste)</option>
                <option value="producao">Produção</option>
              </Select>
            </FormField>
          </div>
          {credencialNoServidor(ed?.provedor) ? (
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
              As credenciais do Sicredi ficam nas variáveis <span className="font-mono">SICREDI_*</span> do
              servidor, não aqui. O <strong>ambiente</strong> escolhido acima tem de ser o mesmo de{' '}
              <span className="font-mono">SICREDI_AMBIENTE</span> — se divergirem, a emissão é recusada.
              Confira no painel do Sicredi, no topo desta página.
            </p>
          ) : (
            <>
            <FormField label="URL da API">
              <Input
                value={ed?.api_url ?? ''}
                onChange={(e) => setEd((p) => ({ ...p, api_url: e.target.value }))}
                placeholder="https://sandbox.asaas.com/api/v3"
              />
            </FormField>
            <FormField label="Chave da API (API Key / Token)">
              <Input
                value={ed?.api_key ?? ''}
                onChange={(e) => setEd((p) => ({ ...p, api_key: e.target.value }))}
                placeholder="Cole a chave do gateway"
              />
            </FormField>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Token extra (opcional)">
                <Input
                  value={ed?.api_token_extra ?? ''}
                  onChange={(e) => setEd((p) => ({ ...p, api_token_extra: e.target.value }))}
                  placeholder="Wallet ID, client secret..."
                />
              </FormField>
              <FormField label="Segredo do Webhook">
                <Input
                  value={ed?.webhook_secret ?? ''}
                  onChange={(e) => setEd((p) => ({ ...p, webhook_secret: e.target.value }))}
                />
              </FormField>
            </div>
            </>
          )}
          <FormField label="Regional (deixe vazio para uso global)">
            <Select
              value={ed?.regional_id ?? ''}
              onChange={(e) => setEd((p) => ({ ...p, regional_id: e.target.value || null }))}
            >
              <option value="">-- Global (todas) --</option>
              {(regionais ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={ed?.is_padrao ?? false}
                onChange={(e) => setEd((p) => ({ ...p, is_padrao: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Gateway padrão para emissão
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={ed?.ativo ?? true}
                onChange={(e) => setEd((p) => ({ ...p, ativo: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Ativo
            </label>
          </div>

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
