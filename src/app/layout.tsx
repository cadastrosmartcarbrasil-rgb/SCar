import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { SCRIPT_TEMA_INICIAL } from '@/lib/tema';

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
    // `suppressHydrationWarning` no <html> porque o script abaixo escreve a
    // classe `dark` antes do React: sem isso o React acusaria diferenca entre
    // o HTML do servidor e o do navegador logo na hidratacao.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Decide o tema ANTES da primeira pintura. Se isso fosse feito no
            React, a tela nasceria clara e piscaria para escura ao hidratar. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
