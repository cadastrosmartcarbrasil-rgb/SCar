import type { Config } from 'tailwindcss';

const config: Config = {
  // Tema escuro por CLASSE (.dark no <html>), nao por media query: o usuario
  // escolhe no botao do cabecalho e a escolha vence a preferencia do sistema.
  darkMode: 'class',
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
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
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
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
        },
        // Superficies (o que era `bg-white` e o ground do sistema).
        superficie: 'rgb(var(--superficie) / <alpha-value>)',
        'superficie-alta': 'rgb(var(--superficie-alta) / <alpha-value>)',
        fundo: 'rgb(var(--fundo) / <alpha-value>)',
        // Acao primaria: fundo de botao que SEMPRE leva texto branco. Nao
        // inverte no tema escuro (so sobe de tom), por isso nao sai da escala brand.
        acao: 'rgb(var(--acao) / <alpha-value>)',
        'acao-escura': 'rgb(var(--acao-escura) / <alpha-value>)',
        // Faixa navy (paginas publicas, topo do portal): escura nos dois temas.
        faixa: 'rgb(var(--faixa) / <alpha-value>)',
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
