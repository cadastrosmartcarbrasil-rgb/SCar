'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  Camera, Car, HandCoins, Image as ImgIcon, Loader2, Save, Search, Trash2, UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, MoneyInput, Select } from '@/components/ui/field';
import {
  useAddFotoVistoria, useBuscarAssociadoPorDocumento, useChecklistLead, useRemoverFotoVistoria,
  useSalvarFichaLead, useUploadCrlv, useUrlAssinadaVendas, useVendedoresDaRegional, useVistoriaLead,
} from '@/hooks/use-vendas';
import { usePlanos } from '@/hooks/use-precificacao';
import { buscarCep } from '@/lib/cep';
import { formatarDocumento, validarDocumento } from '@/lib/documento';
import { maskCelular, formatCurrency } from '@/lib/utils';
import { FORMA_ADESAO_ROTULO, ratearAdesao, type FormaAdesao } from '@/lib/vendas';
import type { DadosCrlv } from '@/lib/crlv';
import type { LeadsRow } from '@/lib/database.types';
import { FotosVistoria } from '@/components/vistoria/fotos-vistoria';
import { ChecklistEntrada } from './checklist-entrada';
import { LeitorCrlv } from './leitor-crlv';

type Endereco = { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string };

function Secao({ icone: Icone, titulo, descricao, children }: {
  icone: React.ElementType; titulo: string; descricao?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
      <header className="mb-3 flex items-start gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-slate-100 text-slate-500">
          <Icone className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
          {descricao && <p className="text-[11.5px] leading-snug text-slate-500">{descricao}</p>}
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * Fechamento da venda: a ficha que faltava entre a cotacao e a entrada na base.
 * Antes, a rota terminava pedindo so o CPF. Aqui o consultor completa o
 * cadastro do associado, a ficha do veiculo, a vistoria com fotos, o CRLV e a
 * forma de recebimento da adesao — e o checklist mostra o que ainda falta.
 */
export function FechamentoVenda({ lead }: { lead: LeadsRow }) {
  const [form, setForm] = useState<Partial<LeadsRow>>(lead);
  const endereco = (form.endereco ?? {}) as Endereco;

  const { data: checklist } = useChecklistLead(lead.id);
  const { data: vistoria } = useVistoriaLead(lead.id);
  const { data: planos } = usePlanos();
  const { data: vendedores } = useVendedoresDaRegional(lead.regional_id);
  const salvar = useSalvarFichaLead();
  const buscarAssociado = useBuscarAssociadoPorDocumento();
  const addFoto = useAddFotoVistoria(lead.id);
  const removerFoto = useRemoverFotoVistoria(lead.id);
  const uploadCrlv = useUploadCrlv(lead.id);
  const urlAssinada = useUrlAssinadaVendas();

  const [buscandoCep, setBuscandoCep] = useState(false);
  const [enviandoFotos, setEnviandoFotos] = useState(0);

  useEffect(() => setForm(lead), [lead]);

  const set = (patch: Partial<LeadsRow>) => setForm((p) => ({ ...p, ...patch }));
  const setEnd = (patch: Endereco) => set({ endereco: { ...endereco, ...patch } as LeadsRow['endereco'] });

  const vendedorSel = useMemo(
    () => (vendedores ?? []).find((v) => v.id === form.vendedor_id),
    [vendedores, form.vendedor_id],
  );
  const rateio = ratearAdesao(
    Number(form.adesao_valor ?? 0),
    (form.adesao_forma ?? null) as FormaAdesao | null,
    Number(vendedorSel?.taxa_comissao_adesao ?? 0),
  );

  async function preencherPorCep(cep: string) {
    setEnd({ cep });
    if (cep.replace(/\D/g, '').length !== 8) return;
    setBuscandoCep(true);
    const r = await buscarCep(cep);
    setBuscandoCep(false);
    if (!r) return toast.error('CEP nao encontrado');
    setEnd({ cep, logradouro: r.logradouro, bairro: r.bairro, cidade: r.cidade, uf: r.estado });
  }

  async function conferirAssociado() {
    const doc = (form.cpf_cnpj ?? '').replace(/\D/g, '');
    if (!validarDocumento(doc, doc.length > 11 ? 'PJ' : 'PF')) return toast.error('CPF/CNPJ invalido');
    const cli = await buscarAssociado.mutateAsync(doc);
    if (!cli) return toast.info('Associado novo — preencha a ficha abaixo.');
    const end = (cli.endereco ?? {}) as Endereco;
    set({
      cliente_existente_id: cli.id,
      nome: cli.nome_razao_social,
      tipo_pessoa: cli.tipo_pessoa,
      rg_ie: cli.rg_ie,
      email: cli.email ?? form.email,
      celular: cli.telefone ?? form.celular,
      endereco: (Object.keys(end).length ? end : endereco) as LeadsRow['endereco'],
    });
    toast.success(`Associado ja cadastrado: ${cli.nome_razao_social} — ficha reaproveitada.`);
  }

  function aplicarCrlv(d: DadosCrlv) {
    set({
      crlv_qrcode: d.bruto,
      placa: d.placa ?? form.placa,
      renavam: d.renavam ?? form.renavam,
      chassi: d.chassi ?? form.chassi,
    });
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    onDrop: async (arquivos) => {
      for (const file of arquivos) {
        setEnviandoFotos((n) => n + 1);
        try { await addFoto.mutateAsync({ file }); }
        catch (e) { toast.error(`Falha em "${file.name}": ${(e as Error).message}`); }
        finally { setEnviandoFotos((n) => n - 1); }
      }
    },
  });

  async function abrir(path: string) {
    try { window.open(await urlAssinada.mutateAsync(path), '_blank', 'noopener'); }
    catch { toast.error('Nao consegui abrir o arquivo'); }
  }

  function gravar() {
    const { id, ...patch } = form as LeadsRow;
    salvar.mutate({ id: lead.id, ...patch }, {
      onSuccess: () => toast.success('Ficha salva'),
      onError: (e) => toast.error(e.message),
    });
  }

  const fotos = vistoria?.anexos ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {/* ---------------------------------------------------- Associado */}
        <Secao icone={UserRound} titulo="Associado" descricao="Confira o CPF/CNPJ primeiro: se ja for associado, a ficha vem preenchida.">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="CPF / CNPJ *" className="sm:col-span-2">
              <div className="flex gap-2">
                <Input
                  value={formatarDocumento(form.cpf_cnpj ?? '', (form.cpf_cnpj ?? '').length > 11 ? 'PJ' : 'PF')}
                  onChange={(e) => set({ cpf_cnpj: e.target.value.replace(/\D/g, '') })}
                  placeholder="Somente numeros"
                />
                <Button type="button" variant="secondary" onClick={conferirAssociado} disabled={buscarAssociado.isPending}>
                  {buscarAssociado.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Conferir
                </Button>
              </div>
            </FormField>
            <FormField label="Tipo">
              <Select value={form.tipo_pessoa ?? ''} onChange={(e) => set({ tipo_pessoa: (e.target.value || null) as LeadsRow['tipo_pessoa'] })}>
                <option value="">-- Auto --</option>
                <option value="PF">Pessoa Fisica</option>
                <option value="PJ">Pessoa Juridica</option>
              </Select>
            </FormField>
          </div>

          {form.cliente_existente_id && (
            <p className="rounded-lg bg-cyan-50 px-3 py-1.5 text-[11.5px] text-cyan-800">
              Associado ja existe na base — a ficha sera atualizada, nao duplicada.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Nome completo / Razao social *">
              <Input value={form.nome ?? ''} onChange={(e) => set({ nome: e.target.value })} />
            </FormField>
            <FormField label={form.tipo_pessoa === 'PJ' ? 'Inscricao estadual *' : 'RG *'}>
              <Input value={form.rg_ie ?? ''} onChange={(e) => set({ rg_ie: e.target.value })} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Celular / WhatsApp *">
              <Input value={form.celular ?? ''} onChange={(e) => set({ celular: maskCelular(e.target.value) })} inputMode="tel" />
            </FormField>
            <FormField label="E-mail *">
              <Input type="email" value={form.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
            </FormField>
            <FormField label={form.tipo_pessoa === 'PJ' ? 'Data de fundacao *' : 'Data de nascimento *'}>
              <Input type="date" className="tnum" value={form.data_nascimento ?? ''} onChange={(e) => set({ data_nascimento: e.target.value })} />
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="CEP *">
              <div className="relative">
                <Input value={endereco.cep ?? ''} onChange={(e) => preencherPorCep(e.target.value)} inputMode="numeric" />
                {buscandoCep && <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
              </div>
            </FormField>
            <FormField label="Logradouro *" className="sm:col-span-2">
              <Input value={endereco.logradouro ?? ''} onChange={(e) => setEnd({ logradouro: e.target.value })} />
            </FormField>
            <FormField label="Numero *">
              <Input value={endereco.numero ?? ''} onChange={(e) => setEnd({ numero: e.target.value })} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Complemento">
              <Input value={endereco.complemento ?? ''} onChange={(e) => setEnd({ complemento: e.target.value })} />
            </FormField>
            <FormField label="Bairro">
              <Input value={endereco.bairro ?? ''} onChange={(e) => setEnd({ bairro: e.target.value })} />
            </FormField>
            <FormField label="Cidade *">
              <Input value={endereco.cidade ?? ''} onChange={(e) => setEnd({ cidade: e.target.value })} />
            </FormField>
            <FormField label="UF *">
              <Input maxLength={2} value={endereco.uf ?? ''} onChange={(e) => setEnd({ uf: e.target.value.toUpperCase() })} />
            </FormField>
          </div>
        </Secao>

        {/* ---------------------------------------------------- Veiculo */}
        <Secao icone={Car} titulo="Veiculo" descricao="Chassi, Renavam e cor sao obrigatorios para o veiculo entrar na base.">
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Placa *">
              <Input value={form.placa ?? ''} onChange={(e) => set({ placa: e.target.value.toUpperCase() })} maxLength={8} />
            </FormField>
            <FormField label="Chassi *" className="sm:col-span-2">
              <Input value={form.chassi ?? ''} onChange={(e) => set({ chassi: e.target.value.toUpperCase() })} maxLength={17} placeholder="17 caracteres" />
            </FormField>
            <FormField label="Renavam *">
              <Input value={form.renavam ?? ''} onChange={(e) => set({ renavam: e.target.value.replace(/\D/g, '') })} maxLength={11} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <FormField label="Marca *"><Input value={form.marca ?? ''} onChange={(e) => set({ marca: e.target.value })} /></FormField>
            <FormField label="Modelo *"><Input value={form.modelo ?? ''} onChange={(e) => set({ modelo: e.target.value })} /></FormField>
            <FormField label="Ano fabricacao *">
              <Input type="number" className="tnum" value={form.ano_fabricacao ?? ''} onChange={(e) => set({ ano_fabricacao: e.target.value ? Number(e.target.value) : null })} />
            </FormField>
            <FormField label="Ano modelo *">
              <Input type="number" className="tnum" value={form.ano_modelo ?? ''} onChange={(e) => set({ ano_modelo: e.target.value ? Number(e.target.value) : null })} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Cor *"><Input value={form.cor ?? ''} onChange={(e) => set({ cor: e.target.value })} /></FormField>
            <FormField label="Valor FIPE *">
              <MoneyInput value={form.valor_fipe ?? null} onChange={(v) => set({ valor_fipe: v })} />
            </FormField>
            <FormField label="Plano contratado *">
              <Select value={form.plano_id ?? ''} onChange={(e) => set({ plano_id: e.target.value || null })}>
                <option value="">-- Selecione --</option>
                {(planos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Select>
            </FormField>
          </div>
        </Secao>

        {/* ---------------------------------------------------- Documentos */}
        <Secao icone={Camera} titulo="Documentos e vistoria" descricao="CRLV do veiculo e as fotos obrigatorias da vistoria.">
          <LeitorCrlv onLido={aplicarCrlv} valorAtual={form.crlv_qrcode} />

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <input
                type="file" className="hidden" accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadCrlv.mutate(f, {
                    onSuccess: () => toast.success('CRLV anexado'),
                    onError: (err) => toast.error(err.message),
                  });
                }}
              />
              {uploadCrlv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImgIcon className="h-4 w-4" />}
              Anexar copia do CRLV
            </label>
            {form.crlv_url && (
              <button type="button" onClick={() => abrir(form.crlv_url!)} className="text-xs font-medium text-cyan-700 underline">
                Ver CRLV anexado
              </button>
            )}
          </div>

          {/* A vistoria e guiada pelo modelo de poses (0040): mesma lista que o
              vendedor ve no celular, e a mesma que o checklist cobra. */}
          <FotosVistoria leadId={lead.id} />
        </Secao>

        {/* ---------------------------------------------------- Adesao */}
        <Secao icone={HandCoins} titulo="Adesao e vendedor" descricao="Como a taxa de adesao foi recebida define se ela entra no nosso financeiro.">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Vendedor *">
              <Select value={form.vendedor_id ?? ''} onChange={(e) => set({ vendedor_id: e.target.value || null })}>
                <option value="">-- Selecione --</option>
                {(vendedores ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.usuarios?.nome ?? 'Vendedor'}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Valor da adesao *">
              <MoneyInput value={form.adesao_valor ?? null} onChange={(v) => set({ adesao_valor: v })} />
            </FormField>
            <FormField label="Forma de recebimento *">
              <Select value={form.adesao_forma ?? ''} onChange={(e) => set({ adesao_forma: (e.target.value || null) as LeadsRow['adesao_forma'] })}>
                <option value="">-- Selecione --</option>
                {(Object.keys(FORMA_ADESAO_ROTULO) as FormaAdesao[]).map((f) => (
                  <option key={f} value={f}>{FORMA_ADESAO_ROTULO[f]}</option>
                ))}
              </Select>
            </FormField>
          </div>

          {form.adesao_forma && (
            <div className={`rounded-xl border px-3 py-2.5 text-[11.5px] leading-relaxed ${
              rateio.entraNoCaixa ? 'border-cyan-200 bg-cyan-50 text-cyan-900' : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}>
              <p className="font-semibold">{rateio.resumo}</p>
              {rateio.entraNoCaixa && (
                <p className="tnum mt-1">
                  Receita da associacao {formatCurrency(rateio.valor)} · repasse ao vendedor{' '}
                  {formatCurrency(rateio.vendedor)} · fica {formatCurrency(rateio.associacao)}
                  {vendedorSel && <> (comissao de {(Number(vendedorSel.taxa_comissao_adesao) * 100).toFixed(0)}%)</>}
                </p>
              )}
            </div>
          )}
        </Secao>

        <div className="flex justify-end">
          <Button onClick={gravar} disabled={salvar.isPending}>
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar ficha
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <ChecklistEntrada itens={checklist ?? []} />
      </aside>
    </div>
  );
}
