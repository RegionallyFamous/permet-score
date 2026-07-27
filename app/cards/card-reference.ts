import { CARD_POOL } from "../card-pool";
import type { GundamCard } from "../card-data";

export function setCode(card: GundamCard) {
  return card.number.split("-")[0] || "other";
}

export function setSlug(set: string) {
  return set.toLowerCase();
}

export function cardSlug(card: GundamCard | string) {
  return (typeof card === "string" ? card : card.number).toLowerCase();
}

export function cardSort(a: GundamCard, b: GundamCard) {
  return a.number.localeCompare(b.number, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function groupedCards() {
  const groups = new Map<string, GundamCard[]>();
  [...CARD_POOL].sort(cardSort).forEach((card) => {
    const key = setCode(card);
    groups.set(key, [...(groups.get(key) ?? []), card]);
  });
  return [...groups.entries()];
}

export function cardsForSetSlug(slug: string) {
  const normalized = slug.toLowerCase();
  const entry = groupedCards().find(([set]) => setSlug(set) === normalized);
  return entry
    ? {
        set: entry[0],
        cards: entry[1],
      }
    : null;
}

export function cardForSlug(slug: string) {
  const normalized = slug.toLowerCase();
  return CARD_POOL.find((card) => cardSlug(card) === normalized) ?? null;
}
