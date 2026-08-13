import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCurrency } from '@/lib/utils';
import { PrintButton } from './print-button';

// Cotacao publica (link compartilhavel enviado ao cliente). Sem login.
// Busca via service_role (bypassa RLS) restrita ao token informado.
export const dynamic = 'force-dynamic';

export default async function CotacaoPublicaPage({ params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  const { data: cot } = await supabase
    .from('cotacoes')
    .select('*, leads(nome, placa, marca, modelo, ano_modelo, valor_fipe)')
    .eq('token', params.token)
    .maybeSingle();

  if (!cot) notFound();

  const { data: empresa } = await supabase
    .from('empresa')
    .select('razao_social, nome_fantasia, logo_url, whatsapp_principal')
    .limit(1)
    .maybeSingle();

  const lead = (cot as unknown as { leads: { nome: string; placa: string | null; marca: string | null; modelo: string | null; ano_modelo: number | null; valor_fipe: number | null } }).leads;
  const detalhada = cot.modo_envio !== 'CONSOLIDADA';
  const itens = Array.isArray(cot.itens) ? cot.itens : [];
  const nomeEmpresa = empresa?.nome_fantasia || empresa?.razao_social || 'Protecao Veicular';

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-50 px-4 py-6 text-slate-800">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {/* Cabecalho */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-brand-600 px-5 py-4 text-white">
          {empresa?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={empresa.logo_url} alt="" className="max-h-10 max-w-[140px] object-contain" />
          ) : (
            <span className="text-lg font-semibold">{nomeEmpresa}</span>
          )}
        </div>

        <div className="px-5 py-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">Proposta de protecao veicular</p>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Ola, {lead?.nome ?? 'Cliente'}!</h1>

          {/* Veiculo */}
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-medium text-slate-800">
              {[lead?.marca, lead?.modelo].filter(Boolean).join(' ') || 'Veiculo'}
              {lead?.ano_modelo ? ` ${lead.ano_modelo}` : ''}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {lead?.placa && <span>Placa: <b className="font-mono">{lead.placa}</b></span>}
              {lead?.valor_fipe != null && <span>FIPE: {formatCurrency(lead.valor_fipe)}</span>}
            </div>
          </div>

          {/* Itens (modo detalhado) */}
          {detalhada && itens.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">O que esta incluso</p>
              <ul className="divide-y divide-slate-100">
                {itens.map((i, idx) => (
                  <li key={idx} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-700">
                      {i.nome}
                      {!i.obrigatorio && <span className="ml-1 text-[10px] uppercase text-brand-500">opcional</span>}
                    </span>
                    <span className="font-medium text-slate-900">{formatCurrency(i.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Total */}
          <div className="mt-5 rounded-xl bg-brand-50 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-brand-600">Mensalidade</p>
            <p className="text-3xl font-bold text-brand-700">{formatCurrency(cot.total_mensalidade)}</p>
            <p className="mt-1 text-xs text-slate-500">por mes</p>
          </div>

          {/* Participacao */}
          {cot.participacao > 0 && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Participacao (cota de rateio) em caso de evento: <b>{formatCurrency(cot.participacao)}</b>
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {empresa?.whatsapp_principal && (
              <a
                href={`https://wa.me/55${empresa.whatsapp_principal.replace(/\D/g, '')}`}
                className="rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-medium text-white"
              >
                Falar com um consultor
              </a>
            )}
            <PrintButton />
          </div>

          <p className="mt-4 text-center text-[10px] text-slate-400">
            Valores sujeitos a analise e aprovacao. {nomeEmpresa}.
          </p>
        </div>
      </div>
    </main>
  );
}
