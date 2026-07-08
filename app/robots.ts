import type { MetadataRoute } from "next";

const discoveryBots = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...discoveryBots.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: "/api/",
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
    ],
    host: "https://permetlink.com",
    sitemap: "https://permetlink.com/sitemap.xml",
  };
}
