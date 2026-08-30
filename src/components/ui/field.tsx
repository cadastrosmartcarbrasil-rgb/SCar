'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { digitarMoeda, formatarMoedaBR } from '@/lib/money';

const base =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm transition focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:bg-slate-50';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-slate-600', className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, 'bg-white', className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Campo de moeda (R$)
// O input nasce VAZIO exibindo o placeholder "0,00" — nada de "0" preso na
// frente obrigando o operador a apagar ou posicionar o cursor. A digitacao e
// LIVRE: enquanto o campo esta em foco aparece exatamente o que foi digitado
// ("352,00", "1.234,56", "1234.56"); ao sair, o valor e formatado no padrao BR.
// Nada de mascara viva por centavos — ela empurra o cursor e, para quem digita
// o separador, produzia "0,0352,00".
// ---------------------------------------------------------------------------
export function MoneyInput({
  value,
  onChange,
  className,
  prefixo = 'R$',
  onBlur,
  onFocus,
  ...props
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  prefixo?: string | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  // Enquanto o campo esta em edicao o texto digitado manda; fora dela, o
  // valor do formulario (ex.: preenchido pela FIPE) manda.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const texto = rascunho ?? formatarMoedaBR(value ?? null);

  return (
    <div className="relative">
      {prefixo && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
          {prefixo}
        </span>
      )}
      <input
        {...props}
        inputMode="decimal"
        autoComplete="off"
        placeholder={props.placeholder ?? '0,00'}
        value={texto}
        onFocus={(e) => {
          e.target.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          const { valor, texto: novo } = digitarMoeda(e.target.value);
          setRascunho(novo);
          onChange(valor);
        }}
        onBlur={(e) => {
          setRascunho(null); // volta a exibir o valor formatado
          onBlur?.(e);
        }}
        className={cn(base, 'tnum text-right', prefixo && 'pl-10', className)}
      />
    </div>
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
