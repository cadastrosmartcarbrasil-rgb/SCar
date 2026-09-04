'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Building, UploadCloud, Check, X, MapPin, Users, FileText, Plus, Trash2, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FormField, Input, Select } from '@/components/ui/field';
import {
  useEmpresa, useSaveEmpresa, useUploadLogo,
  useMandatos, useSaveMandato, useDiretoria, useSaveDiretor, useDeleteDiretor,
  useEmpresaDocumentos, useUploadDocumento, useDeleteDocumento, useSignedDocUrl,
} from '@/hooks/use-empresa';
import { buscarCep } from '@/lib/cep';
import { validarCNPJ, formatarCNPJ, formatarCEP, formatarTelefone, soDigitos } from '@/lib/documento';
import { formatDate } from '@/lib/utils';
import type { EmpresaRow, MandatosRow, DiretoriaRow } from '@/lib/database.types';

interface EnderecoEmpresa {
  cep?: string; logradouro?: string; numero?: string; complemento?: string;
  bairro?: string; cidade?: string; uf?: string;
  [k: string]: string | undefined;
}
type FormEmpresa = Omit<Partial<EmpresaRow>, 'endereco'> & { endereco: EnderecoEmpresa };
type Aba = 'cadastro' | 'diretoria' | 'documentos';

export default function EmpresaPage() {
  const { data: empresa } = useEmpresa();
  const salvar = useSaveEmpresa();
  const uploadLogo = useUploadLogo();
  const [aba, setAba] = useState<Aba>('cadastro');
  const [form, setForm] = useState<FormEmpresa>({ razao_social: '', endereco: {} });

  useEffect(() => {
    if (empresa) setForm({ ...empresa, endereco: (empresa.endereco as EnderecoEmpresa) ?? {} });
  }, [empresa]);

  const cnpjValido = form.cnpj ? validarCNPJ(form.cnpj) : null;
  const end = form.endereco ?? {};
  const setEnd = (p: Partial<EnderecoEmpresa>) => setForm((f) => ({ ...f, endereco: { ...f.endereco, ...p } }));
  const setF = (p: Partial<FormEmpresa>) => setForm((f) => ({ ...f, ...p }));

  async function onCepBlur() {
    if (soDigitos(end.cep ?? '').length !== 8) return;
    const r = await buscarCep(end.cep ?? '');
    if (!r) return toast.error('CEP nao encontrado');
    setEnd({ logradouro: r.logradouro, bairro: r.bairro, cidade: r.cidade, uf: r.estado });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razao_social) return toast.error('Informe a razao social');
    if (form.cnpj && !validarCNPJ(form.cnpj)) return toast.error('CNPJ invalido');
    salvar.mutate(form, {
      onSuccess: (emp) => {
        toast.success('Empresa salva');
        setForm({ ...emp, endereco: (emp.endereco as EnderecoEmpresa) ?? {} });
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (!empresa?.id) return toast.error('Salve o cadastro da empresa antes de enviar a logo');
    uploadLogo.mutate({ file, empresaId: empresa.id }, {
      onSuccess: () => toast.success('Logo atualizada'),
      onError: (e) => toast.error(e.message),
    });
  }

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'cadastro', label: 'Dados & Identidade', icon: Building },
    { id: 'diretoria', label: 'Diretoria & Mandatos', icon: Users },
    { id: 'documentos', label: 'Documentos', icon: FileText },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {abas.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <a.icon className="h-4 w-4" /> {a.label}
          </button>
        ))}
      </div>

      {aba === 'cadastro' && (
        <form onSubmit={submit} className="space-y-5">
          {/* Logo */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-6 pt-5">
              <div className="flex h-24 w-52 items-center justify-center rounded-lg border border-slate-200 bg-superficie p-2">
                <img src={empresa?.logo_url || '/logo-smartcar.svg'} alt="Logomarca" className="max-h-full max-w-full object-contain" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Logomarca</p>
                <p className="mb-2 text-xs text-slate-400">PNG, JPG ou SVG - ate 5MB</p>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                  <UploadCloud className="h-4 w-4" /> {uploadLogo.isPending ? 'Enviando...' : 'Enviar logo'}
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Dados cadastrais */}
          <Card>
            <CardContent className="space-y-4 pt-5">
              <h2 className="text-sm font-semibold text-slate-700">Dados cadastrais</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Razao social *">
                  <Input value={form.razao_social ?? ''} onChange={(e) => setF({ razao_social: e.target.value })} />
                </FormField>
                <FormField label="Nome fantasia">
                  <Input value={form.nome_fantasia ?? ''} onChange={(e) => setF({ nome_fantasia: e.target.value })} />
                </FormField>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField label="CNPJ">
                  <div className="relative">
                    <Input value={form.cnpj ? formatarCNPJ(form.cnpj) : ''} onChange={(e) => setF({ cnpj: soDigitos(e.target.value) })}
                      placeholder="00.000.000/0000-00" className={cnpjValido === false ? 'border-rose-400 pr-9' : cnpjValido ? 'border-emerald-400 pr-9' : 'pr-9'} />
                    {cnpjValido === true && <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-emerald-500" />}
                    {cnpjValido === false && <X className="absolute right-2.5 top-2.5 h-4 w-4 text-rose-500" />}
                  </div>
                </FormField>
                <FormField label="Inscricao Estadual">
                  <Input value={form.inscricao_estadual ?? ''} disabled={form.ie_isento} onChange={(e) => setF({ inscricao_estadual: e.target.value })} placeholder={form.ie_isento ? 'Isento' : ''} />
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <input type="checkbox" checked={form.ie_isento ?? false} onChange={(e) => setF({ ie_isento: e.target.checked })} /> Isento
                  </label>
                </FormField>
                <FormField label="Inscricao Municipal">
                  <Input value={form.inscricao_municipal ?? ''} disabled={form.im_isento} onChange={(e) => setF({ inscricao_municipal: e.target.value })} placeholder={form.im_isento ? 'Isento' : ''} />
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <input type="checkbox" checked={form.im_isento ?? false} onChange={(e) => setF({ im_isento: e.target.checked })} /> Isento
                  </label>
                </FormField>
              </div>
              <FormField label="Site">
                <Input type="url" value={form.site ?? ''} onChange={(e) => setF({ site: e.target.value })} placeholder="https://" />
              </FormField>
            </CardContent>
          </Card>

          {/* Contatos */}
          <Card>
            <CardContent className="space-y-4 pt-5">
              <h2 className="text-sm font-semibold text-slate-700">Contatos</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField label="E-mail principal"><Input type="email" value={form.email_principal ?? ''} onChange={(e) => setF({ email_principal: e.target.value })} /></FormField>
                <FormField label="E-mail financeiro"><Input type="email" value={form.email_financeiro ?? ''} onChange={(e) => setF({ email_financeiro: e.target.value })} /></FormField>
                <FormField label="E-mail juridico/adm"><Input type="email" value={form.email_juridico ?? ''} onChange={(e) => setF({ email_juridico: e.target.value })} /></FormField>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField label="Telefone fixo"><Input value={form.telefone_fixo ? formatarTelefone(form.telefone_fixo) : ''} onChange={(e) => setF({ telefone_fixo: soDigitos(e.target.value) })} placeholder="(00) 0000-0000" /></FormField>
                <FormField label="WhatsApp principal"><Input value={form.whatsapp_principal ? formatarTelefone(form.whatsapp_principal) : ''} onChange={(e) => setF({ whatsapp_principal: soDigitos(e.target.value) })} placeholder="(00) 00000-0000" /></FormField>
                <FormField label="WhatsApp suporte"><Input value={form.whatsapp_suporte ? formatarTelefone(form.whatsapp_suporte) : ''} onChange={(e) => setF({ whatsapp_suporte: soDigitos(e.target.value) })} placeholder="(00) 00000-0000" /></FormField>
              </div>
            </CardContent>
          </Card>

          {/* Endereco */}
          <Card>
            <CardContent className="space-y-4 pt-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700"><MapPin className="h-4 w-4" /> Endereco</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <FormField label="CEP"><Input value={end.cep ? formatarCEP(end.cep) : ''} onChange={(e) => setEnd({ cep: soDigitos(e.target.value) })} onBlur={onCepBlur} placeholder="00000-000" /></FormField>
                <FormField label="Logradouro" className="col-span-2 sm:col-span-3"><Input value={end.logradouro ?? ''} onChange={(e) => setEnd({ logradouro: e.target.value })} /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <FormField label="Numero"><Input value={end.numero ?? ''} onChange={(e) => setEnd({ numero: e.target.value })} /></FormField>
                <FormField label="Complemento" className="col-span-2 sm:col-span-3"><Input value={end.complemento ?? ''} onChange={(e) => setEnd({ complemento: e.target.value })} /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <FormField label="Bairro" className="col-span-2"><Input value={end.bairro ?? ''} onChange={(e) => setEnd({ bairro: e.target.value })} /></FormField>
                <FormField label="Cidade"><Input value={end.cidade ?? ''} onChange={(e) => setEnd({ cidade: e.target.value })} /></FormField>
                <FormField label="UF"><Input maxLength={2} value={end.uf ?? ''} onChange={(e) => setEnd({ uf: e.target.value.toUpperCase() })} /></FormField>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? 'Salvando...' : 'Salvar empresa'}</Button>
          </div>
        </form>
      )}

      {aba === 'diretoria' && (empresa?.id ? <AbaDiretoria empresaId={empresa.id} /> : <AvisoSalvar />)}
      {aba === 'documentos' && (empresa?.id ? <AbaDocumentos empresaId={empresa.id} /> : <AvisoSalvar />)}
    </div>
  );
}

function AvisoSalvar() {
  return <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Salve o cadastro da empresa (aba Dados) antes de gerenciar diretoria e documentos.</p>;
}

// ---------------- Diretoria & Mandatos ----------------
function AbaDiretoria({ empresaId }: { empresaId: string }) {
  const { data: mandatos } = useMandatos(empresaId);
  const salvarMandato = useSaveMandato();
  const [mandatoSel, setMandatoSel] = useState<string | null>(null);
  const atual = useMemo(() => (mandatoSel ? mandatos?.find((m) => m.id === mandatoSel) : mandatos?.[0]), [mandatos, mandatoSel]);
  const [novo, setNovo] = useState<Partial<MandatosRow> | null>(null);

  const hoje = new Date().toISOString().slice(0, 10);
  const statusExibido = (m: MandatosRow) => (m.status === 'VIGENTE' && m.data_fim < hoje ? 'EXPIRADO' : m.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={atual?.id ?? ''} onChange={(e) => setMandatoSel(e.target.value)} className="mt-0">
            {(mandatos ?? []).map((m) => (
              <option key={m.id} value={m.id}>Mandato {formatDate(m.data_inicio)} a {formatDate(m.data_fim)} ({statusExibido(m)})</option>
            ))}
            {(mandatos ?? []).length === 0 && <option value="">Nenhum mandato</option>}
          </Select>
        </div>
        <Button onClick={() => setNovo({ empresa_id: empresaId, status: 'VIGENTE', data_inicio: hoje, data_fim: '' })}>
          <Plus className="h-4 w-4" /> Novo mandato
        </Button>
      </div>

      {atual && <MembrosDiretoria mandato={atual} />}

      <Modal open={!!novo} onClose={() => setNovo(null)} title="Novo mandato" tamanho="lg">
        <form onSubmit={(e) => { e.preventDefault();
            if (!novo?.data_fim || novo.data_fim <= (novo.data_inicio ?? '')) return toast.error('Data fim deve ser posterior a data inicio');
            salvarMandato.mutate(novo, { onSuccess: (m) => { toast.success('Mandato criado'); setMandatoSel(m.id); setNovo(null); }, onError: (er) => toast.error(er.message) }); }}
          className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Inicio do mandato *"><Input type="date" value={novo?.data_inicio ?? ''} onChange={(e) => setNovo((p) => ({ ...p, data_inicio: e.target.value }))} /></FormField>
            <FormField label="Fim do mandato *"><Input type="date" value={novo?.data_fim ?? ''} onChange={(e) => setNovo((p) => ({ ...p, data_fim: e.target.value }))} /></FormField>
          </div>
          <FormField label="Status">
            <Select value={novo?.status ?? 'VIGENTE'} onChange={(e) => setNovo((p) => ({ ...p, status: e.target.value as MandatosRow['status'] }))}>
              <option value="VIGENTE">Vigente</option>
              <option value="EM_RENOVACAO">Em Renovacao</option>
              <option value="EXPIRADO">Expirado</option>
            </Select>
          </FormField>
          <div className="flex justify-end"><Button type="submit">Criar</Button></div>
        </form>
      </Modal>
    </div>
  );
}

function MembrosDiretoria({ mandato }: { mandato: MandatosRow }) {
  const { data: membros } = useDiretoria(mandato.id);
  const salvar = useSaveDiretor();
  const excluir = useDeleteDiretor();
  const [ed, setEd] = useState<Partial<DiretoriaRow> | null>(null);

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Membros da diretoria</p>
          <Button variant="secondary" onClick={() => setEd({ mandato_id: mandato.id, cargo: 'Presidente', nome_completo: '' })}>
            <Plus className="h-4 w-4" /> Adicionar membro
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400"><th className="py-2">Cargo</th><th className="py-2">Nome</th><th className="py-2">CPF</th><th className="py-2">Contato</th><th className="py-2"></th></tr></thead>
          <tbody>
            {(membros ?? []).map((m) => (
              <tr key={m.id} className="border-b border-slate-50">
                <td className="py-2 font-medium text-slate-700">{m.cargo}</td>
                <td className="py-2">{m.nome_completo}</td>
                <td className="py-2 text-slate-500">{m.cpf ?? '-'}</td>
                <td className="py-2 text-slate-500">{m.whatsapp || m.telefone || m.email || '-'}</td>
                <td className="py-2 text-right">
                  <button onClick={() => setEd(m)} className="mr-1 text-slate-400 hover:text-slate-600">editar</button>
                  <button onClick={() => confirm('Remover?') && excluir.mutate(m.id)}><Trash2 className="inline h-4 w-4 text-rose-400" /></button>
                </td>
              </tr>
            ))}
            {(membros ?? []).length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-400">Nenhum membro.</td></tr>}
          </tbody>
        </table>
      </CardContent>

      <Modal open={!!ed} onClose={() => setEd(null)} title={ed?.id ? 'Editar membro' : 'Novo membro'} tamanho="lg">
        <form onSubmit={(e) => { e.preventDefault(); if (!ed?.nome_completo) return toast.error('Informe o nome');
            salvar.mutate(ed, { onSuccess: () => { toast.success('Salvo'); setEd(null); }, onError: (er) => toast.error(er.message.includes('cpf') ? 'CPF invalido' : er.message) }); }}
          className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Cargo *"><Input value={ed?.cargo ?? ''} onChange={(e) => setEd((p) => ({ ...p, cargo: e.target.value }))} placeholder="Presidente, Tesoureiro..." /></FormField>
            <FormField label="CPF"><Input value={ed?.cpf ?? ''} onChange={(e) => setEd((p) => ({ ...p, cpf: e.target.value }))} placeholder="000.000.000-00" /></FormField>
          </div>
          <FormField label="Nome completo *"><Input value={ed?.nome_completo ?? ''} onChange={(e) => setEd((p) => ({ ...p, nome_completo: e.target.value }))} /></FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Telefone"><Input value={ed?.telefone ?? ''} onChange={(e) => setEd((p) => ({ ...p, telefone: e.target.value }))} /></FormField>
            <FormField label="WhatsApp"><Input value={ed?.whatsapp ?? ''} onChange={(e) => setEd((p) => ({ ...p, whatsapp: e.target.value }))} /></FormField>
            <FormField label="E-mail"><Input type="email" value={ed?.email ?? ''} onChange={(e) => setEd((p) => ({ ...p, email: e.target.value }))} /></FormField>
          </div>
          <div className="flex justify-end"><Button type="submit">Salvar</Button></div>
        </form>
      </Modal>
    </Card>
  );
}

// ---------------- Documentos ----------------
const TIPOS_DOC = ['Estatuto Social', 'Contrato Social', 'Cartao CNPJ', 'Ata de Eleicao', 'Comprovante de Endereco', 'Outro'];

function AbaDocumentos({ empresaId }: { empresaId: string }) {
  const { data: docs } = useEmpresaDocumentos(empresaId);
  const upload = useUploadDocumento();
  const excluir = useDeleteDocumento();
  const signed = useSignedDocUrl();
  const [tipo, setTipo] = useState(TIPOS_DOC[0]);

  async function abrir(path: string) {
    try { const url = await signed.mutateAsync(path); window.open(url, '_blank'); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-end gap-2">
          <FormField label="Tipo de documento" className="w-64">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS_DOC.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          </FormField>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-acao px-3 py-2 text-sm text-white hover:bg-acao-escura">
            <UploadCloud className="h-4 w-4" /> {upload.isPending ? 'Enviando...' : 'Enviar documento'}
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate({ file: f, empresaId, tipo }, { onSuccess: () => toast.success('Documento enviado'), onError: (er) => toast.error(er.message) }); }} />
          </label>
        </div>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {(docs ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between p-3 text-sm">
              <button onClick={() => abrir(d.url_arquivo)} className="flex items-center gap-2 text-left text-slate-700 hover:text-brand-600">
                <FileText className="h-4 w-4 text-slate-400" /> {d.nome_arquivo}
                <span className="text-xs text-slate-400">({d.tipo_documento})</span>
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{formatDate(d.data_upload)}</span>
                <button onClick={() => abrir(d.url_arquivo)}><Download className="h-4 w-4 text-slate-400 hover:text-brand-600" /></button>
                <button onClick={() => confirm('Excluir documento?') && excluir.mutate(d.id)}><Trash2 className="h-4 w-4 text-rose-400 hover:text-rose-600" /></button>
              </div>
            </li>
          ))}
          {(docs ?? []).length === 0 && <li className="p-4 text-center text-xs text-slate-400">Nenhum documento anexado.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
