import { cn } from '@/lib/utils';

const base =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-slate-600', className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, 'bg-white', className)} {...props} />;
}

// Campo de moeda (R$) com mascara BR: exibe "22.159,00" e guarda o numero.
// Mascara por centavos: digitar 2215900 -> 22.159,00 (funciona tambem com
// preenchimento automatico, ex.: valor vindo da FIPE).
const NUM_BR = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function MoneyInput({
  value,
  onChange,
  className,
  ...props
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const display = value == null || Number.isNaN(value) ? '' : NUM_BR.format(value);
  return (
    <input
      {...props}
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        onChange(digits ? Number(digits) / 100 : null);
      }}
      className={cn(base, className)}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, className)} {...props} />;
}

// Campo com rotulo em bloco.
export function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
