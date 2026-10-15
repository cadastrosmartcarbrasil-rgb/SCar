'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useAdiado } from '@/hooks/use-adiado';
import { useAssociadoResumo, useBuscaAssociados } from '@/hooks/use-associados';
import { formatarDocumento } from '@/lib/documento';

/**
 * Escolher associado DIGITANDO (nome, CPF/CNPJ ou matricula), ate 20 resultados.
 * Substitui o <select> com a base inteira (5.500 opcoes) que obrigava a tela a
 * baixar todos os associados antes de abrir.
 */
export function SeletorAssociado({ value, onChange, placeholder, permiteLimpar = true }: {
  value: string | null | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
  permiteLimpar?: boolean;
}) {
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const adiado = useAdiado(termo);
  const { data: escolhido } = useAssociadoResumo(value || null);
  const { data: achados, isFetching } = useBuscaAssociados(adiado);

  if (value && !aberto) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-superficie px-3 py-2 text-sm">
        <span className="flex-1 truncate text-slate-800">
          {escolhido
            ? `${escolhido.matricula ? `${escolhido.matricula} - ` : ''}${escolhido.nome_razao_social}`
            : 'Carregando...'}
        </span>
        <button type="button" onClick={() => { setAberto(true); setTermo(''); }}
          className="text-xs text-cyan-700 hover:underline">trocar</button>
        {permiteLimpar && (
          <button type="button" onClick={() => onChange('')} aria-label="Limpar" className="text-slate-400 hover:text-rose-500">
            <X className="h-4 w-4" />
          </button>
        )}
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
        onKeyDown={(e) => { if (e.key === 'Escape' && value) setAberto(false); }}
        placeholder={placeholder ?? 'Digite nome, CPF/CNPJ ou matricula'}
        className="w-full rounded-md border border-slate-300 bg-superficie py-2 pl-9 pr-3 text-sm"
      />
      {adiado.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-superficie shadow-lg">
          {isFetching && !achados && <li className="px-3 py-2 text-xs text-slate-400">Buscando...</li>}
          {achados?.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">Nenhum associado encontrado.</li>}
          {achados?.map((a) => (
            <li key={a.id}>
              <button type="button"
                onClick={() => { onChange(a.id); setAberto(false); setTermo(''); }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="text-slate-800">{a.nome_razao_social}</span>
                <span className="ml-2 text-xs text-slate-400">
                  {a.cpf_cnpj ? formatarDocumento(a.cpf_cnpj, a.tipo_pessoa) : ''}{a.matricula ? ` · ${a.matricula}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <button type="button" onClick={() => setAberto(false)} className="mt-1 text-xs text-slate-500 hover:underline">
          cancelar troca
        </button>
      )}
    </div>
  );
}
