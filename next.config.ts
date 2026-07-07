import type { NextConfig } from "next";

function canonicalHostRedirect(host: string) {
  return {
    source: "/:path*",
    has: [{ type: "host" as const, value: host }],
    destination: "https://permetlink.com/:path*",
    permanent: true,
  };
}

const isProduction = process.env.NODE_ENV === "production";

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
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "object-src 'none'",
          `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} blob:`,
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://product-images.tcgplayer.com https://tcgplayer-cdn.tcgplayer.com https://*.tcgplayer.com",
          "font-src 'self' data:",
          "connect-src 'self'",
          "worker-src 'self' blob:",
          "manifest-src 'self'",
          "upgrade-insecure-requests",
        ].join("; "),
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ...(isProduction
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]
        : []),
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    const staticAssetHeaders = [
      {
        key: "Cache-Control",
        value: "public, max-age=604800, stale-while-revalidate=2592000",
      },
      {
        key: "Vercel-CDN-Cache-Control",
        value: "public, max-age=31536000, stale-while-revalidate=604800",
      },
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/assets/:path*",
        headers: staticAssetHeaders,
      },
      {
        source: "/card-images/:path*",
        headers: staticAssetHeaders,
      },
      {
        source: "/permet-link-logo-fallback.webp",
        headers: staticAssetHeaders,
      },
      {
        source: "/permet-link-logo-header.webp",
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
        source: "/icon-192.png",
        headers: staticAssetHeaders,
      },
      {
        source: "/icon-512.png",
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
