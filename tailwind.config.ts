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
      fontFamily: {
        sans: ['var(--font-texto)', 'system-ui', 'sans-serif'],
        display: ['var(--font-titulo)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      // CABINE CLARA: texto mais firme e legivel, sem mexer em nenhuma tela.
      //  - corpo e rotulos de campo 15px (text-sm); dado auxiliar 13px (text-xs)
      //  - peso: normal=500 (Barlow Medium), medium=600 (rotulos). semibold/bold ficam.
      //  - cartoes menos "bolha": rounded-2xl = 12px (igual ao rounded-xl)
      // Para voltar ao tamanho antigo, apague o bloco fontSize abaixo.
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.15rem' }],
        sm: ['0.9375rem', { lineHeight: '1.4rem' }],
      },
      fontWeight: {
        normal: '500',
        medium: '600',
      },
      borderRadius: {
        '2xl': '0.75rem',
      },
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
          50: '#E5F6FC',
          100: '#C4EBF8',
          200: '#93DAF2',
          300: '#5FC8EC',
          400: '#2FBAE7',
          500: '#0BACE2',
          600: '#0678A0', // era #0785B0 (4.02 no card); agora 4.78 como texto
          700: '#066B8F',
          800: '#085776',
          900: '#0A455E',
        },
        // Escala de TEXTO. As faixas 400..700 do slate padrao do Tailwind sao
        // cinza-claro demais para uma marca navy: `text-slate-400` dava 2.56 de
        // contraste no card branco, reprovado no WCAG AA (minimo 4.5). Estas
        // tem METADE da luminancia da original e 15% de navy misturado, o que
        // escurece a leitura e puxa o cinza para o tom da marca de uma vez em
        // TODAS as telas — sem tocar em 800/900 (titulos) nem em 50..300, que
        // sao fundo, borda e o texto claro da cabine escura.
        // Valores atuais (Cabine clara, 21/10/2026) em globals.css, com o contraste
        // medido no ground #D5DDEA e no card #F8FAFD:
        //   400  #525E70   4.81 / 6.29
        //   500  #38455C   7.07 / 9.24
        //   600  #29344A   9.12 / 11.92
        //   700  #1C273C  10.93 / 14.30
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
        navy: '#142445',
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
