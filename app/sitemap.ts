import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = new Date();

  return [
    {
      url: "https://permetlink.com/",
      lastModified: updatedAt,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
