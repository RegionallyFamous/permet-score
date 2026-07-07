import type { NextConfig } from "next";

function canonicalHostRedirect(host: string) {
  return {
    source: "/:path*",
    has: [{ type: "host" as const, value: host }],
    destination: "https://permetscore.com/:path*",
    permanent: true,
  };
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  poweredByHeader: false,
  async redirects() {
    return [
      canonicalHostRedirect("www.permetscore.com"),
      canonicalHostRedirect("permetlink.com"),
      canonicalHostRedirect("www.permetlink.com"),
      canonicalHostRedirect("permet-score.vercel.app"),
    ].filter(
      (redirect) =>
        process.env.ENABLE_CANONICAL_HOST_REDIRECTS === "true" ||
        redirect.has[0]?.value !== "permet-score.vercel.app",
    );
  },
};

export default nextConfig;
