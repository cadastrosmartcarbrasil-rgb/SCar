'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { useTiposEvento } from '@/hooks/use-config';
import {
  useExcluirModeloDocumento,
  useModelosDocumentoEvento,
  useSalvarModeloDocumento,
} from '@/hooks/use-prazo-eventos';

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
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-slate-500">
        Documentos que o associado precisa entregar no evento. Os <b>obrigatorios</b> decidem o inicio do prazo
        regulatorio de 90 dias (Art. 22, CNSP 491/2026): enquanto falta um, o prazo nao corre; quando o ultimo chega, ele
        comeca na data da entrega. Ajuste a lista ao que o contrato da associacao exige.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px_auto_auto] sm:items-center">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Boletim de Ocorrencia" className="mt-0" />
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-0">
          <option value="">Todos os tipos de evento</option>
          {(tipos ?? []).map((t) => (
            <option key={t.id} value={t.id}>So para: {t.nome}</option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={obrig} onChange={(e) => setObrig(e.target.checked)} /> Obrigatorio
        </label>
        <Button
          disabled={!nome.trim() || salvar.isPending}
          onClick={() =>
            salvar.mutate(
              { nome, tipo_evento_id: tipo || null, obrigatorio: obrig },
              {
                onSuccess: () => {
                  setNome('');
                  toast.success('Documento incluido na lista.');
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
                {m.tipos_evento?.nome ? `So para ${m.tipos_evento.nome}` : 'Todos os tipos'}
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
                Obrigatorio
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
                title="Excluir da lista (os eventos que ja pediram este documento nao mudam)"
                onClick={() => {
                  if (confirm(`Excluir "${m.nome}" da lista? Os eventos que ja pediram este documento nao mudam.`))
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
        Mudar a lista nao altera os eventos em andamento: cada evento guarda o seu proprio checklist.
      </p>
    </div>
  );
}
