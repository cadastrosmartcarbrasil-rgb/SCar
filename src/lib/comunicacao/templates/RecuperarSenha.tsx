import * as React from 'react';
import { Button } from '@react-email/components';
import { Layout } from './components/Layout';
import { Assinatura, Paragrafo, Titulo } from './components/Blocos';
import { COR, FONTE, LINKS_PADRAO } from './config';
import { primeiroNome } from './formatadores';
import type { RecuperarSenhaProps } from './tipos';

export const assunto = () => 'Crie uma nova senha do portal — Smart Car Brasil';

/** E-mail de servico: o link de uso unico para o associado criar uma nova senha do portal. */
export default function RecuperarSenha(p: RecuperarSenhaProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  return (
    <Layout
      preview="Use o botão para criar uma nova senha do portal do associado."
      rotulo="Acesso ao portal"
      tom="info"
      rodape="servico"
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <Titulo>Crie uma nova senha</Titulo>
      <Paragrafo>
        Olá, <strong>{primeiroNome(p.nome)}</strong>. Recebemos um pedido para criar uma nova senha do
        portal do associado. Toque no botão abaixo e escolha a sua senha.
      </Paragrafo>
      <Button
        href={p.link}
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
        Criar nova senha
      </Button>
      <Paragrafo style={{ marginTop: 18, fontSize: 14, lineHeight: '22px' }}>
        O link vale por {p.validadeMinutos ?? 60} minutos e só pode ser usado uma vez. Seu login continua
        sendo o seu <strong>CPF/CNPJ (somente números)</strong>.
      </Paragrafo>
      <Paragrafo style={{ fontSize: 14, lineHeight: '22px' }}>
        Não foi você que pediu? Pode ignorar este e-mail: a sua senha atual continua valendo.
      </Paragrafo>
      <Assinatura frase="Atenciosamente, equipe Smart Car Brasil." />
    </Layout>
  );
}
