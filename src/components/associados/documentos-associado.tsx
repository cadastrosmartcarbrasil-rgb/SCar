'use client';

/**
 * Aba ANEXOS do associado (0177): identidade, CNH (com vencimento obrigatorio),
 * comprovante de endereco e outros. Serve a ficha do associado (clienteId) e a
 * venda (leadId — o documento acompanha o lead e entra na ficha na autorizacao).
 */
import { useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, MessageCircle, Trash2, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, Input, Select } from '@/components/ui/field';
import { usePode } from '@/hooks/use-permissoes';
import {
  useConferirDocumento, useDocumentacaoCliente, useDocumentosAssociado, useEnviarDocumentoAssociado,
  useRemoverDocumentoAssociado, useUrlsDocumentos, type DonoDocumentos,
} from '@/hooks/use-documentos-associado';
import {
  ROTULO_SITUACAO_DOCUMENTO, TIPOS_DOCUMENTO, mensagemPedirNovaCnh, rotuloTipoDocumento,
  situacaoCnh, validarEnvioDocumento,
} from '@/lib/documentos-associado';
import { linkWhatsApp } from '@/lib/assistencia';
import { formatDate } from '@/lib/utils';
import type { AssociadoDocumentosRow, TipoDocumentoAssociado } from '@/lib/database.types';

const COR_SITUACAO: Record<string, string> = {
  AGUARDANDO: 'bg-amber-100 text-amber-800',
  CONFERIDO: 'bg-emerald-100 text-emerald-800',
  RECUSADO: 'bg-rose-100 text-rose-800',
  SUBSTITUIDO: 'bg-slate-100 text-slate-500',
};

const COR_CNH: Record<string, string> = {
  vencida: 'border-rose-300 bg-rose-50 text-rose-800',
  a_vencer: 'border-amber-300 bg-amber-50 text-amber-800',
  valida: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  sem_cnh: 'border-slate-200 bg-superficie text-slate-600',
};

export function DocumentosAssociado({ clienteId, leadId, nome, celular, compacto }: DonoDocumentos & {
  nome?: string | null;
  celular?: string | null;
  /** Dentro da venda: sem o cabecalho explicativo longo. */
  compacto?: boolean;
}) {
  const dono = { clienteId, leadId };
  const { data: docs = [], isLoading, error } = useDocumentosAssociado(dono);
  const { data: urls = {} } = useUrlsDocumentos(docs.map((d) => d.url));
  const podeAuditar = usePode('vendas.fechar');
  const [mostrarSubstituidos, setMostrarSubstituidos] = useState(false);

  const vigentes = docs.filter((d) => d.situacao !== 'SUBSTITUIDO');
  const antigos = docs.filter((d) => d.situacao === 'SUBSTITUIDO');
  const cnh = vigentes.filter((d) => d.tipo === 'CNH' && d.situacao !== 'RECUSADO')
    .sort((a, b) => (b.validade ?? '').localeCompare(a.validade ?? ''))[0];
  const sitCnh = situacaoCnh(cnh?.validade);
  const temIdentidade = vigentes.some((d) => d.situacao !== 'RECUSADO'
    && (d.tipo === 'RG' || d.tipo === 'CONTRATO_SOCIAL' || (d.tipo === 'CNH' && situacaoCnh(d.validade).nivel !== 'vencida')));
  const temComprovante = vigentes.some((d) => d.situacao !== 'RECUSADO' && d.tipo === 'COMPROVANTE_ENDERECO');
  const zap = cnh && sitCnh.nivel === 'vencida' ? linkWhatsApp(celular, mensagemPedirNovaCnh(nome, cnh.validade)) : null;

  return (
    <div className="space-y-4">
      {!compacto && (
        <p className="text-sm text-slate-500">
          Documentos exigidos na ficha: <strong>identidade (RG ou CNH)</strong> e <strong>comprovante de endereço</strong>.
          A CNH leva a data de vencimento — no evento, o sistema avisa quando ela está vencida.
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Pendencia ok={temIdentidade} texto="Identidade" />
        <Pendencia ok={temComprovante} texto="Comprovante de endereço" />
        {cnh && (
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium ${COR_CNH[sitCnh.nivel]}`}>
            {sitCnh.texto}
          </span>
        )}
        {zap && (
          <a href={zap} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-700">
            <MessageCircle className="h-3.5 w-3.5" /> Pedir a CNH nova no WhatsApp
          </a>
        )}
      </div>

      <EnviarDocumento dono={dono} />

      {isLoading && <p className="text-sm text-slate-500">Carregando documentos...</p>}
      {error && <p className="text-sm text-rose-600">Não foi possível ler os documentos: {String((error as Error).message ?? error)}</p>}
      {!isLoading && vigentes.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          Nenhum documento anexado.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {vigentes.map((d) => (
          <CartaoDocumento key={d.id} doc={d} url={urls[d.url]} podeAuditar={podeAuditar} />
        ))}
      </ul>

      {antigos.length > 0 && (
        <div>
          <button type="button" onClick={() => setMostrarSubstituidos((v) => !v)}
                  className="text-xs text-slate-500 underline">
            {mostrarSubstituidos ? 'Esconder' : 'Ver'} {antigos.length} documento(s) substituído(s)
          </button>
          {mostrarSubstituidos && (
            <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {antigos.map((d) => <CartaoDocumento key={d.id} doc={d} url={urls[d.url]} podeAuditar={false} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Pendencia({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium ${
      ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {texto}{ok ? '' : ' pendente'}
    </span>
  );
}

function EnviarDocumento({ dono }: { dono: DonoDocumentos }) {
  const enviar = useEnviarDocumentoAssociado(dono);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<TipoDocumentoAssociado | ''>('');
  const [validade, setValidade] = useState('');
  const [numero, setNumero] = useState('');
  const [descricao, setDescricao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const dica = TIPOS_DOCUMENTO.find((t) => t.id === tipo)?.dica;

  async function salvar() {
    setErro(null); setOk(null);
    const regra = validarEnvioDocumento({ tipo, validade, descricao });
    if (regra) { setErro(regra); return; }
    if (!arquivo) { setErro('Escolha o arquivo (foto ou PDF).'); return; }
    try {
      await enviar.mutateAsync({ file: arquivo, tipo: tipo as TipoDocumentoAssociado, validade: validade || null, numero, descricao });
      setOk(`${rotuloTipoDocumento(tipo)} anexado.`);
      setTipo(''); setValidade(''); setNumero(''); setDescricao(''); setArquivo(null);
      if (arquivoRef.current) arquivoRef.current.value = '';
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-superficie p-4">
      <p className="mb-3 text-sm font-medium text-slate-800">Anexar documento</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumentoAssociado | '')}>
            <option value="">Escolha...</option>
            {TIPOS_DOCUMENTO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
          </Select>
        </FormField>
        {tipo === 'CNH' && (
          <FormField label="Vencimento da CNH *">
            <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </FormField>
        )}
        {(tipo === 'CNH' || tipo === 'RG' || tipo === 'CPF') && (
          <FormField label="Número (opcional)">
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
          </FormField>
        )}
        {tipo && tipo !== 'CNH' && (
          <FormField label={tipo === 'OUTRO' ? 'Descrição *' : 'Descrição (opcional)'}>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </FormField>
        )}
        <FormField label="Arquivo (foto ou PDF)">
          <input ref={arquivoRef} type="file" accept="image/*,application/pdf"
                 onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                 className="block w-full text-sm text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm" />
        </FormField>
      </div>
      {dica && <p className="mt-2 text-xs text-slate-500">{dica}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={salvar} disabled={enviar.isPending}>
          {enviar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
          Anexar
        </Button>
        {erro && <span className="text-sm text-rose-600">{erro}</span>}
        {ok && <span className="text-sm text-emerald-700">{ok}</span>}
      </div>
    </div>
  );
}

function CartaoDocumento({ doc, url, podeAuditar }: { doc: AssociadoDocumentosRow; url?: string; podeAuditar: boolean }) {
  const remover = useRemoverDocumentoAssociado();
  const conferir = useConferirDocumento();
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const ehImagem = (doc.mime ?? '').startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(doc.url);
  const sit = doc.tipo === 'CNH' ? situacaoCnh(doc.validade) : null;

  async function acao(fn: () => Promise<unknown>) {
    setErro(null);
    try { await fn(); } catch (e) { setErro((e as Error).message); }
  }

  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-superficie p-3">
      <div className="flex gap-3">
        <a href={url} target="_blank" rel="noreferrer"
           className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {url && ehImagem
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={url} alt={rotuloTipoDocumento(doc.tipo)} className="h-full w-full object-cover" />
            : <FileText className="h-8 w-8 text-slate-400" />}
        </a>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-slate-800">{rotuloTipoDocumento(doc.tipo)}</p>
          {doc.descricao && <p className="truncate text-xs text-slate-500">{doc.descricao}</p>}
          {doc.numero && <p className="text-xs text-slate-500">Nº {doc.numero}</p>}
          {sit && (
            <p className={`text-xs font-medium ${sit.nivel === 'vencida' ? 'text-rose-700' : sit.nivel === 'a_vencer' ? 'text-amber-700' : 'text-emerald-700'}`}>
              {sit.texto}
            </p>
          )}
          <p className="text-xs text-slate-400">Enviado em {formatDate(doc.created_at)}</p>
          <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[0.6875rem] font-medium ${COR_SITUACAO[doc.situacao]}`}>
            {ROTULO_SITUACAO_DOCUMENTO[doc.situacao]}
          </span>
          {doc.situacao === 'RECUSADO' && doc.motivo_recusa && (
            <p className="mt-1 text-xs text-rose-700">Motivo: {doc.motivo_recusa}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {podeAuditar && doc.situacao === 'AGUARDANDO' && !recusando && (
          <>
            <Button type="button" variant="secondary" disabled={conferir.isPending}
                    onClick={() => acao(() => conferir.mutateAsync({ id: doc.id, aprovar: true }))}>
              <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-600" /> Conferido
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRecusando(true)}>
              <XCircle className="mr-1 h-4 w-4 text-rose-600" /> Recusar
            </Button>
          </>
        )}
        {(doc.situacao !== 'CONFERIDO' || podeAuditar) && doc.situacao !== 'SUBSTITUIDO' && (
          <Button type="button" variant="ghost" disabled={remover.isPending}
                  onClick={() => { if (confirm('Remover este documento?')) acao(() => remover.mutateAsync(doc)); }}>
            <Trash2 className="mr-1 h-4 w-4" /> Remover
          </Button>
        )}
      </div>
      {recusando && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input placeholder="Motivo (ilegível, cortado, de outra pessoa...)" value={motivo}
                 onChange={(e) => setMotivo(e.target.value)} className="flex-1" />
          <Button type="button" variant="danger" disabled={conferir.isPending}
                  onClick={() => acao(async () => { await conferir.mutateAsync({ id: doc.id, aprovar: false, motivo }); setRecusando(false); })}>
            Recusar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRecusando(false)}>Voltar</Button>
        </div>
      )}
      {erro && <p className="mt-2 text-xs text-rose-600">{erro}</p>}
    </li>
  );
}

/**
 * Aviso da CNH do associado (evento, SAC): o sistema reconhece a CNH em arquivo
 * e diz se ela esta valida, a vencer ou vencida — com o pedido da nova.
 */
export function AvisoCnhAssociado({ clienteId, nome, celular, apenasProblema }: {
  clienteId: string | null | undefined;
  nome?: string | null;
  celular?: string | null;
  /** SAC: so aparece com a CNH vencida ou vencendo (a base migrada nao tem CNH). */
  apenasProblema?: boolean;
}) {
  const { data } = useDocumentacaoCliente(clienteId);
  if (!clienteId || !data) return null;
  const sit = situacaoCnh(data.cnh_validade);
  if (apenasProblema && sit.nivel !== 'vencida' && sit.nivel !== 'a_vencer') return null;
  const link = `/associados/${clienteId}?aba=anexos`;
  const zap = sit.nivel === 'vencida' ? linkWhatsApp(celular, mensagemPedirNovaCnh(nome, data.cnh_validade)) : null;
  const falta = [!data.tem_identidade && 'identidade', !data.tem_comprovante && 'comprovante de endereço']
    .filter(Boolean).join(' e ');
  const texto = sit.nivel === 'sem_cnh' ? 'O associado não tem CNH em arquivo.'
    : sit.nivel === 'vencida' ? `${sit.texto}. Solicite a CNH atualizada ao associado.`
    : `${sit.texto} (associado).`;

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${COR_CNH[sit.nivel]}`}>
      <FileText className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {texto}
        {falta && <span className="ml-1 text-slate-600">Falta na ficha: {falta}.</span>}
      </span>
      {zap && (
        <a href={zap} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">
          <MessageCircle className="h-3.5 w-3.5" /> Pedir no WhatsApp
        </a>
      )}
      <a href={link} className="text-xs font-medium underline">Anexos do associado</a>
    </div>
  );
}
