import * as React from 'react';
import { Layout } from './components/Layout';
import { AppAcesso, Assinatura, FaleConosco, FormasPagamento, Resumo, Titulo } from './components/Blocos';
import { LINKS_PADRAO } from './config';
import { formatarData, formatarMoeda, primeiroNome } from './formatadores';
import { aplicarCampos, textosEfetivos } from '../modelos';
import { ParagrafosRicos } from './components/Texto';
import type { VenceHojeProps } from './tipos';

function textos(p: VenceHojeProps) {
  const t = textosEfetivos('vence_hoje', p.textos);
  const v = {
    nome: primeiroNome(p.nome ?? ''),
    valor: formatarMoeda(p.valor),
    vencimento: formatarData(p.vencimento),
    veiculo: p.veiculo ?? '',
  };
  return (k: string) => aplicarCampos(t[k] ?? '', v);
}

export const assunto = (p: VenceHojeProps) => textos(p)('assunto');

export default function VenceHoje(p: VenceHojeProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const t = textos(p);

  return (
    <Layout
      preview={t('previa')}
      rotulo="Vence hoje"
      tom="hoje"
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <Titulo>{t('titulo')}</Titulo>
      <ParagrafosRicos texto={t('corpo')} />

      <Resumo
        barra="#F59E0B"
        itens={[
          { rotulo: 'Valor', valor: formatarMoeda(p.valor), grande: true },
          { rotulo: 'Vencimento', valor: `Hoje, ${formatarData(p.vencimento)}`, grande: true },
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
