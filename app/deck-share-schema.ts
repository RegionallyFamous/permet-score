import {
  DECK_VALIDATION_CARDS,
  type DeckValidationCard,
  type ValidationCardType,
} from "./deck-validation-data";

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

const MAIN_TARGET = 50;
const RESOURCE_TARGET = 10;
const MAX_MAIN_COPIES = 4;
const MAX_MAIN_COLORS = 2;
const MAIN_TYPES: ValidationCardType[] = ["UNIT", "PILOT", "COMMAND", "BASE"];
const RESOURCE_TYPES: ValidationCardType[] = ["RESOURCE"];

function clampQuantity(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function totalCards(quantities: QuantityMap) {
  return Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
}

function cleanQuantityMap(map: QuantityMap) {
  return Object.fromEntries(
    Object.entries(map).filter(([, quantity]) => quantity > 0),
  );
}

function cardArtIds(card: DeckValidationCard) {
  return card.artIds.length ? card.artIds : ["standard"];
}

function validArtId(card: DeckValidationCard, artId: string) {
  return cardArtIds(card).includes(artId);
}

function validationCard(number: string) {
  return DECK_VALIDATION_CARDS[number];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseCost(card: DeckValidationCard) {
  const cost = Number(card.cost);
  return Number.isFinite(cost) ? cost : null;
}

function hasRulesValue(value: string) {
  return Boolean(value && value.trim() !== "-");
}

function hasDeckRulesData(card: DeckValidationCard) {
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

function canCardEnterZone(zone: "main" | "resource", card: DeckValidationCard) {
  return zone === "main"
    ? MAIN_TYPES.includes(card.type) && hasDeckRulesData(card)
    : RESOURCE_TYPES.includes(card.type) && hasDeckRulesData(card);
}

function mainDeckColors(main: QuantityMap) {
  return new Set(
    Object.keys(main)
      .map((number) => validationCard(number)?.color)
      .filter((color): color is string => Boolean(color && color !== "-")),
  );
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
    const card = validationCard(number);
    if (!card || !canCardEnterZone(zone, card)) return;
    const safeQuantity = Math.min(clampQuantity(quantity), maxCopies, remaining);
    if (safeQuantity <= 0) return;
    next[number] = safeQuantity;
    remaining -= safeQuantity;
  });

  return next;
}

function validateQuantities(value: unknown, zone: "main" | "resource") {
  if (!isRecord(value)) return `${zone} deck must be an object.`;

  const maxCopies = zone === "main" ? MAX_MAIN_COPIES : RESOURCE_TARGET;
  const maxTotal = zone === "main" ? MAIN_TARGET : RESOURCE_TARGET;
  const quantities: QuantityMap = {};

  for (const [number, quantity] of Object.entries(value)) {
    const card = validationCard(number);
    if (!card || !canCardEnterZone(zone, card)) {
      return `${number} cannot be shared in the ${zone} zone.`;
    }

    if (
      typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return `${number} has an invalid ${zone} quantity.`;
    }

    if (quantity > maxCopies) {
      return `${number} exceeds the ${zone} copy limit.`;
    }

    quantities[number] = quantity;
  }

  if (totalCards(quantities) > maxTotal) {
    return `${zone} deck cannot contain more than ${maxTotal} cards.`;
  }

  return quantities;
}

function sanitizeArtChoices(
  value: unknown,
  allowedNumbers: ReadonlySet<string>,
): ArtChoiceMap {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([number, artId]) => {
        if (!allowedNumbers.has(number)) return false;
        if (typeof artId !== "string") return false;
        const card = validationCard(number);
        return Boolean(card && validArtId(card, artId));
      })
      .map(([number, artId]) => [number, artId as string]),
  );
}

function validateArtChoices(value: unknown, allowedNumbers: ReadonlySet<string>) {
  if (value === undefined) return null;
  if (!isRecord(value)) return "Art choices must be an object.";

  for (const [number, artId] of Object.entries(value)) {
    if (!allowedNumbers.has(number)) return `${number} has an orphan art choice.`;
    if (typeof artId !== "string") return `${number} has an invalid art choice.`;
    const card = validationCard(number);
    if (!card || !validArtId(card, artId)) {
      return `${number} has an unknown art choice.`;
    }
  }

  return null;
}

function normalizePrintQuantities(
  number: string,
  targetQuantity: number,
  rawValue: unknown,
  preferredArtId: string | undefined,
) {
  const card = validationCard(number);
  if (!card || targetQuantity <= 0) return {};

  const artIds = cardArtIds(card);
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
      ...artIds.filter((artId) => artId !== preferred).reverse(),
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

function validateZonePrints(
  value: unknown,
  zone: "main" | "resource",
  zoneQuantities: QuantityMap,
) {
  if (value === undefined) return null;
  if (!isRecord(value)) return `${zone} print choices must be an object.`;

  for (const [number, printMap] of Object.entries(value)) {
    const targetQuantity = zoneQuantities[number];
    if (!targetQuantity) return `${number} has orphan ${zone} print choices.`;
    const card = validationCard(number);
    if (!card) return `${number} has unknown ${zone} print choices.`;
    if (!isRecord(printMap)) return `${number} print choices must be an object.`;

    let printTotal = 0;
    for (const [artId, quantity] of Object.entries(printMap)) {
      if (!validArtId(card, artId)) return `${number} has an unknown print choice.`;
      if (
        typeof quantity !== "number" ||
        !Number.isFinite(quantity) ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return `${number} has an invalid print quantity.`;
      }
      printTotal += quantity;
    }

    if (printTotal > targetQuantity) {
      return `${number} print quantities exceed the ${zone} deck quantity.`;
    }
  }

  return null;
}

function validatePrints(value: unknown, main: QuantityMap, resource: QuantityMap) {
  if (value === undefined) return null;
  if (!isRecord(value)) return "Print choices must be an object.";

  const raw = value as Partial<DeckPrints>;
  return (
    validateZonePrints(raw.main, "main", main) ??
    validateZonePrints(raw.resource, "resource", resource)
  );
}

export function validateSharedDeckPayload(value: unknown): string | null {
  if (!isRecord(value)) return "Deck payload must be an object.";
  const maybeDeck = value as Partial<SharedDeckState>;
  const main = validateQuantities(maybeDeck.main, "main");
  if (typeof main === "string") return main;
  const resource = validateQuantities(maybeDeck.resource, "resource");
  if (typeof resource === "string") return resource;
  if (mainDeckColors(main).size > MAX_MAIN_COLORS) {
    return `Main deck cannot use more than ${MAX_MAIN_COLORS} colors.`;
  }
  if (totalCards(main) + totalCards(resource) === 0) {
    return "Shared deck must contain at least one card.";
  }

  const deckNumbers = new Set([...Object.keys(main), ...Object.keys(resource)]);
  return (
    validateArtChoices(maybeDeck.art, deckNumbers) ??
    validatePrints(maybeDeck.prints, main, resource)
  );
}

export function sanitizeSharedDeck(value: unknown): SharedDeckState | null {
  if (!value || typeof value !== "object") return null;
  const maybeDeck = value as Partial<SharedDeckState>;
  const main = sanitizeQuantities(maybeDeck.main, "main");
  const resource = sanitizeQuantities(maybeDeck.resource, "resource");
  const deckNumbers = new Set([...Object.keys(main), ...Object.keys(resource)]);
  const art = sanitizeArtChoices(maybeDeck.art, deckNumbers);

  if (totalCards(main) + totalCards(resource) === 0) {
    return null;
  }

  if (mainDeckColors(main).size > MAX_MAIN_COLORS) return null;

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
