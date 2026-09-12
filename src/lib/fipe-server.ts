import {
  combustivelEnum, parseValor, registroDaPlaca,
  type FipeValor, type RegistroPlaca,
} from '@/lib/fipe';

/**
 * Consulta a Placa Fipe DIRETO do servidor.
 *
 * O cliente do navegador (`src/lib/fipe.ts`) passa pelo proxy `/api/fipe`, que
 * exige sessao — correto para as telas internas, inutil para a pagina publica
 * do hotlink, onde o visitante nao tem login. Aqui a chamada sai do servidor
 * com o token do ambiente, sem expor nada ao browser.
 */
export function normalizarValorFipe(raw: unknown): FipeValor {
  const o = (raw ?? {}) as Record<string, unknown>;
  const ano = Number(String(o.ano_modelo ?? o.anoModelo ?? '').replace(/\D/g, ''));
  return {
    valor: parseValor(o.valor ?? o.valorVeiculo),
    codigoFipe: (o.codigo_fipe ?? o.codFipe ?? null) as string | null,
    referencia: (o.mes_referencia ?? o.refMes ?? o.referencia ?? null) as string | null,
    marca: (o.marca ?? o.nomeMarca ?? null) as string | null,
    modelo: (o.modelo ?? o.nomeModelo ?? null) as string | null,
    anoModelo: Number.isFinite(ano) && ano > 0 ? ano : null,
    combustivel: combustivelEnum((o.combustivel ?? o.tipoCombustivel) as string),
    bruto: o,
  };
}

/**
 * O que a consulta por placa devolve: a AVALIACAO e o REGISTRO do documento.
 * Sao dois blocos distintos da mesma resposta — ver `registroDaPlaca`.
 */
export interface ConsultaPlaca {
  valor: FipeValor | null;
  registro: RegistroPlaca | null;
}

/** Placa -> FIPE + registro. Devolve null quando nao ha token ou a API falha. */
export async function consultarPlacaNoServidor(placa: string): Promise<ConsultaPlaca | null> {
  const token = process.env.PLACAFIPE_TOKEN;
  if (!token) return null;
  const base = (process.env.PLACAFIPE_BASE || 'https://api.placafipe.com.br').replace(/\/+$/, '');

  try {
    const res = await fetch(`${base}/getplacafipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ placa, token }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const lista = Array.isArray(data?.fipe) ? data.fipe : Array.isArray(data?.dados) ? data.dados : [];
    const opcoes = lista.map(normalizarValorFipe).filter((v: FipeValor) => v.valor != null);
    return {
      valor: opcoes[0] ?? null,
      registro: registroDaPlaca(data?.informacoes_veiculo ?? data?.veiculo),
    };
  } catch {
    return null;
  }
}
