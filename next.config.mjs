/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
