#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CARD_ART_VARIANTS } from "../app/card-art-data.ts";
import { CARD_POOL as CURATED_CARD_POOL } from "../app/card-data.ts";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const apiBase = process.env.TCGPLAYER_API_BASE ?? "https://api.tcgplayer.com/v1.39.0";
const tokenUrl = process.env.TCGPLAYER_TOKEN_URL ?? "https://api.tcgplayer.com/token";
const categoryName = process.env.TCGPLAYER_CATEGORY_NAME ?? "Gundam Card Game";
const explicitCategoryId = Number(process.env.TCGPLAYER_CATEGORY_ID || 0) || null;
const publicKey = process.env.TCGPLAYER_PUBLIC_KEY ?? process.env.TCGPLAYER_CLIENT_ID;
const privateKey = process.env.TCGPLAYER_PRIVATE_KEY ?? process.env.TCGPLAYER_CLIENT_SECRET;
const checkOnly = process.argv.includes("--check");

if (!publicKey || !privateKey) {
  throw new Error(
    "Missing TCGplayer credentials. Set TCGPLAYER_PUBLIC_KEY and TCGPLAYER_PRIVATE_KEY.",
  );
}

const curatedByNumber = new Map(CURATED_CARD_POOL.map((card) => [card.number, card]));
const localVariantsByNumber = CARD_ART_VARIANTS;

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeKey(value) {
  return normalize(value).replace(/\s+/g, "");
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function cleanString(value, fallback = "-") {
  const next = String(value ?? "").replace(/\s+/g, " ").trim();
  return next || fallback;
}

function normalizeCardNumber(value) {
  const match = String(value ?? "")
    .toUpperCase()
    .match(/\b(?:GD|ST|EB|EXR|EX|R|PR|P)-?\d{3,4}\b/);
  if (!match) return "";
  return match[0].replace(/^(GD|ST|EB|EXR|EX|R|PR|P)(\d)/, "$1-$2");
}

function extendedFieldMap(product) {
  return Object.fromEntries(
    (product.extendedData ?? []).map((field) => [
      normalizeKey(field.displayName || field.name),
      cleanString(field.value, ""),
    ]),
  );
}

function field(fields, names, fallback = "") {
  for (const name of names) {
    const value = fields[normalizeKey(name)];
    if (value) return value;
  }
  return fallback;
}

function cardNumberForProduct(product) {
  const fields = extendedFieldMap(product);
  return (
    normalizeCardNumber(field(fields, ["Number", "Card Number", "No.", "No"])) ||
    normalizeCardNumber(product.name) ||
    normalizeCardNumber(product.cleanName) ||
    normalizeCardNumber(product.url)
  );
}

function colorFor(value) {
  const normalized = normalize(value);
  if (normalized.includes("blue")) return "Blue";
  if (normalized.includes("green")) return "Green";
  if (normalized.includes("red")) return "Red";
  if (normalized.includes("white")) return "White";
  if (normalized.includes("purple")) return "Purple";
  return "-";
}

function typeFor(value) {
  const normalized = normalize(value);
  if (normalized.includes("ex resource")) return "EX RESOURCE";
  if (normalized.includes("resource")) return "RESOURCE";
  if (normalized.includes("pilot")) return "PILOT";
  if (normalized.includes("command")) return "COMMAND";
  if (normalized.includes("base")) return "BASE";
  return "UNIT";
}

function plainProductName(product, number) {
  return cleanString(product.cleanName || product.name, "Unknown Card")
    .replace(new RegExp(`\\b${number.replace("-", "-?")}\\b`, "i"), "")
    .replace(/\((?:Alternate Art|Parallel|Foil|Holofoil|Normal)\)/gi, "")
    .replace(/\s+-\s+$/, "")
    .trim();
}

function isAltProduct(product) {
  const text = normalize(`${product.name} ${product.cleanName} ${product.url}`);
  return /\b(alt|alternate|parallel|foil|holo|special|promo)\b/.test(text);
}

function bestPriceForProduct(rows) {
  const candidates = rows
    .map((row) => ({
      price: safeNumber(row.marketPrice) ?? safeNumber(row.lowPrice) ?? safeNumber(row.midPrice),
      row,
    }))
    .filter((candidate) => candidate.price && candidate.price > 0);
  if (!candidates.length) return undefined;

  candidates.sort((a, b) => {
    const aName = normalize(a.row.subTypeName);
    const bName = normalize(b.row.subTypeName);
    const aNormal = aName === "normal" ? -1 : 0;
    const bNormal = bName === "normal" ? -1 : 0;
    if (aNormal !== bNormal) return aNormal - bNormal;
    return a.price - b.price;
  });
  return Math.round(candidates[0].price * 100) / 100;
}

async function getBearerToken() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: publicKey,
    client_secret: privateKey,
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw new Error(`TCGplayer auth failed (${response.status}): ${JSON.stringify(json)}`);
  }
  return `${json.token_type ?? "bearer"} ${json.access_token}`;
}

async function tcgRequest(path, bearerToken, { params, method = "GET", body } = {}) {
  const url = new URL(`${apiBase}${path}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: bearerToken,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.success === false) {
    throw new Error(`${method} ${url.pathname} failed (${response.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function fetchPaged(path, bearerToken, params = {}) {
  const results = [];
  const limit = Number(params.limit ?? 100);
  let offset = 0;
  let totalItems = Infinity;

  while (offset < totalItems) {
    const page = await tcgRequest(path, bearerToken, {
      params: { ...params, limit, offset },
    });
    results.push(...(page.results ?? []));
    totalItems = page.totalItems ?? results.length;
    if (!(page.results ?? []).length) break;
    offset += limit;
  }

  return results;
}

async function resolveCategoryId(bearerToken) {
  if (explicitCategoryId) return explicitCategoryId;

  const categories = await fetchPaged("/catalog/categories", bearerToken, {
    sortOrder: "categoryId",
    limit: 100,
  });
  const exact = categories.find((category) =>
    [category.name, category.displayName, category.seoCategoryName].some(
      (name) => normalize(name) === normalize(categoryName),
    ),
  );
  const fuzzy = categories.find((category) =>
    [category.name, category.displayName, category.seoCategoryName].some((name) =>
      normalize(name).includes("gundam"),
    ),
  );
  const match = exact ?? fuzzy;
  if (!match) {
    throw new Error(
      `Could not find a TCGplayer category for "${categoryName}". Set TCGPLAYER_CATEGORY_ID. Categories: ${categories
        .map((category) => `${category.categoryId}:${category.name}`)
        .join(", ")}`,
    );
  }
  return match.categoryId;
}

async function fetchProducts(bearerToken, categoryId) {
  const baseParams = {
    categoryId,
    getExtendedFields: true,
    includeSkus: false,
    limit: 100,
  };
  const cardProducts = await fetchPaged("/catalog/products", bearerToken, {
    ...baseParams,
    productTypes: "Cards",
  });
  if (cardProducts.length) return cardProducts;
  return fetchPaged("/catalog/products", bearerToken, baseParams);
}

function generatedCardFromProduct(product, groupName) {
  const number = cardNumberForProduct(product);
  if (!number || curatedByNumber.has(number)) return null;
  const fields = extendedFieldMap(product);
  return {
    number,
    name: field(fields, ["Name", "Product Name"], plainProductName(product, number)),
    rarity: field(fields, ["Rarity"], "C"),
    level: field(fields, ["Level", "Lv"], "-"),
    cost: field(fields, ["Cost"], "-"),
    color: colorFor(field(fields, ["Color", "Colour"])),
    type: typeFor(field(fields, ["Card Type", "Type", "Product Type"])),
    text: field(fields, ["Card Text", "Description", "Rules Text", "Text"], "-"),
    trait: field(fields, ["Trait", "Traits", "Feature"], "-"),
    link: field(fields, ["Link", "Link Conditions"], "-"),
    ap: field(fields, ["AP", "Attack"], "-"),
    hp: field(fields, ["HP", "Health"], "-"),
    source: field(fields, ["Source Title", "Source", "Title"], "-"),
    set: groupName,
  };
}

function generatedVariantId(index, localVariants) {
  return localVariants[index]?.id ?? (index === 0 ? "standard" : `p${index}`);
}

function generateFiles({ categoryId, products, groups, prices }) {
  const updatedAt = new Date().toISOString();
  const groupById = new Map(groups.map((group) => [group.groupId, group]));
  const productsByNumber = new Map();
  const unmatchedProducts = [];

  for (const product of products) {
    const number = cardNumberForProduct(product);
    if (!number) {
      unmatchedProducts.push({
        productId: product.productId,
        name: product.name,
        groupId: product.groupId,
        url: product.url,
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
      return String(a.name).localeCompare(String(b.name));
    });

    const localVariants = localVariantsByNumber[number] ?? [];
    printRecords[number] = groupedProducts.map((product, index) => {
      const group = groupById.get(product.groupId);
      const localVariant = localVariants[index];
      const officialId = localVariant?.officialId ?? (index === 0 ? number : `${number}_tcg${index}`);
      return {
        productId: product.productId,
        variantId: generatedVariantId(index, localVariants),
        officialId,
        name: product.name,
        groupName: group?.name ?? `Group ${product.groupId}`,
        url: product.url,
        imageUrl: product.imageUrl,
        marketPrice: prices.get(product.productId),
        priceSource: prices.has(product.productId) ? "TCGplayer market" : undefined,
        updatedAt,
      };
    });

    if (!curatedByNumber.has(number) && !seenGenerated.has(number)) {
      const groupName = groupById.get(groupedProducts[0].groupId)?.name ?? "TCGplayer";
      const card = generatedCardFromProduct(groupedProducts[0], groupName);
      if (card) {
        generatedCards.push(card);
        seenGenerated.add(number);
      }
    }
  }

  const dataSource = `// Generated by scripts/sync-tcgplayer.mjs on ${updatedAt}.
export type TcgplayerPrint = {
  productId: number;
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

export const TCGPLAYER_LAST_SYNC = ${JSON.stringify(updatedAt)};
export const TCGPLAYER_CATEGORY_ID = ${JSON.stringify(categoryId)};
export const TCGPLAYER_CARD_PRINTS: Record<string, readonly TcgplayerPrint[]> = ${JSON.stringify(
    printRecords,
    null,
    2,
  )};
`;

  const cardSource = `// Generated by scripts/sync-tcgplayer.mjs on ${updatedAt}.
import type { GundamCard } from "./card-data";

export const TCGPLAYER_CARD_POOL: GundamCard[] = ${JSON.stringify(generatedCards, null, 2)};
`;

  return {
    dataSource,
    cardSource,
    unmatchedSource: `${JSON.stringify(
      {
        updatedAt,
        categoryId,
        productCount: products.length,
        generatedCardCount: generatedCards.length,
        unmatchedProducts,
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
  const bearerToken = await getBearerToken();
  const categoryId = await resolveCategoryId(bearerToken);
  const [products, groups] = await Promise.all([
    fetchProducts(bearerToken, categoryId),
    fetchPaged("/catalog/groups", bearerToken, { categoryId, limit: 100 }),
  ]);
  const priceRows = [];
  for (const productIds of chunk(products.map((product) => product.productId), 100)) {
    const response = await tcgRequest(`/pricing/product/${productIds.join(",")}`, bearerToken);
    priceRows.push(...(response.results ?? []));
  }

  const priceRowsByProduct = new Map();
  for (const row of priceRows) {
    const current = priceRowsByProduct.get(row.productId) ?? [];
    current.push(row);
    priceRowsByProduct.set(row.productId, current);
  }
  const prices = new Map(
    [...priceRowsByProduct.entries()]
      .map(([productId, rows]) => [productId, bestPriceForProduct(rows)])
      .filter(([, price]) => price),
  );

  const files = generateFiles({ categoryId, products, groups, prices });
  await writeGeneratedFile("app/tcgplayer-data.ts", files.dataSource);
  await writeGeneratedFile("app/tcgplayer-card-data.ts", files.cardSource);
  await writeGeneratedFile("data/tcgplayer-unmatched.json", files.unmatchedSource);

  console.log(
    `Synced ${products.length} TCGplayer products, ${prices.size} prices, ${groups.length} groups.`,
  );
}

await main();
