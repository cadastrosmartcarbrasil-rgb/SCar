import * as React from 'react';
import { Layout } from './components/Layout';
import {
  AppAcesso,
  Assinatura,
  Destaque,
  FaleConosco,
  FormasPagamento,
  Resumo,
  Titulo,
} from './components/Blocos';
import { LINKS_PADRAO } from './config';
import { formatarData, formatarMoeda, pluralDias, primeiroNome } from './formatadores';
import { aplicarCampos, textosEfetivos } from '../modelos';
import { ParagrafosRicos, TextoRico } from './components/Texto';
import type { AtrasoProps } from './tipos';

function textos(p: AtrasoProps) {
  const t = textosEfetivos('atraso', p.textos);
  const v = {
    nome: primeiroNome(p.nome ?? ''),
    valor: formatarMoeda(p.valor),
    vencimento: formatarData(p.vencimento),
    veiculo: p.veiculo ?? '',
    dias: pluralDias(p.diasAtraso),
  };
  return (k: string) => aplicarCampos(t[k] ?? '', v);
}

export const assunto = (p: AtrasoProps) => textos(p)('assunto');

export default function Atraso(p: AtrasoProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const t = textos(p);

  return (
    <Layout
      preview={t('previa')}
      rotulo="Contribuição em aberto"
      tom="atraso"
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <Titulo>{t('titulo')}</Titulo>
      <ParagrafosRicos texto={t('corpo')} />

      <Resumo
        barra="#E11D48"
        itens={[
          { rotulo: 'Valor', valor: formatarMoeda(p.valor), grande: true },
          { rotulo: 'Venceu em', valor: formatarData(p.vencimento), grande: true },
          { rotulo: 'Em atraso', valor: pluralDias(p.diasAtraso) },
          ...(p.veiculo ? [{ rotulo: 'Veículo', valor: p.veiculo }] : []),
        ]}
      />

      {p.temRastreador !== false && (
        <Destaque icone="📡" titulo={t('rastreador_titulo')} cor="#E11D48">
          <TextoRico texto={t(p.temRastreador === true ? 'rastreador_com' : 'rastreador_sem')} />
        </Destaque>
      )}

      {p.textoContratual && (
        <Destaque icone="📄" titulo="Conforme o seu contrato de adesão">
          {p.textoContratual}
        </Destaque>
      )}

      <FormasPagamento pagamento={p.pagamento} />
      <AppAcesso links={links} />
      <FaleConosco
        empresa={{ ...p.empresa }}
        texto={t('ajuda')}
      />
      <Assinatura frase={t('assinatura')} />
    </Layout>
  );
}
