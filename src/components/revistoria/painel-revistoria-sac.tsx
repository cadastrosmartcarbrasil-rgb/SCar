'use client';

// A revistoria DENTRO do SAC (0137). Ao abrir o associado o atendente ja ve:
// precisa de revistoria? O link ja foi? O associado ja mandou? Esta liberada?
// E em cada passo a pergunta seguinte: gerar o link -> (fila analisa) ->
// gerar a 2a via. A gestao completa continua em Cobranca -> Revistorias.
import { useState } from 'react';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RevistoriaNecessaria } from '@/components/revistoria/revistoria-necessaria';
import { ModalBoletoAposRevistoria } from '@/components/revistoria/boleto-apos-revistoria';
import { useRevistoriaExigida } from '@/hooks/use-revistoria';
import { resumoExigencia, textoAtraso } from '@/lib/revistoria';

export function PainelRevistoriaSac({ clienteId, nome, celular, diasAtraso }: {
  clienteId: string;
  nome: string | null | undefined;
  celular: string | null | undefined;
  diasAtraso: number;
}) {
  // Sem atraso nao ha o que perguntar: nem consulta.
  const q = useRevistoriaExigida(diasAtraso > 0 ? clienteId : null, null);
  const [boletoDe, setBoletoDe] = useState<string | null>(null);
  const linhas = q.data ?? [];
  if (linhas.length === 0) return null;

  const r = resumoExigencia(linhas);
  const emAnalise = linhas.some((l) => l.situacao === 'EM_ANALISE');
  const titulo = r.bloqueia
    ? <>{textoAtraso(diasAtraso)} — a 2ª via só sai com a <b>revistoria do veículo</b>. {emAnalise ? 'O associado já enviou: falta a análise.' : 'Gerar o link para o associado?'}</>
    : <>Revistoria liberada — a 2ª via já pode ser gerada.</>;

  return (
    <div className="space-y-1">
      <RevistoriaNecessaria
        linhas={linhas} nome={nome} celular={celular} titulo={titulo}
        acaoLiberada={(l) => (
          <Button className="px-2.5 py-1.5 text-xs" onClick={() => setBoletoDe(l.veiculo_id)}>
            <Receipt className="h-3.5 w-3.5" /> Gerar a 2ª via agora
          </Button>
        )}
      />
      <p className="text-right text-xs text-slate-400">
        <Link href="/cobrancas/revistorias" className="hover:text-cyan-700 hover:underline">Todas as revistorias →</Link>
      </p>
      {boletoDe && (
        <ModalBoletoAposRevistoria clienteId={clienteId} veiculoId={boletoDe} onClose={() => setBoletoDe(null)} />
      )}
    </div>
  );
}
