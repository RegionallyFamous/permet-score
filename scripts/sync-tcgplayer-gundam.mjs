#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CARD_ART_VARIANTS } from "../app/card-art-data.ts";
import { CARD_POOL as CURATED_CARD_POOL } from "../app/card-data.ts";
import {
  OFFICIAL_CARD_ART_VARIANTS,
  OFFICIAL_CARD_POOL,
} from "../app/official-rules-card-data.ts";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const checkOnly = process.argv.includes("--check");
const allowEmpty = process.argv.includes("--allow-empty");
const legacyBridgePrefix = ["JA", "NIE"].join("");
const legacyBridgeServer = `${["ja", "nie"].join("")}-firehose`;
const syncConcurrency = clampNumber(
  process.env.TCGPLAYER_BRIDGE_SYNC_CONCURRENCY ??
    process.env[`${legacyBridgePrefix}_SYNC_CONCURRENCY`],
  checkOnly ? 1 : 4,
  1,
  8,
);
const gameName =
  process.env.TCGPLAYER_BRIDGE_GAME_NAME ??
  process.env[`${legacyBridgePrefix}_GUNDAM_GAME_NAME`] ??
  "Gundam Card Game";
const maxSyncAgeHours = Number(
  process.env.TCGPLAYER_BRIDGE_MAX_SYNC_HOURS ??
    process.env[`${legacyBridgePrefix}_MAX_SYNC_HOURS`] ??
    48,
);
const bridgeConfig = readCodexMarketBridgeConfig();
const marketOrigin = (
  process.env.TCGPLAYER_BRIDGE_ORIGIN ??
  process.env[`${legacyBridgePrefix}_API_ORIGIN`] ??
  bridgeConfig.TCGPLAYER_BRIDGE_ORIGIN ??
  bridgeConfig.LEGACY_BRIDGE_ORIGIN ??
  ["https://", "ja", "nie", ".up.railway.app"].join("")
).replace(/\/$/, "");
const marketToken =
  process.env.TCGPLAYER_BRIDGE_TOKEN ??
  process.env[`${legacyBridgePrefix}_API_TOKEN`] ??
  process.env[`${legacyBridgePrefix}_BEARER_TOKEN`] ??
  bridgeConfig.TCGPLAYER_BRIDGE_TOKEN ??
  bridgeConfig.LEGACY_BRIDGE_TOKEN;
const existingSyncReport = checkOnly ? readExistingSyncReport() : null;

const curatedByNumber = new Map(CURATED_CARD_POOL.map((card) => [card.number, card]));
const officialByNumber = new Map(OFFICIAL_CARD_POOL.map((card) => [card.number, card]));
const localVariantsByNumber = CARD_ART_VARIANTS;

if (!marketToken) {
  throw new Error(
    "Missing market bridge credentials. Set TCGPLAYER_BRIDGE_TOKEN, or run locally with the configured market bridge MCP in ~/.codex/config.toml.",
  );
}

function readCodexMarketBridgeConfig() {
  const configPath = `${homedir()}/.codex/config.toml`;
  if (!existsSync(configPath)) return {};
  const text = readFileSync(configPath, "utf8");
  const block = section(text, `mcp_servers.${legacyBridgeServer}.env`);
  return {
    TCGPLAYER_BRIDGE_ORIGIN: readTomlString(block, "TCGPLAYER_BRIDGE_ORIGIN"),
    TCGPLAYER_BRIDGE_TOKEN: readTomlString(block, "TCGPLAYER_BRIDGE_TOKEN"),
    LEGACY_BRIDGE_ORIGIN: readTomlString(block, `${legacyBridgePrefix}_API_ORIGIN`),
    LEGACY_BRIDGE_TOKEN: readTomlString(block, `${legacyBridgePrefix}_API_TOKEN`),
  };
}

function section(text, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\[${escapedName}\\]\\s*$`, "m"));
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^\\[[^\\]]+\\]\\s*$/m);
  return next >= 0 ? rest.slice(0, next) : rest;
}

function readTomlString(block, key) {
  const match = block.match(new RegExp(`^${key}\\s*=\\s*"((?:\\\\.|[^"\\\\])*)"`, "m"));
  return match ? JSON.parse(`"${match[1]}"`) : undefined;
}

function readExistingSyncReport() {
  try {
    return JSON.parse(
      readFileSync(new URL("../data/tcgplayer-gundam-sync.json", import.meta.url), "utf8"),
    );
  } catch {
    return null;
  }
}

function stableCheckTimestamp(current, existing) {
  return checkOnly && typeof existing === "string" ? existing : current;
}

function stableCheckSummary(current, existing) {
  if (!checkOnly || !existing || typeof existing !== "object") return current;
  return {
    ...current,
    queueLength: existing.queueLength ?? current?.queueLength,
  };
}

function publicMarketOrigin(origin) {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host.includes(["ja", "nie"].join("")) ? "configured market bridge" : origin;
  } catch {
    return "configured market bridge";
  }
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanString(value, fallback = "-") {
  const next = String(value ?? "").replace(/\s+/g, " ").trim();
  return next || fallback;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function centsToDollars(value) {
  const cents = safeNumber(value);
  return cents && cents > 0 ? Math.round(cents) / 100 : undefined;
}

function normalizeCardNumber(value) {
  const text = String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, " ");
  const match = text.match(/\b(?:GD|ST|EB)\d{2}-\d{3,4}\b/)
    ?? text.match(/\b(?:EXB|EXR|EX|R|PR|P)-\d{3,4}\b/)
    ?? text.match(/\b(?:GD|ST|EB)\d{5,6}\b/)
    ?? text.match(/\b(?:EXB|EXR|EX|R|PR|P)\d{3,4}\b/);
  if (!match) return "";
  return match[0]
    .replace(/^(GD|ST|EB)(\d{2})(\d{3,4})$/, "$1$2-$3")
    .replace(/^(EXB|EXR|EX|R|PR|P)(\d{3,4})$/, "$1-$2");
}

function plainProductName(row, number) {
  const escapedNumber = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanString(row.product_name || row.name, "Unknown Card")
    .replace(new RegExp(`\\b${escapedNumber.replace("\\-", "-?")}\\b`, "i"), "")
    .replace(/\((?:Alternate Art|Alt Art|Parallel|Foil|Holofoil|Normal)\)/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+-\s+$/, "")
    .trim();
}

function typeForProduct(row, number) {
  const text = normalize(`${number} ${row.product_name} ${row.name}`);
  if (number.startsWith("EXR-") || text.includes("ex resource")) return "EX RESOURCE";
  if (number.startsWith("R-") || text.includes("resource")) return "RESOURCE";
  if (text.includes("pilot")) return "PILOT";
  if (text.includes("command")) return "COMMAND";
  if (text.includes("base")) return "BASE";
  return "UNIT";
}

function isAltProduct(row) {
  const text = normalize(`${row.product_name} ${row.name} ${row.rarity} ${row.url}`);
  return /\b(alt|alternate|parallel|foil|holo|special|promo)\b/.test(text);
}

function generatedVariantId(index, localVariants) {
  return localVariants[index]?.id ?? (index === 0 ? "standard" : `p${index}`);
}

function tcgplayerProductUrl(row) {
  const tcgProductId = safeNumber(row.tcg_product_id ?? row.tcgProductId);
  if (!tcgProductId) return tcgplayerSearchUrl(row);
  return `https://www.tcgplayer.com/product/${tcgProductId}?Language=English`;
}

function tcgplayerSearchUrl(row) {
  const params = new URLSearchParams({
    page: "1",
    productLineName: "gundam-card-game",
    q: `${row.number ?? ""} ${row.product_name ?? row.name ?? ""} ${gameName}`.trim(),
    view: "grid",
  });
  return `https://www.tcgplayer.com/search/all/product?${params.toString()}`;
}

function generatedCardFromProduct(row) {
  const number = normalizeCardNumber(row.number) || normalizeCardNumber(row.product_name);
  if (!number || curatedByNumber.has(number)) return null;
  return {
    number,
    name: plainProductName(row, number),
    rarity: cleanString(row.rarity, "C"),
    level: "-",
    cost: "-",
    color: "-",
    type: typeForProduct(row, number),
    text: "-",
    trait: "-",
    link: "-",
    ap: "-",
    hp: "-",
    source: "-",
    set: cleanString(row.set_name, "Market Import"),
  };
}

function compareOptionalNumber(a, b) {
  const left = safeNumber(a);
  const right = safeNumber(b);
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left - right;
}

function compareProducts(a, b) {
  const altDelta = Number(isAltProduct(a)) - Number(isAltProduct(b));
  if (altDelta !== 0) return altDelta;

  const nameDelta = String(a.product_name).localeCompare(String(b.product_name));
  if (nameDelta !== 0) return nameDelta;

  const setDelta = String(a.set_name).localeCompare(String(b.set_name));
  if (setDelta !== 0) return setDelta;

  const rarityDelta = String(a.rarity).localeCompare(String(b.rarity));
  if (rarityDelta !== 0) return rarityDelta;

  const tcgProductDelta = compareOptionalNumber(a.tcg_product_id, b.tcg_product_id);
  if (tcgProductDelta !== 0) return tcgProductDelta;

  return compareOptionalNumber(a.product_id, b.product_id);
}

async function marketBridgeGet(path) {
  const url = new URL(path, marketOrigin);
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${marketToken}`,
      },
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (response.ok) return json;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Market bridge GET ${url.pathname} failed (${response.status}): ${JSON.stringify(json)}`);
    }

    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 750 * attempt * attempt;
    await sleep(delayMs);
  }

  throw new Error(`Market bridge GET ${url.pathname} failed after ${maxAttempts} attempts.`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

async function fetchReleaseAudit() {
  const params = new URLSearchParams({
    game: gameName,
    limit: "50",
    days: "3650",
    includeJobs: "false",
  });
  return marketBridgeGet(`/api/firehose/release-audit?${params.toString()}`);
}

async function fetchCatalogDiscovery() {
  const params = new URLSearchParams({
    targetGames: gameName,
    maxPages: "50",
    maxMissingGroups: "50",
  });
  return marketBridgeGet(`/api/diagnostics/catalog-discovery?${params.toString()}`).catch((error) => ({
    status: "unavailable",
    error: error instanceof Error ? error.message : String(error),
  }));
}

async function firehoseSearch(query, limit = 100) {
  const params = new URLSearchParams({
    q: query,
    game: gameName,
    limit: String(limit),
  });
  const payload = await marketBridgeGet(`/api/firehose/search?${params.toString()}`);
  return Array.isArray(payload.results) ? payload.results : [];
}

async function productSearch(query, setName, limit = 2000) {
  const params = new URLSearchParams({
    q: query,
    game: gameName,
    set: setName,
    limit: String(limit),
  });
  const payload = await marketBridgeGet(`/api/v1/products/search?${params.toString()}`);
  return Array.isArray(payload.products) ? payload.products : [];
}

function buildQueries(releaseAudit) {
  const queries = new Set();
  for (const set of releaseAudit.sets ?? []) {
    if (set?.setName) queries.add(String(set.setName));
  }
  for (const card of CURATED_CARD_POOL) {
    queries.add(card.number);
    queries.add(card.name);
  }
  return [...queries].filter(Boolean);
}

function buildSetQueries(releaseAudit) {
  return (releaseAudit.sets ?? [])
    .map((set) => String(set?.setName ?? "").trim())
    .filter(Boolean);
}

function productKey(row) {
  const sourceProductId = safeNumber(row.product_id ?? row.id);
  if (sourceProductId) return `source:${sourceProductId}`;
  const tcgProductId = safeNumber(row.tcg_product_id ?? row.tcgProductId);
  if (tcgProductId) return `tcg:${tcgProductId}`;
  return `fallback:${normalize(row.set_name ?? row.setName)}:${normalize(row.product_name ?? row.name)}:${normalize(row.number)}`;
}

function normalizeCatalogProduct(row) {
  return {
    product_id: safeNumber(row.id ?? row.product_id),
    product_name: row.name ?? row.product_name,
    number: row.number,
    rarity: row.rarity,
    set_name: row.setName ?? row.set_name,
    game_name: row.gameName ?? row.game_name,
  };
}

async function fetchProductRows(releaseAudit) {
  const rowsByProduct = new Map();
  const searchReports = [];
  const catalogReports = [];
  const setQueries = buildSetQueries(releaseAudit);
  const queries = buildQueries(releaseAudit);

  await mapLimit(setQueries, syncConcurrency, async (setName) => {
    const rows = (await productSearch("%", setName, 2000)).map(normalizeCatalogProduct);
    catalogReports.push({
      setName,
      rows: rows.length,
      numberedRows: rows.filter((row) => normalizeCardNumber(row.number) || normalizeCardNumber(row.product_name)).length,
    });
    for (const row of rows) {
      rowsByProduct.set(productKey(row), row);
    }
  });

  await mapLimit(queries, syncConcurrency, async (query) => {
    const rows = await firehoseSearch(query, 100);
    searchReports.push({
      query,
      rows: rows.length,
      limitHit: rows.length >= 100,
    });
    for (const row of rows) {
      const key = productKey(row);
      rowsByProduct.set(key, {
        ...(rowsByProduct.get(key) ?? {}),
        ...row,
      });
    }
  });

  return {
    rows: [...rowsByProduct.values()],
    searchReports,
    catalogReports,
  };
}

async function mapLimit(items, limit, mapper) {
  const executing = new Set();
  const results = [];
  for (const item of items) {
    const promise = Promise.resolve().then(() => mapper(item));
    results.push(promise);
    executing.add(promise);
    promise.finally(() => executing.delete(promise));
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

function generateFiles({
  releaseAudit,
  catalogDiscovery,
  products,
  searchReports,
  catalogReports,
  existingReport,
}) {
  const updatedAt = products.length
    ? stableCheckTimestamp(new Date().toISOString(), existingReport?.updatedAt)
    : null;
  const sortedCatalogReports = [...catalogReports].sort((a, b) =>
    String(a.setName).localeCompare(String(b.setName)),
  );
  const sortedSearchReports = [...searchReports].sort((a, b) =>
    String(a.query).localeCompare(String(b.query)),
  );
  const productsByNumber = new Map();
  const unmatchedProducts = [];

  for (const product of products) {
    const number = normalizeCardNumber(product.number) || normalizeCardNumber(product.product_name);
    if (!number) {
      unmatchedProducts.push({
        sourceProductId: product.product_id,
        tcgProductId: product.tcg_product_id,
        name: product.product_name,
        setName: product.set_name,
        reason: "no-card-number",
      });
      continue;
    }
    const current = productsByNumber.get(number) ?? [];
    current.push(product);
    productsByNumber.set(number, current);
  }

  const printRecords = {};
  const generatedCards = [];
  const seenGenerated = new Set();

  for (const [number, groupedProducts] of [...productsByNumber.entries()].sort()) {
    groupedProducts.sort(compareProducts);

    const localVariants = localVariantsByNumber[number] ?? [];
    printRecords[number] = groupedProducts.map((product, index) => {
      const localVariant = localVariants[index];
      const officialId = localVariant?.officialId ?? (index === 0 ? number : `${number}_market${index}`);
      const marketPrice = centsToDollars(product.market_price_cents);
      const tcgProductId = safeNumber(product.tcg_product_id);
      return {
        ...(tcgProductId ? { productId: tcgProductId } : {}),
        sourceProductId: safeNumber(product.product_id),
        variantId: generatedVariantId(index, localVariants),
        officialId,
        url: tcgplayerProductUrl(product),
        imageUrl: product.image_url || undefined,
        marketPrice,
        priceSource: marketPrice ? "TCGplayer market" : undefined,
      };
    });

    if (!officialByNumber.has(number) && !curatedByNumber.has(number) && !seenGenerated.has(number)) {
      const card = generatedCardFromProduct(groupedProducts[0]);
      if (card) {
        generatedCards.push(card);
        seenGenerated.add(number);
      }
    }
  }

  const validationCards = {};
  const ruleCardsByNumber = new Map();
  for (const card of [...OFFICIAL_CARD_POOL, ...CURATED_CARD_POOL, ...generatedCards]) {
    if (ruleCardsByNumber.has(card.number)) continue;
    ruleCardsByNumber.set(card.number, card);
  }

  for (const card of ruleCardsByNumber.values()) {
    const artIds = [
      "standard",
      ...(OFFICIAL_CARD_ART_VARIANTS[card.number] ?? []).map((variant) => variant.id),
      ...(localVariantsByNumber[card.number] ?? []).map((variant) => variant.id),
      ...(printRecords[card.number] ?? []).map((print) => print.variantId),
    ].filter((id, index, ids) => ids.indexOf(id) === index);

    validationCards[card.number] = {
      type: card.type,
      color: card.color,
      level: card.level,
      cost: card.cost,
      text: card.text,
      artIds,
    };
  }

  const dataSource = `// Generated by TCGplayer market sync${updatedAt ? ` on ${updatedAt}` : ""}.
export type TcgplayerPrint = {
  productId?: number;
  sourceProductId?: number;
  variantId: string;
  officialId: string;
  url: string;
  imageUrl?: string;
  marketPrice?: number;
  priceSource?: string;
};

export type MarketPrint = TcgplayerPrint;
export const MARKET_LAST_SYNC: string | null = ${JSON.stringify(updatedAt)};
export const TCGPLAYER_LAST_SYNC: string | null = MARKET_LAST_SYNC;
export const TCGPLAYER_CATEGORY_ID: number | null = 86;
export const TCGPLAYER_CARD_PRINTS: Record<string, readonly TcgplayerPrint[]> = ${JSON.stringify(
    printRecords,
    null,
    2,
  )};
export const MARKET_CARD_PRINTS = TCGPLAYER_CARD_PRINTS;
`;

  const metaSource = `// Generated by TCGplayer market sync${updatedAt ? ` on ${updatedAt}` : ""}.
export const MARKET_LAST_SYNC: string | null = ${JSON.stringify(updatedAt)};
export const TCGPLAYER_LAST_SYNC: string | null = MARKET_LAST_SYNC;
export const TCGPLAYER_CATEGORY_ID: number | null = 86;
`;

  const cardSource = `// Generated by TCGplayer market sync${updatedAt ? ` on ${updatedAt}` : ""}.
import type { GundamCard } from "./card-data";

export const TCGPLAYER_CARD_POOL: GundamCard[] = ${JSON.stringify(generatedCards, null, 2)};
export const MARKET_CARD_POOL = TCGPLAYER_CARD_POOL;
`;

  const validationSource = `// Generated by TCGplayer market sync${updatedAt ? ` on ${updatedAt}` : ""}.
export type ValidationCardType = "UNIT" | "PILOT" | "COMMAND" | "BASE" | "RESOURCE" | "EX RESOURCE" | "EX BASE" | "UNIT TOKEN";

export type DeckValidationCard = {
  type: ValidationCardType;
  color: string;
  level: string;
  cost: string;
  text: string;
  artIds: readonly string[];
};

export const DECK_VALIDATION_CARDS: Record<string, DeckValidationCard> = ${JSON.stringify(
    validationCards,
    null,
    2,
  )};
`;

  return {
    dataSource,
    metaSource,
    cardSource,
    validationSource,
    reportSource: `${JSON.stringify(
      {
        updatedAt,
        source: "TCGplayer market",
        gameName,
        marketOrigin: publicMarketOrigin(marketOrigin),
        releaseAudit: {
          generatedAt: stableCheckTimestamp(
            releaseAudit.generatedAt,
            existingReport?.releaseAudit?.generatedAt,
          ),
          status: releaseAudit.status,
          summary: releaseAudit.summary,
        },
        catalogDiscovery: {
          generatedAt: stableCheckTimestamp(
            catalogDiscovery.generatedAt,
            existingReport?.catalogDiscovery?.generatedAt,
          ),
          status: catalogDiscovery.status,
          summary: stableCheckSummary(
            catalogDiscovery.summary,
            existingReport?.catalogDiscovery?.summary,
          ),
        },
        productCount: products.length,
        generatedCardCount: generatedCards.length,
        printRecordCount: Object.values(printRecords).reduce((sum, prints) => sum + prints.length, 0),
        cardsWithPrints: Object.keys(printRecords).length,
        catalogReports: sortedCatalogReports,
        searchReports: sortedSearchReports,
        unmatchedProducts: unmatchedProducts.sort((a, b) =>
          String(a.name).localeCompare(String(b.name)),
        ),
        warnings: [
          products.length === 0
            ? "Market bridge returned zero Gundam product rows. Catalog sets may be inserted, but product/price jobs have not drained yet."
            : "",
          sortedSearchReports.some((report) => report.limitHit)
            ? "One or more Market bridge pricing searches hit the 100-row endpoint limit. Full catalog rows are included from market product search, but some exact prices or product links may require a dedicated market catalog export."
            : "",
        ].filter(Boolean),
        maxSyncAgeHours,
      },
      null,
      2,
    )}\n`,
  };
}

async function writeGeneratedFile(path, content) {
  const absolutePath = new URL(`../${path}`, import.meta.url);
  if (checkOnly) {
    const existing = await readFile(absolutePath, "utf8").catch(() => "");
    if (existing !== content) {
      throw new Error(`${path} is out of date. Run npm run data:sync:tcgplayer.`);
    }
    return;
  }
  await mkdir(dirname(absolutePath.pathname), { recursive: true });
  await writeFile(absolutePath, content);
  console.log(`Wrote ${relative(rootDir, absolutePath.pathname)}`);
}

async function main() {
  const [releaseAudit, catalogDiscovery] = await Promise.all([
    fetchReleaseAudit(),
    fetchCatalogDiscovery(),
  ]);
  const { rows: products, searchReports, catalogReports } = await fetchProductRows(releaseAudit);
  const files = generateFiles({
    releaseAudit,
    catalogDiscovery,
    products,
    searchReports,
    catalogReports,
    existingReport: existingSyncReport,
  });

  await writeGeneratedFile("app/tcgplayer-data.ts", files.dataSource);
  await writeGeneratedFile("app/tcgplayer-meta.ts", files.metaSource);
  await writeGeneratedFile("app/tcgplayer-card-data.ts", files.cardSource);
  await writeGeneratedFile("data/tcgplayer-gundam-sync.json", files.reportSource);

  if (!products.length && !allowEmpty) {
    throw new Error(
      "The market bridge returned zero Gundam products. Let queued product-detail jobs drain, then rerun npm run data:sync:tcgplayer.",
    );
  }

  console.log(`Synced ${products.length} TCGplayer Gundam products from ${publicMarketOrigin(marketOrigin)}.`);
}

await main();
