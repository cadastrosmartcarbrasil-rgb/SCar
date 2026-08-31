/**
 * Marca Smart Car Brasil para as paginas publicas.
 * Logo centralizada sobre fundo branco e a faixa navy logo abaixo — o mesmo
 * arranjo do site (www.smartcarbrasil.com.br).
 */
export function CabecalhoMarca({ subtitulo }: { subtitulo?: string }) {
  return (
    <header className="bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-smartcar.svg"
          alt="Smart Car Brasil - Protecao Veicular"
          className="h-14 w-auto"
        />
      </div>
      <div className="bg-brand-700">
        <p className="mx-auto max-w-5xl px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-white/90">
          {subtitulo ?? 'Protecao Veicular'}
        </p>
      </div>
    </header>
  );
}

/** Rodape institucional discreto. */
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
