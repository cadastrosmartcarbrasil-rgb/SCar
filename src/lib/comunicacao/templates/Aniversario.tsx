import * as React from 'react';
import { Text } from '@react-email/components';
import { Layout } from './components/Layout';
import { Assinatura, FaleConosco } from './components/Blocos';
import { COR, FONTE, LINKS_PADRAO } from './config';
import { primeiroNome } from './formatadores';
import { aplicarCampos, textosEfetivos } from '../modelos';
import { ParagrafosRicos } from './components/Texto';
import type { AniversarioProps } from './tipos';

function textos(p: AniversarioProps) {
  const t = textosEfetivos('aniversario', p.textos);
  const v = { nome: primeiroNome(p.nome ?? '') };
  return (k: string) => aplicarCampos(t[k] ?? '', v);
}

export const assunto = (p: AniversarioProps) => textos(p)('assunto');

/**
 * E-mail de RELACIONAMENTO (não é cobrança).
 * - Envie por fluxo/subdomínio separado do de cobrança (proteção de reputação).
 * - Sem valores, boletos ou links de pagamento.
 * - Exige link de descadastro e cabeçalho List-Unsubscribe no envio.
 */
export default function Aniversario(p: AniversarioProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const t = textos(p);

  return (
    <Layout
      preview={t('previa')}
      rotulo="Feliz aniversário"
      tom="festa"
      rodape="relacionamento"
      linkDescadastro={p.linkDescadastro}
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      {/* Faixa de comemoração */}
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ margin: '18px 0 18px' }}>
        <tbody>
          <tr>
            <td
              align="center"
              style={{ backgroundColor: COR.smart, borderRadius: 14, padding: '30px 20px 28px' }}
            >
              <Text style={{ margin: '0 0 6px', fontSize: 34, lineHeight: '40px' }}>🎉 🎂 🎈</Text>
              <Text
                className="h1"
                style={{
                  margin: 0,
                  fontFamily: FONTE.titulo,
                  fontSize: 30,
                  lineHeight: '36px',
                  fontWeight: 800,
                  color: COR.marinho,
                }}
              >
                {t('titulo')}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>

      <ParagrafosRicos texto={t('corpo')} />

      <FaleConosco empresa={{ ...p.empresa }} texto={t('ajuda')} />
      <Assinatura frase={t('assinatura')} />
    </Layout>
  );
}
