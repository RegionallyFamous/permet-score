import {
  CARD_ART_VARIANTS,
  type CardArtVariant,
} from "./card-art-data.ts";
import {
  CARD_POOL as CURATED_CARD_POOL,
  type GundamCard,
} from "./card-data.ts";
import {
  OFFICIAL_CARD_ART_VARIANTS,
  OFFICIAL_CARD_POOL,
  OFFICIAL_RULES_LAST_SYNC,
  OFFICIAL_RULES_SOURCE_URL,
} from "./official-rules-card-data.ts";
import { TCGPLAYER_CARD_POOL } from "./tcgplayer-card-data.ts";

function mergeCards(...groups: readonly GundamCard[][]) {
  const merged = new Map<string, GundamCard>();
  groups.flat().forEach((card) => {
    if (!merged.has(card.number)) merged.set(card.number, card);
  });
  return [...merged.values()];
}

export const CARD_POOL = mergeCards(
  OFFICIAL_CARD_POOL,
  CURATED_CARD_POOL,
  TCGPLAYER_CARD_POOL,
);
export const CARD_BY_NUMBER = new Map(CARD_POOL.map((card) => [card.number, card]));
export const CURATED_CARD_NUMBERS = new Set(
  CURATED_CARD_POOL.map((card) => card.number),
);
export const OFFICIAL_CARD_NUMBERS = new Set(
  OFFICIAL_CARD_POOL.map((card) => card.number),
);
export const TCGPLAYER_CARD_NUMBERS = new Set(
  TCGPLAYER_CARD_POOL.map((card) => card.number),
);
export const CARD_ARTS_BY_NUMBER = CARD_ART_VARIANTS as Record<
  string,
  readonly CardArtVariant[]
>;
export const OFFICIAL_CARD_ARTS_BY_NUMBER = OFFICIAL_CARD_ART_VARIANTS;

export {
  CURATED_CARD_POOL,
  OFFICIAL_CARD_POOL,
  OFFICIAL_RULES_LAST_SYNC,
  OFFICIAL_RULES_SOURCE_URL,
  TCGPLAYER_CARD_POOL,
};
