'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { createClient } from '@/lib/supabase/client';
import { useTiposVeiculo } from '@/hooks/use-precificacao';
import { codigoDaPose } from '@/lib/vistoria';
import type { VistoriaFotoModeloRow } from '@/lib/database.types';

// Configuracoes -> Fotos da vistoria (0161, pedido do usuario: "o numero de
// fotos e bem maior, deixe liberado para cadastrarmos as fotos exigidas").
// Cada pose vira um passo da vistoria (CRM, portal do vendedor e o link do
// cliente) e a OBRIGATORIA entra no checklist da entrada na base.
// Gravar: admin e financeiro (policy `vfm_write`, 0040).
function usePoses() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['config', 'vistoria-fotos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vistoria_fotos_modelo')
        .select('*').order('ordem').order('nome');
      if (error) throw error;
      return (data ?? []) as VistoriaFotoModeloRow[];
    },
  });
}

function useSalvarPose() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation<void, Error, Partial<VistoriaFotoModeloRow>>({
    mutationFn: async ({ id, created_at: _c, ...p }) => {
      const { error } = id
        ? await supabase.from('vistoria_fotos_modelo').update(p).eq('id', id)
        : await supabase.from('vistoria_fotos_modelo').insert(p as VistoriaFotoModeloRow);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'vistoria-fotos'] }),
  });
}

export default function VistoriaFotosPage() {
  const { data: poses, isLoading } = usePoses();
  const { data: tipos } = useTiposVeiculo();
  const salvar = useSalvarPose();
  const [ed, setEd] = useState<Partial<VistoriaFotoModeloRow> | null>(null);
  const nomeTipo = (id: string | null) => (id ? tipos?.find((t) => t.id === id)?.nome ?? '—' : 'Todos');
  const obrigatorias = (poses ?? []).filter((p) => p.ativo && p.obrigatorio).length;

  function novo() {
    const proxima = Math.max(0, ...(poses ?? []).map((p) => p.ordem)) + 1;
    setEd({ nome: '', instrucao: '', obrigatorio: true, ativo: true, ordem: proxima, tipo_veiculo_id: null });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ed?.nome?.trim()) return toast.error('Informe o nome da foto');
    const dados = { ...ed, nome: ed.nome.trim() };
    if (!dados.id) dados.codigo = codigoDaPose(dados.nome!, (poses ?? []).map((p) => p.codigo));
    salvar.mutate(dados, {
      onSuccess: () => { toast.success('Foto salva'); setEd(null); },
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          As fotos que a vistoria da venda pede, na ordem em que aparecem para quem fotografa
          (consultor, back-office ou o próprio cliente pelo link). As <b>obrigatórias</b> entram no
          checklist: sem elas o veículo não vai para a Auditoria. Hoje: <b>{obrigatorias}</b> obrigatória(s).
        </p>
        <Button onClick={novo}><Plus className="h-4 w-4" /> Nova foto</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Ordem</th>
              <th className="px-4 py-2">Foto</th>
              <th className="px-4 py-2">Instrução</th>
              <th className="px-4 py-2">Tipo de veículo</th>
              <th className="px-4 py-2">Obrigatória</th>
              <th className="px-4 py-2">Ativa</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Carregando...</td></tr>}
            {(poses ?? []).map((p) => (
              <tr key={p.id} className={`border-b border-slate-50 last:border-0 ${p.ativo ? '' : 'opacity-60'}`}>
                <td className="tnum px-4 py-2 text-slate-500">{p.ordem}</td>
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2"><Camera className="h-4 w-4 text-cyan-600" /> {p.nome}</span>
                  <span className="block font-mono text-[0.6875rem] text-slate-400">{p.codigo}</span>
                </td>
                <td className="max-w-md px-4 py-2 text-slate-500">{p.instrucao ?? '—'}</td>
                <td className="px-4 py-2 text-slate-600">{nomeTipo(p.tipo_veiculo_id)}</td>
                <td className="px-4 py-2">{p.obrigatorio ? <span className="font-medium text-rose-700">Sim</span> : <span className="text-slate-400">Não</span>}</td>
                <td className="px-4 py-2">{p.ativo ? <span className="text-emerald-600">Sim</span> : <span className="text-slate-400">Não</span>}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => setEd(p)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && (poses ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Nenhuma foto cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!ed} onClose={() => setEd(null)} tamanho="lg" title={ed?.id ? 'Editar foto da vistoria' : 'Nova foto da vistoria'}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Nome *" className="sm:col-span-2">
              <Input value={ed?.nome ?? ''} onChange={(e) => setEd((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex.: Porta-malas aberto" />
            </FormField>
            <FormField label="Ordem">
              <Input type="number" value={ed?.ordem ?? 0} onChange={(e) => setEd((p) => ({ ...p, ordem: Number(e.target.value) || 0 }))} />
            </FormField>
          </div>
          <FormField label="Instrução de enquadramento (o que aparece para quem fotografa)">
            <Textarea rows={3} value={ed?.instrucao ?? ''} onChange={(e) => setEd((p) => ({ ...p, instrucao: e.target.value }))}
              placeholder="Ex.: Porta-malas aberto, com o estepe e o macaco à vista." />
          </FormField>
          <FormField label="Vale para">
            <Select value={ed?.tipo_veiculo_id ?? ''} onChange={(e) => setEd((p) => ({ ...p, tipo_veiculo_id: e.target.value || null }))}>
              <option value="">Todos os tipos de veículo</option>
              {(tipos ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          </FormField>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={ed?.obrigatorio ?? true} onChange={(e) => setEd((p) => ({ ...p, obrigatorio: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
              Obrigatória (entra no checklist da Auditoria)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={ed?.ativo ?? true} onChange={(e) => setEd((p) => ({ ...p, ativo: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
              Ativa
            </label>
          </div>
          {ed?.id && (
            <p className="text-[0.7188rem] text-slate-500">
              O código <span className="font-mono">{ed.codigo}</span> não muda: ele liga as fotos já enviadas a esta pose.
              Para tirar a foto da vistoria, desmarque <b>Ativa</b>.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEd(null)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
