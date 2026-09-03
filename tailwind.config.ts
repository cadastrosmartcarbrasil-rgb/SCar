import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Marca Smart Car Brasil.
        // brand = NAVY (estrutura + acao primaria, como a barra do site).
        brand: {
          50: '#EAEFF7',
          100: '#D5DFEE',
          200: '#B0C0DC',
          300: '#8397BE',
          400: '#4F638F',
          500: '#2C3E66',
          600: '#1E2B4D',
          700: '#16213D',
          800: '#111A30',
          900: '#0E1730',
        },
        // cyan = CIANO da marca (energia/acento: o "CAR" e o rodape do site).
        cyan: {
          50: '#E6F4FB',
          100: '#C9E8F7',
          200: '#9FD6F1',
          300: '#63BEE9',
          400: '#3BB0E6',
          500: '#22A7E4',
          600: '#139AD6',
          700: '#0E7CAE',
          800: '#0C6389',
          900: '#0B506E',
        },
        // Escala de TEXTO. As faixas 400..700 do slate padrao do Tailwind sao
        // cinza-claro demais para uma marca navy: `text-slate-400` dava 2.56 de
        // contraste no card branco, reprovado no WCAG AA (minimo 4.5). Estas
        // tem METADE da luminancia da original e 15% de navy misturado, o que
        // escurece a leitura e puxa o cinza para o tom da marca de uma vez em
        // TODAS as telas — sem tocar em 800/900 (titulos) nem em 50..300, que
        // sao fundo, borda e o texto claro da cabine escura.
        //   400  #94A3B8 -> #5F6C7D   contraste  2.56 -> 5.35
        //   500  #64748B -> #414D61              4.76 -> 8.54
        //   600  #475569 -> #2F394B              7.58 -> 11.62
        //   700  #334155 -> #222D3F             10.35 -> 13.86
        slate: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#5F6C7D',
          500: '#414D61',
          600: '#2F394B',
          700: '#222D3F',
          800: '#1E293B',
          900: '#0F172A',
        },
        navy: '#1E2B4D',
        status: {
          success: '#12A150',
          warning: '#C08600',
          danger: '#E5484D',
          info: '#0E7FE0',
        },
      },
    },
  },
  plugins: [],
};

export default config;
