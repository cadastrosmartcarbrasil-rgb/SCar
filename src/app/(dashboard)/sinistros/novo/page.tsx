'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Search, Loader2, Car, UserRound, MapPin, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select, Textarea } from '@/components/ui/field';
import { useTiposEvento } from '@/hooks/use-config';
import { useBuscarVeiculoPorPlaca, useCriarEvento, type VeiculoLocalizado } from '@/hooks/use-evento-cadastro';
import { normalizarPlaca, placaValida } from '@/lib/placa';
import { buscarCep } from '@/lib/cep';
import { formatarDocumento, soDigitos } from '@/lib/documento';
import { formatCurrency } from '@/lib/utils';
import type { EnvolvidoTipo, TipoEnvolvimento } from '@/lib/database.types';

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

export default function NovoEventoPage() {
  const router = useRouter();
  const { data: tipos } = useTiposEvento();
  const buscar = useBuscarVeiculoPorPlaca();
  const criar = useCriarEvento();

  const [placa, setPlaca] = useState('');
  const [veiculo, setVeiculo] = useState<VeiculoLocalizado | null>(null);
  const [local, setLocal] = useState<LocalEvento>({});
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [form, setForm] = useState({
    data_ocorrencia: '',
    data_comunicacao: new Date().toISOString().slice(0, 10),
    envolvido_tipo: 'ASSOCIADO' as EnvolvidoTipo,
    tipo_envolvimento: '' as TipoEnvolvimento | '',
    tipo_evento_id: '',
    valor_fipe_atualizado: '' as number | '',
    valor_participacao: '' as number | '',
    bo_numero: '',
    bo_data: '',
    bo_unidade: '',
    bo_resumo: '',
    descricao: '',
  });

  async function onBuscarPlaca() {
    if (!placaValida(placa)) return toast.error('Placa invalida');
    const v = await buscar.mutateAsync(placa);
    if (!v) {
      toast.error('Veiculo nao encontrado. Cadastre o veiculo antes de abrir o evento.');
      setVeiculo(null);
      return;
    }
    setVeiculo(v);
    setForm((f) => ({ ...f, valor_fipe_atualizado: v.valor_fipe ?? '' }));
    toast.success('Veiculo localizado');
  }

  // Prefill vindo do SAC: /sinistros/novo?placa=ABC1D23 -> busca automatica.
  useEffect(() => {
    const p0 = new URLSearchParams(window.location.search).get('placa');
    if (!p0) return;
    const p = normalizarPlaca(p0);
    setPlaca(p);
    if (!placaValida(p)) return;
    (async () => {
      const v = await buscar.mutateAsync(p);
      if (v) {
        setVeiculo(v);
        setForm((f) => ({ ...f, valor_fipe_atualizado: v.valor_fipe ?? '' }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCepBlur() {
    if (soDigitos(local.cep ?? '').length !== 8) return;
    setBuscandoCep(true);
    const res = await buscarCep(local.cep ?? '');
    setBuscandoCep(false);
    if (!res) return toast.error('CEP nao encontrado');
    setLocal((l) => ({
      ...l,
      logradouro: res.logradouro || l.logradouro,
      bairro: res.bairro || l.bairro,
      cidade: res.cidade || l.cidade,
      estado: res.estado || l.estado,
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!veiculo) return toast.error('Busque o veiculo pela placa primeiro');
    if (!form.data_ocorrencia) return toast.error('Informe a data do evento');
    if (!form.tipo_evento_id) return toast.error('Selecione o tipo de evento');

    criar.mutate(
      {
        veiculo_id: veiculo.id,
        cliente_id: veiculo.cliente_id,
        regional_id: veiculo.regional_id,
        data_ocorrencia: form.data_ocorrencia,
        data_comunicacao: form.data_comunicacao || null,
        envolvido_tipo: form.envolvido_tipo,
        tipo_envolvimento: (form.tipo_envolvimento || null) as TipoEnvolvimento | null,
        tipo_evento_id: form.tipo_evento_id,
        local_evento: local,
        valor_fipe_atualizado: form.valor_fipe_atualizado === '' ? null : Number(form.valor_fipe_atualizado),
        valor_participacao: form.valor_participacao === '' ? null : Number(form.valor_participacao),
        bo_numero: form.bo_numero,
        bo_data: form.bo_data || null,
        bo_unidade: form.bo_unidade,
        bo_resumo: form.bo_resumo,
        descricao: form.descricao,
      },
      {
        onSuccess: (evt) => {
          toast.success(`Evento aberto: ${evt.numero_protocolo}`);
          router.push(`/sinistros/${evt.id}`);
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  const setF = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const setL = (patch: Partial<LocalEvento>) => setLocal((l) => ({ ...l, ...patch }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/sinistros" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Voltar aos eventos
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Novo Evento</h1>

      {/* 1. Placa */}
      <Card>
        <CardContent className="pt-5">
          <FormField label="Placa do veiculo *">
            <div className="flex gap-2">
              <Input
                value={placa}
                onChange={(e) => setPlaca(normalizarPlaca(e.target.value))}
                placeholder="ABC1D23"
                className="mt-0 font-mono uppercase"
              />
              <Button type="button" variant="secondary" onClick={onBuscarPlaca} disabled={buscar.isPending} className="shrink-0">
                {buscar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
            </div>
          </FormField>

          {veiculo && (
            <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-brand-500" />
                <span className="font-medium">{[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || 'Veiculo'}</span>
                <span className="text-slate-500">
                  {veiculo.ano_fabricacao ?? ''}
                  {veiculo.ano_modelo ? `/${veiculo.ano_modelo}` : ''} · {veiculo.cor ?? ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-brand-500" />
                <span className="font-medium">{veiculo.clientes?.nome_razao_social}</span>
                <span className="text-slate-500">
                  {veiculo.clientes?.matricula ? `#${veiculo.clientes.matricula}` : ''}{' '}
                  {veiculo.clientes ? formatarDocumento(veiculo.clientes.cpf_cnpj, veiculo.clientes.tipo_pessoa) : ''}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {veiculo && (
        <form onSubmit={submit} className="space-y-5">
          {/* 2. Dados do evento */}
          <Card>
            <CardContent className="space-y-4 pt-5">
              <h2 className="text-sm font-semibold text-slate-700">Dados do evento</h2>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Data do evento *">
                  <Input type="date" value={form.data_ocorrencia} onChange={(e) => setF({ data_ocorrencia: e.target.value })} />
                </FormField>
                <FormField label="Data da comunicacao">
                  <Input type="date" value={form.data_comunicacao} onChange={(e) => setF({ data_comunicacao: e.target.value })} />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Veiculo envolvido">
                  <Select value={form.envolvido_tipo} onChange={(e) => setF({ envolvido_tipo: e.target.value as EnvolvidoTipo })}>
                    <option value="ASSOCIADO">Do Associado</option>
                    <option value="TERCEIRO">De Terceiro</option>
                  </Select>
                </FormField>
                <FormField label="Envolvimento">
                  <Select value={form.tipo_envolvimento} onChange={(e) => setF({ tipo_envolvimento: e.target.value as TipoEnvolvimento })}>
                    <option value="">--</option>
                    <option value="CAUSADOR">Causador</option>
                    <option value="VITIMA">Vitima</option>
                  </Select>
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
              <FormField label="Descricao / relato">
                <Textarea rows={3} value={form.descricao} onChange={(e) => setF({ descricao: e.target.value })} />
              </FormField>
            </CardContent>
          </Card>

          {/* 3. Local do evento */}
          <Card>
            <CardContent className="space-y-4 pt-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <MapPin className="h-4 w-4" /> Local do evento
              </h2>
              <div className="grid grid-cols-4 gap-3">
                <FormField label="CEP">
                  <Input value={local.cep ?? ''} onChange={(e) => setL({ cep: e.target.value })} onBlur={onCepBlur} placeholder={buscandoCep ? 'Buscando...' : '00000-000'} />
                </FormField>
                <FormField label="Rua / Logradouro" className="col-span-3">
                  <Input value={local.logradouro ?? ''} onChange={(e) => setL({ logradouro: e.target.value })} />
                </FormField>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <FormField label="Numero">
                  <Input value={local.numero ?? ''} onChange={(e) => setL({ numero: e.target.value })} />
                </FormField>
                <FormField label="Complemento" className="col-span-3">
                  <Input value={local.complemento ?? ''} onChange={(e) => setL({ complemento: e.target.value })} />
                </FormField>
              </div>
              <div className="grid grid-cols-4 gap-3">
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
            </CardContent>
          </Card>

          {/* 4. Boletim de Ocorrencia */}
          <Card>
            <CardContent className="space-y-4 pt-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <FileText className="h-4 w-4" /> Boletim de Ocorrencia (B.O.)
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Numero do B.O.">
                  <Input value={form.bo_numero} onChange={(e) => setF({ bo_numero: e.target.value })} />
                </FormField>
                <FormField label="Data do B.O.">
                  <Input type="date" value={form.bo_data} onChange={(e) => setF({ bo_data: e.target.value })} />
                </FormField>
                <FormField label="Unidade responsavel">
                  <Input value={form.bo_unidade} onChange={(e) => setF({ bo_unidade: e.target.value })} placeholder="Ex.: 1o DP" />
                </FormField>
              </div>
              <FormField label="Resumo do B.O.">
                <Textarea rows={4} value={form.bo_resumo} onChange={(e) => setF({ bo_resumo: e.target.value })} />
              </FormField>
            </CardContent>
          </Card>

          {/* 5. Valores */}
          <Card>
            <CardContent className="space-y-4 pt-5">
              <h2 className="text-sm font-semibold text-slate-700">Valores</h2>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Valor FIPE atualizado (R$)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.valor_fipe_atualizado}
                    onChange={(e) => setF({ valor_fipe_atualizado: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </FormField>
                <FormField label="Participacao / Franquia (R$)">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.valor_participacao}
                    onChange={(e) => setF({ valor_participacao: e.target.value === '' ? '' : Number(e.target.value) })}
                  />
                </FormField>
              </div>
              <p className="text-xs text-slate-400">
                A tabela FIPE sera interligada por API. Valor de referencia do contrato:{' '}
                {veiculo.valor_fipe ? formatCurrency(veiculo.valor_fipe) : 'nao informado'}.
              </p>
            </CardContent>
          </Card>

          <p className="text-xs text-slate-400">
            Apos abrir o evento, use o painel do protocolo para anexar fotos e documentos, cotacoes de
            reparo (proprio/terceiro) e lancamentos financeiros.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push('/sinistros')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? 'Abrindo...' : 'Abrir evento (protocolo)'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
