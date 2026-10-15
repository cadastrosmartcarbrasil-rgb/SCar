'use client';

import { useEffect, useState } from 'react';

/** O valor so muda depois de `ms` sem digitacao — a busca no banco nao dispara a cada tecla. */
export function useAdiado<T>(valor: T, ms = 300): T {
  const [adiado, setAdiado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAdiado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return adiado;
}
