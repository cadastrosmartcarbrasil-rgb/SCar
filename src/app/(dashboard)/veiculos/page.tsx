'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Car, Search, Loader2, Calculator, Bell, Satellite,
  ArrowUpRight, ArrowDownRight, ArrowLeftRight, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, MoneyInput } from '@/components/ui/field';
import { useAssociados } from '@/hooks/use-associados';
import { useRegionais, useVendedores, useUsuarios, useMarcas, useModelos } from '@/hooks/use-config';
import { rotuloUnidade } from '@/lib/regional';
import { useTiposVeiculo, usePlanos, useProdutos, useProdutosPorPlano } from '@/hooks/use-precificacao';
import { useVeiculos, useSaveVeiculo, useExcluirVeiculo } from '@/hooks/use-veiculos';
import { useEmpresasRastreamento } from '@/hooks/use-rastreamento';
import { useEmpresa } from '@/hooks/use-empresa';
import { DIAS_TOLERANCIA_PADRAO, avisoDeTolerancia, tolerancia } from '@/lib/inadimplencia';
import {
  useTiposAlerta, useVeiculoProdutos, useVeiculoAlertas, useCalcularMensalidadeVeiculo,
} from '@/hooks/use-veiculo-ficha';
import { AlertasVeiculo } from '@/components/veiculos/alertas-veiculo';
import { consultarPlaca, normalizarPlaca, placaValida } from '@/lib/placa';
import { FipeConsulta } from '@/components/fipe/fipe-consulta';
import { useFipePorPlaca } from '@/hooks/use-fipe';
import { formatCurrency } from '@/lib/utils';
import { normalizarDigitos, validarRastreador, imeiLuhnValido } from '@/lib/rastreador';
import { separarOpcionais } from '@/lib/vistoria';
import {
  ROTULO_SENTIDO, avulsosDoVeiculo, compararTrocaDePlano, mensalidadeCongelada,
  podeSincronizarMensalidade, sentidoDaTroca,
  type SentidoTroca, type TrocaDePlano,
} from '@/lib/planos';
import type {
  VeiculosRow,
  StatusVeiculo,
  TipoNegociacao,
  TipoCambio,
  Combustivel,
} from '@/lib/database.types';

const NEGOCIACOES: { v: TipoNegociacao; l: string }[] = [
  { v: 'venda', l: 'Venda' },
  { v: 'substituicao', l: 'Substituicao' },
  { v: 'reativacao', l: 'Reativacao' },
  { v: 'troca_titularidade', l: 'Troca de Titularidade' },
  { v: 'renovacao', l: 'Renovacao' },
];
const CAMBIOS: { v: TipoCambio; l: string }[] = [
  { v: 'manual', l: 'Manual' },
  { v: 'automatico', l: 'Automatico' },
  { v: 'automatizado', l: 'Automatizado' },
];
const COMBUSTIVEIS: { v: Combustivel; l: string }[] = [
  { v: 'gasolina', l: 'Gasolina' },
  { v: 'flex', l: 'Flex' },
  { v: 'diesel', l: 'Diesel' },
  { v: 'alcool', l: 'Alcool' },
  { v: 'eletrico', l: 'Eletrico (Bateria)' },
];
// `manual` = aparece no formulario. A lista tem de ser COMPLETA mesmo assim:
// `statusMeta` cai no primeiro item quando nao acha, entao status ausente daqui
// era desenhado como "Ativo" — um veiculo bloqueado aparecendo como ativo na
// lista (acontecia com `em_evento` e `vistoria_pendente`).
//
// `inadimplente` NAO e manual de proposito (0072): ele e decidido pelos titulos
// e a rotina o desfaria na passagem seguinte — ou, pior, inativaria o associado
// no fim da tolerancia por um clique. Bloqueio manual continua sendo `suspenso`.
const STATUS: { v: StatusVeiculo; l: string; cor: string; manual: boolean }[] = [
  { v: 'ativo', l: 'Ativo', cor: 'bg-emerald-50 text-emerald-700', manual: true },
  { v: 'em_evento', l: 'Em evento', cor: 'bg-cyan-50 text-cyan-700', manual: false },
  { v: 'vistoria_pendente', l: 'Vistoria pendente', cor: 'bg-sky-50 text-sky-700', manual: false },
  { v: 'inadimplente', l: 'Inadimplente', cor: 'bg-rose-50 text-rose-700', manual: false },
  { v: 'suspenso', l: 'Suspenso', cor: 'bg-amber-50 text-amber-700', manual: true },
  { v: 'inativo', l: 'Inativo', cor: 'bg-slate-100 text-slate-600', manual: true },
  { v: 'excluido', l: 'Excluido', cor: 'bg-rose-50 text-rose-700', manual: true },
  { v: 'baixado', l: 'Baixado', cor: 'bg-slate-100 text-slate-500', manual: false },
];
const statusMeta = (s: StatusVeiculo) =>
  STATUS.find((x) => x.v === s) ?? { v: s, l: s, cor: 'bg-slate-100 text-slate-600', manual: false };

const anoAtual = 2026;

export default function VeiculosPage() {
  return (
    <Suspense fallback={<p className="py-10 text-center text-sm text-slate-400">Carregando...</p>}>
      <VeiculosConteudo />
    </Suspense>
  );
}

function VeiculosConteudo() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: veiculos, isLoading } = useVeiculos();
  const { data: empresa } = useEmpresa();
  const diasTolerancia = empresa?.dias_tolerancia_inadimplencia ?? DIAS_TOLERANCIA_PADRAO;
  const { data: associados } = useAssociados();
  const { data: regionais } = useRegionais();
  const { data: vendedores } = useVendedores();
  const { data: usuarios } = useUsuarios();
  const { data: marcas } = useMarcas();
  const { data: tiposVeiculo } = useTiposVeiculo();
  const { data: planos } = usePlanos();
  const { data: produtos } = useProdutos();
  const { data: produtosPorPlano } = useProdutosPorPlano();
  const { data: tiposAlerta } = useTiposAlerta();
  const { data: rastreadoras } = useEmpresasRastreamento();
  const salvar = useSaveVeiculo();
  const excluir = useExcluirVeiculo();
  const fipePorPlaca = useFipePorPlaca();
  const calcMensal = useCalcularMensalidadeVeiculo();

  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<Partial<VeiculosRow>>({});
  const [consultando, setConsultando] = useState(false);
  // `opcionais` guarda o que foi contratado A PARTE. O que vem dentro do combo
  // e resolvido pelo plano (aparece marcado e travado) — nao e escolha.
  const [opcionais, setOpcionais] = useState<Set<string>>(new Set());
  const [alertas, setAlertas] = useState<Set<string>>(new Set());
  const [troca, setTroca] = useState<(TrocaDePlano & { sentido: SentidoTroca; de: string; para: string }) | null>(null);
  const [valorCotado, setValorCotado] = useState<number | null>(null);

  const vProdutos = useVeiculoProdutos(form.id);
  const vAlertas = useVeiculoAlertas(form.id);
  useEffect(() => { if (vProdutos.data) setOpcionais(new Set(vProdutos.data)); }, [vProdutos.data]);
  useEffect(() => { if (vAlertas.data) setAlertas(new Set(vAlertas.data)); }, [vAlertas.data]);

  // Atalho do SAC: /veiculos?editar=<id> abre direto a ficha daquele veiculo.
  // O parametro e CONSUMIDO na abertura (ref + router.replace): enquanto ele
  // continuasse na URL, salvar reabria o modal — o efeito rodava de novo a cada
  // refetch da lista (o save invalida ['veiculos']) e no proprio setAberto(false).
  const editarId = params.get('editar');
  const deepLinkTratado = useRef<string | null>(null);
  useEffect(() => {
    if (!editarId || deepLinkTratado.current === editarId) return;
    const v = (veiculos ?? []).find((x) => x.id === editarId);
    if (!v) return;
    deepLinkTratado.current = editarId;
    editar(v);
    router.replace('/veiculos', { scroll: false });
  }, [editarId, veiculos, router]);

  const opcionaisDisp = useMemo(() => (produtos ?? []).filter((p) => !p.obrigatorio && p.status), [produtos]);
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setter((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ------------------------------------------------------------- plano/combo
  // O que o plano escolhido ja carrega. `cotar_plano` (0019) une plano +
  // avulsos, entao o item do combo nunca pode ser oferecido como escolha: o
  // atendente marcaria de novo algo que o associado ja leva.
  const idsDoPlano = useMemo(
    () => (form.plano_protecao_id ? produtosPorPlano?.[form.plano_protecao_id] ?? [] : []),
    [produtosPorPlano, form.plano_protecao_id],
  );
  const { inclusos, avulsos: opcionaisAvulsos } = useMemo(
    () => separarOpcionais(opcionaisDisp, idsDoPlano),
    [opcionaisDisp, idsDoPlano],
  );
  const nomeProduto = useMemo(() => new Map((produtos ?? []).map((p) => [p.id, p.nome])), [produtos]);
  const nivelDoPlano = (id: string | null) =>
    id ? (planos ?? []).find((p) => p.id === id)?.nivel ?? null : null;
  const nomeDoPlano = (id: string | null) =>
    (id ? (planos ?? []).find((p) => p.id === id)?.nome : null) ?? 'Sem plano';

  /** Recotiza no banco (mesma `cotar_plano` do resto do sistema). */
  function recotizar(planoId: string | null, avulsosIds: string[], aplicar: boolean) {
    if (!form.tipo_veiculo_id || !(form.valor_fipe ?? 0)) { setValorCotado(null); return; }
    calcMensal.mutate(
      { fipe: form.valor_fipe ?? 0, tipoVeiculoId: form.tipo_veiculo_id, planoId, opcionaisIds: avulsosIds },
      {
        onSuccess: (valor) => {
          setValorCotado(valor);
          if (aplicar) setF({ valor_mensalidade: valor });
        },
        onError: () => setValorCotado(null),
      },
    );
  }

  /**
   * Upgrade/downgrade de plano. O combo novo assume os itens dele; o avulso que
   * o novo plano passou a incluir para de ser cobrado a parte; e o que a
   * categoria abaixo NAO cobre mais e anunciado, nunca recolocado sozinho —
   * remarcar muda o preco, e isso e decisao de quem atende.
   */
  function trocarPlano(novoId: string | null) {
    const anteriorId = form.plano_protecao_id ?? null;
    if (novoId === anteriorId) return;
    const idsAntes = anteriorId ? produtosPorPlano?.[anteriorId] ?? [] : [];
    const idsDepois = novoId ? produtosPorPlano?.[novoId] ?? [] : [];
    // A selecao gravada pode trazer item do combo anterior (ficha antiga):
    // ela e limpa antes de comparar, senao viraria "avulso" do nada.
    const diff = compararTrocaDePlano({
      avulsos: avulsosDoVeiculo([...opcionais], idsAntes),
      idsPlanoAnterior: idsAntes,
      idsPlanoNovo: idsDepois,
    });
    setOpcionais(new Set(diff.avulsos));
    setF({ plano_protecao_id: novoId });
    setTroca({
      ...diff,
      sentido: sentidoDaTroca(nivelDoPlano(anteriorId), nivelDoPlano(novoId)),
      de: nomeDoPlano(anteriorId),
      para: nomeDoPlano(novoId),
    });
    recotizar(novoId, diff.avulsos, podeSincronizarMensalidade(form.valor_mensalidade, valorCotado));
  }

  /** Manter, como avulso pago, uma cobertura que o plano novo deixou de ter. */
  function manterComoAvulso(produtoId: string) {
    const ids = [...opcionais, produtoId];
    setOpcionais(new Set(ids));
    setTroca((t) => (t ? { ...t, perdidos: t.perdidos.filter((id) => id !== produtoId) } : t));
    recotizar(
      form.plano_protecao_id ?? null, ids,
      podeSincronizarMensalidade(form.valor_mensalidade, valorCotado),
    );
  }

  const nomeUsuario = useMemo(() => new Map((usuarios ?? []).map((u) => [u.id, u.nome])), [usuarios]);
  const nomeAssociado = useMemo(
    () => new Map((associados ?? []).map((a) => [a.id, a.nome_razao_social])),
    [associados],
  );

  // modelos sugeridos para a marca digitada (busca sob demanda pela marca)
  const marcaSelecionada = useMemo(
    () => (marcas ?? []).find((m) => m.nome.toLowerCase() === (form.marca ?? '').toLowerCase()),
    [marcas, form.marca],
  );
  const { data: modelosDaMarca = [] } = useModelos(marcaSelecionada?.id);

  const filtrados = useMemo(() => {
    const t = busca.toLowerCase();
    return (veiculos ?? []).filter(
      (v) =>
        (v.placa ?? '').toLowerCase().includes(t) ||
        (v.marca ?? '').toLowerCase().includes(t) ||
        (v.modelo ?? '').toLowerCase().includes(t) ||
        (v.clientes?.nome_razao_social ?? '').toLowerCase().includes(t) ||
        (v.rastreador_imei ?? '').includes(t) ||
        (v.rastreador_chip ?? '').includes(t),
    );
  }, [veiculos, busca]);

  // Abrir outra ficha nao pode herdar a selecao da anterior: o conjunto de
  // opcionais so e reescrito quando a consulta do novo veiculo responde.
  function editar(v: VeiculosRow) {
    setForm(v);
    setOpcionais(new Set());
    setAlertas(new Set());
    setTroca(null);
    setValorCotado(null);
    setAberto(true);
  }

  function novo() {
    setForm({ status: 'ativo', uso: 'passeio', data_contrato: undefined });
    setOpcionais(new Set());
    setAlertas(new Set());
    setTroca(null);
    setValorCotado(null);
    setAberto(true);
  }

  function calcularMensalidade() {
    calcMensal.mutate(
      { fipe: form.valor_fipe ?? 0, tipoVeiculoId: form.tipo_veiculo_id ?? null, planoId: form.plano_protecao_id ?? null, opcionaisIds: [...opcionais] },
      {
        onSuccess: (valor) => {
          setValorCotado(valor);
          setF({ valor_mensalidade: valor });
          toast.success(`Mensalidade calculada: ${formatCurrency(valor)}`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  async function consultar() {
    const p = normalizarPlaca(form.placa ?? '');
    if (!placaValida(p)) return toast.error('Placa invalida');
    setConsultando(true);
    // 1) dados cadastrais da placa (provedor de placa, se configurado)
    // 2) valor + dados FIPE pela placa (placafipe getplacafipe)
    const [r, fipe] = await Promise.all([
      consultarPlaca(p),
      fipePorPlaca.mutateAsync(p).catch(() => null),
    ]);
    setConsultando(false);

    const v = fipe?.valor ?? null;
    const preencheu = (r && r.found) || !!v;
    if (!preencheu) {
      toast.message('Consulta indisponivel - preencha os dados manualmente.');
      return;
    }
    setForm((f) => ({
      ...f,
      marca: r?.marca ?? v?.marca ?? f.marca,
      modelo: r?.modelo ?? v?.modelo ?? f.modelo,
      ano_fabricacao: r?.ano_fabricacao ?? f.ano_fabricacao,
      ano_modelo: r?.ano_modelo ?? v?.anoModelo ?? f.ano_modelo,
      cor: r?.cor ?? f.cor,
      chassi: r?.chassi ?? f.chassi,
      valor_fipe: v?.valor ?? f.valor_fipe,
      codigo_fipe: v?.codigoFipe ?? f.codigo_fipe,
      combustivel: (v?.combustivel as Combustivel) ?? f.combustivel,
    }));
    toast.success(v ? `Placa + FIPE: ${formatCurrency(v.valor ?? 0)}` : 'Dados da placa preenchidos');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cliente_id) return toast.error('Selecione o associado');
    if (!placaValida(form.placa ?? '')) return toast.error('Placa invalida');
    const erroRastreador = validarRastreador({
      rastreador_imei: form.rastreador_imei ?? null,
      rastreador_chip: form.rastreador_chip ?? null,
      empresa_rastreamento_id: form.empresa_rastreamento_id ?? null,
    });
    if (erroRastreador) return toast.error(erroRastreador);
    // Em veiculo ja cadastrado os alertas sao mantidos pelo painel proprio
    // (abrir/resolver com historico) — salvar NAO pode reescrever o conjunto,
    // senao apaga mensagem, autor e resolucao de cada pendencia.
    // veiculo_produtos guarda SO o que foi contratado a parte — o item do combo
    // ja vem de plano_produtos. Grava-lo aqui faria a ficha mentir (e limpa,
    // de quebra, o que ficha antiga gravou junto).
    salvar.mutate({
      ...form,
      opcionaisIds: avulsosDoVeiculo([...opcionais], idsDoPlano),
      alertasIds: form.id ? undefined : [...alertas],
    }, {
      onSuccess: () => {
        toast.success('Veiculo salvo');
        setAberto(false);
      },
      onError: (err) => {
        const m = (err as Error).message;
        if (m.includes('rastreador_imei')) return toast.error('IMEI ja cadastrado em outro veiculo');
        toast.error(m.includes('placa') ? 'Placa ja cadastrada' : m);
      },
    });
  }

  const setF = (patch: Partial<VeiculosRow>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Veiculos / Contratos</h1>
          <p className="text-sm text-slate-500">Frota protegida, vinculada aos associados.</p>
        </div>
        <Button onClick={novo}>
          <Plus className="h-4 w-4" /> Novo Veiculo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por placa, marca, modelo ou associado"
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-superficie">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-4 py-2">Placa</th>
              <th className="px-4 py-2">Veiculo</th>
              <th className="px-4 py-2">Associado</th>
              <th className="px-4 py-2">FIPE</th>
              <th className="px-4 py-2">Situacao</th>
              <th className="px-4 py-2 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            )}
            {filtrados.map((v) => {
              const meta = statusMeta(v.status);
              // Quanto tempo ainda ha para cobrar antes de perder o associado.
              const aviso = avisoDeTolerancia(tolerancia(v, diasTolerancia));
              return (
                <tr key={v.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-mono font-medium text-slate-800">{v.placa}</td>
                  <td className="px-4 py-2 text-slate-600">
                    <span className="inline-flex items-center gap-2">
                      <Car className="h-4 w-4 text-brand-500" />
                      {[v.marca, v.modelo].filter(Boolean).join(' ') || '-'}
                      {v.ano_modelo ? ` ${v.ano_fabricacao ?? ''}/${v.ano_modelo}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {v.clientes?.nome_razao_social ?? nomeAssociado.get(v.cliente_id) ?? '-'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{v.valor_fipe ? formatCurrency(v.valor_fipe) : '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${meta.cor}`}>{meta.l}</span>
                    {aviso && (
                      <span className="mt-0.5 block text-[11px] text-rose-600">{aviso}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => editar(v)}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir o veiculo ${v.placa}?`))
                            excluir.mutate(v.id, { onError: (e) => toast.error((e as Error).message) });
                        }}
                        className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhum veiculo cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={aberto} onClose={() => setAberto(false)} title={form.id ? `Editar ${form.placa}` : 'Novo Veiculo (Contrato)'} tamanho="xl">
        <datalist id="dl-marcas">
          {(marcas ?? []).map((m) => (
            <option key={m.id} value={m.nome} />
          ))}
        </datalist>
        <datalist id="dl-modelos">
          {modelosDaMarca.map((mo) => (
            <option key={mo.id} value={mo.nome} />
          ))}
        </datalist>

        <form onSubmit={submit} className="space-y-4">
          <FormField label="Associado *">
            <Select value={form.cliente_id ?? ''} onChange={(e) => setF({ cliente_id: e.target.value })}>
              <option value="">-- Selecione o associado --</option>
              {(associados ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.matricula ? `${a.matricula} - ` : ''}
                  {a.nome_razao_social}
                </option>
              ))}
            </Select>
          </FormField>

          {/* Placa + consulta */}
          <FormField label="Placa *">
            <div className="flex gap-2">
              <Input
                value={form.placa ?? ''}
                onChange={(e) => setF({ placa: normalizarPlaca(e.target.value) })}
                placeholder="ABC1D23"
                className="mt-0 font-mono uppercase"
              />
              <Button type="button" variant="secondary" onClick={consultar} disabled={consultando} className="shrink-0">
                {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Consultar
              </Button>
            </div>
          </FormField>

          {/* Marca / Modelo */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Marca">
              <Input list="dl-marcas" value={form.marca ?? ''} onChange={(e) => setF({ marca: e.target.value })} />
            </FormField>
            <FormField label="Modelo">
              <Input list="dl-modelos" value={form.modelo ?? ''} onChange={(e) => setF({ modelo: e.target.value })} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Renavam">
              <Input value={form.renavam ?? ''} onChange={(e) => setF({ renavam: e.target.value })} />
            </FormField>
            <FormField label="Chassi" className="sm:col-span-2">
              <Input value={form.chassi ?? ''} onChange={(e) => setF({ chassi: e.target.value })} />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField label="Cor">
              <Input value={form.cor ?? ''} onChange={(e) => setF({ cor: e.target.value })} />
            </FormField>
            <FormField label="Ano fab.">
              <Input
                type="number"
                min={1950}
                max={anoAtual + 1}
                value={form.ano_fabricacao ?? ''}
                onChange={(e) => setF({ ano_fabricacao: Number(e.target.value) || null })}
              />
            </FormField>
            <FormField label="Ano modelo">
              <Input
                type="number"
                min={1950}
                max={anoAtual + 1}
                value={form.ano_modelo ?? ''}
                onChange={(e) => setF({ ano_modelo: Number(e.target.value) || null })}
              />
            </FormField>
            <FormField label="KM">
              <Input
                type="number"
                min={0}
                value={form.quilometragem ?? ''}
                onChange={(e) => setF({ quilometragem: Number(e.target.value) || null })}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Combustivel">
              <Select value={form.combustivel ?? ''} onChange={(e) => setF({ combustivel: (e.target.value || null) as Combustivel })}>
                <option value="">--</option>
                {COMBUSTIVEIS.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Cambio">
              <Select value={form.tipo_cambio ?? ''} onChange={(e) => setF({ tipo_cambio: (e.target.value || null) as TipoCambio })}>
                <option value="">--</option>
                {CAMBIOS.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Uso">
              <Select value={form.uso ?? 'passeio'} onChange={(e) => setF({ uso: e.target.value as VeiculosRow['uso'] })}>
                <option value="passeio">Passeio</option>
                <option value="app">Aplicativo</option>
                <option value="comercial">Comercial</option>
              </Select>
            </FormField>
          </div>

          <FormField label="Categoria de risco (tipo de veiculo p/ precificacao)">
            <Select value={form.tipo_veiculo_id ?? ''} onChange={(e) => setF({ tipo_veiculo_id: e.target.value || null })}>
              <option value="">-- Selecione --</option>
              {(tiposVeiculo ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Select>
          </FormField>

          {/* Consulta FIPE -> preenche marca/modelo/ano/valor automaticamente */}
          <FipeConsulta
            onSelecionar={(sel) =>
              setF({
                ...(sel.marcaNome ? { marca: sel.marcaNome } : {}),
                ...(sel.modeloNome ? { modelo: sel.modeloNome } : {}),
                ...(sel.valor.codigoFipe ? { codigo_fipe: sel.valor.codigoFipe } : {}),
                ...(sel.valor.valor != null ? { valor_fipe: sel.valor.valor } : {}),
                ...(sel.valor.anoModelo ? { ano_modelo: sel.valor.anoModelo } : {}),
                ...(sel.valor.combustivel ? { combustivel: sel.valor.combustivel as Combustivel } : {}),
              })
            }
          />

          {/* FIPE */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-lg border border-slate-200 p-3">
            <FormField label="Codigo FIPE">
              <Input value={form.codigo_fipe ?? ''} onChange={(e) => setF({ codigo_fipe: e.target.value })} placeholder="002001-5" />
            </FormField>
            <FormField label="Valor FIPE (R$)">
              <MoneyInput
                value={form.valor_fipe ?? null}
                onChange={(v) => setF({ valor_fipe: v })}
                placeholder="0,00"
              />
            </FormField>
            <p className="text-xs text-slate-400 sm:col-span-2">
              O valor FIPE e a base do calculo da mensalidade.
            </p>
          </div>

          {/* Plano, opcionais e cobranca */}
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-700">Plano & Cobranca</p>
            <FormField label="Plano de protecao">
              <Select value={form.plano_protecao_id ?? ''} onChange={(e) => trocarPlano(e.target.value || null)}>
                <option value="">-- Sem plano --</option>
                {(planos ?? []).filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Select>
            </FormField>

            {/* O que a troca de categoria fez com a cobertura e com o preco */}
            {troca && <ResumoTroca
              troca={troca}
              nome={(id) => nomeProduto.get(id) ?? 'Item'}
              valorAtual={form.valor_mensalidade ?? null}
              valorCotado={valorCotado}
              calculando={calcMensal.isPending}
              onAplicar={() => valorCotado != null && setF({ valor_mensalidade: valorCotado })}
              onManter={manterComoAvulso}
              onFechar={() => setTroca(null)}
            />}

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">Coberturas do plano</p>
              {inclusos.length > 0 ? (
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {inclusos.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm text-slate-500">
                      <input type="checkbox" checked disabled className="h-4 w-4 rounded border-slate-300" />
                      {p.nome}
                      <span className="rounded-full bg-cyan-50 px-1.5 py-px text-[10px] font-bold uppercase text-cyan-700 ring-1 ring-inset ring-cyan-200">
                        no plano
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {form.plano_protecao_id
                    ? 'Este plano nao traz opcional amarrado (so os itens obrigatorios da base).'
                    : 'Sem plano selecionado — tudo o que for marcado abaixo e cobrado a parte.'}
                </p>
              )}
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-600">
                Opcionais contratados a parte
                <span className="ml-1 font-normal text-slate-400">(somam a mensalidade)</span>
              </p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {opcionaisAvulsos.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={opcionais.has(p.id)}
                      onChange={() => {
                        const ids = opcionais.has(p.id)
                          ? [...opcionais].filter((x) => x !== p.id)
                          : [...opcionais, p.id];
                        setOpcionais(new Set(ids));
                        recotizar(
                          form.plano_protecao_id ?? null, ids,
                          podeSincronizarMensalidade(form.valor_mensalidade, valorCotado),
                        );
                      }}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {p.nome}
                  </label>
                ))}
                {opcionaisAvulsos.length === 0 && <span className="text-xs text-slate-400">Nenhum opcional cadastrado.</span>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="Valor da mensalidade (R$)">
                <MoneyInput value={form.valor_mensalidade ?? null} onChange={(v) => setF({ valor_mensalidade: v })} placeholder="0,00" />
              </FormField>
              <div className="flex items-end">
                <Button type="button" variant="secondary" onClick={calcularMensalidade} disabled={calcMensal.isPending} className="w-full">
                  {calcMensal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Calcular
                </Button>
              </div>
              <FormField label="Dia de vencimento">
                <Input type="number" min={1} max={31} value={form.dia_vencimento ?? ''} onChange={(e) => setF({ dia_vencimento: Number(e.target.value) || null })} placeholder="ex.: 10" />
              </FormField>
            </div>

            {/* O faturamento usa o valor GRAVADO (valor_mensalidade_veiculo, 0024):
                trocar de plano sem atualizar esse campo nao muda um centavo. */}
            {mensalidadeCongelada(form.valor_mensalidade, valorCotado) && (
              <p className="flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                O valor gravado ({formatCurrency(form.valor_mensalidade ?? 0)}) difere do calculado para este
                plano ({formatCurrency(valorCotado ?? 0)}). A cobranca usa o gravado.
                <button
                  type="button"
                  onClick={() => valorCotado != null && setF({ valor_mensalidade: valorCotado })}
                  className="font-semibold underline underline-offset-2"
                >
                  Aplicar {formatCurrency(valorCotado ?? 0)}
                </button>
              </p>
            )}
          </div>

          {/* Situacao do bem */}
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.alienado ?? false} onChange={(e) => setF({ alienado: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Alienado
            </label>
            <FormField label="Financeira / gravame" className="col-span-2">
              <Input value={form.alienado_financeira ?? ''} onChange={(e) => setF({ alienado_financeira: e.target.value })} disabled={!form.alienado} placeholder="Banco / financeira" />
            </FormField>
            <FormField label="Nº de portas">
              <Input type="number" min={0} max={9} value={form.numero_portas ?? ''} onChange={(e) => setF({ numero_portas: Number(e.target.value) || null })} />
            </FormField>
          </div>

          {/* Rastreamento (equipamento instalado no veiculo) */}
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Satellite className="h-4 w-4 text-cyan-600" /> Rastreamento
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="IMEI">
                <Input
                  value={form.rastreador_imei ?? ''}
                  onChange={(e) => setF({ rastreador_imei: normalizarDigitos(e.target.value).slice(0, 17) || null })}
                  placeholder="15 digitos"
                  className="mt-0 font-mono"
                  inputMode="numeric"
                />
              </FormField>
              <FormField label="Nº do chip">
                <Input
                  value={form.rastreador_chip ?? ''}
                  onChange={(e) => setF({ rastreador_chip: normalizarDigitos(e.target.value).slice(0, 22) || null })}
                  placeholder="Linha (DDD + numero) ou ICCID"
                  className="mt-0 font-mono"
                  inputMode="numeric"
                />
              </FormField>
              <FormField label="Rastreador por">
                <Select
                  value={form.empresa_rastreamento_id ?? ''}
                  onChange={(e) => setF({ empresa_rastreamento_id: e.target.value || null })}
                >
                  <option value="">-- Selecione a rastreadora --</option>
                  {(rastreadoras ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.nome}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            {(rastreadoras ?? []).length === 0 && (
              <p className="text-xs text-amber-600">
                Nenhuma rastreadora cadastrada — cadastre em Fornecedores (aba Rastreadoras).
              </p>
            )}
            {!!form.rastreador_imei && form.rastreador_imei.length === 15 && !imeiLuhnValido(form.rastreador_imei) && (
              <p className="text-xs text-amber-600">
                Atencao: o digito verificador deste IMEI nao confere — confirme com a rastreadora.
              </p>
            )}
            <p className="text-xs text-slate-400">
              Preencha somente para veiculos com rastreador instalado. O IMEI e unico: nao pode estar em outro veiculo ativo.
            </p>
          </div>

          {/* Alertas do veiculo — no veiculo JA CADASTRADO usa o painel que le as
              linhas reais (mesma fonte do card do SAC) e permite resolver; no
              cadastro novo, so a marcacao inicial (o veiculo ainda nao tem id). */}
          {form.id ? (
            <AlertasVeiculo veiculoId={form.id} />
          ) : (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700"><Bell className="h-4 w-4 text-amber-500" /> Alertas iniciais</p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {(tiposAlerta ?? []).map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={alertas.has(a.id)} onChange={() => toggleSet(setAlertas, a.id)} className="h-4 w-4 rounded border-slate-300" />
                    {a.nome}
                  </label>
                ))}
                {(tiposAlerta ?? []).length === 0 && <span className="text-xs text-slate-400">Cadastre alertas em Configuracoes &gt; Alertas.</span>}
              </div>
              <p className="mt-1 text-xs text-slate-400">Alertas ativos abrem automaticamente no SAC ao localizar o associado.</p>
            </div>
          )}

          {/* Dados do contrato */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Regional">
              <Select value={form.regional_id ?? ''} onChange={(e) => setF({ regional_id: e.target.value || null })}>
                <option value="">-- Selecione --</option>
                {(regionais ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {rotuloUnidade(r)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Consultor (Vendedor)">
              <Select value={form.vendedor_id ?? ''} onChange={(e) => setF({ vendedor_id: e.target.value || null })}>
                <option value="">-- Selecione --</option>
                {(vendedores ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome ?? (v.usuario_id ? nomeUsuario.get(v.usuario_id) : null) ?? '(vendedor)'}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Data do contrato">
              <Input type="date" value={form.data_contrato ?? ''} onChange={(e) => setF({ data_contrato: e.target.value })} />
            </FormField>
            <FormField label="Tipo de negociacao">
              <Select value={form.tipo_negociacao ?? ''} onChange={(e) => setF({ tipo_negociacao: (e.target.value || null) as TipoNegociacao })}>
                <option value="">--</option>
                {NEGOCIACOES.map((n) => (
                  <option key={n.v} value={n.v}>
                    {n.l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Situacao do contrato">
              <Select value={form.status ?? 'ativo'} onChange={(e) => setF({ status: e.target.value as StatusVeiculo })}>
                {STATUS.filter((s) => s.manual || s.v === form.status).map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.l}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : 'Salvar veiculo'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/**
 * O que mudou na troca de categoria, em uma leitura: direcao, o que entrou, o
 * que saiu, o que deixou de ser cobrado a parte e quanto passa a custar.
 * Aparece so depois de uma troca — ficha parada nao precisa dele.
 */
function ResumoTroca({
  troca, nome, valorAtual, valorCotado, calculando, onAplicar, onManter, onFechar,
}: {
  troca: TrocaDePlano & { sentido: SentidoTroca; de: string; para: string };
  nome: (id: string) => string;
  valorAtual: number | null;
  valorCotado: number | null;
  calculando: boolean;
  onAplicar: () => void;
  onManter: (produtoId: string) => void;
  onFechar: () => void;
}) {
  const Icone = troca.sentido === 'UPGRADE' || troca.sentido === 'ENTRADA'
    ? ArrowUpRight
    : troca.sentido === 'DOWNGRADE' || troca.sentido === 'SAIDA'
      ? ArrowDownRight
      : ArrowLeftRight;

  return (
    <div className="space-y-2 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-slate-800">
          <Icone className="h-4 w-4 text-cyan-600" />
          {ROTULO_SENTIDO[troca.sentido]}: {troca.de} → {troca.para}
        </p>
        <button type="button" onClick={onFechar} className="text-xs text-slate-500 hover:underline">
          fechar
        </button>
      </div>

      {troca.ganhos.length > 0 && (
        <p className="text-xs text-emerald-700">
          <b>Passa a incluir:</b> {troca.ganhos.map(nome).join(' · ')}
        </p>
      )}

      {troca.incorporados.length > 0 && (
        <p className="text-xs text-emerald-700">
          <b>Deixa de ser cobrado a parte</b> (agora vem no plano):{' '}
          {troca.incorporados.map(nome).join(' · ')}
        </p>
      )}

      {troca.perdidos.length > 0 && (
        <div className="space-y-1 text-xs text-rose-700">
          <b>Cobertura que sai do plano:</b>
          <div className="flex flex-wrap gap-1">
            {troca.perdidos.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onManter(id)}
                className="rounded-full bg-superficie px-2 py-0.5 ring-1 ring-inset ring-rose-200 hover:ring-rose-400"
                title="Manter como opcional contratado a parte"
              >
                {nome(id)} <span className="font-semibold">+ manter</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-1.5 border-t border-cyan-200 pt-2 text-xs text-slate-700">
        <b>Mensalidade:</b>
        {valorAtual != null && <span className="text-slate-500 line-through">{formatCurrency(valorAtual)}</span>}
        {calculando
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          : valorCotado != null
            ? <span className="tnum font-semibold text-slate-900">{formatCurrency(valorCotado)}</span>
            : <span className="text-slate-400">informe categoria de risco e valor FIPE para calcular</span>}
        {valorCotado != null && valorAtual !== valorCotado && (
          <button type="button" onClick={onAplicar} className="font-semibold text-cyan-700 underline underline-offset-2">
            aplicar no cadastro
          </button>
        )}
      </p>
    </div>
  );
}
