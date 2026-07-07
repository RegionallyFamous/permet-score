import {
  CARD_ART_VARIANTS,
  type CardArtVariant,
} from "./card-art-data";
import {
  CARD_POOL,
  type CardType,
  type GundamCard,
} from "./card-data";
import { TCGPLAYER_CARD_POOL } from "./tcgplayer-card-data";
import { TCGPLAYER_CARD_PRINTS } from "./tcgplayer-data";

export type QuantityMap = Record<string, number>;
export type ArtChoiceMap = Record<string, string>;
export type PrintChoiceMap = Record<string, QuantityMap>;
export type DeckPrints = Record<"main" | "resource", PrintChoiceMap>;

export type SharedDeckState = {
  name: string;
  main: QuantityMap;
  resource: QuantityMap;
  art: ArtChoiceMap;
  prints: DeckPrints;
};

const SHARE_CARD_POOL = [
  ...CARD_POOL,
  ...TCGPLAYER_CARD_POOL.filter(
    (card) => !CARD_POOL.some((curated) => curated.number === card.number),
  ),
];
const CARD_BY_NUMBER = new Map(SHARE_CARD_POOL.map((card) => [card.number, card]));
const CARD_ARTS_BY_NUMBER = CARD_ART_VARIANTS as Record<
  string,
  readonly CardArtVariant[]
>;
const MAIN_TARGET = 50;
const RESOURCE_TARGET = 10;
const MAX_MAIN_COPIES = 4;
const MAIN_TYPES: CardType[] = ["UNIT", "PILOT", "COMMAND", "BASE"];
const RESOURCE_TYPES: CardType[] = ["RESOURCE"];

function clampQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.floor(quantity));
}

function totalCards(quantities: QuantityMap) {
  return Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
}

function cleanQuantityMap(map: QuantityMap) {
  return Object.fromEntries(
    Object.entries(map).filter(([, quantity]) => quantity > 0),
  );
}

function cardArtVariants(card: GundamCard) {
  const standardVariant = {
    id: "standard",
    label: "Standard",
    image: `/card-images/${card.number}.webp`,
    tier: 0,
    officialId: card.number,
  };
  const localVariants = CARD_ARTS_BY_NUMBER[card.number] ?? [];
  const marketVariants = (TCGPLAYER_CARD_PRINTS[card.number] ?? []).map((print, index) => ({
    id: print.variantId,
    label: print.variantId === "standard" ? "Standard" : `Market Print ${index + 1}`,
    image: print.imageUrl ?? standardVariant.image,
    tier: index,
    officialId: print.officialId,
  }));
  const variants = [standardVariant, ...localVariants, ...marketVariants];
  return variants.filter(
    (variant, index) =>
      variants.findIndex((candidate) => candidate.id === variant.id) === index,
  );
}

function validArtId(card: GundamCard, artId: string) {
  return cardArtVariants(card).some((variant) => variant.id === artId);
}

function parseCost(card: GundamCard) {
  const cost = Number(card.cost);
  return Number.isFinite(cost) ? cost : null;
}

function hasRulesValue(value: string) {
  return Boolean(value && value.trim() !== "-");
}

function hasDeckRulesData(card: GundamCard) {
  if (card.type === "RESOURCE" || card.type === "EX RESOURCE") return true;
  if (!MAIN_TYPES.includes(card.type)) return false;
  return (
    hasRulesValue(card.color) &&
    hasRulesValue(card.level) &&
    parseCost(card) !== null
  );
}

function canCardEnterZone(zone: "main" | "resource", card: GundamCard) {
  return zone === "main"
    ? MAIN_TYPES.includes(card.type) && hasDeckRulesData(card)
    : RESOURCE_TYPES.includes(card.type);
}

function sanitizeQuantities(
  value: unknown,
  zone: "main" | "resource",
): QuantityMap {
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

function sanitizeArtChoices(value: unknown): ArtChoiceMap {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([number, artId]) => {
        if (typeof artId !== "string") return false;
        const card = CARD_BY_NUMBER.get(number);
        return Boolean(card && validArtId(card, artId));
      })
      .map(([number, artId]) => [number, artId as string]),
  );
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

export function sanitizeSharedDeck(value: unknown): SharedDeckState | null {
  if (!value || typeof value !== "object") return null;
  const maybeDeck = value as Partial<SharedDeckState>;
  const main = sanitizeQuantities(maybeDeck.main, "main");
  const resource = sanitizeQuantities(maybeDeck.resource, "resource");
  const art = sanitizeArtChoices(maybeDeck.art);

  if (totalCards(main) === 0 && totalCards(resource) === 0) return null;

  return {
    name:
      typeof maybeDeck.name === "string" && maybeDeck.name.trim()
        ? maybeDeck.name.trim().slice(0, 80)
        : "Shared Deck",
    main,
    resource,
    art,
    prints: sanitizePrints(maybeDeck.prints, main, resource, art),
  };
}
