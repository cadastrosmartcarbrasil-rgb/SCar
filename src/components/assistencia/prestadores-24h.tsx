'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Pencil, Wrench, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, MoneyInput } from '@/components/ui/field';
import {
  usePrestadores, useSalvarPrestador, useServicosAssistencia, useServicosDoPrestador,
} from '@/hooks/use-assistencia';
import {
  ModalFornecedor, formularioVazio, type FormFornecedor, type EnderecoFornecedor,
} from '@/components/fornecedores/modal-fornecedor';
import { formatCurrency } from '@/lib/utils';
import { formatarDocumento } from '@/lib/documento';
import type { FornecedoresRow } from '@/lib/database.types';

interface ServicoPrestador {
  servico_id: string;
  valor_acordado: number | null;
  valor_km: number | null;
  prazo_medio_min: number | null;
}

// O prestador da 24h E um fornecedor (0026) — desde a 0051 o CADASTRO dele
// mora num lugar so, junto com os demais fornecedores. Esta tela cuida do que
// e do modulo: quais servicos ele atende e por quanto. O botao de editar abre
// o MESMO formulario de /fornecedores, para nao existirem duas telas de
// cadastro para manter em sincronia.
export function Prestadores24h() {
  const { data: prestadores, isLoading } = usePrestadores();
  const { data: servicos } = useServicosAssistencia(true);
  const salvar = useSalvarPrestador();

  const [cadastro, setCadastro] = useState<FormFornecedor | null>(null);
  const [servicoDe, setServicoDe] = useState<FornecedoresRow | null>(null);
  const [vinculos, setVinculos] = useState<ServicoPrestador[]>([]);
  const { data: vinculosSalvos } = useServicosDoPrestador(servicoDe?.id ?? null);

  useEffect(() => {
    if (servicoDe?.id && vinculosSalvos) {
      setVinculos(vinculosSalvos.map((v) => ({
        servico_id: v.servico_id,
        valor_acordado: v.valor_acordado,
        valor_km: v.valor_km,
        prazo_medio_min: v.prazo_medio_min,
      })));
    }
  }, [servicoDe?.id, vinculosSalvos]);

  function alternarServico(servicoId: string, marcado: boolean) {
    setVinculos((v) =>
      marcado
        ? [...v, { servico_id: servicoId, valor_acordado: null, valor_km: null, prazo_medio_min: null }]
        : v.filter((x) => x.servico_id !== servicoId),
    );
  }

  function salvarServicos(e: React.FormEvent) {
    e.preventDefault();
    if (!servicoDe) return;
    salvar.mutate(
      { ...servicoDe, servicos: vinculos },
      {
        onSuccess: () => { toast.success('Servicos do prestador atualizados'); setServicoDe(null); setVinculos([]); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-500">
          Prestadores de guincho e servicos 24h, com os servicos que atendem e os valores acordados
          (usados na cotacao). O cadastro da empresa e o mesmo de{' '}
          <Link href="/fornecedores?tipo=prestador" className="text-cyan-700 hover:underline">Fornecedores</Link>.
        </p>
        <Button onClick={() => setCadastro(formularioVazio('prestador'))}>
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
                  <p className="font-medium text-slate-700">{p.nome_fantasia?.trim() || p.razao_social}</p>
                  {p.nome_fantasia?.trim() && <p className="text-xs text-slate-400">{p.razao_social}</p>}
                </td>
                <td className="px-4 py-2 font-mono text-slate-600">
                  {p.documento ? formatarDocumento(p.documento, p.tipo_pessoa) : '—'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {p.whatsapp ?? p.telefone ?? '—'}
                  {p.email && <span className="block text-slate-400">{p.email}</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{p.cobertura ?? '—'}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${p.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setServicoDe(p)}>
                      <Wrench className="h-3.5 w-3.5" /> Servicos e valores
                    </Button>
                    <Button variant="ghost" className="px-2 py-1 text-xs"
                      onClick={() => setCadastro({ ...p, endereco: (p.endereco as EnderecoFornecedor) ?? {} })}>
                      <Pencil className="h-3.5 w-3.5" /> Cadastro
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        <Link href="/fornecedores?tipo=prestador" className="inline-flex items-center gap-1 text-cyan-700 hover:underline">
          Ver todos os fornecedores <ExternalLink className="h-3 w-3" />
        </Link>
      </p>

      {/* Cadastro da empresa: o mesmo formulario de /fornecedores */}
      {cadastro && (
        <ModalFornecedor aberto inicial={cadastro} onClose={() => setCadastro(null)} />
      )}

      {/* O que e desta tela: servicos atendidos e valores acordados */}
      <Modal open={!!servicoDe} onClose={() => setServicoDe(null)} tamanho="lg"
        title="Servicos e valores"
        subtitulo={servicoDe ? (servicoDe.nome_fantasia?.trim() || servicoDe.razao_social) : undefined}>
        <form onSubmit={salvarServicos} className="space-y-3">
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
                        <MoneyInput value={v.valor_acordado ?? 0}
                          onChange={(val) => setVinculos((lst) => lst.map((x) => x.servico_id === s.id ? { ...x, valor_acordado: val } : x))} />
                      </div>
                      {s.cobra_km_excedente && (
                        <>
                          <span className="text-xs text-slate-400">km</span>
                          <div className="w-24">
                            <MoneyInput value={v.valor_km ?? 0}
                              onChange={(val) => setVinculos((lst) => lst.map((x) => x.servico_id === s.id ? { ...x, valor_km: val } : x))} />
                          </div>
                        </>
                      )}
                      <span className="text-xs text-slate-400">prazo (min)</span>
                      <Input type="number" min={0} className="mt-0 w-20" value={v.prazo_medio_min ?? ''}
                        onChange={(e) => setVinculos((lst) => lst.map((x) => x.servico_id === s.id
                          ? { ...x, prazo_medio_min: e.target.value ? Number(e.target.value) : null } : x))} />
                    </>
                  )}
                </div>
              );
            })}
            {(servicos ?? []).length === 0 && (
              <p className="text-sm text-slate-400">Cadastre os servicos 24h primeiro (aba Servicos 24h).</p>
            )}
          </div>

          {vinculos.length > 0 && (
            <p className="text-xs text-slate-500">
              Menor valor acordado: {formatCurrency(Math.min(...vinculos.map((v) => Number(v.valor_acordado ?? 0))))}
            </p>
          )}

          <FormField label="Observacoes do prestador">
            <Input value={servicoDe?.observacoes ?? ''}
              onChange={(e) => setServicoDe((p) => (p ? { ...p, observacoes: e.target.value } : p))} />
          </FormField>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setServicoDe(null)}>Cancelar</Button>
            <Button type="submit" disabled={salvar.isPending}>Salvar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
