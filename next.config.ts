import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/newsroom/hermes-daily", destination: "/newsroom/editions?range=today", permanent: true },
      { source: "/newsroom/weekly-chronicle", destination: "/newsroom/editions?range=week", permanent: true },
    ];
  },
  experimental: { optimizePackageImports: ["lucide-react"] },
};

export default nextConfig;
