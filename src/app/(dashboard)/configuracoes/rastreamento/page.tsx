'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Satellite, Search, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Textarea } from '@/components/ui/field';
import { useEmpresasRastreamento, useSaveEmpresaRastreamento } from '@/hooks/use-rastreamento';
import { consultarCnpj } from '@/lib/cnpj';
import { formatarCNPJ, formatarTelefone, soDigitos, validarCNPJ } from '@/lib/documento';
import type { EmpresasRastreamentoRow } from '@/lib/database.types';

export default function RastreamentoPage() {
  const { data: empresas, isLoading } = useEmpresasRastreamento(true);
  const salvar = useSaveEmpresaRastreamento();
  const [aberto, setAberto] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [ed, setEd] = useState<Partial<EmpresasRastreamentoRow> | null>(null);
  const setF = (p: Partial<EmpresasRastreamentoRow>) => setEd((f) => ({ ...f, ...p }));

  function novo() {
    setEd({ nome: '', ativo: true });
    setAberto(true);
  }

  async function consultar() {
    if (!validarCNPJ(ed?.cnpj ?? '')) return toast.error('CNPJ invalido');
    setConsultando(true);
    const d = await consultarCnpj(ed?.cnpj ?? '');
    setConsultando(false);
    if (!d.found) return toast.message('Consulta indisponivel - preencha os dados manualmente.');
    setEd((f) => ({
      ...f,
      nome: f?.nome || d.nome_fantasia || d.razao_social || '',
      razao_social: d.razao_social ?? f?.razao_social ?? null,
      email: d.email ?? f?.email ?? null,
      telefone: d.telefone ?? f?.telefone ?? null,
    }));
    toast.success('Dados da Receita preenchidos');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.nome?.trim()) return toast.error('Informe o nome da empresa de rastreamento');
    if (ed.cnpj && !validarCNPJ(ed.cnpj)) return toast.error('CNPJ invalido');
    salvar.mutate(ed, {
      onSuccess: () => { toast.success('Empresa de rastreamento salva'); setAberto(false); },
      onError: (err) => toast.error(err.message.includes('duplicate') ? 'Ja existe uma empresa com esse nome' : err.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          Prestadores de rastreamento (o campo <strong>&quot;Rastreador por&quot;</strong> da ficha do veiculo).
          Cadastre aqui as rastreadoras parceiras; depois basta selecionar no veiculo junto com o IMEI e o
          numero do chip.
        </p>
        <Button onClick={novo}><Plus className="h-4 w-4" /> Nova Rastreadora</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Empresa</th>
              <th className="px-4 py-2">CNPJ</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Plataforma</th>
              <th className="px-4 py-2">Ativa</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {(empresas ?? []).map((e) => (
              <tr key={e.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2"><Satellite className="h-4 w-4 text-cyan-600" /> {e.nome}</span>
                  {e.razao_social && <span className="block text-xs text-slate-400">{e.razao_social}</span>}
                </td>
                <td className="px-4 py-2 font-mono text-slate-600">{e.cnpj ? formatarCNPJ(e.cnpj) : '—'}</td>
                <td className="px-4 py-2 text-slate-600">
                  {[e.contato, e.telefone ? formatarTelefone(e.telefone) : null].filter(Boolean).join(' · ') || '—'}
                  {e.email && <span className="block text-xs text-slate-400">{e.email}</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {e.plataforma_url ? (
                    <a href={e.plataforma_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-700 hover:underline">
                      Abrir <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : '—'}
                </td>
                <td className="px-4 py-2">{e.ativo ? <span className="text-emerald-600">Sim</span> : <span className="text-slate-400">Nao</span>}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => { setEd(e); setAberto(true); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {!isLoading && (empresas ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nenhuma empresa de rastreamento cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={ed?.id ? `Editar ${ed.nome}` : 'Nova Empresa de Rastreamento'} tamanho="lg">
        <form onSubmit={submit} className="space-y-3">
          <FormField label="CNPJ">
            <div className="flex gap-2">
              <Input
                value={ed?.cnpj ? formatarCNPJ(ed.cnpj) : ''}
                onChange={(e) => setF({ cnpj: soDigitos(e.target.value).slice(0, 14) })}
                placeholder="00.000.000/0000-00"
                className="mt-0 font-mono"
              />
              <Button type="button" variant="secondary" onClick={consultar} disabled={consultando} className="shrink-0">
                {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Consultar
              </Button>
            </div>
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Nome (como aparece no veiculo) *">
              <Input value={ed?.nome ?? ''} onChange={(e) => setF({ nome: e.target.value })} placeholder="Ex.: Smart Tracker" />
            </FormField>
            <FormField label="Razao social">
              <Input value={ed?.razao_social ?? ''} onChange={(e) => setF({ razao_social: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Contato">
              <Input value={ed?.contato ?? ''} onChange={(e) => setF({ contato: e.target.value })} placeholder="Pessoa de contato" />
            </FormField>
            <FormField label="Telefone">
              <Input value={ed?.telefone ?? ''} onChange={(e) => setF({ telefone: e.target.value })} placeholder="(00) 00000-0000" />
            </FormField>
            <FormField label="E-mail">
              <Input type="email" value={ed?.email ?? ''} onChange={(e) => setF({ email: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Plataforma de rastreamento (URL)">
            <Input name="plataforma_url" value={ed?.plataforma_url ?? ''} onChange={(e) => setF({ plataforma_url: e.target.value })} placeholder="https://..." />
          </FormField>
          <FormField label="Observacoes">
            <Textarea rows={2} value={ed?.observacoes ?? ''} onChange={(e) => setF({ observacoes: e.target.value })} />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={ed?.ativo ?? true} onChange={(e) => setF({ ativo: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Ativa (aparece na selecao do veiculo)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
