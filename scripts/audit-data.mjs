#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { CARD_ART_VARIANTS } from "../app/card-art-data.ts";
import {
  CARD_POOL,
  CURATED_CARD_POOL,
  OFFICIAL_CARD_POOL,
  OFFICIAL_RULES_LAST_SYNC,
  TCGPLAYER_CARD_POOL,
} from "../app/card-pool.ts";
import {
  TCGPLAYER_CARD_PRINTS,
  TCGPLAYER_LAST_SYNC,
} from "../app/tcgplayer-data.ts";

const strict = process.argv.includes("--strict");
const minCardCount = Number(process.env.MIN_GUNDAM_CARD_COUNT ?? 700);
const minPrintCount = Number(process.env.MIN_GUNDAM_PRINT_COUNT ?? minCardCount);
const minDirectProductPrints = Number(
  process.env.MIN_GUNDAM_DIRECT_PRODUCT_PRINTS ?? 1000,
);
const minMarketPriceCount = Number(process.env.MIN_GUNDAM_MARKET_PRICE_COUNT ?? 1000);
const minCardsWithPrints = Number(process.env.MIN_GUNDAM_CARDS_WITH_PRINTS ?? 750);
const maxQueueLength = Number(process.env.MAX_TCGPLAYER_SYNC_QUEUE_LENGTH ?? 1000);
const legacyBridgePrefix = ["JA", "NIE"].join("");
const maxSyncAgeHours = Number(
  process.env.TCGPLAYER_MAX_SYNC_HOURS ??
    process.env[`${legacyBridgePrefix}_MAX_SYNC_HOURS`] ??
    48,
);
const maxOfficialSyncAgeHours = Number(process.env.OFFICIAL_GUNDAM_MAX_SYNC_HOURS ?? 72);
const officialSyncReport = readJson("data/official-gundam-rules-sync.json");
const marketSyncReport = readJson("data/tcgplayer-gundam-sync.json");
const validTypes = new Set([
  "UNIT",
  "PILOT",
  "COMMAND",
  "BASE",
  "RESOURCE",
  "EX RESOURCE",
  "EX BASE",
  "UNIT TOKEN",
]);
const validColors = new Set(["Blue", "Green", "Red", "White", "Purple", "-"]);

const cards = CARD_POOL;
const cardsByNumber = new Map(cards.map((card) => [card.number, card]));
const printCount = Object.values(TCGPLAYER_CARD_PRINTS).reduce(
  (sum, prints) => sum + prints.length,
  0,
);
const sourceOnlyProductIds = Object.entries(TCGPLAYER_CARD_PRINTS).flatMap(
  ([number, prints]) =>
    prints
      .filter((print) =>
        Boolean(
          print.productId &&
            print.sourceProductId &&
            print.productId === print.sourceProductId &&
            !/tcgplayer\.com\/product\/\d+/i.test(print.url),
        ),
      )
      .map((print) => `${number}:${print.variantId}`),
);
const directProductPrints = Object.values(TCGPLAYER_CARD_PRINTS).reduce(
  (sum, prints) =>
    sum +
    prints.filter(
      (print) => print.productId && /tcgplayer\.com\/product\/\d+/i.test(print.url),
    ).length,
  0,
);
const missingProductIds = Object.values(TCGPLAYER_CARD_PRINTS).reduce(
  (sum, prints) => sum + prints.filter((print) => !print.productId).length,
  0,
);
const missingMarketPrices = Object.values(TCGPLAYER_CARD_PRINTS).reduce(
  (sum, prints) => sum + prints.filter((print) => !print.marketPrice).length,
  0,
);
const marketPriceAudit = Object.entries(TCGPLAYER_CARD_PRINTS).reduce(
  (summary, [number, prints]) => {
    const card = cardsByNumber.get(number);
    prints.forEach((print, index) => {
      const price = positiveMarketPrice(print);
      if (price === null) return;
      summary.rawMarketPrices += 1;
      if (!card) {
        summary.unmatchedMarketPrices += 1;
        return;
      }
      const tier = printArtTier(number, print, index);
      const estimate = estimatePrintCost(card, tier);
      if (isVolatileMarketPrice(price, estimate)) {
        summary.volatileMarketPrices += 1;
      } else {
        summary.usableMarketPrices += 1;
      }
    });
    return summary;
  },
  {
    rawMarketPrices: 0,
    usableMarketPrices: 0,
    volatileMarketPrices: 0,
    unmatchedMarketPrices: 0,
  },
);
const directProductsMissingMarketPrices = Object.values(TCGPLAYER_CARD_PRINTS).reduce(
  (sum, prints) =>
    sum +
    prints.filter(
      (print) =>
        print.productId &&
        /tcgplayer\.com\/product\/\d+/i.test(print.url) &&
        !print.marketPrice,
    ).length,
  0,
);
const localArtWithoutMarketPrints = Object.entries(CARD_ART_VARIANTS).flatMap(
  ([number, variants]) => {
    const marketPrints = TCGPLAYER_CARD_PRINTS[number] ?? [];
    return variants
      .filter(
        (variant) =>
          !marketPrints.some(
            (print) =>
              print.variantId === variant.id ||
              print.officialId === variant.officialId,
          ),
      )
      .map((variant) => `${number}:${variant.id}`);
  },
);
const cardsWithPrints = Object.keys(TCGPLAYER_CARD_PRINTS).length;
const syncAgeHours = TCGPLAYER_LAST_SYNC
  ? Math.max(0, (Date.now() - new Date(TCGPLAYER_LAST_SYNC).getTime()) / 3_600_000)
  : null;
const officialSyncAgeHours = OFFICIAL_RULES_LAST_SYNC
  ? Math.max(0, (Date.now() - new Date(OFFICIAL_RULES_LAST_SYNC).getTime()) / 3_600_000)
  : null;

const errors = [];
const warnings = [];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
  } catch {
    return null;
  }
}

function report(condition, message) {
  if (condition) return;
  if (strict) errors.push(message);
  else warnings.push(message);
}

function positiveMarketPrice(print) {
  return typeof print.marketPrice === "number" &&
    Number.isFinite(print.marketPrice) &&
    print.marketPrice > 0
    ? print.marketPrice
    : null;
}

function printCostBase(card) {
  const rarityBase = {
    C: 0.25,
    U: 0.6,
    R: 1.25,
    LR: 2.75,
    P: 3.5,
  };
  const gameCost = Number(card.cost);
  const costWeight = Number.isFinite(gameCost) ? gameCost * 0.22 : 0;
  const unitWeight = card.type === "UNIT" ? 0.4 : 0;
  return (rarityBase[card.rarity] ?? 0.4) + costWeight + unitWeight;
}

function artTierMultiplier(tier) {
  if (tier <= 0) return 1;
  return [1, 2.5, 5, 8.5, 13, 19, 27, 38][tier] ?? 38 + (tier - 7) * 12;
}

function estimatePrintCost(card, tier) {
  const value = printCostBase(card) * artTierMultiplier(tier);
  return Math.max(0.05, Math.round(value * 100) / 100);
}

function printArtTier(number, print, fallbackTier) {
  const localVariant = CARD_ART_VARIANTS[number]?.find(
    (variant) =>
      variant.id === print.variantId ||
      variant.officialId === print.officialId,
  );
  return localVariant?.tier ?? fallbackTier;
}

function isVolatileMarketPrice(price, estimatedPrice) {
  return price >= Math.max(250, estimatedPrice * 25);
}

function hasRulesValue(value) {
  return Boolean(value && value.trim() !== "-");
}

function parseCost(card) {
  const cost = Number(card.cost);
  return Number.isFinite(cost) ? cost : null;
}

function hasDeckRulesData(card) {
  if (card.type === "RESOURCE") return true;
  if (card.type === "EX RESOURCE") return hasRulesValue(card.text);
  if (!["UNIT", "PILOT", "COMMAND", "BASE"].includes(card.type)) return false;
  return hasRulesValue(card.color) && hasRulesValue(card.level) && parseCost(card) !== null;
}

function isDeckReadyCard(card) {
  return (
    (["UNIT", "PILOT", "COMMAND", "BASE"].includes(card.type) ||
      card.type === "RESOURCE") &&
    hasDeckRulesData(card)
  );
}

const seen = new Set();
const duplicateNumbers = [];
for (const card of cards) {
  if (seen.has(card.number)) duplicateNumbers.push(card.number);
  seen.add(card.number);

  if (!card.number || !card.name) errors.push(`Card is missing number/name: ${JSON.stringify(card)}`);
  if (!validTypes.has(card.type)) errors.push(`${card.number} has invalid type: ${card.type}`);
  if (!validColors.has(card.color)) errors.push(`${card.number} has invalid color: ${card.color}`);
}

if (duplicateNumbers.length) {
  errors.push(`Duplicate card numbers: ${duplicateNumbers.join(", ")}`);
}

report(cards.length >= minCardCount, `Only ${cards.length} cards loaded; expected at least ${minCardCount}.`);
report(printCount >= minPrintCount, `Only ${printCount} market print records loaded; expected at least ${minPrintCount}.`);
report(Boolean(TCGPLAYER_LAST_SYNC), "Market snapshot is missing.");
report(Boolean(OFFICIAL_RULES_LAST_SYNC), "Official rules snapshot is missing.");
report(
  syncAgeHours !== null && syncAgeHours <= maxSyncAgeHours,
  `Market snapshot is stale or missing; expected <= ${maxSyncAgeHours}h.`,
);
report(
  officialSyncAgeHours !== null && officialSyncAgeHours <= maxOfficialSyncAgeHours,
  `Official rules snapshot is stale or missing; expected <= ${maxOfficialSyncAgeHours}h.`,
);
report(Boolean(officialSyncReport), "Official rules sync report is missing.");
report(Boolean(marketSyncReport), "TCGplayer sync report is missing.");
report(
  cardsWithPrints >= minCardsWithPrints,
  `Only ${cardsWithPrints} cards have market print records; expected at least ${minCardsWithPrints}.`,
);
report(
  directProductPrints >= minDirectProductPrints,
  `Only ${directProductPrints} direct TCGplayer product links loaded; expected at least ${minDirectProductPrints}.`,
);
report(
  marketPriceAudit.rawMarketPrices >= minMarketPriceCount,
  `Only ${marketPriceAudit.rawMarketPrices} raw TCGplayer market prices loaded; expected at least ${minMarketPriceCount}.`,
);

if (officialSyncReport) {
  if (officialSyncReport.updatedAt !== OFFICIAL_RULES_LAST_SYNC) {
    errors.push("Official rules report timestamp does not match imported app data.");
  }
  if (officialSyncReport.reviewCount) {
    errors.push(
      `Official rules sync has ${officialSyncReport.reviewCount} card(s) queued for parser review.`,
    );
  }
  if (officialSyncReport.officialCardCount !== OFFICIAL_CARD_POOL.length) {
    errors.push(
      `Official rules report card count (${officialSyncReport.officialCardCount}) does not match imported app data (${OFFICIAL_CARD_POOL.length}).`,
    );
  }
}

if (marketSyncReport) {
  const queueLength = marketSyncReport.catalogDiscovery?.summary?.queueLength;
  if (marketSyncReport.updatedAt !== TCGPLAYER_LAST_SYNC) {
    errors.push("TCGplayer report timestamp does not match imported app data.");
  }
  if (marketSyncReport.productCount < minPrintCount) {
    errors.push(
      `TCGplayer report has only ${marketSyncReport.productCount} products; expected at least ${minPrintCount}.`,
    );
  }
  if (marketSyncReport.cardsWithPrints !== cardsWithPrints) {
    errors.push(
      `TCGplayer report cards-with-prints (${marketSyncReport.cardsWithPrints}) does not match imported app data (${cardsWithPrints}).`,
    );
  }
  if (marketSyncReport.printRecordCount !== printCount) {
    errors.push(
      `TCGplayer report print count (${marketSyncReport.printRecordCount}) does not match imported app data (${printCount}).`,
    );
  }
  if (marketSyncReport.catalogDiscovery?.status === "error") {
    errors.push("TCGplayer catalog discovery reported an error status.");
  }
  if (typeof queueLength === "number" && queueLength > maxQueueLength) {
    errors.push(
      `TCGplayer catalog discovery queue has ${queueLength} pending job(s); expected <= ${maxQueueLength}.`,
    );
  }
  if (marketSyncReport.releaseAudit?.status && marketSyncReport.releaseAudit.status !== "ok") {
    warnings.push(
      `TCGplayer release audit is ${marketSyncReport.releaseAudit.status}; using direct product and price coverage gates for launch safety.`,
    );
  }
  if (marketSyncReport.searchReports?.some((report) => report.limitHit)) {
    warnings.push(
      "One or more TCGplayer market searches hit the endpoint limit; direct product coverage gates are still passing.",
    );
  }
}

if (sourceOnlyProductIds.length) {
  const message = `${sourceOnlyProductIds.length} market print records have source-only IDs where TCGplayer product IDs are expected.`;
  if (strict) errors.push(message);
  else warnings.push(`${message} Runtime image guards will ignore those CDN paths until the next sync repairs them.`);
}

if (missingProductIds) {
  warnings.push(
    `${missingProductIds} market print records do not have direct TCGplayer product IDs yet and will use search fallback links.`,
  );
}

if (missingMarketPrices) {
  warnings.push(
    `${missingMarketPrices} market print records do not have TCGplayer market prices yet and may use local estimates.`,
  );
}

if (marketPriceAudit.volatileMarketPrices) {
  warnings.push(
    `${marketPriceAudit.volatileMarketPrices} TCGplayer market prices look volatile and are excluded from deck cost math.`,
  );
}

if (marketPriceAudit.unmatchedMarketPrices) {
  warnings.push(
    `${marketPriceAudit.unmatchedMarketPrices} priced market print records could not be matched to catalog cards.`,
  );
}

if (directProductsMissingMarketPrices) {
  warnings.push(
    `${directProductsMissingMarketPrices} direct TCGplayer product records are missing market prices.`,
  );
}

if (localArtWithoutMarketPrints.length) {
  warnings.push(
    `${localArtWithoutMarketPrints.length} local art variants do not have matching TCGplayer print records: ${localArtWithoutMarketPrints.slice(0, 8).join(", ")}.`,
  );
}

const summary = {
  strict,
  curatedCards: CURATED_CARD_POOL.length,
  marketCards: TCGPLAYER_CARD_POOL.length,
  totalCards: cards.length,
  marketPrints: printCount,
  directProductPrints,
  rawMarketPrices: marketPriceAudit.rawMarketPrices,
  usableMarketPrices: marketPriceAudit.usableMarketPrices,
  volatileMarketPrices: marketPriceAudit.volatileMarketPrices,
  unmatchedMarketPrices: marketPriceAudit.unmatchedMarketPrices,
  missingProductIds,
  missingMarketPrices,
  directProductsMissingMarketPrices,
  localArtWithoutMarketPrints: localArtWithoutMarketPrints.length,
  sourceOnlyProductIds: sourceOnlyProductIds.length,
  marketCardsWithPrints: cardsWithPrints,
  marketLastSync: TCGPLAYER_LAST_SYNC,
  syncAgeHours: syncAgeHours === null ? null : Math.round(syncAgeHours * 10) / 10,
  minCardCount,
  minPrintCount,
  maxSyncAgeHours,
  minDirectProductPrints,
  minMarketPriceCount,
  minCardsWithPrints,
  maxQueueLength,
  officialRulesCards: OFFICIAL_CARD_POOL.length,
  deckReadyCards: cards.filter(isDeckReadyCard).length,
  officialRulesLastSync: OFFICIAL_RULES_LAST_SYNC,
  officialRulesSyncAgeHours:
    officialSyncAgeHours === null ? null : Math.round(officialSyncAgeHours * 10) / 10,
  maxOfficialSyncAgeHours,
  officialRulesReviewCount: officialSyncReport?.reviewCount ?? null,
  marketReleaseAuditStatus: marketSyncReport?.releaseAudit?.status ?? null,
  marketCatalogDiscoveryStatus: marketSyncReport?.catalogDiscovery?.status ?? null,
  marketCatalogQueueLength:
    marketSyncReport?.catalogDiscovery?.summary?.queueLength ?? null,
  warnings,
  errors,
};

console.log(JSON.stringify(summary, null, 2));

if (errors.length) {
  throw new Error(`Data audit failed with ${errors.length} error(s).`);
}
