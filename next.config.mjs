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
