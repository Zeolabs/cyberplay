import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.crazygames.com",
      },
      {
        protocol: "https",
        hostname: "imgs.crazygames.com",
      },
      {
        protocol: "https",
        hostname: "videos.crazygames.com",
      },
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
    ],
    // Cache optimized images for 30 days in browser + CDN
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
