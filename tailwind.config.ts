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
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
          900: '#1e3a8a',
        },
        status: {
          success: '#16a34a',
          warning: '#d97706',
          danger: '#dc2626',
          info: '#0284c7',
        },
      },
    },
  },
  plugins: [],
};

export default config;
