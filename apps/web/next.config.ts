import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['heic-convert', 'sharp'],
};

export default nextConfig;
