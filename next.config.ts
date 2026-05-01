import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents: OFF (default in 16.2.4). Use route-segment-config (dynamic / revalidate) for all 8 sprints.

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
