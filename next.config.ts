import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page in this app is per-user and authenticated, so Cache Components /
  // partial prefetching (static-shell prerendering) are intentionally not enabled.
  serverExternalPackages: ["pg", "exceljs", "jspdf", "jspdf-autotable", "unpdf"],
  experimental: {
    // The import sends the rows of a statement (up to 5,000) back when you press Import.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // The old expense Quick Entry page was replaced by Quick Pay.
    return [{ source: "/quick-entry", destination: "/quick-pay", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
