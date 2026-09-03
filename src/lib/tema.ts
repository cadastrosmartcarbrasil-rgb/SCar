// ---------------------------------------------------------------------------
// Tema claro / escuro.
//
// Tres estados, nao dois: CLARO, ESCURO e SISTEMA. O terceiro importa — quem
// nunca escolheu nada segue a preferencia do sistema operacional, e quem
// escolheu tem a escolha respeitada mesmo que o sistema mude depois.
//
// O padrao do produto e o CLARO: e um sistema de trabalho, usado o dia inteiro
// em tela de escritorio, e a marca foi desenhada no claro. O escuro e opcao.
// ---------------------------------------------------------------------------

export const TEMAS = ['claro', 'escuro', 'sistema'] as const;
export type Tema = (typeof TEMAS)[number];

/** Onde a escolha fica guardada no navegador. */
export const CHAVE_TEMA = 'scar:tema';

export function ehTema(valor: unknown): valor is Tema {
  return typeof valor === 'string' && (TEMAS as readonly string[]).includes(valor);
}

/**
 * O que efetivamente pintar na tela.
 * `sistema` (ou lixo guardado no localStorage) cai na preferencia do SO.
 */
export function temaEfetivo(escolha: Tema | null | undefined, sistemaEscuro: boolean): 'claro' | 'escuro' {
  if (escolha === 'claro' || escolha === 'escuro') return escolha;
  return sistemaEscuro ? 'escuro' : 'claro';
}

/**
 * O botao do cabecalho alterna entre os DOIS estados visiveis, sem passar por
 * "sistema" — um ciclo de tres deixaria o usuario sem saber onde clicou. A
 * preferencia do sistema continua valendo para quem nunca tocou no botao.
 */
export function proximoTema(atual: Tema | null | undefined, sistemaEscuro: boolean): Tema {
  return temaEfetivo(atual, sistemaEscuro) === 'escuro' ? 'claro' : 'escuro';
}

/** O rotulo do botao descreve o DESTINO, que e o que o clique vai fazer. */
export function rotuloAlternancia(efetivo: 'claro' | 'escuro'): string {
  return efetivo === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
}

/**
 * Script que roda ANTES da primeira pintura, injetado no <head>.
 *
 * Sem ele a pagina nasce clara e pisca para escura quando o React monta —
 * o "flash of wrong theme". Por isso e uma string de JS cru e sincrono: nao
 * da para esperar hidratacao para decidir a cor do fundo.
 *
 * Falha em silencio de proposito: navegador com armazenamento bloqueado
 * (aba anonima restrita, cookies desligados) deve abrir no tema claro, nunca
 * quebrar a aplicacao inteira.
 */
export const SCRIPT_TEMA_INICIAL = `
(function(){
  try {
    var escolha = localStorage.getItem('${CHAVE_TEMA}');
    var sistemaEscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var escuro = escolha === 'escuro' || ((!escolha || escolha === 'sistema') && sistemaEscuro);
    document.documentElement.classList.toggle('dark', escuro);
  } catch (e) {}
})();
`.trim();
