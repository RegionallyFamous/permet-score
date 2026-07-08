import {
  groupedCards,
  setSlug,
} from "../cards/card-reference";
import { CARD_POOL } from "../card-pool";
import { OFFICIAL_RULES_LAST_SYNC } from "../official-rules-card-data";
import { TCGPLAYER_CARD_PRINTS } from "../tcgplayer-data";
import { TCGPLAYER_LAST_SYNC } from "../tcgplayer-meta";

function printCount() {
  return Object.values(TCGPLAYER_CARD_PRINTS).reduce(
    (sum, prints) => sum + prints.length,
    0,
  );
}

function cardRows() {
  return [...CARD_POOL]
    .sort((a, b) =>
      a.number.localeCompare(b.number, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    )
    .map((card) =>
      [
        card.number,
        card.name,
        card.color,
        card.type,
        card.level,
        card.cost,
        card.ap,
        card.hp,
        card.trait,
        card.source,
        card.set,
      ]
        .map((value) => value || "-")
        .join(" | "),
    )
    .join("\n");
}

function setRows() {
  return groupedCards()
    .map(([set, cards]) => `- https://permetlink.com/cards/${setSlug(set)} - ${set} (${cards.length} cards)`)
    .join("\n");
}

export function GET() {
  const body = `# Permet Link Full AI Context

Canonical URL: https://permetlink.com/
Guide: https://permetlink.com/guide
Card Library: https://permetlink.com/cards
Sitemap: https://permetlink.com/sitemap.xml
Robots: https://permetlink.com/robots.txt

## Summary

Permet Link is an unofficial, fan-made Gundam Card Game deck builder. It helps players search cards, build main and resource decks, check deck-building constraints, select standard and alternate printings, track local collection ownership, export deck images, and create short shareable decklist URLs.

## Data Coverage

- Total indexed cards: ${CARD_POOL.length}
- TCGplayer print records: ${printCount()}
- Official rules/build data last synced: ${OFFICIAL_RULES_LAST_SYNC}
- TCGplayer print data last synced: ${TCGPLAYER_LAST_SYNC ?? "not available"}

## Important Notes

- Permet Link is not an official Gundam Card Game product.
- Gundam and Gundam Card Game names, card images, and related marks belong to their respective owners.
- Collection ownership is stored locally in the user's browser and is not included in shared deck URLs.
- Prices and purchase links can change; users should verify purchase details on TCGplayer before buying.

## Crawlable Pages

- / - interactive deck builder app.
- /guide - human-readable guide, FAQ, and app explanation.
- /cards - crawlable card library index.
- /cards/{set} - crawlable per-set card lists with rules text and deck-building fields.
- /llms.txt - concise AI index.
- /llms-full.txt - this expanded AI reference.

## Card Set Pages

${setRows()}

## Card Index Format

number | name | color | type | level | cost | AP | HP | trait | source | set

${cardRows()}
`;

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
