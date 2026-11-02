import * as React from 'react';
import { Layout } from './components/Layout';
import { AppAcesso, Assinatura, FaleConosco, FormasPagamento, Paragrafo, Resumo, Titulo } from './components/Blocos';
import { LINKS_PADRAO } from './config';
import { formatarData, formatarMoeda, primeiroNome } from './formatadores';
import type { VenceHojeProps } from './tipos';

export const assunto = () => 'Sua contribuição vence hoje — Smart Car Brasil';

export default function VenceHoje(p: VenceHojeProps) {
  const links = { ...LINKS_PADRAO, ...p.links };

  return (
    <Layout
      preview={`Hoje é o dia do vencimento: ${formatarMoeda(p.valor)}. Pague em instantes pelo Pix, boleto ou cartão.`}
      rotulo="Vence hoje"
      tom="hoje"
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <Titulo>Sua contribuição vence hoje</Titulo>
      <Paragrafo>
        Olá, <strong>{primeiroNome(p.nome)}</strong>! Hoje é o dia do vencimento da contribuição da proteção
        do seu veículo. Pagando pelo Pix, a confirmação costuma ser imediata — mas você pode escolher
        a forma que for melhor para você.
      </Paragrafo>

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
      <FaleConosco empresa={{ ...p.empresa }} texto="Precisa de ajuda para pagar?" />
      <Assinatura />
    </Layout>
  );
}
