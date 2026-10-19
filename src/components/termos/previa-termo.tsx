'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, FileDown, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useBuscaVeiculos } from '@/hooks/use-veiculos';
import { abrirPdfPrevia, usePreviaTermo, type PedidoPrevia } from '@/hooks/use-termos';
import { rotuloCampo } from '@/lib/termos';

/** Lista dos campos que sairiam em branco (antes de emitir ou publicar). */
export function AvisoCamposVazios({ vazios }: { vazios: string[] }) {
  if (!vazios.length) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <p className="flex items-center gap-1 font-medium"><AlertTriangle className="h-4 w-4" /> {vazios.length} campo(s) sem dado no cadastro — sairão em branco:</p>
      <p className="mt-1">{vazios.map(rotuloCampo).join(' · ')}</p>
    </div>
  );
}

/**
 * Previa do termo preenchido. Documento por associado: escolhe um veiculo pela
 * placa (os dados reais dele); documento GERAL: so a empresa e a data.
 */
export function PreviaTermoModal({ aberto, onFechar, pedido, geral }: {
  aberto: boolean; onFechar: () => void; pedido: PedidoPrevia; geral?: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [alvo, setAlvo] = useState<{ cliente_id: string; veiculo_id: string; placa: string } | null>(null);
  const veiculos = useBuscaVeiculos(geral ? '' : busca);
  const previa = usePreviaTermo();
  const [pdf, setPdf] = useState(false);

  const pronto = geral || !!alvo;
  useEffect(() => {
    if (!aberto || !pronto) return;
    previa.mutate({ ...pedido, cliente_id: alvo?.cliente_id ?? null, veiculo_id: alvo?.veiculo_id ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, alvo?.veiculo_id, geral]);

  async function verPdf() {
    setPdf(true);
    try {
      await abrirPdfPrevia({ ...pedido, cliente_id: alvo?.cliente_id ?? null, veiculo_id: alvo?.veiculo_id ?? null });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPdf(false);
    }
  }

  return (
    <Modal open={aberto} onClose={onFechar} title="Prévia do termo" tamanho="xl"
      subtitulo={geral ? 'Documento geral' : 'Preenchido com os dados de um veículo real (nada é gravado)'}>
      <div className="space-y-3">
        {!geral && (
          <div className="relative">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-400" />
              <Input placeholder="Placa do veículo para preencher a prévia" value={busca}
                onChange={(e) => { setBusca(e.target.value); setAlvo(null); }} />
            </div>
            {!alvo && busca.trim().length >= 2 && (veiculos.data ?? []).length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-superficie shadow-lg">
                {veiculos.data!.map((v) => (
                  <button key={v.id} type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                    onClick={() => { setAlvo({ cliente_id: v.cliente_id, veiculo_id: v.id, placa: v.placa }); setBusca(v.placa); }}>
                    <span className="placa font-semibold">{v.placa}</span> · {v.marca} {v.modelo}
                    <span className="text-slate-500"> — {v.clientes?.nome_razao_social}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!pronto && <p className="text-sm text-slate-500">Escolha um veículo para ver o termo preenchido.</p>}
        {previa.isPending && <div className="h-40 animate-pulse rounded-lg bg-slate-100" />}
        {previa.isError && <p className="text-sm text-rose-700">{(previa.error as Error).message}</p>}
        {previa.data && pronto && (
          <>
            <AvisoCamposVazios vazios={previa.data.vazios} />
            <div className="flex justify-end">
              <Button variant="secondary" onClick={verPdf} disabled={pdf}>
                <FileDown className="mr-1 h-4 w-4" /> {pdf ? 'Gerando PDF…' : 'Ver em PDF'}
              </Button>
            </div>
            <div className="termo-previa max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 text-slate-900"
              dangerouslySetInnerHTML={{ __html: previa.data.html }} />
          </>
        )}
      </div>
    </Modal>
  );
}
