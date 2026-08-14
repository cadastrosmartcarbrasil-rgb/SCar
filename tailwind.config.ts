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
