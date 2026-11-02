import * as React from 'react';
import { Text } from '@react-email/components';
import { Layout } from './components/Layout';
import { Assinatura, FaleConosco, Paragrafo } from './components/Blocos';
import { COR, FONTE, LINKS_PADRAO } from './config';
import { primeiroNome } from './formatadores';
import type { AniversarioProps } from './tipos';

export const assunto = ({ nome }: Pick<AniversarioProps, 'nome'>) =>
  `Feliz aniversário, ${primeiroNome(nome)}! 🎉`;

/**
 * E-mail de RELACIONAMENTO (não é cobrança).
 * - Envie por fluxo/subdomínio separado do de cobrança (proteção de reputação).
 * - Sem valores, boletos ou links de pagamento.
 * - Exige link de descadastro e cabeçalho List-Unsubscribe no envio.
 */
export default function Aniversario(p: AniversarioProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const nome = primeiroNome(p.nome);

  return (
    <Layout
      preview={`${nome}, hoje o dia é seu! A família Smart Car Brasil deseja um feliz aniversário.`}
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
                Parabéns, {nome}!
              </Text>
            </td>
          </tr>
        </tbody>
      </table>

      <Paragrafo>
        Hoje o dia é seu, e a família <strong>Smart Car Brasil</strong> não poderia deixar de celebrar
        com você. Desejamos um aniversário cheio de alegria, saúde e boas estradas pela frente.
      </Paragrafo>
      <Paragrafo>
        Obrigado por confiar a proteção do seu veículo a nós. Cuidar de quem faz parte da nossa
        associação é o que nos move todos os dias.
      </Paragrafo>

      <FaleConosco empresa={{ ...p.empresa }} texto="Quer deixar um recado ou falar com a nossa equipe?" />
      <Assinatura frase="Um abraço de toda a equipe Smart Car Brasil. 💙" />
    </Layout>
  );
}
