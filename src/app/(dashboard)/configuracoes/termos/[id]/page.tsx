'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Eye, FileDown, Save, Send, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, FormField } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { EditorTermo } from '@/components/termos/editor-termo';
import { PreviaTermoModal } from '@/components/termos/previa-termo';
import {
  useExcluirTermoModelo, usePublicarTermo, useSalvarTermoModelo, useTermoModelo, useVersoesTermo,
  urlPdfTermo, type ModeloEditavel,
} from '@/hooks/use-termos';
import { usePode } from '@/hooks/use-permissoes';
import { usePlanos, useTiposVeiculo } from '@/hooks/use-precificacao';
import { useRegionais } from '@/hooks/use-config';
import { TIPOS_TERMO, USOS_VEICULO, camposDoTexto, rotuloCampo, campoPorChave } from '@/lib/termos';
import { formatDateTime } from '@/lib/utils';

// As 6 declaracoes do aceite (texto exato do pedido do usuario, 19/10/2026).
// Guardadas no modelo desde ja; o fluxo de aceite entra na proxima fase.
const DECLARACOES_PADRAO = [
  'Li o contrato.',
  'Estou ciente das coberturas.',
  'Estou ciente das exclusões.',
  'Estou ciente do rateio.',
  'Estou ciente da cota de participação.',
  'Estou ciente de que proteção patrimonial mutualista não é seguro.',
];

function Marcas({ titulo, opcoes, valor, onChange, vazio }: {
  titulo: string; opcoes: { id: string; nome: string }[]; valor: string[];
  onChange: (v: string[]) => void; vazio: string;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">{titulo}</p>
      <p className="mb-1 text-xs text-slate-500">{valor.length ? `${valor.length} marcado(s)` : vazio}</p>
      <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {opcoes.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={valor.includes(o.id)}
              onChange={(e) => onChange(e.target.checked ? [...valor, o.id] : valor.filter((x) => x !== o.id))}
            />
            {o.nome}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function TermoEditarPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const modelo = useTermoModelo(id);
  const versoes = useVersoesTermo(id);
  const salvar = useSalvarTermoModelo();
  const publicar = usePublicarTermo();
  const excluir = useExcluirTermoModelo();
  const planos = usePlanos();
  const tipos = useTiposVeiculo();
  const regionais = useRegionais();
  const podeEditarModelo = usePode('termos_modelos.editar');
  const podeCriarModelo = usePode('termos_modelos.criar');
  const podeEditar = podeEditarModelo || podeCriarModelo;
  const podeExcluir = usePode('termos_modelos.excluir');

  const [f, setF] = useState<ModeloEditavel | null>(null);
  const [sujo, setSujo] = useState(false);
  const [previa, setPrevia] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [obs, setObs] = useState('');

  useEffect(() => {
    if (modelo.data && !f) setF({ ...modelo.data });
  }, [modelo.data, f]);

  const campos = useMemo(() => camposDoTexto(f?.rascunho_html ?? ''), [f?.rascunho_html]);
  const desconhecidos = campos.filter((c) => !campoPorChave(c));

  if (modelo.isLoading || !f) return <div className="h-64 animate-pulse rounded-xl bg-slate-100" />;
  if (!modelo.data) return <p className="text-sm text-slate-500">Termo não encontrado.</p>;

  const set = (p: Partial<ModeloEditavel>) => { setF((x) => ({ ...x!, ...p })); setSujo(true); };
  const declaracoes = Array.isArray(f.declaracoes) ? (f.declaracoes as string[]) : [];

  async function gravar(silencioso = false) {
    try {
      const { created_at: _c, updated_at: _u, versao_atual_id: _v, criado_por: _cp, atualizado_por: _ap, ...resto } =
        f as ModeloEditavel & { created_at?: string; updated_at?: string };
      await salvar.mutateAsync({ ...resto, id });
      setSujo(false);
      if (!silencioso) toast.success('Rascunho salvo. Publique uma versão para valer nas emissões.');
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }

  async function confirmarPublicacao() {
    if (sujo && !(await gravar(true))) return;
    try {
      const r = await publicar.mutateAsync({ modeloId: id, observacao: obs || null });
      toast.success(`Versão ${r.versao.numero} publicada.`);
      if (r.aviso) toast.warning(r.aviso);
      setPublicando(false);
      setObs('');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function apagar() {
    if (!window.confirm('Excluir este termo? Só é possível se ele nunca foi emitido.')) return;
    try {
      await excluir.mutateAsync(id);
      toast.success('Termo excluído.');
      router.push('/configuracoes/termos');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const ro = !podeEditar;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/configuracoes/termos" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Termos
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPrevia(true)}><Eye className="mr-1 h-4 w-4" /> Prévia</Button>
          {!ro && (
            <>
              <Button variant="secondary" onClick={() => gravar()} disabled={!sujo || salvar.isPending}>
                <Save className="mr-1 h-4 w-4" /> {sujo ? 'Salvar rascunho' : 'Salvo'}
              </Button>
              <Button onClick={() => setPublicando(true)}><Send className="mr-1 h-4 w-4" /> Publicar versão</Button>
            </>
          )}
          {podeExcluir && (
            <Button variant="ghost" onClick={apagar} title="Excluir"><Trash2 className="h-4 w-4 text-rose-600" /></Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-200 bg-superficie p-4 lg:grid-cols-3">
        <FormField label="Nome do termo" className="lg:col-span-2">
          <Input value={f.nome ?? ''} disabled={ro} onChange={(e) => set({ nome: e.target.value })} />
        </FormField>
        <FormField label="Tipo de termo">
          <Select value={f.tipo ?? 'CONTRATO'} disabled={ro} onChange={(e) => set({ tipo: e.target.value })}>
            {TIPOS_TERMO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </Select>
        </FormField>
        <FormField label="Descrição (uso interno)" className="lg:col-span-2">
          <Input value={f.descricao ?? ''} disabled={ro} caixa="original"
            onChange={(e) => set({ descricao: e.target.value || null })} />
        </FormField>
        <FormField label="Documento">
          <Select value={f.escopo ?? 'ASSOCIADO'} disabled={ro}
            onChange={(e) => set({ escopo: e.target.value as 'ASSOCIADO' | 'GERAL' })}>
            <option value="ASSOCIADO">Preenchido por associado/veículo</option>
            <option value="GERAL">Geral — o mesmo para todos (Regimento, Regulamento)</option>
          </Select>
        </FormField>

        {f.escopo !== 'GERAL' && (
          <>
            <Marcas titulo="Planos" vazio="Vale para todos os planos" valor={f.plano_ids ?? []}
              onChange={(v) => !ro && set({ plano_ids: v })}
              opcoes={(planos.data ?? []).map((p) => ({ id: p.id, nome: p.nome }))} />
            <Marcas titulo="Tipo de veículo" vazio="Vale para todos os tipos" valor={f.tipo_veiculo_ids ?? []}
              onChange={(v) => !ro && set({ tipo_veiculo_ids: v })}
              opcoes={(tipos.data ?? []).map((t) => ({ id: t.id, nome: t.nome }))} />
            <Marcas titulo="Uso do veículo (categoria)" vazio="Vale para todos os usos" valor={f.usos ?? []}
              onChange={(v) => !ro && set({ usos: v })}
              opcoes={USOS_VEICULO.map((u) => ({ id: u.valor, nome: u.rotulo }))} />
            <Marcas titulo="Unidades" vazio="Vale para todas as unidades" valor={f.regional_ids ?? []}
              onChange={(v) => !ro && set({ regional_ids: v })}
              opcoes={(regionais.data ?? []).map((r) => ({ id: r.id, nome: r.nome }))} />
          </>
        )}

        <div className="space-y-2 lg:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={!!f.visivel_portal} disabled={ro}
              onChange={(e) => set({ visivel_portal: e.target.checked })} />
            Disponível no portal do associado (<em>Meus documentos</em>)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.ativo !== false} disabled={ro}
              onChange={(e) => set({ ativo: e.target.checked })} />
            Ativo (inativo não aparece para emitir; o que já foi emitido continua)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={!!f.exige_aceite} disabled={ro}
              onChange={(e) => set({
                exige_aceite: e.target.checked,
                declaracoes: e.target.checked && declaracoes.length === 0 ? DECLARACOES_PADRAO : f.declaracoes,
              })} />
            Exige aceite do associado <span className="text-xs text-slate-500">(o envio para aceite entra na próxima fase)</span>
          </label>
        </div>
        {f.exige_aceite && (
          <FormField label="Declarações do aceite (uma por linha, nesta ordem)" className="lg:col-span-3">
            <Textarea rows={6} value={declaracoes.join('\n')} disabled={ro}
              onChange={(e) => set({ declaracoes: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })} />
          </FormField>
        )}
      </div>

      {desconhecidos.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          O texto cita campo(s) que não existem mais: {desconhecidos.join(', ')}. Eles sairão em branco.
        </p>
      )}

      <EditorTermo value={f.rascunho_html ?? ''} somenteLeitura={ro}
        onChange={(html) => { if (html !== f.rascunho_html) set({ rascunho_html: html }); }} />

      <p className="text-xs text-slate-500">
        {campos.length} campo(s) no texto{campos.length ? `: ${campos.slice(0, 8).map(rotuloCampo).join(' · ')}${campos.length > 8 ? '…' : ''}` : ''}.
      </p>

      <div className="rounded-xl border border-slate-200 bg-superficie p-4">
        <h3 className="mb-2 font-semibold text-slate-800">Versões publicadas</h3>
        {(versoes.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma versão publicada. Enquanto não publicar, este termo não pode ser emitido.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr><th className="py-1">Versão</th><th>Publicada em</th><th>Observação</th><th>Hash (SHA-256)</th><th /></tr>
            </thead>
            <tbody>
              {versoes.data!.map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="py-1 font-medium">
                    v{v.numero}{v.id === modelo.data?.versao_atual_id && <span className="ml-1 text-xs text-emerald-700">(atual)</span>}
                  </td>
                  <td>{formatDateTime(v.publicada_em)}</td>
                  <td className="text-slate-600">{v.observacao ?? '—'}</td>
                  <td className="codigo text-xs text-slate-500">{v.sha256.slice(0, 16)}…</td>
                  <td className="text-right">
                    {v.pdf_path && (
                      <a href={urlPdfTermo({ versao: v.id })} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                        <FileDown className="h-4 w-4" /> PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PreviaTermoModal
        aberto={previa}
        onFechar={() => setPrevia(false)}
        pedido={{ modelo_id: id, rascunho_html: f.rascunho_html ?? '' }}
        geral={f.escopo === 'GERAL'}
      />

      <Modal open={publicando} onClose={() => setPublicando(false)} title="Publicar nova versão">
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            A versão publicada fica congelada (com hash) e passa a ser a usada nas próximas emissões.
            Os termos já emitidos continuam com a versão deles.
            {f.escopo === 'GERAL' && ' O PDF do documento é gerado agora.'}
          </p>
          {sujo && <p className="text-amber-700">O rascunho tem alterações não salvas: elas serão salvas antes de publicar.</p>}
          <FormField label="O que mudou (opcional)">
            <Input value={obs} caixa="original" onChange={(e) => setObs(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPublicando(false)}>Voltar</Button>
            <Button onClick={confirmarPublicacao} disabled={publicar.isPending}>
              {publicar.isPending ? 'Publicando…' : 'Publicar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
