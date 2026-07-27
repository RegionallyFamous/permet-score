import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CARD_ARTS_BY_NUMBER,
  OFFICIAL_CARD_ARTS_BY_NUMBER,
} from "../../card-pool";
import type { GundamCard } from "../../card-data";
import { TCGPLAYER_CARD_PRINTS } from "../../tcgplayer-data";
import {
  cardForSlug,
  cardSlug,
  cardsForSetSlug,
  groupedCards,
  setSlug,
} from "../card-reference";

const siteUrl = "https://permetlink.com";

type SetPageProps = {
  params: Promise<{
    set: string;
  }>;
};

export function generateStaticParams() {
  return [
    ...groupedCards().map(([set]) => ({
      set: setSlug(set),
    })),
    ...groupedCards().flatMap(([, cards]) =>
      cards.map((card) => ({
        set: cardSlug(card),
      })),
    ),
  ];
}

export async function generateMetadata({
  params,
}: SetPageProps): Promise<Metadata> {
  const { set } = await params;
  const card = cardForSlug(set);
  if (card) return cardMetadata(card);

  const group = cardsForSetSlug(set);
  if (!group) return {};

  const title = `${group.set} Gundam Card Game Cards`;
  const description = `Browse ${group.cards.length} ${group.set} Gundam Card Game cards in Permet Link, including numbers, names, colors, types, costs, AP, HP, traits, and rules text.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/cards/${setSlug(group.set)}`,
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/cards/${setSlug(group.set)}`,
      siteName: "Permet Link",
      type: "website",
      images: [
        {
          url: "/permet-link-logo.png",
          width: 1983,
          height: 793,
          alt: "Permet Link",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/permet-link-logo.png"],
    },
  };
}

export default async function CardSetPage({ params }: SetPageProps) {
  const { set } = await params;
  const card = cardForSlug(set);
  if (card) return <CardDetailPage card={card} />;

  const group = cardsForSetSlug(set);
  if (!group) notFound();

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${group.set} Gundam Card Game Cards`,
    url: `${siteUrl}/cards/${setSlug(group.set)}`,
    isPartOf: {
      "@type": "CollectionPage",
      name: "Gundam Card Game Card Library",
      url: `${siteUrl}/cards`,
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: group.cards.length,
      itemListElement: group.cards.map((card, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${card.number} ${card.name}`,
      })),
    },
  };

  return (
    <main className="min-h-screen bg-[#05060a] text-[#f7f7f2]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <nav
          aria-label="Permet Link reference"
          className="flex flex-wrap items-center gap-3 font-display text-sm font-black uppercase text-[#d9ecff]"
        >
          <Link href="/" className="text-[#f6c542] hover:text-[#fff2bd]">
            Open Builder
          </Link>
          <Link href="/cards" className="hover:text-[#8bdcff]">
            Card Library
          </Link>
          <Link href="/guide" className="hover:text-[#8bdcff]">
            Guide
          </Link>
        </nav>

        <header className="grid gap-4 border-b border-[#8bdcff]/20 pb-8">
          <p className="font-display text-sm font-black uppercase tracking-[0.18em] text-[#8bdcff]">
            Set Card Reference
          </p>
          <h1 className="font-display text-4xl font-black uppercase leading-none text-[#f7f7f2] sm:text-6xl">
            {group.set} Gundam Card Game cards
          </h1>
          <p className="max-w-4xl text-xl font-semibold leading-8 text-[#d9ecff]/84">
            {group.cards.length} cards from {group.set}, including card numbers,
            names, rules text, colors, types, costs, AP, HP, traits, sources, and
            set names.
          </p>
        </header>

        <div className="overflow-x-auto rounded-sm border border-[#8bdcff]/18 bg-[#080d13]">
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <thead className="bg-[#111923] font-display text-xs font-black uppercase text-[#8bdcff]">
              <tr>
                <th className="px-3 py-3">Number</th>
                <th className="px-3 py-3">Card</th>
                <th className="px-3 py-3">Color</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Lv</th>
                <th className="px-3 py-3">Cost</th>
                <th className="px-3 py-3">AP</th>
                <th className="px-3 py-3">HP</th>
                <th className="px-3 py-3">Trait / Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#a7b5c9]/12">
              {group.cards.map((card) => (
                <tr key={card.number} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3 font-display text-base font-black text-[#f7f7f2]">
                    <Link
                      href={`/cards/${cardSlug(card)}`}
                      className="rounded-sm bg-[#f7f7f2] px-2 py-1 text-black hover:bg-[#fff2bd]"
                    >
                      {card.number}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/cards/${cardSlug(card)}`}
                      className="font-display text-lg font-black uppercase text-[#f7f7f2] hover:text-[#fff2bd]"
                    >
                      {card.name}
                    </Link>
                    {card.text && card.text !== "-" && (
                      <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-[#d9ecff]/70">
                        {card.text}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.color}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.type}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.level}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.cost}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.ap}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-base font-bold text-[#d9ecff]/78">
                    {card.hp}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold leading-6 text-[#d9ecff]/70">
                    {[card.trait, card.source, card.set].filter(Boolean).join(" - ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function cardMetadata(card: GundamCard): Metadata {
  const path = `/cards/${cardSlug(card)}`;
  const title = `${card.number} ${card.name} Gundam Card Game Card`;
  const description = `${card.number} ${card.name} is a ${card.color} ${card.type} from ${card.set}. View rules text, traits, stats, printings, and TCGplayer links in Permet Link.`;
  const image = primaryCardImage(card);

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}${path}`,
      siteName: "Permet Link",
      type: "article",
      images: [
        {
          url: image,
          width: 600,
          height: 838,
          alt: `${card.number} ${card.name}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

function primaryCardImage(card: GundamCard) {
  return (
    CARD_ARTS_BY_NUMBER[card.number]?.[0]?.image ??
    OFFICIAL_CARD_ARTS_BY_NUMBER[card.number]?.[0]?.image ??
    "/permet-link-logo.png"
  );
}

function tcgplayerSearchUrl(card: GundamCard, officialId = card.number) {
  const params = new URLSearchParams({
    page: "1",
    productLineName: "gundam-card-game",
    q: `${officialId} ${card.name} Gundam Card Game`,
    view: "grid",
  });

  return `https://www.tcgplayer.com/search/all/product?${params.toString()}`;
}

function tcgplayerUrl(card: GundamCard, variantId: string, officialId: string) {
  const print = (TCGPLAYER_CARD_PRINTS[card.number] ?? []).find(
    (candidate) =>
      candidate.variantId === variantId || candidate.officialId === officialId,
  );
  return print?.url ?? tcgplayerSearchUrl(card, officialId);
}

function cardPrints(card: GundamCard) {
  const variants = [
    ...(CARD_ARTS_BY_NUMBER[card.number] ?? []),
    ...(OFFICIAL_CARD_ARTS_BY_NUMBER[card.number] ?? []),
  ];
  const seen = new Set<string>();

  const merged = variants.filter((variant) => {
    const key = `${variant.id}:${variant.officialId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (merged.length) return merged;

  return [
    {
      id: "standard",
      label: "Standard",
      image: primaryCardImage(card),
      tier: 0,
      officialId: card.number,
    },
  ];
}

function CardDetailPage({ card }: { card: GundamCard }) {
  const prints = cardPrints(card);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: `${card.number} ${card.name}`,
    url: `${siteUrl}/cards/${cardSlug(card)}`,
    isPartOf: {
      "@type": "CollectionPage",
      name: "Gundam Card Game Card Library",
      url: `${siteUrl}/cards`,
    },
    about: ["Gundam Card Game", card.type, card.color, card.set].filter(Boolean),
    text: card.text,
    image: primaryCardImage(card),
  };

  return (
    <main className="min-h-screen bg-[#05060a] text-[#f7f7f2]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <nav
          aria-label="Permet Link reference"
          className="flex flex-wrap items-center gap-3 font-display text-sm font-black uppercase text-[#d9ecff]"
        >
          <Link href="/" className="text-[#f6c542] hover:text-[#fff2bd]">
            Open Builder
          </Link>
          <Link href="/cards" className="hover:text-[#8bdcff]">
            Card Library
          </Link>
          <Link href={`/cards/${setSlug(card.number.split("-")[0] ?? "")}`} className="hover:text-[#8bdcff]">
            {card.number.split("-")[0]}
          </Link>
        </nav>

        <section className="grid gap-6 lg:grid-cols-[minmax(260px,0.55fr)_minmax(0,1fr)] lg:items-start">
          <div className="rounded-sm border border-[#8bdcff]/24 bg-black/58 p-3 shadow-2xl shadow-black/35">
            <Image
              src={primaryCardImage(card)}
              alt={`${card.number} ${card.name} card image`}
              width={600}
              height={838}
              sizes="(min-width: 1024px) 32vw, 92vw"
              className="mx-auto aspect-[5/7] max-h-[72vh] w-full object-contain object-top"
              priority
            />
          </div>

          <div className="grid gap-5">
            <header className="grid gap-3 border-b border-[#8bdcff]/20 pb-5">
              <div className="flex flex-wrap gap-2 font-display text-sm font-black uppercase">
                <span className="rounded-sm bg-[#f7f7f2] px-2 py-1 text-black">
                  {card.number}
                </span>
                <span className="rounded-sm border border-[#8bdcff]/26 bg-[#1167d8]/12 px-2 py-1 text-[#d9ecff]">
                  {card.color}
                </span>
                <span className="rounded-sm border border-[#f7f7f2]/14 bg-[#f7f7f2]/9 px-2 py-1 text-[#f7f7f2]">
                  {card.type}
                </span>
                <span className="rounded-sm border border-[#f6c542]/24 bg-[#f6c542]/10 px-2 py-1 text-[#fff2bd]">
                  {prints.length} print{prints.length === 1 ? "" : "s"}
                </span>
              </div>
              <h1 className="font-display text-4xl font-black uppercase leading-none text-[#f7f7f2] sm:text-6xl">
                {card.name}
              </h1>
              <p className="text-xl font-semibold leading-8 text-[#d9ecff]/84">
                {card.set} · {card.source}
              </p>
            </header>

            <div className="grid grid-cols-4 gap-2">
              <CardStat label="Lv" value={card.level} />
              <CardStat label="Cost" value={card.cost} />
              <CardStat label="AP" value={card.ap} />
              <CardStat label="HP" value={card.hp} />
            </div>

            <section className="rounded-sm border border-[#a7b5c9]/16 bg-[#101720]/72 p-4">
              <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">
                Rules Text
              </h2>
              <p className="mt-3 text-lg font-semibold leading-8 text-[#f7f7f2]/86">
                {card.text && card.text !== "-" ? card.text : "No rules text listed."}
              </p>
            </section>

            <section className="grid gap-2 rounded-sm border border-[#a7b5c9]/16 bg-black/24 p-4 text-base font-bold leading-7 text-[#d9ecff]/74">
              <span>Trait: {card.trait || "-"}</span>
              <span>Link: {card.link || "-"}</span>
              <span>Rarity: {card.rarity || "-"}</span>
            </section>

            <section className="grid gap-3">
              <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">
                Printings
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {prints.map((print) => (
                  <a
                    key={`${print.id}-${print.officialId}`}
                    href={tcgplayerUrl(card, print.id, print.officialId)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="group grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-sm border border-[#8bdcff]/18 bg-[#080d13] p-2 hover:border-[#f6c542]/42"
                  >
                    <Image
                      src={print.image}
                      alt=""
                      width={180}
                      height={252}
                      sizes="4.5rem"
                      className="aspect-[5/7] w-full rounded-sm bg-black object-contain object-top"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg font-black uppercase text-[#f7f7f2] group-hover:text-[#fff2bd]">
                        {print.officialId.replaceAll("_", " ")}
                      </span>
                      <span className="mt-1 block text-sm font-bold text-[#d9ecff]/65">
                        {print.label}
                      </span>
                      <span className="mt-2 inline-flex rounded-sm border border-[#f6c542]/28 bg-[#f6c542]/10 px-2 py-1 font-display text-sm font-black uppercase text-[#fff2bd]">
                        TCGplayer
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-[#a7b5c9]/18 bg-[#f7f7f2]/[0.055] p-3 text-center">
      <div className="font-display text-sm font-black uppercase text-[#f7f7f2]/58">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-black text-[#f7f7f2]">
        {value}
      </div>
    </div>
  );
}
