'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Download, CheckCircle2, XCircle, Info, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useFornecedores, useImportarFornecedores, type ResultadoImportacaoFornecedores } from '@/hooks/use-fornecedores';
import {
  interpretarPlanilhaFornecedores,
  montarPreviaFornecedores,
  registroNovoFornecedor,
  matrizDeCsv,
  type FornecedorImportado,
  type LinhaPreviaFornecedor,
  type SituacaoFornecedor,
} from '@/lib/fornecedores-import';
import { matrizDeXlsx, modeloFornecedoresXlsx } from '@/lib/planilha-xlsx';
import { formatarDocumento } from '@/lib/documento';

/** Nome amigavel dos campos que a previa diz que serao completados. */
const ROTULO_CAMPO: Record<string, string> = {
  documento: 'CNPJ/CPF', nome_fantasia: 'fantasia', contato: 'contato', telefone: 'telefone',
  whatsapp: 'WhatsApp', email: 'e-mail', chave_pix: 'PIX', cobertura: 'cobertura',
  plataforma_url: 'plataforma', observacoes: 'observações', custo_mensal_equipamento: 'custo',
  prestador_assistencia: 'marca 24h', empresa_rastreamento: 'marca rastreadora', endereco: 'endereço',
};

export async function baixarModeloFornecedores() {
  const ExcelJS = (await import('exceljs')).default;
  const buffer = await modeloFornecedoresXlsx(ExcelJS);
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-importacao-fornecedores.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

const ABAS: { id: SituacaoFornecedor; rotulo: string }[] = [
  { id: 'NOVO', rotulo: 'Novos' },
  { id: 'JA_CADASTRADO', rotulo: 'Já cadastrados' },
  { id: 'BLOQUEADO', rotulo: 'Ficam de fora' },
];

export function ImportarFornecedores({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { data: existentes } = useFornecedores('todos');
  const importar = useImportarFornecedores();

  const [lendo, setLendo] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<FornecedorImportado[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [completar, setCompletar] = useState(true);
  const [aba, setAba] = useState<SituacaoFornecedor>('NOVO');
  const [resultado, setResultado] = useState<ResultadoImportacaoFornecedores | null>(null);

  const previa = useMemo(
    () => (linhas.length
      ? montarPreviaFornecedores(linhas, (existentes ?? []) as unknown as Parameters<typeof montarPreviaFornecedores>[1])
      : null),
    [linhas, existentes],
  );

  function limpar() {
    setArquivo(null); setLinhas([]); setErros([]); setAvisos([]);
    setCompletar(true); setAba('NOVO'); setResultado(null);
  }
  function fechar() { limpar(); onClose(); }

  async function receberArquivo(f: File | null | undefined) {
    if (!f) return;
    setLendo(true);
    setResultado(null);
    try {
      const matriz = /\.csv$/i.test(f.name)
        ? matrizDeCsv(await f.text())
        : await matrizDeXlsx((await import('exceljs')).default, await f.arrayBuffer());
      const r = interpretarPlanilhaFornecedores(matriz);
      setArquivo(f.name);
      setLinhas(r.linhas);
      setErros(r.erros);
      setAvisos(r.avisos);
      setAba('NOVO');
    } catch (e) {
      toast.error(`Não consegui ler a planilha: ${(e as Error).message}`);
      limpar();
    } finally {
      setLendo(false);
    }
  }

  async function modelo() {
    setBaixando(true);
    try { await baixarModeloFornecedores(); }
    catch (e) { toast.error(`Não consegui gerar o modelo: ${(e as Error).message}`); }
    finally { setBaixando(false); }
  }

  const aCompletar = (previa?.linhas ?? []).filter(
    (l) => l.situacao === 'JA_CADASTRADO' && l.existente && Object.keys(l.completa ?? {}).length > 0,
  );
  const total = (previa?.novos ?? 0) + (completar ? aCompletar.length : 0);
  const podeConfirmar = !!previa && total > 0 && !erros.length;

  function confirmar() {
    if (!previa) return;
    importar.mutate(
      {
        novos: previa.linhas.filter((l) => l.situacao === 'NOVO').map((l) => ({
          linha: l.linha, nome: l.razao_social, registro: registroNovoFornecedor(l),
        })),
        completar: completar
          ? aCompletar.map((l) => ({ linha: l.linha, nome: l.razao_social, id: l.existente!.id, campos: l.completa! }))
          : [],
      },
      {
        onSuccess: (r) => {
          setResultado(r);
          if (!r.falhas.length) toast.success(`${r.criados} cadastrado(s) e ${r.completados} completado(s).`);
          else toast.warning(`${r.criados} cadastrado(s), ${r.completados} completado(s) e ${r.falhas.length} recusado(s).`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const daAba = (previa?.linhas ?? []).filter((l) => l.situacao === aba);

  return (
    <Modal open={aberto} onClose={fechar} tamanho="xl" title="Importar fornecedores por planilha"
      subtitulo="Quem já está cadastrado não é duplicado — confira a prévia antes de gravar.">
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-slate-300 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-700">{arquivo ? `Arquivo: ${arquivo}` : '1. Escolha a planilha'}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                .xlsx ou .csv · só a <b>RAZAO SOCIAL</b> é obrigatória · o <b>CNPJ/CPF</b> é o que evita duplicar
                (sem ele, o sistema compara pelo nome).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={modelo} disabled={baixando}>
                {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar modelo
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-acao px-3 py-2 text-sm font-medium text-white hover:bg-acao-escura">
                {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
                <input type="file" accept=".xlsx,.csv" className="hidden"
                  onChange={(e) => { void receberArquivo(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
          </div>
        </div>

        {erros.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-800">
              <XCircle className="h-4 w-4" /> A planilha não pode ser importada
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-rose-700">
              {erros.slice(0, 12).map((e, i) => <li key={i}>· {e}</li>)}
              {erros.length > 12 && <li>· … e mais {erros.length - 12}.</li>}
            </ul>
          </div>
        )}

        {avisos.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span>{avisos.join(' ')}</span>
          </p>
        )}

        {previa && (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">2. O que vai acontecer</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Cartao rotulo="Entram novos" valor={previa.novos} tom="verde" />
              <Cartao rotulo="Já cadastrados" valor={previa.jaCadastrados} tom="azul" />
              <Cartao rotulo="Com campo vazio a completar" valor={previa.comComplemento} tom="cinza" />
              <Cartao rotulo="Ficam de fora" valor={previa.bloqueados} tom="vermelho" />
            </div>

            <label className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-[13px] text-slate-700">
              <input type="checkbox" checked={completar} onChange={(e) => setCompletar(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span>
                Completar os <b>campos vazios</b> dos já cadastrados
                <span className="block text-[11px] leading-relaxed text-slate-500">
                  Nada do cadastro existente é apagado ou trocado: só o que está em branco recebe o valor da
                  planilha, e as marcas (24h, rastreadora) só são acrescentadas. Desmarcado, os já cadastrados
                  ficam como estão.
                </span>
              </span>
            </label>

            <div className="mt-3 flex flex-wrap gap-1 border-b border-slate-200">
              {ABAS.map((a) => {
                const n = previa.linhas.filter((l) => l.situacao === a.id).length;
                return (
                  <button key={a.id} type="button" onClick={() => setAba(a.id)}
                    className={`border-b-2 px-3 py-1.5 text-[13px] ${aba === a.id ? 'border-brand-600 font-medium text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                    {a.rotulo} <span className="tnum text-slate-400">({n})</span>
                  </button>
                );
              })}
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-[12px]">
                <tbody>
                  {daAba.length === 0 && (
                    <tr><td className="px-2 py-4 text-center text-slate-400">Nenhuma linha.</td></tr>
                  )}
                  {daAba.map((l) => <LinhaPrevia key={l.linha} l={l} completar={completar} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {resultado && (
          <div className={`rounded-lg border p-3 text-sm ${resultado.falhas.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <p className="font-medium text-slate-800">
              {resultado.criados} cadastrado(s) · {resultado.completados} completado(s)
              {resultado.falhas.length > 0 && ` · ${resultado.falhas.length} recusado(s)`}
            </p>
            {resultado.falhas.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                {resultado.falhas.map((f) => <li key={f.linha}>· Linha {f.linha} ({f.nome}): {f.erro}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={fechar}>{resultado ? 'Fechar' : 'Cancelar'}</Button>
          {!resultado && (
            <Button type="button" onClick={confirmar} disabled={!podeConfirmar || importar.isPending}>
              {importar.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
                : <><CheckCircle2 className="h-4 w-4" /> Gravar {total}</>}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function LinhaPrevia({ l, completar }: { l: LinhaPreviaFornecedor; completar: boolean }) {
  const campos = Object.keys(l.completa ?? {}).filter((k) => k !== 'tipo_pessoa').map((k) => ROTULO_CAMPO[k] ?? k);
  return (
    <tr className="border-b border-slate-50 align-top last:border-0">
      <td className="w-12 px-2 py-1.5 text-slate-400">L{l.linha}</td>
      <td className="px-2 py-1.5">
        <p className="font-medium text-slate-800">{l.nome_fantasia || l.razao_social}</p>
        {l.nome_fantasia && <p className="text-[11px] text-slate-500">{l.razao_social}</p>}
        {l.avisos.length > 0 && (
          <p className="mt-0.5 flex items-start gap-1 text-[11px] text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{l.avisos.join(' · ')}
          </p>
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-slate-600">
        {l.documento ? formatarDocumento(l.documento, l.tipo_pessoa) : '—'}
      </td>
      <td className="px-2 py-1.5 text-[11px]">
        {l.situacao === 'BLOQUEADO' && <span className="text-rose-700">{l.motivo}</span>}
        {l.situacao === 'NOVO' && (
          <span className="text-emerald-700">
            Novo{l.prestador_assistencia ? ' · 24h' : ''}{l.empresa_rastreamento ? ' · rastreadora' : ''}{!l.ativo ? ' · inativo' : ''}
          </span>
        )}
        {l.situacao === 'JA_CADASTRADO' && l.existente && (
          <span className="text-slate-600">
            Já cadastrado como <b>{l.existente.nome_fantasia || l.existente.razao_social}</b>
            {l.casouPor === 'NOME' ? ' (pelo nome)' : ' (pelo CNPJ/CPF)'}
            <span className="block text-slate-500">
              {campos.length === 0 ? 'nada a completar' : completar ? `completa: ${campos.join(', ')}` : `não mexe (vazios: ${campos.join(', ')})`}
            </span>
          </span>
        )}
      </td>
    </tr>
  );
}

const TONS = {
  verde: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  azul: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  vermelho: 'border-rose-200 bg-rose-50 text-rose-800',
  cinza: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

function Cartao({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: keyof typeof TONS }) {
  return (
    <div className={`rounded-lg border p-2 text-center ${TONS[tom]}`}>
      <p className="tnum text-xl font-bold leading-none">{valor}</p>
      <p className="mt-1 text-[11px] font-medium">{rotulo}</p>
    </div>
  );
}
