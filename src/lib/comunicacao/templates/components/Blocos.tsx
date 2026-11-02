import * as React from 'react';
import { Button, Column, Heading, Link, Row, Section, Text } from '@react-email/components';
import { COR, FONTE, LINKS_PADRAO, type CanalAtendimento, type Empresa, type Links } from '../config';

/* ------------------------------------------------------------------ */
/* Tipografia                                                          */
/* ------------------------------------------------------------------ */

export const Titulo = ({ children }: { children: React.ReactNode }) => (
  <Heading
    as="h1"
    className="h1 t-title"
    style={{
      margin: '18px 0 12px',
      fontFamily: FONTE.titulo,
      fontSize: 28,
      lineHeight: '34px',
      fontWeight: 700,
      color: COR.marinho,
    }}
  >
    {children}
  </Heading>
);

export const Paragrafo = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) => (
  <Text
    className="t-body"
    style={{
      margin: '0 0 14px',
      fontFamily: FONTE.texto,
      fontSize: 16,
      lineHeight: '25px',
      color: COR.chumbo,
      ...style,
    }}
  >
    {children}
  </Text>
);

export const SubTitulo = ({ children }: { children: React.ReactNode }) => (
  <Text
    className="t-title"
    style={{
      margin: '26px 0 12px',
      fontFamily: FONTE.titulo,
      fontSize: 17,
      fontWeight: 700,
      color: COR.marinho,
    }}
  >
    {children}
  </Text>
);

/* ------------------------------------------------------------------ */
/* Resumo da contribuição                                              */
/* ------------------------------------------------------------------ */

export interface ItemResumo {
  rotulo: string;
  valor: string;
  grande?: boolean;
  mono?: boolean;
}

const Celula = ({ item }: { item: ItemResumo }) => (
  <>
    <Text
      className="t-label"
      style={{
        margin: '0 0 2px',
        fontFamily: FONTE.titulo,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: COR.neutro,
      }}
    >
      {item.rotulo}
    </Text>
    <Text
      className="t-title"
      style={{
        margin: 0,
        fontFamily: item.mono ? FONTE.mono : FONTE.titulo,
        fontSize: item.grande ? 24 : 16,
        lineHeight: item.grande ? '30px' : '24px',
        fontWeight: 700,
        color: COR.marinho,
      }}
    >
      {item.valor}
    </Text>
  </>
);

export function Resumo({ itens, barra }: { itens: ItemResumo[]; barra: string }) {
  const linhas: ItemResumo[][] = [];
  for (let i = 0; i < itens.length; i += 2) linhas.push(itens.slice(i, i + 2));
  return (
    <Section
      className="bg-box"
      style={{
        backgroundColor: COR.caixa,
        borderLeft: `4px solid ${barra}`,
        borderRadius: 12,
        padding: '18px 20px 6px',
        margin: '20px 0 8px',
      }}
    >
      {linhas.map((par, i) => (
        <Row key={i} style={{ marginBottom: 12 }}>
          {par.map((item, j) => (
            <Column key={j} style={{ width: '50%', verticalAlign: 'top' }}>
              <Celula item={item} />
            </Column>
          ))}
          {par.length === 1 && <Column style={{ width: '50%' }} />}
        </Row>
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Avisos / destaques                                                  */
/* ------------------------------------------------------------------ */

export function Destaque({
  icone,
  titulo,
  children,
  cor = COR.smart,
}: {
  icone: string;
  titulo: string;
  children: React.ReactNode;
  cor?: string;
}) {
  return (
    <Section
      className="bg-box bd-box"
      style={{
        backgroundColor: COR.caixa,
        border: `1px solid ${COR.borda}`,
        borderLeft: `4px solid ${cor}`,
        borderRadius: 12,
        padding: '14px 18px 4px',
        margin: '18px 0 8px',
      }}
    >
      <Text
        className="t-title"
        style={{
          margin: '0 0 6px',
          fontFamily: FONTE.titulo,
          fontSize: 14,
          fontWeight: 700,
          color: COR.marinho,
        }}
      >
        {icone}&nbsp; {titulo}
      </Text>
      <Text
        className="t-body"
        style={{ margin: '0 0 10px', fontSize: 14, lineHeight: '22px', color: COR.chumbo }}
      >
        {children}
      </Text>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Formas de pagamento                                                 */
/* ------------------------------------------------------------------ */

export interface Pagamento {
  linkBoleto?: string;
  linhaDigitavel?: string;
  pixCopiaCola?: string;
  linkCheckout?: string;
}

const Passo = ({ n }: { n: number }) => (
  <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ display: 'inline-table' }}>
    <tbody>
      <tr>
        <td
          align="center"
          className="passo"
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: COR.marinho,
            color: '#FFFFFF',
            fontFamily: FONTE.titulo,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: '26px',
          }}
        >
          {n}
        </td>
      </tr>
    </tbody>
  </table>
);

const Mono = ({ children }: { children: string }) => (
  <Text
    className="bg-box bd-all t-title"
    style={{
      margin: '8px 0 0',
      padding: '12px 14px',
      backgroundColor: COR.caixa,
      border: `1px dashed #B9C4D4`,
      borderRadius: 8,
      fontFamily: FONTE.mono,
      fontSize: 13,
      lineHeight: '20px',
      color: COR.marinho,
      wordBreak: 'break-all',
      overflowWrap: 'anywhere',
      userSelect: 'all',
    }}
  >
    {children}
  </Text>
);

const Opcao = ({
  n,
  titulo,
  children,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
}) => (
  <Section
    className="line"
    style={{
      border: `1px solid ${COR.borda}`,
      borderRadius: 12,
      padding: '16px 18px 18px',
      marginBottom: 12,
    }}
  >
    <Row>
      <Column style={{ width: 38, verticalAlign: 'top' }}>
        <Passo n={n} />
      </Column>
      <Column style={{ verticalAlign: 'top' }}>
        <Text
          className="t-title"
          style={{
            margin: '2px 0 8px',
            fontFamily: FONTE.titulo,
            fontSize: 15,
            fontWeight: 700,
            color: COR.marinho,
          }}
        >
          {titulo}
        </Text>
        {children}
      </Column>
    </Row>
  </Section>
);

const Dica = ({ children }: { children: React.ReactNode }) => (
  <Text className="t-muted" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: '19px', color: COR.neutro }}>
    {children}
  </Text>
);

export function FormasPagamento({ pagamento }: { pagamento: Pagamento }) {
  const { linkBoleto, linhaDigitavel, pixCopiaCola, linkCheckout } = pagamento;
  const temBoleto = Boolean(linkBoleto || linhaDigitavel);
  let n = 0;
  if (!temBoleto && !pixCopiaCola && !linkCheckout) return null;

  return (
    <>
      <SubTitulo>Escolha como pagar</SubTitulo>

      {temBoleto && (
        <Opcao n={++n} titulo="Boleto bancário">
          {linkBoleto && (
            <Button
              href={linkBoleto}
              className="btn-solid"
              style={{
                backgroundColor: COR.marinho,
                color: '#FFFFFF',
                fontFamily: FONTE.titulo,
                fontSize: 14,
                fontWeight: 700,
                padding: '12px 22px',
                borderRadius: 8,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Abrir boleto (PDF)
            </Button>
          )}
          {linhaDigitavel && (
            <>
              <Text
                className="t-label"
                style={{
                  margin: linkBoleto ? '14px 0 0' : '0',
                  fontSize: 12,
                  fontWeight: 600,
                  color: COR.neutro,
                }}
              >
                Linha digitável para copiar e colar no app do seu banco:
              </Text>
              <Mono>{linhaDigitavel}</Mono>
            </>
          )}
        </Opcao>
      )}

      {pixCopiaCola && (
        <Opcao n={++n} titulo="Pix — copia e cola">
          <Text className="t-body" style={{ margin: 0, fontSize: 14, lineHeight: '21px', color: COR.chumbo }}>
            Copie o código abaixo e cole na opção <strong>Pix Copia e Cola</strong> do app do seu banco.
          </Text>
          <Mono>{pixCopiaCola}</Mono>
        </Opcao>
      )}

      {linkCheckout && (
        <Opcao n={++n} titulo="Cartão">
          <Button
            href={linkCheckout}
            className="btn-outline"
            style={{
              color: COR.marinho,
              fontFamily: FONTE.titulo,
              fontSize: 14,
              fontWeight: 700,
              padding: '10px 20px',
              borderRadius: 8,
              border: `2px solid ${COR.marinho}`,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Pagar com cartão
          </Button>
          <Dica>Você será levado a uma página de pagamento segura.</Dica>
        </Opcao>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Portal e aplicativo                                                 */
/* ------------------------------------------------------------------ */

const BotaoApp = ({ href, children }: { href: string; children: string }) => (
  <Button
    href={href}
    className="btn-outline"
    style={{
      color: COR.marinho,
      fontFamily: FONTE.titulo,
      fontSize: 13,
      fontWeight: 700,
      padding: '9px 14px',
      borderRadius: 8,
      border: `1.5px solid ${COR.celeste}`,
      textDecoration: 'none',
      display: 'inline-block',
      textAlign: 'center',
    }}
  >
    {children}
  </Button>
);

export function AppAcesso({ links = LINKS_PADRAO }: { links?: Links }) {
  return (
    <Section
      className="bg-box bd-all"
      style={{
        backgroundColor: COR.caixa,
        border: `1px solid ${COR.borda}`,
        borderRadius: 12,
        padding: '18px 20px 20px',
        margin: '22px 0 8px',
      }}
    >
      <Text
        className="t-title"
        style={{ margin: '0 0 6px', fontFamily: FONTE.titulo, fontSize: 15, fontWeight: 700, color: COR.marinho }}
      >
        Seu plano e seus boletos na palma da mão
      </Text>
      <Text className="t-body" style={{ margin: '0 0 14px', fontSize: 14, lineHeight: '21px', color: COR.chumbo }}>
        Consulte faturas, segunda via e dados do seu veículo no portal do associado.
        Seu login é o seu <strong>CPF (somente números)</strong>. Esqueceu a senha? Use a opção
        &quot;Esqueci minha senha&quot; na tela de entrada.
      </Text>
      {/* Botoes Android/iPhone retirados (decisao de 02/11/2026): o app atual e do sistema anterior. */}
      <BotaoApp href={links.portalLoginUrl}>Acessar o portal</BotaoApp>
      <Text className="t-muted" style={{ margin: '12px 0 0', fontSize: 13, color: COR.neutro }}>
        Só precisa da segunda via?{' '}
        <Link href={links.portalFaturasUrl} className="lnk" style={{ color: '#0B6E93', fontWeight: 600 }}>
          Buscar minhas faturas
        </Link>
      </Text>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Fale com a gente + assinatura                                       */
/* ------------------------------------------------------------------ */

export function FaleConosco({ empresa, texto }: { empresa: Partial<Empresa>; texto: string }) {
  if (!empresa.whatsappUrl) return null;
  return (
    <Paragrafo style={{ marginTop: 18 }}>
      {texto}{' '}
      <Link href={empresa.whatsappUrl} className="lnk" style={{ color: '#0B6E93', fontWeight: 700 }}>
        {empresa.whatsappTexto ?? 'Fale com a gente pelo WhatsApp'}
      </Link>
    </Paragrafo>
  );
}

export const Assinatura = ({ frase = 'Obrigado por fazer parte da família Smart Car Brasil.' }: { frase?: string }) => (
  <Text
    className="t-title"
    style={{
      margin: '22px 0 24px',
      paddingTop: 18,
      borderTop: `1px solid ${COR.borda}`,
      fontFamily: FONTE.titulo,
      fontSize: 15,
      fontWeight: 700,
      color: COR.marinho,
    }}
  >
    {frase}
  </Text>
);


/* ------------------------------------------------------------------ */
/* Boas-vindas: planos, documentos e canais                            */
/* ------------------------------------------------------------------ */

export function ListaPlanos({ planos }: { planos: string[] }) {
  if (!planos.length) return null;
  return (
    <>
      <SubTitulo>Seus produtos contratados</SubTitulo>
      <Section
        className="bg-box bd-all"
        style={{
          backgroundColor: COR.caixa,
          border: `1px solid ${COR.borda}`,
          borderRadius: 12,
          padding: '14px 18px 4px',
        }}
      >
        {planos.map((p, i) => (
          <Row key={i} style={{ marginBottom: 10 }}>
            <Column style={{ width: 28, verticalAlign: 'top' }}>
              <Text style={{ margin: 0, fontSize: 16, lineHeight: '24px', color: COR.smart, fontWeight: 700 }}>✓</Text>
            </Column>
            <Column style={{ verticalAlign: 'top' }}>
              <Text
                className="t-title"
                style={{ margin: 0, fontSize: 15, lineHeight: '24px', fontWeight: 600, color: COR.marinho }}
              >
                {p}
              </Text>
            </Column>
          </Row>
        ))}
      </Section>
    </>
  );
}

export interface DocumentoLink {
  titulo: string;
  descricao: string;
  href: string;
}

export function LinksUteis({ docs }: { docs: DocumentoLink[] }) {
  return (
    <>
      <SubTitulo>Documentos importantes</SubTitulo>
      {docs.map((d, i) => (
        <Section
          key={i}
          className="line"
          style={{ border: `1px solid ${COR.borda}`, borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}
        >
          <Row>
            <Column style={{ verticalAlign: 'middle' }}>
              <Text
                className="t-title"
                style={{ margin: 0, fontFamily: FONTE.titulo, fontSize: 14, fontWeight: 700, color: COR.marinho }}
              >
                {d.titulo}
              </Text>
              <Text className="t-muted" style={{ margin: '2px 0 0', fontSize: 13, lineHeight: '19px', color: COR.neutro }}>
                {d.descricao}
              </Text>
            </Column>
            <Column style={{ width: 92, verticalAlign: 'middle', textAlign: 'right' }}>
              <Link
                href={d.href}
                className="lnk"
                style={{ color: '#0B6E93', fontFamily: FONTE.titulo, fontSize: 13, fontWeight: 700 }}
              >
                Abrir →
              </Link>
            </Column>
          </Row>
        </Section>
      ))}
    </>
  );
}

export function Contatos({ canais }: { canais: CanalAtendimento[] }) {
  if (!canais.length) return null;
  return (
    <>
      <SubTitulo>Contato comercial e assistência 24h</SubTitulo>
      <Section
        className="bg-box bd-all"
        style={{
          backgroundColor: COR.caixa,
          border: `1px solid ${COR.borda}`,
          borderRadius: 12,
          padding: '16px 18px 6px',
        }}
      >
        {canais.map((c, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <Text
              className="t-label"
              style={{
                margin: '0 0 1px',
                fontFamily: FONTE.titulo,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: COR.neutro,
              }}
            >
              {c.rotulo}
            </Text>
            <Text style={{ margin: 0, fontFamily: FONTE.titulo, fontSize: 19, lineHeight: '26px', fontWeight: 700 }}>
              <Link href={c.href} className="t-title" style={{ color: COR.marinho, textDecoration: 'none' }}>
                {c.numero}
              </Link>
            </Text>
            {c.detalhe && (
              <Text className="t-muted" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: COR.neutro }}>
                {c.detalhe}
              </Text>
            )}
          </div>
        ))}
      </Section>
    </>
  );
}
