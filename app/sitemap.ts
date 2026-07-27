import type { MetadataRoute } from "next";
import {
  cardSlug,
  groupedCards,
  setSlug,
} from "./cards/card-reference";
import { CARD_POOL } from "./card-pool";
import { OFFICIAL_RULES_LAST_SYNC } from "./official-rules-card-data";
import { MARKET_LAST_SYNC } from "./tcgplayer-meta";

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = new Date(
    Math.max(
      new Date(MARKET_LAST_SYNC ?? "2026-07-07T00:00:00.000Z").getTime(),
      new Date(OFFICIAL_RULES_LAST_SYNC).getTime(),
    ),
  );

  const cardSetPages = groupedCards().map(([set, cards]) => ({
    url: `https://permetlink.com/cards/${setSlug(set)}`,
    lastModified: updatedAt,
    changeFrequency: "daily" as const,
    priority: cards.length >= 100 ? 0.75 : 0.65,
  }));
  const cardDetailPages = CARD_POOL.map((card) => ({
    url: `https://permetlink.com/cards/${cardSlug(card)}`,
    lastModified: updatedAt,
    changeFrequency: "daily" as const,
    priority: 0.58,
  }));

  return [
    {
      url: "https://permetlink.com/",
      lastModified: updatedAt,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: "https://permetlink.com/guide",
      lastModified: updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://permetlink.com/cards",
      lastModified: updatedAt,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: "https://permetlink.com/status",
      lastModified: updatedAt,
      changeFrequency: "daily",
      priority: 0.65,
    },
    ...cardSetPages,
    ...cardDetailPages,
  ];
}
