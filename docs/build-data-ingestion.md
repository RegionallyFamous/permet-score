# Build Data Ingestion Plan

Permet Link currently has two different data layers:

- **Market/catalog data** from TCGplayer-derived snapshots: product IDs, printings, images, prices, set/product discovery, and purchase links.
- **Build/rules data** used by the deck builder: card number, name, color, type, level, cost, AP, HP, rules text, traits, link conditions, source title, set, rarity, and whether the card is playable in a main or resource deck.

TCGplayer is the right source of truth for market and buying data, but it is not enough for deck-building legality. The build-data source should be the official Gundam Card Game card search and product/card-list pages, with TCGplayer merged afterward for market fields.

## Target Source Order

1. Official Gundam Card Game card search: `https://www.gundam-gcg.com/en/cards/`
2. Official product/card-list news pages for set-level cross-checks.
3. Existing curated local records for manual corrections and release-day fallback.
4. TCGplayer records for product IDs, prices, and print links only.

## Import Shape

Generate a rules-focused file, separate from market data:

```ts
type OfficialRulesCard = {
  number: string;
  name: string;
  color: CardColor;
  type: CardType;
  level: string;
  cost: string;
  ap: string;
  hp: string;
  rarity: string;
  set: string;
  trait: string;
  link: string;
  source: string;
  text: string;
  isDeckReady: boolean;
  officialUrl: string;
  lastSeenAt: string;
};
```

Then merge by normalized card number:

1. Official rules record wins for build fields.
2. Curated local record can override parser gaps after manual review.
3. TCGplayer record adds market/product fields without changing rules fields.
4. Ambiguous numbers, alternate names, or incomplete records go into a review JSON file instead of silently becoming deck-ready.

## Sync Workflow

1. Discover official sets/products from the official card search filters.
2. Fetch official search result pages politely with rate limiting and a clear user agent.
3. Parse card records into `OfficialRulesCard`.
4. Diff against current generated rules data.
5. Emit:
   - `app/official-rules-card-data.ts`
   - `data/official-gundam-rules-sync.json`
   - `data/official-gundam-rules-review.json`
6. Run strict checks:
   - every deck-ready card has number, name, color, type, set, rarity, and rules text;
   - units have level/cost/AP/HP;
   - resources are restricted to the resource zone;
   - no generated market-only card becomes deck-ready without rules fields;
   - review queue is below a launch threshold.
7. Merge official rules data with TCGplayer market data in the app.

## Launch Gate

Before launch, the app should report:

- Official rules sync timestamp.
- Total official rules cards.
- Total deck-ready cards.
- Review queue count.
- Market cards without rules data.
- Rules cards without market products.

These should live in `npm run data:audit`, not in the main user interface.

## Compliance Notes

The official site is the source to verify gameplay facts, but it also publishes copyright and reuse notices. Treat automated ingestion as a controlled build pipeline: keep attribution, avoid republishing official pages wholesale, store only the gameplay fields required for deck-building, and review terms/permission before using official images or long verbatim text beyond what is necessary for the app.
