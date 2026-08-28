/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Les pochettes viennent du CDN Deezer et changent a chaque morceau :
  // un <img> direct evite de faire transiter chaque image par l'optimiseur.
  images: { unoptimized: true },
};

export default nextConfig;
