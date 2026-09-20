'use client';

import { Select } from '@/components/ui/field';
import { useCores } from '@/hooks/use-cores';
import { corNormalizada, opcoesDeCor } from '@/lib/cores';

/**
 * O campo de COR das fichas (veiculo e fechamento da venda).
 *
 * Por que um seletor e nao um input livre: a cor do CRLV tem dezesseis valores
 * e so esses. Digitacao livre e o que produziu "PRATA", "Prata" e "prata
 * metalico" como tres cores diferentes — e com isso todo filtro e contagem por
 * cor passou a mentir.
 *
 * Duas regras que nao sao decoracao:
 *  - a cor JA GRAVADA que nao esta no catalogo continua na lista (`opcoesDeCor`).
 *    Sem isso, abrir uma ficha antiga mostraria o campo em branco e o primeiro
 *    "salvar" apagaria a cor em silencio — a mordida que a 0067 documentou nas
 *    unidades inativas.
 *  - o banco continua ACEITANDO cor desconhecida (a carga do Mutual e a consulta
 *    por placa escrevem por fora desta tela). Ela entra e vai para a fila de
 *    `Configuracoes -> Cores`. O seletor evita o erro de digitacao; ele nao e a
 *    trava, a trava e o trigger.
 */
export function CampoCor({
  value,
  onChange,
  id,
}: {
  value: string | null | undefined;
  onChange: (cor: string | null) => void;
  id?: string;
}) {
  const { data: cores } = useCores();
  const catalogo = cores ?? [];
  const opcoes = opcoesDeCor(catalogo, value);
  const atual = (value ?? '').trim();

  const escolhida = catalogo.find((c) => corNormalizada(c.nome) === corNormalizada(atual));

  return (
    <div className="flex items-center gap-2">
      {/* A amostra e para RECONHECER, nao para pintar: cor de veiculo nao tem
          hex exato. O contorno e sempre desenhado — sem ele o branco some no
          cartao claro e o preto some no tema escuro. */}
      <span
        aria-hidden
        className="h-6 w-6 shrink-0 rounded-full border border-slate-300"
        style={{ backgroundColor: escolhida?.hex ?? 'transparent' }}
      />
      <Select
        id={id}
        value={atual}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-w-0 flex-1"
      >
        <option value="">Nao informada</option>
        {opcoes.map((nome) => (
          <option key={nome} value={nome}>
            {nome}
            {!catalogo.some((c) => c.nome === nome) ? ' (fora do catalogo)' : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}
