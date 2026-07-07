import type { NextConfig } from "next";

function canonicalHostRedirect(host: string) {
  return {
    source: "/:path*",
    has: [{ type: "host" as const, value: host }],
    destination: "https://permetlink.com/:path*",
    permanent: true,
  };
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  outputFileTracingExcludes: {
    "/*": [".local/**/*", "design-assets/**/*", "qa-screenshots/**/*"],
  },
  poweredByHeader: false,
  async redirects() {
    return [
      canonicalHostRedirect("www.permetlink.com"),
      canonicalHostRedirect("permetscore.com"),
      canonicalHostRedirect("www.permetscore.com"),
      canonicalHostRedirect("permet-score.vercel.app"),
    ];
  },
  async headers() {
    const staticAssetHeaders = [
      {
        key: "Cache-Control",
        value: "public, max-age=86400, stale-while-revalidate=604800",
      },
      {
        key: "Vercel-CDN-Cache-Control",
        value: "public, max-age=31536000, stale-while-revalidate=604800",
      },
    ];

    return [
      {
        source: "/assets/:path*",
        headers: staticAssetHeaders,
      },
      {
        source: "/card-images/:path*",
        headers: staticAssetHeaders,
      },
      {
        source: "/permet-link-logo-header.webp",
        headers: staticAssetHeaders,
      },
      {
        source: "/permet-link-logo-fallback.webp",
        headers: staticAssetHeaders,
      },
      {
        source: "/permet-link-logo.png",
        headers: staticAssetHeaders,
      },
      {
        source: "/favicon.ico",
        headers: staticAssetHeaders,
      },
      {
        source: "/favicon.png",
        headers: staticAssetHeaders,
      },
      {
        source: "/favicon-16x16.png",
        headers: staticAssetHeaders,
      },
      {
        source: "/favicon-32x32.png",
        headers: staticAssetHeaders,
      },
      {
        source: "/apple-touch-icon.png",
        headers: staticAssetHeaders,
      },
      {
        source: "/manifest.webmanifest",
        headers: staticAssetHeaders,
      },
    ];
  },
};

export default nextConfig;
