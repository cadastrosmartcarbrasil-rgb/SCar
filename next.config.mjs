/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Gera um servidor Node minimo em .next/standalone para imagens Docker enxutas.
  output: 'standalone',
  experimental: {
    // Server Actions are enabled by default on Next 14; kept explicit for clarity.
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // O PDF dos termos (0123) usa o Chromium do sistema pelo puppeteer-core,
    // que nao pode ser empacotado pelo webpack.
    serverComponentsExternalPackages: ['puppeteer-core'],
  },
  // O modulo "Sinistros" virou "Eventos" (17/10/2026): link antigo salvo em
  // favorito, WhatsApp ou e-mail continua chegando no lugar certo.
  async redirects() {
    return [
      { source: '/sinistros', destination: '/eventos', permanent: true },
      { source: '/sinistros/:path*', destination: '/eventos/:path*', permanent: true },
      { source: '/portal/sinistros/:path*', destination: '/portal/eventos/:path*', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        // Supabase Storage public/signed URLs
        hostname: '*.supabase.co',
      },
    ],
  },
};

export default nextConfig;
