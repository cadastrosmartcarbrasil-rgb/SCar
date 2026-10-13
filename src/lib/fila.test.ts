import { describe, it, expect } from 'vitest';
import { criarFila, TarefaDescartada } from './fila';

/** Uma tarefa que so termina quando o teste manda. */
function adiada<T>(valor: T) {
  let soltar!: () => void;
  let falhar!: (e: unknown) => void;
  const p = new Promise<T>((res, rej) => { soltar = () => res(valor); falhar = rej; });
  return { tarefa: () => p, soltar, falhar };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('criarFila', () => {
  it('com limite 1, a segunda leitura so comeca quando a primeira termina', async () => {
    const fila = criarFila(1);
    const ordem: string[] = [];
    const a = adiada('a');
    const b = adiada('b');
    const pa = fila(() => { ordem.push('inicio a'); return a.tarefa(); });
    const pb = fila(() => { ordem.push('inicio b'); return b.tarefa(); });
    await tick();
    expect(ordem).toEqual(['inicio a']);
    expect(fila.emAndamento()).toBe(1);
    expect(fila.aguardando()).toBe(1);
    a.soltar();
    expect(await pa).toBe('a');
    await tick();
    expect(ordem).toEqual(['inicio a', 'inicio b']);
    b.soltar();
    expect(await pb).toBe('b');
    expect(fila.emAndamento()).toBe(0);
  });

  it('respeita a ordem de chegada (a tela enche de cima para baixo)', async () => {
    const fila = criarFila(1);
    const feitos: number[] = [];
    await Promise.all([1, 2, 3, 4].map((n) => fila(async () => { feitos.push(n); return n; })));
    expect(feitos).toEqual([1, 2, 3, 4]);
  });

  it('um erro nao trava a fila: a proxima roda e o erro chega a quem pediu', async () => {
    const fila = criarFila(1);
    const falha = fila(async () => { throw new Error('canceling statement due to statement timeout'); });
    const ok = fila(async () => 'seguiu');
    await expect(falha).rejects.toThrow('statement timeout');
    expect(await ok).toBe('seguiu');
  });

  it('erro sincrono da tarefa tambem nao trava a fila', async () => {
    const fila = criarFila(1);
    const falha = fila((() => { throw new Error('boom'); }) as () => Promise<never>);
    await expect(falha).rejects.toThrow('boom');
    expect(await fila(async () => 1)).toBe(1);
    expect(fila.emAndamento()).toBe(0);
  });

  it('descarta quem foi cancelado ENQUANTO esperava, sem chamar o banco', async () => {
    const fila = criarFila(1);
    const a = adiada('a');
    let chamou = false;
    const ctl = new AbortController();
    const pa = fila(a.tarefa);
    const pb = fila(async () => { chamou = true; return 'b'; }, ctl.signal);
    const pc = fila(async () => 'c');
    ctl.abort();
    a.soltar();
    await pa;
    await expect(pb).rejects.toBeInstanceOf(TarefaDescartada);
    expect(await pc).toBe('c');
    expect(chamou).toBe(false);
  });

  it('com limite 2, roda duas por vez', async () => {
    const fila = criarFila(2);
    const a = adiada(1);
    const b = adiada(2);
    void fila(a.tarefa);
    void fila(b.tarefa);
    void fila(async () => 3);
    await tick();
    expect(fila.emAndamento()).toBe(2);
    expect(fila.aguardando()).toBe(1);
    a.soltar(); b.soltar();
  });

  it('recusa limite invalido', () => {
    expect(() => criarFila(0)).toThrow();
    expect(() => criarFila(1.5)).toThrow();
  });
});
