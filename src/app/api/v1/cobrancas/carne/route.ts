import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gerarPdf, logoComoDataUrl } from '@/lib/termos-server';
import { seuNumeroDoTitulo } from '@/lib/pagamentos/sicredi';
import { htmlDoCarne, referenciaDoVencimento, rotularParcelas, type FichaCarne } from '@/lib/carne-impressao';

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
    .select('id, cliente_id, veiculo_id, valor, data_vencimento, linha_digitavel, nosso_numero, pix_copia_cola, status, created_at, adesao_lead_id, tipo_avulso_id')
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

  const veiculoIds = Array.from(new Set(imprimiveis.map((t) => t.veiculo_id).filter((v): v is string => !!v)));
  const [{ data: cliente }, { data: empresa }, { data: veiculos }, { data: faturas }] = await Promise.all([
    admin.from('clientes').select('nome_razao_social, cpf_cnpj, endereco').eq('id', clientes[0]).maybeSingle(),
    admin.from('empresa').select('razao_social, nome_fantasia, cnpj, logo_url, whatsapp_principal, telefone_fixo').limit(1).maybeSingle(),
    veiculoIds.length
      ? admin.from('veiculos').select('id, placa').in('id', veiculoIds)
      : Promise.resolve({ data: [] as { id: string; placa: string | null }[] }),
    admin.from('faturas').select('titulo_id, competencia').in('titulo_id', imprimiveis.map((t) => t.id)),
  ]);
  if (!cliente) return NextResponse.json({ error: 'Associado não encontrado' }, { status: 404 });

  const placas = new Map((veiculos ?? []).map((v) => [v.id, v.placa]));
  const comp = new Map((faturas ?? []).map((f) => [f.titulo_id as string, f.competencia as string]));

  const rotulados = rotularParcelas(imprimiveis.map((t) => ({
    ...t,
    vencimento: t.data_vencimento,
    tipo: t.adesao_lead_id ? 'ADESAO' as const : t.tipo_avulso_id ? 'AVULSO' as const : 'MENSALIDADE' as const,
  })));

  const fichas: FichaCarne[] = await Promise.all(rotulados.map(async (t) => ({
    titulo_id: t.id,
    vencimento: t.data_vencimento,
    valor: Number(t.valor),
    linha_digitavel: t.linha_digitavel!,
    nosso_numero: t.nosso_numero,
    numero_documento: seuNumeroDoTitulo(t.id),
    data_documento: String(t.created_at).slice(0, 10),
    parcela: t.parcela,
    referencia: referenciaDoVencimento(comp.get(t.id)),
    pix_qr_svg: t.pix_copia_cola
      ? await QRCode.toString(t.pix_copia_cola, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      : null,
    placa: t.veiculo_id ? placas.get(t.veiculo_id) ?? null : null,
  })));

  const e = (cliente.endereco ?? {}) as Endereco;
  const rua = [e.logradouro, e.numero, e.complemento, e.bairro].filter((x) => x && String(x).trim()).join(', ');
  const cep = (e.cep ?? '').replace(/\D/g, '');
  const cidade = [e.cidade, e.uf].filter(Boolean).join(' - ');
  const contato = empresa?.whatsapp_principal || empresa?.telefone_fixo;

  const { html, impressas } = htmlDoCarne(fichas, {
    beneficiario: (empresa?.razao_social ?? 'SMART CAR BRASIL PROTEÇÃO VEICULAR').toUpperCase(),
    cnpj: empresa?.cnpj ?? null,
    logo: await logoComoDataUrl(empresa?.logo_url),
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
