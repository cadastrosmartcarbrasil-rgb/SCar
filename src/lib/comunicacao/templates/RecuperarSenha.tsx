import * as React from 'react';
import { Button } from '@react-email/components';
import { Layout } from './components/Layout';
import { Assinatura, Titulo } from './components/Blocos';
import { COR, FONTE, LINKS_PADRAO } from './config';
import { primeiroNome } from './formatadores';
import { aplicarCampos, textosEfetivos } from '../modelos';
import { ParagrafosRicos } from './components/Texto';
import type { RecuperarSenhaProps } from './tipos';

function textos(p: RecuperarSenhaProps) {
  const t = textosEfetivos('recuperar_senha', p.textos);
  const v = { nome: primeiroNome(p.nome ?? ''), validade: `${p.validadeMinutos ?? 60} minutos` };
  return (k: string) => aplicarCampos(t[k] ?? '', v);
}

export const assunto = (p: RecuperarSenhaProps) => textos(p)('assunto');

/** E-mail de servico: o link de uso unico para o associado criar uma nova senha do portal. */
export default function RecuperarSenha(p: RecuperarSenhaProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const t = textos(p);
  return (
    <Layout
      preview={t('previa')}
      rotulo="Acesso ao portal"
      tom="info"
      rodape="servico"
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <Titulo>{t('titulo')}</Titulo>
      <ParagrafosRicos texto={t('corpo')} />
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
      <ParagrafosRicos texto={t('aviso')} style={{ marginTop: 18, fontSize: 14, lineHeight: '22px' }} />
      <ParagrafosRicos texto={t('ignorar')} style={{ fontSize: 14, lineHeight: '22px' }} />
      <Assinatura frase={t('assinatura')} />
    </Layout>
  );
}
