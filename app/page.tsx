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
  Trash2,
  Undo2,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import NextImage from "next/image";
import {
  type SyntheticEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type CardArtVariant } from "./card-art-data";
import {
  type CardColor,
  type CardType,
  type GundamCard,
} from "./card-data";
import {
  CARD_ARTS_BY_NUMBER,
  CARD_BY_NUMBER,
  CARD_POOL,
  CURATED_CARD_NUMBERS,
  CURATED_CARD_POOL,
  OFFICIAL_CARD_POOL,
  TCGPLAYER_CARD_POOL,
} from "./card-pool";
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
  csvContent?: string;
  csvDownloadName?: string;
  copyLabel?: string;
  buyEntries?: TcgListEntry[];
  autoSelectContent?: boolean;
};

type FocusableElement = HTMLElement & {
  disabled?: boolean;
};

type CostSummary = {
  baseTotal: number;
  artTotal: number;
  altPremium: number;
  ownedValue: number;
  unownedCost: number;
  deckCopies: number;
  ownedCopies: number;
  unownedCopies: number;
};

type TcgListEntry = {
  card: GundamCard;
  variant: CardArtVariant;
  quantity: number;
  owned: number;
  openQuantity: number;
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

type FeedbackPulse = {
  id: number;
  keys: string[];
  message: string;
};

type ShareCache = {
  snapshot: string;
  url: string;
};

const STORAGE_KEY = "gundam-deck-builder-v1";
const MAIN_TARGET = 50;
const RESOURCE_TARGET = 10;
const MAX_MAIN_COPIES = 4;
const MAX_MAIN_COLORS = 2;
const TCGPLAYER_FRESH_HOURS = 48;
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
  "EX BASE": 6,
  "UNIT TOKEN": 7,
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
  "EX BASE",
  "UNIT TOKEN",
] as const;
const artFilters = [
  "All Prints",
  "Has Parallel Print",
  "Base Print Only",
  "P1 Print",
  "P2 Print",
  "Premium Print",
] as const;
const collectionFilters = ["All", "Owned", "Budget"] as const;
const buildStatusFilters = ["All", "Deck Ready", "Catalog Only"] as const;
const DEFAULT_BUDGET_LIMIT = 5;
const LIBRARY_PAGE_SIZE = 6;
const MAX_IMPORT_BYTES = 64 * 1024;
const libraryPageSizeOptions = [6, 12, 24] as const;

const HUD_TEXTURE_IMAGE = "/assets/permet-armor-ui-v2.webp";
const CARD_IMAGE_FALLBACK = "/permet-link-logo-fallback.webp";
const TCGPLAYER_SEARCH_URL = "https://www.tcgplayer.com/search/all/product";
const CANONICAL_ORIGIN = "https://permetlink.com";

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

function sameDeckQuantities(
  current: Record<string, number>,
  template: Record<string, number>,
) {
  const currentEntries = Object.entries(current).filter(([, quantity]) => quantity > 0);
  const templateEntries = Object.entries(template).filter(([, quantity]) => quantity > 0);
  if (currentEntries.length !== templateEntries.length) return false;
  return templateEntries.every(([number, quantity]) => current[number] === quantity);
}

function isStarterDeckState(deck: DeckState) {
  return (
    deck.name === starterDeck.name &&
    sameDeckQuantities(deck.main, starterDeck.main) &&
    sameDeckQuantities(deck.resource, starterDeck.resource)
  );
}

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
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function safeLocalStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable in private or locked-down browser modes.
  }
}

function textByteLength(text: string) {
  return new Blob([text]).size;
}

function assertImportSize(text: string) {
  if (textByteLength(text) > MAX_IMPORT_BYTES) {
    throw new Error("Deck import is too large. Use a Permet Link export under 64 KB.");
  }
}

function sanitizeQuantities(value: unknown, zone: Zone): QuantityMap {
  if (!value || typeof value !== "object") return {};
  const maxCopies = zone === "main" ? MAX_MAIN_COPIES : RESOURCE_TARGET;
  const maxTotal = zone === "main" ? MAIN_TARGET : RESOURCE_TARGET;
  const next: QuantityMap = {};
  let remaining = maxTotal;

  Object.entries(value as Record<string, unknown>).forEach(([number, quantity]) => {
    if (remaining <= 0) return;
    const card = CARD_BY_NUMBER.get(number);
    if (!card || !canCardEnterZone(zone, card)) return;
    const safeQuantity = Math.min(clampQuantity(quantity), maxCopies, remaining);
    if (safeQuantity <= 0) return;
    next[number] = safeQuantity;
    remaining -= safeQuantity;
  });

  return next;
}

function tcgplayerProductImageUrl(productId: number, size = 1500) {
  const clampedSize = Math.max(size, 320);
  return `https://product-images.tcgplayer.com/fit-in/${clampedSize}x${clampedSize}/${productId}.jpg`;
}

function hasDirectTcgplayerProduct(print: TcgplayerPrint) {
  return /tcgplayer\.com\/product\/\d+/i.test(print.url);
}

function isAllowedTcgplayerImageUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "product-images.tcgplayer.com" ||
        url.hostname === "tcgplayer-cdn.tcgplayer.com" ||
        url.hostname.endsWith(".tcgplayer.com"))
    );
  } catch {
    return false;
  }
}

function tcgplayerPrintImageUrl(print: TcgplayerPrint, size = 1500) {
  if (print.imageUrl && isAllowedTcgplayerImageUrl(print.imageUrl)) {
    return print.imageUrl;
  }
  return print.productId && hasDirectTcgplayerProduct(print)
    ? tcgplayerProductImageUrl(print.productId, size)
    : null;
}

const cardArtVariantCache = new Map<string, readonly CardArtVariant[]>();
const cardSearchHaystackCache = new Map<string, string>();

function cardArtVariants(card: GundamCard) {
  const cached = cardArtVariantCache.get(card.number);
  if (cached) return cached;

  const localVariants = CARD_ARTS_BY_NUMBER[card.number];
  const tcgPrints = TCGPLAYER_CARD_PRINTS[card.number] ?? [];
  const hasLocalArt = CURATED_CARD_NUMBERS.has(card.number) || Boolean(localVariants);
  const standardVariant = {
    id: "standard",
    label: "Standard",
    image: hasLocalArt ? `/card-images/${card.number}.webp` : CARD_IMAGE_FALLBACK,
    tier: 0,
    officialId: card.number,
  };
  let marketTier = 0;
  const tcgVariants = tcgPrints.map((print) => {
    const isStandard = print.variantId === "standard";
    const tier = isStandard ? 0 : ++marketTier;
    return {
      id: print.variantId,
      label: isStandard ? "Standard" : `Market Print ${tier}`,
      image: tcgplayerPrintImageUrl(print) ?? standardVariant.image,
      tier,
      officialId: print.officialId,
    };
  });

  let variants: readonly CardArtVariant[];
  if (localVariants) {
    variants = localVariants.some((variant) => variant.id === "standard")
      ? localVariants
      : [standardVariant, ...localVariants];
  } else if (hasLocalArt) {
    variants = [
      standardVariant,
      ...tcgVariants.filter((variant) => variant.id !== "standard"),
    ];
  } else {
    variants = tcgVariants.length ? tcgVariants : [standardVariant];
  }

  cardArtVariantCache.set(card.number, variants);
  return variants;
}

function sanitizeArtChoices(
  value: unknown,
  allowedNumbers?: ReadonlySet<string>,
): ArtChoiceMap {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([number, artId]) => {
        if (allowedNumbers && !allowedNumbers.has(number)) return false;
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
    const removalOrder = [
      ...variants
        .map((variant) => variant.id)
        .filter((artId) => artId !== preferred)
        .reverse(),
      preferred,
    ];
    removalOrder.forEach((artId) => {
      if (overflow <= 0) return;
      const quantity = next[artId] ?? 0;
      const removed = Math.min(quantity, overflow);
      next[artId] = quantity - removed;
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
  const main = sanitizeQuantities(maybeDeck.main, "main");
  const resource = sanitizeQuantities(maybeDeck.resource, "resource");
  const deckNumbers = new Set([...Object.keys(main), ...Object.keys(resource)]);
  const art = sanitizeArtChoices(maybeDeck.art, deckNumbers);
  return {
    name:
      typeof maybeDeck.name === "string" && maybeDeck.name.trim()
        ? maybeDeck.name.trim().slice(0, 80)
        : "Imported Deck",
    main,
    resource,
    art,
    prints: sanitizePrints(maybeDeck.prints, main, resource, art),
    collection: sanitizeCollection(maybeDeck.collection),
  };
}

type DeckImportResult = {
  deck: DeckState;
  source: "JSON" | "text";
  warnings: string[];
};

function rawQuantityEntries(value: unknown) {
  return value && typeof value === "object"
    ? Object.entries(value as Record<string, unknown>)
    : [];
}

function jsonImportWarnings(value: unknown, deck: DeckState) {
  if (!value || typeof value !== "object") return ["Payload was not a deck object."];
  const maybeDeck = value as Partial<DeckState>;
  const warnings: string[] = [];

  (["main", "resource"] as const).forEach((zone) => {
    const sanitized = deck[zone];
    rawQuantityEntries(maybeDeck[zone]).forEach(([number, rawQuantity]) => {
      const card = CARD_BY_NUMBER.get(number);
      const requested = clampQuantity(rawQuantity);
      const kept = sanitized[number] ?? 0;

      if (!card) {
        warnings.push(`${number}: card not found and was dropped.`);
      } else if (!canCardEnterZone(zone, card)) {
        warnings.push(`${number}: cannot enter ${zoneLabel(zone)} and was dropped.`);
      } else if (requested !== kept) {
        warnings.push(`${number}: requested ${requested}, imported ${kept}.`);
      }
    });
  });

  return warnings;
}

function addImportedCopies(
  deck: DeckState,
  card: GundamCard,
  zone: Zone,
  quantity: number,
  preferredArtId?: string,
) {
  let added = 0;
  const safeArtId = preferredArtId && validArtId(card, preferredArtId) ? preferredArtId : "standard";
  if (preferredArtId && safeArtId !== "standard") {
    deck.art[card.number] = safeArtId;
  }

  for (let index = 0; index < quantity; index += 1) {
    const currentQuantity = deck[zone][card.number] ?? 0;
    if (zoneAddConstraint(zone, card, currentQuantity, deck)) break;
    deck[zone][card.number] = currentQuantity + 1;
    addPrintCopies(deck.prints[zone], card, safeArtId, 1);
    added += 1;
  }

  return added;
}

function parsePlainTextDeck(text: string): DeckImportResult | null {
  const deck = emptyDeck();
  const warnings: string[] = [];
  const cardNumberPattern = /([A-Z]{1,4}\d{0,3}-\d{3})/i;
  let activeZone: Zone | null = null;
  let foundCardLine = false;

  text.split(/\r?\n/).forEach((rawLine, lineIndex) => {
    const line = rawLine.replace(/#.*/, "").replace(/\/\/.*/, "").trim();
    if (!line) return;

    if (/^(main|main deck)\b/i.test(line)) {
      activeZone = "main";
      return;
    }
    if (/^(resource|resource deck|resources)\b/i.test(line)) {
      activeZone = "resource";
      return;
    }
    if (/^(deck|name)\s*[:\-]/i.test(line)) {
      const name = line.replace(/^(deck|name)\s*[:\-]\s*/i, "").trim();
      if (name) deck.name = name.slice(0, 80);
      return;
    }

    const quantityFirst = line.match(/^\s*(\d{1,2})\s*x?\s+([A-Z]{1,4}\d{0,3}-\d{3})\b/i);
    const numberFirst = line.match(/^\s*([A-Z]{1,4}\d{0,3}-\d{3})\b(?:\s+x\s*|\s+)(\d{1,2})\b/i);
    const explicitPrintId =
      line.match(/\[(?:print|art)\s*:\s*([A-Za-z0-9_-]+)\]/i)?.[1] ?? undefined;
    const quantity = clampQuantity(
      quantityFirst ? Number(quantityFirst[1]) : numberFirst ? Number(numberFirst[2]) : 0,
    );
    const number = (quantityFirst?.[2] ?? numberFirst?.[1] ?? line.match(cardNumberPattern)?.[1] ?? "")
      .toUpperCase();

    if (!number) {
      if (!foundCardLine && deck.name === "Untitled Deck") deck.name = line.slice(0, 80);
      return;
    }

    foundCardLine = true;
    const card = CARD_BY_NUMBER.get(number);
    if (!card) {
      warnings.push(`Line ${lineIndex + 1}: ${number} was not found.`);
      return;
    }
    const safePrintId =
      explicitPrintId && validArtId(card, explicitPrintId) ? explicitPrintId : undefined;
    if (explicitPrintId && !safePrintId) {
      warnings.push(
        `Line ${lineIndex + 1}: ${card.number} print ${explicitPrintId} was not found; standard print used.`,
      );
    }

    const targetZone =
      activeZone ??
      (canCardEnterZone("resource", card) && !canCardEnterZone("main", card)
        ? "resource"
        : "main");
    const requested = quantity || 1;
    const added = addImportedCopies(deck, card, targetZone, requested, safePrintId);

    if (added < requested) {
      warnings.push(
        `Line ${lineIndex + 1}: ${card.number} requested ${requested}, imported ${added}.`,
      );
    }
  });

  return deckHasCards(deck) ? { deck, source: "text", warnings } : null;
}

function parseDeckImportText(text: string): DeckImportResult | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    const deck = sanitizeDeck(parsed);
    if (deck && deckHasCards(deck)) {
      return {
        deck,
        source: "JSON",
        warnings: jsonImportWarnings(parsed, deck),
      };
    }
    return null;
  } catch {
    // Fall through to plain-text import.
  }

  return parsePlainTextDeck(text);
}

function deckHasCards(deck: DeckState) {
  return totalCards(deck.main) > 0 || totalCards(deck.resource) > 0;
}

function comparableDeckSnapshot(deck: DeckState) {
  return JSON.stringify({
    name: deck.name,
    main: deck.main,
    resource: deck.resource,
    art: deck.art,
    prints: deck.prints,
  });
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
  if (selectedVariant.image.startsWith("/")) {
    return selectedVariant.image;
  }

  const print = tcgplayerImagePrint(card, selectedVariant);
  if (print) {
    const imageUrl = tcgplayerPrintImageUrl(print, size);
    if (imageUrl) return imageUrl;
  }
  return selectedVariant.image;
}

function cardImageSrcSet(
  card: GundamCard,
  variant?: CardArtVariant,
  sizes: readonly number[] = [640, 1000, 1500],
) {
  const selectedVariant = variant ?? cardArtVariants(card)[0];
  if (selectedVariant.image.startsWith("/")) {
    return undefined;
  }

  const print = tcgplayerImagePrint(card, selectedVariant);
  if (!print?.productId || print.imageUrl || !hasDirectTcgplayerProduct(print)) {
    return undefined;
  }
  const productId = print.productId;
  const candidateSizes = [...new Set(sizes.map((size) => Math.max(size, 320)))];

  return candidateSizes
    .map((size) => `${tcgplayerProductImageUrl(productId, size)} ${size}w`)
    .join(", ");
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<FocusableElement>(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    const rect = element.getBoundingClientRect();
    return (
      !element.disabled &&
      element.getAttribute("aria-hidden") !== "true" &&
      rect.width > 0 &&
      rect.height > 0
    );
  });
}

function trapDialogFocus(
  event: React.KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  onClose: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = getFocusableElements(container);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button, a, input, select, textarea, summary, [role='button']"))
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function usePressRepeat(action: () => void, disabled: boolean) {
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const actionRef = useRef(action);

  useEffect(() => {
    actionRef.current = action;
  }, [action]);

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || event.button !== 0) return;
      stop();
      timeoutRef.current = window.setTimeout(() => {
        actionRef.current();
        intervalRef.current = window.setInterval(() => actionRef.current(), 110);
      }, 360);
    },
    [disabled, stop],
  );

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onLostPointerCapture: stop,
  };
}

function handleCardImageError(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = CARD_IMAGE_FALLBACK;
  image.classList.remove("object-cover", "object-top");
  image.classList.add("object-contain", "p-2");
}

function CardImage({
  card,
  artVariant,
  imageSize,
  srcSetSizes = [320, 480, 640],
  sizes,
  alt,
  className,
  eager = false,
}: {
  card: GundamCard;
  artVariant?: CardArtVariant;
  imageSize: number;
  srcSetSizes?: readonly number[];
  sizes: string;
  alt: string;
  className: string;
  eager?: boolean;
}) {
  const src = cardImagePath(card, artVariant, imageSize);
  const localImage = src.startsWith("/");

  if (localImage) {
    return (
      <NextImage
        src={src}
        width={600}
        height={838}
        sizes={sizes}
        alt={alt}
        className={className}
        decoding="async"
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        preload={eager}
        onError={handleCardImageError}
      />
    );
  }

  return (
    <img
      src={src}
      srcSet={cardImageSrcSet(card, artVariant, srcSetSizes)}
      sizes={sizes}
      alt={alt}
      className={className}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      referrerPolicy="no-referrer"
      onError={handleCardImageError}
    />
  );
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
    (variant.id === "standard" ? prints.find((print) => print.variantId === "standard") : undefined) ??
    null
  );
}

function tcgplayerPrint(card: GundamCard, variant: CardArtVariant): TcgplayerPrint | null {
  const prints = TCGPLAYER_CARD_PRINTS[card.number] ?? [];
  return (
    prints.find((print) => print.variantId === variant.id) ??
    prints.find((print) => print.officialId === variant.officialId) ??
    (variant.id === "standard" ? prints.find((print) => print.variantId === "standard") : undefined) ??
    null
  );
}

function cardVariantForTcgplayerPrint(card: GundamCard, print: TcgplayerPrint) {
  const variants = cardArtVariants(card);
  return (
    variants.find((variant) => variant.id === print.variantId) ??
    variants.find((variant) => variant.officialId === print.officialId) ??
    (print.variantId === "standard" ? variants.find((variant) => variant.id === "standard") : undefined) ??
    null
  );
}

function positiveMarketPrice(print: TcgplayerPrint) {
  return typeof print.marketPrice === "number" &&
    Number.isFinite(print.marketPrice) &&
    print.marketPrice > 0
    ? print.marketPrice
    : null;
}

function hasUsableMarketPriceForPrint(card: GundamCard, print: TcgplayerPrint) {
  const price = positiveMarketPrice(print);
  if (price === null) return false;
  const variant = cardVariantForTcgplayerPrint(card, print);
  return variant ? !isVolatileMarketPrice(price, estimatePrintCost(card, variant)) : false;
}

function hasVolatileMarketPriceForPrint(card: GundamCard, print: TcgplayerPrint) {
  const price = positiveMarketPrice(print);
  if (price === null) return false;
  const variant = cardVariantForTcgplayerPrint(card, print);
  return variant ? isVolatileMarketPrice(price, estimatePrintCost(card, variant)) : false;
}

function rawTcgplayerMarketPrice(card: GundamCard, variant: CardArtVariant) {
  const price = tcgplayerPrint(card, variant)?.marketPrice;
  return typeof price === "number" && Number.isFinite(price) && price > 0
    ? price
    : null;
}

function isVolatileMarketPrice(price: number, estimatedPrice: number) {
  return price >= Math.max(250, estimatedPrice * 25);
}

function tcgplayerMarketPrice(card: GundamCard, variant: CardArtVariant) {
  const price = rawTcgplayerMarketPrice(card, variant);
  if (price === null) return null;
  return isVolatileMarketPrice(price, estimatePrintCost(card, variant)) ? null : price;
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

function printPriceSummary(card: GundamCard, variant: CardArtVariant) {
  const print = tcgplayerPrint(card, variant);
  const price = rawTcgplayerMarketPrice(card, variant);
  const estimatedPrice = estimatePrintCost(card, variant);
  const estimatedAmount = formatMoney(estimatedPrice);

  if (price !== null) {
    const isVolatilePrice = isVolatileMarketPrice(price, estimatedPrice);
    const source = isVolatilePrice
      ? "TCGplayer volatile"
      : (print?.priceSource ?? "TCGplayer market");
    const amount = isVolatilePrice ? `est. ${estimatedAmount}` : formatMoney(price);
    return {
      source,
      amount,
      full: isVolatilePrice
        ? `${source} · verify ${formatMoney(price)} · using local est. ${estimatedAmount}`
        : `${source} ${amount}`,
    };
  }

  if (hasDirectMarketProduct(print)) {
    return {
      source: "TCGplayer product",
      amount: `est. ${estimatedAmount}`,
      full: `TCGplayer product · local est. ${estimatedAmount}`,
    };
  }

  return {
    source: "Local est.",
    amount: estimatedAmount,
    full: `Local est. ${estimatedAmount}`,
  };
}

function hasDirectMarketProduct(print: TcgplayerPrint | null | undefined) {
  return Boolean(print?.productId && hasDirectTcgplayerProduct(print));
}

function formatPrintMoney(card: GundamCard, variant: CardArtVariant) {
  return printPriceSummary(card, variant).full;
}

function priceSourceLabel(card: GundamCard, variant: CardArtVariant) {
  const print = tcgplayerPrint(card, variant);
  const price = rawTcgplayerMarketPrice(card, variant);
  if (price !== null) {
    return isVolatileMarketPrice(price, estimatePrintCost(card, variant))
      ? "TCGplayer volatile; local estimate used"
      : (print?.priceSource ?? "TCGplayer market");
  }

  return hasDirectMarketProduct(print) ? "TCGplayer product; local estimate" : "local estimate";
}

function printDisplayId(variant: CardArtVariant) {
  const printSuffix = variant.officialId.split("_")[1] ?? "";
  const baseNumber = variant.officialId.split("_")[0] ?? variant.officialId;
  if (!printSuffix) return variant.officialId;
  if (/^p\d+$/i.test(printSuffix)) return `${baseNumber} ${printSuffix.toUpperCase()}`;

  const marketIndex = printSuffix.match(/^market(\d+)$/i)?.[1];
  return marketIndex ? `${baseNumber} Market ${marketIndex}` : variant.officialId.replaceAll("_", " ");
}

function artDisplayLabel(variant: CardArtVariant) {
  return printDisplayId(variant);
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
  const printUrl = tcgplayerPrint(card, variant)?.url;
  if (!printUrl) return tcgplayerSearchUrl(card, variant);

  try {
    const url = new URL(printUrl);
    const isAllowedHost =
      url.protocol === "https:" &&
      (url.hostname === "www.tcgplayer.com" || url.hostname === "tcgplayer.com");
    return isAllowedHost ? url.toString() : tcgplayerSearchUrl(card, variant);
  } catch {
    return tcgplayerSearchUrl(card, variant);
  }
}

function tcgplayerActionLabel(card: GundamCard, variant?: CardArtVariant) {
  return variant && hasDirectMarketProduct(tcgplayerPrint(card, variant))
    ? "View on TCGplayer"
    : "Search TCGplayer";
}

function colorAccentClass(color: CardColor) {
  switch (color) {
    case "Blue":
      return "border-[#2e8cff] text-[#d9ecff]";
    case "Green":
      return "border-[#28d17c] text-[#d9ffe9]";
    case "Red":
      return "border-[#e31b23] text-[#ffe3e3]";
    case "White":
      return "border-[#f7f7f2] text-[#f7f7f2]";
    case "Purple":
      return "border-[#8f7bff] text-[#eeeaff]";
    default:
      return "border-[#8b8f99] text-[#f7f7f2]";
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

function colorSwatchStyle(color: CardColor) {
  switch (color) {
    case "Blue":
      return {
        backgroundColor: "#2e8cff",
        borderColor: "rgba(217,236,255,0.9)",
        boxShadow: "0 0 14px rgba(46,140,255,0.5)",
      };
    case "Green":
      return {
        backgroundColor: "#28d17c",
        borderColor: "rgba(217,255,233,0.9)",
        boxShadow: "0 0 14px rgba(40,209,124,0.46)",
      };
    case "Red":
      return {
        backgroundColor: "#e31b23",
        borderColor: "rgba(255,227,227,0.9)",
        boxShadow: "0 0 14px rgba(227,27,35,0.48)",
      };
    case "White":
      return {
        backgroundColor: "#f7f7f2",
        borderColor: "rgba(255,255,255,0.95)",
        boxShadow: "0 0 14px rgba(247,247,242,0.38)",
      };
    case "Purple":
      return {
        backgroundColor: "#8f7bff",
        borderColor: "rgba(238,234,255,0.95)",
        boxShadow: "0 0 14px rgba(143,123,255,0.46)",
      };
    default:
      return {
        backgroundColor: "#8b8f99",
        borderColor: "rgba(214,216,221,0.8)",
        boxShadow: "0 0 10px rgba(139,143,153,0.28)",
      };
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

function issueBadgeText(notice: Notice) {
  const detail = notice.detail.replace(/\s*cards$/i, "");
  switch (notice.label) {
    case "Main deck":
      return `Main ${detail}`;
    case "Resource":
      return `Resource ${detail}`;
    case "Colors":
      return notice.detail === "No colors" ? "No colors" : `Colors ${notice.detail}`;
    case "Copies":
      return `${notice.detail} copies`;
    case "Zones":
      return "Zone mismatch";
    case "Rules Data":
      return `Rules ${notice.detail}`;
    default:
      return `${notice.label} ${detail}`;
  }
}

function issueDetailText(notice: Notice) {
  return `${notice.label}: ${notice.detail}`;
}

function panelClass(extra = "") {
  return `gcg-panel rounded-sm shadow-sm shadow-black/10 ${extra}`;
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
    const printTag = variant.id === "standard" ? "" : ` [print:${variant.id}]`;
    return `${quantity} ${card.number} ${card.name}${artLabel}${printTag}`;
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

function getDeckPrintCount(deck: DeckState, card: GundamCard, variantId: string) {
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

function summarizeDeckCosts(deck: DeckState): CostSummary {
  const consumedOwned: QuantityMap = {};
  const summary: CostSummary = {
    baseTotal: 0,
    artTotal: 0,
    altPremium: 0,
    ownedValue: 0,
    unownedCost: 0,
    deckCopies: 0,
    ownedCopies: 0,
    unownedCopies: 0,
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
        const unowned = quantity - covered;

        consumedOwned[key] = alreadyConsumed + covered;
        summary.baseTotal += standardCost * quantity;
        summary.artTotal += cost * quantity;
        summary.ownedValue += cost * covered;
        summary.unownedCost += cost * unowned;
        summary.deckCopies += quantity;
        summary.ownedCopies += covered;
        summary.unownedCopies += unowned;
      });
    });
  });

  summary.altPremium = Math.max(0, summary.artTotal - summary.baseTotal);
  return summary;
}

function getTcgListEntries(deck: DeckState): TcgListEntry[] {
  const entries = new Map<string, TcgListEntry>();

  (["main", "resource"] as const).forEach((zone) => {
    deckEntries(deck[zone]).forEach(({ card }) => {
      printEntriesForCard(deck, zone, card).forEach(({ variant, quantity }) => {
        const key = `${card.number}:${variant.id}`;
        const unitCost = printCost(card, variant);
        const existing = entries.get(key);

        if (existing) {
          existing.quantity += quantity;
          existing.totalCost = existing.quantity * existing.unitCost;
          return;
        }

        entries.set(key, {
          card,
          variant,
          quantity,
          owned: getOwnedPrintCount(deck.collection, card, variant.id),
          openQuantity: 0,
          unitCost,
          totalCost: 0,
        });
      });
    });
  });

  return Array.from(entries.values())
    .map((entry) => {
      const openQuantity = Math.max(0, entry.quantity - entry.owned);
      return {
        ...entry,
        openQuantity,
        totalCost: entry.unitCost * openQuantity,
      };
    })
    .filter((entry) => entry.openQuantity > 0)
    .sort((a, b) => {
      const totalDelta = b.totalCost - a.totalCost;
      if (totalDelta !== 0) return totalDelta;
      const quantityDelta = b.openQuantity - a.openQuantity;
      if (quantityDelta !== 0) return quantityDelta;
      return a.card.name.localeCompare(b.card.name);
    });
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function buildTcgListCsv(entries: TcgListEntry[]) {
  const header = [
    "quantity",
    "card_number",
    "name",
    "print",
    "unit_cost",
    "total_cost",
    "tcgplayer_url",
  ];
  const rows = entries.map((entry) => [
    entry.openQuantity,
    printDisplayId(entry.variant),
    entry.card.name,
    artDisplayLabel(entry.variant),
    entry.unitCost.toFixed(2),
    entry.totalCost.toFixed(2),
    tcgplayerUrl(entry.card, entry.variant),
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function importReplacementConfirmMessage(parsed: DeckImportResult, hasDifferentDeck: boolean) {
  const sections: string[] = [];

  if (hasDifferentDeck) {
    sections.push("This will replace the current deck. The previous deck is saved for undo.");
  }

  if (parsed.warnings.length) {
    sections.push(
      `${parsed.source} import needs ${parsed.warnings.length} adjustment${
        parsed.warnings.length === 1 ? "" : "s"
      }:\n\n${parsed.warnings.slice(0, 8).join("\n")}${
        parsed.warnings.length > 8 ? "\n..." : ""
      }`,
    );
  }

  return `${sections.join("\n\n")}\n\nContinue?`;
}

function selectedAltPrintCopies(deck: DeckState) {
  return (["main", "resource"] as const).reduce((sum, zone) => {
    return (
      sum +
      deckEntries(deck[zone]).reduce((zoneSum, entry) => {
        return (
          zoneSum +
          printEntriesForCard(deck, zone, entry.card).reduce((printSum, printEntry) => {
            return printSum + (printEntry.variant.tier > 0 ? printEntry.quantity : 0);
          }, 0)
        );
      }, 0)
    );
  }, 0);
}

function tcgplayerSyncAgeHours(now?: number) {
  if (!TCGPLAYER_LAST_SYNC) return null;
  if (now === undefined) return null;
  const syncedAt = new Date(TCGPLAYER_LAST_SYNC).getTime();
  if (!Number.isFinite(syncedAt)) return null;
  return Math.max(0, (now - syncedAt) / 3_600_000);
}

function databaseStatus(now?: number) {
  const totalCards = CARD_POOL.length;
  const officialCards = OFFICIAL_CARD_POOL.length;
  const curatedCards = CURATED_CARD_POOL.length;
  const tcgCards = TCGPLAYER_CARD_POOL.length;
  const tcgPrints = Object.values(TCGPLAYER_CARD_PRINTS).reduce(
    (sum, prints) => sum + prints.length,
    0,
  );
  const tcgCardsWithPrints = Object.keys(TCGPLAYER_CARD_PRINTS).length;
  let pricedPrints = 0;
  let volatilePricedPrints = 0;
  Object.entries(TCGPLAYER_CARD_PRINTS).forEach(([number, prints]) => {
    const card = CARD_BY_NUMBER.get(number);
    if (!card) return;
    prints.forEach((print) => {
      if (hasUsableMarketPriceForPrint(card, print)) {
        pricedPrints += 1;
      } else if (hasVolatileMarketPriceForPrint(card, print)) {
        volatilePricedPrints += 1;
      }
    });
  });
  const rulesReadyCards = CARD_POOL.filter(hasDeckRulesData).length;
  const pendingRulesCards = Math.max(0, totalCards - rulesReadyCards);
  const syncAgeHours = tcgplayerSyncAgeHours(now);
  const isSynced = Boolean(TCGPLAYER_LAST_SYNC && tcgPrints > 0);
  const isMarketCoverageLimited = tcgPrints > 0 && pricedPrints < tcgPrints;
  const isFresh =
    isSynced && (syncAgeHours === null || syncAgeHours <= TCGPLAYER_FRESH_HOURS);
  const coverageTone: Notice["tone"] =
    totalCards >= COMPLETE_DATABASE_CARD_TARGET ? "good" : isSynced ? "warn" : "bad";
  const syncTone: Notice["tone"] = isFresh
    ? isMarketCoverageLimited
      ? "warn"
      : "good"
    : isSynced
      ? "warn"
      : "bad";

  return {
    totalCards,
    officialCards,
    curatedCards,
    tcgCards,
    tcgPrints,
    tcgCardsWithPrints,
    pricedPrints,
    volatilePricedPrints,
    rulesReadyCards,
    pendingRulesCards,
    lastSync: TCGPLAYER_LAST_SYNC,
    syncAgeHours,
    isSynced,
    isFresh,
    isMarketCoverageLimited,
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

function hasRulesValue(value: string) {
  return Boolean(value && value.trim() !== "-");
}

function hasDeckRulesData(card: GundamCard) {
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
  if (zone === "main") {
    return MAIN_TYPES.includes(card.type) && hasDeckRulesData(card);
  }

  return RESOURCE_TYPES.includes(card.type) && hasDeckRulesData(card);
}

function isDeckReadyCard(card: GundamCard) {
  return canCardEnterZone("main", card) || canCardEnterZone("resource", card);
}

function cardMatchesBuildStatusFilter(
  card: GundamCard,
  filter: (typeof buildStatusFilters)[number],
) {
  switch (filter) {
    case "Deck Ready":
      return isDeckReadyCard(card);
    case "Catalog Only":
      return !isDeckReadyCard(card);
    default:
      return true;
  }
}

function zoneLabel(zone: Zone) {
  return zone === "main" ? "Main" : "Resource";
}

function mainColorsForQuantities(quantities: QuantityMap) {
  return Array.from(
    new Set(
      deckEntries(quantities)
        .filter(
          (entry) => MAIN_TYPES.includes(entry.card.type) && entry.card.color !== "-",
        )
        .map((entry) => entry.card.color),
    ),
  );
}

function zoneAddConstraint(
  zone: Zone,
  card: GundamCard,
  quantity: number,
  deck?: DeckState,
) {
  if (!canCardEnterZone(zone, card)) {
    if (zone === "main" && MAIN_TYPES.includes(card.type) && !hasDeckRulesData(card)) {
      return "Official rules data pending";
    }

    return zone === "main"
      ? "Main uses Units, Pilots, Commands, or Bases"
      : "Resource uses Resource cards";
  }

  if (zone === "main" && quantity >= MAX_MAIN_COPIES) {
    return `Max ${MAX_MAIN_COPIES} copies in main`;
  }

  if (deck) {
    const zoneTotal = totalCards(deck[zone]);
    if (zone === "main" && zoneTotal >= MAIN_TARGET) {
      return `Main deck max ${MAIN_TARGET}`;
    }

    if (zone === "resource" && zoneTotal >= RESOURCE_TARGET) {
      return `Resource max ${RESOURCE_TARGET}`;
    }

    if (zone === "main" && card.color !== "-") {
      const nextMain = { ...deck.main, [card.number]: quantity + 1 };
      const nextColors = mainColorsForQuantities(nextMain);
      if (nextColors.length > MAX_MAIN_COLORS) {
        return `Max ${MAX_MAIN_COLORS} colors`;
      }
    }
  }

  return "";
}

function variantMatchesArtFilter(
  card: GundamCard,
  filter: (typeof artFilters)[number],
) {
  if (filter === "All Prints") return true;
  const variants = cardArtVariants(card);
  switch (filter) {
    case "Has Parallel Print":
      return variants.length > 1;
    case "Base Print Only":
      return variants.length === 1 && variants[0]?.id === "standard";
    case "P1 Print":
      return variants.some((variant) => variant.tier === 1);
    case "P2 Print":
      return variants.some((variant) => variant.tier === 2);
    case "Premium Print":
      return variants.some((variant) => variant.tier >= 3);
    default:
      return true;
  }
}

function cardMatchesCollectionFilter(
  collection: CollectionMap,
  art: ArtChoiceMap,
  card: GundamCard,
  filter: (typeof collectionFilters)[number],
  budgetLimit: number,
) {
  switch (filter) {
    case "Owned":
      return getTotalOwnedForCard(collection, card) > 0;
    case "Budget":
      return printCost(card, getArtVariant(card, art)) <= budgetLimit;
    default:
      return true;
  }
}

function queryMatchRank(card: GundamCard, query: string) {
  const name = card.name.toLowerCase();
  const number = card.number.toLowerCase();
  const type = card.type.toLowerCase();
  const color = card.color.toLowerCase();
  const set = card.set.toLowerCase();
  const trait = card.trait.toLowerCase();
  const link = card.link.toLowerCase();
  const source = card.source.toLowerCase();
  const text = card.text.toLowerCase();

  if (type === query || number === query) return 0;
  if (name === query || name.startsWith(query)) return 1;
  if (name.includes(query) || number.includes(query)) return 2;
  if (type.includes(query) || color.includes(query) || set.includes(query)) return 3;
  if (trait.includes(query) || link.includes(query) || source.includes(query)) return 4;
  if (text.includes(query)) return 5;
  return 6;
}

function queryTokens(query: string) {
  return query.split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

function cardSearchHaystack(card: GundamCard) {
  const cached = cardSearchHaystackCache.get(card.number);
  if (cached) return cached;

  const haystack = [
    card.name,
    card.number,
    card.type,
    card.color,
    card.text,
    card.trait,
    card.link,
    card.source,
    card.set,
  ]
    .join(" ")
    .toLowerCase();
  cardSearchHaystackCache.set(card.number, haystack);
  return haystack;
}

function cardMatchesQueryTokens(card: GundamCard, tokens: string[]) {
  if (!tokens.length) return true;
  const haystack = cardSearchHaystack(card);
  return tokens.every((token) => haystack.includes(token));
}

function tokenizedQueryRank(card: GundamCard, tokens: string[]) {
  if (!tokens.length) return 6;
  return Math.min(...tokens.map((token) => queryMatchRank(card, token)));
}

function artChoiceSignature(art: ArtChoiceMap) {
  return JSON.stringify(Object.entries(art).sort(([a], [b]) => a.localeCompare(b)));
}

function collectionSignature(collection: CollectionMap) {
  return JSON.stringify(
    Object.entries(collection)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([number, quantities]) => [
        number,
        Object.entries(quantities).sort(([a], [b]) => a.localeCompare(b)),
      ]),
  );
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
        detail: "No linked Pilot",
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

function collectionHasCards(collection: CollectionMap) {
  return Object.values(collection).some((quantities) =>
    Object.values(quantities).some((quantity) => quantity > 0),
  );
}

function mergeCollections(base: CollectionMap, incoming: CollectionMap): CollectionMap {
  const next = cloneCollection(base);

  Object.entries(incoming).forEach(([number, quantities]) => {
    const current = { ...(next[number] ?? {}) };
    Object.entries(quantities).forEach(([artId, quantity]) => {
      current[artId] = Math.max(current[artId] ?? 0, quantity);
    });
    next[number] = cleanQuantityMap(current);
  });

  return Object.fromEntries(
    Object.entries(next).filter(([, quantities]) => Object.keys(quantities).length),
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
  targetQuantity: number,
  preferredArtId: string | undefined,
) {
  const variants = cardArtVariants(card);
  const quantities = normalizePrintQuantities(
    card.number,
    targetQuantity,
    printMap[card.number],
    preferredArtId,
  );
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

function canShiftPrints(
  printMap: PrintChoiceMap,
  card: GundamCard,
  delta: number,
  targetQuantity: number,
  preferredArtId: string | undefined,
) {
  const variants = cardArtVariants(card);
  if (variants.length <= 1 || targetQuantity <= 0) return false;
  const quantities = normalizePrintQuantities(
    card.number,
    targetQuantity,
    printMap[card.number],
    preferredArtId,
  );

  return variants.some((variant, index) => {
    if ((quantities[variant.id] ?? 0) <= 0) return false;
    const nextIndex = Math.max(0, Math.min(variants.length - 1, index + delta));
    return nextIndex !== index;
  });
}

function canShiftDeckArt(deck: DeckState, delta: number) {
  return (["main", "resource"] as const).some((zone) =>
    Object.entries(deck[zone]).some(([number, quantity]) => {
      const card = CARD_BY_NUMBER.get(number);
      return card
        ? canShiftPrints(deck.prints[zone], card, delta, quantity, deck.art[number])
        : false;
    }),
  );
}

function canShiftCardArt(deck: DeckState, card: GundamCard, delta: number) {
  const zones: Zone[] = (deck.main[card.number] ?? 0) > 0 ? ["main"] : ["resource"];

  return zones.some((zone) =>
    canShiftPrints(
      deck.prints[zone],
      card,
      delta,
      deck[zone][card.number] ?? 0,
      deck.art[card.number],
    ),
  );
}

function shiftAllPrints(
  printMap: PrintChoiceMap,
  card: GundamCard,
  delta: number,
  targetQuantity: number,
) {
  const variants = cardArtVariants(card);
  const current =
    printMap[card.number] ??
    normalizePrintQuantities(card.number, targetQuantity, null, undefined);
  if (!current || totalCards(current) === 0) {
    delete printMap[card.number];
    return;
  }

  const next: QuantityMap = {};

  variants.forEach((variant, index) => {
    const quantity = current[variant.id] ?? 0;
    if (!quantity) return;
    const targetIndex = Math.max(0, Math.min(variants.length - 1, index + delta));
    const target = variants[targetIndex];
    next[target.id] = (next[target.id] ?? 0) + quantity;
  });

  const cleaned = cleanQuantityMap(next);
  if (Object.keys(cleaned).length) {
    printMap[card.number] = cleaned;
  } else {
    delete printMap[card.number];
  }
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

type DeckBuilderProps = {
  sharedDeckId?: string;
  initialSharedDeck?: unknown;
};

type MobileView = "library" | "card" | "deck" | "stats";

type MobileViewChangeOptions = {
  focusPanel?: boolean;
};

type SharedStatus = "local" | "loading" | "ready" | "unavailable" | "cloned";

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

export function DeckBuilder({
  sharedDeckId,
  initialSharedDeck,
}: DeckBuilderProps = {}) {
  const hasInitialSharedDeck = sharedDeckId && initialSharedDeck !== undefined;
  const [deck, setDeck] = useState<DeckState>(() => {
    if (hasInitialSharedDeck) {
      return sanitizeDeck(initialSharedDeck) ?? emptyDeck();
    }
    if (sharedDeckId) {
      return emptyDeck();
    }
    return emptyDeck();
  });
  const [loaded, setLoaded] = useState(!sharedDeckId || Boolean(hasInitialSharedDeck));
  const [sharedStatus, setSharedStatus] = useState<SharedStatus>(
    sharedDeckId
      ? hasInitialSharedDeck && initialSharedDeck
        ? "ready"
        : hasInitialSharedDeck
          ? "unavailable"
          : "loading"
      : "local",
  );
  const [mobileView, setMobileView] = useState<MobileView>("library");
  const [query, setQuery] = useState("");
  const [colorFilter, setColorFilter] =
    useState<(typeof colorFilters)[number]>("All");
  const [typeFilter, setTypeFilter] =
    useState<(typeof typeFilters)[number]>("All");
  const [setFilter, setSetFilter] = useState("All");
  const [artFilter, setArtFilter] =
    useState<(typeof artFilters)[number]>("All Prints");
  const [collectionFilter, setCollectionFilter] =
    useState<(typeof collectionFilters)[number]>("All");
  const [buildStatusFilter, setBuildStatusFilter] =
    useState<(typeof buildStatusFilters)[number]>("All");
  const [budgetLimit, setBudgetLimit] = useState(DEFAULT_BUDGET_LIMIT);
  const [selectedNumber, setSelectedNumber] = useState("ST01-001");
  const [copyState, setCopyState] = useState("Copy");
  const [shareState, setShareState] = useState("Share");
  const [feedbackPulse, setFeedbackPulse] = useState<FeedbackPulse | null>(null);
  const [toast, setToast] = useState<ActionToast | null>(null);
  const [fallbackPanel, setFallbackPanel] = useState<FallbackPanel | null>(null);
  const [lightbox, setLightbox] = useState<CardLightboxState | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [libraryPage, setLibraryPage] = useState(0);
  const [libraryPageSize, setLibraryPageSize] =
    useState<(typeof libraryPageSizeOptions)[number]>(LIBRARY_PAGE_SIZE);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [mobileTabsEnabled, setMobileTabsEnabled] = useState(false);
  const [compactFiltersEnabled, setCompactFiltersEnabled] = useState(false);
  const [statusTimestamp, setStatusTimestamp] = useState<number | null>(null);
  const [fallbackReturnFocusElement, setFallbackReturnFocusElement] =
    useState<HTMLElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const advancedFiltersRef = useRef<HTMLDivElement | null>(null);
  const advancedFiltersTriggerRef = useRef<HTMLButtonElement | null>(null);
  const advancedFiltersDoneRef = useRef<HTMLButtonElement | null>(null);
  const libraryPanelRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const toastIdRef = useRef(0);
  const feedbackPulseIdRef = useRef(0);
  const shareCacheRef = useRef<ShareCache | null>(null);
  const undoDeckRef = useRef<DeckState | null>(null);
  const deckFilterRef = useRef<{
    art: ArtChoiceMap;
    collection: CollectionMap;
  }>({ art: {}, collection: {} });
  const deckRef = useRef(deck);
  const mainTotalRef = useRef(0);
  const resourceTotalRef = useRef(0);
  const storageTimerRef = useRef<number | null>(null);
  const pendingStorageDeckRef = useRef<string | null>(null);
  const lastSavedDeckRef = useRef("");
  const deferredQuery = useDeferredValue(query);

  const advancedFiltersModalOpen = advancedFiltersOpen && compactFiltersEnabled;
  const isDialogOpen = Boolean(fallbackPanel || lightbox || mobileActionsOpen);
  const sharedPreviewLocked = Boolean(sharedDeckId && sharedStatus === "ready");
  const sharedPreviewEditReason = "Clone this shared deck before editing";
  const shareButtonLabel =
    sharedPreviewLocked && shareState === "Share" ? "Copy Link" : shareState;
  const renderAllPanels = !mobileTabsEnabled;
  const renderLibraryPanel = renderAllPanels || mobileView === "library";
  const renderCardPanel = renderAllPanels || mobileView === "card";
  const renderStatsPanel = renderAllPanels || mobileView === "stats";
  const renderDeckPanel = renderAllPanels || mobileView === "deck";
  const eagerDeckThumbnails = !mobileTabsEnabled || mobileView === "deck";
  const pulseIdFor = (key: string) =>
    feedbackPulse?.keys.includes(key) ? feedbackPulse.id : undefined;

  useEffect(() => {
    document.documentElement.dataset.permetHydrated = "true";
    return () => {
      delete document.documentElement.dataset.permetHydrated;
    };
  }, []);

  const clearStorageTimer = useCallback(() => {
    if (storageTimerRef.current) {
      window.clearTimeout(storageTimerRef.current);
      storageTimerRef.current = null;
    }
  }, []);

  const flushPendingDeckStorage = useCallback(() => {
    const pendingDeck = pendingStorageDeckRef.current;
    if (!pendingDeck) return;
    safeLocalStorageSet(STORAGE_KEY, pendingDeck);
    lastSavedDeckRef.current = pendingDeck;
    pendingStorageDeckRef.current = null;
    clearStorageTimer();
  }, [clearStorageTimer]);

  const queueDeckStorage = useCallback(
    (deckSnapshot: DeckState, mode: "defer" | "immediate" = "defer") => {
      if (sharedDeckId) return;

      const serializedDeck = JSON.stringify(deckSnapshot);
      clearStorageTimer();

      if (serializedDeck === lastSavedDeckRef.current) {
        pendingStorageDeckRef.current = null;
        return;
      }

      pendingStorageDeckRef.current = serializedDeck;
      if (mode === "immediate") {
        flushPendingDeckStorage();
        return;
      }

      storageTimerRef.current = window.setTimeout(flushPendingDeckStorage, 180);
    },
    [clearStorageTimer, flushPendingDeckStorage, sharedDeckId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setStatusTimestamp(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1279px)");
    const update = () => {
      setMobileTabsEnabled(query.matches);
      if (!query.matches) setMobileActionsOpen(false);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setCompactFiltersEnabled(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialDeck() {
      if (cancelled) return;

      if (sharedDeckId && hasInitialSharedDeck) {
        if (!initialSharedDeck) setDeck(emptyDeck());
        setSharedStatus(initialSharedDeck ? "ready" : "unavailable");
        setLoaded(true);
        return;
      }

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
              setDeck(emptyDeck());
              setSharedStatus("unavailable");
            }
          } else {
            setDeck(emptyDeck());
            setSharedStatus("unavailable");
          }
        } catch {
          setDeck(emptyDeck());
          setSharedStatus("unavailable");
        }
        if (!cancelled) setLoaded(true);
        return;
      }

      setSharedStatus("local");

      const stored = safeLocalStorageGet(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = sanitizeDeck(JSON.parse(stored));
          if (parsed) setDeck(parsed);
        } catch {
          safeLocalStorageRemove(STORAGE_KEY);
        }
      }
      setLoaded(true);
    }

    void loadInitialDeck();

    return () => {
      cancelled = true;
    };
  }, [hasInitialSharedDeck, initialSharedDeck, sharedDeckId]);

  useEffect(() => {
    if (loaded && !sharedDeckId) {
      queueDeckStorage(deck);

      return () => {
        clearStorageTimer();
      };
    }

    return undefined;
  }, [clearStorageTimer, deck, loaded, sharedDeckId, queueDeckStorage]);

  useEffect(() => {
    if (!advancedFiltersModalOpen) return undefined;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const triggerElement = advancedFiltersTriggerRef.current;
    window.setTimeout(() => {
      const firstFilter = advancedFiltersRef.current?.querySelector<HTMLElement>(
        "select, input, button",
      );
      (advancedFiltersDoneRef.current ?? firstFilter)?.focus();
    }, 0);

    return () => {
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus();
        return;
      }
      triggerElement?.focus();
    };
  }, [advancedFiltersModalOpen]);

  useEffect(() => {
    const flushOnPageExit = () => flushPendingDeckStorage();
    const flushOnHidden = () => {
      if (document.visibilityState === "hidden") flushPendingDeckStorage();
    };
    window.addEventListener("pagehide", flushOnPageExit);
    document.addEventListener("visibilitychange", flushOnHidden);

    return () => {
      flushPendingDeckStorage();
      window.removeEventListener("pagehide", flushOnPageExit);
      document.removeEventListener("visibilitychange", flushOnHidden);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (storageTimerRef.current) {
        window.clearTimeout(storageTimerRef.current);
      }
    };
  }, [flushPendingDeckStorage]);

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
  deckRef.current = deck;
  mainTotalRef.current = mainTotal;
  resourceTotalRef.current = resourceTotal;
  const deckList = useMemo(() => buildDeckList(deck), [deck]);
  const costSummary = useMemo(() => summarizeDeckCosts(deck), [deck]);
  const tcgListEntries = useMemo(() => getTcgListEntries(deck), [deck]);
  const dataStatus = useMemo(
    () => databaseStatus(statusTimestamp ?? undefined),
    [statusTimestamp],
  );
  const tcgListTotal = useMemo(
    () => tcgListEntries.reduce((sum, entry) => sum + entry.totalCost, 0),
    [tcgListEntries],
  );
  const tcgListText = useMemo(
    () =>
      tcgListEntries
        .map((entry) => {
          const priceSummary = printPriceSummary(entry.card, entry.variant);
          const url = tcgplayerUrl(entry.card, entry.variant);
          return `${entry.openQuantity}x ${printDisplayId(entry.variant)} ${entry.card.name} - ${priceSummary.full} each / ${formatMoney(
            entry.totalCost,
          )} total - ${url}`;
        })
        .join("\n"),
    [tcgListEntries],
  );
  const tcgListCsv = useMemo(() => buildTcgListCsv(tcgListEntries), [tcgListEntries]);
  const selectedAltTotal = useMemo(() => selectedAltPrintCopies(deck), [deck]);
  const synergyNotices = useMemo(() => analyzeSynergy(mainEntries), [mainEntries]);
  const setOptions = useMemo(
    () => ["All", ...Array.from(new Set(CARD_POOL.map((card) => card.set)))],
    [],
  );
  const deckArtSignature = useMemo(() => artChoiceSignature(deck.art), [deck.art]);
  const deckCollectionSignature = useMemo(
    () => collectionSignature(deck.collection),
    [deck.collection],
  );
  deckFilterRef.current = {
    art: deck.art,
    collection: deck.collection,
  };

  const filteredCards = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const tokens = queryTokens(normalizedQuery);
    const filterDeck = deckFilterRef.current;

    const nextCards = CARD_POOL.filter((card) => {
      const matchesQuery = cardMatchesQueryTokens(card, tokens);
      const matchesColor = colorFilter === "All" || card.color === colorFilter;
      const matchesType = typeFilter === "All" || card.type === typeFilter;
      const matchesSet = setFilter === "All" || card.set === setFilter;
      const matchesArt = variantMatchesArtFilter(card, artFilter);
      const matchesBuildStatus = cardMatchesBuildStatusFilter(
        card,
        buildStatusFilter,
      );
      const matchesCollection = cardMatchesCollectionFilter(
        filterDeck.collection,
        filterDeck.art,
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
        matchesBuildStatus &&
        matchesCollection
      );
    });

    if (!normalizedQuery) return nextCards;

    return [...nextCards].sort((a, b) => {
      const rankDelta =
        tokenizedQueryRank(a, tokens) - tokenizedQueryRank(b, tokens);
      if (rankDelta !== 0) return rankDelta;
      const readyDelta = Number(isDeckReadyCard(b)) - Number(isDeckReadyCard(a));
      if (readyDelta !== 0) return readyDelta;
      return a.name.localeCompare(b.name);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deck signatures intentionally invalidate this memo; deckFilterRef holds the latest art/collection objects.
  }, [
    artFilter,
    buildStatusFilter,
    budgetLimit,
    collectionFilter,
    deckArtSignature,
    deckCollectionSignature,
    colorFilter,
    deferredQuery,
    setFilter,
    typeFilter,
  ]);

  const libraryTotalPages = Math.max(
    1,
    Math.ceil(filteredCards.length / libraryPageSize),
  );
  const safeLibraryPage = Math.min(libraryPage, libraryTotalPages - 1);
  const libraryRangeStart = filteredCards.length
    ? safeLibraryPage * libraryPageSize + 1
    : 0;
  const libraryRangeEnd = Math.min(
    filteredCards.length,
    (safeLibraryPage + 1) * libraryPageSize,
  );
  const catalogOnlySummary = useMemo(() => {
    const catalogCards = filteredCards.filter((card) => !isDeckReadyCard(card)).length;
    const shouldShow =
      catalogCards > 0 &&
      (buildStatusFilter === "Catalog Only" ||
        (deferredQuery.trim().length > 0 && catalogCards / filteredCards.length >= 0.5));

    return {
      catalogCards,
      deckReadyCards: filteredCards.length - catalogCards,
      shouldShow,
    };
  }, [buildStatusFilter, deferredQuery, filteredCards]);
  const visibleLibraryCards = useMemo(
    () =>
      filteredCards.slice(
        safeLibraryPage * libraryPageSize,
        (safeLibraryPage + 1) * libraryPageSize,
      ),
    [filteredCards, libraryPageSize, safeLibraryPage],
  );

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scroller =
      mobileTabsEnabled
        ? document.querySelector(".app-content-shell > section")
        : libraryPanelRef.current;
    if (scroller instanceof HTMLElement) {
      scroller.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    }
  }, [libraryPageSize, mobileTabsEnabled, safeLibraryPage]);

  const selectedCard =
    filteredCards.find((card) => card.number === selectedNumber) ??
    filteredCards[0] ??
    null;
  const selectedArtVariants = useMemo(
    () => (selectedCard ? cardArtVariants(selectedCard) : []),
    [selectedCard],
  );
  const selectedArtVariant = useMemo(
    () => (selectedCard ? getArtVariant(selectedCard, deck.art) : null),
    [deck.art, selectedCard],
  );
  const selectedDeckPrintCount = useMemo(
    () =>
      selectedCard && selectedArtVariant
        ? getDeckPrintCount(deck, selectedCard, selectedArtVariant.id)
        : 0,
    [deck, selectedArtVariant, selectedCard],
  );
  const selectedOwnedCount = useMemo(
    () =>
      selectedCard && selectedArtVariant
        ? getOwnedPrintCount(deck.collection, selectedCard, selectedArtVariant.id)
        : 0,
    [deck.collection, selectedArtVariant, selectedCard],
  );
  const typeCounts = useMemo(() => countByType(mainEntries), [mainEntries]);
  const isStarterTemplate = useMemo(() => isStarterDeckState(deck), [deck]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isDialogOpen || isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const selected = selectedCard;
      const selectedZone: Zone | null =
        selected && MAIN_TYPES.includes(selected.type)
          ? "main"
          : selected && RESOURCE_TYPES.includes(selected.type)
            ? "resource"
            : null;

      if (event.key === "/") {
        event.preventDefault();
        setMobileView("library");
        searchInputRef.current?.focus();
        return;
      }

      if (event.key.toLowerCase() === "j" || event.key.toLowerCase() === "k") {
        if (!filteredCards.length) return;
        event.preventDefault();
        const direction = event.key.toLowerCase() === "j" ? 1 : -1;
        const currentIndex = Math.max(
          0,
          filteredCards.findIndex((card) => card.number === selectedNumber),
        );
        const nextIndex = Math.max(
          0,
          Math.min(filteredCards.length - 1, currentIndex + direction),
        );
        setSelectedNumber(filteredCards[nextIndex].number);
        setLibraryPage(Math.floor(nextIndex / libraryPageSize));
        return;
      }

      if ((event.key === "+" || event.key === "=") && selected && selectedZone) {
        event.preventDefault();
        adjustCard(selectedZone, selected.number, 1);
        return;
      }

      if (event.key === "-" && selected && selectedZone) {
        event.preventDefault();
        adjustCard(selectedZone, selected.number, -1);
        return;
      }

      if (event.key === "[" && selected) {
        event.preventDefault();
        stepCardArt(selected.number, -1);
        return;
      }

      if (event.key === "]" && selected) {
        event.preventDefault();
        stepCardArt(selected.number, 1);
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void copyShareUrl();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deck,
    filteredCards,
    isDialogOpen,
    libraryPageSize,
    mainTotal,
    resourceTotal,
    selectedCard,
    selectedNumber,
  ]);

  const deckColors = useMemo(() => mainColorsForQuantities(deck.main), [deck.main]);

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
      messages.push({ tone: "bad", label: "Colors", detail: "No colors" });
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

    const pendingRulesEntries = mainEntries.filter(
      (entry) => MAIN_TYPES.includes(entry.card.type) && !hasDeckRulesData(entry.card),
    );
    if (pendingRulesEntries.length) {
      messages.push({
        tone: "bad",
        label: "Rules Data",
        detail: `${pendingRulesEntries.length} card IDs pending`,
      });
    }

    messages.push(
      dataStatus.isSynced
        ? {
            tone: dataStatus.syncTone,
            label: "Card DB",
            detail: dataStatus.isFresh
              ? dataStatus.isMarketCoverageLimited
                ? "Fresh scan"
                : "Fresh market"
              : "Market stale",
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
    dataStatus.isMarketCoverageLimited,
    dataStatus.isSynced,
    dataStatus.syncTone,
    deckColors,
    mainEntries,
    mainTotal,
    resourceEntries,
    resourceTotal,
    typeCounts,
  ]);

  const isLegal = notices.every((notice) => notice.tone !== "bad");
  const primaryDeckIssue = notices.find((notice) => notice.tone === "bad") ?? null;
  const activeAdvancedFilterCount = [
    colorFilter !== "All",
    typeFilter !== "All",
    setFilter !== "All",
    artFilter !== "All Prints",
    buildStatusFilter !== "All",
    collectionFilter !== "All",
    budgetLimit !== DEFAULT_BUDGET_LIMIT,
  ].filter(Boolean).length;

  function triggerFeedback(keys: string | string[], message: string) {
    const id = feedbackPulseIdRef.current + 1;
    feedbackPulseIdRef.current = id;
    setFeedbackPulse({ id, keys: Array.isArray(keys) ? keys : [keys], message });
  }

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

  function clearUndoCheckpoint() {
    undoDeckRef.current = null;
    setCanUndo(false);
    setToast((current) => (current?.actionLabel === "Undo" ? null : current));
  }

  function restoreUndoDeck() {
    const previousDeck = undoDeckRef.current;
    if (!previousDeck) return;
    const nextDeck = cloneDeckState(previousDeck);

    undoDeckRef.current = null;
    setCanUndo(false);
    queueDeckStorage(nextDeck, "immediate");
    setDeck(nextDeck);
    showToast("good", "Deck restored", "Previous deck is back in the builder.");
  }

  function replaceDeckWithUndo(
    createNextDeck: () => DeckState,
    label: string,
    detail: string,
  ) {
    if (blockSharedPreviewEdit()) return;
    const nextDeck = cloneDeckState(createNextDeck());
    setDeck((current) => {
      undoDeckRef.current = cloneDeckState(current);
      return nextDeck;
    });
    queueDeckStorage(nextDeck, "immediate");
    setCanUndo(true);
    showToast("warn", label, detail, "Undo");
  }

  function loadSampleDeck() {
    if (sharedPreviewLocked) {
      blockSharedPreviewEdit();
      return;
    }
    clearLibraryFilters();
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

  function blockSharedPreviewEdit() {
    if (!sharedPreviewLocked) return false;
    showToast(
      "warn",
      "Clone to edit",
      "This shared deck preview is read-only. Clone it before changing cards, prints, or the deck name.",
    );
    return true;
  }

  function resetAdvancedFilters() {
    setColorFilter("All");
    setTypeFilter("All");
    setSetFilter("All");
    setArtFilter("All Prints");
    setBuildStatusFilter("All");
    setCollectionFilter("All");
    setBudgetLimit(DEFAULT_BUDGET_LIMIT);
    setLibraryPage(0);
  }

  function focusLegalityFix(notice: Notice) {
    if (notice.label === "Resource") {
      setTypeFilter("RESOURCE");
      setBuildStatusFilter("Deck Ready");
      setLibraryPage(0);
      changeMobileView("library", { focusPanel: true });
      return;
    }

    if (notice.label === "Main deck") {
      setTypeFilter("All");
      setBuildStatusFilter("Deck Ready");
      setLibraryPage(0);
      changeMobileView("library", { focusPanel: true });
      return;
    }

    changeMobileView("deck", { focusPanel: true });
  }

  function clearLibraryFilters() {
    setQuery("");
    setColorFilter("All");
    setTypeFilter("All");
    setSetFilter("All");
    setArtFilter("All Prints");
    setBuildStatusFilter("All");
    setCollectionFilter("All");
    setBudgetLimit(DEFAULT_BUDGET_LIMIT);
    setLibraryPage(0);
  }

  function openTcgList() {
    rememberFallbackReturnFocus();
    if (!tcgListText) {
      if (mainTotal + resourceTotal > 0 && costSummary.unownedCopies === 0) {
        showToast(
          "good",
          "All prints owned",
          "Every selected deck print is already marked owned.",
        );
      } else {
        showToast(
          "good",
          "TCG list empty",
          "Add deck cards before reviewing open prints.",
        );
      }
      return;
    }

    setFallbackPanel({
      title: "TCG List",
      detail: "Review selected deck printings, then copy the buy list or download a price CSV.",
      content: tcgListText,
      copyLabel: "Copy TCG List",
      buyEntries: tcgListEntries,
      downloadName: `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "permet-link"}-tcg-list.txt`,
      csvContent: tcgListCsv,
      csvDownloadName: `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "permet-link"}-price-list.csv`,
    });
    showToast("good", "TCG list ready", "Review panel opened without changing your clipboard.");
  }

  function openCardLightbox(card: GundamCard, artVariant?: CardArtVariant) {
    setLightbox({
      card,
      artVariant: artVariant ?? getArtVariant(card, deck.art),
    });
  }

  function stepCardArt(number: string, delta: number) {
    if (blockSharedPreviewEdit()) return;
    const feedbackCard = CARD_BY_NUMBER.get(number);
    if (!feedbackCard) return;
    clearUndoCheckpoint();
    triggerFeedback(
      [`art:${number}`, `main:${number}`, `resource:${number}`],
      `${feedbackCard.name} print ${delta > 0 ? "upgraded" : "downgraded"}.`,
    );
    setDeck((current) => {
      const card = CARD_BY_NUMBER.get(number);
      if (!card) return current;
      const nextPrints = clonePrints(current.prints);
      const nextArt = { ...current.art };
      const zones: Zone[] = (current.main[number] ?? 0) > 0 ? ["main"] : ["resource"];
      let shiftedArtId: string | null = null;

      zones.forEach((zone) => {
        if (shiftedArtId) return;
        shiftedArtId = shiftOnePrint(
          nextPrints[zone],
          card,
          delta,
          current[zone][number] ?? 0,
          current.art[number],
        );
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
    if (blockSharedPreviewEdit()) return;
    if (mainTotal + resourceTotal === 0) {
      showToast(
        "warn",
        "No prints to tune",
        "Add cards before upgrading or downgrading deck art.",
      );
      return;
    }

    if (!canShiftDeckArt(deck, delta)) {
      showToast(
        "warn",
        delta > 0 ? "Highest prints selected" : "Base prints selected",
        delta > 0
          ? "Every selected print is already at the highest available art tier."
          : "Every selected print is already at standard or the lowest available tier.",
      );
      return;
    }

    undoDeckRef.current = cloneDeckState(deck);
    setCanUndo(true);
    triggerFeedback(
      ["progress:main", "progress:resource", selectedCard ? `art:${selectedCard.number}` : "share"],
      `Deck prints ${delta > 0 ? "upgraded" : "downgraded"}.`,
    );
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
        shiftAllPrints(nextPrints.main, card, delta, current.main[number] ?? 0);
        shiftAllPrints(nextPrints.resource, card, delta, current.resource[number] ?? 0);
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
    showToast(
      "warn",
      delta > 0 ? "Prints upgraded" : "Prints downgraded",
      delta > 0
        ? "Deck copies moved toward higher art tiers."
        : "Deck copies moved toward lower-cost print tiers.",
      "Undo",
    );
  }

  function setCardPrintQuantity(zone: Zone, number: string, variantId: string, delta: number) {
    if (blockSharedPreviewEdit()) return;
    const feedbackCard = CARD_BY_NUMBER.get(number);
    if (!feedbackCard) return;
    clearUndoCheckpoint();
    triggerFeedback(
      [`art:${number}`, `print:${zone}:${number}:${variantId}`, `${zone}:${number}`],
      `${feedbackCard.name} print quantity updated.`,
    );
    setDeck((current) => {
      const card = CARD_BY_NUMBER.get(number);
      const targetQuantity = current[zone][number] ?? 0;
      if (!card || targetQuantity <= 0 || !validArtId(card, variantId)) return current;

      const variants = cardArtVariants(card);
      if (variants.length <= 1) return current;
      const nextPrints = clonePrints(current.prints);
      const nextArt = { ...current.art };
      const quantities = normalizePrintQuantities(
        number,
        targetQuantity,
        nextPrints[zone][number],
        current.art[number],
      );

      if (delta > 0) {
        if ((quantities[variantId] ?? 0) >= targetQuantity) return current;
        const donor = variants.find(
          (variant) => variant.id !== variantId && (quantities[variant.id] ?? 0) > 0,
        );
        if (!donor) return current;
        quantities[donor.id] = (quantities[donor.id] ?? 0) - 1;
        quantities[variantId] = (quantities[variantId] ?? 0) + 1;
      } else {
        if ((quantities[variantId] ?? 0) <= 0) return current;
        const target =
          variantId === "standard"
            ? variants.find((variant) => variant.id !== "standard")
            : variants.find((variant) => variant.id === "standard") ?? variants[0];
        if (!target || target.id === variantId) return current;
        quantities[variantId] = (quantities[variantId] ?? 0) - 1;
        quantities[target.id] = (quantities[target.id] ?? 0) + 1;
      }

      const cleaned = cleanQuantityMap(quantities);
      nextPrints[zone][number] = cleaned;
      const featured =
        variants.find((variant) => (cleaned[variant.id] ?? 0) > 0 && variant.id !== "standard") ??
        variants.find((variant) => (cleaned[variant.id] ?? 0) > 0);
      if (!featured || featured.id === "standard") delete nextArt[number];
      else nextArt[number] = featured.id;

      return { ...current, art: nextArt, prints: nextPrints };
    });
  }

  function setAllCardPrints(number: string, variantId: string) {
    if (blockSharedPreviewEdit()) return;
    const feedbackCard = CARD_BY_NUMBER.get(number);
    if (!feedbackCard) return;
    clearUndoCheckpoint();
    triggerFeedback(
      [
        `art:${number}`,
        `print:main:${number}:${variantId}`,
        `print:resource:${number}:${variantId}`,
        `main:${number}`,
        `resource:${number}`,
      ],
      `${feedbackCard.name} print locked in.`,
    );
    setDeck((current) => {
      const card = CARD_BY_NUMBER.get(number);
      if (!card || !validArtId(card, variantId)) return current;

      const nextPrints = clonePrints(current.prints);
      const nextArt = { ...current.art };
      (["main", "resource"] as const).forEach((zone) => {
        const quantity = current[zone][number] ?? 0;
        if (quantity > 0) nextPrints[zone][number] = { [variantId]: quantity };
      });
      if (variantId === "standard") delete nextArt[number];
      else nextArt[number] = variantId;
      return { ...current, art: nextArt, prints: nextPrints };
    });
  }

  function optimizeDeckPrints(mode: "standard" | "cheapest" | "owned" | "bling") {
    if (blockSharedPreviewEdit()) return;
    if (mainTotal + resourceTotal === 0) {
      showToast("warn", "No prints to tune", "Add cards before optimizing print choices.");
      return;
    }

    undoDeckRef.current = cloneDeckState(deck);
    setCanUndo(true);
    setDeck((current) => {
      const nextPrints = clonePrints(current.prints);
      const nextArt = { ...current.art };

      (["main", "resource"] as const).forEach((zone) => {
        deckEntries(current[zone]).forEach(({ card, quantity }) => {
          const variants = cardArtVariants(card);
          if (!variants.length || quantity <= 0) return;
          let nextMap: QuantityMap = {};

          if (mode === "owned") {
            let remaining = quantity;
            variants.forEach((variant) => {
              if (remaining <= 0) return;
              const owned = getOwnedPrintCount(current.collection, card, variant.id);
              const used = Math.min(owned, remaining);
              if (used > 0) {
                nextMap[variant.id] = used;
                remaining -= used;
              }
            });
            if (remaining > 0) {
              const cheapest = [...variants].sort(
                (a, b) => printCost(card, a) - printCost(card, b),
              )[0];
              nextMap[cheapest.id] = (nextMap[cheapest.id] ?? 0) + remaining;
            }
          } else {
            const target =
              mode === "bling"
                ? variants[variants.length - 1]
                : mode === "cheapest"
                  ? [...variants].sort((a, b) => printCost(card, a) - printCost(card, b))[0]
                  : variants.find((variant) => variant.id === "standard") ?? variants[0];
            nextMap = { [target.id]: quantity };
          }

          nextPrints[zone][card.number] = cleanQuantityMap(nextMap);
          const featured =
            variants.find(
              (variant) =>
                (nextMap[variant.id] ?? 0) > 0 && variant.id !== "standard",
            ) ?? variants.find((variant) => (nextMap[variant.id] ?? 0) > 0);
          if (!featured || featured.id === "standard") delete nextArt[card.number];
          else nextArt[card.number] = featured.id;
        });
      });

      return { ...current, art: nextArt, prints: nextPrints };
    });
    showToast(
      "warn",
      "Prints optimized",
      mode === "standard"
        ? "All deck copies moved to standard prints."
        : mode === "cheapest"
          ? "Deck copies moved to the lowest available print estimates."
          : mode === "owned"
            ? "Owned prints were used first, then cheapest open copies."
            : "Deck copies moved to the highest available print tiers.",
      "Undo",
    );
  }

  function adjustCard(zone: Zone, number: string, delta: number) {
    if (blockSharedPreviewEdit()) return;
    const currentDeck = deckRef.current;
    const cardForFeedback = CARD_BY_NUMBER.get(number);
    const currentQuantityForFeedback = currentDeck[zone][number] ?? 0;
    if (!cardForFeedback) return;

    if (delta > 0) {
      const constraint = zoneAddConstraint(
        zone,
        cardForFeedback,
        currentQuantityForFeedback,
        currentDeck,
      );
      if (constraint) {
        showToast("warn", "Add blocked", constraint);
        triggerFeedback(`${zone}:${number}`, constraint);
        return;
      }
    }

    if (delta < 0 && currentQuantityForFeedback <= 0) {
      showToast(
        "warn",
        "Remove blocked",
        `No ${zoneLabel(zone).toLowerCase()} copies to remove.`,
      );
      triggerFeedback(`${zone}:${number}`, `No ${zoneLabel(zone).toLowerCase()} copies to remove.`);
      return;
    }

    const nextQuantityForFeedback =
      zone === "main"
        ? Math.max(0, Math.min(MAX_MAIN_COPIES, currentQuantityForFeedback + delta))
        : Math.max(0, currentQuantityForFeedback + delta);
    triggerFeedback(
      [`${zone}:${number}`, `progress:${zone}`],
      `${zoneLabel(zone)} deck ${
        zone === "main" ? mainTotalRef.current + delta : resourceTotalRef.current + delta
      }. ${cardForFeedback.name} quantity ${nextQuantityForFeedback}.`,
    );
    clearUndoCheckpoint();
    setDeck((current) => {
      const card = CARD_BY_NUMBER.get(number);
      if (!card) return current;
      const target = current[zone];
      const currentQuantity = target[number] ?? 0;
      if (delta > 0) {
        if (zoneAddConstraint(zone, card, currentQuantity, current)) return current;
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
        nextPrints[zone][number] = normalizePrintQuantities(
          number,
          currentQuantity,
          nextPrints[zone][number],
          preferredArtId,
        );
        if (delta > 0) {
          addPrintCopies(nextPrints[zone], card, preferredArtId, delta);
        } else if (delta < 0) {
          removePrintCopies(nextPrints[zone], card, preferredArtId, Math.abs(delta));
        }
        nextPrints[zone][number] = normalizePrintQuantities(
          number,
          nextQuantity,
          nextPrints[zone][number],
          preferredArtId,
        );
      }

      return {
        ...current,
        [zone]: nextTarget,
        prints: nextPrints,
      };
    });
  }

  function removeCard(zone: Zone, number: string) {
    if (blockSharedPreviewEdit()) return;
    const card = CARD_BY_NUMBER.get(number);
    const quantity = deck[zone][number] ?? 0;
    if (!card || quantity <= 0) return;

    undoDeckRef.current = cloneDeckState(deck);
    setCanUndo(true);
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
    if (blockSharedPreviewEdit()) return;
    if (delta < 0 && (deck.collection[number]?.[artId] ?? 0) <= 0) {
      showToast("warn", "No owned print", "There are no owned copies to remove.");
      return;
    }

    clearUndoCheckpoint();
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
    if (blockSharedPreviewEdit()) return;
    if (costSummary.deckCopies <= 0) {
      showToast("warn", "No prints to mark", "Add cards before marking deck prints owned.");
      return;
    }

    undoDeckRef.current = cloneDeckState(deck);
    setCanUndo(true);
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
    let existing: DeckState | null = null;
    try {
      existing = sanitizeDeck(JSON.parse(safeLocalStorageGet(STORAGE_KEY) ?? "null"));
    } catch {
      existing = null;
    }
    const clonedDeck = cloneDeckState(deck);
    if (existing && collectionHasCards(existing.collection)) {
      clonedDeck.collection = mergeCollections(existing.collection, clonedDeck.collection);
    }

    const wouldReplace =
      existing &&
      deckHasCards(existing) &&
      comparableDeckSnapshot(existing) !== comparableDeckSnapshot(clonedDeck);

    if (
      wouldReplace &&
      !window.confirm(
        "Clone this shared deck and replace your current local deck? Your owned-card collection will be kept.",
      )
    ) {
      showToast("warn", "Clone cancelled", "Your current local deck was not changed.");
      return;
    }

    if (safeLocalStorageSet(STORAGE_KEY, JSON.stringify(clonedDeck))) {
      setSharedStatus("cloned");
      window.location.assign("/");
      return;
    }

    showToast(
      "bad",
      "Clone blocked",
      "Browser storage is unavailable. Export this shared deck and import it locally instead.",
    );
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
    const requiredRows = Math.ceil(rows.length / columns);
    const height = headerHeight + requiredRows * (cardHeight + 72 + gap) + 64;
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

    const imageTimeoutMs = 2500;
    let skippedImages = 0;
    await Promise.all(
      rows.map(
        (row, index) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            let settled = false;
            const column = index % columns;
            const rowIndex = Math.floor(index / columns);
            const x = 42 + column * (cardWidth + gap);
            const y = headerHeight + rowIndex * (cardHeight + 72 + gap);
            const finish = () => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timeout);
              resolve();
            };
            const drawPlaceholder = () => {
              skippedImages += 1;
              context.fillStyle = "#11141b";
              context.fillRect(x, y, cardWidth, cardHeight);
              context.strokeStyle = "rgba(139,220,255,0.32)";
              context.strokeRect(x, y, cardWidth, cardHeight);
              context.fillStyle = "#f6c542";
              context.font = "900 16px Arial";
              context.fillText("IMAGE", x + 18, y + 90);
              context.fillText("PENDING", x + 18, y + 112);
            };
            const timeout = window.setTimeout(() => {
              drawPlaceholder();
              finish();
            }, imageTimeoutMs);
            image.crossOrigin = "anonymous";
            image.onload = () => {
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
              finish();
            };
            image.onerror = () => {
              drawPlaceholder();
              finish();
            };
            image.src = cardImagePath(row.card, row.variant, 640);
          }),
      ),
    );

    const anchor = document.createElement("a");
    anchor.download = `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "permet-link"}-sheet.png`;
    try {
      anchor.href = canvas.toDataURL("image/png");
      anchor.click();
      showToast(
        "good",
        "Deck sheet exported",
        `${rows.length} print rows rendered as a PNG${
          skippedImages ? `; ${skippedImages} images used placeholders.` : "."
        }`,
      );
    } catch {
      showToast(
        "bad",
        "Deck sheet blocked",
        "Remote card images need a same-origin image proxy before exporting.",
      );
    }
  }

  async function copyDeckList() {
    rememberFallbackReturnFocus();
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
      copyLabel: "Copy Deck List",
      autoSelectContent: true,
      downloadName: `${deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "permet-link"}-deck.txt`,
    });
    showToast("bad", "Copy failed", "Deck list opened in a manual copy panel.");
    window.setTimeout(() => setCopyState("Copy"), 1200);
  }

  async function copyFallbackContent(content: string, label: string) {
    const copied = await writeClipboardText(content);
    showToast(
      copied ? "good" : "bad",
      copied ? `${label} copied` : `${label} copy failed`,
      copied ? "Text is on your clipboard." : "Select the text manually from the panel.",
    );
  }

  async function copyShareUrl() {
    rememberFallbackReturnFocus();
    if (shareState === "Saving" || shareState === "Copying") return;
    if (sharedPreviewLocked) {
      const shareUrl = new URL(window.location.pathname, window.location.origin).toString();
      const copied = await writeClipboardText(shareUrl);
      setShareState(copied ? "Copied" : "Link Ready");
      if (!copied) {
        setFallbackPanel({
          title: "Share Link",
          detail:
            "Clipboard access was blocked. This read-only link shares decklist and selected printings only; ownership is not included.",
          content: shareUrl,
          href: shareUrl,
          copyLabel: "Copy Share Link",
          autoSelectContent: true,
        });
      }
      showToast(
        copied ? "good" : "warn",
        copied ? "Shared link copied" : "Shared link ready",
        copied
          ? "Current shared deck URL copied; ownership is not included."
          : "Manual share panel opened; ownership is not included.",
      );
      window.setTimeout(() => setShareState("Share"), copied ? 1400 : 2600);
      return;
    }

    const snapshot = comparableDeckSnapshot(deck);
    if (shareCacheRef.current?.snapshot === snapshot) {
      setShareState("Copying");
      const copied = await writeClipboardText(shareCacheRef.current.url);
      setShareState(copied ? "Copied" : "Link Ready");
      if (!copied) {
        setFallbackPanel({
          title: "Share Link",
          detail:
            "Clipboard access was blocked. This URL shares decklist and selected printings only; ownership is not included.",
          content: shareCacheRef.current.url,
          href: shareCacheRef.current.url,
          copyLabel: "Copy Share Link",
          autoSelectContent: true,
        });
      }
      showToast(
        copied ? "good" : "warn",
        copied ? "Share link copied" : "Share link ready",
        "Unchanged deck link reused; ownership is not included.",
      );
      triggerFeedback("share", copied ? "Shared deck link copied." : "Shared deck link ready.");
      window.setTimeout(() => setShareState("Share"), copied ? 1400 : 2600);
      return;
    }

    if (!deckHasCards(deck)) {
      setShareState("Add Cards");
      showToast(
        "bad",
        "Share needs cards",
        "Add at least one card before creating a shared deck link.",
      );
      window.setTimeout(() => setShareState("Share"), 1800);
      return;
    }

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
        if (response.status === 429) {
          const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? 0);
          const retryText =
            retryAfterSeconds > 0
              ? ` Try again in ${Math.ceil(retryAfterSeconds / 60)} min.`
              : " Try again shortly.";
          throw new Error(`${result.error ?? "Too many shared decks."}${retryText}`);
        }
        throw new Error(result.error ?? "Share failed");
      }

      const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(
        window.location.hostname,
      );
      const shareUrl = new URL(
        result.shareUrl,
        isLocalHost ? window.location.origin : CANONICAL_ORIGIN,
      ).toString();
      shareCacheRef.current = { snapshot, url: shareUrl };
      setShareState("Copying");
      const copied = await writeClipboardText(shareUrl);
      setShareState(copied ? "Copied" : "Link Ready");
      if (!copied) {
        setFallbackPanel({
          title: "Share Link",
          detail:
            "Clipboard access was blocked. This URL shares decklist and selected printings only; ownership is not included.",
          content: shareUrl,
          href: shareUrl,
          copyLabel: "Copy Share Link",
          autoSelectContent: true,
        });
      }
      showToast(
        copied ? "good" : "warn",
        copied ? "Share link copied" : "Share link ready",
        `${isLegal ? "Legal deck" : "WIP deck"} link ${
          copied ? "copied" : "opened"
        }; ownership is not included.`,
      );
      triggerFeedback("share", copied ? "Shared deck link copied." : "Shared deck link ready.");
      window.setTimeout(() => setShareState("Share"), copied ? 1400 : 2600);
    } catch (error) {
      setShareState("Failed");
      showToast(
        "bad",
        "Share failed",
        error instanceof Error ? error.message : "The deck link could not be created.",
      );
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
      deck.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "permet-link"
    }-backup.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast(
      "good",
      "Backup exported",
      "JSON backup downloaded; collection ownership may be included.",
    );
  }

  function confirmParsedDeckImport(parsed: DeckImportResult) {
    const hasDifferentDeck =
      deckHasCards(deck) &&
      comparableDeckSnapshot(deck) !== comparableDeckSnapshot(parsed.deck);

    if (!hasDifferentDeck && !parsed.warnings.length) return true;

    return window.confirm(importReplacementConfirmMessage(parsed, hasDifferentDeck));
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error("Deck import is too large. Use a Permet Link export under 64 KB.");
      }
      const text = await file.text();
      assertImportSize(text);
      const parsed = parseDeckImportText(text);
      if (!parsed) {
        throw new Error("Invalid deck");
      }
      if (!confirmParsedDeckImport(parsed)) {
        showToast("warn", "Import cancelled", "No deck changes were made.");
        return;
      }
      replaceDeckWithUndo(
        () => parsed.deck,
        `${parsed.source} imported`,
        `${parsed.deck.name} loaded. Previous deck is saved for undo.`,
      );
    } catch (error) {
      showToast(
        "bad",
        "Import failed",
        error instanceof Error && error.message !== "Invalid deck"
          ? error.message
          : "Choose a valid Permet Link JSON backup or plain-text decklist.",
      );
    }
  }

  async function pasteDeckList() {
    if (blockSharedPreviewEdit()) return;
    try {
      const text = await navigator.clipboard?.readText?.();
      if (!text) throw new Error("Clipboard empty");
      assertImportSize(text);
      const parsed = parseDeckImportText(text);
      if (!parsed) throw new Error("Invalid deck");
      if (!confirmParsedDeckImport(parsed)) {
        showToast("warn", "Paste cancelled", "No deck changes were made.");
        return;
      }
      replaceDeckWithUndo(
        () => parsed.deck,
        "Deck pasted",
        `${parsed.deck.name} loaded from clipboard. Previous deck is saved for undo.`,
      );
    } catch (error) {
      showToast(
        "bad",
        "Paste failed",
        error instanceof Error && !["Clipboard empty", "Invalid deck"].includes(error.message)
          ? error.message
          : "Copy a plain-text decklist or Permet Link JSON backup, then try Paste.",
      );
    }
  }

  function runMobileAction(action: () => void) {
    setMobileActionsOpen(false);
    action();
  }

  function rememberFallbackReturnFocus() {
    setFallbackReturnFocusElement(
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null,
    );
  }

  function closeFallbackPanel() {
    setFallbackPanel(null);
    setFallbackReturnFocusElement(null);
  }

  function focusWorkspacePanel(view: MobileView) {
    const panel = document.getElementById(`${view}-panel`);
    if (!(panel instanceof HTMLElement)) return;
    panel.focus({ preventScroll: true });
    panel.scrollIntoView({ block: "start", behavior: "auto" });
  }

  function changeMobileView(
    view: MobileView,
    options: MobileViewChangeOptions = {},
  ) {
    setMobileActionsOpen(false);
    if (mobileTabsEnabled && view === mobileView) {
      window.requestAnimationFrame(() => {
        if (view === "library") {
          searchInputRef.current?.focus({ preventScroll: true });
          searchInputRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
          return;
        }
        focusWorkspacePanel(view);
      });
      return;
    }
    setMobileView(view);
    window.requestAnimationFrame(() => {
      if (options.focusPanel) {
        focusWorkspacePanel(view);
        return;
      }
      const workspaceScroller = document.querySelector(".app-content-shell > section");
      if (workspaceScroller instanceof HTMLElement) {
        workspaceScroller.scrollTo({ top: 0, behavior: "auto" });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    });
  }

  function handleSkipLink(event: React.MouseEvent<HTMLAnchorElement>, view: MobileView) {
    event.preventDefault();
    if (mobileTabsEnabled) {
      setMobileActionsOpen(false);
      setMobileView(view);
    }
    window.requestAnimationFrame(() => {
      focusWorkspacePanel(view);
    });
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

      <div
        className="app-content-shell"
        aria-hidden={isDialogOpen || undefined}
        inert={isDialogOpen || undefined}
      >
        <nav className="skip-links" aria-label="Skip links">
          <a href="#library-panel" onClick={(event) => handleSkipLink(event, "library")}>
            Skip to library
          </a>
          <a href="#card-panel" onClick={(event) => handleSkipLink(event, "card")}>
            Skip to card inspector
          </a>
          <a href="#deck-panel" onClick={(event) => handleSkipLink(event, "deck")}>
            Skip to deck list
          </a>
          <a href="#stats-panel" onClick={(event) => handleSkipLink(event, "stats")}>
            Skip to stats
          </a>
        </nav>
        <p className="sr-only" aria-live="polite">
          {feedbackPulse?.message ?? ""}
        </p>
        <header className="sticky top-0 z-30 border-b border-[#a7b5c9]/25 bg-[#05060a]/88 shadow-xl shadow-black/40 backdrop-blur-xl">
        <div className="mx-auto max-w-[1800px] px-3 py-1.5 sm:px-5 sm:py-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="brand-status-cluster flex min-w-0 flex-wrap items-center gap-2 xl:flex-nowrap">
              <div className="brand-logo-lockup flex w-32 shrink-0 items-center sm:w-52 xl:w-56 2xl:w-72">
                <img
                  src="/permet-link-logo-header.webp"
                  alt="Permet Link"
                  width={960}
                  height={384}
                  decoding="async"
                  fetchPriority="high"
                  className="h-auto w-full object-contain object-left"
                />
              </div>
              <div className="min-w-0">
                <p className="hidden font-display text-sm font-black uppercase text-[#f6c542] sm:block">
                  Gundam Card Game
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:mt-1">
                  <h1 className="sr-only">
                    Permet Link
                  </h1>
                  <StatusBadge isLegal={isLegal} issue={primaryDeckIssue} />
                  <span className="hidden sm:inline-flex">
                    <DeckColorRail colors={deckColors} compact />
                  </span>
                  {isStarterTemplate && (
                    <span className="inline-flex h-8 items-center rounded-sm border border-[#8bdcff]/34 bg-[#1167d8]/14 px-2.5 font-display text-sm font-black uppercase text-[#d9ecff]">
                      Starter Template
                    </span>
                  )}
                </div>
                <p className="mobile-deck-title-chip mt-1 truncate rounded-sm border border-[#a7b5c9]/22 bg-[#f7f7f2]/8 px-2 py-1 font-display text-sm font-black uppercase text-[#f7f7f2]/76">
                  {deck.name}
                </p>
              </div>
            </div>

            <div className="grid min-w-0 flex-1 gap-2 xl:grid-cols-1 min-[1500px]:grid-cols-[minmax(220px,1fr)_auto]">
              <label className="hidden min-w-0 md:col-span-1 xl:block">
                <span className="sr-only">Deck name</span>
                <input
                  value={deck.name}
                  onChange={(event) => {
                    if (blockSharedPreviewEdit()) return;
                    setDeck((current) => ({ ...current, name: event.target.value }));
                  }}
                  readOnly={sharedPreviewLocked}
                  className="control-field short-cockpit-deck-name h-11 w-full rounded-sm border border-[#a7b5c9]/28 bg-[#f7f7f2]/12 px-3 text-base font-black text-[#f7f7f2] outline-none placeholder:text-[#f7f7f2]/40 focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
                />
              </label>
              <div className="relative short-cockpit-actions min-w-0">
                <div className="toolbar-action-rail grid grid-cols-3 gap-2 xl:flex xl:flex-nowrap xl:justify-end xl:overflow-x-auto xl:pb-1">
                  <ToolbarButton
                    label="TCG List"
                    mobileLabel="TCG"
                    title="Open TCG print list"
                    onClick={openTcgList}
                    showDesktopLabel
                    className="w-full xl:w-auto"
                  >
                    <ShoppingCart size={16} />
                  </ToolbarButton>
                  <ToolbarButton
                    label={shareButtonLabel}
                    mobileLabel={shareButtonLabel}
                    title={
                      sharedPreviewLocked
                        ? "Copy current shared deck link"
                        : "Share decklist and selected printings"
                    }
                    ariaLabel={
                      sharedPreviewLocked
                        ? "Copy current shared deck link"
                        : "Share decklist and selected printings"
                    }
                    onClick={copyShareUrl}
                    disabled={shareState === "Saving" || shareState === "Copying"}
                    showDesktopLabel
                    className="w-full xl:w-auto"
                  >
                    <Share2 size={16} />
                  </ToolbarButton>
                  <ToolbarButton
                    label={mobileActionsOpen ? "Close" : "More"}
                    mobileLabel={mobileActionsOpen ? "Close" : "More"}
                    title="More deck actions"
                    onClick={() => setMobileActionsOpen((open) => !open)}
                    ariaExpanded={mobileActionsOpen}
                    ariaControls={mobileActionsOpen ? "mobile-action-sheet" : undefined}
                    className="w-full xl:hidden"
                  >
                    {mobileActionsOpen ? <X size={16} /> : <MoreHorizontal size={16} />}
                  </ToolbarButton>
                  <div className="hidden xl:contents">
                      {canUndo && (
                      <ToolbarButton
                        label="Undo"
                        title="Restore previous deck state"
                        onClick={restoreUndoDeck}
                      >
                        <Undo2 size={16} />
                      </ToolbarButton>
                      )}
                    <ToolbarButton
                      label="Sample"
                      title={sharedPreviewLocked ? sharedPreviewEditReason : "Load sample deck"}
                        ariaLabel="Load sample deck"
                        onClick={loadSampleDeck}
                        disabled={sharedPreviewLocked}
                      >
                        <ShieldCheck size={16} />
                      </ToolbarButton>
                    <ToolbarButton
                      label="New"
                      title={sharedPreviewLocked ? sharedPreviewEditReason : "Start a new deck"}
                        ariaLabel="Start a new deck"
                        onClick={startNewDeck}
                        disabled={sharedPreviewLocked}
                      >
                        <RotateCcw size={16} />
                      </ToolbarButton>
                    <ToolbarButton
                      label="Art -"
                      title={sharedPreviewLocked ? sharedPreviewEditReason : "Downgrade deck art budget"}
                      ariaLabel="Downgrade deck art budget"
                      onClick={() => stepDeckArt(-1)}
                      disabled={sharedPreviewLocked}
                    >
                      <ChevronDown size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                      label="Art +"
                      title={sharedPreviewLocked ? sharedPreviewEditReason : "Upgrade deck art budget"}
                      ariaLabel="Upgrade deck art budget"
                      onClick={() => stepDeckArt(1)}
                      disabled={sharedPreviewLocked}
                    >
                      <ChevronUp size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                      label={copyState}
                      title="Copy deck list"
                      onClick={copyDeckList}
                    >
                      <Clipboard size={16} />
                    </ToolbarButton>
                      <ToolbarButton
                      label="Backup"
                      title="Export backup JSON"
                      onClick={exportJson}
                    >
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
                      title={sharedPreviewLocked ? sharedPreviewEditReason : "Import JSON or text decklist"}
                        ariaLabel="Import deck"
                        onClick={() => importInputRef.current?.click()}
                        disabled={sharedPreviewLocked}
                        showDesktopLabel
                      >
                        <Upload size={16} />
                      </ToolbarButton>
                    <ToolbarButton
                      label="Paste"
                      title={sharedPreviewLocked ? sharedPreviewEditReason : "Paste decklist from clipboard"}
                      ariaLabel="Paste decklist"
                      onClick={() => void pasteDeckList()}
                      disabled={sharedPreviewLocked}
                      showDesktopLabel
                    >
                      <Clipboard size={16} />
                    </ToolbarButton>
                  </div>
                </div>
              </div>
              <input
                ref={importInputRef}
                className="hidden"
                type="file"
                accept="application/json,text/plain,.json,.txt"
                onChange={(event) => {
                  void importJson(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </div>

          <div className="mt-2 hidden gap-2 min-[1800px]:grid min-[1800px]:grid-cols-8">
            <Metric label="Main" value={`${mainTotal}/${MAIN_TARGET}`} />
            <Metric label="Resource" value={`${resourceTotal}/${RESOURCE_TARGET}`} />
            <Metric label="Colors" value={deckColors.length ? deckColors.join(" / ") : "-"} />
            <Metric label="Cards" value={`${CARD_POOL.length} loaded`} />
            <Metric label="Alt Selected" value={`${selectedAltTotal}`} />
            <Metric label="Market / Est." value={formatMoney(costSummary.artTotal)} />
            <Metric label="TCG List" value={formatMoney(tcgListTotal)} />
            <Metric label="Showing" value={`${filteredCards.length}`} />
          </div>
          <HudStrip
            isLegal={isLegal}
            sharedStatus={sharedStatus}
            deckName={deck.name}
            deckColors={deckColors}
            isStarterTemplate={isStarterTemplate}
            selectedCard={selectedCard}
            issue={primaryDeckIssue}
            marketTotal={costSummary.artTotal}
          />
        </div>
      </header>

      <section className="mx-auto grid max-w-[1800px] gap-4 px-3 pb-36 pt-3 sm:px-5 sm:pb-36 sm:pt-4 xl:pb-4">
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
        {!sharedDeckId && loaded && !deckHasCards(deck) && (
          <StartBuildPanel
            onSample={loadSampleDeck}
            onImport={() => importInputRef.current?.click()}
            onBrowse={() => changeMobileView("library")}
          />
        )}

            <div className="workbench-grid grid gap-4 xl:grid-cols-[minmax(430px,1.05fr)_minmax(360px,0.82fr)_minmax(360px,0.9fr)] xl:items-start 2xl:grid-cols-[minmax(540px,1.25fr)_minmax(390px,0.82fr)_minmax(390px,0.9fr)]">
          <section
            ref={libraryPanelRef}
            id="library-panel"
            role={mobileTabsEnabled ? "tabpanel" : "region"}
            aria-labelledby={mobileTabsEnabled ? "library-tab" : undefined}
            aria-label={mobileTabsEnabled ? undefined : "Card library"}
            tabIndex={-1}
            className={panelClass(
              `library-panel min-w-0 ${
                mobileView === "library" ? "block" : "hidden xl:block"
              }`,
            )}
          >
            {renderLibraryPanel && (
              <>
            <div className="sticky top-0 z-10 border-b border-[#a7b5c9]/20 bg-[#080a0f]/94 p-2 backdrop-blur">
              <div className="flex flex-col gap-2">
                <div className="flex shrink-0 items-center gap-2">
                  <Search size={18} className="text-[#f6c542]" />
                  <h2 className="whitespace-nowrap font-display text-xl font-black uppercase text-[#f7f7f2] sm:text-2xl">
                    Card Library
                  </h2>
                </div>
                <div className="grid gap-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(6rem,auto)] gap-2 md:grid-cols-[minmax(220px,1fr)_minmax(8.5rem,0.5fr)_minmax(8.5rem,0.5fr)_auto] xl:grid-cols-2 2xl:grid-cols-[minmax(220px,1fr)_minmax(8.5rem,0.5fr)_minmax(8.5rem,0.5fr)_auto]">
                    <label className="filter-cell relative block">
                      <span className="sr-only">
                        Search
                      </span>
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#f7f7f2]/58"
                          size={16}
                        />
                        <input
                          ref={searchInputRef}
                          value={query}
                          aria-label="Search cards"
                          onChange={(event) => {
                            setQuery(event.target.value);
                            setLibraryPage(0);
                          }}
                          placeholder="Name, #, text"
                          className="control-field h-11 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#f7f7f2]/8 pl-9 pr-10 text-base font-semibold text-[#f7f7f2] outline-none placeholder:text-[#f7f7f2]/54 focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
                        />
                        {query && (
                          <button
                            type="button"
                            className="interactive-control absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-sm border border-[#a7b5c9]/18 bg-[#05070c]/80 text-[#f7f7f2]/72 hover:border-[#f6c542]/35 hover:text-[#fff2bd]"
                            onClick={() => {
                              setQuery("");
                              setLibraryPage(0);
                              searchInputRef.current?.focus();
                            }}
                            aria-label="Clear search"
                            title="Clear search"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    </label>
                    <div className="hidden md:block">
                      <SelectFilter
                        label="Color"
                        value={colorFilter}
                        values={colorFilters}
                        hideLabel
                        onChange={(value) => {
                          setColorFilter(value);
                          setLibraryPage(0);
                        }}
                      />
                    </div>
                    <div className="hidden md:block">
                      <SelectFilter
                        label="Type"
                        value={typeFilter}
                        values={typeFilters}
                        hideLabel
                        onChange={(value) => {
                          setTypeFilter(value);
                          setLibraryPage(0);
                        }}
                      />
                    </div>
                    <button
                      ref={advancedFiltersTriggerRef}
                      type="button"
                      className="interactive-control inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm border border-[#8bdcff]/28 bg-[#1167d8]/12 px-2.5 font-display text-base font-black uppercase text-[#d9ecff] hover:bg-[#1167d8]/18 md:px-3"
                      onClick={() => setAdvancedFiltersOpen((open) => !open)}
                      aria-expanded={advancedFiltersOpen}
                      aria-controls={advancedFiltersOpen ? "library-advanced-filters" : undefined}
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
                      {colorFilter !== "All" && <FilterChip label={`Color: ${colorFilter}`} />}
                      {typeFilter !== "All" && <FilterChip label={`Type: ${typeFilter}`} />}
                      {setFilter !== "All" && <FilterChip label={`Set: ${setFilter}`} />}
                      {artFilter !== "All Prints" && <FilterChip label={`Print: ${artFilter}`} />}
                      {buildStatusFilter !== "All" && (
                        <FilterChip label={`Card Data: ${buildStatusFilter}`} />
                      )}
                      {collectionFilter !== "All" && (
                        <FilterChip label={`Owned/Budget: ${collectionFilter}`} />
                      )}
                      {budgetLimit !== DEFAULT_BUDGET_LIMIT && (
                        <FilterChip label={`Under ${formatMoney(budgetLimit)}`} />
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

                  {advancedFiltersModalOpen && (
                    <button
                      type="button"
                      className="fixed inset-0 z-[54] cursor-default bg-black/45 md:hidden"
                      onClick={() => setAdvancedFiltersOpen(false)}
                      aria-label="Close library filters"
                      tabIndex={-1}
                    />
                  )}
                  {advancedFiltersOpen && (
                    <div
                      ref={advancedFiltersRef}
                      id="library-advanced-filters"
                      className="library-filters-popover workbench-scroll grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 md:grid-cols-4"
                      role={advancedFiltersModalOpen ? "dialog" : undefined}
                      aria-modal={advancedFiltersModalOpen || undefined}
                      aria-labelledby={
                        advancedFiltersModalOpen ? "library-advanced-filters-title" : undefined
                      }
                      onKeyDown={
                        advancedFiltersModalOpen
                          ? (event) =>
                              trapDialogFocus(event, advancedFiltersRef.current, () =>
                                setAdvancedFiltersOpen(false),
                              )
                          : undefined
                      }
                    >
                      <div className="filter-sheet-header col-span-full flex items-center justify-between gap-2 border-b border-[#a7b5c9]/16 pb-2 md:hidden">
                        <h2
                          id="library-advanced-filters-title"
                          className="font-display text-base font-black uppercase text-[#d9ecff]"
                        >
                          Filter Library
                        </h2>
                        <button
                          ref={advancedFiltersDoneRef}
                          type="button"
                          className="interactive-control inline-flex h-11 min-h-11 items-center justify-center rounded-sm border border-[#8bdcff]/28 bg-[#1167d8]/12 px-3 font-display text-sm font-black uppercase text-[#d9ecff]"
                          onClick={() => setAdvancedFiltersOpen(false)}
                        >
                          Done
                        </button>
                      </div>
                      <div className="md:hidden">
                        <SelectFilter
                          label="Color"
                          ariaLabel="Advanced color"
                          value={colorFilter}
                          values={colorFilters}
                          onChange={(value) => {
                            setColorFilter(value);
                            setLibraryPage(0);
                          }}
                        />
                      </div>
                      <div className="md:hidden">
                        <SelectFilter
                          label="Type"
                          ariaLabel="Advanced type"
                          value={typeFilter}
                          values={typeFilters}
                          onChange={(value) => {
                            setTypeFilter(value);
                            setLibraryPage(0);
                          }}
                        />
                      </div>
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
                          className="control-field mt-1 h-11 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-3 text-base font-bold text-[#f7f7f2] outline-none focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
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
                        label="Owned/Budget"
                        value={collectionFilter}
                        values={collectionFilters}
                        onChange={(value) => {
                          setCollectionFilter(value);
                          setLibraryPage(0);
                        }}
                      />
                      <SelectFilter
                        label="Card Data"
                        value={buildStatusFilter}
                        values={buildStatusFilters}
                        onChange={(value) => {
                          setBuildStatusFilter(value);
                          setLibraryPage(0);
                        }}
                      />
                      <label className="filter-cell block min-w-[8.5rem] shrink-0 md:min-w-0">
                        <span className="font-display text-xs font-black uppercase text-[#8bdcff]">
                          Under Price
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
                          className="control-field mt-1 h-11 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-3 text-base font-bold text-[#f7f7f2] outline-none focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="library-pager border-b border-[#a7b5c9]/14 bg-[#0d1118]/86 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-1.5" aria-live="polite">
                  <span className="font-display text-sm font-black uppercase text-[#8bdcff]">
                    {libraryRangeStart}-{libraryRangeEnd}
                  </span>
                  <span className="truncate text-sm font-semibold text-[#f7f7f2]/64">
                    of {filteredCards.length}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                  <label className="inline-flex items-center gap-1.5">
                    <span className="sr-only">Cards per library page</span>
                    <select
                      value={libraryPageSize}
                      onChange={(event) => {
                        setLibraryPageSize(
                          Number(event.target.value) as (typeof libraryPageSizeOptions)[number],
                        );
                        setLibraryPage(0);
                      }}
                      className="control-field h-11 w-[4.15rem] rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-1 font-display text-xs font-black uppercase text-[#f7f7f2] outline-none focus:border-[#f6c542] min-[390px]:w-[5.5rem] sm:w-auto sm:px-2 sm:text-sm"
                      aria-label="Cards per library page"
                    >
                      {libraryPageSizeOptions.map((size) => (
                        <option key={size} value={size}>
                          {size}/page
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="interactive-control inline-flex size-11 items-center justify-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2] hover:border-[#8bdcff]/45 hover:bg-[#8bdcff]/12 disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={() =>
                      setLibraryPage(Math.max(0, safeLibraryPage - 1))
                    }
                    disabled={safeLibraryPage === 0}
                    aria-label="Previous library page"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="min-w-12 rounded-sm border border-[#f6c542]/22 bg-[#f6c542]/10 px-1.5 py-1.5 text-center font-display text-sm font-black uppercase text-[#fff2bd] min-[390px]:min-w-16 sm:min-w-20 sm:px-3 sm:py-2">
                    {safeLibraryPage + 1}/{libraryTotalPages}
                  </span>
                  <button
                    type="button"
                    className="interactive-control inline-flex size-11 items-center justify-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2] hover:border-[#8bdcff]/45 hover:bg-[#8bdcff]/12 disabled:cursor-not-allowed disabled:opacity-35"
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

            {catalogOnlySummary.shouldShow && (
              <CatalogOnlyBanner
                catalogCards={catalogOnlySummary.catalogCards}
                deckReadyCards={catalogOnlySummary.deckReadyCards}
                onDeckReady={() => {
                  setBuildStatusFilter("Deck Ready");
                  setLibraryPage(0);
                }}
                onCatalogOnly={() => {
                  setBuildStatusFilter("Catalog Only");
                  setLibraryPage(0);
                }}
              />
            )}

            <div className="grid grid-cols-1 gap-2.5 p-2.5 sm:gap-3 sm:p-3">
              {visibleLibraryCards.length ? (
                visibleLibraryCards.map((card, index) => (
                  <LibraryCard
                    key={card.number}
                    card={card}
                    deck={deck}
                    artVariant={getArtVariant(card, deck.art)}
                    selected={selectedCard?.number === card.number}
                    mainQuantity={deck.main[card.number] ?? 0}
                    resourceQuantity={deck.resource[card.number] ?? 0}
                    ownedQuantity={getTotalOwnedForCard(deck.collection, card)}
                    pulseId={pulseIdFor(
                      MAIN_TYPES.includes(card.type)
                        ? `main:${card.number}`
                        : RESOURCE_TYPES.includes(card.type)
                          ? `resource:${card.number}`
                          : `card:${card.number}`,
                    )}
                    readOnly={sharedPreviewLocked}
                    eagerImage={index === 0}
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
                <div className="relative z-[60] col-span-full mb-24 rounded-sm border border-[#a7b5c9]/18 bg-[#07090d]/96 p-5 text-center shadow-2xl shadow-black/30 xl:mb-0">
                  <p className="font-display text-lg font-black uppercase text-[#f7f7f2]">
                    No cards found
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#f7f7f2]/62">
                    Clear a filter or broaden the search.
                  </p>
                  <button
                    type="button"
                    className="interactive-control mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-4 font-display text-base font-black uppercase text-[#fff2bd]"
                    onClick={clearLibraryFilters}
                  >
                    <RotateCcw size={15} />
                    Clear All
                  </button>
                </div>
              )}
            </div>
              </>
            )}
          </section>

              <div className="inspector-stack contents xl:grid xl:gap-4">
            <div
              id="card-panel"
              role={mobileTabsEnabled ? "tabpanel" : "region"}
              aria-labelledby={mobileTabsEnabled ? "card-tab" : undefined}
              aria-label={mobileTabsEnabled ? undefined : "Card inspector"}
              tabIndex={-1}
              className={mobileView === "card" ? "block min-w-0" : "hidden min-w-0 xl:block"}
            >
              {renderCardPanel && (
                <>
              {selectedCard && selectedArtVariant ? (
                <InspectorPanel
                  card={selectedCard}
                  deck={deck}
                  artVariant={selectedArtVariant}
                  artVariants={selectedArtVariants}
                  deckQuantity={selectedDeckPrintCount}
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
                  onAdjustPrintQuantity={(zone, variantId, delta) =>
                    setCardPrintQuantity(zone, selectedCard.number, variantId, delta)
                  }
                  onSetAllPrints={(variantId) =>
                    setAllCardPrints(selectedCard.number, variantId)
                  }
                  onAdjustCollection={(delta) =>
                    adjustCollection(selectedCard.number, selectedArtVariant.id, delta)
                  }
                  onOpenCard={() => openCardLightbox(selectedCard, selectedArtVariant)}
                  pulseIdFor={pulseIdFor}
                  readOnly={sharedPreviewLocked}
                />
              ) : (
                <EmptyInspectorPanel onClear={clearLibraryFilters} />
              )}
                </>
              )}
            </div>

            <div
              id="stats-panel"
              role={mobileTabsEnabled ? "tabpanel" : "region"}
              aria-labelledby={mobileTabsEnabled ? "stats-tab" : undefined}
              aria-label={mobileTabsEnabled ? undefined : "Deck stats"}
              tabIndex={-1}
              className={
                mobileView === "stats"
                  ? "grid min-w-0 max-w-full gap-4"
                  : "hidden min-w-0 max-w-full xl:grid xl:gap-4"
              }
            >
              {renderStatsPanel && (
                <>
              <CostPanel
                summary={costSummary}
                onMarkOwned={markDeckOwned}
                onOptimizePrints={optimizeDeckPrints}
                readOnly={sharedPreviewLocked}
              />

              <LegalityPanel notices={notices} onFixNotice={focusLegalityFix} />

              <SynergyPanel notices={synergyNotices} />

              <div className="xl:hidden">
                <CompositionPanel
                  typeCounts={typeCounts}
                  costCurve={costCurve}
                  mainTotal={mainTotal}
                />
              </div>
                </>
              )}
            </div>
          </div>

          <div
            id="deck-panel"
            role={mobileTabsEnabled ? "tabpanel" : "region"}
            aria-labelledby={mobileTabsEnabled ? "deck-tab" : undefined}
            aria-label={mobileTabsEnabled ? undefined : "Deck list"}
            tabIndex={-1}
            className={`min-w-0 max-w-full gap-4 xl:grid ${
              mobileView === "deck" ? "grid" : "hidden"
            }`}
          >
            {renderDeckPanel && (
              <>
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
              eagerImages={eagerDeckThumbnails}
              onBrowseLibrary={() => changeMobileView("library")}
              readOnly={sharedPreviewLocked}
              pulseIdFor={pulseIdFor}
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
              eagerImages={eagerDeckThumbnails}
              onBrowseLibrary={() => changeMobileView("library")}
              readOnly={sharedPreviewLocked}
              pulseIdFor={pulseIdFor}
              compact
            />

            <CompositionPanel
              typeCounts={typeCounts}
              costCurve={costCurve}
              mainTotal={mainTotal}
            />
              </>
            )}
          </div>
        </div>
      </section>
      <MobileCockpitNav
        activeView={mobileView}
        tabsEnabled={mobileTabsEnabled}
        mainTotal={mainTotal}
        resourceTotal={resourceTotal}
        deckColors={deckColors}
        isLegal={isLegal}
        pulseIdFor={pulseIdFor}
        onChange={changeMobileView}
      />
      </div>
      <ToastViewport
        toast={toast}
        modalOpen={isDialogOpen}
        onAction={restoreUndoDeck}
        onDismiss={dismissToast}
      />
      <MobileActionSheet
        open={mobileActionsOpen}
        deckName={deck.name}
        deckNameReadOnly={sharedPreviewLocked}
        readOnly={sharedPreviewLocked}
        readOnlyReason={sharedPreviewEditReason}
        copyState={copyState}
        canUndo={canUndo}
        onDeckNameChange={(name) => {
          if (blockSharedPreviewEdit()) return;
          setDeck((current) => ({ ...current, name }));
        }}
        onSample={() => runMobileAction(loadSampleDeck)}
        onNew={() => runMobileAction(startNewDeck)}
        onUndo={() => runMobileAction(restoreUndoDeck)}
        onArtDown={() => runMobileAction(() => stepDeckArt(-1))}
        onArtUp={() => runMobileAction(() => stepDeckArt(1))}
        onCopy={() =>
          runMobileAction(() => {
            void copyDeckList();
          })
        }
        onExport={() => runMobileAction(exportJson)}
        onSheet={() =>
          runMobileAction(() => {
            void exportDeckImage();
          })
        }
        onImport={() => runMobileAction(() => importInputRef.current?.click())}
        onPaste={() =>
          runMobileAction(() => {
            void pasteDeckList();
          })
        }
        onClose={() => setMobileActionsOpen(false)}
      />
      <FallbackPanelView
        panel={fallbackPanel}
        returnFocusElement={fallbackReturnFocusElement}
        onClose={closeFallbackPanel}
        onCopyContent={(content, label) => void copyFallbackContent(content, label)}
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
  deckColors,
  isStarterTemplate,
  selectedCard,
  issue,
  marketTotal,
}: {
  isLegal: boolean;
  sharedStatus: SharedStatus;
  deckName: string;
  deckColors: readonly CardColor[];
  isStarterTemplate: boolean;
  selectedCard: GundamCard | null;
  issue: Notice | null;
  marketTotal: number;
}) {
  const statusLabel =
    sharedStatus === "ready"
      ? "Shared"
      : sharedStatus === "loading"
        ? "Syncing"
        : sharedStatus === "unavailable"
          ? "Offline"
          : "Local";
  return (
    <div className="hud-strip mt-1 hidden overflow-hidden rounded-sm border border-[#2e8cff]/25 bg-[#07111d]/70 shadow-lg shadow-[#03111f]/30 backdrop-blur xl:block">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-1.5">
        <div className="flex items-center gap-2 text-[#8bdcff]">
          <Radar size={16} />
          <span className="font-display text-base font-black uppercase">
            Build Link
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
            {isLegal ? "Sortie Ready" : issue ? issueBadgeText(issue) : "Review Deck"}
          </span>
          <span className="rounded-sm border border-[#f6c542]/30 bg-[#f6c542]/10 px-2 py-1 text-[#fff2bd]">
            {deckName}
          </span>
          <DeckColorRail colors={deckColors} compact />
          {isStarterTemplate && (
            <span className="rounded-sm border border-[#8bdcff]/30 bg-[#1167d8]/12 px-2 py-1 text-[#d9ecff]">
              Starter Template
            </span>
          )}
          <span className="rounded-sm border border-[#a7b5c9]/20 bg-black/24 px-2 py-1 text-[#f7f7f2]/70">
            {selectedCard ? `Card ${selectedCard.number}` : "No card"}
          </span>
          <span className="rounded-sm border border-[#f6c542]/30 bg-black/24 px-2 py-1 text-[#fff2bd]">
            TCG Est. {formatMoney(marketTotal)}
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
    sharedStatus === "unavailable"
      ? "Shared Deck Not Found"
      : sharedStatus === "loading"
        ? "Loading Shared Deck"
        : "Shared Deck Preview";

  return (
    <section className={panelClass("shared-deck-banner overflow-hidden")}>
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
            <DeckColorRail colors={deckColors} />
            <span className="rounded-sm border border-[#28d17c]/30 bg-[#28d17c]/12 px-2 py-1 text-[#d9ffe9]">
              {formatMoney(artTotal)} prints
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden -space-x-3 sm:flex">
            {previewCards.map((card) => (
              <CardImage
                key={card.number}
                card={card}
                imageSize={600}
                srcSetSizes={[320, 480, 640]}
                sizes="3.5rem"
                alt=""
                className="card-image-surface preview-card h-20 w-14 rounded-sm border border-[#f7f7f2]/20 object-contain object-top shadow-xl shadow-black/40"
              />
            ))}
          </div>
          <button
            type="button"
            className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/40 bg-[#f6c542]/14 px-4 font-display text-lg font-black uppercase text-[#fff2bd] shadow-lg shadow-[#f6c542]/10 hover:bg-[#f6c542]/20"
            onClick={onClone}
            disabled={sharedStatus === "loading" || sharedStatus === "unavailable"}
          >
            <Download size={17} />
            Clone
          </button>
        </div>
      </div>
    </section>
  );
}

function colorName(color: CardColor) {
  return color === "-" ? "Colorless" : color;
}

function ColorChip({
  color,
  compact = false,
}: {
  color: CardColor;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border font-black uppercase ${colorChipClass(
        color,
      )} ${compact ? "px-1.5 py-1 text-[0.65rem] leading-none" : "px-2 py-1 text-xs leading-none"}`}
      title={colorName(color)}
      aria-label={`Color ${colorName(color)}`}
    >
      <span
        aria-hidden="true"
        className={`${compact ? "size-3" : "size-3.5"} shrink-0 rounded-full border`}
        style={colorSwatchStyle(color)}
      />
      {!compact && <span>{colorName(color)}</span>}
    </span>
  );
}

function DeckColorRail({
  colors,
  compact = false,
}: {
  colors: readonly CardColor[];
  compact?: boolean;
}) {
  const label = colors.length
    ? `Deck colors: ${colors.map(colorName).join(", ")}`
    : "Deck colors: none";

  if (!colors.length) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-sm border border-[#e31b23]/35 bg-[#e31b23]/12 font-black uppercase text-[#ffe3e3] ${
          compact ? "px-1.5 py-1 text-[0.65rem]" : "px-2 py-1 text-xs"
        }`}
        aria-label={label}
        title="No deck colors"
      >
        <span
          aria-hidden="true"
          className={`${compact ? "size-3" : "size-3.5"} rounded-full border border-[#ffe3e3]/80 bg-[#e31b23] shadow-[0_0_12px_rgba(227,27,35,0.42)]`}
        />
        No colors
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border border-[#a7b5c9]/18 bg-black/28 font-black uppercase text-[#f7f7f2]/78 ${
        compact ? "px-1.5 py-1 text-[0.65rem]" : "px-2 py-1 text-xs"
      }`}
      aria-label={label}
      title={colors.map(colorName).join(" / ")}
    >
      <span className="text-[#f7f7f2]/58">Colors</span>
      <span className="inline-flex items-center gap-1">
        {colors.map((color) => (
          <span
            key={color}
            aria-hidden="true"
            className={`${compact ? "size-3" : "size-3.5"} rounded-full border`}
            style={colorSwatchStyle(color)}
          />
        ))}
      </span>
      {!compact && <span>{colors.map(colorName).join(" / ")}</span>}
    </span>
  );
}

function StartBuildPanel({
  onSample,
  onImport,
  onBrowse,
}: {
  onSample: () => void;
  onImport: () => void;
  onBrowse: () => void;
}) {
  return (
    <section
      className={panelClass(
        "start-build-panel hero-surface grid gap-3 overflow-hidden p-3 sm:grid-cols-[1fr_auto]",
      )}
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(5,6,10,0.92), rgba(5,6,10,0.74)), url(${HUD_TEXTURE_IMAGE})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-display text-lg font-black uppercase text-[#f6c542]">
          <Radar size={17} />
          Start Build
        </div>
        <h2 className="mt-1 font-display text-2xl font-black uppercase leading-none text-[#f7f7f2] sm:text-3xl">
          Empty hangar ready
        </h2>
        <p className="mt-1 max-w-2xl text-base font-bold leading-6 text-[#f7f7f2]/68">
          No deck loaded.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:min-w-[24rem]">
        <button
          type="button"
          className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#8bdcff]/34 bg-[#1167d8]/12 px-3 font-display text-sm font-black uppercase text-[#d9ecff]"
          onClick={onBrowse}
        >
          <LayoutGrid size={15} />
          Browse
        </button>
        <button
          type="button"
          className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/38 bg-[#f6c542]/12 px-3 font-display text-sm font-black uppercase text-[#fff2bd]"
          onClick={onSample}
        >
          <ShieldCheck size={15} />
          Sample
        </button>
        <button
          type="button"
          className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 px-3 font-display text-sm font-black uppercase text-[#f7f7f2]"
          onClick={onImport}
        >
          <Upload size={15} />
          Import
        </button>
      </div>
    </section>
  );
}

function CatalogOnlyBanner({
  catalogCards,
  deckReadyCards,
  onDeckReady,
  onCatalogOnly,
}: {
  catalogCards: number;
  deckReadyCards: number;
  onDeckReady: () => void;
  onCatalogOnly: () => void;
}) {
  return (
    <div className="border-b border-[#f6c542]/18 bg-[#221807]/86 px-2.5 py-2 sm:px-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-display text-base font-black uppercase text-[#fff2bd]">
            <AlertTriangle size={16} />
            Market Catalog
          </div>
          <p className="mt-0.5 text-sm font-bold leading-5 text-[#f7f7f2]/72">
            {catalogCards} cards have TCGplayer market data but need official rules before deck building.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            className="interactive-control inline-flex h-11 min-h-11 items-center justify-center rounded-sm border border-[#8bdcff]/30 bg-[#1167d8]/12 px-3 font-display text-sm font-black uppercase text-[#d9ecff]"
            onClick={onDeckReady}
            disabled={deckReadyCards === 0}
          >
            Deck Ready {deckReadyCards}
          </button>
          <button
            type="button"
            className="interactive-control inline-flex h-11 min-h-11 items-center justify-center rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-3 font-display text-sm font-black uppercase text-[#fff2bd]"
            onClick={onCatalogOnly}
          >
            Catalog {catalogCards}
          </button>
        </div>
      </div>
    </div>
  );
}

function LegalityPanel({
  notices,
  onFixNotice,
}: {
  notices: Notice[];
  onFixNotice: (notice: Notice) => void;
}) {
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
              <div className="min-w-0">
                <span className="block text-base font-black">{notice.label}</span>
                <span className="block text-sm font-bold opacity-75">
                  {notice.detail}
                </span>
              </div>
              {notice.tone !== "good" && (
                <button
                  type="button"
                  className="interactive-control inline-flex h-11 shrink-0 items-center justify-center rounded-sm border border-current/30 bg-black/18 px-3 font-display text-sm font-black uppercase"
                  onClick={() => onFixNotice(notice)}
                >
                  Fix
                </button>
              )}
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
          <p className="sr-only">
            Cost curve:{" "}
            {costCurve
              .map((bucket) => `${bucket.count} cards at ${bucket.cost === 8 ? "8 or more" : bucket.cost} cost`)
              .join(", ")}
          </p>
          <div className="grid grid-cols-8 gap-1.5">
            {costCurve.map((bucket) => (
              <div key={bucket.cost} className="flex h-24 flex-col justify-end gap-1">
                <div
                  className="meter-fill rounded-sm bg-gradient-to-t from-[#e31b23] via-[#f6c542] to-[#f7f7f2] shadow-lg shadow-[#650b10]/30"
                  style={{
                    height: `${Math.max(8, (bucket.count / max) * 84)}px`,
                  }}
                  role="img"
                  aria-label={`${bucket.count} cards at ${
                    bucket.cost === 8 ? "8 or more" : bucket.cost
                  } cost`}
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
  tabsEnabled,
  mainTotal,
  resourceTotal,
  deckColors,
  isLegal,
  pulseIdFor,
  onChange,
}: {
  activeView: MobileView;
  tabsEnabled: boolean;
  mainTotal: number;
  resourceTotal: number;
  deckColors: readonly CardColor[];
  isLegal: boolean;
  pulseIdFor?: (key: string) => number | undefined;
  onChange: (view: MobileView, options?: MobileViewChangeOptions) => void;
}) {
  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = mobileViews.length - 1;
    const nextIndex =
      event.key === "ArrowRight"
        ? index === lastIndex
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? lastIndex
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextView = mobileViews[nextIndex];
    onChange(nextView.id);
    document.getElementById(`${nextView.id}-tab`)?.focus();
  }

  return (
    <nav
      className="mobile-cockpit-nav fixed inset-x-0 bottom-0 z-30 border-t border-[#8bdcff]/30 bg-[#05060a]/96 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1.5 shadow-[0_-18px_44px_rgba(0,0,0,0.72)] backdrop-blur-xl xl:hidden"
      aria-label="Mobile workspace views"
    >
      <div className="mobile-progress-strip mx-auto mb-1.5 grid max-w-lg grid-cols-4 gap-1">
        <span
          className="mobile-progress-chip quantity-readout rounded-sm border border-[#e31b23]/30 bg-[#e31b23]/10 px-1.5 py-0.5 text-center font-display text-[11px] font-black uppercase text-[#ffe3e3]"
          data-pulse={pulseIdFor?.("progress:main")}
        >
          Main {mainTotal}/{MAIN_TARGET}
          <i style={{ transform: `scaleX(${Math.min(1, mainTotal / MAIN_TARGET)})` }} />
        </span>
        <span
          className="mobile-progress-chip quantity-readout rounded-sm border border-[#2e8cff]/30 bg-[#1167d8]/12 px-1.5 py-0.5 text-center font-display text-[11px] font-black uppercase text-[#d9ecff]"
          data-pulse={pulseIdFor?.("progress:resource")}
        >
          Res {resourceTotal}/{RESOURCE_TARGET}
          <i style={{ transform: `scaleX(${Math.min(1, resourceTotal / RESOURCE_TARGET)})` }} />
        </span>
        <span className="rounded-sm border border-[#a7b5c9]/20 bg-[#f7f7f2]/8 px-1.5 py-0.5 text-center font-display text-[11px] font-black uppercase text-[#f7f7f2]/72">
          <span className="inline-flex h-full items-center justify-center gap-1" aria-label={`Deck colors ${deckColors.length ? deckColors.map(colorName).join(", ") : "none"}`}>
            {deckColors.length ? (
              deckColors.map((color) => (
                <span
                  key={color}
                  aria-hidden="true"
                  className="size-2.5 rounded-full border"
                  style={colorSwatchStyle(color)}
                />
              ))
            ) : (
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full border border-[#ffe3e3]/80 bg-[#e31b23] shadow-[0_0_10px_rgba(227,27,35,0.38)]"
              />
            )}
            {deckColors.length ? `Colors ${deckColors.length}` : "No colors"}
          </span>
        </span>
        <span
          className={`rounded-sm border px-1.5 py-0.5 text-center font-display text-[11px] font-black uppercase ${
            isLegal
              ? "border-[#28d17c]/35 bg-[#28d17c]/12 text-[#d9ffe9]"
              : "border-[#f6c542]/35 bg-[#f6c542]/12 text-[#fff2bd]"
          }`}
        >
          {isLegal ? "Legal" : "WIP"}
        </span>
      </div>
      <div
        className="mx-auto grid max-w-lg grid-cols-4 gap-1"
        role={tabsEnabled ? "tablist" : undefined}
        aria-label={tabsEnabled ? "Mobile workspace views" : undefined}
      >
        {mobileViews.map((view, index) => (
          <button
            id={`${view.id}-tab`}
            key={view.id}
            type="button"
            role={tabsEnabled ? "tab" : undefined}
            className={`cockpit-tab grid h-12 place-items-center rounded-sm border font-display text-xs font-black uppercase ${
              activeView === view.id
                ? "cockpit-tab-active border-[#8bdcff]/55 bg-[#1167d8]/28 text-[#d9ecff] shadow-lg shadow-[#1167d8]/22"
                : "border-[#a7b5c9]/18 bg-[#f7f7f2]/7 text-[#f7f7f2]/55"
            }`}
            onClick={() => onChange(view.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
            aria-label={`Show ${view.label}`}
            aria-controls={`${view.id}-panel`}
            aria-selected={tabsEnabled ? activeView === view.id : undefined}
            tabIndex={tabsEnabled && activeView !== view.id ? -1 : 0}
          >
            {view.icon}
            <span className="leading-none">{view.label}</span>
            {view.id === "deck" && (
              <span className="mobile-tab-badge" aria-hidden="true">
                {mainTotal}/{resourceTotal}
              </span>
            )}
            {view.id === "stats" && (
              <span className="mobile-tab-badge" aria-hidden="true">
                {isLegal ? "OK" : "WIP"}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}

function MobileActionSheet({
  open,
  deckName,
  deckNameReadOnly,
  readOnly,
  readOnlyReason,
  copyState,
  canUndo,
  onDeckNameChange,
  onSample,
  onNew,
  onUndo,
  onArtDown,
  onArtUp,
  onCopy,
  onExport,
  onSheet,
  onImport,
  onPaste,
  onClose,
}: {
  open: boolean;
  deckName: string;
  deckNameReadOnly: boolean;
  readOnly: boolean;
  readOnlyReason: string;
  copyState: string;
  canUndo: boolean;
  onDeckNameChange: (name: string) => void;
  onSample: () => void;
  onNew: () => void;
  onUndo: () => void;
  onArtDown: () => void;
  onArtUp: () => void;
  onCopy: () => void;
  onExport: () => void;
  onSheet: () => void;
  onImport: () => void;
  onPaste: () => void;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => {
      const closeButton = sheetRef.current?.querySelector<HTMLButtonElement>(
        'button[title="Close more deck actions"]',
      );
      const firstButton = sheetRef.current?.querySelector<HTMLButtonElement>("button");
      (closeButton ?? firstButton)?.focus();
    }, 0);

    return () => {
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
          className="mobile-action-backdrop fixed inset-0 z-[64] cursor-default bg-black/55 xl:hidden"
        onClick={onClose}
        aria-label="Close more deck actions"
        tabIndex={-1}
      />
      <div
        ref={sheetRef}
        id="mobile-action-sheet"
        className="mobile-action-sheet mx-auto grid max-w-lg grid-cols-2 gap-2 rounded-sm border border-[#8bdcff]/28 bg-[#07090d]/98 p-2 shadow-2xl shadow-black/70 backdrop-blur-xl xl:hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-action-sheet-title"
        onKeyDown={(event) => trapDialogFocus(event, sheetRef.current, onClose)}
      >
        <h2 id="mobile-action-sheet-title" className="sr-only">
          More deck actions
        </h2>
        {readOnly && (
          <div className="col-span-2 rounded-sm border border-[#f6c542]/30 bg-[#f6c542]/10 px-3 py-2 font-display text-sm font-black uppercase text-[#fff2bd]">
            Shared preview · clone to edit
          </div>
        )}
        <div className="col-span-2 grid grid-cols-[1fr_auto] items-start gap-2 rounded-sm border border-[#a7b5c9]/18 bg-[#f7f7f2]/[0.055] p-2">
          <label className="grid min-w-0 gap-1">
            <span className="font-display text-xs font-black uppercase text-[#8bdcff]">
              Deck name
            </span>
            <input
              value={deckName}
              onChange={(event) => onDeckNameChange(event.target.value)}
              readOnly={deckNameReadOnly}
              title={deckNameReadOnly ? "Clone this shared deck before renaming it" : undefined}
              className="control-field h-11 w-full rounded-sm border border-[#a7b5c9]/28 bg-[#f7f7f2]/10 px-3 text-base font-black text-[#f7f7f2] outline-none placeholder:text-[#f7f7f2]/40 focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15"
            />
          </label>
          <button
            type="button"
            title="Close more deck actions"
            aria-label="Close more deck actions"
            onClick={onClose}
            className="interactive-control grid size-11 place-items-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2] hover:border-[#f6c542]/45 hover:bg-[#f6c542]/12"
          >
            <X size={18} />
          </button>
        </div>
        {canUndo && (
          <ToolbarButton
            label="Undo"
            title="Restore previous deck state"
            onClick={onUndo}
            className="w-full"
          >
            <Undo2 size={16} />
          </ToolbarButton>
        )}
        <ToolbarButton
          label="Sample"
          title={readOnly ? readOnlyReason : "Load sample deck"}
          ariaLabel="Load sample deck"
          onClick={onSample}
          disabled={readOnly}
          className="w-full"
        >
          <ShieldCheck size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="New"
          title={readOnly ? readOnlyReason : "Start a new deck"}
          ariaLabel="Start a new deck"
          onClick={onNew}
          disabled={readOnly}
          className="w-full"
        >
          <RotateCcw size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Cheaper Prints"
          title={readOnly ? readOnlyReason : "Downgrade deck art budget"}
          ariaLabel="Downgrade deck art budget"
          onClick={onArtDown}
          disabled={readOnly}
          className="w-full"
        >
          <ChevronDown size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Fancier Prints"
          title={readOnly ? readOnlyReason : "Upgrade deck art budget"}
          ariaLabel="Upgrade deck art budget"
          onClick={onArtUp}
          disabled={readOnly}
          className="w-full"
        >
          <ChevronUp size={16} />
        </ToolbarButton>
        <ToolbarButton label={copyState} title="Copy deck list" onClick={onCopy} className="w-full">
          <Clipboard size={16} />
        </ToolbarButton>
        <ToolbarButton label="JSON Backup" title="Export backup JSON" onClick={onExport} className="w-full">
          <Download size={16} />
        </ToolbarButton>
        <ToolbarButton label="Deck Image" title="Export deck image" onClick={onSheet} className="w-full">
          <Layers size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Import"
          title={readOnly ? readOnlyReason : "Import JSON or text decklist"}
          ariaLabel="Import deck"
          onClick={onImport}
          disabled={readOnly}
          className="w-full"
        >
          <Upload size={16} />
        </ToolbarButton>
        <ToolbarButton
          label="Paste"
          title={readOnly ? readOnlyReason : "Paste decklist from clipboard"}
          ariaLabel="Paste decklist"
          onClick={onPaste}
          disabled={readOnly}
          className="w-full"
        >
          <Clipboard size={16} />
        </ToolbarButton>
      </div>
    </>
  );
}

function ToastViewport({
  toast,
  modalOpen,
  onAction,
  onDismiss,
}: {
  toast: ActionToast | null;
  modalOpen: boolean;
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
        className={`toast-shell flex w-full max-w-lg items-start gap-3 overflow-hidden rounded-sm border p-3 shadow-2xl backdrop-blur ${
          modalOpen ? "pointer-events-none" : "pointer-events-auto"
        } ${toast.actionLabel ? "" : "toast-shell-timed"} ${toneClass}`}
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
        {toast.actionLabel && !modalOpen && (
          <button
            type="button"
            className="interactive-control inline-flex min-h-11 shrink-0 items-center rounded-sm border border-current/35 bg-current/10 px-3 font-display text-base font-black uppercase"
            onClick={onAction}
          >
            {toast.actionLabel}
          </button>
        )}
        {!modalOpen && (
          <button
            type="button"
            className="interactive-control inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-current/25 bg-black/16"
            onClick={onDismiss}
            aria-label="Dismiss status"
            title="Dismiss status"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function FallbackPanelView({
  panel,
  returnFocusElement,
  onClose,
  onCopyContent,
}: {
  panel: FallbackPanel | null;
  returnFocusElement: HTMLElement | null;
  onClose: () => void;
  onCopyContent: (content: string, label: string) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!panel) return undefined;
    previousFocusRef.current =
      returnFocusElement ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    window.setTimeout(() => {
      if (panel.autoSelectContent) {
        textareaRef.current?.focus();
        textareaRef.current?.select();
        return;
      }
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [panel, returnFocusElement]);

  if (!panel) return null;

  const downloadHref = panel.downloadName
    ? `data:text/plain;charset=utf-8,${encodeURIComponent(panel.content)}`
    : "";
  const csvDownloadHref =
    panel.csvContent && panel.csvDownloadName
      ? `data:text/csv;charset=utf-8,${encodeURIComponent(panel.csvContent)}`
      : "";
  const hasTcgEntries = Boolean(panel.buyEntries?.length);

  return (
    <div
      className="fallback-panel-overlay fixed inset-0 z-40 grid place-items-end bg-black/42 px-3 pb-24 pt-3 backdrop-blur-sm xl:place-items-center xl:pb-6 xl:pt-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fallback-panel-title"
      onKeyDown={(event) => trapDialogFocus(event, dialogRef.current, onClose)}
    >
      <section
        ref={dialogRef}
        className={panelClass(
          `fallback-panel-shell flex w-full flex-col overflow-hidden ${
            hasTcgEntries ? "max-w-4xl" : "max-w-2xl"
          }`,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#a7b5c9]/20 p-3">
          <div className="min-w-0">
            <h2
              id="fallback-panel-title"
              className="font-display text-2xl font-black uppercase text-[#f7f7f2]"
            >
              {panel.title}
            </h2>
            <p className="mt-1 text-sm font-bold leading-5 text-[#f7f7f2]/65">
              {panel.detail}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="interactive-control inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2]"
            onClick={onClose}
            aria-label="Close fallback panel"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="fallback-panel-body grid min-h-0 gap-3 overflow-auto p-3">
          {hasTcgEntries && (
            <ul className="grid gap-2" aria-label="Selected TCG print rows">
              {panel.buyEntries?.map((entry) => {
                const priceSummary = printPriceSummary(entry.card, entry.variant);
                const actionLabel = tcgplayerActionLabel(entry.card, entry.variant);
                return (
                  <li
                    key={`${entry.card.number}-${entry.variant.id}`}
                    className={`mecha-row interactive-row grid gap-2 rounded-sm border border-[#a7b5c9]/18 bg-[#f7f7f2]/[0.045] p-2 shadow-lg shadow-black/10 sm:grid-cols-[4.25rem_minmax(0,1fr)_auto] ${colorAccentClass(
                      entry.card.color,
                    )}`}
                  >
                    <CardThumb
                      card={entry.card}
                      artVariant={entry.variant}
                      size="sm"
                      badge={`${entry.openQuantity}`}
                      eager
                      openLabel={`Open ${entry.card.name} ${artDisplayLabel(entry.variant)}`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-sm bg-[#f7f7f2] px-1.5 py-0.5 text-xs font-black leading-none text-black">
                          {printDisplayId(entry.variant)}
                        </span>
                        <ColorChip color={entry.card.color} />
                      </div>
                      <h3 className="mt-1 truncate font-display text-xl font-black uppercase leading-tight text-[#f7f7f2]">
                        {entry.card.name}
                      </h3>
                      <p className="text-sm font-bold leading-5 text-[#f7f7f2]/66">
                        Open {entry.openQuantity} · deck {entry.quantity} · owned {entry.owned} · {priceSummary.full} each · {formatMoney(entry.totalCost)} total
                      </p>
                    </div>
                    <a
                      href={tcgplayerUrl(entry.card, entry.variant)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-3 font-display text-base font-black uppercase text-[#fff2bd] sm:self-center"
                      aria-label={`${actionLabel} for ${entry.card.name}, ${artDisplayLabel(
                        entry.variant,
                      )}, ${entry.openQuantity} open copies`}
                    >
                      <ShoppingCart size={15} />
                      TCG
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <textarea
            ref={textareaRef}
            readOnly
            value={panel.content}
            aria-label={`${panel.title} content`}
            onFocus={(event) => event.currentTarget.select()}
            className="fallback-panel-textarea control-field min-h-64 w-full resize-y rounded-sm border border-[#8bdcff]/24 bg-black/42 p-3 font-mono text-sm font-bold leading-6 text-[#f7f7f2] outline-none focus:border-[#f6c542]"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {panel.copyLabel && (
              <button
                type="button"
                onClick={() => onCopyContent(panel.content, panel.title)}
                className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 font-display text-base font-black uppercase text-[#fff2bd]"
              >
                <Clipboard size={15} />
                {panel.copyLabel}
              </button>
            )}
            {panel.href && (
              <a
                href={panel.href}
                target="_blank"
                rel="noopener noreferrer"
                className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 font-display text-base font-black uppercase text-[#fff2bd]"
              >
                <Share2 size={15} />
                Open Link
              </a>
            )}
            {downloadHref && panel.downloadName && (
              <a
                href={downloadHref}
                download={panel.downloadName}
                className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#8bdcff]/30 bg-[#1167d8]/12 font-display text-base font-black uppercase text-[#d9ecff]"
              >
                <Download size={15} />
                Download TXT
              </a>
            )}
            {csvDownloadHref && panel.csvDownloadName && (
              <a
                href={csvDownloadHref}
                download={panel.csvDownloadName}
                className="interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#8bdcff]/30 bg-[#1167d8]/12 font-display text-base font-black uppercase text-[#d9ecff]"
              >
                <Download size={15} />
                Price CSV
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const lightboxCardNumber = item?.card.number;

  useEffect(() => {
    if (!lightboxCardNumber) return undefined;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
      previousFocusRef.current = null;
    };
  }, [lightboxCardNumber]);

  if (!item) return null;

  const { card } = item;
  const variants = cardArtVariants(card);
  const artVariant =
    variants.find((variant) => variant.id === item.artVariant.id) ?? item.artVariant;
  const variantIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.id === artVariant.id),
  );
  const hasAltPrints = variants.length > 1;
  const sourceLabel = priceSourceLabel(card, artVariant);
  const tcgplayerLabel = tcgplayerActionLabel(card, artVariant);
  const selectVariant = (variant: CardArtVariant) => {
    onVariantChange(variant);
    window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  };
  const cycleVariant = (delta: number) => {
    if (!hasAltPrints) return;
    const nextIndex = (variantIndex + delta + variants.length) % variants.length;
    selectVariant(variants[nextIndex]);
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[70] bg-[#020305]/88 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-lightbox-title"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          cycleVariant(event.key === "ArrowLeft" ? -1 : 1);
          return;
        }
        trapDialogFocus(event, dialogRef.current, onClose);
      }}
    >
      <div ref={scrollRef} className="card-lightbox h-full overflow-y-auto px-3 py-4 sm:px-5 sm:py-6">
        <div
          className="mx-auto grid min-h-full w-full max-w-6xl content-center gap-3"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="lightbox-header sticky left-0 right-0 top-0 z-20 flex max-w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-sm border border-[#a7b5c9]/18 bg-[#05070c]/95 p-2 shadow-2xl shadow-black/45 backdrop-blur">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap gap-1.5">
                <span className="rounded-sm bg-[#f7f7f2] px-2 py-1 text-sm font-black text-black">
                  {printDisplayId(artVariant)}
                </span>
              </div>
              <h2
                id="card-lightbox-title"
                className="mt-1 truncate font-display text-lg font-black uppercase text-[#f7f7f2] sm:text-2xl"
              >
                {card.name}
              </h2>
              <p className="truncate text-sm font-bold text-[#f7f7f2]/58">
                {card.number} · {card.set}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="lightbox-close interactive-control inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-[#a7b5c9]/28 bg-[#05070c]/94 text-[#f7f7f2] shadow-xl shadow-black/45"
              onClick={onClose}
              aria-label="Close card view"
              title="Close"
            >
              <X size={19} />
            </button>
          </div>
        <section
          className="lightbox-shell relative grid w-full gap-3 rounded-sm border border-[#8bdcff]/34 bg-[#05070c]/96 p-3 shadow-2xl shadow-black/70 lg:grid-cols-[minmax(280px,0.9fr)_minmax(320px,0.68fr)] lg:p-4"
        >
          <div className="grid min-w-0 gap-3">
            <div
              className="lightbox-card-stage scan-frame relative grid place-items-center overflow-hidden rounded-sm border border-[#8bdcff]/38 bg-black/88 p-2 shadow-2xl shadow-black/60"
              onPointerDown={(event) => {
                pointerStartXRef.current = event.clientX;
              }}
              onPointerUp={(event) => {
                const startX = pointerStartXRef.current;
                pointerStartXRef.current = null;
                if (startX === null) return;
                const deltaX = event.clientX - startX;
                if (Math.abs(deltaX) > 54) {
                  cycleVariant(deltaX > 0 ? -1 : 1);
                }
              }}
              onPointerCancel={() => {
                pointerStartXRef.current = null;
              }}
            >
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#05070c] font-display text-lg font-black uppercase text-[#8bdcff]/48">
                Loading card image
              </div>
              {hasAltPrints && (
                <>
                  <button
                    type="button"
                    className="lightbox-variant-nav lightbox-variant-prev interactive-control absolute left-2 top-1/2 z-[60] grid size-11 -translate-y-1/2 place-items-center rounded-sm border border-[#8bdcff]/34 bg-[#05070c]/82 text-[#d9ecff] shadow-xl shadow-black/45"
                    onClick={(event) => {
                      event.stopPropagation();
                      cycleVariant(-1);
                    }}
                    aria-label="Previous card print"
                    title="Previous print"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    className="lightbox-variant-nav lightbox-variant-next interactive-control absolute right-2 top-1/2 z-[60] grid size-11 -translate-y-1/2 place-items-center rounded-sm border border-[#8bdcff]/34 bg-[#05070c]/82 text-[#d9ecff] shadow-xl shadow-black/45"
                    onClick={(event) => {
                      event.stopPropagation();
                      cycleVariant(1);
                    }}
                    aria-label="Next card print"
                    title="Next print"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
              <CardImage
                card={card}
                artVariant={artVariant}
                imageSize={2000}
                srcSetSizes={[640, 1000, 1500]}
                sizes="(min-width: 1024px) 58vw, 94vw"
                alt={`${card.name} ${artDisplayLabel(artVariant)} card`}
                className="card-image-surface relative z-10 mx-auto max-h-[58vh] max-w-full object-contain object-top lg:max-h-[66vh]"
                eager
              />
            </div>

            {hasAltPrints && (
              <div className="grid gap-2 rounded-sm border border-[#a7b5c9]/16 bg-black/28 p-2">
                <div className="flex items-center gap-2 font-display text-base font-black uppercase text-[#f7f7f2]/74">
                  <Sparkles size={15} className="text-[#f6c542]" />
                  Parallel Prints
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
                      onClick={() => {
                        selectVariant(variant);
                      }}
                      aria-label={`View ${artDisplayLabel(variant)} of ${card.name}`}
                      aria-pressed={variant.id === artVariant.id}
                      title={`${artDisplayLabel(variant)} · ${formatPrintMoney(card, variant)}`}
                    >
                      <CardImage
                        card={card}
                        artVariant={variant}
                        imageSize={600}
                        srcSetSizes={[320, 480, 640]}
                        sizes="4.5rem"
                        alt=""
                        className="card-image-surface aspect-[5/7] w-full object-contain object-top"
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
                  <ColorChip color={card.color} />
                  <span className="rounded-sm border border-[#f7f7f2]/14 bg-[#f7f7f2]/9 px-2 py-1 text-sm font-black text-[#f7f7f2]">
                    {card.type}
                  </span>
                  <span className="rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-2 py-1 text-sm font-black text-[#fff2bd]">
                    {formatPrintMoney(card, artVariant)}
                  </span>
                </div>
                <h2
                  className="mt-3 font-display text-3xl font-black uppercase leading-none text-[#f7f7f2] sm:text-4xl"
                >
                  {card.name}
                </h2>
                <p className="mt-2 text-base font-bold text-[#f7f7f2]/64">
                  {card.set} · {sourceLabel}
                </p>
              </div>
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
              title={`${tcgplayerLabel} for ${card.name} ${artDisplayLabel(artVariant)}`}
            >
              <ShoppingCart size={17} />
              {tcgplayerLabel}
            </a>
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}

function CostPanel({
  summary,
  onMarkOwned,
  onOptimizePrints,
  readOnly = false,
}: {
  summary: CostSummary;
  onMarkOwned: () => void;
  onOptimizePrints: (mode: "standard" | "cheapest" | "owned" | "bling") => void;
  readOnly?: boolean;
}) {
  return (
    <section className={panelClass()}>
      <PanelTitle icon={<BadgeDollarSign size={18} />} title="Market Cost" />
      <div className="grid gap-2 p-3">
        <CostRow label="Base prints" value={formatMoney(summary.baseTotal)} />
        <CostRow label="Alt-art premium" value={formatMoney(summary.altPremium)} />
        <CostRow label="Owned prints" value={formatMoney(summary.ownedValue)} />
        <CostRow label="TCG print total" value={formatMoney(summary.artTotal)} hot />
        <div className="mt-1 grid grid-cols-3 gap-2 text-center">
          <Spec label="Deck" value={`${summary.deckCopies}`} />
          <Spec label="Owned" value={`${summary.ownedCopies}`} />
          <Spec label="Open" value={`${summary.unownedCopies}`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["standard", "Standard"],
            ["cheapest", "Cheapest"],
            ["owned", "Owned First"],
            ["bling", "Full Bling"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`interactive-control inline-flex h-11 items-center justify-center rounded-sm border px-2 font-display text-sm font-black uppercase ${
                readOnly
                  ? "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/40"
                  : "border-[#8bdcff]/28 bg-[#1167d8]/10 text-[#d9ecff] hover:bg-[#1167d8]/16"
              }`}
              onClick={() =>
                onOptimizePrints(mode as "standard" | "cheapest" | "owned" | "bling")
              }
              disabled={readOnly}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`interactive-control mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-sm border font-display text-base font-black uppercase ${
            readOnly
              ? "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/40"
              : "border-[#28d17c]/35 bg-[#28d17c]/12 text-[#d9ffe9] hover:bg-[#28d17c]/18"
          }`}
          onClick={onMarkOwned}
          disabled={readOnly}
          title={readOnly ? "Clone this shared deck before editing ownership" : "Mark deck prints owned"}
        >
          <WalletCards size={16} />
          Mark Deck Prints Owned
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

function StatusBadge({ isLegal, issue }: { isLegal: boolean; issue: Notice | null }) {
  const label = isLegal ? "Legal" : issue ? issueBadgeText(issue) : "Review Deck";
  const ariaLabel = isLegal
    ? "Deck legal"
    : issue
      ? `Deck issue: ${issueDetailText(issue)}`
      : "Deck issue: review deck";

  return (
    <span
      aria-label={ariaLabel}
      className={`status-badge inline-flex h-8 w-fit items-center gap-2 rounded-sm border px-2.5 font-display text-base font-black uppercase ${
        isLegal
          ? "status-badge-legal border-[#2e8cff]/45 bg-[#1167d8]/18 text-[#d9ecff]"
          : "status-badge-alert border-[#e31b23]/50 bg-[#e31b23]/18 text-[#ffe3e3]"
      }`}
    >
      {isLegal ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <span>{label}</span>
    </span>
  );
}

function ToolbarButton({
  children,
  label,
  mobileLabel,
  title,
  ariaLabel,
  onClick,
  disabled = false,
  ariaExpanded,
  ariaControls,
  showDesktopLabel = false,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  mobileLabel?: string;
  title: string;
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  showDesktopLabel?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`interactive-control inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-sm border px-2 font-display text-base font-black uppercase shadow-sm sm:gap-2 sm:px-3 sm:text-lg ${
        showDesktopLabel ? "xl:px-3" : "xl:px-0"
      } ${className} ${
        disabled
          ? "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
          : "border-[#a7b5c9]/25 bg-[#f7f7f2]/9 text-[#f7f7f2] hover:border-[#f6c542]/45 hover:bg-[#f6c542]/12"
      }`}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title ?? label}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      disabled={disabled}
    >
      {children}
      <span
        aria-hidden="true"
        className={`inline whitespace-nowrap ${
          showDesktopLabel ? "xl:inline" : "xl:hidden"
        }`}
      >
        <span className="sm:hidden">{mobileLabel ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
    </button>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="panel-title flex items-center gap-2 border-b border-[#a7b5c9]/20 p-3 text-[#f6c542]">
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
  ariaLabel,
  value,
  values,
  onChange,
  hideLabel = false,
}: {
  label: string;
  ariaLabel?: string;
  value: T;
  values: readonly T[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  return (
    <label className="filter-cell block min-w-[8.5rem] shrink-0 md:min-w-0">
      <span className={hideLabel ? "sr-only" : "font-display text-xs font-black uppercase text-[#8bdcff]"}>
        {label}
      </span>
      <select
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={`control-field h-11 w-full rounded-sm border border-[#a7b5c9]/22 bg-[#11141b] px-3 text-base font-bold text-[#f7f7f2] outline-none focus:border-[#f6c542] focus:ring-4 focus:ring-[#f6c542]/15 ${
          hideLabel ? "" : "mt-1"
        }`}
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
  pulseId,
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
  pulseId?: number;
  compact?: boolean;
}) {
  const decrementRepeat = usePressRepeat(onDecrement, decrementDisabled);
  const incrementRepeat = usePressRepeat(onIncrement, incrementDisabled);
  const toneClass =
    tone === "main"
      ? "border-[#e31b23]/32 bg-[#e31b23]/10 text-[#ffe3e3]"
      : "border-[#2e8cff]/32 bg-[#1167d8]/12 text-[#d9ecff]";
  const buttonClass = (disabled: boolean) =>
    `interactive-control inline-flex size-11 items-center justify-center rounded-sm border ${
      disabled
        ? "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/40"
        : "border-current/30 bg-black/22 text-current hover:bg-current/10"
    }`;
  const decrementLabel =
    decrementDisabled && decrementReason
      ? `${decrementReason} for ${label}`
      : `Remove one ${label} copy`;
  const incrementLabel =
    incrementDisabled && incrementReason
      ? `${incrementReason} for ${label}`
      : `Add one ${label} copy`;
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
            ? "grid-cols-[minmax(1.8rem,1fr)_2.75rem_2.75rem_2.75rem]"
            : "grid-cols-[minmax(4.5rem,1fr)_2.75rem_3rem_2.75rem]"
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
          title={decrementLabel}
          aria-label={decrementLabel}
          onClick={(event) => {
            event.stopPropagation();
            onDecrement();
          }}
          {...decrementRepeat}
        >
          <Minus size={compact ? 13 : 15} />
        </button>
        <output
          className={`grid place-items-center rounded-sm border border-current/22 bg-black/28 font-display font-black ${
            compact ? "h-11 text-base" : "h-11 text-xl"
          }`}
          data-pulse={pulseId}
          aria-label={`${label} quantity`}
        >
          {quantity}
        </output>
        <button
          type="button"
          className={buttonClass(incrementDisabled)}
          disabled={incrementDisabled}
          title={incrementLabel}
          aria-label={incrementLabel}
          onClick={(event) => {
            event.stopPropagation();
            onIncrement();
          }}
          {...incrementRepeat}
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
  pulseId,
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
  pulseId?: number;
}) {
  const decrementRepeat = usePressRepeat(onDecrement, decrementDisabled);
  const incrementRepeat = usePressRepeat(onIncrement, incrementDisabled);
  const toneClass =
    tone === "main"
      ? "border-[#e31b23]/36 bg-[#2b0710]/72 text-[#ffe3e3]"
      : "border-[#2e8cff]/36 bg-[#06142a]/72 text-[#d9ecff]";
  const controlClass = (disabled: boolean) =>
    `interactive-control grid h-11 place-items-center ${
      disabled
        ? "cursor-not-allowed bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/40"
        : "bg-black/22 text-current hover:bg-current/10"
    }`;
  const disabledIncrementLabel = incrementReason?.toLowerCase().includes("rules")
    ? "Rules"
    : incrementReason?.toLowerCase().includes("max")
      ? "Max"
      : "Locked";

  return (
    <div
      className={`mini-stepper grid h-11 ${
        dense
          ? "grid-cols-[2.75rem_minmax(2rem,1fr)_2.75rem]"
          : "grid-cols-[2.75rem_minmax(2.2rem,1fr)_2.75rem]"
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
        {...decrementRepeat}
      >
        <Minus size={dense ? 13 : 14} />
      </button>
      <output
        className={`grid h-11 place-items-center border-x-0 bg-[#f7f7f2]/6 px-1 font-display font-black ${
          dense ? "text-base" : "text-lg"
        }`}
        data-pulse={pulseId}
        aria-label={`${label} quantity`}
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
        {...incrementRepeat}
      >
        {incrementDisabled ? (
          <span className="font-display text-xs font-black uppercase leading-none">
            {disabledIncrementLabel}
          </span>
        ) : (
          <Plus size={dense ? 13 : 14} />
        )}
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
  readOnly = false,
  compact = false,
  eagerImages = false,
  onAdjust,
  onRemove,
  onOpenCard,
  onBrowseLibrary,
  pulseIdFor,
}: {
  title: string;
  total: number;
  target: number;
  entries: DeckEntry[];
  deck: DeckState;
  zone: "main" | "resource";
  readOnly?: boolean;
  compact?: boolean;
  eagerImages?: boolean;
  onAdjust: (zone: "main" | "resource", number: string, delta: number) => void;
  onRemove: (zone: "main" | "resource", number: string) => void;
  onOpenCard: (card: GundamCard, artVariant: CardArtVariant) => void;
  onBrowseLibrary?: () => void;
  pulseIdFor?: (key: string) => number | undefined;
}) {
  const deckPulseId = pulseIdFor?.(`progress:${zone}`);
  return (
    <section className={panelClass()}>
      <div className="flex items-center justify-between gap-3 border-b border-[#a7b5c9]/20 p-3">
        <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">{title}</h2>
        <span
          className="quantity-readout rounded-sm border border-[#f6c542]/25 bg-[#f6c542]/12 px-2.5 py-1 text-sm font-black text-[#fff2bd]"
          data-pulse={deckPulseId}
        >
          {total}/{target}
        </span>
      </div>
      <div className="deck-progress-rail mx-3 mt-2 h-1.5 overflow-hidden rounded-full bg-[#f7f7f2]/8" aria-hidden="true">
        <span
          className={`block h-full origin-left rounded-full ${
            zone === "main" ? "bg-[#e31b23]" : "bg-[#2e8cff]"
          }`}
          style={{ transform: `scaleX(${Math.min(1, total / target)})` }}
        />
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
          <div className="empty-deck-bay flex h-32 flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-[#8bdcff]/22 bg-[#06111d]/32 text-center">
            <span className="font-display text-lg font-black uppercase text-[#f7f7f2]/68">
              {zoneLabel(zone)} Bay Empty
            </span>
            <span className="text-sm font-black text-[#8bdcff]/70">
              0/{target} occupied
            </span>
            {onBrowseLibrary && (
              <button
                type="button"
                className="interactive-control mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#8bdcff]/30 bg-[#1167d8]/12 px-3 font-display text-sm font-black uppercase text-[#d9ecff] xl:hidden"
                onClick={onBrowseLibrary}
              >
                <LayoutGrid size={14} />
                Library
              </button>
            )}
          </div>
        ) : (
          entries.map(({ card, quantity }, index) => {
            const printEntries = printEntriesForCard(deck, zone, card);
            const artVariant = printEntries[0]?.variant ?? getArtVariant(card, deck.art);
            const addConstraint = zoneAddConstraint(zone, card, quantity, deck);
            const tcgplayerLabel = tcgplayerActionLabel(card, artVariant);
            const rowPulseId = pulseIdFor?.(`${zone}:${card.number}`);
            return (
              <div
                key={card.number}
                className={`deck-entry mecha-row interactive-row rounded-sm border bg-[#f7f7f2]/[0.045] p-2 shadow-lg shadow-black/10 ${colorAccentClass(
                  card.color,
                )}`}
                data-pulse={rowPulseId}
              >
                <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2.5">
                  <CardThumb
                    card={card}
                    artVariant={artVariant}
                    onOpen={() => onOpenCard(card, artVariant)}
                    size="deck"
                    badge={`${quantity}`}
                    eager={eagerImages && index === 0}
                    openLabel={`Open large view of ${zoneLabel(zone)} deck card ${card.name} ${card.number}`}
                  />
                  <div className="grid min-w-0 content-start gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <ColorChip color={card.color} />
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
                      <p className="text-sm font-bold leading-5 text-[#f7f7f2]/66">
                        <span className="font-black text-[#f7f7f2]/66">{card.number}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{formatPrintMoney(card, artVariant)}</span>
                      </p>
                    </div>
                    <div className="deck-print-chips flex min-w-0 flex-wrap gap-1">
                      {printEntries.map((entry) => (
                        <span
                          key={entry.variant.id}
                          className="rounded-sm border border-[#a7b5c9]/18 bg-black/24 px-1.5 py-0.5 text-xs font-black text-[#f7f7f2]/68"
                        >
                          {entry.quantity} {artDisplayLabel(entry.variant)}
                        </span>
                      ))}
                    </div>
                    <div className="deck-card-actions grid grid-cols-[2.75rem_minmax(7rem,1fr)_2.75rem] gap-1.5 min-[380px]:grid-cols-[minmax(3.75rem,1fr)_7.75rem_2.75rem]">
                      <a
                        href={tcgplayerUrl(card, artVariant)}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="interactive-control inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-sm border border-[#f6c542]/34 bg-[#f6c542]/10 px-2 font-display text-base font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/16"
                        title={`${tcgplayerLabel} for ${card.name}`}
                        aria-label={`${tcgplayerLabel} for ${card.name}`}
                      >
                        <ShoppingCart size={15} />
                        <span className="deck-tcg-label">TCG</span>
                      </a>
                      <MiniQuantityControl
                        label={card.name}
                        quantity={quantity}
                        tone={zone}
                        incrementDisabled={readOnly || Boolean(addConstraint)}
                        decrementDisabled={readOnly || quantity <= 0}
                        incrementReason={readOnly ? "Clone to edit" : addConstraint}
                        decrementReason={
                          readOnly ? "Clone to edit" : `No ${zoneLabel(zone).toLowerCase()} copies`
                        }
                        pulseId={rowPulseId}
                        onIncrement={() => onAdjust(zone, card.number, 1)}
                        onDecrement={() => onAdjust(zone, card.number, -1)}
                      />
                      <IconButton
                        label={`Remove ${card.name}`}
                        disabled={readOnly}
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
  deck,
  artVariant,
  selected,
  mainQuantity,
  resourceQuantity,
  ownedQuantity,
  pulseId,
  readOnly = false,
  eagerImage = false,
  onSelect,
  onOpenCard,
  onAdjustMain,
  onAdjustResource,
}: {
  card: GundamCard;
  deck: DeckState;
  artVariant: CardArtVariant;
  selected: boolean;
  mainQuantity: number;
  resourceQuantity: number;
  ownedQuantity: number;
  pulseId?: number;
  readOnly?: boolean;
  eagerImage?: boolean;
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
    ? zoneAddConstraint(primaryZone, card, primaryQuantity, deck)
    : "No builder slot for this card type";
  const rulesPending =
    primaryZone === "main" && MAIN_TYPES.includes(card.type) && !hasDeckRulesData(card);
  const deckReady = isDeckReadyCard(card);
  const cardActionLabel = `${card.name} ${card.number}`;
  const priceSummary = printPriceSummary(card, artVariant);
  const tcgplayerLabel = tcgplayerActionLabel(card, artVariant);
  const onAdjustPrimary =
    primaryZone === "main"
      ? onAdjustMain
      : primaryZone === "resource"
        ? onAdjustResource
        : null;

  return (
    <article
      className={`library-result mecha-row interactive-row group overflow-hidden rounded-sm border bg-[#080b11]/96 p-2.5 shadow-sm shadow-black/12 transition duration-150 hover:border-[#8bdcff]/45 hover:bg-[#0d131d] ${colorAccentClass(
        card.color,
      )} ${selected ? "active-scan-card ring-2 ring-[#f6c542] ring-offset-2 ring-offset-[#05060a]" : ""}`}
      data-pulse={pulseId}
      tabIndex={0}
      onClick={(event) => {
        if (isInteractiveTarget(event.target)) return;
        onSelect();
      }}
      onDoubleClick={(event) => {
        if (isInteractiveTarget(event.target)) return;
        onOpenCard();
      }}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key === "Enter") {
          event.preventDefault();
          onOpenCard();
        } else if (event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-label={`${card.name} ${card.number} library row`}
    >
      <div className="library-card-body grid grid-cols-[7.25rem_minmax(0,1fr)] gap-2.5 min-[380px]:grid-cols-[8rem_minmax(0,1fr)] sm:grid-cols-[8.75rem_minmax(0,1fr)] xl:grid-cols-[8rem_minmax(0,1fr)] 2xl:grid-cols-[8.75rem_minmax(0,1fr)]">
        <button
          type="button"
          className="scan-frame interactive-control relative aspect-[5/7] w-full overflow-hidden rounded-sm border border-[#8bdcff]/28 bg-black text-left shadow-lg shadow-black/35"
          onClick={(event) => {
            event.stopPropagation();
            onOpenCard();
          }}
          aria-label={`Open large view of ${cardActionLabel}`}
          title={`Open large view of ${cardActionLabel}`}
        >
          <CardImage
            key={`${card.number}-${artVariant.id}-${eagerImage ? "eager" : "lazy"}`}
            card={card}
            artVariant={artVariant}
            imageSize={1000}
            srcSetSizes={[320, 480, 640]}
            sizes="(min-width: 1536px) 8.75rem, (min-width: 1280px) 8rem, (min-width: 640px) 8.75rem, (min-width: 380px) 8rem, 7.25rem"
            alt={`${card.name} card`}
            className="library-card-image card-image-surface h-full w-full object-contain object-top transition duration-200"
            eager={eagerImage}
          />
          {selected && (
            <span className="permet-scanline pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#8bdcff]/0 via-[#8bdcff]/28 to-[#8bdcff]/0" />
          )}
          {quantity > 0 && (
            <span
              className="quantity-readout absolute right-1 top-1 grid size-7 place-items-center rounded-sm border border-[#f6c542]/55 bg-[#05070c]/92 font-display text-base font-black leading-none text-[#fff2bd] shadow-lg shadow-black/30"
              data-pulse={pulseId}
            >
              {quantity}
            </span>
          )}
          <span className="pointer-events-none absolute bottom-1 right-1 grid size-7 place-items-center rounded-sm border border-[#8bdcff]/36 bg-black/70 text-[#d9ecff]">
            <Maximize2 size={14} />
          </span>
        </button>

        <div className="grid min-w-0 content-start gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5 text-xs font-black uppercase">
            <span className="rounded-sm bg-[#f7f7f2] px-1.5 py-0.5 leading-none text-black">
              {card.number}
            </span>
            <ColorChip color={card.color} />
            <span className="rounded-sm border border-[#f7f7f2]/12 bg-[#f7f7f2]/8 px-1.5 py-0.5 leading-none text-[#f7f7f2]/78">
              {card.type}
            </span>
            {artVariant.id !== "standard" && (
              <span className="rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-1.5 py-0.5 leading-none text-[#fff2bd]">
                {artDisplayLabel(artVariant)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-2 font-display text-xl font-black uppercase leading-tight text-[#f7f7f2] sm:text-2xl">
              {card.name}
            </h3>
            <p
              className="mt-1 min-w-0 text-sm font-bold text-[#f7f7f2]/68"
              title={priceSummary.full}
            >
              <span
                className="inline-flex rounded-sm border border-[#8bdcff]/22 bg-[#1167d8]/10 px-1.5 py-0.5 font-black leading-none text-[#d9ecff] min-[360px]:hidden"
                aria-label={priceSummary.full}
              >
                {priceSummary.amount}
              </span>
              <span className="hidden truncate min-[360px]:block">
                {priceSummary.full}
              </span>
            </p>
          </div>
          <p className="library-card-rules line-clamp-2 text-sm font-semibold leading-5 text-[#f7f7f2]/66">
            {card.text}
          </p>
          <div className="flex min-w-0 flex-wrap gap-1 text-xs font-black uppercase">
            {quantity > 0 && (
              <span className="rounded-sm border border-[#a7b5c9]/16 bg-[#f7f7f2]/7 px-1.5 py-0.5 text-[#f7f7f2]/62">
                Deck {quantity}
              </span>
            )}
            {ownedQuantity > 0 && (
              <span
                className="rounded-sm border border-[#28d17c]/24 bg-[#28d17c]/10 px-1.5 py-0.5 text-[#d9ffe9]"
                title={`${ownedQuantity} owned across any print`}
              >
                Any Owned {ownedQuantity}
              </span>
            )}
            {rulesPending && (
              <span
                className="rounded-sm border border-[#e31b23]/35 bg-[#e31b23]/12 px-1.5 py-0.5 text-[#ffe3e3]"
                title="This market-discovered card needs official color, level, and cost data before deck building."
              >
                Rules pending
              </span>
            )}
            {!deckReady && (
              <span
                className="rounded-sm border border-[#8bdcff]/24 bg-[#1167d8]/10 px-1.5 py-0.5 text-[#d9ecff]"
                title="Market catalog card. Add official rules data before deck building."
              >
                Catalog only
              </span>
            )}
          </div>
        </div>

        <div className="library-card-actions col-span-2 grid grid-cols-[minmax(7.5rem,1fr)_2.75rem_2.75rem_2.75rem] gap-1 min-[380px]:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_3.25rem] sm:col-span-1 sm:col-start-2 sm:grid-cols-[minmax(7.5rem,1fr)_2.75rem_2.75rem_3.4rem] sm:gap-1.5">
        {primaryZone && onAdjustPrimary ? (
          <MiniQuantityControl
            label={`${cardActionLabel} ${zoneLabel(primaryZone).toLowerCase()} copy`}
            quantity={primaryQuantity}
            tone={primaryZone}
            dense
            incrementDisabled={readOnly || Boolean(primaryConstraint)}
            decrementDisabled={readOnly || primaryQuantity <= 0}
            incrementReason={readOnly ? "Clone to edit" : primaryConstraint}
            decrementReason={readOnly ? "Clone to edit" : `No ${zoneLabel(primaryZone).toLowerCase()} copies`}
            pulseId={pulseId}
            onIncrement={() => onAdjustPrimary(1)}
            onDecrement={() => onAdjustPrimary(-1)}
          />
        ) : (
          <div className="grid h-11 place-items-center rounded-sm border border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] px-2">
            <div className="truncate font-display text-sm font-black uppercase text-[#f7f7f2]/58">
              {rulesPending ? "Rules" : "Locked"}
            </div>
          </div>
        )}
        <button
          type="button"
          className={`interactive-control inline-flex h-11 min-h-11 items-center justify-center rounded-sm border ${
            selected
              ? "border-[#f6c542]/55 bg-[#f6c542]/16 text-[#fff2bd]"
              : "border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2]/75 hover:border-[#f6c542]/35 hover:bg-[#f6c542]/10"
          }`}
          onClick={onSelect}
          aria-pressed={selected}
          title={`Select ${cardActionLabel}`}
          aria-label={`Select ${cardActionLabel}`}
        >
          <CheckCircle2 size={15} />
        </button>
        <button
          type="button"
          className="library-open-action interactive-control inline-flex h-11 min-h-11 items-center justify-center rounded-sm border border-[#8bdcff]/30 bg-[#8bdcff]/10 text-[#d9ecff] hover:bg-[#8bdcff]/16"
          onClick={(event) => {
            event.stopPropagation();
            onOpenCard();
          }}
          title={`Open ${cardActionLabel} from action row`}
          aria-label={`Open ${cardActionLabel} details from action row`}
        >
          <Maximize2 size={15} />
        </button>
        <a
          href={tcgplayerUrl(card, artVariant)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="interactive-control inline-flex h-11 min-h-11 items-center justify-center gap-0.5 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 font-display text-xs font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/18 sm:gap-1 sm:text-sm"
          onClick={(event) => event.stopPropagation()}
          title={`${tcgplayerLabel} for ${cardActionLabel}`}
          aria-label={`${tcgplayerLabel} for ${cardActionLabel}`}
        >
          <ShoppingCart size={15} />
          <span className="hidden min-[380px]:inline sm:inline">TCG</span>
        </a>
        </div>
      </div>
    </article>
  );
}

function EmptyInspectorPanel({ onClear }: { onClear: () => void }) {
  return (
    <section className={panelClass("overflow-hidden")}>
      <div className="grid min-h-72 place-items-center p-5 text-center">
        <div>
          <Search className="mx-auto text-[#8bdcff]/70" size={34} />
          <h2 className="mt-3 font-display text-2xl font-black uppercase text-[#f7f7f2]">
            No Card Selected
          </h2>
          <p className="mt-2 max-w-xs text-base font-bold leading-6 text-[#f7f7f2]/62">
            Clear a filter or broaden the search to bring the card inspector back online.
          </p>
          <button
            type="button"
            className="interactive-control mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-4 font-display text-base font-black uppercase text-[#fff2bd]"
            onClick={onClear}
          >
            <RotateCcw size={15} />
            Clear All
          </button>
        </div>
      </div>
    </section>
  );
}

function InspectorPanel({
  card,
  deck,
  artVariant,
  artVariants,
  deckQuantity,
  ownedQuantity,
  mainQuantity,
  resourceQuantity,
  readOnly = false,
  onAdjustMain,
  onAdjustResource,
  onStepArt,
  onAdjustPrintQuantity,
  onSetAllPrints,
  onAdjustCollection,
  onOpenCard,
  pulseIdFor,
}: {
  card: GundamCard;
  deck: DeckState;
  artVariant: CardArtVariant;
  artVariants: readonly CardArtVariant[];
  deckQuantity: number;
  ownedQuantity: number;
  mainQuantity: number;
  resourceQuantity: number;
  readOnly?: boolean;
  onAdjustMain: (delta: number) => void;
  onAdjustResource: (delta: number) => void;
  onStepArt: (delta: number) => void;
  onAdjustPrintQuantity: (zone: Zone, variantId: string, delta: number) => void;
  onSetAllPrints: (variantId: string) => void;
  onAdjustCollection: (delta: number) => void;
  onOpenCard: () => void;
  pulseIdFor?: (key: string) => number | undefined;
}) {
  const mainConstraint = zoneAddConstraint("main", card, mainQuantity, deck);
  const resourceConstraint = zoneAddConstraint("resource", card, resourceQuantity, deck);
  const canDowngradeArt = canShiftCardArt(deck, card, -1);
  const canUpgradeArt = canShiftCardArt(deck, card, 1);
  const tcgplayerLabel = tcgplayerActionLabel(card, artVariant);
  const artPulseId = pulseIdFor?.(`art:${card.number}`);
  const printControlRows = (["main", "resource"] as const).flatMap((zone) => {
    const targetQuantity = zone === "main" ? mainQuantity : resourceQuantity;
    if (targetQuantity <= 0) return [];
    const printMap =
      deck.prints[zone][card.number] ??
      normalizePrintQuantities(card.number, targetQuantity, null, deck.art[card.number]);
    return artVariants.map((variant) => ({
      zone,
      variant,
      quantity: printMap[variant.id] ?? 0,
      targetQuantity,
    }));
  });

  return (
      <section className={panelClass("overflow-hidden")}>
        <div className={`border-b border-[#a7b5c9]/20 p-3 ${colorAccentClass(card.color)}`}>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <button
              type="button"
              className="selected-card-scan scan-frame interactive-control relative shrink-0 overflow-hidden rounded-sm border border-[#8bdcff]/35 bg-black text-left shadow-2xl shadow-black/40"
              data-pulse={artPulseId}
              onClick={onOpenCard}
              aria-label={`Open large view of selected card ${card.name} ${card.number}`}
              title={`Open large view of selected card ${card.name} ${card.number}`}
          >
            <CardImage
              card={card}
              artVariant={artVariant}
              imageSize={1000}
              srcSetSizes={[320, 480, 640]}
              sizes="(min-width: 1536px) 11rem, (min-width: 1280px) 9.5rem, (min-width: 640px) 10rem, 8.6rem"
              alt={`${card.name} card`}
              className="card-image-surface h-full w-full object-contain object-top"
            />
            <span className="absolute inset-x-0 bottom-0 z-10 inline-flex h-7 items-center justify-center gap-1 bg-black/72 font-display text-sm font-black uppercase text-[#d9ecff]">
              <Maximize2 size={12} />
                View
              </span>
            </button>
            <div className="w-full min-w-0 text-center sm:text-left">
              <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                <span className="rounded-sm bg-[#f7f7f2] px-2 py-1 text-sm font-black text-black">
                  {card.number}
                </span>
              <ColorChip color={card.color} />
              <span className="rounded-sm border border-[#f7f7f2]/12 bg-[#f7f7f2]/10 px-2 py-1 text-sm font-black text-[#f7f7f2]">
                {card.type}
              </span>
              {artVariant.id !== "standard" && (
                <span className="rounded-sm border border-[#f6c542]/35 bg-[#f6c542]/12 px-2 py-1 text-sm font-black text-[#fff2bd]">
                  {artDisplayLabel(artVariant)}
                </span>
              )}
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
          incrementDisabled={readOnly || Boolean(mainConstraint)}
          decrementDisabled={readOnly || mainQuantity <= 0}
          incrementReason={readOnly ? "Clone to edit" : mainConstraint}
          decrementReason={readOnly ? "Clone to edit" : "No main copies"}
          onIncrement={() => onAdjustMain(1)}
          onDecrement={() => onAdjustMain(-1)}
          pulseId={pulseIdFor?.(`main:${card.number}`)}
        />
        <QuantityStepper
          label="Res"
          quantity={resourceQuantity}
          tone="resource"
          incrementDisabled={readOnly || Boolean(resourceConstraint)}
          decrementDisabled={readOnly || resourceQuantity <= 0}
          incrementReason={readOnly ? "Clone to edit" : resourceConstraint}
          decrementReason={readOnly ? "Clone to edit" : "No resource copies"}
          onIncrement={() => onAdjustResource(1)}
          onDecrement={() => onAdjustResource(-1)}
          pulseId={pulseIdFor?.(`resource:${card.number}`)}
        />
      </div>
      <div className="border-t border-[#a7b5c9]/20 p-3 xl:hidden">
        <p className="text-base font-semibold leading-6 text-[#f7f7f2]/86">{card.text}</p>
        <div className="mt-3 grid gap-1 text-sm font-bold text-[#f7f7f2]/55">
          <span className="truncate">{card.trait}</span>
          <span className="truncate">{card.link}</span>
          <span className="truncate">{card.source}</span>
        </div>
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
              className={`interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border px-3 font-display text-base font-black uppercase ${
                !readOnly && canDowngradeArt
                  ? "border-[#a7b5c9]/25 bg-[#f7f7f2]/8 text-[#f7f7f2] hover:border-[#f6c542]/45 hover:bg-[#f6c542]/12"
                  : "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
              }`}
              disabled={readOnly || !canDowngradeArt}
              onClick={() => onStepArt(-1)}
              title={readOnly ? "Clone to edit" : "Downgrade art cost"}
              aria-label={readOnly ? "Clone to edit" : "Downgrade art cost"}
            >
              <ChevronDown size={15} />
              Down
            </button>
            <button
              type="button"
              className={`interactive-control inline-flex h-11 items-center justify-center gap-2 rounded-sm border px-3 font-display text-base font-black uppercase ${
                !readOnly && canUpgradeArt
                  ? "border-[#f6c542]/40 bg-[#f6c542]/12 text-[#fff2bd] hover:bg-[#f6c542]/18"
                  : "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/28"
              }`}
              disabled={readOnly || !canUpgradeArt}
              onClick={() => onStepArt(1)}
              title={readOnly ? "Clone to edit" : "Upgrade art cost"}
              aria-label={readOnly ? "Clone to edit" : "Upgrade art cost"}
            >
              <ChevronUp size={15} />
              Up
            </button>
            <a
              href={tcgplayerUrl(card, artVariant)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="interactive-control col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-[#f6c542]/40 bg-[#f6c542]/12 px-3 font-display text-base font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/18 2xl:col-span-1"
              title={`${tcgplayerLabel} for ${card.name} ${artDisplayLabel(artVariant)}`}
              aria-label={`${tcgplayerLabel} for ${card.name} ${artDisplayLabel(artVariant)}`}
            >
              <ShoppingCart size={15} />
              TCG
            </a>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(3rem,1fr))] gap-1.5">
          {artVariants.map((variant) => (
            <button
              type="button"
              key={variant.id}
              className={`art-print-dot interactive-control h-3 rounded-sm border ${
                variant.id === artVariant.id ? "bg-[#f6c542]" : "bg-[#f7f7f2]/16"
              }`}
              data-pulse={variant.id === artVariant.id ? artPulseId : undefined}
              onClick={() => onSetAllPrints(variant.id)}
              disabled={readOnly}
              aria-pressed={variant.id === artVariant.id}
              aria-label={`Set selected card to ${artDisplayLabel(variant)} ${formatPrintMoney(card, variant)}`}
              title={`${artDisplayLabel(variant)} ${formatPrintMoney(card, variant)}`}
            />
          ))}
        </div>
        {printControlRows.length > 0 && (
          <div className="mt-3 grid gap-1.5 rounded-sm border border-[#a7b5c9]/16 bg-black/24 p-2">
            <div className="font-display text-sm font-black uppercase text-[#f7f7f2]/62">
              Print Quantities
            </div>
            {printControlRows.map(({ zone, variant, quantity, targetQuantity }) => {
              const printPulseId =
                pulseIdFor?.(`print:${zone}:${card.number}:${variant.id}`) ??
                (variant.id === artVariant.id ? artPulseId : undefined);
              return (
              <div
                key={`${zone}-${variant.id}`}
                className="grid grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_2.75rem_3.15rem] items-center gap-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-[#f7f7f2]">
                    {artDisplayLabel(variant)}
                  </div>
                  <div className="text-xs font-bold uppercase text-[#f7f7f2]/52">
                    {zoneLabel(zone)}
                  </div>
                </div>
                <button
                  type="button"
                  className="interactive-control inline-flex size-11 items-center justify-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2] disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={() => onAdjustPrintQuantity(zone, variant.id, -1)}
                  disabled={readOnly || quantity <= 0 || artVariants.length <= 1}
                  aria-label={`Decrease ${artDisplayLabel(variant)} ${zoneLabel(zone)} print quantity`}
                >
                  <Minus size={14} />
                </button>
                <output
                  className="quantity-readout print-quantity-output grid h-11 place-items-center rounded-sm border border-[#f6c542]/24 bg-[#f6c542]/10 font-display text-base font-black text-[#fff2bd]"
                  data-pulse={printPulseId}
                >
                  {quantity}
                </output>
                <button
                  type="button"
                  className="interactive-control inline-flex size-11 items-center justify-center rounded-sm border border-[#a7b5c9]/24 bg-[#f7f7f2]/8 text-[#f7f7f2] disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={() => onAdjustPrintQuantity(zone, variant.id, 1)}
                  disabled={readOnly || quantity >= targetQuantity || artVariants.length <= 1}
                  aria-label={`Increase ${artDisplayLabel(variant)} ${zoneLabel(zone)} print quantity`}
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="interactive-control inline-flex h-11 items-center justify-center rounded-sm border border-[#8bdcff]/28 bg-[#1167d8]/10 px-2 font-display text-xs font-black uppercase text-[#d9ecff] disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={() => onSetAllPrints(variant.id)}
                  disabled={readOnly || quantity === targetQuantity}
                >
                  All
                </button>
              </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-sm border border-[#a7b5c9]/16 bg-black/28 p-2">
          <div className="min-w-0">
            <div className="font-display text-base font-black uppercase text-[#f7f7f2]/65">
              Selected Print
            </div>
            <div className="text-base font-black text-[#f7f7f2]">
              Owned {ownedQuantity} / Deck {deckQuantity}
            </div>
            <div className="truncate text-sm font-bold text-[#f7f7f2]/55">
              {artDisplayLabel(artVariant)} collection
            </div>
          </div>
          <IconButton
            label="Remove owned selected print"
            disabled={readOnly || ownedQuantity <= 0}
            onClick={() => onAdjustCollection(-1)}
          >
            <Minus size={14} />
          </IconButton>
          <IconButton
            label="Add owned selected print"
            disabled={readOnly}
            onClick={() => onAdjustCollection(1)}
          >
            <Plus size={14} />
          </IconButton>
        </div>
      </div>
      <div className="hidden border-t border-[#a7b5c9]/20 p-3 xl:block">
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
  eager = false,
  openLabel,
}: {
  card: GundamCard;
  artVariant?: CardArtVariant;
  onOpen?: () => void;
  size?: "sm" | "deck";
  badge?: string;
  eager?: boolean;
  openLabel?: string;
}) {
  const sizeClass =
    size === "deck"
      ? "h-28 w-20"
      : "h-16 w-12";
  const thumbClass =
    `relative ${sizeClass} shrink-0 overflow-hidden rounded-sm border border-[#f7f7f2]/15 bg-black shadow-sm`;
  const cardOpenLabel = openLabel ?? `Open large view of ${card.name} ${card.number}`;
  const image = (
    <CardImage
      card={card}
      artVariant={artVariant}
      imageSize={size === "deck" ? 800 : 600}
      srcSetSizes={[320, 480, 640]}
      sizes={size === "deck" ? "5rem" : "3rem"}
      alt={`${card.name} card`}
      className="card-image-surface h-full w-full object-contain object-top"
      eager={eager}
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
        aria-label={cardOpenLabel}
        title={cardOpenLabel}
      >
        {image}
        {badge && (
          <span className="absolute right-1 top-1 grid size-7 place-items-center rounded-sm border border-[#f6c542]/55 bg-[#05070c]/92 font-display text-base font-black leading-none text-[#fff2bd] shadow-lg shadow-black/30">
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
        <span className="absolute right-1 top-1 grid size-7 place-items-center rounded-sm border border-[#f6c542]/55 bg-[#05070c]/92 font-display text-base font-black leading-none text-[#fff2bd] shadow-lg shadow-black/30">
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
      className={`interactive-control inline-flex size-11 items-center justify-center rounded-sm border ${
        disabled
          ? "cursor-not-allowed border-[#f7f7f2]/8 bg-[#f7f7f2]/[0.035] text-[#f7f7f2]/40"
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
      <div
        className="h-3 overflow-hidden rounded-full bg-[#f7f7f2]/8"
        role="meter"
        aria-label={`${type} cards: ${count} of ${mainTotal || MAIN_TARGET}; target ${target}`}
        aria-valuemin={0}
        aria-valuemax={mainTotal || MAIN_TARGET}
        aria-valuenow={count}
        aria-valuetext={`${count} cards, target ${target}`}
      >
        <div
          className="type-meter-fill h-full w-full rounded-full bg-gradient-to-r from-[#e31b23] via-[#f6c542] to-[#f7f7f2]"
          style={{ transform: `scaleX(${width / 100})` }}
        />
      </div>
    </div>
  );
}
