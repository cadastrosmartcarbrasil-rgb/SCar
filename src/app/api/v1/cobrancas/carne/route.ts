import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gerarPdf, logoComoDataUrl } from '@/lib/termos-server';
import { seuNumeroDoTitulo } from '@/lib/pagamentos/sicredi';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { htmlDoCarne, placasDoBoleto, referenciaDoVencimento, referenteDoBoleto, type FichaCarne, type TipoCobrancaCarne } from '@/lib/carne-impressao';

// CARNE IMPRESSO (31/10/2026): os boletos do SCar escolhidos, 3 por folha A4,
// no padrao dos carnes da Smart Car (canhoto + ficha + codigo de barras + PIX).
//   GET ?ids=<titulo>,<titulo>,...   -> PDF
// Quem pode: quem tem o associado no escopo da cobranca (cobranca_pode_cliente),
// como o PDF da 2a via. So boleto ja registrado no banco (com linha digitavel).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX = 24;
const UUID = /^[0-9a-f-]{36}$/i;

type Endereco = { logradouro?: string; numero?: string; complemento?: string; bairro?: string; cep?: string; cidade?: string; uf?: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = Array.from(new Set((url.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)));
  if (ids.length === 0 || ids.length > MAX || !ids.every((i) => UUID.test(i))) {
    return NextResponse.json({ error: `Informe de 1 a ${MAX} boletos.` }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const admin = createAdminClient();
  const { data: titulos } = await admin.from('titulos_financeiros')
    .select('id, cliente_id, veiculo_id, valor, data_vencimento, linha_digitavel, nosso_numero, pix_copia_cola, status, created_at, adesao_lead_id, tipo_avulso_id, renegociacao_id')
    .in('id', ids);
  if (!titulos || titulos.length !== ids.length) return NextResponse.json({ error: 'Boleto não encontrado' }, { status: 404 });
  const clientes = Array.from(new Set(titulos.map((t) => t.cliente_id)));
  if (clientes.length !== 1) return NextResponse.json({ error: 'Boletos de associados diferentes' }, { status: 400 });
  const { data: pode } = await supabase.rpc('cobranca_pode_cliente', { p_cliente_id: clientes[0] });
  if (!pode) return NextResponse.json({ error: 'Fora do seu escopo de cobrança' }, { status: 403 });

  const imprimiveis = titulos.filter((t) => t.linha_digitavel && t.status !== 'cancelado' && t.status !== 'pago');
  if (imprimiveis.length === 0) {
    return NextResponse.json({ error: 'Nenhum destes boletos está registrado no banco e em aberto.' }, { status: 400 });
  }

  const { data: faturas } = await admin.from('faturas').select('id, titulo_id, competencia')
    .in('titulo_id', imprimiveis.map((t) => t.id));
  // Fatura AGRUPADA: o titulo nao tem veiculo; as placas saem dos itens da fatura.
  const { data: itens } = (faturas ?? []).length
    ? await admin.from('fatura_itens').select('fatura_id, veiculo_id').in('fatura_id', (faturas ?? []).map((f) => f.id))
    : { data: [] as { fatura_id: string; veiculo_id: string | null }[] };
  const veiculoIds = Array.from(new Set([
    ...imprimiveis.map((t) => t.veiculo_id),
    ...(itens ?? []).map((i) => i.veiculo_id),
  ].filter((v): v is string => !!v)));
  const [{ data: cliente }, { data: empresa }, { data: veiculos }] = await Promise.all([
    admin.from('clientes').select('nome_razao_social, cpf_cnpj, endereco').eq('id', clientes[0]).maybeSingle(),
    admin.from('empresa').select('razao_social, nome_fantasia, cnpj, logo_url, whatsapp_principal, telefone_fixo').limit(1).maybeSingle(),
    veiculoIds.length
      ? admin.from('veiculos').select('id, placa, chassi').in('id', veiculoIds)
      : Promise.resolve({ data: [] as { id: string; placa: string | null; chassi: string | null }[] }),
  ]);
  if (!cliente) return NextResponse.json({ error: 'Associado não encontrado' }, { status: 404 });

  const porId = new Map((veiculos ?? []).map((v) => [v.id, v]));
  const faturaDoTitulo = new Map((faturas ?? []).map((f) => [f.titulo_id as string, f]));
  const comp = new Map((faturas ?? []).map((f) => [f.titulo_id as string, f.competencia as string]));
  const placasDe = (t: { id: string; veiculo_id: string | null }) => {
    const ids = new Set<string>();
    if (t.veiculo_id) ids.add(t.veiculo_id);
    const fat = faturaDoTitulo.get(t.id);
    if (fat) for (const i of itens ?? []) if (i.fatura_id === fat.id && i.veiculo_id) ids.add(i.veiculo_id);
    return placasDoBoleto(Array.from(ids).map((id) => porId.get(id)).filter((v): v is NonNullable<typeof v> => !!v));
  };

  // O que cada boleto cobra ("Mensalidade 05/2026", o tipo do avulso...).
  const renegIds = Array.from(new Set(imprimiveis.map((t) => t.renegociacao_id).filter((v): v is string => !!v)));
  const avulsoIds = Array.from(new Set(imprimiveis.map((t) => t.tipo_avulso_id).filter((v): v is string => !!v)));
  const [{ data: renegs }, { data: origens }, { data: tiposAvulso }] = await Promise.all([
    renegIds.length ? admin.from('cobranca_renegociacoes').select('id, tipo').in('id', renegIds)
      : Promise.resolve({ data: [] as { id: string; tipo: string }[] }),
    renegIds.length ? admin.from('cobranca_renegociacao_origens').select('renegociacao_id, boleto_historico_id, titulo_id').in('renegociacao_id', renegIds)
      : Promise.resolve({ data: [] as { renegociacao_id: string; boleto_historico_id: string | null; titulo_id: string | null }[] }),
    avulsoIds.length ? admin.from('tipos_boleto_avulso').select('id, nome').in('id', avulsoIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const histIds = (origens ?? []).map((o) => o.boleto_historico_id).filter((v): v is string => !!v);
  const titOrigIds = (origens ?? []).map((o) => o.titulo_id).filter((v): v is string => !!v);
  const [{ data: hist }, { data: fatOrig }] = await Promise.all([
    histIds.length ? admin.from('boletos_historico').select('id, competencia').in('id', histIds)
      : Promise.resolve({ data: [] as { id: string; competencia: string | null }[] }),
    titOrigIds.length ? admin.from('faturas').select('titulo_id, competencia').in('titulo_id', titOrigIds)
      : Promise.resolve({ data: [] as { titulo_id: string | null; competencia: string }[] }),
  ]);
  const compHist = new Map((hist ?? []).map((h) => [h.id, h.competencia]));
  const compTit = new Map((fatOrig ?? []).map((f) => [f.titulo_id as string, f.competencia as string]));
  const tipoReneg = new Map((renegs ?? []).map((r) => [r.id, r.tipo]));
  const nomeAvulso = new Map((tiposAvulso ?? []).map((t) => [t.id, t.nome]));

  const descrever = (t: (typeof imprimiveis)[number]) => {
    let tipo: TipoCobrancaCarne = 'MENSALIDADE';
    let comps: (string | null)[] = [comp.get(t.id) ?? null];
    if (t.adesao_lead_id) tipo = 'ADESAO';
    else if (t.tipo_avulso_id) tipo = 'AVULSO';
    else if (t.renegociacao_id) {
      const tr = tipoReneg.get(t.renegociacao_id);
      tipo = tr === 'ACORDO' ? 'ACORDO' : tr === 'PRO_RATA' ? 'PRO_RATA' : tr === 'AVULSO' ? 'AVULSO' : 'MENSALIDADE';
      comps = (origens ?? []).filter((o) => o.renegociacao_id === t.renegociacao_id)
        .map((o) => (o.boleto_historico_id ? compHist.get(o.boleto_historico_id) : o.titulo_id ? compTit.get(o.titulo_id) : null) ?? null);
    }
    const referente = referenteDoBoleto({ tipo, competencias: comps, nomeAvulso: t.tipo_avulso_id ? nomeAvulso.get(t.tipo_avulso_id) : null });
    const meses = tipo === 'MENSALIDADE' || tipo === 'ACORDO'
      ? Array.from(new Set(comps.map(referenciaDoVencimento).filter(Boolean))).join(', ') || null : null;
    return { referente, referencia: meses };
  };
  const rotulados = [...imprimiveis].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

  const fichas: FichaCarne[] = await Promise.all(rotulados.map(async (t) => ({
    titulo_id: t.id,
    vencimento: t.data_vencimento,
    valor: Number(t.valor),
    linha_digitavel: t.linha_digitavel!,
    nosso_numero: t.nosso_numero,
    numero_documento: seuNumeroDoTitulo(t.id),
    data_documento: String(t.created_at).slice(0, 10),
    ...descrever(t),
    pix_qr_svg: t.pix_copia_cola
      ? await QRCode.toString(t.pix_copia_cola, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      : null,
    placa: placasDe(t),
  })));

  const e = (cliente.endereco ?? {}) as Endereco;
  const rua = [e.logradouro, e.numero, e.complemento, e.bairro].filter((x) => x && String(x).trim()).join(', ');
  const cep = (e.cep ?? '').replace(/\D/g, '');
  const cidade = [e.cidade, e.uf].filter(Boolean).join(' - ');
  const contato = empresa?.whatsapp_principal || empresa?.telefone_fixo;

  const { html, impressas } = htmlDoCarne(fichas, {
    beneficiario: (empresa?.razao_social ?? 'SMART CAR BRASIL PROTEÇÃO VEICULAR').toUpperCase(),
    cnpj: empresa?.cnpj ?? null,
    logo: (await logoComoDataUrl(empresa?.logo_url)) ?? (await logoDeReserva()),
    instrucoes: [
      'Mantenha sua mensalidade em dia para garantir a proteção do seu veículo.',
      `Segunda via e boletos: portal do associado ${url.origin}/portal${contato ? ` · Dúvidas: ${contato}` : ''}`,
    ],
    pagador: {
      nome: cliente.nome_razao_social,
      documento: cliente.cpf_cnpj,
      endereco: rua || null,
      cep_cidade: cep || cidade ? `${cep ? `CEP: ${cep.slice(0, 5)}-${cep.slice(5)}` : ''}${cep && cidade ? ', ' : ''}${cidade}` : null,
    },
  }, `Carnê ${cliente.nome_razao_social}`);
  if (impressas === 0) return NextResponse.json({ error: 'A linha digitável destes boletos não confere.' }, { status: 400 });

  try {
    const pdf = await gerarPdf(html, { rodape: false });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="carne-${(cliente.nome_razao_social || 'associado').split(' ')[0].normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'associado'}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `Não foi possível gerar o PDF: ${(err as Error).message}` }, { status: 500 });
  }
}

/** A logo oficial guardada no repositorio, para quando a de Configuracoes -> Empresa nao carrega. */
async function logoDeReserva(): Promise<string | null> {
  try {
    const b = await readFile(path.join(process.cwd(), 'public', 'logo-smartcar-oficial.png'));
    return `data:image/png;base64,${b.toString('base64')}`;
  } catch {
    return null;
  }
}
