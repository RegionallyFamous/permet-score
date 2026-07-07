#!/usr/bin/env node

import { CARD_POOL as CURATED_CARD_POOL } from "../app/card-data.ts";
import { TCGPLAYER_CARD_POOL } from "../app/tcgplayer-card-data.ts";
import {
  TCGPLAYER_CARD_PRINTS,
  TCGPLAYER_LAST_SYNC,
} from "../app/tcgplayer-data.ts";

const strict = process.argv.includes("--strict");
const minCardCount = Number(process.env.MIN_GUNDAM_CARD_COUNT ?? 700);
const minPrintCount = Number(process.env.MIN_GUNDAM_PRINT_COUNT ?? minCardCount);
const maxSyncAgeHours = Number(process.env.TCGPLAYER_MAX_SYNC_HOURS ?? 48);
const validTypes = new Set(["UNIT", "PILOT", "COMMAND", "BASE", "RESOURCE", "EX RESOURCE"]);
const validColors = new Set(["Blue", "Green", "Red", "White", "Purple", "-"]);

const cards = [...CURATED_CARD_POOL, ...TCGPLAYER_CARD_POOL];
const printCount = Object.values(TCGPLAYER_CARD_PRINTS).reduce(
  (sum, prints) => sum + prints.length,
  0,
);
const cardsWithPrints = Object.keys(TCGPLAYER_CARD_PRINTS).length;
const syncAgeHours = TCGPLAYER_LAST_SYNC
  ? Math.max(0, (Date.now() - new Date(TCGPLAYER_LAST_SYNC).getTime()) / 3_600_000)
  : null;

const errors = [];
const warnings = [];

function report(condition, message) {
  if (condition) return;
  if (strict) errors.push(message);
  else warnings.push(message);
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
report(printCount >= minPrintCount, `Only ${printCount} TCGplayer print records loaded; expected at least ${minPrintCount}.`);
report(Boolean(TCGPLAYER_LAST_SYNC), "TCGplayer snapshot is missing.");
report(
  syncAgeHours !== null && syncAgeHours <= maxSyncAgeHours,
  `TCGplayer snapshot is stale or missing; expected <= ${maxSyncAgeHours}h.`,
);

const summary = {
  strict,
  curatedCards: CURATED_CARD_POOL.length,
  tcgCards: TCGPLAYER_CARD_POOL.length,
  totalCards: cards.length,
  tcgPrints: printCount,
  tcgCardsWithPrints: cardsWithPrints,
  tcgplayerLastSync: TCGPLAYER_LAST_SYNC,
  syncAgeHours: syncAgeHours === null ? null : Math.round(syncAgeHours * 10) / 10,
  minCardCount,
  minPrintCount,
  maxSyncAgeHours,
  warnings,
  errors,
};

console.log(JSON.stringify(summary, null, 2));

if (errors.length) {
  throw new Error(`Data audit failed with ${errors.length} error(s).`);
}
