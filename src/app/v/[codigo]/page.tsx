import { notFound } from 'next/navigation';
import { BadgeCheck, Clock, MapPin, ShieldCheck, Wrench } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { CabecalhoMarca, RodapeMarca } from '@/components/hotlink/marca';
import { CotacaoPublica } from '@/components/hotlink/cotacao-publica';

/**
 * Hotlink de vendas — a pagina que o possivel associado ve.
 *
 * E a vitrine da Smart Car Brasil: logo no topo, faixa navy, hero com o corte
 * diagonal da marca e o ciano como acento, igual ao site. Do lado direito (ou
 * abaixo, no celular) fica a cotacao em tres passos, terminando no ACEITE que
 * poe a venda na esteira de aprovacao.
 *
 * Sem sessao: os dados vem por service_role, restritos ao codigo do link.
 */
export const dynamic = 'force-dynamic';

const BENEFICIOS = [
  { icone: ShieldCheck, titulo: 'Protecao completa', texto: 'Roubo, furto, colisao e incendio, com participacao definida em contrato.' },
  { icone: Wrench, titulo: 'Assistencia 24 horas', texto: 'Guincho, chaveiro, pane seca e troca de pneu, a qualquer hora.' },
  { icone: MapPin, titulo: 'Cobertura nacional', texto: 'Rede de prestadores em todo o Brasil, sem carencia para assistencia.' },
  { icone: Clock, titulo: 'Adesao rapida', texto: 'Cotacao na hora pela placa e vistoria feita pelo celular.' },
];

export default async function HotlinkPage({ params }: { params: { codigo: string } }) {
  const codigo = (params.codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const supabase = createAdminClient();

  const { data: destinos } = await supabase.rpc('resolver_hotlink', { p_codigo: codigo });
  const destino = destinos?.[0];
  if (!destino) notFound();

  const [{ data: tipos }, { data: empresa }] = await Promise.all([
    supabase.from('tipos_veiculo').select('id, nome').eq('status', true).order('nome'),
    supabase.from('empresa').select('logo_url').limit(1).maybeSingle(),
  ]);

  const ehVendedor = destino.tipo === 'VENDEDOR';

  return (
    <main className="min-h-screen bg-superficie">
      <CabecalhoMarca logoUrl={empresa?.logo_url} />

      {/* Hero com o corte diagonal da marca */}
      <section className="relative overflow-hidden bg-faixa">
        <div
          className="absolute inset-0 bg-[radial-gradient(120%_120%_at_15%_0%,#2C3E66_0%,#16213D_55%,#0E1730_100%)]"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 h-16 bg-superficie"
          style={{ clipPath: 'polygon(0 62%, 100% 0, 100% 100%, 0 100%)' }}
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-5xl gap-8 px-4 pb-24 pt-10 lg:grid-cols-[1fr_400px] lg:pb-28">
          <div className="text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-400">
              {ehVendedor ? 'Atendimento personalizado' : 'Cotacao online'}
            </p>
            <h1 className="mt-3 text-[30px] font-light uppercase leading-[1.15] tracking-tight sm:text-[38px]">
              Seu veiculo protegido<br />
              <span className="font-bold">com quem cuida de verdade</span>
            </h1>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-white/70">
              Faca sua cotacao em menos de um minuto. Sem burocracia, sem analise de perfil
              e com assistencia 24 horas em todo o Brasil.
            </p>

            {ehVendedor && (
              <div className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-superficie/10 py-2 pl-2 pr-4 ring-1 ring-white/15">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-cyan-500 text-[13px] font-bold text-brand-800">
                  {destino.nome.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-[12.5px] text-white/80">
                  Atendimento com <b className="text-white">{destino.nome}</b>
                </span>
              </div>
            )}

            <ul className="mt-7 grid gap-x-5 gap-y-3 sm:grid-cols-2">
              {BENEFICIOS.map((b) => (
                <li key={b.titulo} className="flex gap-2.5">
                  <b.icone className="mt-0.5 h-4.5 w-4.5 shrink-0 text-cyan-400" />
                  <div>
                    <p className="text-[13px] font-semibold text-white">{b.titulo}</p>
                    <p className="text-[11.5px] leading-relaxed text-white/55">{b.texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:pt-2">
            <CotacaoPublica
              codigo={codigo}
              vendedor={ehVendedor ? destino.nome : null}
              tipos={tipos ?? []}
            />
          </div>
        </div>
      </section>

      {/* Faixa de confianca */}
      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Vistoria pelo celular', 'Voce fotografa o veiculo pelo proprio aparelho, guiado passo a passo.'],
            ['Mensalidade so apos aprovacao', 'A cobranca comeca depois que a adesao e aprovada e o veiculo entra na base.'],
            ['Atendimento com gente', 'SAC, assistencia e sinistro com equipe propria — nao e robo.'],
          ].map(([titulo, texto]) => (
            <div key={titulo} className="rounded-2xl border border-slate-200 bg-superficie p-4">
              <BadgeCheck className="h-5 w-5 text-cyan-600" />
              <p className="mt-2 text-[13.5px] font-bold text-brand-800">{titulo}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{texto}</p>
            </div>
          ))}
        </div>
      </section>

      <RodapeMarca />
    </main>
  );
}
