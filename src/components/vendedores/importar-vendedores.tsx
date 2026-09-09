'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Upload, Download, AlertTriangle, CheckCircle2, XCircle, Info, Loader2, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/field';
import { useRegionais, useVendedores, useImportarVendedores } from '@/hooks/use-config';
import { baixarCsv } from '@/components/financeiro/ui-financeiro';
import {
  interpretarPlanilhaVendedores,
  agruparRegionais,
  montarPrevia,
  chaveRegional,
  gerarModeloCsvVendedores,
  matrizDeCsv,
  type VendedorImportado,
  type GrupoRegional,
  type Previa,
  type RegionalAlvo,
} from '@/lib/vendedores-import';

/** Le .xlsx com o exceljs (import dinamico: nao pesa no bundle da pagina). */
async function matrizDeXlsx(arquivo: File): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('A planilha nao tem nenhuma aba.');

  const linhas: string[][] = [];
  ws.eachRow((row) => {
    const valores = (row.values as unknown[]).slice(1);
    const celulas: string[] = [];
    valores.forEach((v, i) => {
      celulas[i] =
        v == null ? '' :
        typeof v === 'object' && 'result' in (v as object) ? String((v as { result: unknown }).result ?? '') :
        typeof v === 'object' && 'text' in (v as object) ? String((v as { text: unknown }).text ?? '') :
        v instanceof Date ? v.toLocaleDateString('pt-BR') :
        String(v);
    });
    linhas.push(Array.from({ length: celulas.length }, (_, i) => celulas[i] ?? ''));
  });
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

export function ImportarVendedores({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const { data: regionaisRaw } = useRegionais();
  const { data: vendedores } = useVendedores();
  const importar = useImportarVendedores();

  const [lendo, setLendo] = useState(false);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<VendedorImportado[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [dePara, setDePara] = useState<Record<string, string | null>>({});
  const [respeitarStatus, setRespeitarStatus] = useState(false);
  const [verBloqueados, setVerBloqueados] = useState(false);

  /** As unidades com o TETO em percentual — a previa valida a regra do 0034. */
  const regionais: RegionalAlvo[] = useMemo(
    () => (regionaisRaw ?? []).map((r) => ({
      id: r.id,
      nome: r.nome,
      ativo: r.ativo,
      teto_adesao: Number(r.taxa_comissao_adesao ?? 0) * 100,
      teto_recorrente: Number(r.taxa_comissao_recorrente ?? 0) * 100,
    })),
    [regionaisRaw],
  );

  const grupos: GrupoRegional[] = useMemo(
    () => (linhas.length ? agruparRegionais(linhas, regionais) : []),
    [linhas, regionais],
  );

  const previa: Previa | null = useMemo(
    () => (linhas.length
      ? montarPrevia(linhas, dePara,
          (vendedores ?? []).map((v) => ({
            id: v.id, nome: v.nome ?? '', documento: v.documento, email: v.email,
          })),
          regionais)
      : null),
    [linhas, dePara, vendedores, regionais],
  );

  function limpar() {
    setArquivo(null); setLinhas([]); setErros([]); setAvisos([]);
    setDePara({}); setRespeitarStatus(false); setVerBloqueados(false);
  }

  async function receberArquivo(f: File | null | undefined) {
    if (!f) return;
    setLendo(true);
    try {
      const matriz = /\.csv$/i.test(f.name)
        ? matrizDeCsv(await f.text())
        : await matrizDeXlsx(f);
      const r = interpretarPlanilhaVendedores(matriz);
      setArquivo(f.name);
      setLinhas(r.linhas);
      setErros(r.erros);
      setAvisos(r.avisos);
      // O de-para ja nasce com o que casou sozinho pelo nome.
      const inicial: Record<string, string | null> = {};
      agruparRegionais(r.linhas, regionais).forEach((g) => {
        inicial[chaveRegional(g.texto)] = g.regional_id;
      });
      setDePara(inicial);
    } catch (e) {
      toast.error(`Nao consegui ler a planilha: ${(e as Error).message}`);
      limpar();
    } finally {
      setLendo(false);
    }
  }

  function confirmar() {
    if (!previa) return;
    const entram = previa.linhas.filter((l) => l.situacao !== 'BLOQUEADO');
    if (!entram.length) return toast.error('Nenhuma linha esta pronta para entrar.');

    importar.mutate(
      {
        respeitarStatus,
        linhas: entram.map((l) => ({
          nome: l.nome,
          documento: l.documento,
          email: l.email,
          telefone: l.telefone,
          regional_id: l.regional_id,
          ativo_na_origem: l.ativo_na_origem,
          codigo: l.codigo,
          comissao_adesao_pct: l.comissao_adesao,
          comissao_recorrente_pct: l.comissao_recorrente,
          banco: l.banco,
          agencia: l.agencia,
          conta: l.conta,
          chave_pix: l.chave_pix,
          observacoes: [
            'Importado por planilha',
            l.cadastro_origem ? `cadastro na origem: ${l.cadastro_origem}` : null,
          ].filter(Boolean).join(' · '),
        })),
      },
      {
        onSuccess: (r) => {
          toast.success(`${r.criados} cadastrado(s) e ${r.atualizados} atualizado(s).`);
          limpar();
          onClose();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  const pendentes = grupos.filter((g) => !dePara[chaveRegional(g.texto)]);
  const podeConfirmar = !!previa && previa.bloqueados < previa.linhas.length && !erros.length;

  return (
    <Modal
      open={aberto}
      onClose={() => { limpar(); onClose(); }}
      tamanho="xl"
      title="Importar equipe de vendas por planilha"
      subtitulo="Confira a prévia antes de gravar — nada entra sem passar por ela."
    >
      <div className="space-y-4">
        {/* ---------------------------------------------------- 1. arquivo */}
        <div className="rounded-xl border border-dashed border-slate-300 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-700">
                {arquivo ? `Arquivo: ${arquivo}` : '1. Escolha a planilha'}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                .xlsx ou .csv · a ordem das colunas não importa e o nome casa sem acento.
                Obrigatórias: <b>NOME</b> e <b>REGIONAL</b>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  baixarCsv('modelo-vendedores.csv',
                    gerarModeloCsvVendedores(regionaisRaw ?? []).split('\r\n').map((l) => l.split(';')))
                }
              >
                <Download className="h-4 w-4" /> Baixar modelo
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-acao px-3 py-2 text-sm font-medium text-white hover:bg-acao-escura">
                {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={(e) => { void receberArquivo(e.target.files?.[0]); e.target.value = ''; }}
                />
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
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{avisos.join(' ')}</span>
          </p>
        )}

        {/* ------------------------------------------------- 2. de-para */}
        {grupos.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">2. A que unidade cada grupo pertence</p>
            <p className="mb-2.5 mt-0.5 text-[11px] leading-relaxed text-slate-500">
              São <b>{grupos.length}</b> nomes distintos em {linhas.length} linhas — {grupos.length} decisões,
              não {linhas.length}. As cidades de cada grupo aparecem ao lado porque grupo espalhado por
              muitas cidades costuma não ser uma unidade. <b>Nome sem unidade escolhida não entra</b> —
              aqui unidade em branco significaria MATRIZ.
            </p>
            <div className="space-y-1.5">
              {grupos.map((g) => {
                const k = chaveRegional(g.texto);
                const escolhido = dePara[k] ?? '';
                return (
                  <div key={k} className={`grid grid-cols-1 items-center gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_240px] ${
                    escolhido ? 'border-slate-200' : 'border-amber-300 bg-amber-50/60'
                  }`}>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-slate-800">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {g.texto}
                        <span className="tnum shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {g.quantidade}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {g.cidades.length} cidade(s): {g.cidades.slice(0, 4).join(' · ')}
                        {g.cidades.length > 4 && ` … +${g.cidades.length - 4}`}
                      </p>
                    </div>
                    <Select
                      value={escolhido}
                      onChange={(e) => setDePara((p) => ({ ...p, [k]: e.target.value || null }))}
                    >
                      <option value="">— escolha a unidade —</option>
                      {(regionaisRaw ?? []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nome}{r.ativo === false ? ' (inativa)' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                );
              })}
            </div>
            {pendentes.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {pendentes.reduce((a, g) => a + g.quantidade, 0)} linha(s) ficam de fora
                enquanto {pendentes.length} nome(s) não tiverem unidade.
              </p>
            )}
          </div>
        )}

        {/* ---------------------------------------------------- 3. prévia */}
        {previa && (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">3. O que vai acontecer</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Cartao rotulo="Entram novos" valor={previa.novos} tom="verde" />
              <Cartao rotulo="Atualizam" valor={previa.atualiza} tom="azul" />
              <Cartao rotulo="Ficam de fora" valor={previa.bloqueados} tom="vermelho" />
              <Cartao rotulo="Ativos na origem" valor={previa.ativosNaOrigem} tom="cinza" />
            </div>

            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <label className="flex items-start gap-2 text-[13px] text-slate-700">
                <input
                  type="checkbox"
                  checked={respeitarStatus}
                  onChange={(e) => setRespeitarStatus(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  Respeitar a coluna <b>Status</b> da planilha
                  <span className="block text-[11px] leading-relaxed text-slate-500">
                    Desmarcado (recomendado), <b>todos entram inativos</b> e você ativa quem vende de
                    fato. Marcado, <b>{previa.ativosNaOrigem}</b> entram ativos — com hotlink captando
                    lead e comissão a conferir, um por um.
                  </span>
                </span>
              </label>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              A comissão entra <b>zerada</b> quando a planilha não traz — zero não paga ninguém por
              engano. Nenhum <b>acesso ao portal</b> é criado.
            </p>

            {previa.bloqueados > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setVerBloqueados((v) => !v)}
                  className="text-[12px] font-medium text-rose-700 underline underline-offset-2"
                >
                  {verBloqueados ? 'Esconder' : 'Ver'} as {previa.bloqueados} linhas que ficam de fora
                </button>
                {verBloqueados && (
                  <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                    <table className="w-full text-[12px]">
                      <tbody>
                        {previa.linhas.filter((l) => l.situacao === 'BLOQUEADO').map((l) => (
                          <tr key={l.linha} className="border-b border-slate-50 last:border-0">
                            <td className="w-14 px-2 py-1 text-slate-400">L{l.linha}</td>
                            <td className="px-2 py-1 font-medium text-slate-700">{l.nome}</td>
                            <td className="px-2 py-1 text-rose-700">{l.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={() => { limpar(); onClose(); }}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={!podeConfirmar || importar.isPending}>
            {importar.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
              : <><CheckCircle2 className="h-4 w-4" /> Importar {previa ? previa.novos + previa.atualiza : 0}</>}
          </Button>
        </div>
      </div>
    </Modal>
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
