import * as React from 'react';
import { Layout } from './components/Layout';
import { AppAcesso, Assinatura, FaleConosco, FormasPagamento, Paragrafo, Resumo, Titulo } from './components/Blocos';
import { COR, LINKS_PADRAO } from './config';
import { formatarData, formatarMoeda, pluralDias, primeiroNome } from './formatadores';
import type { LembreteVencimentoProps } from './tipos';

export const assunto = ({ diasParaVencer }: Pick<LembreteVencimentoProps, 'diasParaVencer'>) =>
  diasParaVencer === 1
    ? 'Lembrete: sua contribuição vence amanhã'
    : `Lembrete: sua contribuição vence em ${pluralDias(diasParaVencer)}`;

export default function LembreteVencimento(p: LembreteVencimentoProps) {
  const links = { ...LINKS_PADRAO, ...p.links };
  const titulo =
    p.diasParaVencer === 1 ? 'Sua contribuição vence amanhã' : `Sua contribuição vence em ${pluralDias(p.diasParaVencer)}`;

  return (
    <Layout
      preview={`${titulo} — ${formatarMoeda(p.valor)} em ${formatarData(p.vencimento)}. Veja como pagar.`}
      rotulo="Lembrete de vencimento"
      tom="info"
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <Titulo>{titulo}</Titulo>
      <Paragrafo>
        Olá, <strong>{primeiroNome(p.nome)}</strong>! Passando para lembrar que a contribuição da proteção
        do seu veículo está chegando ao vencimento. Para manter tudo em dia, é só escolher uma das
        formas de pagamento abaixo.
      </Paragrafo>

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
      <FaleConosco empresa={{ ...p.empresa }} texto="Alguma dúvida sobre o seu boleto?" />
      <Assinatura />
    </Layout>
  );
}
