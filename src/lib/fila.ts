// Fila de tarefas assincronas com limite de execucao simultanea.
//
// Existe por causa de `/integracao/mutual` (medido em producao em 10/10/2026):
// cada leitura daquela tela custa de 2 a 8 s SOZINHA, e o papel
// `authenticated` tem `statement_timeout` de 8 s. Disparadas juntas, elas
// disputam o mesmo banco e estouram o teto — o PostgREST devolve 500 e a secao
// desenha erro. Uma por vez, cada uma cabe. Trocar paralelismo por fila deixa a
// tela mais lenta para ENCHER e faz ela parar de FALHAR.

export class TarefaDescartada extends Error {
  constructor() {
    super('Leitura descartada antes de comecar (a tela nao precisa mais dela)');
    this.name = 'AbortError';
  }
}

export interface Fila {
  /**
   * Roda `tarefa` quando houver vaga. Se `sinal` for abortado ENQUANTO a
   * tarefa espera, ela nem comeca (rejeita com `TarefaDescartada`) — e o caso
   * de quem troca de unidade com leituras da unidade anterior ainda na fila.
   * Depois de comecar, abortar nao interrompe: o banco ja esta trabalhando.
   */
  <T>(tarefa: () => Promise<T>, sinal?: AbortSignal): Promise<T>;
  /** Quantas estao rodando agora. */
  readonly emAndamento: () => number;
  /** Quantas esperam vaga. */
  readonly aguardando: () => number;
}

export function criarFila(limite = 1): Fila {
  if (!Number.isInteger(limite) || limite < 1) throw new Error('O limite da fila deve ser >= 1');
  let ativos = 0;
  const espera: Array<() => void> = [];

  const liberar = () => {
    ativos--;
    // Pula quem foi descartado enquanto esperava (a funcao dele devolve false).
    while (espera.length && ativos < limite) espera.shift()!();
  };

  const fila = (<T>(tarefa: () => Promise<T>, sinal?: AbortSignal) =>
    new Promise<T>((resolve, reject) => {
      const rodar = () => {
        if (sinal?.aborted) { reject(new TarefaDescartada()); return; }
        ativos++;
        let p: Promise<T>;
        try { p = Promise.resolve(tarefa()); } catch (e) { p = Promise.reject(e); }
        // Libera a vaga ANTES de devolver o resultado: quem esta na fila comeca
        // ja, sem esperar o codigo de quem pediu a leitura anterior rodar.
        p.then((v) => { liberar(); resolve(v); }, (e) => { liberar(); reject(e); });
      };
      if (ativos < limite) rodar();
      else espera.push(rodar);
    })) as Fila;

  Object.defineProperty(fila, 'emAndamento', { value: () => ativos });
  Object.defineProperty(fila, 'aguardando', { value: () => espera.length });
  return fila;
}
