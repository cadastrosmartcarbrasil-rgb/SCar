import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';

const styles: Record<Variant, string> = {
  // acao primaria = navy da marca (contraste seguro com texto branco)
  // sombra em preto, nao em `brand-900`: essa faixa clareia no tema escuro e a
  // sombra viraria um brilho branco
  primary: 'bg-acao text-white hover:bg-acao-escura shadow-sm shadow-black/20',
  secondary: 'border border-slate-300 bg-superficie text-slate-700 hover:bg-slate-50',
  // destaque = ciano da marca (texto navy p/ contraste)
  accent: 'bg-cyan-500 text-navy hover:bg-cyan-400 shadow-sm',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
