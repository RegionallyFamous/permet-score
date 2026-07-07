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
  poweredByHeader: false,
  async redirects() {
    return [
      canonicalHostRedirect("www.permetlink.com"),
      canonicalHostRedirect("permetscore.com"),
      canonicalHostRedirect("www.permetscore.com"),
      canonicalHostRedirect("permet-score.vercel.app"),
    ].filter(
      (redirect) =>
        process.env.ENABLE_CANONICAL_HOST_REDIRECTS === "true" ||
        redirect.has[0]?.value === "www.permetlink.com",
    );
  },
};

export default nextConfig;
