import * as React from 'react';
import { Layout } from './components/Layout';
import { AppAcesso, Assinatura, FaleConosco, FormasPagamento, Resumo, Titulo } from './components/Blocos';
import { COR, LINKS_PADRAO } from './config';
import { formatarData, formatarMoeda, pluralDias, primeiroNome } from './formatadores';
import { aplicarCampos, textosEfetivos } from '../modelos';
import { ParagrafosRicos } from './components/Texto';
import type { LembreteVencimentoProps } from './tipos';

function textos(p: LembreteVencimentoProps) {
  const t = textosEfetivos('lembrete', p.textos);
  const v = {
    nome: primeiroNome(p.nome ?? ''),
    valor: formatarMoeda(p.valor),
    vencimento: formatarData(p.vencimento),
    veiculo: p.veiculo ?? '',
    quando: p.diasParaVencer === 1 ? 'amanhã' : `em ${pluralDias(p.diasParaVencer)}`,
  };
  return (k: string) => aplicarCampos(t[k] ?? '', v);
}

export const assunto = (p: LembreteVencimentoProps) => textos(p)('assunto');

export default function LembreteVencimento(p: LembreteVencimentoProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const t = textos(p);

  return (
    <Layout
      preview={t('previa')}
      rotulo="Lembrete de vencimento"
      tom="info"
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <Titulo>{t('titulo')}</Titulo>
      <ParagrafosRicos texto={t('corpo')} />

      <Resumo
        barra={COR.smart}
        itens={[
          { rotulo: 'Valor', valor: formatarMoeda(p.valor), grande: true },
          { rotulo: 'Vencimento', valor: formatarData(p.vencimento), grande: true },
          ...(p.veiculo ? [{ rotulo: 'Veículo', valor: p.veiculo }] : []),
        ]}
      />

      <FormasPagamento pagamento={p.pagamento} />
      <AppAcesso links={links} />
      <FaleConosco empresa={{ ...p.empresa }} texto={t('ajuda')} />
      <Assinatura frase={t('assinatura')} />
    </Layout>
  );
}
