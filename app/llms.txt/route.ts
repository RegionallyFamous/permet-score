const body = `# Permet Link

Permet Link is a fast, local-first deck builder for the Gundam Card Game. It helps players build main and resource decks, tune selected alt-art printings, track private collection ownership in the browser, draw opening hands, export deck images, and generate shareable decklist URLs.

Canonical URL: https://permetlink.com/
Sitemap: https://permetlink.com/sitemap.xml
Robots: https://permetlink.com/robots.txt
Manifest: https://permetlink.com/manifest.webmanifest

## Primary Routes

- https://permetlink.com/ - interactive Gundam Card Game deck builder.
- https://permetlink.com/decks/{id} - public shared deck preview when a user generates a share URL.
- https://permetlink.com/manifest.webmanifest - installable web app manifest.

## App Capabilities

- Build Gundam Card Game decks with main deck and resource deck zones.
- Search and filter the card library by name, number, text, color, type, set, art, collection, and build status.
- Choose standard and alternate printings for cards.
- Open large card lightboxes for readable card art.
- Track owned print quantities locally; ownership is not included in shared deck URLs.
- Generate TCGplayer print lists and outbound TCGplayer links.
- Export decklist images.
- Share decklists through compact URLs backed by the app's share API.

## Data Notes

Permet Link uses local curated card data plus TCGplayer-derived market/catalog snapshots when available. Prices and product links can change; users should verify purchase details on TCGplayer before buying.

## Relationship To Gundam Card Game

Permet Link is an unofficial fan-made deck-building utility. Gundam and Gundam Card Game names, card images, and related marks belong to their respective owners.
`;

export function GET() {
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
