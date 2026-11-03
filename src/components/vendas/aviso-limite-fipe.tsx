'use client';

import { AlertTriangle, Ban, Radar, ShieldCheck } from 'lucide-react';
import { MoneyInput } from '@/components/ui/field';
import {
  erroValorProtegido, textoAcimaDoLimite, textoProtecaoLimitada, type DecisaoLimite,
} from '@/lib/limite-fipe';

/**
 * FIPE acima da tabela do tipo (0165): a cotacao para e pergunta. Usado na
 * captura (CRM e portal do vendedor), na edicao da cotacao e no hotlink.
 */
export function AvisoLimiteFipe({
  fipe, limite, tipoNome, decisao, valorProtegido, onDecisao, onValorProtegido, rastreamentoDisponivel = true, avisoRastreamento, textoRecusa,
}: {
  fipe: number;
  limite: number;
  tipoNome?: string | null;
  decisao: DecisaoLimite | null;
  valorProtegido: number | null;
  onDecisao: (d: DecisaoLimite) => void;
  onValorProtegido: (v: number | null) => void;
  rastreamentoDisponivel?: boolean;
  /** Por que o rastreamento nao sai daqui (ex.: na edicao, o tipo nao muda). */
  avisoRastreamento?: string;
  /** O que dizer ao recusar (na pagina publica, quem le e o proprio cliente). */
  textoRecusa?: string;
}) {
  const erro = decisao === 'LIMITE' ? erroValorProtegido(valorProtegido, fipe, limite) : null;
  const opcao = (d: DecisaoLimite, Icone: typeof ShieldCheck, titulo: string, sub: string, desligada = false) => (
    <button type="button" disabled={desligada} onClick={() => onDecisao(d)}
      className={`flex flex-1 items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition disabled:opacity-40 ${
        decisao === d ? 'border-cyan-500 bg-cyan-50/60 ring-1 ring-cyan-400' : 'border-slate-200 bg-superficie hover:border-slate-300'
      }`}>
      <Icone className="mt-0.5 h-4 w-4 flex-none text-cyan-600" />
      <span><b className="block text-[13px] text-slate-800">{titulo}</b><span className="text-slate-500">{sub}</span></span>
    </button>
  );

  return (
    <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50/70 p-3">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">FIPE acima do limite da tabela</p>
          <p className="mt-0.5 text-xs text-amber-900/80">{textoAcimaDoLimite(fipe, limite, tipoNome)}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {opcao('LIMITE', ShieldCheck, 'Proteger pelo limite', 'Informe o valor protegido (base da mensalidade)')}
        {opcao('RASTREAMENTO', Radar, 'Só rastreamento', avisoRastreamento ?? 'Sem proteção do veículo', !rastreamentoDisponivel)}
        {opcao('RECUSAR', Ban, 'Recusar', 'Acima da tabela')}
      </div>

      {decisao === 'LIMITE' && (
        <div className="rounded-xl border border-slate-200 bg-superficie p-3">
          <label className="text-xs font-semibold text-slate-700">Valor protegido (até {limite.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</label>
          <div className="mt-1 max-w-xs">
            <MoneyInput value={valorProtegido} onChange={onValorProtegido} placeholder="0,00" />
          </div>
          {erro
            ? <p className="mt-1 text-xs text-rose-600">{erro}</p>
            : valorProtegido != null && <p className="mt-1 text-xs text-slate-500">{textoProtecaoLimitada(valorProtegido, fipe)}</p>}
        </div>
      )}
      {decisao === 'RASTREAMENTO' && !rastreamentoDisponivel && !avisoRastreamento && (
        <p className="text-xs text-rose-600">Não há tipo de veículo de rastreamento cadastrado (Configurações → Tipos de Veículo).</p>
      )}
      {decisao === 'RECUSAR' && (
        <p className="rounded-xl bg-superficie p-3 text-xs text-slate-700">
          {textoRecusa ?? 'Adesão recusada: a FIPE passa do limite da tabela de preços. Nada foi cotado; avise o cliente.'}
        </p>
      )}
    </div>
  );
}

/** A faixa discreta que acompanha a cotação limitada. */
export function FaixaProtecaoLimitada({ protegido, mercado }: { protegido: number; mercado: number }) {
  return (
    <p className="flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-none" /> {textoProtecaoLimitada(protegido, mercado)}
    </p>
  );
}
