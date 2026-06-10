import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['heic-convert', 'libheif-js', 'sharp'],
};

export default nextConfig;
