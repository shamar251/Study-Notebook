/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

// Only apply these settings when building for production (Electron)
if (process.env.NODE_ENV === 'production') {
  nextConfig.output = 'export';
  nextConfig.assetPrefix = './';
}

export default nextConfig
