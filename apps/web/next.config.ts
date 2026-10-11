import type { NextConfig } from "next";

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/auth"],
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${apiUrl}/api/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
