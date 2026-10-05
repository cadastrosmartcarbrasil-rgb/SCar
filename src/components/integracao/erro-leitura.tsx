'use client';

import { mensagemDeFalhaDeLeitura } from '@/lib/mutual';

/**
 * 🔴 ERRO DE LEITURA NUNCA PODE VIRAR ESTADO VAZIO.
 *
 * Em 02/10/2026 a tela do Mutual devolvia HTTP 500 em TODAS as leituras
 * (estouro do `statement_timeout` de 8s do papel `authenticated`) e nao dizia
 * uma palavra. O que apareceu em tela foi pior que um erro:
 *
 *  - as secoes com estado vazio mandavam repetir trabalho JA FEITO —
 *    *"Nenhuma equipe ainda. Puxe Equipes de vendas acima"* com as 52 equipes
 *    capturadas e visiveis no cartao logo acima;
 *  - as seis que so renderizavam com `data.length > 0` **desapareciam
 *    inteiras**, e foi isso que semanas antes virou o relato *"nao estao sendo
 *    listadas as filiais"*.
 *
 * Estado vazio e uma afirmacao sobre o DADO ("nao ha nada"); falha e uma
 * afirmacao sobre a CONSULTA ("nao sei"). Toda secao de leitura deste modulo
 * monta este componente ANTES do estado vazio, e todo estado vazio passou a
 * exigir `!isError`.
 */
export function ErroLeitura({ q }: { q: { isError: boolean; error: unknown } }) {
  if (!q.isError) return null;
  return (
    <div
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
    >
      <strong>A leitura falhou.</strong> {mensagemDeFalhaDeLeitura(q.error)}
    </div>
  );
}
