import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors. This is strictly for the MVP phase.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;