// Regras da ASSISTENCIA 24H em TypeScript puro (sem I/O), espelhando as funcoes
// SQL da migration 0026 (elegibilidade_assistencia / situacao_assistencia_veiculo
// / confirmar_prestador_assistencia) + o modelo do comunicado (voucher) enviado
// ao prestador. Ficam aqui para uso na UI e cobertura por testes.
import type {
  ElegibilidadeAssistencia,
  SituacaoAssistencia,
  StatusAcionamento,
} from '@/lib/database.types';

// ---------------------------------------------------------------------------
// Calculo da OS (valor do servico + KM excedente)
// ---------------------------------------------------------------------------
export interface ServicoCalculo {
  cobra_km_excedente: boolean;
  valor_km_excedente: number;
  km_franquia: number;
}

/** KM que passam da franquia do servico (nunca negativo). */
export function calcularKmExcedente(kmPercorrido: number | null | undefined, kmFranquia: number): number {
  const km = Number(kmPercorrido ?? 0);
  const franquia = Number(kmFranquia ?? 0);
  return Math.max(0, Math.round((km - franquia) * 100) / 100);
}

export interface TotalOS {
  valorServico: number;
  valorKmExcedente: number;
  total: number;
}

/** Total da OS: servico + (KM excedente x valor do KM), so quando o servico cobra KM. */
export function calcularTotalOS(
  servico: ServicoCalculo,
  valorServico: number,
  kmExcedente: number,
  valorKmNegociado?: number | null,
): TotalOS {
  const base = Math.round(Number(valorServico ?? 0) * 100) / 100;
  const unit = valorKmNegociado ?? servico.valor_km_excedente ?? 0;
  const km = servico.cobra_km_excedente ? Math.max(0, Number(kmExcedente ?? 0)) : 0;
  const valorKm = Math.round(km * Number(unit ?? 0) * 100) / 100;
  return { valorServico: base, valorKmExcedente: valorKm, total: Math.round((base + valorKm) * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Trava do acionamento (financeira + cadastral + limite do opcional)
// ---------------------------------------------------------------------------
export interface Bloqueio {
  bloqueado: boolean;
  motivos: string[];
  exigeLiberacao: boolean;
}

/** Junta a situacao do veiculo com o limite do servico escolhido — mesma regra
 *  que o SQL aplica em `abrir_acionamento`. */
export function avaliarBloqueio(
  situacao: SituacaoAssistencia | null | undefined,
  elegibilidade?: ElegibilidadeAssistencia | null,
): Bloqueio {
  const motivos: string[] = [];
  if (!situacao) {
    return { bloqueado: true, motivos: ['Veiculo nao localizado'], exigeLiberacao: false };
  }
  motivos.push(...(situacao.motivos ?? []));
  if (elegibilidade && elegibilidade.computa_limite && !elegibilidade.elegivel) {
    motivos.push(
      `Limite do opcional atingido: ${elegibilidade.usados} de ${elegibilidade.limite_quantidade} uso(s) em ${elegibilidade.janela_meses} meses`,
    );
  }
  return { bloqueado: motivos.length > 0, motivos, exigeLiberacao: motivos.length > 0 };
}

/** Rotulo do consumo para o painel do atendente (tempo real). */
export function rotuloLimite(e: ElegibilidadeAssistencia): string {
  if (!e.computa_limite) return 'Sem limite';
  return `${e.usados}/${e.limite_quantidade} em ${e.janela_meses} meses`;
}

export const STATUS_ACIONAMENTO_LABEL: Record<StatusAcionamento, { label: string; cor: string }> = {
  ABERTO: { label: 'Aberto', cor: 'bg-cyan-50 text-cyan-700' },
  EM_COTACAO: { label: 'Em cotacao', cor: 'bg-amber-50 text-amber-700' },
  AUTORIZADO: { label: 'OS autorizada', cor: 'bg-brand-50 text-brand-700' },
  EM_ATENDIMENTO: { label: 'Em atendimento', cor: 'bg-sky-50 text-sky-700' },
  CONCLUIDO: { label: 'Concluido', cor: 'bg-emerald-50 text-emerald-700' },
  CANCELADO: { label: 'Cancelado', cor: 'bg-slate-100 text-slate-600' },
};

// ---------------------------------------------------------------------------
// Comunicado/voucher enviado ao prestador (e-mail e WhatsApp)
// ---------------------------------------------------------------------------
export interface DadosVoucher {
  codigo_os: string;
  protocolo: string;
  servico: string;
  empresa?: string | null;
  prestador: string;
  associado: string;
  solicitante?: string | null;
  telefone?: string | null;
  veiculo: { placa: string; marca?: string | null; modelo?: string | null; cor?: string | null };
  origem?: string | null;
  destino?: string | null;
  km_previsto?: number | null;
  valor_servico: number;
  valor_km_excedente: number;
  valor_total: number;
  prazo_estimado_min?: number | null;
  observacoes?: string | null;
  contato_central?: string | null;
}

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0));

/** Texto do comunicado (serve para WhatsApp e corpo do e-mail). */
export function montarVoucherTexto(d: DadosVoucher): string {
  const veiculo = [d.veiculo.marca, d.veiculo.modelo, d.veiculo.cor].filter(Boolean).join(' ');
  const linhas = [
    `*${(d.empresa ?? 'Smart Car Brasil').toUpperCase()} — ASSISTENCIA 24H*`,
    `Ordem de Servico: *${d.codigo_os}*  (protocolo ${d.protocolo})`,
    '',
    `Prestador: ${d.prestador}`,
    `Servico: ${d.servico}`,
    '',
    `Associado: ${d.associado}`,
    d.solicitante ? `Solicitante: ${d.solicitante}${d.telefone ? ` — ${d.telefone}` : ''}` : null,
    `Veiculo: ${d.veiculo.placa}${veiculo ? ` — ${veiculo}` : ''}`,
    '',
    d.origem ? `Local de origem: ${d.origem}` : null,
    d.destino ? `Destino: ${d.destino}` : null,
    d.km_previsto ? `KM previsto: ${d.km_previsto} km` : null,
    d.prazo_estimado_min ? `Prazo combinado: ${d.prazo_estimado_min} min` : null,
    '',
    `Valor do servico: ${brl(d.valor_servico)}`,
    d.valor_km_excedente > 0 ? `KM excedente: ${brl(d.valor_km_excedente)}` : null,
    `*Valor total autorizado: ${brl(d.valor_total)}*`,
    '',
    d.observacoes ? `Observacoes: ${d.observacoes}` : null,
    'Ao finalizar, informe a central para liberacao do pagamento.',
    d.contato_central ? `Central 24h: ${d.contato_central}` : null,
  ];
  return linhas.filter((l) => l !== null).join('\n');
}

/** Versao HTML (e-mail) do mesmo comunicado. */
export function montarVoucherHtml(d: DadosVoucher): string {
  const escapar = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const corpo = montarVoucherTexto(d)
    .split('\n')
    .map((l) => {
      const negrito = l.replace(/\*(.+?)\*/g, (_, t) => `<strong>${escapar(t)}</strong>`);
      const texto = negrito === l ? escapar(l) : negrito;
      return l.trim() === '' ? '<br/>' : `<p style="margin:2px 0">${texto}</p>`;
    })
    .join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e2b4d">${corpo}</div>`;
}

/** Link do WhatsApp com o comunicado ja preenchido (wa.me). */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const numero = digitos.startsWith('55') ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Endereco em uma linha a partir do jsonb de origem/destino. */
export function enderecoTexto(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  const partes = [o.logradouro, o.numero, o.bairro, o.cidade, o.uf, o.referencia]
    .filter((p) => typeof p === 'string' && p.trim() !== '') as string[];
  return partes.length ? partes.join(', ') : null;
}
