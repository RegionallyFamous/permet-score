"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  Clipboard,
  Download,
  Filter,
  Layers,
  LayoutGrid,
  ListChecks,
  Maximize2,
  Minus,
  MoreHorizontal,
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
  X,
} from "lucide-react";
import {
  type SyntheticEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CARD_ART_VARIANTS,
  type CardArtVariant,
} from "./card-art-data";
import {
  CARD_POOL as CURATED_CARD_POOL,
  type CardColor,
  type CardType,
  type GundamCard,
} from "./card-data";
import { TCGPLAYER_CARD_POOL } from "./tcgplayer-card-data";
import {
  TCGPLAYER_CARD_PRINTS,
  TCGPLAYER_LAST_SYNC,
  type TcgplayerPrint,
} from "./tcgplayer-data";

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

type ActionToast = Notice & {
  id: number;
  actionLabel?: string;
};

type FallbackPanel = {
  title: string;
  detail: string;
  content: string;
  href?: string;
  downloadName?: string;
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

type MissingPrintEntry = {
  card: GundamCard;
  variant: CardArtVariant;
  needed: number;
  owned: number;
  missing: number;
  unitCost: number;
  totalCost: number;
};

type CardLightboxState = {
  card: GundamCard;
  artVariant: CardArtVariant;
};

type SynergyNotice = {
  tone: Notice["tone"];
  label: string;
  detail: string;
};

type DataStatus = {
  totalCards: number;
  curatedCards: number;
  tcgCards: number;
  tcgPrints: number;
  tcgCardsWithPrints: number;
  lastSync: string | null;
  syncAgeHours: number | null;
  isSynced: boolean;
  isFresh: boolean;
  coverageTone: Notice["tone"];
  syncTone: Notice["tone"];
};

const STORAGE_KEY = "gundam-deck-builder-v1";
const MAIN_TARGET = 50;
const RESOURCE_TARGET = 10;
const MAX_MAIN_COPIES = 4;
const MAX_MAIN_COLORS = 2;
const TCGPLAYER_FRESH_HOURS = 48;
const MARKET_FRESH_HOURS = TCGPLAYER_FRESH_HOURS;
const COMPLETE_DATABASE_CARD_TARGET = 700;
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
  "Alt Print 1",
  "Alt Print 2",
  "Premium Alt",
] as const;
const collectionFilters = ["All", "Owned", "Missing", "Budget"] as const;
const OPENING_HAND_SIZE = 5;
const DEFAULT_BUDGET_LIMIT = 5;
const LIBRARY_PAGE_SIZE = 6;

const CARD_POOL = [
  ...CURATED_CARD_POOL,
  ...TCGPLAYER_CARD_POOL.filter(
    (card) => !CURATED_CARD_POOL.some((curated) => curated.number === card.number),
  ),
];
const CARD_BY_NUMBER = new Map(CARD_POOL.map((card) => [card.number, card]));
const CARD_ARTS_BY_NUMBER = CARD_ART_VARIANTS as Record<
  string,
  readonly CardArtVariant[]
>;
const HUD_TEXTURE_IMAGE = "/assets/permet-armor-ui-v2.webp";
const CARD_IMAGE_FALLBACK = "/permet-score-logo.png";
const TCGPLAYER_SEARCH_URL = "https://www.tcgplayer.com/search/all/product";
const CANONICAL_ORIGIN = "https://permetscore.com";
const OFFICIAL_RULES_URL = "https://www.gundam-gcg.com/en/rules/";
const OFFICIAL_PRODUCTS_URL = "https://www.gundam-gcg.com/en/";
const OFFICIAL_RULES_UPDATED = "June 12, 2026";

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

function tcgplayerProductImageUrl(productId: number, size = 1500) {
  const clampedSize = Math.max(size, 1000);
  return `https://product-images.tcgplayer.com/fit-in/${clampedSize}x${clampedSize}/${productId}.jpg`;
}

function cardArtVariants(card: GundamCard) {
  const localVariants = CARD_ARTS_BY_NUMBER[card.number];
  const tcgPrints = TCGPLAYER_CARD_PRINTS[card.number] ?? [];
  const tcgVariants = tcgPrints.map((print, index) => ({
    id: print.variantId,
    label: print.variantId === "standard" ? "Standard" : `Market Print ${index + 1}`,
    image: print.imageUrl ?? tcgplayerProductImageUrl(print.productId),
    tier: index,
    officialId: print.officialId,
  }));

  return (
    localVariants ??
    (tcgVariants.length ? tcgVariants : [
      {
        id: "standard",
        label: "Standard",
        image: `/card-images/${card.number}.webp`,
        tier: 0,
        officialId: card.number,
      },
    ])
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

function cardImagePath(card: GundamCard, variant?: CardArtVariant, size = 1500) {
  const selectedVariant = variant ?? cardArtVariants(card)[0];
  const print = tcgplayerImagePrint(card, selectedVariant);
  if (print?.imageUrl) return print.imageUrl;
  if (print?.productId) return tcgplayerProductImageUrl(print.productId, size);
  return selectedVariant.image;
}

function cardImageSrcSet(card: GundamCard, variant?: CardArtVariant) {
  const selectedVariant = variant ?? cardArtVariants(card)[0];
  const print = tcgplayerImagePrint(card, selectedVariant);
  if (!print?.productId || print.imageUrl) return undefined;

  return [1000, 1500, 2000]
    .map((size) => `${tcgplayerProductImageUrl(print.productId, size)} ${size}w`)
    .join(", ");
}

function handleCardImageError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = CARD_IMAGE_FALLBACK;
  image.classList.remove("object-cover", "object-top");
  image.classList.add("object-contain", "p-2");
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

function tcgplayerImagePrint(card: GundamCard, variant: CardArtVariant): TcgplayerPrint | null {
  const prints = TCGPLAYER_CARD_PRINTS[card.number] ?? [];
  return (
    prints.find((print) => print.variantId === variant.id) ??
    prints.find((print) => print.officialId === variant.officialId) ??
    (variant.id === "standard"
      ? prints.find((print) => print.variantId === "standard") ?? prints[0]
      : undefined) ??
    null
  );
}

function tcgplayerPrint(card: GundamCard, variant: CardArtVariant): TcgplayerPrint | null {
  const prints = TCGPLAYER_CARD_PRINTS[card.number] ?? [];
  return (
    prints.find((print) => print.variantId === variant.id) ??
    prints.find((print) => print.officialId === variant.officialId) ??
    (variant.id === "standard" ? prints.find((print) => print.variantId === "standard") : undefined) ??
    prints[variant.tier] ??
    prints[0] ??
    null
  );
}

function tcgplayerMarketPrice(card: GundamCard, variant: CardArtVariant) {
  const price = tcgplayerPrint(card, variant)?.marketPrice;
  return typeof price === "number" && Number.isFinite(price) && price > 0
    ? price
    : null;
}

function printCost(card: GundamCard, variant: CardArtVariant) {
  return tcgplayerMarketPrice(card, variant) ?? estimatePrintCost(card, variant);
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
  return `Local est. ${formatMoney(value)}`;
}

function formatPrintMoney(card: GundamCard, variant: CardArtVariant) {
  const price = tcgplayerMarketPrice(card, variant);
  return price === null
    ? formatEstimatedMoney(estimatePrintCost(card, variant))
    : `Market est. ${formatMoney(price)}`;
}

function priceSourceLabel(card: GundamCard, variant: CardArtVariant) {
  return tcgplayerMarketPrice(card, variant) === null ? "local estimate" : "market estimate";
}

function artDisplayLabel(variant: CardArtVariant) {
  if (variant.id === "standard" || variant.tier <= 0) return "Standard";
  if (variant.tier === 1) return "Alt Print 1";
  if (variant.tier === 2) return "Alt Print 2";
  return `Premium Alt ${variant.tier}`;
}

function printDisplayId(variant: CardArtVariant) {
  const printSuffix = variant.officialId.split("_")[1] ?? "";
  return printSuffix && !/^p\d+$/i.test(printSuffix)
    ? `Market Print ${variant.tier + 1}`
    : variant.officialId;
}

function tcgplayerSearchUrl(card: GundamCard, variant?: CardArtVariant) {
  const printSuffix = variant?.officialId.split("_")[1] ?? "";
  const queryId =
    variant && printSuffix && !/^p\d+$/i.test(printSuffix)
      ? card.number
      : variant?.officialId ?? card.number;
  const params = new URLSearchParams({
    page: "1",
    productLineName: "gundam-card-game",
    q: `${queryId} ${card.name} Gundam Card Game`,
    view: "grid",
  });

  return `${TCGPLAYER_SEARCH_URL}?${params.toString()}`;
}

function tcgplayerUrl(card: GundamCard, variant?: CardArtVariant) {
  if (!variant) return tcgplayerSearchUrl(card);
  return tcgplayerPrint(card, variant)?.url ?? tcgplayerSearchUrl(card, variant);
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
    const artLabel = variant.id === "standard" ? "" : ` [${artDisplayLabel(variant)}]`;
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
    const explicit = deck.prints[zone][card.number]?.[variantId];
    if (explicit !== undefined) return sum + explicit;
    return (
      sum +
      (printEntriesForCard(deck, zone, card).find(
        (entry) => entry.variant.id === variantId,
      )?.quantity ?? 0)
    );
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
      const standardCost = printCost(card, standard);

      printEntriesForCard(deck, zone, card).forEach(({ variant, quantity }) => {
        const cost = printCost(card, variant);
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

function getMissingPrintEntries(deck: DeckState): MissingPrintEntry[] {
  const cards = new Map<string, GundamCard>();

  (["main", "resource"] as const).forEach((zone) => {
    deckEntries(deck[zone]).forEach(({ card }) => cards.set(card.number, card));
  });

  return Array.from(cards.values())
    .flatMap((card) =>
      cardArtVariants(card).map((variant) => {
        const needed = getNeededPrintCount(deck, card, variant.id);
        const owned = getOwnedPrintCount(deck.collection, card, variant.id);
        const missing = Math.max(0, needed - owned);
        const unitCost = printCost(card, variant);

        return {
          card,
          variant,
          needed,
          owned,
          missing,
          unitCost,
          totalCost: unitCost * missing,
        };
      }),
    )
    .filter((entry) => entry.missing > 0)
    .sort((a, b) => {
      const totalDelta = b.totalCost - a.totalCost;
      if (totalDelta !== 0) return totalDelta;
      const missingDelta = b.missing - a.missing;
      if (missingDelta !== 0) return missingDelta;
      return a.card.name.localeCompare(b.card.name);
    });
}

function artReadyCards(deck: DeckState) {
  return [...deckEntries(deck.main), ...deckEntries(deck.resource)].reduce((sum, entry) => {
    return sum + (cardArtVariants(entry.card).length > 1 ? entry.quantity : 0);
  }, 0);
}

function tcgplayerSyncAgeHours() {
  if (!TCGPLAYER_LAST_SYNC) return null;
  const syncedAt = new Date(TCGPLAYER_LAST_SYNC).getTime();
  if (!Number.isFinite(syncedAt)) return null;
  return Math.max(0, (Date.now() - syncedAt) / 3_600_000);
}

function databaseStatus(): DataStatus {
  const totalCards = CARD_POOL.length;
  const curatedCards = CURATED_CARD_POOL.length;
  const tcgCards = TCGPLAYER_CARD_POOL.length;
  const tcgPrints = Object.values(TCGPLAYER_CARD_PRINTS).reduce(
    (sum, prints) => sum + prints.length,
    0,
  );
  const tcgCardsWithPrints = Object.keys(TCGPLAYER_CARD_PRINTS).length;
  const syncAgeHours = tcgplayerSyncAgeHours();
  const isSynced = Boolean(TCGPLAYER_LAST_SYNC && tcgPrints > 0);
  const isFresh =
    isSynced && syncAgeHours !== null && syncAgeHours <= TCGPLAYER_FRESH_HOURS;
  const coverageTone: Notice["tone"] =
    totalCards >= COMPLETE_DATABASE_CARD_TARGET ? "good" : isSynced ? "warn" : "bad";
  const syncTone: Notice["tone"] = isFresh ? "good" : isSynced ? "warn" : "bad";

  return {
    totalCards,
    curatedCards,
    tcgCards,
    tcgPrints,
    tcgCardsWithPrints,
    lastSync: TCGPLAYER_LAST_SYNC,
    syncAgeHours,
    isSynced,
    isFresh,
    coverageTone,
    syncTone,
  };
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

function canCardEnterZone(zone: Zone, card: GundamCard) {
  return zone === "main"
    ? MAIN_TYPES.includes(card.type)
    : RESOURCE_TYPES.includes(card.type);
}

function zoneLabel(zone: Zone) {
  return zone === "main" ? "Main" : "Resource";
}

function zoneAddConstraint(zone: Zone, card: GundamCard, quantity: number) {
  if (!canCardEnterZone(zone, card)) {
    return zone === "main"
      ? "Main uses Units, Pilots, Commands, or Bases"
      : "Resource uses Resource cards";
  }

  if (zone === "main" && quantity >= MAX_MAIN_COPIES) {
    return `Max ${MAX_MAIN_COPIES} copies in main`;
  }

  return "";
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
    case "Alt Print 1":
      return variant.tier === 1;
    case "Alt Print 2":
      return variant.tier === 2;
    case "Premium Alt":
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
  const selectedCost = printCost(card, getArtVariant(card, deck.art));

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

function cloneCollection(collection: CollectionMap): CollectionMap {
  return Object.fromEntries(
    Object.entries(collection).map(([number, quantities]) => [
      number,
      { ...quantities },
    ]),
  );
}

function cloneDeckState(deck: DeckState): DeckState {
  return {
    name: deck.name,
    main: { ...deck.main },
    resource: { ...deck.resource },
    art: { ...deck.art },
    prints: clonePrints(deck.prints),
    collection: cloneCollection(deck.collection),
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
  { id: "card", label: "Card", icon: <Sparkles size={18} /> },
  { id: "deck", label: "Deck", icon: <ListChecks size={18} /> },
  { id: "stats", label: "Stats", icon: <Activity size={18} /> },
];

export function DeckBuilder({ sharedDeckId }: DeckBuilderProps = {}) {
  const [deck, setDeck] = useState<DeckState>(() => cloneDeckState(starterDeck));
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
  const [selectedNumber, setSelectedNumber] = useState("ST01-001");
  const [copyState, setCopyState] = useState("Copy");
  const [shareState, setShareState] = useState("Share");
  const [toast, setToast] = useState<ActionToast | null>(null);
  const [fallbackPanel, setFallbackPanel] = useState<FallbackPanel | null>(null);
  const [lightbox, setLightbox] = useState<CardLightboxState | null>(null);
  const [libraryPage, setLibraryPage] = useState(0);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const toastIdRef = useRef(0);
  const undoDeckRef = useRef<DeckState | null>(null);
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

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!lightbox) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightbox(null);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [lightbox]);

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
  const missingPrints = useMemo(() => getMissingPrintEntries(deck), [deck]);
  const dataStatus = useMemo(() => databaseStatus(), []);
  const missingPrintCount = useMemo(
    () => missingPrints.reduce((sum, entry) => sum + entry.missing, 0),
    [missingPrints],
  );
  const missingPrintCost = useMemo(
    () => missingPrints.reduce((sum, entry) => sum + entry.totalCost, 0),
    [missingPrints],
  );
  const buyListText = useMemo(
    () =>
      missingPrints
        .map((entry) => {
          const source = priceSourceLabel(entry.card, entry.variant);
          const url = tcgplayerUrl(entry.card, entry.variant);
          return `${entry.missing}x ${printDisplayId(entry.variant)} ${entry.card.name} (${artDisplayLabel(
            entry.variant,
          )}) - ${source} ${formatMoney(entry.unitCost)} each / ${formatMoney(
            entry.totalCost,
          )} total - ${url}`;
        })
        .join("\n"),
    [missingPrints],
  );
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

  const libraryTotalPages = Math.max(
    1,
    Math.ceil(filteredCards.length / LIBRARY_PAGE_SIZE),
  );
  const safeLibraryPage = Math.min(libraryPage, libraryTotalPages - 1);
  const libraryRangeStart = filteredCards.length
    ? safeLibraryPage * LIBRARY_PAGE_SIZE + 1
    : 0;
  const libraryRangeEnd = Math.min(
    filteredCards.length,
    (safeLibraryPage + 1) * LIBRARY_PAGE_SIZE,
  );
  const visibleLibraryCards = useMemo(
    () =>
      filteredCards.slice(
        safeLibraryPage * LIBRARY_PAGE_SIZE,
        (safeLibraryPage + 1) * LIBRARY_PAGE_SIZE,
      ),
    [filteredCards, safeLibraryPage],
  );

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

    if (deckColors.length > MAX_MAIN_COLORS) {
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

    const overLimit = mainEntries.filter(
      (entry) => entry.quantity > MAX_MAIN_COPIES,
    );
    messages.push(
      overLimit.length
        ? {
            tone: "bad",
            label: "Copies",
            detail: `${overLimit.length} over ${MAX_MAIN_COPIES}`,
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

    messages.push(
      dataStatus.isSynced
        ? {
            tone: dataStatus.isFresh ? "good" : "warn",
            label: "Card DB",
            detail: dataStatus.isFresh ? "Fresh market" : "Market stale",
          }
        : {
            tone: "warn",
            label: "Card DB",
            detail: "Market pending",
          },
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
  }, [
    dataStatus.isFresh,
    dataStatus.isSynced,
    deckColors,
    mainEntries,
    mainTotal,
    resourceEntries,
    resourceTotal,
    typeCounts,
  ]);

  const isLegal = notices.every((notice) => notice.tone !== "bad");
  const activeAdvancedFilterCount = [
    setFilter !== "All",
    artFilter !== "All Art",
    collectionFilter !== "All",
    budgetLimit !== DEFAULT_BUDGET_LIMIT,
  ].filter(Boolean).length;

  function showToast(
    tone: Notice["tone"],
    label: string,
    detail: string,
    actionLabel?: string,
  ) {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    const nextToast = {
      id: toastIdRef.current + 1,
      tone,
      label,
      detail,
      actionLabel,
    };
    toastIdRef.current = nextToast.id;
    setToast(nextToast);

    if (actionLabel) {
      toastTimerRef.current = null;
      return;
    }

    toastTimerRef.current = window.setTimeout(
      () => setToast((current) => (current?.id === nextToast.id ? null : current)),
      3600,
    );
  }

  function dismissToast() {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }

  function restoreUndoDeck() {
    const previousDeck = undoDeckRef.current;
    if (!previousDeck) return;

    undoDeckRef.current = null;
    setDeck(cloneDeckState(previousDeck));
    setOpeningHand([]);
    showToast("good", "Deck restored", "Previous deck is back in the builder.");
  }

  function replaceDeckWithUndo(
    createNextDeck: () => DeckState,
    label: string,
    detail: string,
  ) {
    setDeck((current) => {
      undoDeckRef.current = cloneDeckState(current);
      return cloneDeckState(createNextDeck());
    });
    setOpeningHand([]);
    showToast("warn", label, detail, "Undo");
  }

  function loadSampleDeck() {
    replaceDeckWithUndo(
      () => starterDeck,
      "Sample loaded",
      "Previous deck is saved for a quick undo.",
    );
  }

  function startNewDeck() {
    replaceDeckWithUndo(
      emptyDeck,
      "New deck started",
      "Previous deck is saved for a quick undo.",
    );
  }

  function resetAdvancedFilters() {
    setSetFilter("All");
    setArtFilter("All Art");
    setCollectionFilter("All");
    setBudgetLimit(DEFAULT_BUDGET_LIMIT);
    setLibraryPage(0);
  }

  function openBuyList() {
    void copyBuyList();
  }

  function openCardLightbox(card: GundamCard, artVariant?: CardArtVariant) {
    setLightbox({
      card,
      artVariant: artVariant ?? getArtVariant(card, deck.art),
    });
  }

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
      const currentQuantity = target[number] ?? 0;
      if (delta > 0) {
        if (!canCardEnterZone(zone, card)) return current;
        if (zone === "main" && currentQuantity >= 4) return current;
      }

      const nextQuantity =
        zone === "main"
          ? Math.min(4, currentQuantity + delta)
          : currentQuantity + delta;
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
    const card = CARD_BY_NUMBER.get(number);
    const quantity = deck[zone][number] ?? 0;
    if (!card || quantity <= 0) return;

    undoDeckRef.current = cloneDeckState(deck);
    setDeck((current) => {
      const nextTarget = { ...current[zone] };
      const nextPrints = clonePrints(current.prints);
      delete nextTarget[number];
      delete nextPrints[zone][number];
      return { ...current, [zone]: nextTarget, prints: nextPrints };
    });
    showToast(
      "warn",
      `Removed ${quantity} ${card.name}`,
      `${zoneLabel(zone)} entry removed from the deck.`,
      "Undo",
    );
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
    undoDeckRef.current = cloneDeckState(deck);
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
    showToast(
      "warn",
      "Deck prints marked owned",
      "Owned counts were set to this deck's selected print quantities.",
      "Undo",
    );
  }

  function drawHand() {
    const nextHand = drawOpeningHandNumbers(deck.main);
    setOpeningHand(nextHand);
    setMobileView("stats");
    showToast(
      nextHand.length ? "good" : "warn",
      nextHand.length ? "Opening hand drawn" : "Draw skipped",
      nextHand.length
        ? `${nextHand.length} cards drawn from ${mainTotal} main deck cards.`
        : "Add cards to the main deck before drawing.",
    );
  }

  async function writeClipboardText(text: string) {
    const writeWithFallback = () => {
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
    };

    try {
      if (!navigator.clipboard?.writeText) return writeWithFallback();
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Clipboard timed out")), 900);
        }),
      ]);
      return true;
    } catch {
      return writeWithFallback();
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
    if (!context) {
      showToast("bad", "Sheet export failed", "Canvas rendering is unavailable.");
      return;
    }

    context.fillStyle = "#05060a";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#f6c542";
    context.font = "900 48px Arial";
    context.fillText(deck.name.toUpperCase(), 42, 72);
    context.fillStyle = "#f7f7f2";
    context.font = "700 24px Arial";
    context.fillText(
      `${mainTotal}/${MAIN_TARGET} main · ${resourceTotal}/${RESOURCE_TARGET} resource · ${formatMoney(costSummary.artTotal)} prints`,
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
              context.fillText(artDisplayLabel(row.variant), x + 54, y + cardHeight - 13);
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
    showToast(
      "good",
      "Deck sheet exported",
      `${rows.length} print rows rendered as a PNG.`,
    );
  }

  async function copyDeckList() {
    const copied = await writeClipboardText(deckList);
    if (copied) {
      setCopyState("Copied");
      showToast("good", "Deck list copied", "Current list is on your clipboard.");
      window.setTimeout(() => setCopyState("Copy"), 1200);
      return;
    }

    setCopyState("Failed");
    setFallbackPanel({
      title: "Deck List",
      detail: "Clipboard access was blocked. The deck list is selected below.",
      content: deckList,
      downloadName: `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "permet-score"}-deck.txt`,
    });
    showToast("bad", "Copy failed", "Deck list opened in a manual copy panel.");
    window.setTimeout(() => setCopyState("Copy"), 1200);
  }

  async function copyBuyList() {
    if (!buyListText) {
      showToast("good", "Buy list clear", "No missing selected prints to copy.");
      return;
    }

    const copied = await writeClipboardText(buyListText);
    if (copied) {
      showToast("good", "Buy list copied", "Missing print list is on your clipboard.");
      return;
    }

    setFallbackPanel({
      title: "Buy List",
      detail: "Clipboard access was blocked. The missing-print buy list is selected below.",
      content: buyListText,
      downloadName: `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "permet-score"}-buy-list.txt`,
    });
    showToast("warn", "Buy list ready", "Manual copy panel opened.");
  }

  async function copyShareUrl() {
    if (shareState === "Saving") return;
    setShareState("Saving");

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

      const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(
        window.location.hostname,
      );
      const shareUrl = new URL(
        result.shareUrl,
        isLocalHost ? window.location.origin : CANONICAL_ORIGIN,
      ).toString();
      const copied = await writeClipboardText(shareUrl);
      setShareState(copied ? "Copied" : "Link Ready");
      if (!copied) {
        setFallbackPanel({
          title: "Share Link",
          detail:
            "Clipboard access was blocked. This URL shares decklist and selected printings only; ownership is not included.",
          content: shareUrl,
          href: shareUrl,
        });
      }
      showToast(
        copied ? "good" : "warn",
        copied ? "Share link copied" : "Share link ready",
        copied
          ? "Decklist and selected printings copied; ownership is not included."
          : "Manual share panel opened; ownership is not included.",
      );
      window.setTimeout(() => setShareState("Share"), copied ? 1400 : 2600);
    } catch {
      setShareState("Failed");
      showToast("bad", "Share failed", "The deck link could not be created.");
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
    showToast("good", "Deck exported", "JSON download started.");
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = sanitizeDeck(JSON.parse(text));
      if (!parsed) throw new Error("Invalid deck");
      replaceDeckWithUndo(
        () => parsed,
        "Deck imported",
        `${parsed.name} loaded. Previous deck is saved for undo.`,
      );
    } catch {
      showToast(
        "bad",
        "Import failed",
        "Choose a valid Permet Score deck JSON file.",
      );
    }
  }

  function runMobileAction(action: () => void) {
    setMobileActionsOpen(false);
    action();
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

      <header className="border-b border-[#a7b5c9]/25 bg-[#05060a]/82 shadow-xl shadow-black/40 backdrop-blur-xl">
        <div className="mx-auto max-w-[1800px] px-3 py-2 sm:px-5">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 xl:flex-nowrap">
              <div className="flex w-40 shrink-0 items-center sm:w-52 xl:w-56 2xl:w-72">
                <img
                  src="/permet-score-logo.png"
                  alt="Permet Score"
                  className="h-auto w-full object-contain object-left"
                />
              </div>
              <div className="min-w-0">
                <p className="hidden font-display text-sm font-black uppercase text-[#f6c542] sm:block">
                  Gundam Card Game
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:mt-1">
                  <h1 className="sr-only">
                    Permet Score
                  </h1>
                  <StatusBadge isLegal={isLegal} />
                </div>
              </div>
            </div>

            <div className="grid min-w-0 flex-1 gap-2 xl:grid-cols-[minmax(220px,1fr)_auto]">
              <label className="block min-w-0 md:col-span-1">
                <span className="sr-only">Deck name</span>
                <input
                  value={deck.name}
                  onChange={(event) =>
                    setDeck((current) => ({ ...current, name: event.target.value }))
                  }
                  className="control-field h-10 w-full rounded-sm border border-[#a7b5c9]/28 bg-[#f7f7f2]/12 px-3 text-base font-black text-[#f7f7f2] outline-none placeholder:text-[#f7f7f2]/40 focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15 sm:h-11"
                />
              </label>
              <div className="relative">
                <div className="grid grid-cols-4 gap-2 xl:flex xl:justify-end">
                  <ToolbarButton
                    label={`Draw ${OPENING_HAND_SIZE}`}
                    mobileLabel={`Draw ${OPENING_HAND_SIZE}`}
                    title="Draw opening hand"
                    onClick={drawHand}
                    className="w-full xl:w-auto"
                  >
                    <Shuffle size={16} />
                  </ToolbarButton>
                  <ToolbarButton
                    label="Buy List"
                    mobileLabel="Buy"
                    title="Open missing prints buy list"
                    onClick={openBuyList}
                    className="w-full xl:w-auto"
                  >
                    <ShoppingCart size={16} />
                  </ToolbarButton>
                  <ToolbarButton
                    label={shareState}
                    mobileLabel={shareState}
                    title="Share decklist and selected printings"
                    onClick={copyShareUrl}
                    disabled={shareState === "Saving"}
                    className="w-full xl:w-auto"
                  >
                    <Share2 size={16} />
                  </ToolbarButton>
                  <ToolbarButton
                    label={mobileActionsOpen ? "Close" : "More"}
                    mobileLabel={mobileActionsOpen ? "Close" : "More"}
                    title="More deck actions"
                    onClick={() => setMobileActionsOpen((open) => !open)}
                    className="w-full xl:hidden"
                  >
                    {mobileActionsOpen ? <X size={16} /> : <MoreHorizontal size={16} />}
                  </ToolbarButton>
                  <div className="hidden xl:contents">
                    <ToolbarButton label="Sample" title="Load sample deck" onClick={loadSampleDeck}>
                      <ShieldCheck size={16} />
                    </ToolbarButton>
                    <ToolbarButton label="New" title="Start a new deck" onClick={startNewDeck}>
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
                  </div>
                </div>
                {mobileActionsOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 grid w-[min(23rem,calc(100vw-1.5rem))] grid-cols-2 gap-2 rounded-sm border border-[#8bdcff]/28 bg-[#07090d]/98 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl xl:hidden">
                    <ToolbarButton
                      label="Sample"
                      title="Load sample deck"
                      onClick={() => runMobileAction(loadSampleDeck)}
                      className="w-full"
                    >
                      <ShieldCheck size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                      label="New"
                      title="Start a new deck"
                      onClick={() => runMobileAction(startNewDeck)}
                      className="w-full"
                    >
                      <RotateCcw size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Art -"
                      title="Downgrade deck art budget"
                      onClick={() => runMobileAction(() => stepDeckArt(-1))}
                      className="w-full"
                    >
                      <ChevronDown size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Art +"
                      title="Upgrade deck art budget"
                      onClick={() => runMobileAction(() => stepDeckArt(1))}
                      className="w-full"
                    >
                      <ChevronUp size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                      label={copyState}
                      title="Copy deck list"
                      onClick={() => runMobileAction(() => {
                        void copyDeckList();
                      })}
                      className="w-full"
                    >
                      <Clipboard size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Export"
                      title="Export JSON"
                      onClick={() => runMobileAction(exportJson)}
                      className="w-full"
                    >
                      <Download size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Sheet"
                      title="Export deck image"
                      onClick={() => runMobileAction(() => {
                        void exportDeckImage();
                      })}
                      className="w-full"
                    >
                      <Layers size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Import"
                      title="Import JSON"
                      onClick={() => runMobileAction(() => importInputRef.current?.click())}
                      className="w-full"
                    >
                      <Upload size={16} />
                    </ToolbarButton>
                  </div>
                )}
              </div>
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

          <div className="mt-2 hidden gap-2 2xl:grid 2xl:grid-cols-8">
            <Metric label="Main" value={`${mainTotal}/${MAIN_TARGET}`} />
            <Metric label="Resource" value={`${resourceTotal}/${RESOURCE_TARGET}`} />
            <Metric label="Colors" value={deckColors.length ? deckColors.join(" / ") : "-"} />
            <Metric label="Cards" value={`${CARD_POOL.length} loaded`} />
            <Metric label="Alt Prints" value={`${altReadyTotal}`} />
            <Metric label="Market / Est." value={formatMoney(costSummary.artTotal)} />
            <Metric label="Missing Est." value={formatMoney(missingPrintCost)} />
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

      <section className="mx-auto grid max-w-[1800px] gap-4 px-3 py-3 pb-36 sm:px-5 sm:py-4 xl:pb-4">
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

        <div className="workbench-grid grid gap-4 xl:grid-cols-[minmax(430px,1.05fr)_minmax(360px,0.82fr)_minmax(360px,0.9fr)] xl:items-start 2xl:grid-cols-[minmax(540px,1.25fr)_minmax(390px,0.82fr)_minmax(390px,0.9fr)]">
          <section
            className={panelClass(
              `min-w-0 overflow-hidden ${
                mobileView === "library" ? "block" : "hidden xl:block"
              }`,
            )}
          >
            <div className="sticky top-0 z-10 border-b border-[#a7b5c9]/20 bg-[#080a0f]/94 p-2.5 backdrop-blur sm:p-3">
              <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="flex shrink-0 items-center gap-2">
                  <Search size={18} className="text-[#f6c542]" />
                  <h2 className="whitespace-nowrap font-display text-xl font-black uppercase text-[#f7f7f2] sm:text-2xl">
                    Card Library
                  </h2>
                  <span className="rounded-sm border border-[#f6c542]/25 bg-[#f6c542]/12 px-2.5 py-1 text-sm font-black text-[#fff2bd]">
                    {libraryRangeStart}-{libraryRangeEnd}
                  </span>
                </div>
                <div className="grid gap-2">
                  <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_minmax(8.5rem,0.5fr)_minmax(8.5rem,0.5fr)_auto] xl:grid-cols-2 2xl:grid-cols-[minmax(220px,1fr)_minmax(8.5rem,0.5fr)_minmax(8.5rem,0.5fr)_auto]">
                    <label className="filter-cell relative block">
                      <span className="font-display text-xs font-black uppercase text-[#8bdcff]">
                        Search
                      </span>
                      <div className="relative mt-1">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#f7f7f2]/42"
                          size={16}
                        />
                        <input
                          value={query}
                          onChange={(event) => {
                            setQuery(event.target.value);
                            setLibraryPage(0);
                          }}
                          placeholder="Name, #, text"
                          className="control-field h-10 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#f7f7f2]/8 pl-9 pr-3 text-base font-semibold text-[#f7f7f2] outline-none placeholder:text-[#f7f7f2]/42 focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
                        />
                      </div>
                    </label>
                    <SelectFilter
                      label="Color"
                      value={colorFilter}
                      values={colorFilters}
                      onChange={(value) => {
                        setColorFilter(value);
                        setLibraryPage(0);
                      }}
                    />
                    <SelectFilter
                      label="Type"
                      value={typeFilter}
                      values={typeFilters}
                      onChange={(value) => {
                        setTypeFilter(value);
                        setLibraryPage(0);
                      }}
                    />
                    <button
                      type="button"
                      className="interactive-control inline-flex h-full min-h-16 items-center justify-center gap-2 rounded-sm border border-[#8bdcff]/28 bg-[#1167d8]/12 px-3 font-display text-base font-black uppercase text-[#d9ecff] hover:bg-[#1167d8]/18"
                      onClick={() => setAdvancedFiltersOpen((open) => !open)}
                      aria-expanded={advancedFiltersOpen}
                    >
                      <Filter size={16} />
                      Filters
                      {activeAdvancedFilterCount > 0 && (
                        <span className="rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/14 px-1.5 py-0.5 text-sm text-[#fff2bd]">
                          {activeAdvancedFilterCount}
                        </span>
                      )}
                    </button>
                  </div>

                  {activeAdvancedFilterCount > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {setFilter !== "All" && <FilterChip label={`Set: ${setFilter}`} />}
                      {artFilter !== "All Art" && <FilterChip label={`Art: ${artFilter}`} />}
                      {collectionFilter !== "All" && (
                        <FilterChip label={`Collection: ${collectionFilter}`} />
                      )}
                      {budgetLimit !== DEFAULT_BUDGET_LIMIT && (
                        <FilterChip label={`Est. <= ${formatMoney(budgetLimit)}`} />
                      )}
                      <button
                        type="button"
                        className="interactive-control rounded-sm border border-[#a7b5c9]/18 bg-[#f7f7f2]/8 px-2 py-1 font-display text-sm font-black uppercase text-[#f7f7f2]/72"
                        onClick={resetAdvancedFilters}
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {advancedFiltersOpen && (
                    <div className="workbench-scroll grid gap-2 md:grid-cols-4">
                      <label className="filter-cell block min-w-[8.5rem] shrink-0 md:min-w-0">
                        <span className="font-display text-xs font-black uppercase text-[#8bdcff]">
                          Set
                        </span>
                        <select
                          value={setFilter}
                          onChange={(event) => {
                            setSetFilter(event.target.value);
                            setLibraryPage(0);
                          }}
                          className="control-field mt-1 h-10 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-3 text-base font-bold text-[#f7f7f2] outline-none focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
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
                        onChange={(value) => {
                          setArtFilter(value);
                          setLibraryPage(0);
                        }}
                      />
                      <SelectFilter
                        label="Collection"
                        value={collectionFilter}
                        values={collectionFilters}
                        onChange={(value) => {
                          setCollectionFilter(value);
                          setLibraryPage(0);
                        }}
                      />
                      <label className="filter-cell block min-w-[8.5rem] shrink-0 md:min-w-0">
                        <span className="font-display text-xs font-black uppercase text-[#8bdcff]">
                          Est. Price &lt;=
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={budgetLimit}
                          onChange={(event) => {
                            setBudgetLimit(Math.max(0, Number(event.target.value) || 0));
                            setLibraryPage(0);
                          }}
                          className="control-field mt-1 h-10 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-3 text-base font-bold text-[#f7f7f2] outline-none focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-b border-[#a7b5c9]/14 bg-[#0d1118]/86 px-2.5 py-2.5 sm:px-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div aria-live="polite">
                  <p className="font-display text-xs font-black uppercase text-[#8bdcff]">
                    Library Page
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-[#f7f7f2]/72">
                    Showing {libraryRangeStart}-{libraryRangeEnd} of{" "}
                    {filteredCards.length} cards
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="interactive-control inline-flex size-10 items-center justify-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2] hover:border-[#8bdcff]/45 hover:bg-[#8bdcff]/12 disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={() =>
                      setLibraryPage(Math.max(0, safeLibraryPage - 1))
                    }
                    disabled={safeLibraryPage === 0}
                    aria-label="Previous library page"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="min-w-20 rounded-sm border border-[#f6c542]/22 bg-[#f6c542]/10 px-3 py-2 text-center font-display text-sm font-black uppercase text-[#fff2bd]">
                    {safeLibraryPage + 1}/{libraryTotalPages}
                  </span>
                  <button
                    type="button"
                    className="interactive-control inline-flex size-10 items-center justify-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2] hover:border-[#8bdcff]/45 hover:bg-[#8bdcff]/12 disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={() =>
                      setLibraryPage(
                        Math.min(libraryTotalPages - 1, safeLibraryPage + 1),
                      )
                    }
                    disabled={safeLibraryPage >= libraryTotalPages - 1}
                    aria-label="Next library page"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 p-2.5 sm:gap-3 sm:p-3">
              {visibleLibraryCards.length ? (
                visibleLibraryCards.map((card) => (
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
                    onOpenCard={() => {
                      setSelectedNumber(card.number);
                      openCardLightbox(card, getArtVariant(card, deck.art));
                    }}
                    onAdjustMain={(delta) => adjustCard("main", card.number, delta)}
                    onAdjustResource={(delta) =>
                      adjustCard("resource", card.number, delta)
                    }
                  />
                ))
              ) : (
                <div className="col-span-full rounded-sm border border-[#a7b5c9]/18 bg-[#f7f7f2]/7 p-5 text-center">
                  <p className="font-display text-lg font-black uppercase text-[#f7f7f2]">
                    No cards found
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#f7f7f2]/62">
                    Clear a filter or broaden the search.
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="contents xl:grid xl:gap-4">
            <div className="hidden xl:block">
              <MissingPrintsSummary
                missingCount={missingPrintCount}
                missingCost={missingPrintCost}
                onOpen={openBuyList}
              />
            </div>

            <div className={mobileView === "card" ? "block" : "hidden xl:block"}>
              <InspectorPanel
                card={selectedCard}
                artVariant={selectedArtVariant}
                artVariants={selectedArtVariants}
                neededQuantity={selectedNeededCount}
                ownedQuantity={selectedOwnedCount}
                mainQuantity={deck.main[selectedCard.number] ?? 0}
                resourceQuantity={deck.resource[selectedCard.number] ?? 0}
                onAdjustMain={(delta) =>
                  adjustCard("main", selectedCard.number, delta)
                }
                onAdjustResource={(delta) =>
                  adjustCard("resource", selectedCard.number, delta)
                }
                onStepArt={(delta) => stepCardArt(selectedCard.number, delta)}
                onAdjustCollection={(delta) =>
                  adjustCollection(selectedCard.number, selectedArtVariant.id, delta)
                }
                onOpenCard={() => openCardLightbox(selectedCard, selectedArtVariant)}
              />
            </div>

            <div className={mobileView === "stats" ? "grid gap-4" : "hidden xl:grid xl:gap-4"}>
              <DataIntegrityPanel status={dataStatus} />

              <CostPanel summary={costSummary} onMarkOwned={markDeckOwned} />

              <LegalityPanel notices={notices} />

              <SynergyPanel notices={synergyNotices} />

              <HandSimulatorPanel
                cards={openingHandEntries}
                onDraw={drawHand}
                onClear={() => setOpeningHand([])}
                onOpenCard={(card) => openCardLightbox(card)}
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

          <div
            className={`gap-4 xl:grid ${
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
              onOpenCard={openCardLightbox}
              compact
            />

            <DeckPanel
              title="Resource"
              total={resourceTotal}
              target={RESOURCE_TARGET}
              entries={resourceEntries}
              deck={deck}
              zone="resource"
              onAdjust={adjustCard}
              onRemove={removeCard}
              onOpenCard={openCardLightbox}
              compact
            />

            <CompositionPanel
              typeCounts={typeCounts}
              costCurve={costCurve}
              mainTotal={mainTotal}
            />
          </div>
        </div>
      </section>
      <MobileCockpitNav activeView={mobileView} onChange={setMobileView} />
      <ToastViewport
        toast={toast}
        onAction={restoreUndoDeck}
        onDismiss={dismissToast}
      />
      <FallbackPanelView
        panel={fallbackPanel}
        onClose={() => setFallbackPanel(null)}
      />
      <CardLightbox
        item={lightbox}
        onClose={() => setLightbox(null)}
        onVariantChange={(artVariant) =>
          setLightbox((current) => (current ? { ...current, artVariant } : current))
        }
      />
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
    <div className="mt-2 hidden overflow-hidden rounded-sm border border-[#2e8cff]/25 bg-[#07111d]/70 shadow-lg shadow-[#03111f]/30 backdrop-blur 2xl:block">
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
            Card {selectedCard.number}
          </span>
          <span className="rounded-sm border border-[#f6c542]/30 bg-black/24 px-2 py-1 text-[#fff2bd]">
            Missing Est. {formatMoney(missingCost)}
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
              {formatMoney(artTotal)} prints
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden -space-x-3 sm:flex">
            {previewCards.map((card) => (
              <img
                key={card.number}
                src={cardImagePath(card, undefined, 600)}
                srcSet={cardImageSrcSet(card)}
                sizes="3.5rem"
                alt=""
                className="preview-card h-20 w-14 rounded-sm border border-[#f7f7f2]/20 object-cover object-top shadow-xl shadow-black/40"
                referrerPolicy="no-referrer"
                onError={handleCardImageError}
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#8bdcff]/30 bg-[#05060a]/96 px-2 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2 shadow-[0_-18px_44px_rgba(0,0,0,0.72)] backdrop-blur-xl xl:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1.5">
        {mobileViews.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`cockpit-tab grid h-14 place-items-center rounded-sm border font-display text-sm font-black uppercase ${
              activeView === view.id
                ? "cockpit-tab-active border-[#8bdcff]/55 bg-[#1167d8]/28 text-[#d9ecff] shadow-lg shadow-[#1167d8]/22"
                : "border-[#a7b5c9]/18 bg-[#f7f7f2]/7 text-[#f7f7f2]/55"
            }`}
            onClick={() => onChange(view.id)}
            aria-label={`Show ${view.label}`}
          >
            {view.icon}
            <span className="leading-none">{view.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function ToastViewport({
  toast,
  onAction,
  onDismiss,
}: {
  toast: ActionToast | null;
  onAction: () => void;
  onDismiss: () => void;
}) {
  if (!toast) return null;

  const toneClass =
    toast.tone === "good"
      ? "border-[#28d17c]/45 bg-[#06150d]/95 text-[#d9ffe9] shadow-[#28d17c]/10"
      : toast.tone === "warn"
        ? "border-[#f6c542]/45 bg-[#191304]/95 text-[#fff2bd] shadow-[#f6c542]/10"
        : "border-[#e31b23]/50 bg-[#190607]/95 text-[#ffe3e3] shadow-[#e31b23]/10";
  const Icon = toast.tone === "good" ? CheckCircle2 : AlertTriangle;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-24 z-50 flex justify-center xl:bottom-4">
      <div
        key={toast.id}
        role={toast.tone === "bad" ? "alert" : "status"}
        aria-live={toast.tone === "bad" ? "assertive" : "polite"}
        className={`toast-shell pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-sm border p-3 shadow-2xl backdrop-blur ${toneClass}`}
      >
        <Icon className="mt-0.5 shrink-0" size={18} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-black uppercase leading-none">
            {toast.label}
          </div>
          <div className="mt-1 text-sm font-bold leading-5 opacity-80">
            {toast.detail}
          </div>
        </div>
        {toast.actionLabel && (
          <button
            type="button"
            className="interactive-control shrink-0 rounded-sm border border-current/35 bg-current/10 px-3 py-1 font-display text-base font-black uppercase"
            onClick={onAction}
          >
            {toast.actionLabel}
          </button>
        )}
        <button
          type="button"
          className="interactive-control inline-flex size-8 shrink-0 items-center justify-center rounded-sm border border-current/25 bg-black/16"
          onClick={onDismiss}
          aria-label="Dismiss status"
          title="Dismiss status"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function FallbackPanelView({
  panel,
  onClose,
}: {
  panel: FallbackPanel | null;
  onClose: () => void;
}) {
  if (!panel) return null;

  const downloadHref = panel.downloadName
    ? `data:text/plain;charset=utf-8,${encodeURIComponent(panel.content)}`
    : "";

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-black/42 px-3 pb-24 pt-6 backdrop-blur-sm xl:place-items-center xl:pb-6">
      <section className={panelClass("w-full max-w-2xl overflow-hidden")}>
        <div className="flex items-start justify-between gap-3 border-b border-[#a7b5c9]/20 p-3">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">
              {panel.title}
            </h2>
            <p className="mt-1 text-sm font-bold leading-5 text-[#f7f7f2]/65">
              {panel.detail}
            </p>
          </div>
          <button
            type="button"
            className="interactive-control inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2]"
            onClick={onClose}
            aria-label="Close fallback panel"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-3 p-3">
          <textarea
            readOnly
            value={panel.content}
            onFocus={(event) => event.currentTarget.select()}
            className="control-field min-h-28 w-full resize-y rounded-sm border border-[#8bdcff]/24 bg-black/42 p-3 font-mono text-sm font-bold leading-6 text-[#f7f7f2] outline-none focus:border-[#f6c542]"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {panel.href && (
              <a
                href={panel.href}
                target="_blank"
                rel="noopener noreferrer"
                className="interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 font-display text-base font-black uppercase text-[#fff2bd]"
              >
                <Share2 size={15} />
                Open Link
              </a>
            )}
            {downloadHref && panel.downloadName && (
              <a
                href={downloadHref}
                download={panel.downloadName}
                className="interactive-control inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#8bdcff]/30 bg-[#1167d8]/12 font-display text-base font-black uppercase text-[#d9ecff]"
              >
                <Download size={15} />
                Download TXT
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function DataIntegrityPanel({ status }: { status: DataStatus }) {
  const syncLabel = status.lastSync
    ? `${Math.round(status.syncAgeHours ?? 0)}h old`
    : "Not synced";
  const coverageDetail =
    status.totalCards >= COMPLETE_DATABASE_CARD_TARGET
      ? "Complete target met"
      : `${COMPLETE_DATABASE_CARD_TARGET - status.totalCards}+ cards below complete target`;

  return (
    <section className={panelClass()}>
      <PanelTitle icon={<Radar size={18} />} title="Rules & Data" />
      <div className="grid gap-2 p-3">
        <div
          className={`rounded-sm border p-3 ${noticeClass(status.coverageTone)}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-display text-lg font-black uppercase">
              Card Database
            </span>
            <span className="text-base font-black">{status.totalCards}</span>
          </div>
          <p className="mt-1 text-sm font-bold opacity-75">{coverageDetail}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Spec label="Curated" value={`${status.curatedCards}`} />
          <Spec label="Market Cards" value={`${status.tcgCards}`} />
          <Spec label="Prints" value={`${status.tcgPrints}`} />
          <Spec label="Priced IDs" value={`${status.tcgCardsWithPrints}`} />
        </div>

        <div className={`rounded-sm border p-3 ${noticeClass(status.syncTone)}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-base font-black">Market Snapshot</span>
            <span className="text-right text-base font-black">{syncLabel}</span>
          </div>
          <p className="mt-1 text-sm font-bold opacity-75">
            Pricing and discovered printings should sync every {MARKET_FRESH_HOURS}h.
          </p>
        </div>

        <div className="rounded-sm border border-[#a7b5c9]/16 bg-black/24 p-3 text-sm font-bold leading-6 text-[#f7f7f2]/70">
          Enforcing {MAIN_TARGET} main, {RESOURCE_TARGET} resource, max {MAX_MAIN_COPIES} copies, max {MAX_MAIN_COLORS} colors, official main/resource zones. Comprehensive rules reference: {OFFICIAL_RULES_UPDATED}.
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <a
            href={OFFICIAL_RULES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="interactive-control inline-flex h-10 items-center justify-center rounded-sm border border-[#8bdcff]/30 bg-[#1167d8]/12 px-2 font-display text-base font-black uppercase text-[#d9ecff]"
          >
            Rules
          </a>
          <a
            href={OFFICIAL_PRODUCTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="interactive-control inline-flex h-10 items-center justify-center rounded-sm border border-[#a7b5c9]/22 bg-[#f7f7f2]/8 px-2 font-display text-base font-black uppercase text-[#f7f7f2]"
          >
            Products
          </a>
          <a
            href="https://www.tcgplayer.com/categories/trading-and-collectible-card-games/gundam-card-game/price-guides"
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="interactive-control inline-flex h-10 items-center justify-center rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-2 font-display text-base font-black uppercase text-[#fff2bd]"
          >
            TCGplayer
          </a>
        </div>
      </div>
    </section>
  );
}

function CardLightbox({
  item,
  onClose,
  onVariantChange,
}: {
  item: CardLightboxState | null;
  onClose: () => void;
  onVariantChange: (artVariant: CardArtVariant) => void;
}) {
  if (!item) return null;

  const { card } = item;
  const variants = cardArtVariants(card);
  const artVariant =
    variants.find((variant) => variant.id === item.artVariant.id) ?? item.artVariant;
  const hasAltPrints = variants.length > 1;
  const sourceLabel = priceSourceLabel(card, artVariant);

  return (
    <div
      className="card-lightbox fixed inset-0 z-[70] overflow-y-auto bg-[#020305]/88 px-3 py-4 backdrop-blur-xl sm:px-5 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-lightbox-title"
      onClick={onClose}
    >
      <div className="mx-auto flex min-h-full w-full max-w-6xl items-center justify-center">
        <section
          className="lightbox-shell grid w-full gap-3 rounded-sm border border-[#8bdcff]/34 bg-[#05070c]/96 p-3 shadow-2xl shadow-black/70 lg:grid-cols-[minmax(280px,0.9fr)_minmax(320px,0.68fr)] lg:p-4"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="grid min-w-0 gap-3">
            <div className="lightbox-card-stage scan-frame relative grid place-items-center overflow-hidden rounded-sm border border-[#8bdcff]/38 bg-black/88 p-2 shadow-2xl shadow-black/60">
              <img
                src={cardImagePath(card, artVariant, 2000)}
                srcSet={cardImageSrcSet(card, artVariant)}
                sizes="(min-width: 1024px) 58vw, 94vw"
                alt={`${card.name} ${artDisplayLabel(artVariant)} card`}
                className="mx-auto max-h-[72vh] max-w-full object-contain object-top lg:max-h-[78vh]"
                referrerPolicy="no-referrer"
                onError={handleCardImageError}
              />
              <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1.5">
                <span className="rounded-sm bg-[#f7f7f2] px-2 py-1 text-sm font-black text-black">
                  {printDisplayId(artVariant)}
                </span>
                <span className="rounded-sm border border-[#f6c542]/35 bg-black/70 px-2 py-1 text-sm font-black text-[#fff2bd]">
                  {artDisplayLabel(artVariant)}
                </span>
              </div>
            </div>

            {hasAltPrints && (
              <div className="grid gap-2 rounded-sm border border-[#a7b5c9]/16 bg-black/28 p-2">
                <div className="flex items-center gap-2 font-display text-base font-black uppercase text-[#f7f7f2]/74">
                  <Sparkles size={15} className="text-[#f6c542]" />
                  Alt Prints
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(3.25rem,1fr))] gap-2">
                  {variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      className={`interactive-control overflow-hidden rounded-sm border bg-black ${
                        variant.id === artVariant.id
                          ? "border-[#f6c542]/70 shadow-lg shadow-[#f6c542]/12"
                          : "border-[#a7b5c9]/18"
                      }`}
                      onClick={() => onVariantChange(variant)}
                      aria-label={`View ${artDisplayLabel(variant)} of ${card.name}`}
                      title={`${artDisplayLabel(variant)} · ${formatPrintMoney(card, variant)}`}
                    >
                      <img
                        src={cardImagePath(card, variant, 600)}
                        srcSet={cardImageSrcSet(card, variant)}
                        sizes="4.5rem"
                        alt=""
                        className="aspect-[5/7] w-full object-cover object-top"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={handleCardImageError}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid min-w-0 content-start gap-3 lg:max-h-[82vh] lg:overflow-y-auto lg:pr-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  <span className={`rounded-sm border px-2 py-1 text-sm font-black ${colorChipClass(card.color)}`}>
                    {card.color}
                  </span>
                  <span className="rounded-sm border border-[#f7f7f2]/14 bg-[#f7f7f2]/9 px-2 py-1 text-sm font-black text-[#f7f7f2]">
                    {card.type}
                  </span>
                  <span className="rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-2 py-1 text-sm font-black text-[#fff2bd]">
                    {formatPrintMoney(card, artVariant)}
                  </span>
                </div>
                <h2
                  id="card-lightbox-title"
                  className="mt-3 font-display text-3xl font-black uppercase leading-none text-[#f7f7f2] sm:text-4xl"
                >
                  {card.name}
                </h2>
                <p className="mt-2 text-base font-bold text-[#f7f7f2]/64">
                  {card.set} · {sourceLabel}
                </p>
              </div>
              <button
                type="button"
                className="interactive-control inline-flex size-10 shrink-0 items-center justify-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2]"
                onClick={onClose}
                aria-label="Close card view"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              <Spec label="Lv" value={card.level} />
              <Spec label="Cost" value={card.cost} />
              <Spec label="AP" value={card.ap} />
              <Spec label="HP" value={card.hp} />
            </div>

            <div className="rounded-sm border border-[#a7b5c9]/18 bg-[#f7f7f2]/[0.055] p-3">
              <p className="text-lg font-medium leading-7 text-[#f7f7f2]/88">
                {card.text}
              </p>
            </div>

            <div className="grid gap-2 rounded-sm border border-[#a7b5c9]/16 bg-black/26 p-3 text-base font-bold text-[#f7f7f2]/66">
              <span>{card.number}</span>
              <span>{card.trait}</span>
              <span>{card.link}</span>
              <span>{card.source}</span>
            </div>

            <a
              href={tcgplayerUrl(card, artVariant)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/42 bg-[#f6c542]/13 font-display text-lg font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/18"
              title={`Search TCGplayer for ${card.name} ${artDisplayLabel(artVariant)}`}
            >
              <ShoppingCart size={17} />
              Search TCGplayer
            </a>
          </div>
        </section>
      </div>
    </div>
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
      <PanelTitle icon={<BadgeDollarSign size={18} />} title="Market Cost" />
      <div className="grid gap-2 p-3">
        <div className="rounded-sm border border-[#8bdcff]/18 bg-[#1167d8]/10 p-2 text-sm font-bold leading-6 text-[#d9ecff]/82">
          {TCGPLAYER_LAST_SYNC
            ? `Market snapshot synced ${TCGPLAYER_LAST_SYNC}. Unmatched prints fall back to local estimates.`
            : "No market snapshot has been generated yet. Showing local estimates."}
        </div>
        <CostRow label="Base prints" value={formatMoney(summary.baseTotal)} />
        <CostRow label="Alt-art premium" value={formatMoney(summary.altPremium)} />
        <CostRow label="Owned prints" value={formatMoney(summary.ownedValue)} />
        <CostRow label="Missing prints" value={formatMoney(summary.missingCost)} hot />
        <div className="mt-1 grid grid-cols-3 gap-2 text-center">
          <Spec label="Needed" value={`${summary.neededCopies}`} />
          <Spec label="Owned" value={`${summary.ownedCopies}`} />
          <Spec label="Missing" value={`${summary.missingCopies}`} />
        </div>
        <button
          type="button"
          className="interactive-control mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#28d17c]/35 bg-[#28d17c]/12 font-display text-base font-black uppercase text-[#d9ffe9] hover:bg-[#28d17c]/18"
          onClick={onMarkOwned}
        >
          <WalletCards size={16} />
          Mark Deck Prints Owned
        </button>
      </div>
    </section>
  );
}

function MissingPrintsSummary({
  missingCount,
  missingCost,
  onOpen,
}: {
  missingCount: number;
  missingCost: number;
  onOpen: () => void;
}) {
  return (
    <section className={panelClass("overflow-hidden")}>
      <button
        type="button"
        className="interactive-control grid w-full grid-cols-[1fr_auto] items-center gap-3 p-3 text-left"
        onClick={onOpen}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-display text-lg font-black uppercase text-[#f6c542]">
            <ShoppingCart size={17} />
            Buy List
          </div>
          <p className="mt-1 truncate text-sm font-bold text-[#f7f7f2]/62">
            Copy missing selected prints with TCGplayer buy links.
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-xl font-black text-[#f7f7f2]">
            {missingCount}
          </div>
          <div className="text-sm font-black text-[#fff2bd]">
            {formatMoney(missingCost)}
          </div>
        </div>
      </button>
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
  onOpenCard,
}: {
  cards: GundamCard[];
  onDraw: () => void;
  onClear: () => void;
  onOpenCard: (card: GundamCard) => void;
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
                <CardThumb card={card} onOpen={() => onOpenCard(card)} />
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
  mobileLabel,
  title,
  onClick,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  mobileLabel?: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`interactive-control inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-sm border px-2 font-display text-base font-black uppercase shadow-sm sm:h-11 sm:gap-2 sm:px-3 sm:text-lg xl:px-0 2xl:px-3 ${className} ${
        disabled
          ? "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
          : "border-[#a7b5c9]/25 bg-[linear-gradient(90deg,rgba(145,145,145,0.22),rgba(62,112,124,0.28))] text-[#f7f7f2] hover:border-[#f6c542]/45 hover:bg-[#f6c542]/12"
      }`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
      <span className="inline whitespace-nowrap xl:hidden 2xl:inline">
        <span className="sm:hidden">{mobileLabel ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
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

function FilterChip({ label }: { label: string }) {
  return (
    <span className="rounded-sm border border-[#8bdcff]/25 bg-[#1167d8]/12 px-2 py-1 text-sm font-black text-[#d9ecff]">
      {label}
    </span>
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
    <label className="filter-cell block min-w-[8.5rem] shrink-0 md:min-w-0">
      <span className="font-display text-xs font-black uppercase text-[#8bdcff]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="control-field mt-1 h-10 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-3 text-base font-bold text-[#f7f7f2] outline-none focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
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

function QuantityStepper({
  label,
  quantity,
  tone,
  incrementDisabled,
  decrementDisabled,
  incrementReason,
  decrementReason,
  onIncrement,
  onDecrement,
  compact = false,
}: {
  label: string;
  quantity: number;
  tone: Zone;
  incrementDisabled: boolean;
  decrementDisabled: boolean;
  incrementReason?: string;
  decrementReason?: string;
  onIncrement: () => void;
  onDecrement: () => void;
  compact?: boolean;
}) {
  const toneClass =
    tone === "main"
      ? "border-[#e31b23]/32 bg-[#e31b23]/10 text-[#ffe3e3]"
      : "border-[#2e8cff]/32 bg-[#1167d8]/12 text-[#d9ecff]";
  const buttonClass = (disabled: boolean) =>
    `interactive-control inline-flex items-center justify-center rounded-sm border ${
      compact ? "size-8" : "size-9"
    } ${
      disabled
        ? "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/25"
        : "border-current/30 bg-black/22 text-current hover:bg-current/10"
    }`;
  const visibleReason = incrementDisabled ? incrementReason : "";

  return (
    <div
      className={`quantity-stepper rounded-sm border ${
        compact ? "p-1" : "p-1.5"
      } ${toneClass}`}
    >
      <div
        className={`grid items-center gap-1.5 ${
          compact
            ? "grid-cols-[minmax(1.8rem,1fr)_2rem_2rem_2rem]"
            : "grid-cols-[minmax(4.5rem,1fr)_2.25rem_3rem_2.25rem]"
        }`}
      >
        <span
          className={`truncate font-display font-black uppercase ${
            compact ? "text-sm" : "text-base"
          }`}
        >
          {label}
        </span>
        <button
          type="button"
          className={buttonClass(decrementDisabled)}
          disabled={decrementDisabled}
          title={decrementDisabled ? decrementReason : `Remove one ${label} copy`}
          aria-label={`Remove one ${label} copy`}
          onClick={(event) => {
            event.stopPropagation();
            onDecrement();
          }}
        >
          <Minus size={compact ? 13 : 15} />
        </button>
        <output
          className={`grid place-items-center rounded-sm border border-current/22 bg-black/28 font-display font-black ${
            compact ? "h-8 text-base" : "h-9 text-xl"
          }`}
          aria-live="polite"
        >
          {quantity}
        </output>
        <button
          type="button"
          className={buttonClass(incrementDisabled)}
          disabled={incrementDisabled}
          title={incrementDisabled ? incrementReason : `Add one ${label} copy`}
          aria-label={`Add one ${label} copy`}
          onClick={(event) => {
            event.stopPropagation();
            onIncrement();
          }}
        >
          <Plus size={compact ? 13 : 15} />
        </button>
      </div>
      <div
        className={`mt-1 min-h-4 truncate font-bold opacity-70 ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        {visibleReason}
      </div>
    </div>
  );
}

function MiniQuantityControl({
  label,
  quantity,
  tone,
  dense = false,
  incrementDisabled,
  decrementDisabled,
  incrementReason,
  decrementReason,
  onIncrement,
  onDecrement,
}: {
  label: string;
  quantity: number;
  tone: Zone;
  dense?: boolean;
  incrementDisabled: boolean;
  decrementDisabled: boolean;
  incrementReason?: string;
  decrementReason?: string;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const toneClass =
    tone === "main"
      ? "border-[#e31b23]/36 bg-[#2b0710]/72 text-[#ffe3e3]"
      : "border-[#2e8cff]/36 bg-[#06142a]/72 text-[#d9ecff]";
  const controlClass = (disabled: boolean) =>
    `interactive-control grid h-9 place-items-center ${
      disabled
        ? "cursor-not-allowed bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/25"
        : "bg-black/22 text-current hover:bg-current/10"
    }`;

  return (
    <div
      className={`mini-stepper grid h-9 ${
        dense
          ? "grid-cols-[1.85rem_minmax(1.7rem,1fr)_1.85rem]"
          : "grid-cols-[2.15rem_minmax(2rem,1fr)_2.15rem]"
      } overflow-hidden rounded-sm border ${toneClass}`}
      title={incrementDisabled ? incrementReason : `${label}: ${quantity}`}
    >
      <button
        type="button"
        className={`${controlClass(decrementDisabled)} border-r border-current/18`}
        disabled={decrementDisabled}
        title={decrementDisabled ? decrementReason : `Remove one ${label}`}
        aria-label={`Remove one ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          onDecrement();
        }}
      >
        <Minus size={dense ? 13 : 14} />
      </button>
      <output
        className={`grid h-9 place-items-center border-x-0 bg-[#f7f7f2]/6 px-1 font-display font-black ${
          dense ? "text-base" : "text-lg"
        }`}
      >
        {quantity}
      </output>
      <button
        type="button"
        className={`${controlClass(incrementDisabled)} border-l border-current/18`}
        disabled={incrementDisabled}
        title={incrementDisabled ? incrementReason : `Add one ${label}`}
        aria-label={incrementDisabled ? incrementReason : `Add one ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          onIncrement();
        }}
      >
        <Plus size={dense ? 13 : 14} />
      </button>
    </div>
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
  onOpenCard,
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
  onOpenCard: (card: GundamCard, artVariant: CardArtVariant) => void;
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
            const addConstraint = zoneAddConstraint(zone, card, quantity);
            return (
              <div
                key={card.number}
                className={`deck-entry interactive-row rounded-sm border bg-[#f7f7f2]/[0.045] p-2 shadow-lg shadow-black/10 ${colorAccentClass(
                  card.color,
                )}`}
              >
                <div className="grid grid-cols-[4.35rem_minmax(0,1fr)] gap-2.5 sm:grid-cols-[4.85rem_minmax(0,1fr)]">
                  <CardThumb
                    card={card}
                    artVariant={artVariant}
                    onOpen={() => onOpenCard(card, artVariant)}
                    size="deck"
                    badge={`${quantity}`}
                  />
                  <div className="grid min-w-0 content-start gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className={`rounded-sm border px-1.5 py-0.5 text-xs font-black ${colorChipClass(card.color)}`}>
                          {card.color}
                        </span>
                        <span className="rounded-sm border border-[#f7f7f2]/12 bg-[#f7f7f2]/8 px-1.5 py-0.5 text-xs font-black text-[#f7f7f2]/78">
                          {card.type}
                        </span>
                        {artVariant.id !== "standard" && (
                          <span className="rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-1.5 py-0.5 text-xs font-black text-[#fff2bd]">
                            {artDisplayLabel(artVariant)}
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 truncate font-display text-xl font-black uppercase leading-tight text-[#f7f7f2]">
                        {card.name}
                      </h3>
                      <p className="truncate text-sm font-bold text-[#f7f7f2]/58">
                        {card.number} · {formatPrintMoney(card, artVariant)}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {printEntries.map((entry) => (
                        <span
                          key={entry.variant.id}
                          className="rounded-sm border border-[#a7b5c9]/18 bg-black/24 px-1.5 py-0.5 text-xs font-black text-[#f7f7f2]/68"
                        >
                          {entry.quantity} {artDisplayLabel(entry.variant)}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-[minmax(3.75rem,1fr)_6.45rem_2.25rem] gap-1.5">
                      <a
                        href={tcgplayerUrl(card, artVariant)}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="interactive-control inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-sm border border-[#f6c542]/34 bg-[#f6c542]/10 px-2 font-display text-base font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/16"
                        title={`Search TCGplayer for ${card.name}`}
                        aria-label={`Search TCGplayer for ${card.name}`}
                      >
                        <ShoppingCart size={15} />
                        <span>TCG</span>
                      </a>
                      <MiniQuantityControl
                        label={card.name}
                        quantity={quantity}
                        tone={zone}
                        incrementDisabled={Boolean(addConstraint)}
                        decrementDisabled={quantity <= 0}
                        incrementReason={addConstraint}
                        decrementReason={`No ${zoneLabel(zone).toLowerCase()} copies`}
                        onIncrement={() => onAdjust(zone, card.number, 1)}
                        onDecrement={() => onAdjust(zone, card.number, -1)}
                      />
                      <IconButton
                        label={`Remove ${card.name}`}
                        onClick={() => onRemove(zone, card.number)}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
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
  onOpenCard,
  onAdjustMain,
  onAdjustResource,
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
  onOpenCard: () => void;
  onAdjustMain: (delta: number) => void;
  onAdjustResource: (delta: number) => void;
}) {
  const quantity = mainQuantity + resourceQuantity;
  const primaryZone: Zone | null = MAIN_TYPES.includes(card.type)
    ? "main"
    : RESOURCE_TYPES.includes(card.type)
      ? "resource"
      : null;
  const primaryQuantity =
    primaryZone === "main"
      ? mainQuantity
      : primaryZone === "resource"
        ? resourceQuantity
        : 0;
  const primaryConstraint = primaryZone
    ? zoneAddConstraint(primaryZone, card, primaryQuantity)
    : "No builder slot for this card type";
  const onAdjustPrimary =
    primaryZone === "main"
      ? onAdjustMain
      : primaryZone === "resource"
        ? onAdjustResource
        : null;

  return (
    <article
      className={`library-result interactive-row group cursor-pointer overflow-hidden rounded-sm border bg-[#080b11]/96 p-2.5 shadow-lg shadow-black/18 transition duration-200 hover:-translate-y-0.5 hover:border-[#8bdcff]/45 hover:bg-[#0d131d] ${colorAccentClass(
        card.color,
      )} ${selected ? "ring-2 ring-[#f6c542] ring-offset-2 ring-offset-[#05060a]" : ""}`}
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onOpenCard();
      }}
    >
      <button
        type="button"
        className="scan-frame relative block h-40 w-full overflow-hidden rounded-sm border border-[#8bdcff]/28 bg-[#11141b] text-left shadow-lg shadow-black/35 sm:h-44"
        onClick={(event) => {
          event.stopPropagation();
          onOpenCard();
        }}
        aria-label={`Open large view of ${card.name}`}
        title={`Open large view of ${card.name}`}
      >
        <img
          src={cardImagePath(card, artVariant, 1000)}
          srcSet={cardImageSrcSet(card, artVariant)}
          sizes="(min-width: 1280px) 20vw, (min-width: 640px) 44vw, 92vw"
          alt={`${card.name} card`}
          className="h-full w-full object-cover object-top transition duration-200 group-hover:scale-[1.035]"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={handleCardImageError}
        />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#06080d]/95 via-[#06080d]/28 to-transparent" />
        {selected && (
          <span className="permet-scanline pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#8bdcff]/0 via-[#8bdcff]/28 to-[#8bdcff]/0" />
        )}
        <span className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          <span className="rounded-sm bg-[#f7f7f2] px-1.5 py-0.5 text-[11px] font-black leading-none text-black">
            {card.number}
          </span>
          <span className={`rounded-sm border px-1.5 py-0.5 text-[11px] font-black leading-none ${colorChipClass(card.color)}`}>
            {card.color}
          </span>
          {artVariants.length > 1 && (
            <span className="rounded-sm border border-[#f6c542]/35 bg-black/70 px-1.5 py-0.5 text-[11px] font-black leading-none text-[#fff2bd]">
              {artDisplayLabel(artVariant)}
            </span>
          )}
        </span>
        {quantity > 0 && (
          <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-sm border border-[#f6c542]/55 bg-[#e31b23] font-display text-base font-black leading-none text-white shadow-lg shadow-black/30">
            {quantity}
          </span>
        )}
        <span className="pointer-events-none absolute bottom-2 right-2 grid size-8 place-items-center rounded-sm border border-[#8bdcff]/36 bg-black/70 text-[#d9ecff]">
          <Maximize2 size={15} />
        </span>
        <span className="pointer-events-none absolute bottom-2 left-2 right-12 min-w-0">
          <span className="line-clamp-2 font-display text-xl font-black uppercase leading-tight text-[#f7f7f2]">
            {card.name}
          </span>
          <span className="mt-1 block truncate text-sm font-bold text-[#f7f7f2]/72">
            {card.type} · {formatPrintMoney(card, artVariant)}
          </span>
        </span>
      </button>

      <div className="mt-2 flex min-w-0 flex-wrap gap-1 text-[11px] font-black uppercase">
        {quantity > 0 && (
          <span className="rounded-sm border border-[#a7b5c9]/16 bg-[#f7f7f2]/7 px-1.5 py-0.5 text-[#f7f7f2]/62">
            Deck {quantity}
          </span>
        )}
        {ownedQuantity > 0 && (
          <span
            className="rounded-sm border border-[#28d17c]/24 bg-[#28d17c]/10 px-1.5 py-0.5 text-[#d9ffe9]"
            title={`${ownedQuantity} owned across all prints`}
          >
            Owned {ownedQuantity}
          </span>
        )}
        {missingQuantity > 0 && (
          <span
            className="rounded-sm border border-[#f6c542]/26 bg-[#f6c542]/10 px-1.5 py-0.5 text-[#fff2bd]"
            title={`${missingQuantity} missing selected-print copies`}
          >
            Need {missingQuantity}
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[minmax(5.7rem,1fr)_2.35rem_3.1rem] gap-1.5">
        {primaryZone && onAdjustPrimary ? (
          <MiniQuantityControl
            label={`${card.name} ${zoneLabel(primaryZone).toLowerCase()} copy`}
            quantity={primaryQuantity}
            tone={primaryZone}
            dense
            incrementDisabled={Boolean(primaryConstraint)}
            decrementDisabled={primaryQuantity <= 0}
            incrementReason={primaryConstraint}
            decrementReason={`No ${zoneLabel(primaryZone).toLowerCase()} copies`}
            onIncrement={() => onAdjustPrimary(1)}
            onDecrement={() => onAdjustPrimary(-1)}
          />
        ) : (
          <div className="grid h-9 place-items-center rounded-sm border border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] px-2">
            <div className="truncate font-display text-sm font-black uppercase text-[#f7f7f2]/35">
              Locked
            </div>
          </div>
        )}
        <button
          type="button"
          className="interactive-control inline-flex h-9 min-h-9 items-center justify-center rounded-sm border border-[#8bdcff]/30 bg-[#8bdcff]/10 text-[#d9ecff] hover:bg-[#8bdcff]/16"
          onClick={(event) => {
            event.stopPropagation();
            onOpenCard();
          }}
          title={`Open large view of ${card.name}`}
          aria-label={`Open large view of ${card.name}`}
        >
          <Maximize2 size={15} />
        </button>
        <a
          href={tcgplayerUrl(card, artVariant)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="interactive-control inline-flex h-9 min-h-9 items-center justify-center gap-1 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 font-display text-sm font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/18"
          onClick={(event) => event.stopPropagation()}
          title={`Search TCGplayer for ${card.name}`}
          aria-label={`Search TCGplayer for ${card.name}`}
        >
          <ShoppingCart size={15} />
          TCG
        </a>
      </div>
    </article>
  );
}

function InspectorPanel({
  card,
  artVariant,
  artVariants,
  neededQuantity,
  ownedQuantity,
  mainQuantity,
  resourceQuantity,
  onAdjustMain,
  onAdjustResource,
  onStepArt,
  onAdjustCollection,
  onOpenCard,
}: {
  card: GundamCard;
  artVariant: CardArtVariant;
  artVariants: readonly CardArtVariant[];
  neededQuantity: number;
  ownedQuantity: number;
  mainQuantity: number;
  resourceQuantity: number;
  onAdjustMain: (delta: number) => void;
  onAdjustResource: (delta: number) => void;
  onStepArt: (delta: number) => void;
  onAdjustCollection: (delta: number) => void;
  onOpenCard: () => void;
}) {
  const mainConstraint = zoneAddConstraint("main", card, mainQuantity);
  const resourceConstraint = zoneAddConstraint("resource", card, resourceQuantity);
  const artIndex = Math.max(
    0,
    artVariants.findIndex((variant) => variant.id === artVariant.id),
  );
  const canDowngradeArt = artIndex > 0;
  const canUpgradeArt = artIndex < artVariants.length - 1;
  const missingSelectedPrint = Math.max(0, neededQuantity - ownedQuantity);

  return (
    <section className={panelClass("overflow-hidden")}>
      <div className={`border-b border-[#a7b5c9]/20 p-3 ${colorAccentClass(card.color)}`}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="scan-frame interactive-control relative h-36 w-[103px] shrink-0 overflow-hidden rounded-sm border border-[#8bdcff]/35 bg-black text-left shadow-2xl shadow-black/40"
            onClick={onOpenCard}
            aria-label={`Open large view of ${card.name}`}
            title={`Open large view of ${card.name}`}
          >
            <img
              src={cardImagePath(card, artVariant, 1000)}
              srcSet={cardImageSrcSet(card, artVariant)}
              sizes="7rem"
              alt={`${card.name} card`}
              className="h-full w-full object-cover object-top"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={handleCardImageError}
            />
            <span className="absolute inset-x-0 bottom-0 z-10 inline-flex h-7 items-center justify-center gap-1 bg-black/72 font-display text-sm font-black uppercase text-[#d9ecff]">
              <Maximize2 size={12} />
              View
            </span>
          </button>
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
                {artDisplayLabel(artVariant)}
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
      <div className="grid gap-2 border-t border-[#a7b5c9]/20 p-3 2xl:grid-cols-2">
        <QuantityStepper
          label="Main"
          quantity={mainQuantity}
          tone="main"
          incrementDisabled={Boolean(mainConstraint)}
          decrementDisabled={mainQuantity <= 0}
          incrementReason={mainConstraint}
          decrementReason="No main copies"
          onIncrement={() => onAdjustMain(1)}
          onDecrement={() => onAdjustMain(-1)}
        />
        <QuantityStepper
          label="Res"
          quantity={resourceQuantity}
          tone="resource"
          incrementDisabled={Boolean(resourceConstraint)}
          decrementDisabled={resourceQuantity <= 0}
          incrementReason={resourceConstraint}
          decrementReason="No resource copies"
          onIncrement={() => onAdjustResource(1)}
          onDecrement={() => onAdjustResource(-1)}
        />
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
              {printDisplayId(artVariant)} · {formatPrintMoney(card, artVariant)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 2xl:grid-cols-3">
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
              href={tcgplayerUrl(card, artVariant)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="interactive-control col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/40 bg-[#f6c542]/12 px-3 font-display text-base font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/18 2xl:col-span-1"
              title={`Search TCGplayer for ${card.name} ${artDisplayLabel(artVariant)}`}
            >
              <ShoppingCart size={15} />
              TCG
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
              title={`${artDisplayLabel(variant)} ${formatPrintMoney(card, variant)}`}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-sm border border-[#a7b5c9]/16 bg-black/28 p-2">
          <div className="min-w-0">
            <div className="font-display text-base font-black uppercase text-[#f7f7f2]/65">
              Selected Print
            </div>
            <div className="text-base font-black text-[#f7f7f2]">
              Owned {ownedQuantity} / Needed {neededQuantity}
            </div>
            <div className="truncate text-sm font-bold text-[#f7f7f2]/55">
              Missing {missingSelectedPrint} · {artDisplayLabel(artVariant)} ownership
            </div>
          </div>
          <IconButton label="Remove owned selected print" onClick={() => onAdjustCollection(-1)}>
            <Minus size={14} />
          </IconButton>
          <IconButton label="Add owned selected print" onClick={() => onAdjustCollection(1)}>
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
  onOpen,
  size = "sm",
  badge,
}: {
  card: GundamCard;
  artVariant?: CardArtVariant;
  onOpen?: () => void;
  size?: "sm" | "deck";
  badge?: string;
}) {
  const sizeClass =
    size === "deck"
      ? "h-24 w-[4.25rem] sm:h-28 sm:w-20"
      : "h-16 w-12";
  const thumbClass =
    `relative ${sizeClass} shrink-0 overflow-hidden rounded-sm border border-[#f7f7f2]/15 bg-black shadow-sm`;
  const image = (
    <img
      src={cardImagePath(card, artVariant, size === "deck" ? 800 : 600)}
      srcSet={cardImageSrcSet(card, artVariant)}
      sizes={size === "deck" ? "5rem" : "3rem"}
      alt={`${card.name} card`}
      className="h-full w-full object-cover object-top"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={handleCardImageError}
    />
  );

  if (onOpen) {
    return (
      <button
        type="button"
        className={`${thumbClass} interactive-control group/card-thumb`}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label={`Open large view of ${card.name}`}
        title={`Open large view of ${card.name}`}
      >
        {image}
        {badge && (
          <span className="absolute right-1 top-1 grid size-7 place-items-center rounded-sm border border-[#f6c542]/55 bg-[#e31b23] font-display text-base font-black leading-none text-white shadow-lg shadow-black/30">
            {badge}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 grid h-5 place-items-center bg-black/70 text-[#d9ecff] opacity-0 transition group-hover/card-thumb:opacity-100 group-focus-visible/card-thumb:opacity-100">
          <Maximize2 size={11} />
        </span>
      </button>
    );
  }

  return (
    <div className={thumbClass}>
      {image}
      {badge && (
        <span className="absolute right-1 top-1 grid size-7 place-items-center rounded-sm border border-[#f6c542]/55 bg-[#e31b23] font-display text-base font-black leading-none text-white shadow-lg shadow-black/30">
          {badge}
        </span>
      )}
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
