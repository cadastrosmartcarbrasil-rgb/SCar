'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, BadgeCheck, Calculator, Car, Loader2, Sparkles, User,
} from 'lucide-react';
import { Input, Select, MoneyInput } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { FipeConsulta } from '@/components/fipe/fipe-consulta';
import { useFipePorPlaca } from '@/hooks/use-fipe';
import { useTiposVeiculo, useProdutos, useCotasParticipacao } from '@/hooks/use-precificacao';
import {
  useCotacaoComparativa, useProdutosDoPlano, useSalvarCotacao, useSaveLead, type PlanoComparado,
} from '@/hooks/use-vendas';
import { avulsosParaCotacao, separarOpcionais } from '@/lib/vistoria';
import { placaCompleta, tipoVeiculoSugerido } from '@/lib/venda-publica';
import { normalizarPlaca } from '@/lib/placa';
import { maskCelular, formatCurrency } from '@/lib/utils';
import type { Combustivel, LeadsRow, OrigemFipe } from '@/lib/database.types';

/** O que a tela precisa gravar para criar o lead. */
export type NovoLead = Partial<LeadsRow> & { nome: string; celular: string };

/** Identifica a opcao escolhida no comparativo ('BASE' = so a cobertura base). */
const chaveDoPlano = (p: PlanoComparado) => p.plano_id ?? 'BASE';

// ---------------------------------------------------------------------------
// Novo lead + cotacao. Uma tela so, usada pelo CRM (/vendas/novo) e pelo
// portal do vendedor (/vendedor/leads/novo) — o que muda entre os dois e
// COMO o lead nasce e para onde a tela volta.
//
// A ordem segue a conversa real: a pessoa manda a PLACA e quer saber o preco.
// Por isso a tela comeca no veiculo, cota TODOS os planos de uma vez (como a
// pagina publica ja fazia) e so pede nome e telefone depois que o numero
// agradou. Nao existe mais botao "calcular": trocar um opcional recotiza.
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
  const fipePorPlaca = useFipePorPlaca();
  const salvarLead = useSaveLead();
  const salvarCotacao = useSalvarCotacao();
  const criar = criarLead ?? ((d: NovoLead) => salvarLead.mutateAsync(d));

  // Veiculo
  const [placa, setPlaca] = useState('');
  const [tipoVeiculoId, setTipoVeiculoId] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anoModelo, setAnoModelo] = useState<number | ''>('');
  const [combustivel, setCombustivel] = useState<Combustivel | ''>('');
  const [valorFipe, setValorFipe] = useState<number | null>(null);
  const [codigoFipe, setCodigoFipe] = useState('');
  const [cotaId, setCotaId] = useState('');
  const [origemFipe, setOrigemFipe] = useState<OrigemFipe>('MANUAL');
  const [mostrarCascata, setMostrarCascata] = useState(false);
  // Cotacao
  const [escolha, setEscolha] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modoEnvio, setModoEnvio] = useState<'DETALHADA' | 'CONSOLIDADA'>('DETALHADA');
  // Lead
  const [nome, setNome] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');

  // Um preco por plano, recalculado sozinho a cada mudanca de veiculo/opcional.
  const comparativo = useCotacaoComparativa({
    fipe: valorFipe, tipoVeiculoId, cotaId: cotaId || null, avulsos: [...selecionados],
  });
  const planos = useMemo(() => comparativo.data ?? [], [comparativo.data]);
  const escolhido = planos.find((p) => chaveDoPlano(p) === escolha) ?? null;
  // O do meio e onde a maioria fecha — sugerimos, o vendedor decide.
  const sugerido = planos.length > 1 ? chaveDoPlano(planos[Math.min(2, planos.length - 1)]) : null;

  const { data: doPlano } = useProdutosDoPlano(escolhido?.plano_id ?? null);
  const idsDoPlano = useMemo(() => (doPlano ?? []).map((p) => p.produto_id), [doPlano]);
  const opcionais = useMemo(() => (produtos ?? []).filter((p) => !p.obrigatorio && p.status), [produtos]);
  const { inclusos, avulsos } = useMemo(
    () => separarOpcionais(opcionais, idsDoPlano),
    [opcionais, idsDoPlano],
  );

  // Enquanto a lista nao chega, nada esta escolhido; quando chega, cai no sugerido.
  useEffect(() => {
    if (planos.length === 0) return;
    setEscolha((atual) => (planos.some((p) => chaveDoPlano(p) === atual) ? atual : (sugerido ?? '')));
  }, [planos, sugerido]);

  // ------------------------------------------------------------------ placa
  // Placa completa = consulta na hora. Quem digita a placa quer o preco, nao
  // um botao a mais.
  const ultimaBuscada = useRef('');
  useEffect(() => {
    const p = normalizarPlaca(placa);
    if (!placaCompleta(p) || ultimaBuscada.current === p) return;
    ultimaBuscada.current = p;
    void consultarPlacaFipe(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placa]);

  async function consultarPlacaFipe(p: string) {
    const r = await fipePorPlaca.mutateAsync(p).catch(() => null);
    const v = r?.valor ?? null;
    if (!v) {
      setMostrarCascata(true);
      toast.message('Placa nao encontrada na FIPE — busque pelo modelo abaixo.');
      return;
    }
    if (v.marca) setMarca(v.marca);
    if (v.modelo) setModelo(v.modelo);
    if (v.anoModelo) setAnoModelo(v.anoModelo);
    if (v.combustivel) setCombustivel(v.combustivel as Combustivel);
    if (v.valor != null) setValorFipe(v.valor);
    if (v.codigoFipe) setCodigoFipe(v.codigoFipe);
    setOrigemFipe('API');
    // O tipo sai do registro da FIPE, como na pagina publica: o vendedor
    // confirma ou corrige, mas nao precisa adivinhar.
    const sugestao = tipoVeiculoSugerido(v.bruto, (tipos ?? []).map((t) => ({ id: t.id, nome: t.nome })));
    if (sugestao) setTipoVeiculoId((atual) => atual || sugestao);
    toast.success(`FIPE: ${formatCurrency(v.valor ?? 0)}`);
  }

  function toggle(id: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function gerar() {
    if (!valorFipe) return toast.error('Informe o valor FIPE do veiculo');
    if (!tipoVeiculoId) return toast.error('Selecione o tipo de veiculo');
    if (!escolhido) return toast.error('Escolha o plano da proposta');
    if (!nome.trim()) return toast.error('Informe o nome do lead');
    if (celular.replace(/\D/g, '').length < 10) return toast.error('Informe um celular valido');
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
        planoId: escolhido.plano_id,
        produtosIds: avulsosParaCotacao(selecionados, idsDoPlano),
        modoEnvio,
      });
      toast.success('Cotacao gerada');
      aoConcluir(lead.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const salvando = salvarLead.isPending || salvarCotacao.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24">
      <Link href={voltarPara.href} className="inline-flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeft className="h-4 w-4" /> {voltarPara.rotulo}
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Nova cotacao</h1>

      {/* 1. Veiculo — a conversa comeca na placa */}
      <Secao icon={Car} titulo="1. Veiculo">
        <Campo label="Placa">
          <div className="relative">
            <Input
              value={placa}
              onChange={(e) => setPlaca(normalizarPlaca(e.target.value))}
              placeholder="ABC1D23"
              className="font-mono text-lg uppercase tracking-widest"
              maxLength={7}
              autoFocus
            />
            {fipePorPlaca.isPending && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Assim que a placa fica completa, buscamos marca, modelo e valor FIPE sozinhos.
          </p>
        </Campo>

        {!mostrarCascata && (
          <button type="button" onClick={() => setMostrarCascata(true)} className="text-xs font-medium text-brand-600">
            Nao tem a placa? Buscar por Tipo &gt; Marca &gt; Modelo &gt; Ano
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
          <Campo label="Ano modelo">
            <Input type="number" className="tnum" value={anoModelo}
              onChange={(e) => setAnoModelo(e.target.value === '' ? '' : Number(e.target.value))} />
          </Campo>
          <Campo label="Valor FIPE (R$) *">
            <MoneyInput value={valorFipe} placeholder="0,00"
              onChange={(v) => { setValorFipe(v); if (origemFipe === 'API') setOrigemFipe('MANUAL'); }} />
          </Campo>
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
              {(cotas ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} — {(c.percentual * 100).toFixed(0)}%</option>
              ))}
            </Select>
          </Campo>
        </div>
      </Secao>

      {/* 2. Planos lado a lado */}
      <Secao icon={Calculator} titulo="2. Planos para este veiculo">
        {!valorFipe || !tipoVeiculoId ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
            Informe o valor FIPE e o tipo do veiculo para ver os planos.
          </p>
        ) : comparativo.isLoading ? (
          <p className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Cotando os planos...
          </p>
        ) : planos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-rose-200 px-3 py-6 text-center text-xs text-rose-500">
            Nenhum plano disponivel para este veiculo.
          </p>
        ) : (
          <div className={`space-y-2 transition ${comparativo.isFetching ? 'opacity-60' : ''}`}>
            {planos.map((p) => {
              const chave = chaveDoPlano(p);
              const ativo = chave === escolha;
              return (
                <button
                  key={chave} type="button" onClick={() => setEscolha(chave)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    ativo ? 'border-cyan-500 bg-cyan-50/50 ring-1 ring-cyan-400'
                      : 'border-slate-200 bg-superficie hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[14px] font-bold text-brand-800">
                        {p.nome}
                        {chave === sugerido && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-cyan-800">
                            <Sparkles className="h-2.5 w-2.5" /> sugerido
                          </span>
                        )}
                      </p>
                      {p.descricao && (
                        <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{p.descricao}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">por mes</p>
                      <p className="tnum text-[19px] font-bold leading-tight text-brand-700">
                        {formatCurrency(p.mensalidade)}
                      </p>
                    </div>
                  </div>
                  {ativo && (
                    <>
                      {p.itens.length > 0 && (
                        <ul className="mt-2.5 grid gap-1 border-t border-cyan-200/70 pt-2.5 sm:grid-cols-2">
                          {p.itens.map((i) => (
                            <li key={i.nome} className="flex items-center gap-1.5 text-[11.5px] text-slate-600">
                              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-cyan-600" /> {i.nome}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-2 text-[11px] text-slate-500">
                        {p.adesao > 0 && <>Adesao unica de <b>{formatCurrency(p.adesao)}</b>. </>}
                        {p.participacao > 0 && <>Participacao no evento: <b>{formatCurrency(p.participacao)}</b>.</>}
                      </p>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Adicionais: marcar/desmarcar recotiza todos os planos */}
        {planos.length > 0 && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium uppercase text-slate-400">Adicionais</p>
            {inclusos.length > 0 && (
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
            )}
            <div className="space-y-1">
              {avulsos.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggle(p.id)}
                    className="h-4 w-4 rounded border-slate-300" />
                  {p.nome}
                  {p.valor_fixo != null && <span className="text-xs text-slate-400">({formatCurrency(p.valor_fixo)})</span>}
                </label>
              ))}
              {avulsos.length === 0 && <span className="text-xs text-slate-400">Nenhum adicional cadastrado.</span>}
            </div>
          </div>
        )}
      </Secao>

      {/* 3. Contato — depois que o numero agradou */}
      <Secao icon={User} titulo="3. Dados do lead">
        <Campo label="Nome *">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Celular / WhatsApp *">
            <Input value={celular} onChange={(e) => setCelular(maskCelular(e.target.value))}
              inputMode="tel" placeholder="(11) 91234-5678" />
          </Campo>
          <Campo label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" />
          </Campo>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-slate-400">Envio ao cliente</p>
          <div className="flex gap-2">
            {(['DETALHADA', 'CONSOLIDADA'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setModoEnvio(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${
                  modoEnvio === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
                }`}>
                {m === 'DETALHADA' ? 'Detalhada (item a item)' : 'Consolidada (so o total)'}
              </button>
            ))}
          </div>
        </div>
      </Secao>

      {/* Barra de acao fixa: mostra o que vai ser enviado */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-superficie p-3 md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto max-w-2xl space-y-1.5">
          {escolhido && (
            <p className="text-center text-[11.5px] text-slate-500">
              {escolhido.nome} · <b className="tnum text-brand-700">{formatCurrency(escolhido.mensalidade)}/mes</b>
              {escolhido.adesao > 0 && <> · adesao {formatCurrency(escolhido.adesao)}</>}
            </p>
          )}
          <Button onClick={gerar} disabled={salvando || !escolhido} className="w-full">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
