import * as React from 'react';
import { Layout } from './components/Layout';
import {
  AppAcesso,
  Assinatura,
  Destaque,
  FaleConosco,
  FormasPagamento,
  Paragrafo,
  Resumo,
  Titulo,
} from './components/Blocos';
import { LINKS_PADRAO } from './config';
import { formatarData, formatarMoeda, pluralDias, primeiroNome } from './formatadores';
import type { AtrasoProps } from './tipos';

export const assunto = () => 'Sua contribuição está em aberto — Smart Car Brasil';

export default function Atraso(p: AtrasoProps) {
  const links = { ...LINKS_PADRAO, ...p.links };

  return (
    <Layout
      preview={`Não identificamos o pagamento que venceu em ${formatarData(p.vencimento)}. Regularize em instantes.`}
      rotulo="Contribuição em aberto"
      tom="atraso"
      logoUrl={links.logoUrl}
      empresa={p.empresa}
    >
      <Titulo>Identificamos uma contribuição em aberto</Titulo>
      <Paragrafo>
        Olá, <strong>{primeiroNome(p.nome)}</strong>. Ainda não identificamos o pagamento da contribuição
        que venceu em <strong>{formatarData(p.vencimento)}</strong> (há {pluralDias(p.diasAtraso)}). Você
        pode regularizar agora mesmo por uma das opções abaixo. Se tiver qualquer dificuldade, nossa
        equipe está pronta para ajudar.
      </Paragrafo>

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
        <Destaque icone="📡" titulo="Atenção ao rastreador" cor="#E11D48">
          {p.temRastreador === true ? (
            <>
              Como o seu veículo possui rastreador, o <strong>sinal do equipamento também é bloqueado
              automaticamente</strong> enquanto houver contribuição em aberto. Após a confirmação do
              pagamento, o sinal é normalizado.
            </>
          ) : (
            <>
              Caso o seu veículo possua rastreador, o <strong>sinal do equipamento também é bloqueado
              automaticamente</strong> enquanto houver contribuição em aberto. Após a confirmação do
              pagamento, o sinal é normalizado.
            </>
          )}
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
        texto="Quer conversar sobre o pagamento ou combinar uma solução?"
      />
      <Assinatura frase="Estamos juntos para manter o seu veículo protegido." />
    </Layout>
  );
}
