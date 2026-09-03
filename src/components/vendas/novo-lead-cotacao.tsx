'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Search, Loader2, User, Car, Calculator, ArrowLeft } from 'lucide-react';
import { Input, Select, MoneyInput } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { FipeConsulta } from '@/components/fipe/fipe-consulta';
import { useFipePorPlaca } from '@/hooks/use-fipe';
import { useTiposVeiculo, useProdutos, useCotasParticipacao, useSimularPreco, usePlanos } from '@/hooks/use-precificacao';
import { useSaveLead, useSalvarCotacao, useProdutosDoPlano } from '@/hooks/use-vendas';
import { avulsosParaCotacao, separarOpcionais } from '@/lib/vistoria';
import { normalizarPlaca, placaValida } from '@/lib/placa';
import { maskCelular, formatCurrency } from '@/lib/utils';
import type { Combustivel, LeadsRow, OrigemFipe } from '@/lib/database.types';

/** O que a tela precisa gravar para criar o lead. */
export type NovoLead = Partial<LeadsRow> & { nome: string; celular: string };

// ---------------------------------------------------------------------------
// Novo lead + cotacao. Uma tela so, usada pelo CRM (/vendas/novo) e pelo
// portal do vendedor (/vendedor/leads/novo) — o que muda entre os dois e
// COMO o lead nasce e para onde a tela volta.
// ---------------------------------------------------------------------------
export function NovoLeadCotacao({ criarLead, aoConcluir, voltarPara }: {
  /**
   * Como o lead nasce. No CRM e um insert direto; no portal do vendedor passa
   * por `vendedor_criar_lead`, que o amarra a quem cadastrou. A tela e a mesma.
   */
  criarLead?: (dados: NovoLead) => Promise<{ id: string }>;
  aoConcluir: (leadId: string) => void;
  voltarPara: { href: string; rotulo: string };
}) {
  const { data: tipos } = useTiposVeiculo();
  const { data: produtos } = useProdutos();
  const { data: cotas } = useCotasParticipacao();
  const { data: planos } = usePlanos();
  const fipePorPlaca = useFipePorPlaca();
  const simular = useSimularPreco();
  const salvarLead = useSaveLead();
  const salvarCotacao = useSalvarCotacao();
  const criar = criarLead ?? ((d: NovoLead) => salvarLead.mutateAsync(d));

  // Lead
  const [nome, setNome] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');
  // Veiculo
  const [placa, setPlaca] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [tipoVeiculoId, setTipoVeiculoId] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anoModelo, setAnoModelo] = useState<number | ''>('');
  const [combustivel, setCombustivel] = useState<Combustivel | ''>('');
  const [valorFipe, setValorFipe] = useState<number | null>(null);
  const [codigoFipe, setCodigoFipe] = useState('');
  const [cotaId, setCotaId] = useState('');
  const [planoId, setPlanoId] = useState('');
  const [origemFipe, setOrigemFipe] = useState<OrigemFipe>('MANUAL');
  const [mostrarCascata, setMostrarCascata] = useState(false);
  // Cotacao
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modoEnvio, setModoEnvio] = useState<'DETALHADA' | 'CONSOLIDADA'>('DETALHADA');
  const [total, setTotal] = useState<number | null>(null);
  const [participacao, setParticipacao] = useState<number | null>(null);
  const [adesao, setAdesao] = useState<number | null>(null);

  // Itens que o COMBO ja carrega: entram marcados e travados, para ninguem
  // vender de novo o que o cliente ja esta levando dentro do plano.
  const { data: doPlano } = useProdutosDoPlano(planoId || null);
  const idsDoPlano = useMemo(() => (doPlano ?? []).map((p) => p.produto_id), [doPlano]);

  const obrigatorios = useMemo(() => (produtos ?? []).filter((p) => p.obrigatorio && p.status), [produtos]);
  const todosOpcionais = useMemo(() => (produtos ?? []).filter((p) => !p.obrigatorio && p.status), [produtos]);
  const { inclusos, avulsos } = useMemo(
    () => separarOpcionais(todosOpcionais, idsDoPlano),
    [todosOpcionais, idsDoPlano],
  );

  async function consultarPlacaFipe() {
    const p = normalizarPlaca(placa);
    if (!placaValida(p)) return toast.error('Placa invalida');
    setConsultando(true);
    const r = await fipePorPlaca.mutateAsync(p).catch(() => null);
    setConsultando(false);
    const v = r?.valor ?? null;
    if (!v) {
      setMostrarCascata(true);
      return toast.message('Placa nao encontrada na FIPE - use a busca manual abaixo.');
    }
    if (v.marca) setMarca(v.marca);
    if (v.modelo) setModelo(v.modelo);
    if (v.anoModelo) setAnoModelo(v.anoModelo);
    if (v.combustivel) setCombustivel(v.combustivel as Combustivel);
    if (v.valor != null) setValorFipe(v.valor);
    if (v.codigoFipe) setCodigoFipe(v.codigoFipe);
    setOrigemFipe('API');
    toast.success(`FIPE: ${formatCurrency(v.valor ?? 0)}`);
  }

  function toggle(id: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function calcular() {
    if (!tipoVeiculoId) return toast.error('Selecione o tipo de veiculo');
    if (!valorFipe) return toast.error('Informe o valor FIPE');
    simular.mutate(
      {
        fipe: valorFipe, tipoVeiculoId, planoId: planoId || null, cotaId: cotaId || null,
        produtosIds: avulsosParaCotacao(selecionados, idsDoPlano),
      },
      {
        onSuccess: (r) => { setTotal(r.calculo.valor_total_mensalidade); setParticipacao(r.participacao); setAdesao(r.adesao); },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  async function gerar() {
    if (!nome.trim()) return toast.error('Informe o nome do lead');
    if (celular.replace(/\D/g, '').length < 10) return toast.error('Informe um celular valido');
    if (!tipoVeiculoId) return toast.error('Selecione o tipo de veiculo');
    if (!valorFipe) return toast.error('Informe o valor FIPE');
    try {
      const lead = await criar({
        nome: nome.trim(),
        celular: celular.replace(/\D/g, ''),
        email: email.trim() || null,
        placa: placa ? normalizarPlaca(placa) : null,
        tipo_veiculo_id: tipoVeiculoId,
        marca: marca || null,
        modelo: modelo || null,
        ano_modelo: anoModelo === '' ? null : Number(anoModelo),
        combustivel: (combustivel || null) as Combustivel | null,
        valor_fipe: valorFipe,
        codigo_fipe: codigoFipe || null,
        cota_participacao_id: cotaId || null,
        origem_fipe: origemFipe,
      });
      await salvarCotacao.mutateAsync({
        leadId: lead.id,
        fipe: valorFipe,
        tipoVeiculoId,
        cotaId: cotaId || null,
        planoId: planoId || null,
        produtosIds: avulsosParaCotacao(selecionados, idsDoPlano),
        modoEnvio,
      });
      toast.success('Cotacao gerada');
      aoConcluir(lead.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-24">
      <Link href={voltarPara.href} className="inline-flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> {voltarPara.rotulo}
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Novo lead & cotacao</h1>

      {/* 1. Lead */}
      <Secao icon={User} titulo="1. Dados do lead">
        <Campo label="Nome *"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" /></Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Celular / WhatsApp *"><Input value={celular} onChange={(e) => setCelular(maskCelular(e.target.value))} inputMode="tel" placeholder="(11) 91234-5678" /></Campo>
          <Campo label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" /></Campo>
        </div>
      </Secao>

      {/* 2. Veiculo / FIPE */}
      <Secao icon={Car} titulo="2. Veiculo (Placa / FIPE)">
        <Campo label="Placa">
          <div className="flex gap-2">
            <Input value={placa} onChange={(e) => setPlaca(normalizarPlaca(e.target.value))} placeholder="ABC1D23" className="font-mono uppercase" />
            <Button type="button" variant="secondary" onClick={consultarPlacaFipe} disabled={consultando} className="shrink-0">
              {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
            </Button>
          </div>
        </Campo>

        {!mostrarCascata && (
          <button type="button" onClick={() => setMostrarCascata(true)} className="text-xs font-medium text-brand-600">
            Nao achou pela placa? Buscar manualmente (Tipo &gt; Marca &gt; Modelo &gt; Ano)
          </button>
        )}
        {mostrarCascata && (
          <FipeConsulta
            onSelecionar={(sel) => {
              if (sel.marcaNome) setMarca(sel.marcaNome);
              if (sel.modeloNome) setModelo(sel.modeloNome);
              if (sel.valor.anoModelo) setAnoModelo(sel.valor.anoModelo);
              if (sel.valor.combustivel) setCombustivel(sel.valor.combustivel as Combustivel);
              if (sel.valor.valor != null) setValorFipe(sel.valor.valor);
              if (sel.valor.codigoFipe) setCodigoFipe(sel.valor.codigoFipe);
              setOrigemFipe('API');
            }}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <Campo label="Marca"><Input value={marca} onChange={(e) => setMarca(e.target.value)} /></Campo>
          <Campo label="Modelo"><Input value={modelo} onChange={(e) => setModelo(e.target.value)} /></Campo>
          <Campo label="Ano modelo"><Input type="number" value={anoModelo} onChange={(e) => setAnoModelo(e.target.value === '' ? '' : Number(e.target.value))} /></Campo>
          <Campo label="Valor FIPE (R$) *"><MoneyInput value={valorFipe} onChange={(v) => { setValorFipe(v); if (origemFipe === 'API') setOrigemFipe('MANUAL'); }} placeholder="0,00" /></Campo>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Tipo de veiculo *">
            <Select value={tipoVeiculoId} onChange={(e) => setTipoVeiculoId(e.target.value)}>
              <option value="">-- Selecione --</option>
              {(tipos ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          </Campo>
          <Campo label="Cota de participacao">
            <Select value={cotaId} onChange={(e) => setCotaId(e.target.value)}>
              <option value="">Padrao da faixa</option>
              {(cotas ?? []).map((c) => <option key={c.id} value={c.id}>{c.codigo} — {(c.percentual * 100).toFixed(0)}%</option>)}
            </Select>
          </Campo>
        </div>
      </Secao>

      {/* 3. Cotacao */}
      <Secao icon={Calculator} titulo="3. Cotacao">
        <Campo label="Plano / Combo">
          <Select value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
            <option value="">Sem combo (base + avulsos)</option>
            {(planos ?? []).filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Select>
        </Campo>
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-slate-400">Itens obrigatorios</p>
          <div className="flex flex-wrap gap-1.5">
            {obrigatorios.map((p) => <span key={p.id} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{p.nome}</span>)}
            {obrigatorios.length === 0 && <span className="text-xs text-slate-400">Nenhum.</span>}
          </div>
        </div>
        {inclusos.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-slate-400">Ja incluso no plano</p>
            <div className="space-y-1">
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
            <p className="mt-1 text-[11px] text-slate-400">
              Vem dentro do combo — nao precisa (e nao pode) ser vendido a parte.
            </p>
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-slate-400">Adicionais avulsos (fora do plano)</p>
          <div className="space-y-1">
            {avulsos.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 rounded border-slate-300" />
                {p.nome}
                {p.valor_fixo != null && <span className="text-xs text-slate-400">({formatCurrency(p.valor_fixo)})</span>}
              </label>
            ))}
            {avulsos.length === 0 && <span className="text-xs text-slate-400">Nenhum.</span>}
          </div>
        </div>

        <Button type="button" variant="secondary" onClick={calcular} disabled={simular.isPending} className="w-full">
          {simular.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Calcular mensalidade
        </Button>

        {total != null && (
          <div className="rounded-xl bg-brand-50 p-3 text-center">
            <p className="text-xs uppercase text-brand-600">Mensalidade</p>
            <p className="text-2xl font-bold text-brand-700">{formatCurrency(total)}</p>
            {adesao != null && adesao > 0 && (
              <p className="mt-1 text-xs text-emerald-600">Taxa de adesao (unica): {formatCurrency(adesao)}</p>
            )}
            {participacao != null && participacao > 0 && (
              <p className="mt-1 text-xs text-slate-500">Participacao no evento: {formatCurrency(participacao)}</p>
            )}
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium uppercase text-slate-400">Envio ao cliente</p>
          <div className="flex gap-2">
            {(['DETALHADA', 'CONSOLIDADA'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setModoEnvio(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${modoEnvio === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'}`}>
                {m === 'DETALHADA' ? 'Detalhada (item a item)' : 'Consolidada (so o total)'}
              </button>
            ))}
          </div>
        </div>
      </Secao>

      {/* Barra de acao fixa */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-superficie p-3 md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto max-w-lg">
          <Button onClick={gerar} disabled={salvarLead.isPending || salvarCotacao.isPending} className="w-full">
            {(salvarLead.isPending || salvarCotacao.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Gerar cotacao e link
          </Button>
        </div>
      </div>
    </div>
  );
}

function Secao({ icon: Icon, titulo, children }: { icon: React.ComponentType<{ className?: string }>; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-superficie p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Icon className="h-4 w-4 text-brand-500" /> {titulo}</h2>
      {children}
    </section>
  );
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-slate-500">{label}</label>{children}</div>;
}
