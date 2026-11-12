'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useAdiado } from '@/hooks/use-adiado';
import { useBuscaEventosVinculo, type EventoParaVincular } from '@/hooks/use-evento-vinculo';
import { formatDate } from '@/lib/utils';

function Rotulo({ e }: { e: EventoParaVincular }) {
  return (
    <>
      <span className="font-mono text-slate-800">{e.numero_protocolo ?? 'evento'}</span>
      <span className="ml-2 text-slate-700">{e.clientes?.nome_razao_social ?? ''}</span>
      <span className="ml-2 text-xs text-slate-400">
        {[e.veiculos?.placa, e.data_ocorrencia ? formatDate(e.data_ocorrencia) : null, e.status].filter(Boolean).join(' · ')}
      </span>
    </>
  );
}

/**
 * Escolher o EVENTO digitando o numero (EVT-…, ou so os digitos finais), a placa
 * ou o nome do associado. Mostra ate 20, os mais recentes primeiro.
 */
export function SeletorEvento({ escolhido, onEscolher, onLimpar }: {
  escolhido: EventoParaVincular | null | undefined;
  onEscolher: (e: EventoParaVincular) => void;
  onLimpar: () => void;
}) {
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const adiado = useAdiado(termo);
  const { data: achados, isFetching } = useBuscaEventosVinculo(adiado);

  if (escolhido && !aberto) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-superficie px-3 py-2 text-sm">
        <span className="flex-1 truncate"><Rotulo e={escolhido} /></span>
        <button type="button" onClick={() => { setAberto(true); setTermo(''); }}
          className="text-xs text-cyan-700 hover:underline">trocar</button>
        <button type="button" onClick={onLimpar} aria-label="Desvincular do evento" title="Desvincular do evento"
          className="text-slate-400 hover:text-rose-500">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input
        autoFocus={aberto}
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && escolhido) setAberto(false); }}
        placeholder="Nº do evento (ex.: 0025), placa ou nome do associado"
        className="w-full rounded-md border border-slate-300 bg-superficie py-2 pl-9 pr-3 text-sm"
      />
      {adiado.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-superficie shadow-lg">
          {isFetching && !achados && <li className="px-3 py-2 text-xs text-slate-400">Buscando...</li>}
          {achados?.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">Nenhum evento encontrado.</li>}
          {achados?.map((e) => (
            <li key={e.id}>
              <button type="button"
                onClick={() => { onEscolher(e); setAberto(false); setTermo(''); }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                <Rotulo e={e} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {escolhido && (
        <button type="button" onClick={() => setAberto(false)} className="mt-1 text-xs text-slate-500 hover:underline">
          cancelar troca
        </button>
      )}
    </div>
  );
}
