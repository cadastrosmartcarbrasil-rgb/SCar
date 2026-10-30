// A PROPOSTA COMERCIAL v2 (30/10/2026): 3 folhas A4 de 794x1123 px.
//
// Estilos INLINE de proposito: o mesmo componente vira a pagina publica
// (/cotacao/<token>) e o HTML do PDF (renderToStaticMarkup, sem o Tailwind do
// app). As cores sao as constantes da marca abaixo — unico lugar com hex.
// Documento de papel: sempre claro, nunca `dark:`.
import type { CSSProperties, ReactNode } from 'react';
import {
  ASSISTENCIA_24H_PROPOSTA, ASSISTENCIA_NAO_COBRE, REGRAS_ASSISTENCIA, cnpjFormatado, moeda, textoReboque,
  type IconeCobertura, type PropostaDados,
} from '@/lib/proposta';

// Paleta oficial (60/25/10/5) + derivados de leitura.
export const COR = {
  navy: '#142445',
  navyEscuro: '#0B1730',
  smart: '#0BACE2',
  smartTexto: '#0678A0', // o azul Smart escurecido: legível sobre branco
  celeste: '#6AA9DE',
  grafite: '#1A1A1A',
  chumbo: '#545454',
  neutro: '#8A9099',
  fundo: '#F2F5F9',
  branco: '#FFFFFF',
  linha: '#DCE3EC',
  linhaFraca: '#E9EEF4',
  textoClaro: '#C6D3E6',
  alerta: '#A8361C',
  alertaFundo: '#FDECEA',
  verde: '#12703A',
  whatsapp: '#128C4A',
  fundoTela: '#D5DDEA',
  iconeFundo: '#E6F5FB',
  cabecalhoTabela: '#E6EEF7',
  zebra: '#F8FAFC',
  placaMercosul: '#0B3C9D',
  bordaCampo: '#A3B1C8',
} as const;

export const FONTE = {
  titulo: "'Montserrat Variable', 'Montserrat', system-ui, sans-serif",
  texto: "'Barlow', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const LARGURA_FOLHA = 794;
export const ALTURA_FOLHA = 1123;

const folha: CSSProperties = {
  position: 'relative', width: LARGURA_FOLHA, height: ALTURA_FOLHA, overflow: 'hidden', boxSizing: 'border-box',
  fontFamily: FONTE.texto, breakInside: 'avoid', pageBreakAfter: 'always',
};

const rotulo: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: COR.chumbo, textTransform: 'uppercase' };

// ------------------------------------------------------------------ ícones
const PATHS: Record<IconeCobertura, ReactNode> = {
  cadeado: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  colisao: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
  perda: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  fogo: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 2 2 2 0-3-1-5 1-8z" />,
  natureza: <><path d="M7 17a4 4 0 0 1-.5-8A6 6 0 0 1 18 8.5 4 4 0 0 1 17.5 17z" /><path d="M9 21l1-2M13 21l1-2" /></>,
  terceiros: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5a3 3 0 0 1 0 6M18 20a5 5 0 0 0-3-4.5" /></>,
  rastreador: <><path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  carro: <><path d="M4 15v-3l2-5h12l2 5v3" /><path d="M3 15h18v3H3z" /></>,
  vidros: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 12h16M12 5v14" /></>,
  vida: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  estrela: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
};

function Icone({ nome, cor = COR.smartTexto, tamanho = 20 }: { nome: IconeCobertura; cor?: string; tamanho?: number }) {
  return (
    <svg aria-hidden="true" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{PATHS[nome]}</svg>
  );
}

function Logo({ src, altura }: { src: string; altura: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Smart Car Brasil · Proteção Veicular" style={{ display: 'block', height: altura, width: 'auto' }} />;
}

function Cabecalho({ logo, etiqueta }: { logo: string; etiqueta: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Logo src={logo} altura={50} />
      <div style={{ ...rotulo, fontSize: 12 }}>{etiqueta}</div>
    </div>
  );
}

// ------------------------------------------------------------------- capa
export function PropostaCapa({ d, logo }: { d: PropostaDados; logo: string }) {
  return (
    <section style={{ ...folha, padding: '52px 56px', color: COR.branco,
      background: `linear-gradient(160deg, ${COR.navy} 0%, ${COR.navyEscuro} 60%, #070F21 100%)` }}>
      <svg aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0 }} width={LARGURA_FOLHA} height={ALTURA_FOLHA}
        viewBox={`0 0 ${LARGURA_FOLHA} ${ALTURA_FOLHA}`}>
        <defs>
          <linearGradient id="pv-g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={COR.smart} stopOpacity="0" /><stop offset="1" stopColor={COR.smart} stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id="pv-glow" cx="0.8" cy="0.28" r="0.6">
            <stop offset="0" stopColor={COR.celeste} stopOpacity="0.35" /><stop offset="1" stopColor={COR.celeste} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={LARGURA_FOLHA} height={ALTURA_FOLHA} fill="url(#pv-glow)" />
        <g fill="none" stroke={COR.smart}>
          <circle cx="650" cy="330" r="250" strokeOpacity="0.3" strokeWidth="10" strokeDasharray="2 12" />
          <circle cx="650" cy="330" r="305" strokeOpacity="0.14" strokeWidth="1" />
          <circle cx="650" cy="330" r="208" stroke="url(#pv-g1)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray="720 1400" transform="rotate(-200 650 330)" />
        </g>
        <g stroke="url(#pv-g1)" strokeLinecap="round" fill="none">
          <line x1="-40" y1="1010" x2="420" y2="830" strokeWidth="3" opacity="0.5" />
          <line x1="-60" y1="1060" x2="520" y2="850" strokeWidth="2" opacity="0.35" />
          <line x1="80" y1="1130" x2="640" y2="900" strokeWidth="4" opacity="0.25" />
        </g>
      </svg>

      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: COR.branco, borderRadius: 14, padding: '8px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
            <Logo src={logo} altura={60} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${COR.textoClaro}55`, borderRadius: 999,
            padding: '8px 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: COR.textoClaro }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COR.smart }} />
            <span>COTAÇÃO {d.dataCotacao}</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.22em', color: COR.smart }}>PROPOSTA PERSONALIZADA</div>
          <h1 style={{ margin: '14px 0 0', fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 54, lineHeight: 1.04,
            letterSpacing: '-0.02em', maxWidth: 580 }}>
            Proteção que acompanha você em cada quilômetro.
          </h1>
          <p style={{ margin: '20px 0 0', fontSize: 18, lineHeight: 1.5, color: COR.textoClaro, maxWidth: 520 }}>
            Proteção veicular inteligente, com benefícios exclusivos, atendimento ágil e a certeza de estar sempre bem acompanhado.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '26px 28px', borderRadius: 24,
          background: 'rgba(255,255,255,0.07)', border: `1px solid ${COR.textoClaro}40` }}>
          {d.veiculo.placa && (
            <div style={{ flex: 'none', width: 280, height: 100, borderRadius: 10, background: COR.branco, overflow: 'hidden',
              boxShadow: '0 12px 30px rgba(0,0,0,0.45)', color: COR.grafite }}>
              <div style={{ height: 24, background: COR.placaMercosul, color: COR.branco, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '0.3em' }}>BRASIL</div>
              <div style={{ height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTE.mono,
                fontWeight: 600, fontSize: 52, letterSpacing: 4 }}>{d.veiculo.placa}</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: COR.textoClaro }}>SEU VEÍCULO</div>
            <div style={{ fontFamily: FONTE.titulo, fontWeight: 700, fontSize: 21, lineHeight: 1.2 }}>{d.veiculo.modelo}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'baseline', marginTop: 4, fontSize: 14, color: COR.textoClaro }}>
              {d.veiculo.ano && <span>Ano <b style={{ color: COR.branco }}>{d.veiculo.ano}</b></span>}
              {d.veiculo.valorProtegido != null && (
                <span>Valor protegido (FIPE) <b style={{ color: COR.smart, fontSize: 18 }}>{moeda(d.veiculo.valorProtegido)}</b></span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          {[
            { t: ['Contratação', 'facilitada'], p: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></> },
            { t: ['Qualidade no', 'atendimento'], p: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /> },
            { t: ['Preço', 'competitivo'], p: <><path d="M20 12l-8 8-9-9V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" /></> },
          ].map((x) => (
            <div key={x.t[0]} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>
              <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={COR.smart} strokeWidth={1.8}
                strokeLinecap="round" strokeLinejoin="round">{x.p}</svg>
              <span>{x.t[0]}<br />{x.t[1]}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20,
          borderTop: `1px solid ${COR.textoClaro}40` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg aria-hidden="true" width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={COR.smart} strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Cadastrada junto à SUSEP</div>
              <div style={{ fontSize: 12, color: COR.textoClaro }}>Credibilidade garantida</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', lineHeight: 1.35 }}>
            <div style={{ fontFamily: FONTE.titulo, fontWeight: 700, fontSize: 16 }}>
              {d.empresa.telefoneAssistencia} · {d.empresa.telefoneComercial}
            </div>
            <div style={{ fontSize: 13, color: COR.smart }}>{(d.empresa.site ?? 'smartcarbrasil.com.br').replace(/^https?:\/\//, '')}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ página 2
function Campo({ titulo, children, destaque }: { titulo: string; children: ReactNode; destaque?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={rotulo}>{titulo}</div>
      <div style={{ marginTop: destaque ? 2 : 4, fontSize: destaque ? 28 : 15, fontWeight: 700, lineHeight: destaque ? 1.1 : 1.25,
        color: destaque ? COR.smartTexto : COR.navy }}>{children}</div>
    </div>
  );
}

export function PropostaPlano({ d, logo }: { d: PropostaDados; logo: string }) {
  const reboque = textoReboque(d.reboque);
  const grade: CSSProperties = { display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1.3fr', gap: 16, alignItems: 'center', padding: '14px 0' };
  return (
    <section style={{ ...folha, padding: '30px 40px 24px', display: 'flex', flexDirection: 'column', gap: 12,
      background: COR.fundo, color: COR.navy }}>
      <Cabecalho logo={logo} etiqueta="Seu plano · 02/03" />

      <div>
        {d.plano.nome && (
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.16em', color: COR.smartTexto, textTransform: 'uppercase' }}>
            {d.plano.nome}
          </div>
        )}
        <h2 style={{ margin: '6px 0 0', fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 32, lineHeight: 1.08, letterSpacing: '-0.02em' }}>
          O que você leva na sua proteção
        </h2>
      </div>

      <div style={{ background: COR.branco, border: `1px solid ${COR.linha}`, borderRadius: 16, padding: '0 20px' }}>
        <div style={{ ...grade, borderBottom: `1px solid ${COR.linhaFraca}` }}>
          <Campo titulo="Veículo">{d.veiculo.modelo}</Campo>
          <Campo titulo="Placa"><span style={{ fontFamily: FONTE.mono }}>{d.veiculo.placa ?? '—'}</span></Campo>
          <Campo titulo="Ano modelo">{d.veiculo.ano ?? '—'}</Campo>
          <Campo titulo="Valor protegido">{d.veiculo.valorProtegido != null ? moeda(d.veiculo.valorProtegido) : '—'}</Campo>
        </div>
        <div style={grade}>
          <Campo titulo="Valor mensal" destaque>{moeda(d.valores.mensal)}</Campo>
          <Campo titulo="Adesão">{d.valores.adesao != null ? moeda(d.valores.adesao) : 'Isenta'}</Campo>
          <Campo titulo="Rastreador">{d.valores.rastreador}</Campo>
          <Campo titulo="Cota de participação">
            {d.valores.cotaPercentual != null && <span>{(d.valores.cotaPercentual * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% </span>}
            {d.valores.cotaValor != null && (
              <span style={{ fontWeight: 500, color: COR.chumbo }}>
                {d.valores.cotaPercentual != null ? `(${moeda(d.valores.cotaValor)})` : moeda(d.valores.cotaValor)}
              </span>
            )}
            {d.valores.cotaPercentual == null && d.valores.cotaValor == null && '—'}
          </Campo>
        </div>
      </div>

      {d.coberturas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${d.coberturas.length > 9 ? 4 : 3}, minmax(0, 1fr))`, gap: 8 }}>
          {d.coberturas.slice(0, 12).map((c, k) => (
            <div key={`${c.titulo}-${k}`} style={{ display: 'flex', alignItems: 'center', gap: 9, background: COR.branco,
              border: `1px solid ${COR.linha}`, borderRadius: 12, padding: '7px 10px', height: 54, boxSizing: 'border-box' }}>
              <div style={{ flex: 'none', width: 32, height: 32, borderRadius: '50%', background: COR.iconeFundo,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icone nome={c.icone} tamanho={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.titulo}</div>
                {c.detalhe && (
                  <div style={{ marginTop: 1, fontSize: 11.5, lineHeight: 1.25, color: COR.chumbo, display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.detalhe}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ border: `1px solid ${COR.linha}`, borderRadius: 18, overflow: 'hidden', background: COR.branco }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '13px 22px',
          background: `linear-gradient(135deg, ${COR.navy} 0%, ${COR.navyEscuro} 100%)`, color: COR.branco }}>
          <div style={{ flex: 1.3 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: COR.smart }}>PARA TODOS OS ASSOCIADOS</div>
            <div style={{ marginTop: 4, fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 22, lineHeight: 1.05, whiteSpace: 'nowrap' }}>Assistência 24 horas</div>
            <div style={{ marginTop: 4, fontSize: 12, color: COR.textoClaro }}>Todo o Brasil · carro, moto, pick-up, van e caminhão</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: COR.textoClaro }}>SEU LIMITE DE REBOQUE</div>
            <div style={{ marginTop: 2, fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 26, lineHeight: 1.05, color: COR.smart }}>{reboque.total}</div>
            <div style={{ fontSize: 12, color: COR.textoClaro }}>{reboque.detalhe}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: COR.textoClaro }}>LIGUE GRÁTIS, 24 HORAS</div>
            <div style={{ marginTop: 2, fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 23, lineHeight: 1.05 }}>{d.empresa.telefoneAssistencia}</div>
          </div>
        </div>
        <div style={{ display: 'flex', padding: '0 16px', height: 28, alignItems: 'center', background: COR.cabecalhoTabela, ...rotulo, color: COR.navy }}>
          <div style={{ flex: 'none', width: 176 }}>Serviço</div>
          <div style={{ flex: 1 }}>O que inclui</div>
          <div style={{ flex: 'none', width: 200 }}>Limite</div>
        </div>
        {ASSISTENCIA_24H_PROPOSTA.map((s, k) => (
          <div key={s.servico} style={{ display: 'flex', alignItems: 'center', padding: '0 16px', height: 27,
            borderTop: `1px solid ${COR.linhaFraca}`, background: k % 2 ? COR.zebra : COR.branco, fontSize: 12.5, whiteSpace: 'nowrap' }}>
            <div style={{ flex: 'none', width: 176, fontWeight: 700 }}>{s.servico}</div>
            <div style={{ flex: 1, color: COR.chumbo, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.inclui}</div>
            <div style={{ flex: 'none', width: 200, fontWeight: 700, color: s.reboque ? COR.smartTexto : COR.navy }}>
              {s.reboque && d.reboque.total != null ? `${reboque.total} contratados` : s.limite}
            </div>
          </div>
        ))}
        <div style={{ padding: '9px 16px', borderTop: `1px solid ${COR.linhaFraca}`, fontSize: 12, color: COR.chumbo }}>
          1 acionamento por serviço ao mês · regras de uso e exclusões na página 3
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: COR.chumbo }}>
        <span>Cotação válida até <b style={{ color: COR.navy }}>{d.validade}</b></span>
        <span>Proteção ativa após a vistoria e a aprovação do cadastro</span>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ página 3
const PASSOS = [
  { n: '1', t: 'Aceite a proposta', d: 'Solicitação de adesão com os dados do veículo' },
  { n: '2', t: 'Vistoria do veículo', d: 'Fotos do veículo, pelo seu celular ou com o consultor' },
  { n: '3', t: 'Proteção ativa', d: 'Após a aprovação do cadastro; a 24h vale 24 horas depois' },
];

export function PropostaCondicoes({ d, logo, qr }: { d: PropostaDados; logo: string; qr: string | null }) {
  const cartao: CSSProperties = { background: COR.branco, border: `1px solid ${COR.linha}`, borderRadius: 14, padding: '12px 16px' };
  const lista: CSSProperties = { margin: '8px 0 0', paddingLeft: 16, fontSize: 12.5, lineHeight: 1.4, color: COR.chumbo,
    display: 'flex', flexDirection: 'column', gap: 4 };
  const cnpj = cnpjFormatado(d.empresa.cnpj);
  return (
    <section style={{ ...folha, padding: '34px 40px 28px', display: 'flex', flexDirection: 'column', gap: 13,
      background: COR.fundo, color: COR.navy, pageBreakAfter: 'auto' }}>
      <Cabecalho logo={logo} etiqueta="Condições · 03/03" />

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.16em', color: COR.smartTexto }}>ANTES DE ADERIR</div>
        <h2 style={{ margin: '6px 0 0', fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 32, lineHeight: 1.08, letterSpacing: '-0.02em' }}>
          Fechar com segurança é simples
        </h2>
      </div>

      <div style={{ ...cartao, display: 'flex', alignItems: 'flex-start', padding: '15px 24px', borderRadius: 16 }}>
        {PASSOS.map((p, k) => (
          <div key={p.n} style={{ display: 'contents' }}>
            {k > 0 && <div style={{ flex: 'none', width: 46, marginTop: 17, borderTop: `3px dashed ${COR.smart}` }} />}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: k === 2 ? COR.navy : COR.smartTexto,
                color: k === 2 ? COR.smart : COR.branco, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 16 }}>{p.n}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.t}</div>
              <div style={{ fontSize: 12, color: COR.chumbo, lineHeight: 1.35 }}>{p.d}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {d.regras.map((r) => (
            <div key={r.titulo} style={{ ...cartao, padding: '10px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.titulo}</div>
              <div style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.4, color: COR.chumbo }}>{r.texto}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={cartao}>
            <div style={{ ...rotulo, fontSize: 11.5, color: COR.smartTexto }}>Regras da Assistência 24h</div>
            <ul style={lista}>{REGRAS_ASSISTENCIA.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div style={cartao}>
            <div style={{ ...rotulo, fontSize: 11.5, color: COR.alerta }}>A assistência não cobre</div>
            <ul style={lista}>{ASSISTENCIA_NAO_COBRE.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </div>
      </div>

      <div style={{ ...cartao, padding: '10px 16px' }}>
        <div style={{ ...rotulo, fontSize: 11.5 }}>Solicitação de adesão e regimento interno</div>
        <div style={{ marginTop: 3, fontSize: 12.5, lineHeight: 1.4, color: COR.chumbo }}>
          Ao aceitar, você solicita a adesão à associação com os dados deste veículo. O termo de adesão e o regimento interno
          ficam na Área do Associado
          {d.empresa.regulamentoUrl ? <> e em <span style={{ color: COR.smartTexto }}>{d.empresa.regulamentoUrl.replace(/^https?:\/\//, '')}</span></> : null}.
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', gap: 20, alignItems: 'center', padding: '20px 26px', borderRadius: 24,
        background: `linear-gradient(135deg, ${COR.navy} 0%, ${COR.navyEscuro} 100%)`, color: COR.branco }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: COR.smart }}>SEU CONSULTOR</div>
          <div style={{ marginTop: 6, fontFamily: FONTE.titulo, fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>
            {d.consultor?.nome ?? 'Central de atendimento'}
          </div>
          <div style={{ marginTop: 6, fontSize: 15, color: COR.textoClaro }}>{d.consultor?.telefone ?? d.empresa.telefoneComercial}</div>
          {d.consultor?.email && <div style={{ marginTop: 2, fontSize: 13, color: COR.textoClaro }}>{d.consultor.email}</div>}
          <a href={d.link} style={{ display: 'inline-block', marginTop: 14, padding: '11px 24px', borderRadius: 999,
            background: COR.smart, color: COR.navyEscuro, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
            Aceitar proposta
          </a>
        </div>
        <div style={{ flex: 'none', width: 136, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code do link da proposta" style={{ width: 120, height: 120, borderRadius: 12, background: COR.branco, padding: 6, boxSizing: 'border-box' }} />
          )}
          <div style={{ fontSize: 12, color: COR.textoClaro, textAlign: 'center' }}>
            Válida até <b style={{ color: COR.branco }}>{d.validade}</b>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: COR.chumbo, lineHeight: 1.4 }}>
        <span>{d.empresa.nome.toUpperCase()}{cnpj ? ` · CNPJ ${cnpj}` : ''}</span>
        <span>Assistência 24h: {d.empresa.telefoneAssistencia}</span>
      </div>
    </section>
  );
}

/** As 3 folhas, em ordem. */
export function PropostaDocumento({ d, logo, qr, espaco = 0 }: { d: PropostaDados; logo: string; qr: string | null; espaco?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: espaco, width: LARGURA_FOLHA }}>
      <PropostaCapa d={d} logo={logo} />
      <PropostaPlano d={d} logo={logo} />
      <PropostaCondicoes d={d} logo={logo} qr={qr} />
    </div>
  );
}
