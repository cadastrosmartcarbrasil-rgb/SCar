'use client';

// BOLETO AVULSO do SAC (0150): cobrar do associado o que nao e mensalidade
// (adesao, vistoria, rastreador, acordo...). O boleto sai do banco PADRAO (hoje
// o Sicredi) pela mesma maquina da 2a via; o resultado (linha, PIX, PDF,
// WhatsApp e e-mail) e o mesmo cartao da negociacao.
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { useEmitirBoletoAvulso, useTiposBoletoAvulso } from '@/hooks/use-renegociacao';
import { observacaoDoAvulso, validarBoletoAvulso } from '@/lib/boleto-avulso';
import { addDias } from '@/lib/financeiro';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ResultadoEmissao } from './negociacao-boletos';

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function ModalBoletoAvulso({
  clienteId, associado, veiculo, onClose,
}: {
  clienteId: string;
  associado: string;
  /** O veiculo do atendimento; o boleto pode ser so do associado. */
  veiculo?: { id: string; rotulo: string } | null;
  onClose: () => void;
}) {
  const hoje = hojeSP();
  const tipos = useTiposBoletoAvulso();
  const emitir = useEmitirBoletoAvulso();
  const ativos = (tipos.data ?? []).filter((t) => t.ativo);

  const [tipoId, setTipoId] = useState('');
  const [doVeiculo, setDoVeiculo] = useState(!!veiculo);
  const [valor, setValor] = useState<number | null>(null);
  const [vencimento, setVencimento] = useState(addDias(hoje, 2));
  const [descricao, setDescricao] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);

  const tipo = ativos.find((t) => t.id === tipoId) ?? null;
  const veiculoId = doVeiculo && veiculo ? veiculo.id : null;
  const erro = validarBoletoAvulso({ tipo, veiculoId, valor, vencimento, descricao, hoje });

  if (resultado) {
    return (
      <Modal open onClose={onClose} title="Boleto avulso emitido" tamanho="lg">
        <ResultadoEmissao clienteId={clienteId} renegociacaoId={resultado} onClose={onClose} />
      </Modal>
    );
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (erro) return toast.error(erro);
    emitir.mutate(
      {
        cliente_id: clienteId, tipo_id: tipoId, valor: valor as number, vencimento,
        veiculo_id: veiculoId, descricao: descricao.trim() || null,
      },
      {
        onSuccess: (r) => { toast.success('Boleto emitido no banco'); setResultado(r.renegociacao_id); },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Modal open onClose={onClose} title="Emitir boleto avulso" subtitulo={associado} tamanho="lg">
      <form onSubmit={enviar} className="space-y-4">
        <p className="text-sm text-slate-500">
          Para cobranças que não são mensalidade. O boleto (com PIX) é registrado na hora no banco padrão
          e pode ser enviado ao associado por WhatsApp ou e-mail. Ele não entra na inadimplência de
          mensalidades nem bloqueia a Assistência 24h.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Tipo do boleto">
            <Select value={tipoId} onChange={(e) => setTipoId(e.target.value)} required>
              <option value="">{tipos.isLoading ? 'Carregando...' : 'Escolha...'}</option>
              {ativos.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}{t.exige_veiculo ? ' (do veículo)' : ''}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Referente a">
            <Select value={doVeiculo ? 'veiculo' : 'associado'} onChange={(e) => setDoVeiculo(e.target.value === 'veiculo')}>
              {veiculo && <option value="veiculo">Veículo {veiculo.rotulo}</option>}
              <option value="associado">Só o associado (sem veículo)</option>
            </Select>
          </FormField>
          <FormField label="Valor">
            <MoneyInput value={valor} onChange={setValor} />
          </FormField>
          <FormField label="Vencimento">
            <Input type="date" value={vencimento} min={hoje} max={addDias(hoje, 90)}
              onChange={(e) => setVencimento(e.target.value)} required />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Descrição (opcional, sai no boleto e no histórico)">
              <Textarea rows={2} maxLength={200} value={descricao} onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: re-vistoria após troca de para-brisa" />
            </FormField>
          </div>
        </div>

        {tipo && valor && valor > 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <Receipt className="mr-1 inline h-4 w-4 text-slate-400" />
            {observacaoDoAvulso(tipo.nome, descricao)} · <b>{formatCurrency(valor)}</b> · vence {formatDate(vencimento)}
            {tipo.categorias_dre && <span className="text-slate-400"> · conta {tipo.categorias_dre.codigo_estruturado} {tipo.categorias_dre.nome}</span>}
          </p>
        )}
        {erro && tipoId && <p className="text-xs text-amber-700">{erro}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!!erro || emitir.isPending}>
            {emitir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Emitir boleto
          </Button>
        </div>
      </form>
    </Modal>
  );
}
