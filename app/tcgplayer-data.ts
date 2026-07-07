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

export const TCGPLAYER_LAST_SYNC: string | null = null;
export const TCGPLAYER_CATEGORY_ID: number | null = null;
export const TCGPLAYER_CARD_PRINTS: Record<string, readonly TcgplayerPrint[]> = {};
