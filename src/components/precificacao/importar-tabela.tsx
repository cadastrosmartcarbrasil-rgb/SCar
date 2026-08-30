'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowRight, Check, Download, FileSpreadsheet, Info, Loader2, UploadCloud, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import {
  useAdesoes, useParticipacoes, useProdutos, useSalvarTabela, useTabelaPrecos, useTiposVeiculo,
} from '@/hooks/use-precificacao';
import {
  compararTabelas, gerarModeloCsv, interpretarPlanilha, matrizDeCsv,
  type BandaImportada, type ProdutoColuna, type ResultadoImportacao,
} from '@/lib/precificacao-import';
import { formatCurrency } from '@/lib/utils';
import { baixarCsv } from '@/components/financeiro/ui-financeiro';

/** Le .xlsx com o exceljs (import dinamico: nao pesa no bundle da pagina). */
async function matrizDeXlsx(arquivo: File): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('A planilha nao tem nenhuma aba.');

  const linhas: string[][] = [];
  ws.eachRow((row) => {
    const celulas: string[] = [];
    // row.values e 1-indexado; o indice 0 vem vazio.
    const valores = (row.values as unknown[]).slice(1);
    valores.forEach((v, i) => {
      celulas[i] =
        v == null ? '' :
        typeof v === 'object' && 'result' in (v as object) ? String((v as { result: unknown }).result ?? '') :
        typeof v === 'object' && 'text' in (v as object) ? String((v as { text: unknown }).text ?? '') :
        String(v);
    });
    linhas.push(Array.from({ length: celulas.length }, (_, i) => celulas[i] ?? ''));
  });
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

/**
 * Importacao da matriz de precos por planilha, UMA POR TIPO DE VEICULO.
 * O RPC `substituir_tabela_precos` troca a tabela inteira do tipo, entao a tela
 * so grava depois de mostrar a previa do que entra, sai e muda.
 */
export function ImportarTabela() {
  const { data: tipos } = useTiposVeiculo();
  const { data: produtos } = useProdutos();
  const [tipoId, setTipoId] = useState('');

  const { data: tabela } = useTabelaPrecos(tipoId || undefined);
  const { data: participacoes } = useParticipacoes(tipoId || undefined);
  const { data: adesoes } = useAdesoes(tipoId || undefined);
  const salvar = useSalvarTabela();

  const [lendo, setLendo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [arquivo, setArquivo] = useState<string>('');

  // Mesma regra do editor: so os obrigatorios que variam por faixa viram coluna.
  const colunasProduto: ProdutoColuna[] = useMemo(
    () => (produtos ?? [])
      .filter((p) => p.metodo_preco === 'FAIXA_FIPE' && p.status && p.obrigatorio)
      .map((p) => ({ id: p.id, nome: p.nome })),
    [produtos],
  );

  // Tabela em vigor, no mesmo formato do arquivo — base da comparacao.
  const bandasAtuais: BandaImportada[] = useMemo(() => {
    const chaves = new Map<string, { min: number; max: number }>();
    const registra = (min: number, max: number) => chaves.set(`${min}_${max}`, { min, max });
    (participacoes ?? []).forEach((p) => registra(Number(p.fipe_minimo), Number(p.fipe_maximo)));
    (adesoes ?? []).forEach((a) => registra(Number(a.fipe_minimo), Number(a.fipe_maximo)));
    (tabela ?? []).forEach((t) => registra(Number(t.fipe_minimo), Number(t.fipe_maximo)));

    return [...chaves.values()]
      .sort((a, b) => a.min - b.min)
      .map(({ min, max }) => {
        const valores: Record<string, number> = {};
        (tabela ?? [])
          .filter((t) => Number(t.fipe_minimo) === min && Number(t.fipe_maximo) === max)
          .forEach((t) => { valores[t.produto_id] = Number(t.valor_mensal); });
        const part = (participacoes ?? []).find((p) => Number(p.fipe_minimo) === min && Number(p.fipe_maximo) === max);
        const ades = (adesoes ?? []).find((a) => Number(a.fipe_minimo) === min && Number(a.fipe_maximo) === max);
        const tipoPart = (part?.tipo_valor ?? 'VALOR') as 'VALOR' | 'PERCENTUAL';
        return {
          fipe_minimo: min,
          fipe_maximo: max,
          participacao_tipo: tipoPart,
          participacao_valor: tipoPart === 'PERCENTUAL' ? Number(part?.valor ?? 0) * 100 : Number(part?.valor ?? 0),
          adesao: Number(ades?.valor ?? 0),
          valores,
        };
      });
  }, [tabela, participacoes, adesoes]);

  const diff = useMemo(
    () => (resultado ? compararTabelas(bandasAtuais, resultado.bandas, colunasProduto) : null),
    [resultado, bandasAtuais, colunasProduto],
  );

  const onDrop = useCallback(
    async (aceitos: File[]) => {
      const file = aceitos[0];
      if (!file) return;
      if (!tipoId) return toast.error('Escolha o tipo de veiculo antes de subir a planilha');

      setLendo(true);
      try {
        const matriz = /\.xlsx$/i.test(file.name)
          ? await matrizDeXlsx(file)
          : matrizDeCsv(await file.text());
        setResultado(interpretarPlanilha(matriz, colunasProduto));
        setArquivo(file.name);
      } catch (err) {
        toast.error(`Nao consegui ler o arquivo: ${(err as Error).message}`);
      } finally {
        setLendo(false);
      }
    },
    [tipoId, colunasProduto],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  });

  function baixarModelo() {
    if (!tipoId) return toast.error('Escolha o tipo de veiculo');
    const nome = (tipos ?? []).find((t) => t.id === tipoId)?.nome ?? 'tabela';
    const csv = gerarModeloCsv(colunasProduto, bandasAtuais);
    baixarCsv(`precos-${nome.toLowerCase().replace(/\s+/g, '-')}.csv`, csv.split('\r\n').map((l) => l.split(';')));
  }

  function confirmar() {
    if (!resultado || resultado.erros.length > 0) return;
    const faixas = resultado.bandas.flatMap((b) =>
      colunasProduto.map((p) => ({
        produto_id: p.id,
        fipe_minimo: b.fipe_minimo,
        fipe_maximo: b.fipe_maximo,
        valor_mensal: b.valores[p.id] ?? 0,
        tipo_valor: 'VALOR',
      })),
    );
    salvar.mutate(
      {
        tipoVeiculoId: tipoId,
        faixas,
        participacoes: resultado.bandas.map((b) => ({
          fipe_minimo: b.fipe_minimo,
          fipe_maximo: b.fipe_maximo,
          tipo_valor: b.participacao_tipo,
          valor: b.participacao_tipo === 'PERCENTUAL' ? b.participacao_valor / 100 : b.participacao_valor,
        })),
        adesoes: resultado.bandas.map((b) => ({
          fipe_minimo: b.fipe_minimo, fipe_maximo: b.fipe_maximo, valor: b.adesao,
        })),
      },
      {
        onSuccess: () => {
          toast.success(`Tabela do tipo importada — ${resultado.bandas.length} faixas gravadas`);
          setResultado(null);
          setArquivo('');
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const bloqueado = !resultado || resultado.erros.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Importar tabela por planilha</CardTitle>
          <p className="text-xs leading-relaxed text-slate-500">
            Uma planilha por <b>tipo de veiculo</b> — que ja e como o banco guarda os precos.
            A importacao <b>substitui</b> a tabela inteira daquele tipo (faixas, participacao e
            adesao); os demais tipos nao sao tocados. Voce ve a previa do que muda antes de gravar.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-64">
              <label className="text-xs text-slate-500">Tipo de veiculo *</label>
              <Select value={tipoId} onChange={(e) => { setTipoId(e.target.value); setResultado(null); }}>
                <option value="">-- Selecione --</option>
                {(tipos ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </Select>
            </div>
            <Button variant="secondary" onClick={baixarModelo} disabled={!tipoId}>
              <Download className="h-4 w-4" /> Baixar modelo
            </Button>
          </div>

          {tipoId && (
            <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />
              O modelo ja vem preenchido com a tabela em vigor deste tipo ({bandasAtuais.length} faixa(s)).
              Colunas: <b>FIPE_MINIMO</b>, <b>FIPE_MAXIMO</b>, <b>PARTICIPACAO</b>, <b>PARTICIPACAO_TIPO</b>{' '}
              (VALOR ou PERCENTUAL), <b>ADESAO</b> e uma coluna por produto obrigatorio
              {colunasProduto.length > 0 && <> ({colunasProduto.map((p) => p.nome).join(', ')})</>}.
            </p>
          )}

          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              !tipoId ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
              : isDragActive ? 'border-cyan-500 bg-cyan-50/60' : 'border-slate-300 bg-slate-50/60 hover:border-cyan-400'
            }`}
          >
            <input {...getInputProps()} disabled={!tipoId} />
            {lendo ? (
              <><Loader2 className="h-5 w-5 animate-spin text-cyan-600" /><p className="text-xs font-medium text-slate-600">Lendo a planilha...</p></>
            ) : (
              <>
                <UploadCloud className="h-5 w-5 text-slate-400" />
                <p className="text-xs font-medium text-slate-600">
                  {tipoId ? <>Arraste a planilha ou <span className="text-cyan-700 underline">selecione do computador</span></> : 'Escolha o tipo de veiculo para liberar o envio'}
                </p>
                <p className="text-[11px] text-slate-400">.xlsx ou .csv · valores em formato brasileiro (1.234,56)</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Previa · {arquivo}</CardTitle>
            <button
              onClick={() => { setResultado(null); setArquivo(''); }}
              className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100"
              title="Descartar"
              aria-label="Descartar importacao"
            >
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            {resultado.erros.length > 0 && (
              <Alerta tom="erro" titulo="A planilha nao pode ser importada" itens={resultado.erros} />
            )}
            {resultado.avisos.length > 0 && (
              <Alerta tom="aviso" titulo="Confira antes de gravar" itens={resultado.avisos} />
            )}

            {diff && resultado.erros.length === 0 && (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Contador rotulo="Faixas na planilha" valor={resultado.bandas.length} />
                  <Contador rotulo="Novas" valor={diff.adicionadas.length} tom="verde" />
                  <Contador rotulo="Alteradas" valor={diff.alteradas.length} tom="ambar" />
                  <Contador rotulo="Que serao removidas" valor={diff.removidas.length} tom="vermelho" />
                </div>

                {diff.removidas.length > 0 && (
                  <Alerta
                    tom="aviso"
                    titulo={`${diff.removidas.length} faixa(s) em vigor nao estao na planilha e serao apagadas`}
                    itens={diff.removidas.map((b) => `FIPE ${formatCurrency(b.fipe_minimo)} a ${formatCurrency(b.fipe_maximo)}`)}
                  />
                )}

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[720px] text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-2">Faixa FIPE</th>
                        <th className="px-3 py-2 text-right">Participacao</th>
                        <th className="px-3 py-2 text-right">Adesao</th>
                        {colunasProduto.map((p) => <th key={p.id} className="px-3 py-2 text-right">{p.nome}</th>)}
                        <th className="px-3 py-2">Situacao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.bandas.map((b) => {
                        const nova = diff.adicionadas.some((x) => x.fipe_minimo === b.fipe_minimo && x.fipe_maximo === b.fipe_maximo);
                        const alt = diff.alteradas.find((x) => x.depois.fipe_minimo === b.fipe_minimo && x.depois.fipe_maximo === b.fipe_maximo);
                        return (
                          <tr key={`${b.fipe_minimo}_${b.fipe_maximo}`} className="border-b border-slate-50 last:border-0">
                            <td className="tnum px-3 py-1.5 text-slate-700">
                              {formatCurrency(b.fipe_minimo)} — {formatCurrency(b.fipe_maximo)}
                            </td>
                            <td className="tnum px-3 py-1.5 text-right text-slate-600">
                              {b.participacao_tipo === 'PERCENTUAL' ? `${b.participacao_valor}%` : formatCurrency(b.participacao_valor)}
                            </td>
                            <td className="tnum px-3 py-1.5 text-right text-slate-600">{formatCurrency(b.adesao)}</td>
                            {colunasProduto.map((p) => {
                              const antes = alt?.antes.valores[p.id];
                              const depois = b.valores[p.id] ?? 0;
                              const mudou = alt && antes !== undefined && antes !== depois;
                              return (
                                <td key={p.id} className="tnum px-3 py-1.5 text-right">
                                  {mudou && <span className="mr-1 text-[10px] text-slate-400 line-through">{formatCurrency(antes)}</span>}
                                  <span className={mudou ? 'font-semibold text-amber-700' : 'text-slate-700'}>{formatCurrency(depois)}</span>
                                </td>
                              );
                            })}
                            <td className="px-3 py-1.5">
                              {nova ? <Selo tom="verde">Nova</Selo> : alt ? <Selo tom="ambar">Alterada</Selo> : <Selo tom="cinza">Sem mudanca</Selo>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <p className="text-[11.5px] text-slate-500">
                Gravar substitui a tabela inteira de{' '}
                <b>{(tipos ?? []).find((t) => t.id === tipoId)?.nome}</b>. Os outros tipos nao mudam.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setResultado(null); setArquivo(''); }}>Descartar</Button>
                <Button onClick={confirmar} disabled={bloqueado || salvar.isPending}>
                  {salvar.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Gravando...</> : <><Check className="h-4 w-4" /> Confirmar importacao</>}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!resultado && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Para atualizar muitos precos de uma vez: baixe o modelo do tipo, edite no Excel e suba de volta.
          <ArrowRight className="h-3 w-3" /> nada e gravado sem a sua confirmacao.
        </p>
      )}
    </div>
  );
}

function Alerta({ tom, titulo, itens }: { tom: 'erro' | 'aviso'; titulo: string; itens: string[] }) {
  const cor = tom === 'erro'
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cor}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" /> {titulo}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11.5px] leading-relaxed">
        {itens.slice(0, 12).map((i) => <li key={i}>{i}</li>)}
        {itens.length > 12 && <li>... e mais {itens.length - 12}.</li>}
      </ul>
    </div>
  );
}

function Contador({ rotulo, valor, tom = 'cinza' }: { rotulo: string; valor: number; tom?: 'cinza' | 'verde' | 'ambar' | 'vermelho' }) {
  const cor = { cinza: 'text-slate-800', verde: 'text-emerald-700', ambar: 'text-amber-700', vermelho: 'text-rose-700' }[tom];
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`tnum mt-0.5 text-xl font-bold ${cor}`}>{valor}</p>
    </div>
  );
}

function Selo({ tom, children }: { tom: 'verde' | 'ambar' | 'cinza'; children: React.ReactNode }) {
  const cor = {
    verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ambar: 'bg-amber-50 text-amber-700 ring-amber-200',
    cinza: 'bg-slate-100 text-slate-500 ring-slate-200',
  }[tom];
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${cor}`}>{children}</span>;
}
