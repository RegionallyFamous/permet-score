import type { MetadataRoute } from "next";
import { MARKET_LAST_SYNC } from "./tcgplayer-meta";

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = new Date(MARKET_LAST_SYNC ?? "2026-07-07T00:00:00.000Z");

  return [
    {
      url: "https://permetlink.com/",
      lastModified: updatedAt,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
