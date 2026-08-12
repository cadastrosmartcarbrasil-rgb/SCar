// Parser da nomenclatura de cota de participacao (padrao SGA).
// Ex.: "ESPECIAL V10 PICKUPS/VANS/UTILITARIOS"
//   -> { especial:true, codigoCota:'V10', percentual:0.10, grupo:'PICKUPS/VANS/UTILITARIOS' }
// O numero apos "V" e o percentual da FIPE (V5=5%, V6=6%, V10=10%, V12=12%, V15=15%).

export const COTAS_PADRAO: Record<string, number> = {
  V5: 0.05,
  V6: 0.06,
  V10: 0.1,
  V12: 0.12,
  V15: 0.15,
};

export interface CategoriaSGA {
  especial: boolean;
  codigoCota: string | null; // 'V10' | null
  percentual: number | null; // 0.10 | null (null = usa a faixa padrao)
  grupo: string; // 'PICKUPS/VANS/UTILITARIOS'
}

export function parseCategoriaSGA(texto: string | null | undefined): CategoriaSGA {
  const bruto = (texto ?? '').trim();
  if (!bruto) return { especial: false, codigoCota: null, percentual: null, grupo: '' };
  // remove acentos + caixa alta
  const s = bruto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const especial = s.startsWith('ESPECIAL');
  const mV = s.match(/\bV\s*(\d+)\b/);
  const codigoCota = mV ? `V${mV[1]}` : null;
  const grupo = s
    .replace(/^ESPECIAL/, '')
    .replace(/\bV\s*\d+\b/g, '')
    .replace(/^[\s/-]+|[\s/-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    especial,
    codigoCota,
    percentual: codigoCota && codigoCota in COTAS_PADRAO ? COTAS_PADRAO[codigoCota] : null,
    grupo,
  };
}
