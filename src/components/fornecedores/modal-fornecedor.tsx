'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, Loader2, Check, X, LifeBuoy, Satellite } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select, Textarea, MoneyInput } from '@/components/ui/field';
import { useSaveFornecedor } from '@/hooks/use-fornecedores';
import { consultarCnpj } from '@/lib/cnpj';
import { buscarCep } from '@/lib/cep';
import { validarDocumento, formatarDocumento, soDigitos, formatarTelefone } from '@/lib/documento';
import type { FornecedoresRow, TipoPessoa, Json } from '@/lib/database.types';

// UM cadastro de fornecedor para o sistema inteiro. Prestador da 24h,
// rastreadora e fornecedor de pecas sao a mesma empresa prestando servico —
// o que muda sao os campos de cada tipo, que aparecem conforme a marcacao.
// Este modal e usado em /fornecedores e na aba Prestadores da Assistencia 24h;
// nao existem dois formularios para manter em sincronia (mesma escolha do
// <ModalVendedor>).

export interface EnderecoFornecedor {
  cep?: string; logradouro?: string; numero?: string; complemento?: string;
  bairro?: string; cidade?: string; uf?: string;
  [k: string]: string | undefined | null;
}
export type FormFornecedor = Omit<Partial<FornecedoresRow>, 'endereco'> & { endereco: EnderecoFornecedor };

export function formularioVazio(tipo?: 'prestador' | 'rastreadora'): FormFornecedor {
  return {
    tipo_pessoa: 'PJ',
    endereco: {},
    ativo: true,
    prestador_assistencia: tipo === 'prestador',
    empresa_rastreamento: tipo === 'rastreadora',
  };
}

export function ModalFornecedor({
  aberto, inicial, onClose, onSaved, titulo,
}: {
  aberto: boolean;
  inicial: FormFornecedor;
  onClose: () => void;
  onSaved?: (id: string) => void;
  titulo?: string;
}) {
  const salvar = useSaveFornecedor();
  const [form, setForm] = useState<FormFornecedor>(inicial);
  const [consultando, setConsultando] = useState(false);

  useEffect(() => { if (aberto) setForm(inicial); }, [aberto, inicial]);

  const tipo = (form.tipo_pessoa ?? 'PJ') as TipoPessoa;
  const docValido = form.documento ? validarDocumento(form.documento, tipo) : null;
  const end = form.endereco ?? {};
  const setEnd = (p: Partial<EnderecoFornecedor>) => setForm((f) => ({ ...f, endereco: { ...f.endereco, ...p } }));
  const setF = (p: Partial<FormFornecedor>) => setForm((f) => ({ ...f, ...p }));

  async function onCepBlur() {
    if (soDigitos(end.cep ?? '').length !== 8) return;
    const r = await buscarCep(end.cep ?? '');
    if (!r) return toast.error('CEP nao encontrado');
    setEnd({ logradouro: r.logradouro, bairro: r.bairro, cidade: r.cidade, uf: r.estado });
  }

  async function consultar() {
    if (!validarDocumento(form.documento ?? '', 'PJ')) return toast.error('CNPJ invalido');
    setConsultando(true);
    const d = await consultarCnpj(form.documento ?? '');
    setConsultando(false);
    if (!d.found) return toast.message('Consulta indisponivel - preencha os dados manualmente.');
    setForm((f) => ({
      ...f,
      razao_social: d.razao_social ?? f.razao_social,
      nome_fantasia: d.nome_fantasia ?? f.nome_fantasia,
      situacao_cadastral: d.situacao_cadastral ?? f.situacao_cadastral,
      cnae_principal: d.cnae_principal ?? f.cnae_principal,
      email: d.email ?? f.email,
      telefone: d.telefone ?? f.telefone,
      endereco: { ...f.endereco, ...(d.endereco ?? {}) } as EnderecoFornecedor,
      dados_receita: (d.raw as Json) ?? f.dados_receita,
    }));
    toast.success('Dados da Receita preenchidos');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razao_social?.trim()) return toast.error('Informe o nome/razao social');
    // Documento e OPCIONAL (0051): rastreadora e prestador pequeno as vezes
    // entram sem CNPJ. Mas se foi digitado, tem de ser valido.
    if (form.documento && !validarDocumento(form.documento, tipo)) {
      return toast.error(tipo === 'PF' ? 'CPF invalido' : 'CNPJ invalido');
    }
    salvar.mutate(form, {
      onSuccess: (id) => { toast.success('Fornecedor salvo'); onSaved?.(id); onClose(); },
      onError: (err) => toast.error(
        err.message.includes('documento') ? 'Documento ja cadastrado em outro fornecedor' : err.message,
      ),
    });
  }

  return (
    <Modal open={aberto} onClose={onClose} tamanho="xl"
      title={titulo ?? (form.id ? `Editar ${form.nome_fantasia || form.razao_social}` : 'Novo fornecedor')}
      subtitulo="Prestador da 24h, rastreadora e fornecedor de pecas ficam no mesmo cadastro.">
      <form onSubmit={submit} className="space-y-3">
        {/* O que esta empresa e para nos */}
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-600">Tipo de fornecedor</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.prestador_assistencia ?? false}
                onChange={(e) => setF({ prestador_assistencia: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300" />
              <LifeBuoy className="h-4 w-4 text-amber-500" /> Prestador da Assistencia 24h
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.empresa_rastreamento ?? false}
                onChange={(e) => setF({ empresa_rastreamento: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300" />
              <Satellite className="h-4 w-4 text-cyan-600" /> Empresa de rastreamento
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Pode marcar os dois — a mesma empresa as vezes reboca e rastreia. Sem marcar nada, e um
            fornecedor comum (pecas, servicos, oficina).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Tipo">
            <Select value={tipo} onChange={(e) => setF({ tipo_pessoa: e.target.value as TipoPessoa })}>
              <option value="PJ">CNPJ (PJ)</option>
              <option value="PF">CPF (PF)</option>
            </Select>
          </FormField>
          <FormField label={tipo === 'PJ' ? 'CNPJ' : 'CPF'} className="sm:col-span-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input value={form.documento ? formatarDocumento(form.documento, tipo) : ''}
                  onChange={(e) => setF({ documento: soDigitos(e.target.value) })}
                  placeholder={tipo === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                  className={docValido === false ? 'border-rose-400 pr-8' : docValido ? 'border-emerald-400 pr-8' : 'pr-8'} />
                {docValido === true && <Check className="absolute right-2 top-2.5 h-4 w-4 text-emerald-500" />}
                {docValido === false && <X className="absolute right-2 top-2.5 h-4 w-4 text-rose-500" />}
              </div>
              {tipo === 'PJ' && (
                <Button type="button" variant="secondary" onClick={consultar} disabled={consultando} className="mt-0 shrink-0">
                  {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Consultar
                </Button>
              )}
            </div>
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={tipo === 'PJ' ? 'Razao social *' : 'Nome *'}>
            <Input value={form.razao_social ?? ''} onChange={(e) => setF({ razao_social: e.target.value })} />
          </FormField>
          <FormField label="Nome fantasia">
            <Input value={form.nome_fantasia ?? ''} onChange={(e) => setF({ nome_fantasia: e.target.value })} />
          </FormField>
        </div>
        {tipo === 'PJ' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Situacao cadastral"><Input value={form.situacao_cadastral ?? ''} onChange={(e) => setF({ situacao_cadastral: e.target.value })} /></FormField>
            <FormField label="CNAE principal"><Input value={form.cnae_principal ?? ''} onChange={(e) => setF({ cnae_principal: e.target.value })} /></FormField>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Pessoa de contato"><Input value={form.contato ?? ''} onChange={(e) => setF({ contato: e.target.value })} /></FormField>
          <FormField label="E-mail"><Input type="email" value={form.email ?? ''} onChange={(e) => setF({ email: e.target.value })} /></FormField>
          <FormField label="Telefone"><Input value={form.telefone ? formatarTelefone(form.telefone) : ''} onChange={(e) => setF({ telefone: soDigitos(e.target.value) })} /></FormField>
        </div>

        {/* So para prestador da 24h */}
        {form.prestador_assistencia && (
          <div className="space-y-3 rounded-lg border border-amber-200 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <LifeBuoy className="h-4 w-4 text-amber-500" /> Assistencia 24h
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField label="WhatsApp (voucher)">
                <Input value={form.whatsapp ?? ''} onChange={(e) => setF({ whatsapp: e.target.value })} />
              </FormField>
              <FormField label="Cobertura">
                <Input value={form.cobertura ?? ''} onChange={(e) => setF({ cobertura: e.target.value })} placeholder="Grande Cuiaba, litoral..." />
              </FormField>
              <FormField label="Chave PIX (pagamento)">
                <Input name="chave_pix" value={form.chave_pix ?? ''} onChange={(e) => setF({ chave_pix: e.target.value })} />
              </FormField>
            </div>
            <p className="text-xs text-slate-400">
              Os servicos que ele atende e os valores acordados ficam em Assistencia 24h &gt; Prestadores.
            </p>
          </div>
        )}

        {/* So para rastreadora */}
        {form.empresa_rastreamento && (
          <div className="space-y-3 rounded-lg border border-cyan-200 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <Satellite className="h-4 w-4 text-cyan-600" /> Rastreamento
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Plataforma (URL)">
                <Input name="plataforma_url" value={form.plataforma_url ?? ''}
                  onChange={(e) => setF({ plataforma_url: e.target.value })} placeholder="https://..." />
              </FormField>
              <FormField label="Custo mensal por equipamento">
                <MoneyInput value={form.custo_mensal_equipamento ?? null}
                  onChange={(v) => setF({ custo_mensal_equipamento: v ?? 0 })} />
              </FormField>
            </div>
            <p className="text-xs text-slate-400">
              O custo alimenta o relatorio &quot;custo mensal por plataforma&quot; do modulo de Rastreadores.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-600">Endereco</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField label="CEP"><Input value={end.cep ?? ''} onChange={(e) => setEnd({ cep: e.target.value })} onBlur={onCepBlur} /></FormField>
            <FormField label="Logradouro" className="col-span-2 sm:col-span-3"><Input value={end.logradouro ?? ''} onChange={(e) => setEnd({ logradouro: e.target.value })} /></FormField>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField label="Numero"><Input value={end.numero ?? ''} onChange={(e) => setEnd({ numero: e.target.value })} /></FormField>
            <FormField label="Bairro" className="col-span-2"><Input value={end.bairro ?? ''} onChange={(e) => setEnd({ bairro: e.target.value })} /></FormField>
            <FormField label="UF"><Input maxLength={2} value={end.uf ?? ''} onChange={(e) => setEnd({ uf: e.target.value.toUpperCase() })} /></FormField>
          </div>
          <div className="mt-2">
            <FormField label="Cidade"><Input value={end.cidade ?? ''} onChange={(e) => setEnd({ cidade: e.target.value })} /></FormField>
          </div>
        </div>

        <FormField label="Observacoes">
          <Textarea rows={2} value={form.observacoes ?? ''} onChange={(e) => setF({ observacoes: e.target.value })} />
        </FormField>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.ativo ?? true} onChange={(e) => setF({ ativo: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300" />
          Ativo
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </form>
    </Modal>
  );
}
