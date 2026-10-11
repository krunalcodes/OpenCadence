import type { NextConfig } from "next";

const apiUrl = (process.env.API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

const sameOriginFraming = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const embedQuery = [{ type: "query" as const, key: "embed", value: "1" }];

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/auth"],
  async headers() {
    return [
      { source: "/((?!f/).*)", headers: sameOriginFraming },
      { source: "/f/:publicId/:rest+", headers: sameOriginFraming },
      {
        source: "/f/:publicId",
        missing: embedQuery,
        headers: sameOriginFraming,
      },
      {
        source: "/f/:publicId",
        has: embedQuery,
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${apiUrl}/api/auth/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
