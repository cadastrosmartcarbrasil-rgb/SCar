'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Save, Timer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { useTiposEvento } from '@/hooks/use-config';
import {
  useExcluirModeloDocumento,
  useMarcosPrazo,
  useModelosDocumentoEvento,
  useSalvarMarcosPrazo,
  useSalvarModeloDocumento,
} from '@/hooks/use-prazo-eventos';
import { PRAZO_REGULATORIO_DIAS, validarMarcos, type MarcosPrazo } from '@/lib/prazo-regulatorio';

// A documentacao EXIGIDA do evento (0113). E ela que decide quando os 90 dias
// do Art. 22 (CNSP 491/2026) comecam: o prazo corre quando o ultimo documento
// OBRIGATORIO foi entregue. A lista vale para os eventos abertos daqui em
// diante (e e aplicada de novo quando o tipo do evento e definido).
export default function DocumentosEventoPage() {
  const { data: modelos, isLoading } = useModelosDocumentoEvento();
  const { data: tipos } = useTiposEvento();
  const salvar = useSalvarModeloDocumento();
  const excluir = useExcluirModeloDocumento();
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [obrig, setObrig] = useState(true);
  const erro = (e: unknown) => toast.error((e as Error).message);

  return (
    <div className="max-w-4xl space-y-6">
      <MarcosPrazoConfig />
      <h2 className="text-base font-semibold text-slate-800">Documentos exigidos no evento</h2>
      <p className="text-sm text-slate-500">
        Documentos que o associado precisa entregar no evento. Os <b>obrigatórios</b> decidem o início do prazo
        regulatório de 90 dias (Art. 22, CNSP 491/2026): enquanto falta um, o prazo não corre; quando o último chega, ele
        começa na data da entrega. Ajuste a lista ao que o contrato da associação exige.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px_auto_auto] sm:items-center">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Boletim de Ocorrência" className="mt-0" />
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-0">
          <option value="">Todos os tipos de evento</option>
          {(tipos ?? []).map((t) => (
            <option key={t.id} value={t.id}>Só para: {t.nome}</option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={obrig} onChange={(e) => setObrig(e.target.checked)} /> Obrigatório
        </label>
        <Button
          disabled={!nome.trim() || salvar.isPending}
          onClick={() =>
            salvar.mutate(
              { nome, tipo_evento_id: tipo || null, obrigatorio: obrig },
              {
                onSuccess: () => {
                  setNome('');
                  toast.success('Documento incluído na lista.');
                },
                onError: erro,
              },
            )
          }
        >
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-superficie">
        {isLoading && <li className="px-4 py-3 text-sm text-slate-400">Carregando...</li>}
        {(modelos ?? []).map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <div className={m.ativo ? '' : 'opacity-50'}>
              <p className="font-medium text-slate-800">{m.nome}</p>
              <p className="text-xs text-slate-500">
                {m.tipos_evento?.nome ? `Só para ${m.tipos_evento.nome}` : 'Todos os tipos'}
                {m.descricao ? ` · ${m.descricao}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={m.obrigatorio}
                  onChange={(e) => salvar.mutate({ ...m, obrigatorio: e.target.checked }, { onError: erro })}
                />
                Obrigatório
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={m.ativo}
                  onChange={(e) => salvar.mutate({ ...m, ativo: e.target.checked }, { onError: erro })}
                />
                Ativo
              </label>
              <button
                title="Excluir da lista (os eventos que já pediram este documento não mudam)"
                onClick={() => {
                  if (confirm(`Excluir "${m.nome}" da lista? Os eventos que já pediram este documento não mudam.`))
                    excluir.mutate(m.id, { onError: erro });
                }}
              >
                <Trash2 className="h-4 w-4 text-rose-400 hover:text-rose-600" />
              </button>
            </div>
          </li>
        ))}
        {!isLoading && (modelos ?? []).length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-400">Nenhum documento na lista.</li>
        )}
      </ul>
      <p className="text-xs text-slate-400">
        Mudar a lista não altera os eventos em andamento: cada evento guarda o seu próprio checklist.
      </p>
    </div>
  );
}

// Os marcos dos alertas do prazo regulatorio (0114). Os 90 dias sao o teto legal
// (Art. 22, CNSP 491/2026) e nao se configuram; os 4 marcos sim, so pelo admin.
const CAMPOS_MARCO: { chave: keyof MarcosPrazo; rotulo: string; ajuda: string; cor: string }[] = [
  { chave: 'aviso', rotulo: 'Aviso preventivo', ajuda: 'primeiro alerta, ainda verde', cor: 'border-emerald-300' },
  { chave: 'atencao', rotulo: 'Atenção', ajuda: 'meio do caminho, amarelo', cor: 'border-amber-300' },
  { chave: 'urgencia', rotulo: 'Urgência', ajuda: 'risco operacional, laranja', cor: 'border-orange-300' },
  { chave: 'critico', rotulo: 'Crítico', ajuda: 'vermelho, e-mail para a diretoria', cor: 'border-rose-300' },
];

function MarcosPrazoConfig() {
  const { marcos, isLoading } = useMarcosPrazo();
  const salvar = useSalvarMarcosPrazo();
  const [form, setForm] = useState<MarcosPrazo>(marcos);
  useEffect(() => setForm(marcos), [marcos]);
  const erro = validarMarcos(form);
  const mudou = CAMPOS_MARCO.some((c) => form[c.chave] !== marcos[c.chave]);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-superficie p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
        <Timer className="h-5 w-5 text-brand-600" /> Prazo regulatório e marcos de alerta (SLA)
      </h2>
      <p className="text-sm text-slate-500">
        O prazo para regular e liquidar o evento e de <b>{PRAZO_REGULATORIO_DIAS} dias corridos</b> (Art. 22 da Resolução
        CNSP 491/2026), contados do aviso junto com a documentação completa — esse número e legal e não se altera. Os
        marcos abaixo decidem quando cada alerta dispara e a cor do evento no Kanban, no painel e na ficha. Acima de{' '}
        {PRAZO_REGULATORIO_DIAS} dias o evento fica <b>vencido</b> (bloqueio de recusa).
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {CAMPOS_MARCO.map((c) => (
          <label key={c.chave} className={`rounded-lg border-l-4 ${c.cor} bg-fundo p-3`}>
            <span className="block text-xs font-semibold uppercase text-slate-600">{c.rotulo}</span>
            <span className="mt-1 flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={PRAZO_REGULATORIO_DIAS}
                value={form[c.chave]}
                disabled={isLoading}
                onChange={(e) => setForm((f) => ({ ...f, [c.chave]: Number(e.target.value) }))}
                className="mt-0 w-20 text-right"
              />
              <span className="text-sm text-slate-600">dias</span>
            </span>
            <span className="mt-1 block text-[11px] text-slate-500">{c.ajuda}</span>
          </label>
        ))}
        <div className="rounded-lg border-l-4 border-rose-700 bg-fundo p-3">
          <span className="block text-xs font-semibold uppercase text-slate-600">Vencido</span>
          <span className="mt-1 block text-sm font-medium text-slate-800">acima de {PRAZO_REGULATORIO_DIAS} dias</span>
          <span className="mt-1 block text-[11px] text-slate-500">fixo pela norma; e-mail para a diretoria</span>
        </div>
      </div>
      {erro && <p className="text-sm text-rose-600">{erro}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Mudar um marco recalcula na hora a cor de todos os eventos em aberto. Alertas já disparados ficam na trilha.
        </p>
        <Button
          disabled={!mudou || !!erro || salvar.isPending}
          onClick={() =>
            salvar.mutate(form, {
              onSuccess: () => toast.success('Marcos do prazo atualizados.'),
              onError: (e) => toast.error((e as Error).message),
            })
          }
        >
          <Save className="h-4 w-4" /> Salvar marcos
        </Button>
      </div>
    </section>
  );
}
