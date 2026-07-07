#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { CARD_ART_VARIANTS } from "../app/card-art-data.ts";
import { CARD_POOL as CURATED_CARD_POOL } from "../app/card-data.ts";
import { TCGPLAYER_CARD_POOL } from "../app/tcgplayer-card-data.ts";
import { TCGPLAYER_CARD_PRINTS } from "../app/tcgplayer-data.ts";

const checkOnly = process.argv.includes("--check");
const officialOrigin = "https://www.gundam-gcg.com";
const officialCardsUrl = `${officialOrigin}/en/cards/`;
const officialIndexUrl = `${officialOrigin}/en/cards/index.php`;
const officialDetailUrl = `${officialOrigin}/en/cards/detail.php`;
const rootDir = new URL("..", import.meta.url).pathname;
const requestHeaders = {
  "User-Agent": "PermetLinkDeckBuilder/0.1 (+https://permetlink.com)",
  "Accept-Language": "en-US,en;q=0.9",
};

function decodeHtml(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    "#039": "'",
    nbsp: " ",
  };
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+|#039);/g, (match, entity) => {
    if (entity in named) return named[entity];
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return match;
  });
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim(),
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function cleanField(value) {
  const text = htmlToText(value ?? "");
  return text || "-";
}

function normalizeType(value) {
  return cleanField(value).replace("・", " ");
}

function normalizeOfficialId(value) {
  return value.trim().replace(/\?.*$/, "");
}

function baseCardNumber(officialId) {
  return normalizeOfficialId(officialId).replace(/_p\d+$/i, "");
}

function variantIdForOfficialId(officialId, baseNumber) {
  const normalized = normalizeOfficialId(officialId);
  if (normalized === baseNumber) return "standard";
  const match = normalized.match(/_p(\d+)$/i);
  return match ? `p${match[1]}` : normalized.slice(baseNumber.length + 1) || "standard";
}

function absoluteOfficialUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.replace(/^["']|["']$/g, ""), `${officialOrigin}/en/cards/`).toString();
}

function syncTimestamp(existingReport) {
  if (process.env.OFFICIAL_RULES_SYNC_TIMESTAMP) {
    return process.env.OFFICIAL_RULES_SYNC_TIMESTAMP;
  }
  if (checkOnly && existingReport?.updatedAt) {
    return existingReport.updatedAt;
  }
  return new Date().toISOString();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...requestHeaders,
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Official rules fetch failed for ${url}: ${response.status}`);
  }
  return response.text();
}

function parsePackages(html) {
  const packages = [];
  const seen = new Set();
  const pattern =
    /<a[^>]*class="[^"]*js-selectBtn-package[^"]*"[^>]*data-val="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const id = decodeHtml(match[1].trim());
    const name = cleanField(match[2]);
    if (!id || !name || name === "ALL" || seen.has(id)) continue;
    seen.add(id);
    packages.push({ id, name });
  }
  return packages;
}

function parseListEntries(html) {
  const entries = [];
  const pattern =
    /data-src="detail\.php\?detailSearch=([^"]+)"[\s\S]*?<img[^>]*data-src="([^"]*)"[^>]*alt="([^"]*)"/g;
  for (const match of html.matchAll(pattern)) {
    const officialId = normalizeOfficialId(decodeHtml(match[1]));
    const baseNumber = baseCardNumber(officialId);
    entries.push({
      officialId,
      baseNumber,
      imageUrl: absoluteOfficialUrl(match[2]),
      name: decodeHtml(match[3]).trim(),
    });
  }
  return entries;
}

function parseDetail(detailId, html) {
  if (!html.includes("cardDetailPageCol")) {
    throw new Error(`${detailId} did not return a card detail page.`);
  }

  const requestedBaseNumber = baseCardNumber(detailId);
  const number =
    cleanField(html.match(/<div class="cardNo">\s*([\s\S]*?)\s*<\/div>/)?.[1] ?? "") ||
    requestedBaseNumber;
  const cardNumber = number === "-" ? requestedBaseNumber : number;
  const rarity = cleanField(html.match(/<div class="rarity">\s*([\s\S]*?)\s*<\/div>/)?.[1]);
  const name = cleanField(html.match(/<h1 class="cardName">([\s\S]*?)<\/h1>/)?.[1]);
  const imageUrl = absoluteOfficialUrl(
    html.match(/<div class="cardImage">[\s\S]*?<img\s+src=\s*"?\s*([^"\s>]+)[^>]*>/)?.[1] ?? "",
  );
  const overview = cleanField(
    html.match(
      /<div class="cardDataRow overview">[\s\S]*?<div class="dataTxt isRegular">([\s\S]*?)<\/div>/,
    )?.[1],
  );
  const fields = {};
  const pairPattern =
    /<dt class="dataTit">([\s\S]*?)<\/dt>\s*<dd class="dataTxt[^"]*">([\s\S]*?)<\/dd>/g;
  for (const match of html.matchAll(pairPattern)) {
    fields[cleanField(match[1])] = cleanField(match[2]);
  }

  return {
    number: cardNumber,
    name,
    rarity,
    level: fields["Lv."] ?? "-",
    cost: fields.COST ?? "-",
    color: fields.COLOR ?? "-",
    type: normalizeType(fields.TYPE ?? "-"),
    text: overview,
    trait: fields.Trait ?? "-",
    link: fields.Link ?? "-",
    ap: fields.AP ?? "-",
    hp: fields.HP ?? "-",
    source: fields["Source Title"] ?? "-",
    set: fields["Where to get it"] ?? "-",
    officialUrl: `${officialDetailUrl}?detailSearch=${encodeURIComponent(detailId)}`,
    imageUrl,
  };
}

function compareCardNumbers(a, b) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function mergeCardPools(officialCards, marketGeneratedCards) {
  const merged = new Map();
  for (const card of officialCards) merged.set(card.number, card);
  for (const card of CURATED_CARD_POOL) {
    if (!merged.has(card.number)) merged.set(card.number, card);
  }
  for (const card of marketGeneratedCards) {
    if (!merged.has(card.number)) merged.set(card.number, card);
  }
  return [...merged.values()].sort((a, b) => compareCardNumbers(a.number, b.number));
}

function validationArtIds(number, officialVariants) {
  return [
    "standard",
    ...(officialVariants[number] ?? []).map((variant) => variant.id),
    ...(CARD_ART_VARIANTS[number] ?? []).map((variant) => variant.id),
    ...(TCGPLAYER_CARD_PRINTS[number] ?? []).map((print) => print.variantId),
  ].filter((id, index, ids) => ids.indexOf(id) === index);
}

function generateValidationCards(cards, officialVariants) {
  return Object.fromEntries(
    cards.map((card) => [
      card.number,
      {
        type: card.type,
        color: card.color,
        level: card.level,
        cost: card.cost,
        text: card.text,
        artIds: validationArtIds(card.number, officialVariants),
      },
    ]),
  );
}

function cardReadyForMain(card) {
  return (
    ["UNIT", "PILOT", "COMMAND", "BASE"].includes(card.type) &&
    card.color !== "-" &&
    card.level !== "-" &&
    Number.isFinite(Number(card.cost))
  );
}

function cardReadyForResource(card) {
  return card.type === "RESOURCE";
}

async function discoverOfficialData() {
  const landingHtml = await fetchText(officialCardsUrl);
  const packages = parsePackages(landingHtml);
  const entriesByOfficialId = new Map();
  const packageReports = [];

  for (const officialPackage of packages) {
    const body = new URLSearchParams({ package: officialPackage.id });
    const html = await fetchText(officialIndexUrl, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: officialCardsUrl,
      },
    });
    const entries = parseListEntries(html);
    entries.forEach((entry) => entriesByOfficialId.set(entry.officialId, entry));
    packageReports.push({
      ...officialPackage,
      cardPrints: entries.length,
      uniqueCards: new Set(entries.map((entry) => entry.baseNumber)).size,
    });
  }

  const entries = [...entriesByOfficialId.values()].sort((a, b) =>
    compareCardNumbers(a.officialId, b.officialId),
  );
  const entriesByBase = new Map();
  for (const entry of entries) {
    const group = entriesByBase.get(entry.baseNumber) ?? [];
    group.push(entry);
    entriesByBase.set(entry.baseNumber, group);
  }

  return {
    packages,
    packageReports,
    entriesByBase,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }),
  );
  return results;
}

async function generateFiles() {
  const existingReport = JSON.parse(
    await readFile(new URL("../data/official-gundam-rules-sync.json", import.meta.url), "utf8").catch(
      () => "{}",
    ),
  );
  const updatedAt = syncTimestamp(existingReport);
  const { packages, packageReports, entriesByBase } = await discoverOfficialData();
  const review = [];
  const detailJobs = [...entriesByBase.entries()].map(([number, entries]) => {
    const preferred = entries.find((entry) => entry.officialId === number) ?? entries[0];
    return { number, detailId: preferred.officialId, entries };
  });

  const detailRecords = await mapWithConcurrency(detailJobs, 8, async (job) => {
    try {
      const html = await fetchText(
        `${officialDetailUrl}?detailSearch=${encodeURIComponent(job.detailId)}`,
        { headers: { Referer: officialCardsUrl } },
      );
      return parseDetail(job.detailId, html);
    } catch (error) {
      review.push({
        number: job.number,
        detailId: job.detailId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  const officialVariants = {};
  for (const [number, entries] of entriesByBase.entries()) {
    const variants = entries.map((entry) => ({
      id: variantIdForOfficialId(entry.officialId, number),
      officialId: entry.officialId,
      label:
        entry.officialId === number
          ? "Standard"
          : `Alt P${variantIdForOfficialId(entry.officialId, number).replace(/^p/i, "")}`,
      image: entry.imageUrl,
    }));
    officialVariants[number] = variants.filter(
      (variant, index, list) => list.findIndex((item) => item.id === variant.id) === index,
    );
  }

  const officialCards = detailRecords
    .filter(Boolean)
    .map((record) => ({
      number: record.number,
      name: record.name,
      rarity: record.rarity,
      level: record.level,
      cost: record.cost,
      color: record.color,
      type: record.type,
      text: record.text,
      trait: record.trait,
      link: record.link,
      ap: record.ap,
      hp: record.hp,
      source: record.source,
      set: record.set,
    }))
    .sort((a, b) => compareCardNumbers(a.number, b.number));
  const mergedCards = mergeCardPools(officialCards, TCGPLAYER_CARD_POOL);
  const validationCards = generateValidationCards(mergedCards, officialVariants);
  const officialNumbers = new Set(officialCards.map((card) => card.number));
  const marketNumbers = new Set([
    ...TCGPLAYER_CARD_POOL.map((card) => card.number),
    ...Object.keys(TCGPLAYER_CARD_PRINTS),
  ]);
  const marketCardsWithoutOfficialRules = [...marketNumbers]
    .filter((number) => !officialNumbers.has(number))
    .sort(compareCardNumbers);
  const officialCardsWithoutMarketProducts = officialCards
    .map((card) => card.number)
    .filter((number) => !marketNumbers.has(number))
    .sort(compareCardNumbers);
  const deckReadyCards = officialCards.filter(
    (card) => cardReadyForMain(card) || cardReadyForResource(card),
  );

  for (const card of officialCards) {
    if (!card.number || !card.name || !card.type) {
      review.push({
        number: card.number,
        reason: "required-field-missing",
        card,
      });
    }
    if (!["UNIT", "PILOT", "COMMAND", "BASE", "RESOURCE", "EX RESOURCE", "EX BASE", "UNIT TOKEN"].includes(card.type)) {
      review.push({
        number: card.number,
        reason: "unsupported-card-type",
        type: card.type,
      });
    }
  }

  const cardSource = `// Generated by official GUNDAM CARD GAME rules sync on ${updatedAt}.
import type { GundamCard } from "./card-data";

export type OfficialCardArtVariant = {
  id: string;
  officialId: string;
  label: string;
  image: string;
};

export const OFFICIAL_RULES_LAST_SYNC: string = ${JSON.stringify(updatedAt)};
export const OFFICIAL_RULES_SOURCE_URL = ${JSON.stringify(officialCardsUrl)};
export const OFFICIAL_CARD_POOL: GundamCard[] = ${JSON.stringify(officialCards, null, 2)};
export const OFFICIAL_CARD_ART_VARIANTS: Record<string, readonly OfficialCardArtVariant[]> = ${JSON.stringify(
    officialVariants,
    null,
    2,
  )};
`;

  const validationSource = `// Generated by official GUNDAM CARD GAME rules sync on ${updatedAt}.
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

  const report = {
    updatedAt,
    source: "Official GUNDAM CARD GAME card search",
    sourceUrl: officialCardsUrl,
    packageCount: packages.length,
    packageReports,
    officialCardCount: officialCards.length,
    officialPrintCount: [...entriesByBase.values()].reduce(
      (sum, entries) => sum + entries.length,
      0,
    ),
    deckReadyCards: deckReadyCards.length,
    marketCardsWithoutOfficialRules,
    officialCardsWithoutMarketProducts,
    reviewCount: review.length,
  };

  return {
    cardSource,
    validationSource,
    reportSource: `${JSON.stringify(report, null, 2)}\n`,
    reviewSource: `${JSON.stringify(review, null, 2)}\n`,
  };
}

async function writeGeneratedFile(path, content) {
  const absolutePath = new URL(`../${path}`, import.meta.url);
  if (checkOnly) {
    const existing = await readFile(absolutePath, "utf8").catch(() => "");
    if (existing !== content) {
      throw new Error(`${path} is out of date. Run npm run data:sync:official.`);
    }
    return;
  }
  await mkdir(dirname(absolutePath.pathname), { recursive: true });
  await writeFile(absolutePath, content);
  console.log(`Wrote ${relative(rootDir, absolutePath.pathname)}`);
}

const files = await generateFiles();
await writeGeneratedFile("app/official-rules-card-data.ts", files.cardSource);
await writeGeneratedFile("app/deck-validation-data.ts", files.validationSource);
await writeGeneratedFile("data/official-gundam-rules-sync.json", files.reportSource);
await writeGeneratedFile("data/official-gundam-rules-review.json", files.reviewSource);
