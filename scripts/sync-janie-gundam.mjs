#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CARD_ART_VARIANTS } from "../app/card-art-data.ts";
import { CARD_POOL as CURATED_CARD_POOL } from "../app/card-data.ts";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const checkOnly = process.argv.includes("--check");
const allowEmpty = process.argv.includes("--allow-empty");
const syncConcurrency = clampNumber(process.env.JANIE_SYNC_CONCURRENCY, 4, 1, 8);
const gameName = process.env.JANIE_GUNDAM_GAME_NAME ?? "Gundam Card Game";
const maxSyncAgeHours = Number(process.env.JANIE_MAX_SYNC_HOURS ?? 48);
const janieConfig = readCodexJanieConfig();
const janieOrigin = (
  process.env.JANIE_API_ORIGIN ??
  process.env.API_ORIGIN ??
  janieConfig.JANIE_API_ORIGIN ??
  "https://janie.up.railway.app"
).replace(/\/$/, "");
const janieToken =
  process.env.JANIE_API_TOKEN ??
  process.env.JANIE_BEARER_TOKEN ??
  process.env.API_KEY ??
  process.env.ADMIN_API_KEY ??
  janieConfig.JANIE_API_TOKEN;

const curatedByNumber = new Map(CURATED_CARD_POOL.map((card) => [card.number, card]));
const localVariantsByNumber = CARD_ART_VARIANTS;

if (!janieToken) {
  throw new Error(
    "Missing Janie credentials. Set JANIE_API_TOKEN, or run locally with mcp_servers.janie-firehose configured in ~/.codex/config.toml.",
  );
}

function readCodexJanieConfig() {
  const configPath = `${homedir()}/.codex/config.toml`;
  if (!existsSync(configPath)) return {};
  const text = readFileSync(configPath, "utf8");
  const block = section(text, "mcp_servers.janie-firehose.env");
  return {
    JANIE_API_ORIGIN: readTomlString(block, "JANIE_API_ORIGIN"),
    JANIE_API_TOKEN: readTomlString(block, "JANIE_API_TOKEN"),
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
    set: cleanString(row.set_name, "Janie Market"),
  };
}

async function janieGet(path) {
  const url = new URL(path, janieOrigin);
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${janieToken}`,
      },
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (response.ok) return json;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`Janie GET ${url.pathname} failed (${response.status}): ${JSON.stringify(json)}`);
    }

    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 750 * attempt * attempt;
    await sleep(delayMs);
  }

  throw new Error(`Janie GET ${url.pathname} failed after ${maxAttempts} attempts.`);
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
  return janieGet(`/api/firehose/release-audit?${params.toString()}`);
}

async function fetchCatalogDiscovery() {
  const params = new URLSearchParams({
    targetGames: gameName,
    maxPages: "50",
    maxMissingGroups: "50",
  });
  return janieGet(`/api/diagnostics/catalog-discovery?${params.toString()}`).catch((error) => ({
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
  const payload = await janieGet(`/api/firehose/search?${params.toString()}`);
  return Array.isArray(payload.results) ? payload.results : [];
}

async function productSearch(query, setName, limit = 2000) {
  const params = new URLSearchParams({
    q: query,
    game: gameName,
    set: setName,
    limit: String(limit),
  });
  const payload = await janieGet(`/api/v1/products/search?${params.toString()}`);
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
  const janieProductId = safeNumber(row.product_id ?? row.id);
  if (janieProductId) return `janie:${janieProductId}`;
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

function generateFiles({ releaseAudit, catalogDiscovery, products, searchReports, catalogReports }) {
  const updatedAt = products.length ? new Date().toISOString() : null;
  const productsByNumber = new Map();
  const unmatchedProducts = [];

  for (const product of products) {
    const number = normalizeCardNumber(product.number) || normalizeCardNumber(product.product_name);
    if (!number) {
      unmatchedProducts.push({
        janieProductId: product.product_id,
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
    groupedProducts.sort((a, b) => {
      const altDelta = Number(isAltProduct(a)) - Number(isAltProduct(b));
      if (altDelta !== 0) return altDelta;
      return String(a.product_name).localeCompare(String(b.product_name));
    });

    const localVariants = localVariantsByNumber[number] ?? [];
    printRecords[number] = groupedProducts.map((product, index) => {
      const localVariant = localVariants[index];
      const officialId = localVariant?.officialId ?? (index === 0 ? number : `${number}_janie${index}`);
      const marketPrice = centsToDollars(product.market_price_cents);
      const tcgProductId = safeNumber(product.tcg_product_id) ?? safeNumber(product.product_id) ?? 0;
      return {
        productId: tcgProductId,
        janieProductId: safeNumber(product.product_id),
        variantId: generatedVariantId(index, localVariants),
        officialId,
        name: cleanString(product.product_name, "Unknown Product"),
        groupName: cleanString(product.set_name, "Janie Market"),
        url: tcgplayerProductUrl(product),
        imageUrl: product.image_url || undefined,
        marketPrice,
        priceSource: marketPrice ? "Janie via TCGplayer market" : undefined,
        updatedAt: updatedAt ?? new Date().toISOString(),
      };
    });

    if (!curatedByNumber.has(number) && !seenGenerated.has(number)) {
      const card = generatedCardFromProduct(groupedProducts[0]);
      if (card) {
        generatedCards.push(card);
        seenGenerated.add(number);
      }
    }
  }

  const dataSource = `// Generated by scripts/sync-janie-gundam.mjs${updatedAt ? ` on ${updatedAt}` : ""}.
export type TcgplayerPrint = {
  productId: number;
  janieProductId?: number;
  variantId: string;
  officialId: string;
  name: string;
  groupName: string;
  url: string;
  imageUrl?: string;
  marketPrice?: number;
  priceSource?: string;
  updatedAt: string;
};

export type MarketPrint = TcgplayerPrint;
export const JANIE_LAST_SYNC: string | null = ${JSON.stringify(updatedAt)};
export const MARKET_LAST_SYNC: string | null = JANIE_LAST_SYNC;
export const TCGPLAYER_LAST_SYNC: string | null = JANIE_LAST_SYNC;
export const TCGPLAYER_CATEGORY_ID: number | null = 86;
export const TCGPLAYER_CARD_PRINTS: Record<string, readonly TcgplayerPrint[]> = ${JSON.stringify(
    printRecords,
    null,
    2,
  )};
export const MARKET_CARD_PRINTS = TCGPLAYER_CARD_PRINTS;
`;

  const cardSource = `// Generated by scripts/sync-janie-gundam.mjs${updatedAt ? ` on ${updatedAt}` : ""}.
import type { GundamCard } from "./card-data";

export const TCGPLAYER_CARD_POOL: GundamCard[] = ${JSON.stringify(generatedCards, null, 2)};
export const MARKET_CARD_POOL = TCGPLAYER_CARD_POOL;
`;

  return {
    dataSource,
    cardSource,
    reportSource: `${JSON.stringify(
      {
        updatedAt,
        source: "Janie Firehose",
        gameName,
        janieOrigin,
        releaseAudit: {
          generatedAt: releaseAudit.generatedAt,
          status: releaseAudit.status,
          summary: releaseAudit.summary,
        },
        catalogDiscovery: {
          generatedAt: catalogDiscovery.generatedAt,
          status: catalogDiscovery.status,
          summary: catalogDiscovery.summary,
        },
        productCount: products.length,
        generatedCardCount: generatedCards.length,
        printRecordCount: Object.values(printRecords).reduce((sum, prints) => sum + prints.length, 0),
        cardsWithPrints: Object.keys(printRecords).length,
        catalogReports,
        searchReports,
        unmatchedProducts,
        warnings: [
          products.length === 0
            ? "Janie returned zero Gundam product rows. Catalog sets may be inserted, but product/price jobs have not drained yet."
            : "",
          searchReports.some((report) => report.limitHit)
            ? "One or more Janie Firehose pricing searches hit the 100-row endpoint limit. Full catalog rows are included from Janie product search, but some exact prices or product links may require a dedicated Janie catalog export."
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
      throw new Error(`${path} is out of date. Run npm run data:sync:janie.`);
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
  const files = generateFiles({ releaseAudit, catalogDiscovery, products, searchReports, catalogReports });

  await writeGeneratedFile("app/tcgplayer-data.ts", files.dataSource);
  await writeGeneratedFile("app/tcgplayer-card-data.ts", files.cardSource);
  await writeGeneratedFile("data/janie-gundam-sync.json", files.reportSource);

  if (!products.length && !allowEmpty) {
    throw new Error(
      "Janie is connected, but returned zero Gundam products. Let Janie's queued fetchProductDetails jobs drain, then rerun npm run data:sync:janie.",
    );
  }

  console.log(`Synced ${products.length} Janie Gundam products from ${janieOrigin}.`);
}

await main();
