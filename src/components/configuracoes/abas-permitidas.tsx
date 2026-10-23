'use client';

import { usePathname } from 'next/navigation';
import { Eye } from 'lucide-react';
import { abaConfiguracaoDaRota, acoesNaAba } from '@/lib/permissoes';

/**
 * Quem nao e admin entra nas Configuracoes so pelas abas liberadas no perfil
 * ou como extra (0141; Termos desde a 0123). A faixa diz o que a pessoa faz na
 * aba (Ver/Criar/Editar/Excluir) — quem grava e o banco, que recusa o resto.
 */
export function AbasPermitidas({ permitidas, permissoes, children }: {
  permitidas: string[]; permissoes: string[]; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const liberada = permitidas.some((h) => pathname === h || pathname.startsWith(h + '/'));
  if (!liberada) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Acesso restrito. Seu perfil não abre esta aba das Configurações — escolha uma das abas acima
        ou peça ao administrador para liberar em Configurações → Usuários → Permissões.
      </div>
    );
  }
  const aba = abaConfiguracaoDaRota(pathname);
  const acoes = aba ? acoesNaAba(aba.chave, false, permissoes) : null;
  const pode = acoes
    ? [acoes.criar && 'incluir', acoes.editar && 'alterar', acoes.excluir && 'excluir'].filter(Boolean) as string[]
    : [];
  const naoPode = acoes
    ? [!acoes.criar && 'incluir', !acoes.editar && 'alterar', !acoes.excluir && 'excluir'].filter(Boolean) as string[]
    : [];
  return (
    <div className="space-y-4">
      {aba && acoes && naoPode.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-superficie-alta px-4 py-3 text-sm text-slate-600">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          {acoes.soConsulta ? (
            <span>
              <strong className="text-slate-800">Somente consulta.</strong> Seu perfil vê {aba.rotulo}, mas não altera:
              incluir, alterar e excluir serão recusados.
            </span>
          ) : (
            <span>
              <strong className="text-slate-800">Seu perfil pode {juntar(pode)}</strong> em {aba.rotulo}.
              {' '}{capitalizar(juntar(naoPode))} será recusado.
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function juntar(itens: string[]) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

function capitalizar(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
