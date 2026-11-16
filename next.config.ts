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
    return [
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
