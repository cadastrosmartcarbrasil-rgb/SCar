import * as React from 'react';
import { Button } from '@react-email/components';
import { Layout } from './components/Layout';
import { Assinatura, FaleConosco, Titulo } from './components/Blocos';
import { COR, FONTE, LINKS_PADRAO } from './config';
import { primeiroNome } from './formatadores';
import { aplicarCampos } from '../modelos';
import { ParagrafosRicos } from './components/Texto';
import type { ComunicadoProps } from './tipos';

function textos(p: ComunicadoProps) {
  const v = { nome: primeiroNome(p.nome ?? '') };
  return (s: string | null | undefined) => aplicarCampos(s ?? '', v);
}

export const assunto = (p: ComunicadoProps) => textos(p)(p.assunto);

/**
 * Comunicado escrito na tela (0171). INFORMATIVO = rodape de relacionamento com o link de
 * descadastro; SERVICO = rodape de servico. Sem valores nem boleto.
 */
export default function Comunicado(p: ComunicadoProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const t = textos(p);
  const informativo = p.finalidade === 'INFORMATIVO';
  return (
    <Layout
      preview={t(p.previa) || t(p.titulo)}
      rotulo={informativo ? 'Comunicado' : 'Aviso importante'}
      tom="info"
      rodape={informativo ? 'relacionamento' : 'servico'}
      linkDescadastro={informativo ? p.linkDescadastro : undefined}
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <Titulo>{t(p.titulo)}</Titulo>
      <ParagrafosRicos texto={t(p.corpo)} />
      {p.botaoTexto && p.botaoUrl && (
        <Button
          href={p.botaoUrl}
          className="btn-solid"
          style={{
            backgroundColor: COR.marinho, color: '#FFFFFF', fontFamily: FONTE.titulo, fontSize: 14,
            fontWeight: 700, padding: '12px 22px', borderRadius: 8, textDecoration: 'none', display: 'inline-block',
          }}
        >
          {t(p.botaoTexto)}
        </Button>
      )}
      <FaleConosco empresa={{ ...p.empresa }} texto="Ficou com alguma dúvida?" />
      <Assinatura frase="Atenciosamente, equipe Smart Car Brasil." />
    </Layout>
  );
}
