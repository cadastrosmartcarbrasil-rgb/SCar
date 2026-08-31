import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'SCar - Gestao de Protecao Veicular',
  description: 'Sistema de gestao para associacoes de protecao veicular.',
  // Instalavel na tela inicial (PWA) — ver src/app/manifest.ts.
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Smart Car' },
  icons: { icon: '/logo-smartcar.svg', apple: '/logo-smartcar.svg' },
};

export const viewport: Viewport = {
  themeColor: '#1E2B4D',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
