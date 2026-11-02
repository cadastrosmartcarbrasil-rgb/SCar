import * as React from 'react';
import { paragrafosRicos, type Trecho } from '../../modelos';
import { Paragrafo } from './Blocos';

/** Um paragrafo com os trechos em **negrito** (texto editado na tela, escapado pelo React). */
export function Trechos({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) => (t.negrito ? <strong key={i}>{t.texto}</strong> : <React.Fragment key={i}>{t.texto}</React.Fragment>))}
    </>
  );
}

/** Texto inline (sem quebra em paragrafos): os paragrafos viram um so, separados por espaco. */
export function TextoRico({ texto }: { texto: string }) {
  return <Trechos trechos={paragrafosRicos(texto).flatMap((par, i) => (i ? [{ texto: ' ', negrito: false }, ...par] : par))} />;
}

/** Cada paragrafo do texto (linha em branco separa) vira um <Paragrafo>. */
export function ParagrafosRicos({ texto, style }: { texto: string; style?: React.CSSProperties }) {
  return (
    <>
      {paragrafosRicos(texto).map((par, i) => (
        <Paragrafo key={i} style={style}>
          <Trechos trechos={par} />
        </Paragrafo>
      ))}
    </>
  );
}
