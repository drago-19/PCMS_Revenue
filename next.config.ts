import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/session-token";

const nextConfig: NextConfig = {
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" } : {}),
  distDir:
    process.env.NEXT_STANDALONE === "1"
      ? ".next"
      : process.env.NODE_ENV === "production"
        ? ".next-build"
        : ".next",
  poweredByHeader: false,
  allowedDevOrigins: ["revenue.goldpulse-ai.com", "*.goldpulse-ai.com"],
  experimental: {
    reactDebugChannel: false,
    proxyClientMaxBodySize: "105mb",
  },
  serverExternalPackages: ["exceljs", "pg", "bcryptjs"],
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    return [
      ...(isDev
        ? [
            {
              source: "/_next/static/:path*",
              headers: [
                {
                  key: "Cache-Control",
                  value: "no-store, no-cache, must-revalidate",
                },
                {
                  key: "CDN-Cache-Control",
                  value: "no-store",
                },
                {
                  key: "Cloudflare-CDN-Cache-Control",
                  value: "no-store",
                },
              ],
            },
          ]
        : []),
      {
        source: "/(.*)",
        headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({
          key,
          value,
        })),
      },
    ];
  },
};

export default nextConfig;
