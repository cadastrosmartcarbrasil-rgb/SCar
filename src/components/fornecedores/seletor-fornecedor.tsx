'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, X } from 'lucide-react';
import { useFornecedores } from '@/hooks/use-fornecedores';
import { usePode } from '@/hooks/use-permissoes';
import { fornecedorCasaComBusca, ordenarFornecedores, rotuloFornecedor } from '@/lib/fornecedores';
import { formatarDocumento } from '@/lib/documento';
import { ModalFornecedor, formularioVazio } from './modal-fornecedor';

/**
 * Escolher fornecedor DIGITANDO (fantasia, razao social, cobertura, contato ou
 * CNPJ), no lugar do <select> com a lista inteira. Quem pode cadastrar
 * fornecedor (Fornecedores > Criar) ganha o "+ Cadastrar" ali mesmo, e o novo
 * ja volta escolhido.
 */
export function SeletorFornecedor({
  value, onChange, placeholder, permiteLimpar = true, permiteCadastrar = true, nomeSugerido,
}: {
  value: string | null | undefined;
  onChange: (id: string, rotulo: string) => void;
  placeholder?: string;
  permiteLimpar?: boolean;
  permiteCadastrar?: boolean;
  /** Pre-preenche a razao social no cadastro rapido. */
  nomeSugerido?: string;
}) {
  const { data: fornecedores } = useFornecedores();
  const podeCadastrar = usePode('fornecedores.criar');
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);

  const escolhido = (fornecedores ?? []).find((f) => f.id === value);
  const achados = useMemo(
    () => ordenarFornecedores((fornecedores ?? []).filter((f) => f.ativo !== false && fornecedorCasaComBusca(f, termo))).slice(0, 30),
    [fornecedores, termo],
  );

  // O cadastro abre por PORTAL e com os eventos contidos: este seletor vive
  // dentro do <form> do lancamento, e o submit do fornecedor borbulharia pela
  // arvore do React ate ele — gravando o lancamento junto.
  const parar = (e: React.SyntheticEvent) => e.stopPropagation();
  const cadastro = cadastrando && typeof document !== 'undefined' && createPortal(
    <div onSubmit={parar} onClick={parar} onPointerDown={parar} onPointerUp={parar} onKeyDown={parar}>
    <ModalFornecedor
      aberto
      inicial={{ ...formularioVazio(), razao_social: (termo || nomeSugerido || '').toUpperCase() }}
      onClose={() => setCadastrando(false)}
      onSaved={(id) => {
        onChange(id, (termo || nomeSugerido || '').toUpperCase());
        setAberto(false);
        setTermo('');
      }}
      titulo="Cadastrar fornecedor"
    />
    </div>,
    document.body,
  );

  if (value && !aberto) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-superficie px-3 py-2 text-sm">
        <span className="flex-1 truncate text-slate-800">{escolhido ? rotuloFornecedor(escolhido) : 'Carregando...'}</span>
        <button type="button" onClick={() => { setAberto(true); setTermo(''); }}
          className="text-xs text-cyan-700 hover:underline">trocar</button>
        {permiteLimpar && (
          <button type="button" onClick={() => onChange('', '')} aria-label="Limpar" className="text-slate-400 hover:text-rose-500">
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
        value={termo}
        onFocus={() => setAberto(true)}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setAberto(false); }}
        placeholder={placeholder ?? 'Digite nome, fantasia ou CNPJ do fornecedor'}
        className="w-full rounded-md border border-slate-300 bg-superficie py-2 pl-9 pr-3 text-sm"
      />
      {aberto && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-superficie shadow-lg">
          {achados.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">Nenhum fornecedor encontrado.</li>}
          {achados.map((f) => (
            <li key={f.id}>
              <button type="button"
                onClick={() => { onChange(f.id, rotuloFornecedor(f)); setAberto(false); setTermo(''); }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="text-slate-800">{rotuloFornecedor(f)}</span>
                {f.documento && (
                  <span className="ml-2 text-xs text-slate-400">{formatarDocumento(f.documento, f.tipo_pessoa ?? 'PJ')}</span>
                )}
              </button>
            </li>
          ))}
          {permiteCadastrar && podeCadastrar && (
            <li className="border-t border-slate-100">
              <button type="button" onClick={() => setCadastrando(true)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-cyan-700 hover:bg-cyan-50">
                <Plus className="h-4 w-4" /> Cadastrar {termo ? `"${termo.toUpperCase()}"` : 'novo fornecedor'}
              </button>
            </li>
          )}
          <li className="border-t border-slate-100">
            <button type="button" onClick={() => setAberto(false)} className="w-full px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50">
              fechar
            </button>
          </li>
        </ul>
      )}
      {cadastro}
    </div>
  );
}
