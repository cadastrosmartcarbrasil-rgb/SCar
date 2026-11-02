import { LogoSmartCar } from '@/components/hotlink/marca';

/** Moldura das telas de acesso do portal (mesmo visual do login): logo, faixa e cartao. */
export function MolduraAcesso({
  logoUrl, titulo, subtitulo, children,
}: { logoUrl: string | null; titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-superficie">
      <div className="mx-auto flex max-w-5xl justify-center px-4 py-6">
        <LogoSmartCar url={logoUrl} className="h-16 w-auto object-contain sm:h-20" />
      </div>
      <section className="relative overflow-hidden bg-faixa">
        <div
          className="absolute inset-x-0 bottom-0 h-14 bg-superficie"
          style={{ clipPath: 'polygon(0 62%, 100% 0, 100% 100%, 0 100%)' }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-md px-4 pb-24 pt-10">
          <h1 className="text-center font-display text-[1.625rem] font-semibold leading-tight text-white">{titulo}</h1>
          {subtitulo && <p className="mt-2 text-center text-sm text-white/70">{subtitulo}</p>}
          <div className="mt-7 space-y-3 rounded-xl bg-superficie p-6 shadow-xl">{children}</div>
        </div>
      </section>
    </main>
  );
}
