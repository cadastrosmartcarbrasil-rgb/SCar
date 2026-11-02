import * as React from 'react';
import { render } from '@react-email/render';
import LembreteVencimento, { assunto as assuntoLembrete } from './LembreteVencimento';
import VenceHoje, { assunto as assuntoHoje } from './VenceHoje';
import Atraso, { assunto as assuntoAtraso } from './Atraso';
import Aniversario, { assunto as assuntoAniversario } from './Aniversario';
import BoasVindas, { assunto as assuntoBoasVindas } from './BoasVindas';
import Comunicado, { assunto as assuntoComunicado } from './Comunicado';
import RecuperarSenha, { assunto as assuntoRecuperarSenha } from './RecuperarSenha';
import type {
  AniversarioProps,
  AtrasoProps,
  BoasVindasProps,
  ComunicadoProps,
  LembreteVencimentoProps,
  RecuperarSenhaProps,
  VenceHojeProps,
} from './tipos';

export * from './tipos';
export { COR, EMPRESA_PADRAO, LINKS_PADRAO } from './config';
export { formatarData, formatarMoeda, primeiroNome } from './formatadores';

export interface EmailRenderizado {
  assunto: string;
  html: string;
  texto: string;
}

async function montar(el: React.ReactElement, assunto: string): Promise<EmailRenderizado> {
  const [html, texto] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { assunto, html, texto };
}

/**
 * Códigos alinhados à tabela `email_regua` do spec:
 *  aviso_d_menos_5 / aviso_d_menos_1 -> lembrete
 *  vencimento_d0                     -> vence_hoje
 *  atraso_d_mais_3 / _7 / _15        -> atraso
 *  adesao_concluida                  -> boas_vindas (serviço/adesão)
 *  aniversario                       -> aniversario (fluxo de relacionamento)
 */
export const emails = {
  lembrete: (p: LembreteVencimentoProps) =>
    montar(React.createElement(LembreteVencimento, p), assuntoLembrete(p)),
  venceHoje: (p: VenceHojeProps) => montar(React.createElement(VenceHoje, p), assuntoHoje(p)),
  atraso: (p: AtrasoProps) => montar(React.createElement(Atraso, p), assuntoAtraso(p)),
  boasVindas: (p: BoasVindasProps) =>
    montar(React.createElement(BoasVindas, p), assuntoBoasVindas(p)),
  aniversario: (p: AniversarioProps) =>
    montar(React.createElement(Aniversario, p), assuntoAniversario(p)),
  comunicado: (p: ComunicadoProps) => montar(React.createElement(Comunicado, p), assuntoComunicado(p)),
  recuperarSenha: (p: RecuperarSenhaProps) =>
    montar(React.createElement(RecuperarSenha, p), assuntoRecuperarSenha(p)),
};
