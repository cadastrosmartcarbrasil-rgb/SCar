import type { MetadataRoute } from 'next';

/**
 * Manifesto PWA.
 * E o que permite instalar o portal na tela inicial do celular (o vendedor
 * abre como app, em tela cheia, sem barra de endereco). `start_url` aponta
 * para /vendedor, que e quem mais usa o telefone; quem instalar de outro
 * perfil cai no login e segue para a area dele normalmente.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Smart Car Brasil - Portal do Vendedor',
    short_name: 'Smart Car',
    description: 'Leads, comissoes e link de vendas do vendedor Smart Car Brasil.',
    start_url: '/vendedor',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#eef2f8',
    theme_color: '#1E2B4D',
    lang: 'pt-BR',
    // Gerados da logo OFICIAL (Configuracoes -> Empresa) — src/app/icones.
    // A margem branca deixa o mesmo PNG servir de icone mascaravel no Android.
    icons: [
      { src: '/icones/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icones/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icones/192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icones/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
