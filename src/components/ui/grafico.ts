import type { CSSProperties } from 'react';

/**
 * Presets de tema para os graficos Recharts.
 *
 * REGRA: eixo, grade, cursor e tooltip nunca levam hex fixo. O tema escuro
 * troca o VALOR dos tokens em `globals.css` e nao repinta o call site — hex
 * fixo aqui vira texto escuro sobre fundo escuro (contraste ~2:1).
 *
 * Como usar: o container do grafico recebe a classe `grafico-tema`, que define
 * a cor do tema; `currentColor` faz eixo/grade/cursor herdarem dela, e o texto
 * do tooltip vem por heranca. As cores das SERIES (barras, linhas, areas)
 * continuam em hex: sao identidade do dado e ja funcionam nos dois temas.
 */

/** Tick de eixo (11px) — `fill: currentColor` herda a cor do container. */
export const EIXO = { fontSize: 11, fill: 'currentColor' } as const;

/** Tick de eixo em 12px, para os paineis com respiro maior. */
export const EIXO_GRANDE = { fontSize: 12, fill: 'currentColor' } as const;

/** Linha de grade: a mesma cor do texto, bem diluida. */
export const GRADE = { stroke: 'currentColor', strokeOpacity: 0.18 } as const;

/** Linha do eixo, quando visivel. */
export const LINHA_EIXO = { stroke: 'currentColor', strokeOpacity: 0.25 } as const;

/** Realce da coluna sob o cursor do tooltip. */
export const CURSOR = { fill: 'currentColor', fillOpacity: 0.06 } as const;

/**
 * Fundo do tooltip. O Recharts pinta branco fixo por padrao (uma caixa branca
 * no tema escuro), entao a superficie vem do token; a cor do texto fica de fora
 * de proposito, para herdar do container.
 */
export const TOOLTIP: CSSProperties = {
  borderRadius: 12,
  backgroundColor: 'rgb(var(--superficie))',
  border: '1px solid rgb(var(--superficie-alta))',
  fontSize: 12,
};
