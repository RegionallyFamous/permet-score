#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { CARD_ART_VARIANTS } from "../app/card-art-data.ts";
import {
  CARD_POOL,
  CURATED_CARD_POOL,
  OFFICIAL_CARD_ARTS_BY_NUMBER,
  OFFICIAL_CARD_POOL,
  OFFICIAL_RULES_LAST_SYNC,
  TCGPLAYER_CARD_POOL,
} from "../app/card-pool.ts";
import {
  TCGPLAYER_CARD_PRINTS,
  TCGPLAYER_LAST_SYNC,
} from "../app/tcgplayer-data.ts";

const SITE_NAME = "Permet Link";
const CANONICAL_URL = "https://permetlink.com";
const TCGPLAYER_FRESH_HOURS = 48;
const COMPLETE_DATABASE_CARD_TARGET = 700;
const MAIN_TYPES = ["UNIT", "PILOT", "COMMAND", "BASE"];
const RESOURCE_TYPES = ["RESOURCE"];
const CARD_BY_NUMBER = new Map(CARD_POOL.map((card) => [card.number, card]));

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

function jsonResult(structuredContent) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
  };
}

function hasRulesValue(value) {
  return Boolean(value && value.trim() !== "-");
}

function parseCost(card) {
  const cost = Number(card.cost);
  return Number.isFinite(cost) ? cost : null;
}

function hasDeckRulesData(card) {
  if (card.type === "RESOURCE") {
    return true;
  }
  if (card.type === "EX RESOURCE") {
    return hasRulesValue(card.text);
  }
  if (!MAIN_TYPES.includes(card.type)) return false;
  return (
    hasRulesValue(card.color) &&
    hasRulesValue(card.level) &&
    parseCost(card) !== null
  );
}

function isDeckReadyCard(card) {
  return (
    (MAIN_TYPES.includes(card.type) || RESOURCE_TYPES.includes(card.type)) &&
    hasDeckRulesData(card)
  );
}

function syncAgeHours(now = Date.now()) {
  if (!TCGPLAYER_LAST_SYNC) return null;
  const syncedAt = new Date(TCGPLAYER_LAST_SYNC).getTime();
  if (!Number.isFinite(syncedAt)) return null;
  return Math.max(0, (now - syncedAt) / 3_600_000);
}

function rounded(value) {
  return value === null ? null : Math.round(value * 10) / 10;
}

function marketPrintCount() {
  return Object.values(TCGPLAYER_CARD_PRINTS).reduce(
    (sum, prints) => sum + prints.length,
    0,
  );
}

function directProductPrintCount() {
  return Object.values(TCGPLAYER_CARD_PRINTS).reduce(
    (sum, prints) =>
      sum +
      prints.filter(
        (print) =>
          print.productId && /tcgplayer\.com\/product\/\d+/i.test(print.url),
      ).length,
    0,
  );
}

function priceCoverage() {
  return Object.values(TCGPLAYER_CARD_PRINTS).reduce(
    (coverage, prints) => {
      prints.forEach((print) => {
        if (
          print.productId &&
          /tcgplayer\.com\/product\/\d+/i.test(print.url)
        ) {
          coverage.directProductPrints += 1;
        } else {
          coverage.searchFallbackPrints += 1;
        }
        if (
          typeof print.marketPrice === "number" &&
          Number.isFinite(print.marketPrice) &&
          print.marketPrice > 0
        ) {
          coverage.pricedPrints += 1;
        } else {
          coverage.unpricedPrints += 1;
        }
      });
      return coverage;
    },
    {
      directProductPrints: 0,
      searchFallbackPrints: 0,
      pricedPrints: 0,
      unpricedPrints: 0,
    },
  );
}

function readinessSummary() {
  const deckReadyCards = CARD_POOL.filter(isDeckReadyCard).length;
  const catalogOnlyCards = CARD_POOL.length - deckReadyCards;
  const marketPrints = marketPrintCount();
  const age = syncAgeHours();
  const market = priceCoverage();

  return {
    totalCards: CARD_POOL.length,
    deckReadyCards,
    catalogOnlyCards,
    curatedRulesCards: CURATED_CARD_POOL.length,
    officialRulesCards: OFFICIAL_CARD_POOL.length,
    officialRulesLastSync: OFFICIAL_RULES_LAST_SYNC,
    marketCatalogCards: TCGPLAYER_CARD_POOL.length,
    marketCardsWithPrints: Object.keys(TCGPLAYER_CARD_PRINTS).length,
    marketPrints,
    directProductPrints: market.directProductPrints,
    searchFallbackPrints: market.searchFallbackPrints,
    pricedPrints: market.pricedPrints,
    unpricedPrints: market.unpricedPrints,
    marketLastSync: TCGPLAYER_LAST_SYNC,
    marketSyncAgeHours: rounded(age),
    marketFresh:
      Boolean(TCGPLAYER_LAST_SYNC) &&
      (age === null || age <= TCGPLAYER_FRESH_HOURS),
    catalogCoverageReady: CARD_POOL.length >= COMPLETE_DATABASE_CARD_TARGET,
    allCardsDeckReady: catalogOnlyCards === 0,
  };
}

function cardStatus(card) {
  return {
    deckReady: isDeckReadyCard(card),
    rulesReady: hasDeckRulesData(card),
    reason: isDeckReadyCard(card)
      ? "Ready for deck building."
      : "Catalog/market record only; official gameplay fields are not complete yet.",
  };
}

function printSummary(card) {
  const prints = TCGPLAYER_CARD_PRINTS[card.number] ?? [];
  const pricedPrints = prints.filter(
    (print) =>
      typeof print.marketPrice === "number" &&
      Number.isFinite(print.marketPrice) &&
      print.marketPrice > 0,
  );
  const directPrints = prints.filter(
    (print) =>
      print.productId && /tcgplayer\.com\/product\/\d+/i.test(print.url),
  );
  const prices = pricedPrints.map((print) => print.marketPrice);
  return {
    printCount: prints.length,
    pricedPrints: pricedPrints.length,
    directProductPrints: directPrints.length,
    lowestMarketPrice: prices.length ? Math.min(...prices) : null,
    highestMarketPrice: prices.length ? Math.max(...prices) : null,
  };
}

function compactCard(card) {
  return {
    number: card.number,
    name: card.name,
    color: card.color,
    type: card.type,
    cost: card.cost,
    level: card.level,
    rarity: card.rarity,
    set: card.set,
    source: card.source,
    ...cardStatus(card),
    ...printSummary(card),
  };
}

function cardMatchesStatus(card, status) {
  if (status === "deck_ready") return isDeckReadyCard(card);
  if (status === "catalog_only") return !isDeckReadyCard(card);
  return true;
}

async function fetchStatus(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      url,
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      bytes: text.length,
      contentType: response.headers.get("content-type"),
      hasPermetLink: /Permet Link/i.test(text),
    };
  } catch (error) {
    return {
      url,
      status: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

const server = new McpServer({
  name: "permet-link-site-inspector",
  version: packageJson.version,
});

server.registerTool(
  "get_site_summary",
  {
    title: "Get Site Summary",
    description:
      "Return launch, card-readiness, market-coverage, and tech-stack summary for Permet Link.",
    inputSchema: {},
  },
  async () => {
    const readiness = readinessSummary();
    return jsonResult({
      site: {
        name: SITE_NAME,
        canonicalUrl: CANONICAL_URL,
        packageName: packageJson.name,
        version: packageJson.version,
      },
      readiness,
      answer: readiness.allCardsDeckReady
        ? "All indexed cards are ready for deck building."
        : `${readiness.deckReadyCards} of ${readiness.totalCards} indexed cards are deck-ready; ${readiness.catalogOnlyCards} still need official rules/build data.`,
      stack: {
        next: packageJson.dependencies.next,
        react: packageJson.dependencies.react,
        mcpSdk: packageJson.dependencies["@modelcontextprotocol/sdk"],
      },
      publicRoutes: [
        "/",
        "/decks/[id]",
        "/api/decks",
        "/robots.txt",
        "/sitemap.xml",
        "/manifest.webmanifest",
        "/llms.txt",
      ],
    });
  },
);

server.registerTool(
  "get_card_readiness",
  {
    title: "Get Card Readiness",
    description:
      "Return deck-ready versus catalog-only counts, market print coverage, and sync freshness.",
    inputSchema: {},
  },
  async () => jsonResult(readinessSummary()),
);

server.registerTool(
  "search_cards",
  {
    title: "Search Cards",
    description:
      "Search indexed Gundam Card Game cards by name, number, set, color, type, or readiness.",
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe(
          "Text to match against number, name, text, set, trait, or source.",
        ),
      status: z.enum(["all", "deck_ready", "catalog_only"]).default("all"),
      color: z.string().optional(),
      type: z.string().optional(),
      set: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
  },
  async ({ query = "", status, color, type, set, limit }) => {
    const needle = query.trim().toLowerCase();
    const results = CARD_POOL.filter((card) => {
      if (!cardMatchesStatus(card, status)) return false;
      if (color && card.color.toLowerCase() !== color.toLowerCase()) return false;
      if (type && card.type.toLowerCase() !== type.toLowerCase()) return false;
      if (set && card.set.toLowerCase() !== set.toLowerCase()) return false;
      if (!needle) return true;
      return [
        card.number,
        card.name,
        card.text,
        card.trait,
        card.link,
        card.source,
        card.set,
      ].some((value) => value.toLowerCase().includes(needle));
    })
      .slice(0, limit)
      .map(compactCard);

    return jsonResult({
      query,
      status,
      count: results.length,
      limit,
      results,
    });
  },
);

server.registerTool(
  "get_card_detail",
  {
    title: "Get Card Detail",
    description:
      "Return full local rules, art variant, and TCGplayer print data for one card number.",
    inputSchema: {
      number: z
        .string()
        .describe("Card number, for example ST01-001 or EB01-001."),
    },
  },
  async ({ number }) => {
    const normalized = number.trim().toUpperCase();
    const card = CARD_BY_NUMBER.get(normalized);
    if (!card) {
      return jsonResult({
        found: false,
        number: normalized,
        message: `No indexed card found for ${normalized}.`,
      });
    }

    return jsonResult({
      found: true,
      card,
      status: cardStatus(card),
      artVariants: [
        ...(OFFICIAL_CARD_ARTS_BY_NUMBER[card.number] ?? []),
        ...(CARD_ART_VARIANTS[card.number] ?? []).filter(
          (variant) =>
            !(OFFICIAL_CARD_ARTS_BY_NUMBER[card.number] ?? []).some(
              (officialVariant) => officialVariant.id === variant.id,
            ),
        ),
      ],
      tcgplayerPrints: TCGPLAYER_CARD_PRINTS[card.number] ?? [],
      printSummary: printSummary(card),
    });
  },
);

server.registerTool(
  "get_market_coverage",
  {
    title: "Get Market Coverage",
    description:
      "Return TCGplayer market sync age, product-link coverage, price coverage, and warnings.",
    inputSchema: {},
  },
  async () => {
    const readiness = readinessSummary();
    const market = priceCoverage();
    const warnings = [];
    if (!readiness.marketFresh) {
      warnings.push(
        `Market sync is older than ${TCGPLAYER_FRESH_HOURS} hours or unavailable.`,
      );
    }
    if (market.searchFallbackPrints > 0) {
      warnings.push(
        `${market.searchFallbackPrints} prints use TCGplayer search fallback links instead of direct product links.`,
      );
    }
    if (market.unpricedPrints > 0) {
      warnings.push(
        `${market.unpricedPrints} prints do not currently have usable market prices.`,
      );
    }

    return jsonResult({
      marketLastSync: TCGPLAYER_LAST_SYNC,
      syncAgeHours: readiness.marketSyncAgeHours,
      freshWithinHours: TCGPLAYER_FRESH_HOURS,
      marketCardsWithPrints: readiness.marketCardsWithPrints,
      marketPrints: marketPrintCount(),
      directProductPrints: directProductPrintCount(),
      ...market,
      warnings,
    });
  },
);

server.registerTool(
  "check_live_site",
  {
    title: "Check Live Site",
    description:
      "Fetch read-only public URLs and report whether the live site, SEO files, and AI-readable files respond.",
    inputSchema: {
      baseUrl: z.string().url().default(CANONICAL_URL),
      timeoutMs: z.number().int().min(1000).max(15000).default(5000),
    },
  },
  async ({ baseUrl, timeoutMs }) => {
    const origin = baseUrl.replace(/\/+$/, "");
    const paths = [
      "/",
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/llms.txt",
    ];
    const checks = await Promise.all(
      paths.map((path) => fetchStatus(`${origin}${path}`, timeoutMs)),
    );
    return jsonResult({
      baseUrl: origin,
      ok: checks.every((check) => check.ok),
      checks,
    });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Permet Link MCP site inspector running on stdio.");
}

main().catch((error) => {
  console.error("MCP server error:", error);
  process.exit(1);
});
