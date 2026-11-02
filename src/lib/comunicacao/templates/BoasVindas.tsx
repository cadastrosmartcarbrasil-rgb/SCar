import * as React from 'react';
import { Button, Text } from '@react-email/components';
import { Layout } from './components/Layout';
import {
  AppAcesso,
  Assinatura,
  Contatos,
  Destaque,
  LinksUteis,
  ListaPlanos,
  Paragrafo,
  Resumo,
  SubTitulo,
  Titulo,
} from './components/Blocos';
import { COR, EMPRESA_PADRAO, FONTE, LINKS_PADRAO } from './config';
import { primeiroNome } from './formatadores';
import type { BoasVindasProps } from './tipos';

export const assunto = ({ nome }: Pick<BoasVindasProps, 'nome'>) =>
  `Bem-vindo(a) à Smart Car Brasil, ${primeiroNome(nome)}!`;

/** E-mail de adesão concluída: não leva valores nem links de pagamento. */
export default function BoasVindas(p: BoasVindasProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const empresa = { ...EMPRESA_PADRAO, ...p.empresa };
  const nome = primeiroNome(p.nome);

  return (
    <Layout
      preview={`${nome}, seu veículo ${p.modelo} já está protegido. Veja seus produtos, documentos e como acessar o portal.`}
      rotulo="Boas-vindas"
      tom="festa"
      rodape="servico"
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ margin: '18px 0 18px' }}>
        <tbody>
          <tr>
            <td align="center" style={{ backgroundColor: COR.smart, borderRadius: 14, padding: '28px 20px 26px' }}>
              <Text style={{ margin: '0 0 6px', fontSize: 32, lineHeight: '38px' }}>🚗 🎉</Text>
              <Text
                className="h1"
                style={{
                  margin: 0,
                  fontFamily: FONTE.titulo,
                  fontSize: 28,
                  lineHeight: '34px',
                  fontWeight: 800,
                  color: COR.marinho,
                }}
              >
                Bem-vindo(a), {nome}!
              </Text>
            </td>
          </tr>
        </tbody>
      </table>

      <Paragrafo>
        A <strong>Smart Car Brasil</strong> tem o prazer de receber você e o parabeniza pela decisão de fazer
        parte da nossa proteção veicular. A partir de agora, o seu veículo já está usufruindo dos nossos serviços
        de proteção.
      </Paragrafo>

      <Resumo
        barra={COR.smart}
        itens={[
          { rotulo: 'Modelo', valor: p.modelo },
          { rotulo: 'Placa', valor: p.placa.toUpperCase(), mono: true },
        ]}
      />

      <ListaPlanos planos={p.planos} />

      {(p.documentosEnviados ?? true) && (
        <Destaque icone="📬" titulo="Confira também o seu e-mail">
          Enviamos os documentos da sua adesão para este endereço. Se não os encontrar na caixa de entrada,
          verifique o lixo eletrônico (spam).
        </Destaque>
      )}

      <LinksUteis
        docs={[
          {
            titulo: 'Manual da Assistência 24 horas',
            descricao: 'Como acionar a assistência e os serviços, passo a passo.',
            href: links.manualAssistenciaUrl,
          },
          {
            titulo: 'Regimento interno (PSM)',
            descricao: 'Regras e direitos do associado Smart Car Brasil.',
            href: links.regimentoUrl,
          },
          {
            titulo: 'Termo de rastreadores',
            descricao: 'Regras do equipamento de rastreamento.',
            href: links.rastreadoresUrl,
          },
        ]}
      />

      <SubTitulo>Seu primeiro acesso</SubTitulo>
      <Paragrafo style={{ marginBottom: 12 }}>
        Acompanhe seu plano, boletos e dados do veículo no portal do associado. Seu login é o seu{' '}
        <strong>CPF/CNPJ (somente números)</strong>.{' '}
        {p.linkDefinirSenha
          ? 'Para sua segurança, você mesmo cria a sua senha pelo botão abaixo.'
          : 'No primeiro acesso, use a opção "Esqueci minha senha" na tela de entrada para criar a sua senha.'}
      </Paragrafo>
      {p.linkDefinirSenha && (
        <Button
          href={p.linkDefinirSenha}
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
          Criar minha senha
        </Button>
      )}
      <AppAcesso links={links} />

      <Contatos canais={empresa.canais ?? []} />
      <Paragrafo style={{ marginTop: 14, fontSize: 14, lineHeight: '22px' }}>
        Qualquer dúvida, é só chamar a nossa assistente virtual Smart Car.
      </Paragrafo>

      <Assinatura frase="Atenciosamente, equipe Smart Car Brasil." />
    </Layout>
  );
}
