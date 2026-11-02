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
import { aplicarCampos, textosEfetivos } from '../modelos';
import { ParagrafosRicos } from './components/Texto';
import type { BoasVindasProps } from './tipos';

function textos(p: BoasVindasProps) {
  const t = textosEfetivos('boas_vindas', p.textos);
  const v = { nome: primeiroNome(p.nome ?? ''), modelo: p.modelo ?? '', placa: (p.placa ?? '').toUpperCase() };
  return (k: string) => aplicarCampos(t[k] ?? '', v);
}

export const assunto = (p: BoasVindasProps) => textos(p)('assunto');

/** E-mail de adesão concluída: não leva valores nem links de pagamento. */
export default function BoasVindas(p: BoasVindasProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const empresa = { ...EMPRESA_PADRAO, ...p.empresa };
  const t = textos(p);

  return (
    <Layout
      preview={t('previa')}
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
                {t('titulo')}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>

      <ParagrafosRicos texto={t('corpo')} />

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
      <ParagrafosRicos texto={t('final')} style={{ marginTop: 14, fontSize: 14, lineHeight: '22px' }} />

      <Assinatura frase={t('assinatura')} />
    </Layout>
  );
}
