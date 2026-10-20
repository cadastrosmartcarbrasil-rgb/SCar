'use client';

// Editar o evento depois de aberto (pedido do usuario, 17/10/2026: "nao consegui
// editar o evento para preencher dados faltantes"). Os mesmos campos da abertura,
// menos o veiculo/associado, que definem o evento. Quem pode: o perfil com
// `eventos.editar` (o banco confere por `pode_tratar_evento`, RLS da 0077/0111).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, MapPin, FileText } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField, Input, MoneyInput, Select, Textarea } from '@/components/ui/field';
import { useTiposEvento } from '@/hooks/use-config';
import { useAtualizarEvento } from '@/hooks/use-eventos';
import { buscarCep } from '@/lib/cep';
import { soDigitos } from '@/lib/documento';
import type { EventosSinistroRow, Json, TipoEnvolvimento } from '@/lib/database.types';

interface LocalEvento {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  [key: string]: string | undefined;
}

type Form = {
  data_ocorrencia: string;
  data_comunicacao: string;
  tipo_evento_id: string;
  tipo_envolvimento: TipoEnvolvimento | '';
  possui_terceiros: boolean;
  valor_fipe_atualizado: number | null;
  valor_participacao: number | null;
  bo_numero: string;
  bo_data: string;
  bo_unidade: string;
  bo_resumo: string;
  descricao: string;
};

function doEvento(e: EventosSinistroRow): Form {
  return {
    data_ocorrencia: e.data_ocorrencia ?? '',
    data_comunicacao: e.data_comunicacao ?? '',
    tipo_evento_id: e.tipo_evento_id ?? '',
    tipo_envolvimento: e.tipo_envolvimento ?? '',
    possui_terceiros: !!e.possui_terceiros,
    valor_fipe_atualizado: e.valor_fipe_atualizado,
    valor_participacao: e.valor_participacao,
    bo_numero: e.bo_numero ?? '',
    bo_data: e.bo_data ?? '',
    bo_unidade: e.bo_unidade ?? '',
    bo_resumo: e.bo_resumo ?? '',
    descricao: e.descricao ?? '',
  };
}

export function EditarEventoModal({
  evento,
  open,
  onClose,
}: {
  evento: EventosSinistroRow;
  open: boolean;
  onClose: () => void;
}) {
  const { data: tipos } = useTiposEvento();
  const atualizar = useAtualizarEvento();
  const [form, setForm] = useState<Form>(() => doEvento(evento));
  const [local, setLocal] = useState<LocalEvento>(() => ((evento.local_evento as Json as LocalEvento) ?? {}));
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Reabre com o que esta gravado (descarta edicao abandonada).
  useEffect(() => {
    if (!open) return;
    setForm(doEvento(evento));
    setLocal(((evento.local_evento as Json as LocalEvento) ?? {}) as LocalEvento);
  }, [open, evento]);

  const setF = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setL = (patch: Partial<LocalEvento>) => setLocal((l) => ({ ...l, ...patch }));
  const avisoMudou = (form.data_comunicacao || null) !== (evento.data_comunicacao ?? null);
  const prazoCorrendo = !!evento.documentacao_completa_em;

  async function onCepBlur() {
    if (soDigitos(local.cep ?? '').length !== 8) return;
    setBuscandoCep(true);
    const res = await buscarCep(local.cep ?? '');
    setBuscandoCep(false);
    if (!res) return toast.error('CEP não encontrado');
    setLocal((l) => ({
      ...l,
      logradouro: res.logradouro || l.logradouro,
      bairro: res.bairro || l.bairro,
      cidade: res.cidade || l.cidade,
      estado: res.estado || l.estado,
    }));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.data_ocorrencia) return toast.error('Informe a data do evento');
    if (!form.data_comunicacao) return toast.error('Informe a data do aviso (comunicação)');
    if (form.data_comunicacao < form.data_ocorrencia) return toast.error('O aviso não pode ser anterior a data do evento');
    if (!form.tipo_evento_id) return toast.error('Selecione o tipo de evento');

    atualizar.mutate(
      {
        id: evento.id,
        dados: {
          data_ocorrencia: form.data_ocorrencia,
          data_comunicacao: form.data_comunicacao,
          tipo_evento_id: form.tipo_evento_id,
          tipo_envolvimento: (form.tipo_envolvimento || null) as TipoEnvolvimento | null,
          possui_terceiros: form.possui_terceiros,
          local_evento: local as Json,
          valor_fipe_atualizado: form.valor_fipe_atualizado,
          valor_participacao: form.valor_participacao,
          bo_numero: form.bo_numero || null,
          bo_data: form.bo_data || null,
          bo_unidade: form.bo_unidade || null,
          bo_resumo: form.bo_resumo || null,
          descricao: form.descricao || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Evento atualizado.');
          onClose();
        },
        onError: (er) => toast.error((er as Error).message),
      },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar evento" subtitulo={evento.numero_protocolo ?? undefined} tamanho="xl">
      <form onSubmit={salvar} className="space-y-5">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Dados do evento</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Data do evento *">
              <Input type="date" value={form.data_ocorrencia} onChange={(e) => setF({ data_ocorrencia: e.target.value })} />
            </FormField>
            <FormField label="Data do aviso (comunicação) *">
              <Input type="date" value={form.data_comunicacao} onChange={(e) => setF({ data_comunicacao: e.target.value })} />
            </FormField>
            <FormField label="Tipo de evento *">
              <Select value={form.tipo_evento_id} onChange={(e) => setF({ tipo_evento_id: e.target.value })}>
                <option value="">-- Selecione --</option>
                {(tipos ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {avisoMudou && prazoCorrendo && (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              A data do aviso entra na contagem dos 90 dias (Art. 22). Mudar aqui altera o prazo deste evento, e a troca fica
              registrada na trilha do prazo.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Há terceiros envolvidos?">
              <Select value={form.possui_terceiros ? 'S' : 'N'} onChange={(e) => setF({ possui_terceiros: e.target.value === 'S' })}>
                <option value="N">Nao</option>
                <option value="S">Sim</option>
              </Select>
            </FormField>
            <FormField label="Papel do associado">
              <Select value={form.tipo_envolvimento} onChange={(e) => setF({ tipo_envolvimento: e.target.value as TipoEnvolvimento })}>
                <option value="">A apurar</option>
                <option value="CAUSADOR">Causador</option>
                <option value="VITIMA">Vitima</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Descrição / relato">
            <Textarea rows={3} value={form.descricao} onChange={(e) => setF({ descricao: e.target.value })} />
          </FormField>
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <MapPin className="h-4 w-4" /> Local do evento
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField label="CEP">
              <Input value={local.cep ?? ''} onChange={(e) => setL({ cep: e.target.value })} onBlur={onCepBlur} placeholder={buscandoCep ? 'Buscando...' : '00000-000'} />
            </FormField>
            <FormField label="Rua / Logradouro" className="sm:col-span-3">
              <Input value={local.logradouro ?? ''} onChange={(e) => setL({ logradouro: e.target.value })} />
            </FormField>
            <FormField label="Número">
              <Input value={local.numero ?? ''} onChange={(e) => setL({ numero: e.target.value })} />
            </FormField>
            <FormField label="Complemento" className="sm:col-span-3">
              <Input value={local.complemento ?? ''} onChange={(e) => setL({ complemento: e.target.value })} />
            </FormField>
            <FormField label="Bairro" className="col-span-2">
              <Input value={local.bairro ?? ''} onChange={(e) => setL({ bairro: e.target.value })} />
            </FormField>
            <FormField label="Cidade">
              <Input value={local.cidade ?? ''} onChange={(e) => setL({ cidade: e.target.value })} />
            </FormField>
            <FormField label="UF">
              <Input maxLength={2} value={local.estado ?? ''} onChange={(e) => setL({ estado: e.target.value.toUpperCase() })} />
            </FormField>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <FileText className="h-4 w-4" /> Boletim de Ocorrência (B.O.)
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Número do B.O.">
              <Input value={form.bo_numero} onChange={(e) => setF({ bo_numero: e.target.value })} />
            </FormField>
            <FormField label="Data do B.O.">
              <Input type="date" value={form.bo_data} onChange={(e) => setF({ bo_data: e.target.value })} />
            </FormField>
            <FormField label="Unidade responsável">
              <Input value={form.bo_unidade} onChange={(e) => setF({ bo_unidade: e.target.value })} placeholder="Ex.: 1o DP" />
            </FormField>
          </div>
          <FormField label="Resumo do B.O.">
            <Textarea rows={3} value={form.bo_resumo} onChange={(e) => setF({ bo_resumo: e.target.value })} />
          </FormField>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Valores</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Valor FIPE atualizado">
              <MoneyInput value={form.valor_fipe_atualizado} onChange={(v) => setF({ valor_fipe_atualizado: v })} />
            </FormField>
            <FormField label="Participação / Franquia">
              <MoneyInput value={form.valor_participacao} onChange={(v) => setF({ valor_participacao: v })} />
            </FormField>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={atualizar.isPending}>
            {atualizar.isPending ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
