// Limitador de tentativas em memoria (por processo).
//
// Serve para os endpoints que aceitam credencial sem sessao — hoje o login do
// Portal do Associado. Nao e um WAF: e a diferenca entre um atacante testar
// milhares de CPFs por minuto e testar alguns por hora. Como a senha do
// primeiro acesso e o proprio documento (0044), esse endpoint e o alvo obvio
// do sistema, e enumerar CPF e barato.
//
// Limitacao conhecida e aceita: o contador vive na memoria do processo. O SCar
// roda em UM container (Docker + Caddy no VPS), entao isso cobre o caso real.
// Se um dia houver mais de uma instancia, trocar por Redis/tabela — a interface
// aqui nao muda.

interface Janela { tentativas: number; ate: number }

const JANELAS = new Map<string, Janela>();
const LIMPEZA_A_CADA = 500;
let contadorLimpeza = 0;

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  /** segundos ate poder tentar de novo (0 quando permitido) */
  esperar: number;
}

/**
 * Consome uma tentativa da chave. `limite` tentativas por `janelaSegundos`.
 * A janela e deslizante simples: estourou, so libera quando ela vence.
 */
export function consumirTentativa(
  chave: string,
  limite = 5,
  janelaSegundos = 600,
  agora: number = Date.now(),
): ResultadoLimite {
  if (++contadorLimpeza % LIMPEZA_A_CADA === 0) {
    for (const [k, v] of JANELAS) if (v.ate <= agora) JANELAS.delete(k);
  }

  const atual = JANELAS.get(chave);
  if (!atual || atual.ate <= agora) {
    JANELAS.set(chave, { tentativas: 1, ate: agora + janelaSegundos * 1000 });
    return { permitido: true, restantes: limite - 1, esperar: 0 };
  }

  if (atual.tentativas >= limite) {
    return { permitido: false, restantes: 0, esperar: Math.ceil((atual.ate - agora) / 1000) };
  }

  atual.tentativas += 1;
  return { permitido: true, restantes: limite - atual.tentativas, esperar: 0 };
}

/** Acerto na credencial zera o contador — quem sabe a senha nao e atacante. */
export function limparTentativas(chave: string) {
  JANELAS.delete(chave);
}

/** IP de quem chamou, atras do Caddy/proxy. */
export function ipDaRequisicao(request: Request): string {
  const h = request.headers;
  const encaminhado = h.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'desconhecido';
}

/** Apenas para teste: zera o estado do processo. */
export function _resetLimites() {
  JANELAS.clear();
  contadorLimpeza = 0;
}
