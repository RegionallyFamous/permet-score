"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clipboard,
  Download,
  Filter,
  Gauge,
  Layers,
  LayoutGrid,
  ListChecks,
  Minus,
  Plus,
  Radar,
  RotateCcw,
  Search,
  Share2,
  ShoppingCart,
  ShieldCheck,
  Sparkles,
  Shuffle,
  Trash2,
  Upload,
  WalletCards,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  CARD_ART_VARIANTS,
  type CardArtVariant,
} from "./card-art-data";
import {
  CARD_POOL,
  type CardColor,
  type CardType,
  type GundamCard,
} from "./card-data";

type QuantityMap = Record<string, number>;
type ArtChoiceMap = Record<string, string>;
type PrintChoiceMap = Record<string, QuantityMap>;
type DeckPrints = Record<"main" | "resource", PrintChoiceMap>;
type CollectionMap = Record<string, QuantityMap>;
type Zone = "main" | "resource";

type DeckState = {
  name: string;
  main: QuantityMap;
  resource: QuantityMap;
  art: ArtChoiceMap;
  prints: DeckPrints;
  collection: CollectionMap;
};

type DeckEntry = {
  card: GundamCard;
  quantity: number;
};

type Notice = {
  tone: "good" | "warn" | "bad";
  label: string;
  detail: string;
};

type CostSummary = {
  baseTotal: number;
  artTotal: number;
  altPremium: number;
  ownedValue: number;
  missingCost: number;
  neededCopies: number;
  ownedCopies: number;
  missingCopies: number;
};

type SynergyNotice = {
  tone: Notice["tone"];
  label: string;
  detail: string;
};

const STORAGE_KEY = "gundam-deck-builder-v1";
const MAIN_TARGET = 50;
const RESOURCE_TARGET = 10;
const MAIN_TYPES: CardType[] = ["UNIT", "PILOT", "COMMAND", "BASE"];
const RESOURCE_TYPES: CardType[] = ["RESOURCE"];
const TYPE_ORDER: Record<CardType, number> = {
  UNIT: 0,
  PILOT: 1,
  COMMAND: 2,
  BASE: 3,
  RESOURCE: 4,
  "EX RESOURCE": 5,
};

const colorFilters = ["All", "Blue", "Green", "Red", "White", "Purple"] as const;
const typeFilters = [
  "All",
  "UNIT",
  "PILOT",
  "COMMAND",
  "BASE",
  "RESOURCE",
  "EX RESOURCE",
] as const;
const artFilters = [
  "All Art",
  "Has Alt Art",
  "Standard Only",
  "P1 / +",
  "P2 / ++",
  "SP / High",
] as const;
const collectionFilters = ["All", "Owned", "Missing", "Budget"] as const;
const OPENING_HAND_SIZE = 5;
const DEFAULT_BUDGET_LIMIT = 5;

const CARD_BY_NUMBER = new Map(CARD_POOL.map((card) => [card.number, card]));
const CARD_ARTS_BY_NUMBER = CARD_ART_VARIANTS as Record<
  string,
  readonly CardArtVariant[]
>;
const HUD_TEXTURE_IMAGE = "/assets/permet-armor-ui-v2.webp";
const LAUNCH_TABLE_IMAGE = "/assets/mecha-deck-hangar.png";
const TCGPLAYER_SEARCH_URL = "https://www.tcgplayer.com/search/all/product";

const starterDeck: DeckState = {
  name: "Heroic Beginnings Shell",
  main: {
    "ST01-001": 4,
    "ST01-002": 3,
    "ST01-003": 4,
    "ST01-004": 4,
    "ST01-005": 4,
    "ST01-006": 3,
    "ST01-007": 3,
    "ST01-008": 2,
    "ST01-009": 1,
    "ST01-010": 4,
    "ST01-011": 3,
    "ST01-012": 3,
    "ST01-013": 2,
    "ST01-014": 4,
    "ST01-015": 3,
    "ST01-016": 3,
  },
  resource: {
    "R-001": 10,
  },
  art: {},
  prints: {
    main: {},
    resource: {},
  },
  collection: {},
};

function emptyDeck(): DeckState {
  return {
    name: "Untitled Deck",
    main: {},
    resource: {},
    art: {},
    prints: {
      main: {},
      resource: {},
    },
    collection: {},
  };
}

function clampQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.floor(quantity));
}

function sanitizeQuantities(value: unknown): QuantityMap {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([number, quantity]) => [number, clampQuantity(quantity)] as const)
      .filter(([number, quantity]) => quantity > 0 && CARD_BY_NUMBER.has(number)),
  );
}

function cardArtVariants(card: GundamCard) {
  return (
    CARD_ARTS_BY_NUMBER[card.number] ?? [
      {
        id: "standard",
        label: "Standard",
        image: `/card-images/${card.number}.webp`,
        tier: 0,
        officialId: card.number,
      },
    ]
  );
}

function sanitizeArtChoices(value: unknown): ArtChoiceMap {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([number, artId]) => {
        if (typeof artId !== "string") return false;
        const card = CARD_BY_NUMBER.get(number);
        return Boolean(
          card && cardArtVariants(card).some((variant) => variant.id === artId),
        );
      })
      .map(([number, artId]) => [number, artId as string]),
  );
}

function cleanQuantityMap(map: QuantityMap) {
  return Object.fromEntries(
    Object.entries(map).filter(([, quantity]) => quantity > 0),
  );
}

function validArtId(card: GundamCard, artId: string) {
  return cardArtVariants(card).some((variant) => variant.id === artId);
}

function normalizePrintQuantities(
  number: string,
  targetQuantity: number,
  rawValue: unknown,
  preferredArtId: string | undefined,
) {
  const card = CARD_BY_NUMBER.get(number);
  if (!card || targetQuantity <= 0) return {};

  const variants = cardArtVariants(card);
  const preferred =
    preferredArtId && validArtId(card, preferredArtId) ? preferredArtId : "standard";
  const next: QuantityMap = {};

  if (rawValue && typeof rawValue === "object") {
    Object.entries(rawValue as Record<string, unknown>).forEach(([artId, value]) => {
      if (!validArtId(card, artId)) return;
      const quantity = clampQuantity(value);
      if (quantity > 0) next[artId] = quantity;
    });
  }

  const total = totalCards(next);
  if (total === 0) {
    next[preferred] = targetQuantity;
    return next;
  }

  if (total < targetQuantity) {
    next[preferred] = (next[preferred] ?? 0) + targetQuantity - total;
    return cleanQuantityMap(next);
  }

  if (total > targetQuantity) {
    let overflow = total - targetQuantity;
    [...variants].reverse().forEach((variant) => {
      if (overflow <= 0) return;
      const quantity = next[variant.id] ?? 0;
      const removed = Math.min(quantity, overflow);
      next[variant.id] = quantity - removed;
      overflow -= removed;
    });
  }

  return cleanQuantityMap(next);
}

function sanitizeZonePrints(
  value: unknown,
  zoneQuantities: QuantityMap,
  artChoices: ArtChoiceMap,
) {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(zoneQuantities).map(([number, quantity]) => [
      number,
      normalizePrintQuantities(number, quantity, raw[number], artChoices[number]),
    ]),
  );
}

function sanitizePrints(
  value: unknown,
  main: QuantityMap,
  resource: QuantityMap,
  artChoices: ArtChoiceMap,
): DeckPrints {
  const raw = value && typeof value === "object" ? (value as Partial<DeckPrints>) : {};
  return {
    main: sanitizeZonePrints(raw.main, main, artChoices),
    resource: sanitizeZonePrints(raw.resource, resource, artChoices),
  };
}

function sanitizeCollection(value: unknown): CollectionMap {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([number, quantities]) => {
        const card = CARD_BY_NUMBER.get(number);
        if (!card || !quantities || typeof quantities !== "object") return null;
        const next = Object.fromEntries(
          Object.entries(quantities as Record<string, unknown>)
            .map(([artId, quantity]) => [artId, clampQuantity(quantity)] as const)
            .filter(
              ([artId, quantity]) => quantity > 0 && validArtId(card, artId),
            ),
        );
        return Object.keys(next).length ? ([number, next] as const) : null;
      })
      .filter((entry): entry is readonly [string, QuantityMap] => Boolean(entry)),
  );
}

function sanitizeDeck(value: unknown): DeckState | null {
  if (!value || typeof value !== "object") return null;
  const maybeDeck = value as Partial<DeckState>;
  const main = sanitizeQuantities(maybeDeck.main);
  const resource = sanitizeQuantities(maybeDeck.resource);
  const art = sanitizeArtChoices(maybeDeck.art);
  return {
    name:
      typeof maybeDeck.name === "string" && maybeDeck.name.trim()
        ? maybeDeck.name
        : "Imported Deck",
    main,
    resource,
    art,
    prints: sanitizePrints(maybeDeck.prints, main, resource, art),
    collection: sanitizeCollection(maybeDeck.collection),
  };
}

function sharePayload(deck: DeckState) {
  return {
    v: 1,
    name: deck.name,
    main: deck.main,
    resource: deck.resource,
    art: deck.art,
    prints: deck.prints,
  };
}

function deckEntries(quantities: QuantityMap) {
  return Object.entries(quantities)
    .map(([number, quantity]) => {
      const card = CARD_BY_NUMBER.get(number);
      return card ? { card, quantity } : null;
    })
    .filter((entry): entry is DeckEntry => Boolean(entry))
    .sort((a, b) => {
      const typeDelta = TYPE_ORDER[a.card.type] - TYPE_ORDER[b.card.type];
      if (typeDelta !== 0) return typeDelta;
      const costDelta = Number(a.card.cost || 0) - Number(b.card.cost || 0);
      if (costDelta !== 0) return costDelta;
      return a.card.name.localeCompare(b.card.name);
    });
}

function totalCards(quantities: QuantityMap) {
  return Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
}

function getArtVariant(card: GundamCard, choices: ArtChoiceMap) {
  const variants = cardArtVariants(card);
  return (
    variants.find((variant) => variant.id === choices[card.number]) ?? variants[0]
  );
}

function cardImagePath(card: GundamCard, variant?: CardArtVariant) {
  return variant?.image ?? cardArtVariants(card)[0].image;
}

function printCostBase(card: GundamCard) {
  const rarityBase: Record<string, number> = {
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

function artTierMultiplier(tier: number) {
  if (tier <= 0) return 1;
  return [1, 2.5, 5, 8.5, 13, 19, 27, 38][tier] ?? 38 + (tier - 7) * 12;
}

function estimatePrintCost(card: GundamCard, variant: CardArtVariant) {
  const value = printCostBase(card) * artTierMultiplier(variant.tier);
  return Math.max(0.05, Math.round(value * 100) / 100);
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
}

function formatEstimatedMoney(value: number) {
  return `Est. ${formatMoney(value)}`;
}

function tcgplayerSearchUrl(card: GundamCard, variant?: CardArtVariant) {
  const params = new URLSearchParams({
    page: "1",
    productLineName: "gundam-card-game",
    q: `${variant?.officialId ?? card.number} ${card.name} Gundam Card Game`,
    view: "grid",
  });

  return `${TCGPLAYER_SEARCH_URL}?${params.toString()}`;
}

function colorAccentClass(color: CardColor) {
  switch (color) {
    case "Blue":
      return "border-[#2e8cff] text-[#d9ecff] shadow-[#0e3a80]/30";
    case "Green":
      return "border-[#28d17c] text-[#d9ffe9] shadow-[#063b22]/30";
    case "Red":
      return "border-[#e31b23] text-[#ffe3e3] shadow-[#650b10]/30";
    case "White":
      return "border-[#f7f7f2] text-[#f7f7f2] shadow-black/30";
    case "Purple":
      return "border-[#8f7bff] text-[#eeeaff] shadow-[#24135f]/30";
    default:
      return "border-[#8b8f99] text-[#f7f7f2] shadow-black/30";
  }
}

function colorChipClass(color: CardColor) {
  switch (color) {
    case "Blue":
      return "border-[#2e8cff]/45 bg-[#1167d8]/18 text-[#d9ecff]";
    case "Green":
      return "border-[#28d17c]/45 bg-[#28d17c]/14 text-[#d9ffe9]";
    case "Red":
      return "border-[#e31b23]/55 bg-[#e31b23]/16 text-[#ffe3e3]";
    case "White":
      return "border-[#f7f7f2]/50 bg-[#f7f7f2]/12 text-[#f7f7f2]";
    case "Purple":
      return "border-[#8f7bff]/45 bg-[#8f7bff]/14 text-[#eeeaff]";
    default:
      return "border-[#8b8f99]/50 bg-[#8b8f99]/12 text-[#d6d8dd]";
  }
}

function noticeClass(tone: Notice["tone"]) {
  switch (tone) {
    case "good":
      return "border-[#2e8cff]/35 bg-[#1167d8]/14 text-[#d9ecff]";
    case "warn":
      return "border-[#f6c542]/35 bg-[#f6c542]/12 text-[#fff2bd]";
    case "bad":
      return "border-[#e31b23]/40 bg-[#e31b23]/14 text-[#ffe3e3]";
  }
}

function panelClass(extra = "") {
  return `gcg-panel rounded-sm shadow-2xl shadow-black/30 backdrop-blur ${extra}`;
}

function buildDeckList(deck: DeckState) {
  const main = deckEntries(deck.main);
  const resource = deckEntries(deck.resource);
  const mainLines = main.flatMap(({ card }) => printLinesForCard(deck, "main", card));
  const resourceLines = resource.flatMap(({ card }) =>
    printLinesForCard(deck, "resource", card),
  );

  return [
    deck.name,
    "",
    `Main Deck (${totalCards(deck.main)})`,
    ...mainLines,
    "",
    `Resource Deck (${totalCards(deck.resource)})`,
    ...resourceLines,
  ].join("\n");
}

function printLinesForCard(deck: DeckState, zone: Zone, card: GundamCard) {
  return printEntriesForCard(deck, zone, card).map(({ variant, quantity }) => {
    const artLabel = variant.id === "standard" ? "" : ` [${variant.label}]`;
    return `${quantity} ${card.number} ${card.name}${artLabel}`;
  });
}

function printEntriesForCard(deck: DeckState, zone: Zone, card: GundamCard) {
  const printMap =
    deck.prints[zone][card.number] ??
    normalizePrintQuantities(
      card.number,
      deck[zone][card.number] ?? 0,
      null,
      deck.art[card.number],
    );

  return cardArtVariants(card)
    .map((variant) => ({
      variant,
      quantity: printMap[variant.id] ?? 0,
    }))
    .filter((entry) => entry.quantity > 0);
}

function getNeededPrintCount(deck: DeckState, card: GundamCard, variantId: string) {
  return (["main", "resource"] as const).reduce((sum, zone) => {
    return sum + (deck.prints[zone][card.number]?.[variantId] ?? 0);
  }, 0);
}

function getOwnedPrintCount(collection: CollectionMap, card: GundamCard, variantId: string) {
  return collection[card.number]?.[variantId] ?? 0;
}

function getTotalOwnedForCard(collection: CollectionMap, card: GundamCard) {
  return totalCards(collection[card.number] ?? {});
}

function getTotalNeededForCard(deck: DeckState, card: GundamCard) {
  return (deck.main[card.number] ?? 0) + (deck.resource[card.number] ?? 0);
}

function getMissingCopiesForCard(deck: DeckState, card: GundamCard) {
  return cardArtVariants(card).reduce((sum, variant) => {
    const needed = getNeededPrintCount(deck, card, variant.id);
    const owned = getOwnedPrintCount(deck.collection, card, variant.id);
    return sum + Math.max(0, needed - owned);
  }, 0);
}

function summarizeDeckCosts(deck: DeckState): CostSummary {
  const consumedOwned: QuantityMap = {};
  const summary: CostSummary = {
    baseTotal: 0,
    artTotal: 0,
    altPremium: 0,
    ownedValue: 0,
    missingCost: 0,
    neededCopies: 0,
    ownedCopies: 0,
    missingCopies: 0,
  };

  (["main", "resource"] as const).forEach((zone) => {
    deckEntries(deck[zone]).forEach(({ card }) => {
      const standard = cardArtVariants(card)[0];
      const standardCost = estimatePrintCost(card, standard);

      printEntriesForCard(deck, zone, card).forEach(({ variant, quantity }) => {
        const cost = estimatePrintCost(card, variant);
        const key = `${card.number}:${variant.id}`;
        const owned = getOwnedPrintCount(deck.collection, card, variant.id);
        const alreadyConsumed = consumedOwned[key] ?? 0;
        const availableOwned = Math.max(0, owned - alreadyConsumed);
        const covered = Math.min(quantity, availableOwned);
        const missing = quantity - covered;

        consumedOwned[key] = alreadyConsumed + covered;
        summary.baseTotal += standardCost * quantity;
        summary.artTotal += cost * quantity;
        summary.ownedValue += cost * covered;
        summary.missingCost += cost * missing;
        summary.neededCopies += quantity;
        summary.ownedCopies += covered;
        summary.missingCopies += missing;
      });
    });
  });

  summary.altPremium = Math.max(0, summary.artTotal - summary.baseTotal);
  return summary;
}

function artReadyCards(deck: DeckState) {
  return [...deckEntries(deck.main), ...deckEntries(deck.resource)].reduce((sum, entry) => {
    return sum + (cardArtVariants(entry.card).length > 1 ? entry.quantity : 0);
  }, 0);
}

function countByType(entries: DeckEntry[]) {
  return MAIN_TYPES.reduce(
    (counts, type) => ({
      ...counts,
      [type]: entries
        .filter((entry) => entry.card.type === type)
        .reduce((sum, entry) => sum + entry.quantity, 0),
    }),
    {} as Record<(typeof MAIN_TYPES)[number], number>,
  );
}

function parseCost(card: GundamCard) {
  const cost = Number(card.cost);
  return Number.isFinite(cost) ? cost : null;
}

function typeTarget(type: CardType) {
  switch (type) {
    case "UNIT":
      return "25-28";
    case "PILOT":
      return "6-8";
    case "COMMAND":
      return "8-10";
    case "BASE":
      return "4-6";
    default:
      return "-";
  }
}

function variantMatchesArtFilter(
  card: GundamCard,
  variant: CardArtVariant,
  filter: (typeof artFilters)[number],
) {
  const variants = cardArtVariants(card);
  switch (filter) {
    case "Has Alt Art":
      return variants.length > 1;
    case "Standard Only":
      return variant.id === "standard";
    case "P1 / +":
      return variant.tier === 1;
    case "P2 / ++":
      return variant.tier === 2;
    case "SP / High":
      return variant.tier >= 3;
    default:
      return true;
  }
}

function cardMatchesCollectionFilter(
  deck: DeckState,
  card: GundamCard,
  filter: (typeof collectionFilters)[number],
  budgetLimit: number,
) {
  const needed = getTotalNeededForCard(deck, card);
  const owned = getTotalOwnedForCard(deck.collection, card);
  const missing = getMissingCopiesForCard(deck, card);
  const selectedCost = estimatePrintCost(card, getArtVariant(card, deck.art));

  switch (filter) {
    case "Owned":
      return owned > 0;
    case "Missing":
      return needed > 0 && missing > 0;
    case "Budget":
      return selectedCost <= budgetLimit;
    default:
      return true;
  }
}

function normalizeLinkName(value: string) {
  return value
    .replace(/[[\]().]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function analyzeSynergy(entries: DeckEntry[]): SynergyNotice[] {
  const units = entries.filter((entry) => entry.card.type === "UNIT");
  const pilots = entries.filter((entry) => entry.card.type === "PILOT");
  const notices: SynergyNotice[] = [];

  pilots.forEach((pilot) => {
    const pilotName = normalizeLinkName(pilot.card.name);
    const targetCount = units
      .filter((unit) => normalizeLinkName(unit.card.link).includes(pilotName))
      .reduce((sum, unit) => sum + unit.quantity, 0);

    if (targetCount === 0) {
      notices.push({
        tone: "warn",
        label: pilot.card.name,
        detail: "No linked Units",
      });
    } else {
      notices.push({
        tone: targetCount >= 4 ? "good" : "warn",
        label: pilot.card.name,
        detail: `${targetCount} linked Units`,
      });
    }
  });

  units.forEach((unit) => {
    const link = normalizeLinkName(unit.card.link);
    if (!link || link === "-") return;
    const hasPilot = pilots.some((pilot) => link.includes(normalizeLinkName(pilot.card.name)));
    if (!hasPilot) {
      notices.push({
        tone: "warn",
        label: unit.card.name,
        detail: "Linked pilot missing",
      });
    }
  });

  return notices.slice(0, 8);
}

function clonePrints(prints: DeckPrints): DeckPrints {
  return {
    main: Object.fromEntries(
      Object.entries(prints.main).map(([number, quantities]) => [
        number,
        { ...quantities },
      ]),
    ),
    resource: Object.fromEntries(
      Object.entries(prints.resource).map(([number, quantities]) => [
        number,
        { ...quantities },
      ]),
    ),
  };
}

function shiftOnePrint(
  printMap: PrintChoiceMap,
  card: GundamCard,
  delta: number,
) {
  const variants = cardArtVariants(card);
  const quantities = { ...(printMap[card.number] ?? {}) };
  const indexes =
    delta > 0
      ? variants.slice(0, -1).map((_, index) => index)
      : variants.slice(1).map((_, index) => variants.length - 1 - index);

  for (const index of indexes) {
    const fromVariant = variants[index];
    const toVariant = variants[index + (delta > 0 ? 1 : -1)];
    if ((quantities[fromVariant.id] ?? 0) <= 0) continue;

    quantities[fromVariant.id] = (quantities[fromVariant.id] ?? 0) - 1;
    quantities[toVariant.id] = (quantities[toVariant.id] ?? 0) + 1;
    printMap[card.number] = cleanQuantityMap(quantities);
    return toVariant.id;
  }

  return null;
}

function shiftAllPrints(printMap: PrintChoiceMap, card: GundamCard, delta: number) {
  const variants = cardArtVariants(card);
  const current = printMap[card.number] ?? {};
  const next: QuantityMap = {};

  variants.forEach((variant, index) => {
    const quantity = current[variant.id] ?? 0;
    if (!quantity) return;
    const targetIndex = Math.max(0, Math.min(variants.length - 1, index + delta));
    const target = variants[targetIndex];
    next[target.id] = (next[target.id] ?? 0) + quantity;
  });

  printMap[card.number] = cleanQuantityMap(next);
}

function addPrintCopies(
  printMap: PrintChoiceMap,
  card: GundamCard,
  artId: string,
  quantity: number,
) {
  const safeArtId = validArtId(card, artId) ? artId : "standard";
  const current = { ...(printMap[card.number] ?? {}) };
  current[safeArtId] = (current[safeArtId] ?? 0) + quantity;
  printMap[card.number] = cleanQuantityMap(current);
}

function removePrintCopies(
  printMap: PrintChoiceMap,
  card: GundamCard,
  preferredArtId: string,
  quantity: number,
) {
  const variants = cardArtVariants(card);
  const current = { ...(printMap[card.number] ?? {}) };
  let remaining = quantity;
  const order = [
    preferredArtId,
    ...[...variants].reverse().map((variant) => variant.id),
  ].filter((artId, index, all) => all.indexOf(artId) === index);

  order.forEach((artId) => {
    if (remaining <= 0) return;
    const available = current[artId] ?? 0;
    const removed = Math.min(available, remaining);
    current[artId] = available - removed;
    remaining -= removed;
  });

  const cleaned = cleanQuantityMap(current);
  if (Object.keys(cleaned).length) {
    printMap[card.number] = cleaned;
  } else {
    delete printMap[card.number];
  }
}

function drawOpeningHandNumbers(quantities: QuantityMap) {
  const deckNumbers = Object.entries(quantities).flatMap(([number, quantity]) =>
    Array.from({ length: quantity }, () => number),
  );

  for (let index = deckNumbers.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const swapIndex = Math.floor(random * (index + 1));
    [deckNumbers[index], deckNumbers[swapIndex]] = [
      deckNumbers[swapIndex],
      deckNumbers[index],
    ];
  }

  return deckNumbers.slice(0, OPENING_HAND_SIZE);
}

type DeckBuilderProps = {
  sharedDeckId?: string;
};

type MobileView = "library" | "card" | "deck" | "stats";

type SharedStatus = "local" | "loading" | "ready" | "missing" | "cloned";

const mobileViews: Array<{
  id: MobileView;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "library", label: "Library", icon: <LayoutGrid size={18} /> },
  { id: "card", label: "Scan", icon: <Sparkles size={18} /> },
  { id: "deck", label: "Deck", icon: <ListChecks size={18} /> },
  { id: "stats", label: "Stats", icon: <Activity size={18} /> },
];

export function DeckBuilder({ sharedDeckId }: DeckBuilderProps = {}) {
  const [deck, setDeck] = useState<DeckState>(starterDeck);
  const [loaded, setLoaded] = useState(false);
  const [sharedStatus, setSharedStatus] = useState<SharedStatus>(
    sharedDeckId ? "loading" : "local",
  );
  const [mobileView, setMobileView] = useState<MobileView>("library");
  const [query, setQuery] = useState("");
  const [colorFilter, setColorFilter] =
    useState<(typeof colorFilters)[number]>("All");
  const [typeFilter, setTypeFilter] =
    useState<(typeof typeFilters)[number]>("All");
  const [setFilter, setSetFilter] = useState("All");
  const [artFilter, setArtFilter] =
    useState<(typeof artFilters)[number]>("All Art");
  const [collectionFilter, setCollectionFilter] =
    useState<(typeof collectionFilters)[number]>("All");
  const [budgetLimit, setBudgetLimit] = useState(DEFAULT_BUDGET_LIMIT);
  const [openingHand, setOpeningHand] = useState<string[]>([]);
  const [drawCount, setDrawCount] = useState(0);
  const [selectedNumber, setSelectedNumber] = useState("ST01-001");
  const [copyState, setCopyState] = useState("Copy");
  const [shareState, setShareState] = useState("Share");
  const [lastShareUrl, setLastShareUrl] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialDeck() {
      if (cancelled) return;

      if (sharedDeckId) {
        setSharedStatus("loading");
        try {
          const response = await fetch(`/api/decks/${encodeURIComponent(sharedDeckId)}`);
          if (response.ok) {
            const data = (await response.json()) as { deck?: unknown };
            const parsed = sanitizeDeck(data.deck);
            if (parsed) {
              setDeck(parsed);
              setSharedStatus("ready");
            } else {
              setSharedStatus("missing");
            }
          } else {
            setSharedStatus("missing");
          }
        } catch {
          setSharedStatus("missing");
        }
        if (!cancelled) setLoaded(true);
        return;
      }

      setSharedStatus("local");

      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = sanitizeDeck(JSON.parse(stored));
          if (parsed) setDeck(parsed);
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
      setLoaded(true);
    }

    void loadInitialDeck();

    return () => {
      cancelled = true;
    };
  }, [sharedDeckId]);

  useEffect(() => {
    if (loaded) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
    }
  }, [deck, loaded]);

  const mainEntries = useMemo(() => deckEntries(deck.main), [deck.main]);
  const resourceEntries = useMemo(
    () => deckEntries(deck.resource),
    [deck.resource],
  );
  const mainTotal = useMemo(() => totalCards(deck.main), [deck.main]);
  const resourceTotal = useMemo(
    () => totalCards(deck.resource),
    [deck.resource],
  );
  const deckList = useMemo(() => buildDeckList(deck), [deck]);
  const costSummary = useMemo(() => summarizeDeckCosts(deck), [deck]);
  const altReadyTotal = useMemo(() => artReadyCards(deck), [deck]);
  const synergyNotices = useMemo(() => analyzeSynergy(mainEntries), [mainEntries]);
  const setOptions = useMemo(
    () => ["All", ...Array.from(new Set(CARD_POOL.map((card) => card.set)))],
    [],
  );
  const openingHandEntries = useMemo(
    () =>
      openingHand
        .map((number) => CARD_BY_NUMBER.get(number))
        .filter((card): card is GundamCard => Boolean(card)),
    [openingHand],
  );

  const filteredCards = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return CARD_POOL.filter((card) => {
      const selectedVariant = getArtVariant(card, deck.art);
      const matchesQuery =
        !normalizedQuery ||
        [card.name, card.number, card.text, card.trait, card.link, card.source, card.set]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesColor = colorFilter === "All" || card.color === colorFilter;
      const matchesType = typeFilter === "All" || card.type === typeFilter;
      const matchesSet = setFilter === "All" || card.set === setFilter;
      const matchesArt = variantMatchesArtFilter(card, selectedVariant, artFilter);
      const matchesCollection = cardMatchesCollectionFilter(
        deck,
        card,
        collectionFilter,
        budgetLimit,
      );
      return (
        matchesQuery &&
        matchesColor &&
        matchesType &&
        matchesSet &&
        matchesArt &&
        matchesCollection
      );
    });
  }, [
    artFilter,
    budgetLimit,
    collectionFilter,
    colorFilter,
    deck,
    deferredQuery,
    setFilter,
    typeFilter,
  ]);

  const selectedCard =
    CARD_BY_NUMBER.get(selectedNumber) ?? filteredCards[0] ?? CARD_POOL[0];
  const selectedArtVariants = useMemo(
    () => cardArtVariants(selectedCard),
    [selectedCard],
  );
  const selectedArtVariant = useMemo(
    () => getArtVariant(selectedCard, deck.art),
    [deck.art, selectedCard],
  );
  const selectedArtCost = useMemo(
    () => estimatePrintCost(selectedCard, selectedArtVariant),
    [selectedArtVariant, selectedCard],
  );
  const selectedNeededCount = useMemo(
    () => getNeededPrintCount(deck, selectedCard, selectedArtVariant.id),
    [deck, selectedArtVariant, selectedCard],
  );
  const selectedOwnedCount = useMemo(
    () => getOwnedPrintCount(deck.collection, selectedCard, selectedArtVariant.id),
    [deck.collection, selectedArtVariant, selectedCard],
  );
  const typeCounts = useMemo(() => countByType(mainEntries), [mainEntries]);

  const deckColors = useMemo(() => {
    return Array.from(
      new Set(
        mainEntries
          .filter(
            (entry) => MAIN_TYPES.includes(entry.card.type) && entry.card.color !== "-",
          )
          .map((entry) => entry.card.color),
      ),
    );
  }, [mainEntries]);

  const costCurve = useMemo(() => {
    const buckets = Array.from({ length: 8 }, (_, index) => ({
      cost: index + 1,
      count: 0,
    }));
    mainEntries.forEach((entry) => {
      const cost = parseCost(entry.card);
      if (!cost) return;
      const bucket = buckets[Math.min(cost, 8) - 1];
      bucket.count += entry.quantity;
    });
    return buckets;
  }, [mainEntries]);

  const notices = useMemo<Notice[]>(() => {
    const messages: Notice[] = [];

    messages.push(
      mainTotal === MAIN_TARGET
        ? { tone: "good", label: "Main deck", detail: "50 cards" }
        : {
            tone: "bad",
            label: "Main deck",
            detail: `${mainTotal}/${MAIN_TARGET} cards`,
          },
    );

    messages.push(
      resourceTotal === RESOURCE_TARGET
        ? { tone: "good", label: "Resource", detail: "10 cards" }
        : {
            tone: "bad",
            label: "Resource",
            detail: `${resourceTotal}/${RESOURCE_TARGET} cards`,
          },
    );

    if (deckColors.length > 2) {
      messages.push({
        tone: "bad",
        label: "Colors",
        detail: `${deckColors.length} selected`,
      });
    } else if (deckColors.length > 0) {
      messages.push({
        tone: "good",
        label: "Colors",
        detail: deckColors.join(" / "),
      });
    } else {
      messages.push({ tone: "warn", label: "Colors", detail: "No colors" });
    }

    const overLimit = mainEntries.filter((entry) => entry.quantity > 4);
    messages.push(
      overLimit.length
        ? {
            tone: "bad",
            label: "Copies",
            detail: `${overLimit.length} over 4`,
          }
        : { tone: "good", label: "Copies", detail: "Clean" },
    );

    const invalidMainTypes = mainEntries.filter(
      (entry) => !MAIN_TYPES.includes(entry.card.type),
    );
    const invalidResourceTypes = resourceEntries.filter(
      (entry) => !RESOURCE_TYPES.includes(entry.card.type),
    );
    messages.push(
      invalidMainTypes.length || invalidResourceTypes.length
        ? { tone: "bad", label: "Zones", detail: "Mismatch" }
        : { tone: "good", label: "Zones", detail: "Clean" },
    );

    if (mainTotal === MAIN_TARGET) {
      const checks = [
        ["Units", typeCounts.UNIT, 25, 28],
        ["Pilots", typeCounts.PILOT, 6, 8],
        ["Commands", typeCounts.COMMAND, 8, 10],
        ["Bases", typeCounts.BASE, 4, 6],
      ] as const;

      checks.forEach(([label, count, min, max]) => {
        if (count < min || count > max) {
          messages.push({
            tone: "warn",
            label,
            detail: `${count}, target ${min}-${max}`,
          });
        }
      });
    }

    return messages;
  }, [deckColors, mainEntries, mainTotal, resourceEntries, resourceTotal, typeCounts]);

  const isLegal = notices.every((notice) => notice.tone !== "bad");

  function stepCardArt(number: string, delta: number) {
    setDeck((current) => {
      const card = CARD_BY_NUMBER.get(number);
      if (!card) return current;
      const nextPrints = clonePrints(current.prints);
      const nextArt = { ...current.art };
      const zones: Zone[] = (current.main[number] ?? 0) > 0 ? ["main"] : ["resource"];
      let shiftedArtId: string | null = null;

      zones.forEach((zone) => {
        if (shiftedArtId) return;
        shiftedArtId = shiftOnePrint(nextPrints[zone], card, delta);
      });

      if (shiftedArtId) {
        if (shiftedArtId === "standard") {
          delete nextArt[number];
        } else {
          nextArt[number] = shiftedArtId;
        }
        return { ...current, art: nextArt, prints: nextPrints };
      }

      const variants = cardArtVariants(card);
      const currentVariant = getArtVariant(card, current.art);
      const currentIndex = Math.max(
        0,
        variants.findIndex((variant) => variant.id === currentVariant.id),
      );
      const nextIndex = Math.max(
        0,
        Math.min(variants.length - 1, currentIndex + delta),
      );
      const nextVariant = variants[nextIndex];
      if (nextVariant.id === "standard") {
        delete nextArt[number];
      } else {
        nextArt[number] = nextVariant.id;
      }

      return { ...current, art: nextArt };
    });
  }

  function stepDeckArt(delta: number) {
    setDeck((current) => {
      const cardNumbers = new Set([
        ...Object.keys(current.main),
        ...Object.keys(current.resource),
      ]);
      const nextPrints = clonePrints(current.prints);
      const nextArt = { ...current.art };

      cardNumbers.forEach((number) => {
        const card = CARD_BY_NUMBER.get(number);
        if (!card) return;
        shiftAllPrints(nextPrints.main, card, delta);
        shiftAllPrints(nextPrints.resource, card, delta);
        const activeVariant =
          printEntriesForCard({ ...current, prints: nextPrints }, "main", card)[0]
            ?.variant ??
          printEntriesForCard({ ...current, prints: nextPrints }, "resource", card)[0]
            ?.variant ??
          getArtVariant(card, current.art);
        if (activeVariant.id === "standard") delete nextArt[number];
        else nextArt[number] = activeVariant.id;
      });

      return { ...current, art: nextArt, prints: nextPrints };
    });
  }

  function adjustCard(zone: Zone, number: string, delta: number) {
    setDeck((current) => {
      const card = CARD_BY_NUMBER.get(number);
      if (!card) return current;
      const target = current[zone];
      const nextQuantity = (target[number] ?? 0) + delta;
      const nextTarget = { ...target };
      const nextPrints = clonePrints(current.prints);
      const preferredArtId = getArtVariant(card, current.art).id;

      if (nextQuantity <= 0) {
        delete nextTarget[number];
        delete nextPrints[zone][number];
      } else {
        nextTarget[number] = nextQuantity;
        if (delta > 0) {
          addPrintCopies(nextPrints[zone], card, preferredArtId, delta);
        } else if (delta < 0) {
          removePrintCopies(nextPrints[zone], card, preferredArtId, Math.abs(delta));
        }
      }

      return {
        ...current,
        [zone]: nextTarget,
        prints: nextPrints,
      };
    });
  }

  function removeCard(zone: Zone, number: string) {
    setDeck((current) => {
      const nextTarget = { ...current[zone] };
      const nextPrints = clonePrints(current.prints);
      delete nextTarget[number];
      delete nextPrints[zone][number];
      return { ...current, [zone]: nextTarget, prints: nextPrints };
    });
  }

  function adjustCollection(number: string, artId: string, delta: number) {
    setDeck((current) => {
      const card = CARD_BY_NUMBER.get(number);
      if (!card || !validArtId(card, artId)) return current;
      const currentCard = { ...(current.collection[number] ?? {}) };
      const nextQuantity = Math.max(0, (currentCard[artId] ?? 0) + delta);
      if (nextQuantity === 0) delete currentCard[artId];
      else currentCard[artId] = nextQuantity;

      const nextCollection = { ...current.collection };
      if (Object.keys(currentCard).length) nextCollection[number] = currentCard;
      else delete nextCollection[number];

      return { ...current, collection: nextCollection };
    });
  }

  function markDeckOwned() {
    setDeck((current) => {
      const nextCollection: CollectionMap = { ...current.collection };
      (["main", "resource"] as const).forEach((zone) => {
        deckEntries(current[zone]).forEach(({ card }) => {
          const currentCard = { ...(nextCollection[card.number] ?? {}) };
          printEntriesForCard(current, zone, card).forEach(({ variant, quantity }) => {
            currentCard[variant.id] = Math.max(currentCard[variant.id] ?? 0, quantity);
          });
          nextCollection[card.number] = cleanQuantityMap(currentCard);
        });
      });
      return { ...current, collection: nextCollection };
    });
  }

  function drawHand() {
    setOpeningHand(drawOpeningHandNumbers(deck.main));
    setDrawCount((current) => current + 1);
    setMobileView("stats");
  }

  async function writeClipboardText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        return document.execCommand("copy");
      } catch {
        return false;
      } finally {
        textarea.remove();
      }
    }
  }

  function cloneSharedDeck() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
    setSharedStatus("cloned");
    window.location.assign("/");
  }

  async function exportDeckImage() {
    const rows = [...mainEntries, ...resourceEntries].flatMap(({ card }) =>
      (["main", "resource"] as const).flatMap((zone) =>
        printEntriesForCard(deck, zone, card).map(({ variant, quantity }) => ({
          card,
          variant,
          quantity,
          zone,
        })),
      ),
    );

    const cardWidth = 150;
    const cardHeight = 210;
    const gap = 18;
    const columns = 6;
    const headerHeight = 170;
    const width = 1080;
    const rowsNeeded = Math.ceil(rows.length / columns);
    const height = headerHeight + rowsNeeded * (cardHeight + 72 + gap) + 64;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.fillStyle = "#05060a";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#f6c542";
    context.font = "900 48px Arial";
    context.fillText(deck.name.toUpperCase(), 42, 72);
    context.fillStyle = "#f7f7f2";
    context.font = "700 24px Arial";
    context.fillText(
      `${mainTotal}/${MAIN_TARGET} main · ${resourceTotal}/${RESOURCE_TARGET} resource · ${formatEstimatedMoney(costSummary.artTotal)} art`,
      42,
      116,
    );

    await Promise.all(
      rows.map(
        (row, index) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = () => {
              const column = index % columns;
              const rowIndex = Math.floor(index / columns);
              const x = 42 + column * (cardWidth + gap);
              const y = headerHeight + rowIndex * (cardHeight + 72 + gap);
              context.drawImage(image, x, y, cardWidth, cardHeight);
              context.fillStyle = "rgba(0,0,0,0.72)";
              context.fillRect(x, y + cardHeight - 38, cardWidth, 38);
              context.fillStyle = "#f7f7f2";
              context.font = "900 20px Arial";
              context.fillText(`x${row.quantity}`, x + 10, y + cardHeight - 12);
              context.font = "700 12px Arial";
              context.fillText(row.variant.label, x + 54, y + cardHeight - 13);
              context.fillStyle = "#a7b5c9";
              context.font = "700 13px Arial";
              context.fillText(row.card.number, x, y + cardHeight + 22);
              context.fillStyle = "#f7f7f2";
              context.font = "900 15px Arial";
              context.fillText(row.card.name.slice(0, 24), x, y + cardHeight + 44);
              resolve();
            };
            image.onerror = () => resolve();
            image.src = row.variant.image;
          }),
      ),
    );

    const anchor = document.createElement("a");
    anchor.download = `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "gundam-deck"}-sheet.png`;
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
  }

  async function copyDeckList() {
    try {
      await navigator.clipboard.writeText(deckList);
      setCopyState("Copied");
      window.setTimeout(() => setCopyState("Copy"), 1200);
    } catch {
      setCopyState("Failed");
      window.setTimeout(() => setCopyState("Copy"), 1200);
    }
  }

  async function copyShareUrl() {
    if (shareState === "Saving") return;
    setShareState("Saving");
    setLastShareUrl("");

    try {
      const response = await fetch("/api/decks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sharePayload(deck)),
      });
      const result = (await response.json()) as {
        error?: string;
        shareUrl?: string;
      };
      if (!response.ok || !result.shareUrl) {
        throw new Error(result.error ?? "Share failed");
      }

      const shareUrl = new URL(result.shareUrl, window.location.origin).toString();
      setLastShareUrl(shareUrl);
      const copied = await writeClipboardText(shareUrl);
      setShareState(copied ? "Copied" : "Link Ready");
      window.setTimeout(() => setShareState("Share"), copied ? 1400 : 2600);
    } catch {
      setShareState("Failed");
      window.setTimeout(() => setShareState("Share"), 1800);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(deck, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${
      deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "gundam-deck"
    }.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = sanitizeDeck(JSON.parse(text));
    if (parsed) setDeck(parsed);
  }

  return (
    <main className="app-shell min-h-screen bg-[#05060a] text-[#f7f7f2]">
      <div
        className="fixed inset-0 -z-10 bg-[#05060a]"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(5,6,10,0.62), rgba(5,6,10,0.92) 620px, rgba(5,6,10,0.98) 1000px), linear-gradient(112deg, rgba(227,27,35,0.1) 0%, transparent 28%, transparent 68%, rgba(17,103,216,0.14) 100%), url(${HUD_TEXTURE_IMAGE})`,
          backgroundPosition: "top center",
          backgroundSize: "cover",
        }}
      />
      <div
        className="ambient-field pointer-events-none fixed inset-0 -z-10 opacity-30 mix-blend-screen"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(5,6,10,0.1), rgba(5,6,10,0.82)), url(${HUD_TEXTURE_IMAGE})`,
          backgroundPosition: "top center",
          backgroundSize: "cover",
        }}
      />
      <div className="cockpit-grid fixed inset-0 -z-10" />

      <header className="border-b border-[#a7b5c9]/25 bg-[#05060a]/74 shadow-xl shadow-black/40 backdrop-blur-xl">
        <div className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex w-56 shrink-0 items-center sm:w-64 lg:w-72">
                <img
                  src="/permet-score-logo.png"
                  alt="Permet Score"
                  className="h-auto w-full object-contain object-left"
                />
              </div>
              <div className="min-w-0">
                <p className="font-display text-base font-black uppercase text-[#f6c542]">
                  Gundam Card Game
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="sr-only">
                    Permet Score
                  </h1>
                  <StatusBadge isLegal={isLegal} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 md:grid-cols-[minmax(220px,1fr)_repeat(9,2.75rem)] 2xl:grid-cols-[minmax(220px,1fr)_auto_auto_auto_auto_auto_auto_auto_auto_auto]">
              <label className="col-span-5 block min-w-0 md:col-span-1">
                <span className="sr-only">Deck name</span>
                <input
                  value={deck.name}
                  onChange={(event) =>
                    setDeck((current) => ({ ...current, name: event.target.value }))
                  }
                  className="control-field h-11 w-full rounded-sm border border-[#a7b5c9]/28 bg-[#f7f7f2]/12 px-3 text-base font-black text-[#f7f7f2] outline-none placeholder:text-[#f7f7f2]/40 focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
                />
              </label>
              <ToolbarButton label="Sample" title="Load sample deck" onClick={() => setDeck(starterDeck)}>
                <ShieldCheck size={16} />
              </ToolbarButton>
              <ToolbarButton label="New" title="Start a new deck" onClick={() => setDeck(emptyDeck())}>
                <RotateCcw size={16} />
              </ToolbarButton>
              <ToolbarButton
                label="Art -"
                title="Downgrade deck art budget"
                onClick={() => stepDeckArt(-1)}
              >
                <ChevronDown size={16} />
              </ToolbarButton>
              <ToolbarButton
                label="Art +"
                title="Upgrade deck art budget"
                onClick={() => stepDeckArt(1)}
              >
                <ChevronUp size={16} />
              </ToolbarButton>
              <ToolbarButton label={shareState} title="Copy share URL" onClick={copyShareUrl}>
                <Share2 size={16} />
              </ToolbarButton>
              <ToolbarButton label={copyState} title="Copy deck list" onClick={copyDeckList}>
                <Clipboard size={16} />
              </ToolbarButton>
              <ToolbarButton label="Export" title="Export JSON" onClick={exportJson}>
                <Download size={16} />
              </ToolbarButton>
              <ToolbarButton
                label="Sheet"
                title="Export deck image"
                onClick={() => void exportDeckImage()}
              >
                <Layers size={16} />
              </ToolbarButton>
              <ToolbarButton
                label="Import"
                title="Import JSON"
                onClick={() => importInputRef.current?.click()}
              >
                <Upload size={16} />
              </ToolbarButton>
              <input
                ref={importInputRef}
                className="hidden"
                type="file"
                accept="application/json"
                onChange={(event) => {
                  void importJson(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-8">
            <Metric label="Main" value={`${mainTotal}/${MAIN_TARGET}`} />
            <Metric label="Resource" value={`${resourceTotal}/${RESOURCE_TARGET}`} />
            <Metric label="Colors" value={deckColors.length ? deckColors.join(" / ") : "-"} />
            <Metric label="Cards" value={`${CARD_POOL.length} loaded`} />
            <Metric label="Alt Ready" value={`${altReadyTotal}`} />
            <Metric label="Est. Art" value={formatMoney(costSummary.artTotal)} />
            <Metric label="Est. Missing" value={formatMoney(costSummary.missingCost)} />
            <Metric label="Showing" value={`${filteredCards.length}`} />
          </div>
          <HudStrip
            isLegal={isLegal}
            sharedStatus={sharedStatus}
            deckName={deck.name}
            selectedCard={selectedCard}
            missingCost={costSummary.missingCost}
          />
        </div>
      </header>

      <section className="mx-auto grid max-w-[1800px] gap-4 px-3 py-4 pb-28 sm:px-5 xl:pb-4">
        {sharedDeckId && (
          <SharedDeckBanner
            deckName={deck.name}
            sharedStatus={sharedStatus}
            mainTotal={mainTotal}
            resourceTotal={resourceTotal}
            deckColors={deckColors}
            artTotal={costSummary.artTotal}
            previewCards={mainEntries.slice(0, 5).map((entry) => entry.card)}
            onClone={cloneSharedDeck}
          />
        )}

        <CockpitSummary
          deckName={deck.name}
          selectedCard={selectedCard}
          selectedArtVariant={selectedArtVariant}
          mainTotal={mainTotal}
          resourceTotal={resourceTotal}
          isLegal={isLegal}
          artTotal={costSummary.artTotal}
          missingCost={costSummary.missingCost}
          deckColors={deckColors}
          previewCards={mainEntries.slice(0, 6).map((entry) => entry.card)}
          openingHandCards={openingHandEntries}
          drawCount={drawCount}
          shareState={shareState}
          lastShareUrl={lastShareUrl}
          onDraw={drawHand}
          onShare={() => void copyShareUrl()}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          <section
            className={panelClass(
              `min-w-0 overflow-hidden ${
                mobileView === "library" ? "block" : "hidden xl:block"
              }`,
            )}
          >
            <div className="sticky top-0 z-10 border-b border-[#a7b5c9]/20 bg-[#080a0f]/94 p-3 backdrop-blur">
              <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="flex items-center gap-2">
                  <Search size={18} className="text-[#f6c542]" />
                  <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">
                    Card Library
                  </h2>
                  <span className="rounded-sm border border-[#f6c542]/25 bg-[#f6c542]/12 px-2.5 py-1 text-sm font-black text-[#fff2bd]">
                    {filteredCards.length}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-[minmax(240px,1fr)_120px_130px_190px_140px_130px_110px]">
                  <label className="relative block">
                    <span className="sr-only">Search cards</span>
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#f7f7f2]/35"
                      size={16}
                    />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search name, number, text"
                      className="control-field h-11 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#f7f7f2]/8 pl-9 pr-3 text-base font-semibold text-[#f7f7f2] outline-none placeholder:text-[#f7f7f2]/38 focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
                    />
                  </label>
                  <SelectFilter
                    label="Color"
                    value={colorFilter}
                    values={colorFilters}
                    onChange={setColorFilter}
                  />
                  <SelectFilter
                    label="Type"
                    value={typeFilter}
                    values={typeFilters}
                    onChange={setTypeFilter}
                  />
                  <label className="block">
                    <span className="sr-only">Set</span>
                    <select
                      value={setFilter}
                      onChange={(event) => setSetFilter(event.target.value)}
                      className="control-field h-11 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-3 text-base font-bold text-[#f7f7f2] outline-none focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
                    >
                      {setOptions.map((set) => (
                        <option key={set} value={set}>
                          {set}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SelectFilter
                    label="Art"
                    value={artFilter}
                    values={artFilters}
                    onChange={setArtFilter}
                  />
                  <SelectFilter
                    label="Collection"
                    value={collectionFilter}
                    values={collectionFilters}
                    onChange={setCollectionFilter}
                  />
                  <label className="block">
                    <span className="sr-only">Budget limit</span>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={budgetLimit}
                      onChange={(event) =>
                        setBudgetLimit(Math.max(0, Number(event.target.value) || 0))
                      }
                      className="control-field h-11 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-3 text-base font-bold text-[#f7f7f2] outline-none focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-3 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(204px,1fr))]">
              {filteredCards.map((card) => (
                <LibraryCard
                  key={card.number}
                  card={card}
                  artVariant={getArtVariant(card, deck.art)}
                  artVariants={cardArtVariants(card)}
                  selected={selectedCard.number === card.number}
                  mainQuantity={deck.main[card.number] ?? 0}
                  resourceQuantity={deck.resource[card.number] ?? 0}
                  ownedQuantity={getTotalOwnedForCard(deck.collection, card)}
                  missingQuantity={getMissingCopiesForCard(deck, card)}
                  onSelect={() => setSelectedNumber(card.number)}
                  onAddMain={() => adjustCard("main", card.number, 1)}
                  onAddResource={() => adjustCard("resource", card.number, 1)}
                />
              ))}
            </div>
          </section>

          <aside className="contents xl:flex xl:flex-col xl:gap-4">
            <div className={mobileView === "card" ? "block" : "hidden xl:block"}>
              <InspectorPanel
                card={selectedCard}
                artVariant={selectedArtVariant}
                artVariants={selectedArtVariants}
                artCost={selectedArtCost}
                neededQuantity={selectedNeededCount}
                ownedQuantity={selectedOwnedCount}
                mainQuantity={deck.main[selectedCard.number] ?? 0}
                resourceQuantity={deck.resource[selectedCard.number] ?? 0}
                onAddMain={() => adjustCard("main", selectedCard.number, 1)}
                onAddResource={() => adjustCard("resource", selectedCard.number, 1)}
                onStepArt={(delta) => stepCardArt(selectedCard.number, delta)}
                onAdjustCollection={(delta) =>
                  adjustCollection(selectedCard.number, selectedArtVariant.id, delta)
                }
              />
            </div>

            <div className={mobileView === "stats" ? "grid gap-4" : "hidden xl:grid xl:gap-4"}>
              <CostPanel summary={costSummary} onMarkOwned={markDeckOwned} />

              <LegalityPanel notices={notices} />

              <SynergyPanel notices={synergyNotices} />

              <HandSimulatorPanel
                cards={openingHandEntries}
                onDraw={drawHand}
                onClear={() => setOpeningHand([])}
              />

              <div className="xl:hidden">
                <CompositionPanel
                  typeCounts={typeCounts}
                  costCurve={costCurve}
                  mainTotal={mainTotal}
                />
              </div>
            </div>
          </aside>
        </div>

        <div
          className={`gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] ${
            mobileView === "deck" ? "grid" : "hidden"
          }`}
        >
          <DeckPanel
            title="Main Deck"
            total={mainTotal}
            target={MAIN_TARGET}
            entries={mainEntries}
            deck={deck}
            zone="main"
            onAdjust={adjustCard}
            onRemove={removeCard}
          />

          <aside className="grid gap-4">
            <DeckPanel
              title="Resource"
              total={resourceTotal}
              target={RESOURCE_TARGET}
              entries={resourceEntries}
              deck={deck}
              zone="resource"
              onAdjust={adjustCard}
              onRemove={removeCard}
            compact
          />

            <CompositionPanel
              typeCounts={typeCounts}
              costCurve={costCurve}
              mainTotal={mainTotal}
            />
          </aside>
        </div>
      </section>
      <MobileCockpitNav activeView={mobileView} onChange={setMobileView} />
    </main>
  );
}

export default function Home() {
  return <DeckBuilder />;
}

function HudStrip({
  isLegal,
  sharedStatus,
  deckName,
  selectedCard,
  missingCost,
}: {
  isLegal: boolean;
  sharedStatus: SharedStatus;
  deckName: string;
  selectedCard: GundamCard;
  missingCost: number;
}) {
  const statusLabel =
    sharedStatus === "ready"
      ? "Shared"
      : sharedStatus === "loading"
        ? "Syncing"
        : sharedStatus === "missing"
          ? "Offline"
          : "Local";

  return (
    <div className="mt-3 hidden overflow-hidden rounded-sm border border-[#2e8cff]/25 bg-[#07111d]/70 shadow-lg shadow-[#03111f]/30 backdrop-blur md:block">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2">
        <div className="flex items-center gap-2 text-[#8bdcff]">
          <Radar size={16} />
          <span className="font-display text-base font-black uppercase">
            Permet Link
          </span>
        </div>
        <div className="relative h-1 overflow-hidden rounded-full bg-[#f7f7f2]/10">
          <div className="permet-sweep absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-[#8bdcff] to-transparent" />
        </div>
        <div className="flex flex-wrap justify-end gap-2 text-sm font-black uppercase">
          <span className="rounded-sm border border-[#2e8cff]/30 bg-[#1167d8]/14 px-2 py-1 text-[#d9ecff]">
            {statusLabel}
          </span>
          <span
            className={`rounded-sm border px-2 py-1 ${
              isLegal
                ? "border-[#28d17c]/35 bg-[#28d17c]/12 text-[#d9ffe9]"
                : "border-[#e31b23]/40 bg-[#e31b23]/14 text-[#ffe3e3]"
            }`}
          >
            {isLegal ? "Sortie Ready" : "Tune Required"}
          </span>
          <span className="rounded-sm border border-[#f6c542]/30 bg-[#f6c542]/10 px-2 py-1 text-[#fff2bd]">
            {deckName}
          </span>
          <span className="rounded-sm border border-[#a7b5c9]/20 bg-black/24 px-2 py-1 text-[#f7f7f2]/70">
            Scan {selectedCard.number}
          </span>
          <span className="rounded-sm border border-[#f6c542]/30 bg-black/24 px-2 py-1 text-[#fff2bd]">
            Est. Missing {formatMoney(missingCost)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SharedDeckBanner({
  deckName,
  sharedStatus,
  mainTotal,
  resourceTotal,
  deckColors,
  artTotal,
  previewCards,
  onClone,
}: {
  deckName: string;
  sharedStatus: SharedStatus;
  mainTotal: number;
  resourceTotal: number;
  deckColors: CardColor[];
  artTotal: number;
  previewCards: GundamCard[];
  onClone: () => void;
}) {
  const title =
    sharedStatus === "missing"
      ? "Shared Deck Not Found"
      : sharedStatus === "loading"
        ? "Loading Shared Deck"
        : "Shared Deck Preview";

  return (
    <section className={panelClass("overflow-hidden")}>
      <div
        className="hero-surface relative grid gap-4 p-4 sm:grid-cols-[1fr_auto]"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(5,6,10,0.9), rgba(5,6,10,0.7)), url(${HUD_TEXTURE_IMAGE})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[#8bdcff]">
            <Share2 size={17} />
            <span className="font-display text-lg font-black uppercase">{title}</span>
          </div>
          <h2 className="mt-2 truncate font-display text-3xl font-black uppercase text-[#f7f7f2] sm:text-4xl">
            {deckName}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-black uppercase">
            <span className="rounded-sm border border-[#f6c542]/30 bg-[#f6c542]/12 px-2 py-1 text-[#fff2bd]">
              {mainTotal}/{MAIN_TARGET} Main
            </span>
            <span className="rounded-sm border border-[#2e8cff]/30 bg-[#1167d8]/14 px-2 py-1 text-[#d9ecff]">
              {resourceTotal}/{RESOURCE_TARGET} Resource
            </span>
            <span className="rounded-sm border border-[#a7b5c9]/22 bg-black/30 px-2 py-1 text-[#f7f7f2]/75">
              {deckColors.length ? deckColors.join(" / ") : "No Colors"}
            </span>
            <span className="rounded-sm border border-[#28d17c]/30 bg-[#28d17c]/12 px-2 py-1 text-[#d9ffe9]">
              {formatEstimatedMoney(artTotal)} Art
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden -space-x-3 sm:flex">
            {previewCards.map((card) => (
              <img
                key={card.number}
                src={cardImagePath(card)}
                alt=""
                className="preview-card h-20 w-14 rounded-sm border border-[#f7f7f2]/20 object-cover object-top shadow-xl shadow-black/40"
              />
            ))}
          </div>
          <button
            type="button"
            className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/40 bg-[#f6c542]/14 px-4 font-display text-lg font-black uppercase text-[#fff2bd] shadow-lg shadow-[#f6c542]/10 hover:bg-[#f6c542]/20"
            onClick={onClone}
            disabled={sharedStatus === "loading" || sharedStatus === "missing"}
          >
            <Download size={17} />
            Clone
          </button>
        </div>
      </div>
    </section>
  );
}

function CockpitSummary({
  deckName,
  selectedCard,
  selectedArtVariant,
  mainTotal,
  resourceTotal,
  isLegal,
  artTotal,
  missingCost,
  deckColors,
  previewCards,
  openingHandCards,
  drawCount,
  shareState,
  lastShareUrl,
  onDraw,
  onShare,
}: {
  deckName: string;
  selectedCard: GundamCard;
  selectedArtVariant: CardArtVariant;
  mainTotal: number;
  resourceTotal: number;
  isLegal: boolean;
  artTotal: number;
  missingCost: number;
  deckColors: CardColor[];
  previewCards: GundamCard[];
  openingHandCards: GundamCard[];
  drawCount: number;
  shareState: string;
  lastShareUrl: string;
  onDraw: () => void;
  onShare: () => void;
}) {
  const readiness = Math.round(
    ((Math.min(mainTotal, MAIN_TARGET) + Math.min(resourceTotal, RESOURCE_TARGET)) /
      (MAIN_TARGET + RESOURCE_TARGET)) *
      100,
  );
  const displayCards = openingHandCards.length ? openingHandCards : previewCards;
  const displayLabel = openingHandCards.length ? "Opening Hand" : "Deck Preview";

  return (
    <section className={panelClass("overflow-hidden")}>
      <div
        className="hero-surface launch-terminal relative grid min-h-[230px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)_minmax(250px,320px)]"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(5,6,10,0.94), rgba(5,6,10,0.76) 50%, rgba(5,6,10,0.94)), linear-gradient(180deg, rgba(5,6,10,0.38), rgba(5,6,10,0.88)), url(${LAUNCH_TABLE_IMAGE})`,
          backgroundPosition: "center 58%",
          backgroundSize: "cover",
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[#8bdcff]">
            <Gauge size={17} />
            <span className="font-display text-lg font-black uppercase">
              Sortie Profile
            </span>
          </div>
          <h2 className="mt-2 line-clamp-2 font-display text-3xl font-black uppercase leading-none text-[#f7f7f2] sm:text-4xl">
            {deckName}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Spec label="Ready" value={`${readiness}%`} />
            <Spec label="Main" value={`${mainTotal}/${MAIN_TARGET}`} />
            <Spec label="Est. Art" value={formatMoney(artTotal)} />
            <Spec label="Est. Miss" value={formatMoney(missingCost)} />
          </div>
        </div>

        <div className="active-scan-card grid gap-3 rounded-sm border border-[#2e8cff]/24 bg-black/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-base font-black uppercase text-[#8bdcff]">
                Active Scan
              </div>
              <div className="truncate text-base font-black text-[#f7f7f2]">
                {selectedCard.name}
              </div>
            </div>
            <span
              className={`rounded-sm border px-2 py-1 text-sm font-black uppercase ${
                isLegal
                  ? "border-[#28d17c]/35 bg-[#28d17c]/12 text-[#d9ffe9]"
                  : "border-[#e31b23]/40 bg-[#e31b23]/14 text-[#ffe3e3]"
              }`}
            >
              {isLegal ? "Legal" : "Needs Work"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="scan-frame h-24 w-16 shrink-0 overflow-hidden rounded-sm border border-[#8bdcff]/35 bg-black">
              <img
                src={cardImagePath(selectedCard, selectedArtVariant)}
                alt=""
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div className="grid min-w-0 gap-1 text-sm font-bold text-[#f7f7f2]/68">
              <span>{selectedCard.number}</span>
              <span>{selectedCard.type} · {selectedCard.color}</span>
              <span>{selectedArtVariant.label}</span>
              <span>{deckColors.length ? deckColors.join(" / ") : "No color lock"}</span>
            </div>
          </div>
        </div>

        <div className="grid content-between gap-3">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-display text-base font-black uppercase text-[#8bdcff]">
                {displayLabel}
              </span>
              {lastShareUrl && (
                <a
                  href={lastShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="interactive-control rounded-sm border border-[#f6c542]/30 bg-[#f6c542]/10 px-2 py-1 font-display text-sm font-black uppercase text-[#fff2bd]"
                >
                  Link Ready
                </a>
              )}
            </div>
            <div
              key={drawCount}
              className="hand-strip grid grid-cols-5 gap-2"
            >
              {displayCards.slice(0, 5).map((card) => (
                <img
                  key={card.number}
                  src={cardImagePath(card)}
                  alt=""
                  className="preview-card h-24 w-full rounded-sm border border-[#f7f7f2]/20 object-cover object-top shadow-xl shadow-black/35"
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            <button
              type="button"
              className="interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#8bdcff]/35 bg-[#1167d8]/16 px-3 font-display text-base font-black uppercase text-[#d9ecff] hover:bg-[#1167d8]/24"
              onClick={onDraw}
            >
              <Shuffle size={16} />
              Draw
            </button>
            <button
              type="button"
              className="interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-3 font-display text-base font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/18"
              onClick={onShare}
            >
              <Share2 size={16} />
              {shareState}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function LegalityPanel({ notices }: { notices: Notice[] }) {
  return (
    <section className={panelClass()}>
      <PanelTitle icon={<ShieldCheck size={18} />} title="Legality" />
      <div className="grid gap-2 p-3">
        {notices.map((notice) => (
          <div
            key={`${notice.label}-${notice.detail}`}
            className={`interactive-row rounded-sm border p-3 ${noticeClass(notice.tone)}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-black">{notice.label}</span>
              <span className="text-right text-base font-bold">{notice.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompositionPanel({
  typeCounts,
  costCurve,
  mainTotal,
}: {
  typeCounts: Record<CardType, number>;
  costCurve: Array<{ cost: number; count: number }>;
  mainTotal: number;
}) {
  const max = Math.max(...costCurve.map((item) => item.count), 1);

  return (
    <section className={panelClass()}>
      <PanelTitle icon={<BarChart3 size={18} />} title="Composition" />
      <div className="grid gap-4 p-3">
        {MAIN_TYPES.map((type) => (
          <TypeMeter
            key={type}
            type={type}
            count={typeCounts[type]}
            target={typeTarget(type)}
            mainTotal={mainTotal}
          />
        ))}
        <div className="pt-1">
          <div className="mb-2 flex items-center gap-2 text-base font-black text-[#f7f7f2]">
            <Filter size={16} className="text-[#f6c542]" />
            Cost Curve
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {costCurve.map((bucket) => (
              <div key={bucket.cost} className="flex h-24 flex-col justify-end gap-1">
                <div
                  className="meter-fill rounded-sm bg-gradient-to-t from-[#e31b23] via-[#f6c542] to-[#f7f7f2] shadow-lg shadow-[#650b10]/30"
                  style={{
                    height: `${Math.max(8, (bucket.count / max) * 84)}px`,
                  }}
                  title={`${bucket.count} cards`}
                />
                <div className="text-center text-sm font-black text-[#f7f7f2]/65">
                  {bucket.cost === 8 ? "8+" : bucket.cost}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileCockpitNav({
  activeView,
  onChange,
}: {
  activeView: MobileView;
  onChange: (view: MobileView) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#2e8cff]/25 bg-[#05060a]/92 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 shadow-2xl shadow-black/60 backdrop-blur-xl xl:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {mobileViews.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`cockpit-tab grid h-16 place-items-center rounded-sm border font-display text-base font-black uppercase ${
              activeView === view.id
                ? "cockpit-tab-active border-[#8bdcff]/45 bg-[#1167d8]/22 text-[#d9ecff] shadow-lg shadow-[#1167d8]/20"
                : "border-[#a7b5c9]/18 bg-[#f7f7f2]/7 text-[#f7f7f2]/55"
            }`}
            onClick={() => onChange(view.id)}
          >
            {view.icon}
            <span>{view.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function CostPanel({
  summary,
  onMarkOwned,
}: {
  summary: CostSummary;
  onMarkOwned: () => void;
}) {
  return (
    <section className={panelClass()}>
      <PanelTitle icon={<BadgeDollarSign size={18} />} title="Est. Deck Cost" />
      <div className="grid gap-2 p-3">
        <div className="rounded-sm border border-[#8bdcff]/18 bg-[#1167d8]/10 p-2 text-sm font-bold leading-6 text-[#d9ecff]/82">
          Local estimate. TCGplayer links open marketplace search results.
        </div>
        <CostRow label="Base prints" value={formatMoney(summary.baseTotal)} />
        <CostRow label="Alt premium" value={formatMoney(summary.altPremium)} />
        <CostRow label="Owned value" value={formatMoney(summary.ownedValue)} />
        <CostRow label="Missing cost" value={formatMoney(summary.missingCost)} hot />
        <div className="mt-1 grid grid-cols-3 gap-2 text-center">
          <Spec label="Need" value={`${summary.neededCopies}`} />
          <Spec label="Own" value={`${summary.ownedCopies}`} />
          <Spec label="Miss" value={`${summary.missingCopies}`} />
        </div>
        <button
          type="button"
          className="interactive-control mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#28d17c]/35 bg-[#28d17c]/12 font-display text-base font-black uppercase text-[#d9ffe9] hover:bg-[#28d17c]/18"
          onClick={onMarkOwned}
        >
          <WalletCards size={16} />
          Mark Needed Owned
        </button>
      </div>
    </section>
  );
}

function CostRow({
  label,
  value,
  hot = false,
}: {
  label: string;
  value: string;
  hot?: boolean;
}) {
  return (
    <div
      className={`interactive-row flex items-center justify-between gap-3 rounded-sm border p-2 ${
        hot
          ? "border-[#f6c542]/32 bg-[#f6c542]/10 text-[#fff2bd]"
          : "border-[#a7b5c9]/16 bg-black/24 text-[#f7f7f2]"
      }`}
    >
      <span className="text-base font-black">{label}</span>
      <span className="text-base font-black">{value}</span>
    </div>
  );
}

function SynergyPanel({ notices }: { notices: SynergyNotice[] }) {
  return (
    <section className={panelClass()}>
      <PanelTitle icon={<Radar size={18} />} title="Synergy" />
      <div className="grid gap-2 p-3">
        {notices.length === 0 ? (
          <div className="rounded-sm border border-[#a7b5c9]/16 bg-black/24 p-3 text-base font-bold text-[#f7f7f2]/65">
            Add pilots and linked units to activate checks.
          </div>
        ) : (
          notices.map((notice) => (
            <div
              key={`${notice.label}-${notice.detail}`}
              className={`interactive-row rounded-sm border p-2 ${noticeClass(notice.tone)}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-base font-black">{notice.label}</span>
                <span className="shrink-0 text-right text-sm font-bold">
                  {notice.detail}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function HandSimulatorPanel({
  cards,
  onDraw,
  onClear,
}: {
  cards: GundamCard[];
  onDraw: () => void;
  onClear: () => void;
}) {
  const typeSummary = MAIN_TYPES.map((type) => ({
    type,
    count: cards.filter((card) => card.type === type).length,
  })).filter((item) => item.count > 0);

  return (
    <section className={panelClass()}>
      <PanelTitle icon={<Shuffle size={18} />} title="Opening Hand" />
      <div className="grid gap-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/40 bg-[#f6c542]/12 font-display text-base font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/18"
            onClick={onDraw}
          >
            <Shuffle size={16} />
            Draw {OPENING_HAND_SIZE}
          </button>
          <button
            type="button"
            className="interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#a7b5c9]/20 bg-[#f7f7f2]/8 font-display text-base font-black uppercase text-[#f7f7f2] hover:bg-[#f7f7f2]/12"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
        <div className="grid gap-2">
          {cards.length === 0 ? (
            <div className="rounded-sm border border-dashed border-[#f7f7f2]/15 p-3 text-center font-display text-lg font-black uppercase text-[#f7f7f2]/42">
              No hand drawn
            </div>
          ) : (
            cards.map((card, index) => (
              <div
                key={`${card.number}-${index}`}
                className={`interactive-row flex items-center gap-2 rounded-sm border bg-black/24 p-2 ${colorAccentClass(
                  card.color,
                )}`}
              >
                <CardThumb card={card} />
                <div className="min-w-0">
                  <div className="truncate text-base font-black text-[#f7f7f2]">
                    {card.name}
                  </div>
                  <div className="text-sm font-bold text-[#f7f7f2]/55">
                    {card.type} · Lv {card.level} · C {card.cost}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {typeSummary.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {typeSummary.map((item) => (
              <span
                key={item.type}
                className="rounded border border-[#a7b5c9]/18 bg-[#f7f7f2]/8 px-2 py-1 text-sm font-black text-[#f7f7f2]/75"
              >
                {item.type} {item.count}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatusBadge({ isLegal }: { isLegal: boolean }) {
  return (
    <span
      className={`status-badge inline-flex h-8 w-fit items-center gap-2 rounded-sm border px-2.5 font-display text-base font-black uppercase ${
        isLegal
          ? "border-[#2e8cff]/45 bg-[#1167d8]/18 text-[#d9ecff]"
          : "border-[#e31b23]/50 bg-[#e31b23]/18 text-[#ffe3e3]"
      }`}
    >
      {isLegal ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <span>{isLegal ? "Legal" : "Needs work"}</span>
    </span>
  );
}

function ToolbarButton({
  children,
  label,
  title,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#a7b5c9]/25 bg-[linear-gradient(90deg,rgba(145,145,145,0.22),rgba(62,112,124,0.28))] px-0 font-display text-lg font-black uppercase text-[#f7f7f2] shadow-sm hover:border-[#f6c542]/45 hover:bg-[#f6c542]/12 2xl:px-3"
      onClick={onClick}
      title={title}
    >
      {children}
      <span className="hidden 2xl:inline">{label}</span>
    </button>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[#a7b5c9]/20 p-3 text-[#f6c542]">
      {icon}
      <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">{title}</h2>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile grid h-14 min-w-0 content-center gap-1 rounded-sm border border-[#a7b5c9]/22 bg-black/32 px-3 backdrop-blur">
      <span className="truncate font-display text-sm font-black uppercase text-[#f7f7f2]/58">
        {label}
      </span>
      <span className="truncate text-base font-black leading-none text-[#f7f7f2]">{value}</span>
    </div>
  );
}

function SelectFilter<T extends string>({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: T;
  values: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="control-field h-11 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-3 text-base font-bold text-[#f7f7f2] outline-none focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
      >
        {values.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DeckPanel({
  title,
  total,
  target,
  entries,
  deck,
  zone,
  compact = false,
  onAdjust,
  onRemove,
}: {
  title: string;
  total: number;
  target: number;
  entries: DeckEntry[];
  deck: DeckState;
  zone: "main" | "resource";
  compact?: boolean;
  onAdjust: (zone: "main" | "resource", number: string, delta: number) => void;
  onRemove: (zone: "main" | "resource", number: string) => void;
}) {
  return (
    <section className={panelClass()}>
      <div className="flex items-center justify-between gap-3 border-b border-[#a7b5c9]/20 p-3">
        <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">{title}</h2>
        <span className="rounded-sm border border-[#f6c542]/25 bg-[#f6c542]/12 px-2.5 py-1 text-sm font-black text-[#fff2bd]">
          {total}/{target}
        </span>
      </div>
      <div
        className={`p-2 ${
          entries.length
            ? compact
              ? "grid gap-2"
              : "grid gap-2 md:grid-cols-2 2xl:grid-cols-3"
            : ""
        }`}
      >
        {entries.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-sm border border-dashed border-[#f7f7f2]/15 font-display text-lg font-black uppercase text-[#f7f7f2]/45">
            Empty
          </div>
        ) : (
          entries.map(({ card, quantity }) => {
            const printEntries = printEntriesForCard(deck, zone, card);
            const artVariant = printEntries[0]?.variant ?? getArtVariant(card, deck.art);
            return (
              <div
                key={card.number}
                className={`interactive-row rounded-sm border bg-[#f7f7f2]/[0.055] p-2 shadow-lg shadow-black/10 ${colorAccentClass(
                  card.color,
                )}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <CardThumb card={card} artVariant={artVariant} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-sm bg-[#f6c542] px-1.5 py-0.5 text-sm font-black leading-none text-black">
                          {quantity}
                        </span>
                        <span className={`rounded border px-1.5 py-0.5 text-xs font-black ${colorChipClass(card.color)}`}>
                          {card.color}
                        </span>
                        {artVariant.id !== "standard" && (
                          <span className="rounded border border-[#f6c542]/35 bg-[#f6c542]/12 px-1.5 py-0.5 text-xs font-black text-[#fff2bd]">
                            {artVariant.label}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 truncate text-base font-black text-[#f7f7f2]">
                        {card.name}
                      </h3>
                      <p className="truncate text-sm font-bold text-[#f7f7f2]/55">
                        {card.number} · {formatEstimatedMoney(estimatePrintCost(card, artVariant))}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {printEntries.map((entry) => (
                          <span
                            key={entry.variant.id}
                            className="rounded border border-[#a7b5c9]/20 bg-black/26 px-1.5 py-0.5 text-xs font-black text-[#f7f7f2]/72"
                          >
                            {entry.quantity} {entry.variant.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid shrink-0 grid-cols-4 gap-1">
                    <IconLink
                      label={`Search ${card.name} on TCGplayer`}
                      href={tcgplayerSearchUrl(card, artVariant)}
                    >
                      <ShoppingCart size={14} />
                    </IconLink>
                    <IconButton
                      label="Remove one"
                      onClick={() => onAdjust(zone, card.number, -1)}
                    >
                      <Minus size={14} />
                    </IconButton>
                    <IconButton
                      label="Add one"
                      onClick={() => onAdjust(zone, card.number, 1)}
                      disabled={zone === "main" && quantity >= 4}
                    >
                      <Plus size={14} />
                    </IconButton>
                    <IconButton
                      label="Remove card"
                      onClick={() => onRemove(zone, card.number)}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function LibraryCard({
  card,
  artVariant,
  artVariants,
  selected,
  mainQuantity,
  resourceQuantity,
  ownedQuantity,
  missingQuantity,
  onSelect,
  onAddMain,
  onAddResource,
}: {
  card: GundamCard;
  artVariant: CardArtVariant;
  artVariants: readonly CardArtVariant[];
  selected: boolean;
  mainQuantity: number;
  resourceQuantity: number;
  ownedQuantity: number;
  missingQuantity: number;
  onSelect: () => void;
  onAddMain: () => void;
  onAddResource: () => void;
}) {
  const canAddMain = MAIN_TYPES.includes(card.type) && mainQuantity < 4;
  const canAddResource = RESOURCE_TYPES.includes(card.type);
  const quantity = mainQuantity + resourceQuantity;

  return (
    <article
      className={`virtual-card group relative cursor-pointer overflow-hidden rounded-sm border bg-black shadow-xl transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl ${colorAccentClass(
        card.color,
      )} ${selected ? "ring-2 ring-[#f6c542] ring-offset-2 ring-offset-[#05060a]" : ""}`}
      onClick={onSelect}
    >
      <div className="relative aspect-[5/7] bg-[#11141b]">
        <img
          src={cardImagePath(card, artVariant)}
          alt={`${card.name} card`}
          className="h-full w-full object-cover object-top transition duration-200 group-hover:scale-[1.025]"
          loading="lazy"
        />
        {selected && (
          <div className="pointer-events-none absolute inset-0 border border-[#8bdcff]/65">
            <div className="permet-scanline absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#8bdcff]/0 via-[#8bdcff]/28 to-[#8bdcff]/0" />
            <div className="absolute left-2 top-2 h-5 w-5 border-l-2 border-t-2 border-[#f6c542]" />
            <div className="absolute right-2 top-2 h-5 w-5 border-r-2 border-t-2 border-[#f6c542]" />
            <div className="absolute bottom-2 left-2 h-5 w-5 border-b-2 border-l-2 border-[#f6c542]" />
            <div className="absolute bottom-2 right-2 h-5 w-5 border-b-2 border-r-2 border-[#f6c542]" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-4rem)] flex-wrap gap-1">
          <span className="rounded-sm bg-[#f7f7f2] px-1.5 py-0.5 text-xs font-black text-black">
            {card.number}
          </span>
          <span className={`rounded border px-1.5 py-0.5 text-xs font-black ${colorChipClass(card.color)}`}>
            {card.color}
          </span>
          {artVariants.length > 1 && (
            <span className="rounded border border-[#f6c542]/35 bg-black/70 px-1.5 py-0.5 text-xs font-black text-[#fff2bd]">
              {artVariant.label}
            </span>
          )}
        </div>
        {quantity > 0 && (
          <div className="absolute right-2 top-2 grid gap-1">
            <span className="shrink-0 rounded-sm border border-[#f6c542]/55 bg-[#e31b23] px-2 py-1 text-center text-xs font-black text-white shadow-lg shadow-black/30">
              {quantity}
            </span>
            {ownedQuantity > 0 && (
              <span className="rounded-sm border border-[#28d17c]/35 bg-black/70 px-2 py-0.5 text-center text-xs font-black text-[#d9ffe9]">
                O {ownedQuantity}
              </span>
            )}
            {missingQuantity > 0 && (
              <span className="rounded-sm border border-[#f6c542]/35 bg-black/70 px-2 py-0.5 text-center text-xs font-black text-[#fff2bd]">
                M {missingQuantity}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-[#a7b5c9]/20 bg-[#07090d] p-2">
        <h3 className="line-clamp-2 font-display text-xl font-black uppercase leading-tight text-[#f7f7f2]">
          {card.name}
        </h3>
        <p className="mt-0.5 text-sm font-bold text-[#f7f7f2]/65">
          {card.type} · {formatEstimatedMoney(estimatePrintCost(card, artVariant))}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-[#a7b5c9]/20 bg-[#080a0f] p-2">
        <button
          type="button"
          className={`interactive-control inline-flex h-10 items-center justify-center gap-1.5 rounded-sm border font-display text-lg font-black uppercase ${
            canAddMain
              ? "border-[#f7f7f2]/15 bg-[#f7f7f2]/10 text-[#f7f7f2] hover:border-[#f6c542]/45 hover:bg-[#f6c542]/12"
              : "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
          }`}
          disabled={!canAddMain}
          onClick={(event) => {
            event.stopPropagation();
            onAddMain();
          }}
          title="Add to main deck"
        >
          <Plus size={15} />
          Main
        </button>
        <button
          type="button"
          className={`interactive-control inline-flex h-10 items-center justify-center gap-1.5 rounded-sm border font-display text-lg font-black uppercase ${
            canAddResource
              ? "border-[#f7f7f2]/15 bg-[#f7f7f2]/10 text-[#f7f7f2] hover:border-[#2e8cff]/45 hover:bg-[#1167d8]/18"
              : "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
          }`}
          disabled={!canAddResource}
          onClick={(event) => {
            event.stopPropagation();
            onAddResource();
          }}
          title="Add to resource deck"
        >
          <Plus size={15} />
          Res
        </button>
        <a
          href={tcgplayerSearchUrl(card, artVariant)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="interactive-control inline-flex h-10 items-center justify-center gap-1.5 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 font-display text-lg font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/18"
          onClick={(event) => event.stopPropagation()}
          title={`Search ${card.name} on TCGplayer`}
        >
          <ShoppingCart size={15} />
          Buy
        </a>
      </div>
    </article>
  );
}

function InspectorPanel({
  card,
  artVariant,
  artVariants,
  artCost,
  neededQuantity,
  ownedQuantity,
  mainQuantity,
  resourceQuantity,
  onAddMain,
  onAddResource,
  onStepArt,
  onAdjustCollection,
}: {
  card: GundamCard;
  artVariant: CardArtVariant;
  artVariants: readonly CardArtVariant[];
  artCost: number;
  neededQuantity: number;
  ownedQuantity: number;
  mainQuantity: number;
  resourceQuantity: number;
  onAddMain: () => void;
  onAddResource: () => void;
  onStepArt: (delta: number) => void;
  onAdjustCollection: (delta: number) => void;
}) {
  const canAddMain = MAIN_TYPES.includes(card.type) && mainQuantity < 4;
  const canAddResource = RESOURCE_TYPES.includes(card.type);
  const artIndex = Math.max(
    0,
    artVariants.findIndex((variant) => variant.id === artVariant.id),
  );
  const canDowngradeArt = artIndex > 0;
  const canUpgradeArt = artIndex < artVariants.length - 1;

  return (
    <section className={panelClass("overflow-hidden")}>
      <div className={`border-b border-[#a7b5c9]/20 p-3 ${colorAccentClass(card.color)}`}>
        <div className="flex items-start gap-3">
          <div className="scan-frame h-36 w-[103px] shrink-0 overflow-hidden rounded-sm border border-[#8bdcff]/35 bg-black shadow-2xl shadow-black/40">
            <img
              src={cardImagePath(card, artVariant)}
              alt={`${card.name} card`}
              className="h-full w-full object-cover object-top"
              loading="lazy"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-sm bg-[#f7f7f2] px-2 py-1 text-sm font-black text-black">
                {card.number}
              </span>
              <span className={`rounded-sm border px-2 py-1 text-sm font-black ${colorChipClass(card.color)}`}>
                {card.color}
              </span>
              <span className="rounded-sm border border-[#f7f7f2]/12 bg-[#f7f7f2]/10 px-2 py-1 text-sm font-black text-[#f7f7f2]">
                {card.type}
              </span>
              <span className="rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-2 py-1 text-sm font-black text-[#fff2bd]">
                {artVariant.label}
              </span>
            </div>
            <h2 className="mt-3 font-display text-3xl font-black uppercase leading-none text-[#f7f7f2]">
              {card.name}
            </h2>
            <p className="mt-1 text-base font-bold text-[#f7f7f2]/65">{card.set}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3">
        <Spec label="Lv" value={card.level} />
        <Spec label="Cost" value={card.cost} />
        <Spec label="AP" value={card.ap} />
        <Spec label="HP" value={card.hp} />
      </div>
      <div className="border-t border-[#a7b5c9]/20 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black text-[#f6c542]">
              <Sparkles size={16} />
              <span className="font-display text-lg uppercase text-[#f7f7f2]">
                Art Print
              </span>
            </div>
            <p className="mt-1 truncate text-base font-bold text-[#f7f7f2]/68">
              {artVariant.officialId} · {formatEstimatedMoney(artCost)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              className={`interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border px-3 font-display text-base font-black uppercase ${
                canDowngradeArt
                  ? "border-[#a7b5c9]/25 bg-[#f7f7f2]/8 text-[#f7f7f2] hover:border-[#f6c542]/45 hover:bg-[#f6c542]/12"
                  : "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
              }`}
              disabled={!canDowngradeArt}
              onClick={() => onStepArt(-1)}
              title="Downgrade art cost"
            >
              <ChevronDown size={15} />
              Down
            </button>
            <button
              type="button"
              className={`interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border px-3 font-display text-base font-black uppercase ${
                canUpgradeArt
                  ? "border-[#f6c542]/40 bg-[#f6c542]/12 text-[#fff2bd] hover:bg-[#f6c542]/18"
                  : "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
              }`}
              disabled={!canUpgradeArt}
              onClick={() => onStepArt(1)}
              title="Upgrade art cost"
            >
              <ChevronUp size={15} />
              Up
            </button>
            <a
              href={tcgplayerSearchUrl(card, artVariant)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/40 bg-[#f6c542]/12 px-3 font-display text-base font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/18"
              title={`Search ${card.name} on TCGplayer`}
            >
              <ShoppingCart size={15} />
              Buy
            </a>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(3rem,1fr))] gap-1.5">
          {artVariants.map((variant) => (
            <div
              key={variant.id}
              className={`h-1.5 rounded-full ${
                variant.id === artVariant.id ? "bg-[#f6c542]" : "bg-[#f7f7f2]/16"
              }`}
              title={`${variant.label} ${formatEstimatedMoney(estimatePrintCost(card, variant))}`}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-sm border border-[#a7b5c9]/16 bg-black/28 p-2">
          <div className="min-w-0">
            <div className="font-display text-base font-black uppercase text-[#f7f7f2]/65">
              Collection
            </div>
            <div className="text-base font-black text-[#f7f7f2]">
              Owned {ownedQuantity} / Needed {neededQuantity}
            </div>
          </div>
          <IconButton label="Remove owned copy" onClick={() => onAdjustCollection(-1)}>
            <Minus size={14} />
          </IconButton>
          <IconButton label="Add owned copy" onClick={() => onAdjustCollection(1)}>
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      <div className="border-t border-[#a7b5c9]/20 p-3">
        <p className="text-base font-medium leading-6 text-[#f7f7f2]/84">{card.text}</p>
        <div className="mt-3 grid gap-1 text-sm font-bold text-[#f7f7f2]/55">
          <span className="truncate">{card.trait}</span>
          <span className="truncate">{card.link}</span>
          <span className="truncate">{card.source}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border font-display text-base font-black uppercase ${
              canAddMain
                ? "border-[#e31b23]/50 bg-[#e31b23]/18 text-[#ffe3e3] hover:bg-[#e31b23]/28"
                : "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
            }`}
            disabled={!canAddMain}
            onClick={onAddMain}
          >
            <Plus size={16} />
            Main {mainQuantity ? `(${mainQuantity})` : ""}
          </button>
          <button
            type="button"
            className={`interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border font-display text-base font-black uppercase ${
              canAddResource
                ? "border-[#2e8cff]/50 bg-[#1167d8]/18 text-[#d9ecff] hover:bg-[#1167d8]/28"
                : "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
            }`}
            disabled={!canAddResource}
            onClick={onAddResource}
          >
            <Plus size={16} />
            Res {resourceQuantity ? `(${resourceQuantity})` : ""}
          </button>
        </div>
      </div>
    </section>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[#a7b5c9]/20 bg-[#f7f7f2]/[0.055] p-2 text-center">
      <div className="font-display text-sm font-black uppercase text-[#f7f7f2]/58">
        {label}
      </div>
      <div className="mt-1 text-base font-black text-[#f7f7f2]">{value}</div>
    </div>
  );
}

function CardThumb({
  card,
  artVariant,
}: {
  card: GundamCard;
  artVariant?: CardArtVariant;
}) {
  return (
    <div className="h-16 w-12 shrink-0 overflow-hidden rounded-sm border border-[#f7f7f2]/15 bg-black shadow-sm">
      <img
        src={cardImagePath(card, artVariant)}
        alt={`${card.name} card`}
        className="h-full w-full object-cover object-top"
        loading="lazy"
      />
    </div>
  );
}

function IconButton({
  label,
  children,
  disabled = false,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`interactive-control inline-flex size-8 items-center justify-center rounded-sm border ${
        disabled
          ? "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/25"
          : "border-[#f7f7f2]/12 bg-[#f7f7f2]/8 text-[#f7f7f2] hover:border-[#f6c542]/35 hover:bg-[#f6c542]/12"
      }`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function IconLink({
  label,
  children,
  href,
}: {
  label: string;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="interactive-control inline-flex size-8 items-center justify-center rounded-sm border border-[#f6c542]/30 bg-[#f6c542]/10 text-[#fff2bd] hover:bg-[#f6c542]/16"
      title={label}
      aria-label={label}
    >
      {children}
    </a>
  );
}

function TypeMeter({
  type,
  count,
  target,
  mainTotal,
}: {
  type: CardType;
  count: number;
  target: string;
  mainTotal: number;
}) {
  const width = mainTotal ? Math.min(100, (count / mainTotal) * 100) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-base">
        <span className="font-display text-lg font-black uppercase text-[#f7f7f2]">{type}</span>
        <span className="font-bold text-[#f7f7f2]/62">
          {count} / {target}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#f7f7f2]/8">
        <div
          className="type-meter-fill h-full rounded-full bg-gradient-to-r from-[#e31b23] via-[#f6c542] to-[#f7f7f2]"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
