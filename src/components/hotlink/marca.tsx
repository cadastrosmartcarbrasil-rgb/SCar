/**
 * Marca Smart Car Brasil para paginas publicas e portais.
 *
 * A logo OFICIAL e a cadastrada em Configuracoes -> Empresa (`empresa.logo_url`).
 * O SVG em `public/logo-smartcar.svg` e so o fallback de quando ainda nao ha
 * arquivo cadastrado — assim a marca se atualiza em todo o sistema de um lugar
 * so, sem passar por deploy.
 */
export function LogoSmartCar({
  url,
  className,
  alt = 'Smart Car Brasil - Protecao Veicular',
  placaNoEscuro = true,
}: {
  url?: string | null;
  className?: string;
  alt?: string;
  /**
   * A tinta da marca e ESCURA (navy). No tema escuro ela desapareceria contra
   * o fundo, entao a logo ganha uma placa clara — o mesmo tratamento que ela
   * ja recebe na cabine. Vale tambem para a logo do cliente (`logo_url`), de
   * quem nao sabemos a cor: placa clara e a aposta segura.
   * Desligue (`false`) quando ela JA estiver dentro de uma placa.
   */
  placaNoEscuro?: boolean;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url || '/logo-smartcar.svg'}
      alt={alt}
      className={[className, placaNoEscuro ? 'dark:rounded-lg dark:bg-white dark:p-2' : '']
        .filter(Boolean)
        .join(' ')}
    />
  );
}

/**
 * Cabecalho das paginas publicas: logo centralizada no branco e a faixa navy
 * logo abaixo — o mesmo arranjo do site.
 */
export function CabecalhoMarca({ logoUrl, subtitulo }: {
  logoUrl?: string | null;
  subtitulo?: string;
}) {
  return (
    <header className="bg-superficie">
      <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-5">
        <LogoSmartCar url={logoUrl} className="h-16 w-auto object-contain sm:h-20" />
      </div>
      <div className="bg-faixa">
        <p className="mx-auto max-w-5xl px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
          {subtitulo ?? 'Protecao Veicular'}
        </p>
      </div>
    </header>
  );
}

/**
 * A logo tem tinta escura: sobre o navy dos portais ela vai numa placa branca,
 * mesmo tratamento da sidebar do sistema de gestao.
 */
export function LogoNaCabine({ url }: { url?: string | null }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.35)]">
      {/* ja esta na placa branca acima — nao precisa de outra no tema escuro */}
      <LogoSmartCar url={url} placaNoEscuro={false} className="mx-auto max-h-14 w-auto object-contain" />
    </div>
  );
}

export function RodapeMarca() {
  return (
    <footer className="mt-10 bg-brand-800 py-6 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
        Smart Car Brasil
      </p>
      <p className="mt-1 text-[11px] text-white/50">
        Associacao de protecao veicular · smartcarbrasil.com.br
      </p>
    </footer>
  );
}
