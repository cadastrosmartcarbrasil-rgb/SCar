import * as React from 'react';
import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import { COR, FONTE, EMPRESA_PADRAO, LINKS_PADRAO, type Empresa } from '../config';

export type Tom = 'info' | 'hoje' | 'atraso' | 'festa';

const TONS: Record<Tom, { bg: string; fg: string; barra: string }> = {
  info: { bg: '#E0F4FC', fg: '#0B6E93', barra: COR.smart },
  hoje: { bg: '#FEF3C7', fg: '#92400E', barra: '#F59E0B' },
  atraso: { bg: '#FFE4E6', fg: '#9F1239', barra: '#E11D48' },
  festa: { bg: '#E0F4FC', fg: '#0B6E93', barra: COR.smart },
};

export const tomDe = (t: Tom) => TONS[t];

const CSS = `
  @media (max-width: 480px) {
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .h1 { font-size: 24px !important; line-height: 30px !important; }
    .stack { display: block !important; width: 100% !important; }
    .stack-gap { padding-top: 12px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg-page { background-color: #0A1222 !important; }
    .bg-card { background-color: #111D36 !important; }
    .bg-box { background-color: #1A2848 !important; }
    .bd-box { border-top-color: #2B3C63 !important; border-right-color: #2B3C63 !important; border-bottom-color: #2B3C63 !important; }
    .bd-all { border-color: #2B3C63 !important; }
    .passo { background-color: #0BACE2 !important; color: #0B1730 !important; }
    .lnk { color: #6AD3F5 !important; }
    .t-title { color: #FFFFFF !important; }
    .t-body { color: #D5DCEA !important; }
    .t-muted { color: #9AA6BE !important; }
    .t-label { color: #9AA6BE !important; }
    .line { border-color: #2B3C63 !important; }
    .btn-outline { color: #FFFFFF !important; border-color: #6AA9DE !important; }
    .btn-solid { background-color: #0BACE2 !important; color: #0B1730 !important; }
  }
`;

interface LayoutProps {
  preview: string;
  rotulo: string;
  tom: Tom;
  /** 'cobranca' = e-mail transacional; 'relacionamento' = exige descadastro. */
  rodape?: 'cobranca' | 'servico' | 'relacionamento';
  logoUrl?: string;
  empresa?: Partial<Empresa>;
  linkDescadastro?: string;
  children: React.ReactNode;
}

export function Layout({
  preview,
  rotulo,
  tom,
  rodape = 'cobranca',
  logoUrl = LINKS_PADRAO.logoUrl,
  empresa,
  linkDescadastro,
  children,
}: LayoutProps) {
  const e: Empresa = { ...EMPRESA_PADRAO, ...empresa };
  const t = TONS[tom];

  return (
    <Html lang="pt-BR">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{CSS}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        className="bg-page"
        style={{ margin: 0, padding: 0, backgroundColor: COR.fundo, fontFamily: FONTE.texto }}
      >
        <Container style={{ width: '100%', maxWidth: 600, margin: '0 auto', padding: '24px 12px' }}>
          {/* Cabeçalho marinho com a logo negativa (legível em claro e escuro) */}
          <Section
            style={{
              backgroundColor: COR.marinho,
              borderRadius: '16px 16px 0 0',
              padding: '28px 32px 24px',
              textAlign: 'center',
            }}
            className="px"
          >
            <Img
              src={logoUrl}
              width="190"
              alt="Smart Car Brasil — Proteção Veicular"
              style={{ display: 'block', margin: '0 auto', border: 0, height: 'auto' }}
            />
          </Section>
          <Section style={{ backgroundColor: t.barra, height: 4, lineHeight: '4px', fontSize: 0 }}>
            &nbsp;
          </Section>

          {/* Cartão de conteúdo */}
          <Section
            className="bg-card px"
            style={{
              backgroundColor: COR.cartao,
              padding: '32px 32px 8px',
              borderRadius: '0 0 16px 16px',
            }}
          >
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                <tr>
                  <td
                    style={{
                      backgroundColor: t.bg,
                      color: t.fg,
                      fontFamily: FONTE.titulo,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '1.4px',
                      textTransform: 'uppercase',
                      padding: '6px 12px',
                      borderRadius: 999,
                    }}
                  >
                    {rotulo}
                  </td>
                </tr>
              </tbody>
            </table>
            {children}
          </Section>

          {/* Rodapé */}
          <Section style={{ padding: '24px 20px 8px', textAlign: 'center' }}>
            <Text
              className="t-muted"
              style={{ margin: '0 0 6px', fontSize: 12, lineHeight: '18px', color: COR.neutro }}
            >
              <strong>{e.razaoSocial}</strong>
              {e.cnpj ? <> · CNPJ {e.cnpj}</> : null}
            </Text>
            {(e.telefone || e.emailAtendimento) && (
              <Text
                className="t-muted"
                style={{ margin: '0 0 6px', fontSize: 12, lineHeight: '18px', color: COR.neutro }}
              >
                Atendimento:{' '}
                {e.telefone}
                {e.telefone && e.emailAtendimento ? ' · ' : ''}
                {e.emailAtendimento ? (
                  <Link href={`mailto:${e.emailAtendimento}`} style={{ color: COR.neutro }}>
                    {e.emailAtendimento}
                  </Link>
                ) : null}
              </Text>
            )}
            {rodape === 'servico' ? (
              <Text
                className="t-muted"
                style={{ margin: 0, fontSize: 11, lineHeight: '17px', color: COR.neutro }}
              >
                Esta é uma mensagem automática sobre a sua adesão à Smart Car Brasil. Para falar com a
                nossa equipe, use os canais de atendimento indicados neste e-mail.
              </Text>
            ) : rodape === 'cobranca' ? (
              <Text
                className="t-muted"
                style={{ margin: 0, fontSize: 11, lineHeight: '17px', color: COR.neutro }}
              >
                Este é um aviso automático sobre a sua adesão à Smart Car Brasil. Se você já efetuou
                o pagamento, desconsidere esta mensagem.
              </Text>
            ) : (
              <Text
                className="t-muted"
                style={{ margin: 0, fontSize: 11, lineHeight: '17px', color: COR.neutro }}
              >
                Você recebe esta mensagem por ser associado(a) da Smart Car Brasil.{' '}
                {linkDescadastro ? (
                  <>
                    Não quer receber mensagens de relacionamento?{' '}
                    <Link href={linkDescadastro} style={{ color: COR.neutro, textDecoration: 'underline' }}>
                      Cancelar o recebimento
                    </Link>
                    . Avisos de cobrança e de serviço continuam sendo enviados.
                  </>
                ) : null}
              </Text>
            )}
          </Section>
          <Row>
            <Column style={{ height: 16 }} />
          </Row>
        </Container>
      </Body>
    </Html>
  );
}
