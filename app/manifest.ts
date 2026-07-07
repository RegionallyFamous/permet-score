import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Permet Link",
    short_name: "Permet Link",
    description: "A fast local-first Gundam Card Game deck builder and alt-art planner.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#05060a",
    theme_color: "#05060a",
    orientation: "any",
    categories: ["games", "utilities"],
    icons: [
      {
        src: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/permet-link-logo.png",
        sizes: "1983x793",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Build Deck",
        short_name: "Build",
        description: "Open the deck builder.",
        url: "/",
        icons: [{ src: "/favicon-32x32.png", sizes: "32x32" }],
      },
    ],
  };
}
