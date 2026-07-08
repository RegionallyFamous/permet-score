import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = "https://permetlink.com";
const title = "Gundam Card Game Deck Builder Guide";
const description =
  "Learn how Permet Link helps players build Gundam Card Game decks, choose alt-art printings, track collection ownership, and share decklists.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/guide",
  },
  openGraph: {
    title,
    description,
    url: `${siteUrl}/guide`,
    siteName: "Permet Link",
    type: "article",
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

const faq = [
  {
    question: "What is Permet Link?",
    answer:
      "Permet Link is an unofficial Gundam Card Game deck builder focused on fast card search, deck legality checks, alt-art print planning, local collection tracking, and clean share URLs.",
  },
  {
    question: "Can I share a Gundam Card Game decklist?",
    answer:
      "Yes. The Share button saves the decklist and selected printings through the backend, then gives you a compact URL that can be opened by other players.",
  },
  {
    question: "Does Permet Link track my collection publicly?",
    answer:
      "No. Collection ownership is stored locally in your browser. Shared deck URLs include deck cards and selected printings, but not private owned-card quantities.",
  },
  {
    question: "Is Permet Link official?",
    answer:
      "No. Permet Link is a fan-made utility. Gundam and Gundam Card Game names, card images, and related marks belong to their respective owners.",
  },
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Permet Link",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: title,
        item: `${siteUrl}/guide`,
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  },
];

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-[#05060a] text-[#f7f7f2]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-8 sm:py-12">
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
          <Link href="/llms.txt" className="hover:text-[#8bdcff]">
            AI Index
          </Link>
        </nav>

        <header className="grid gap-4 border-b border-[#8bdcff]/20 pb-8">
          <p className="font-display text-sm font-black uppercase tracking-[0.18em] text-[#8bdcff]">
            Permet Link Reference
          </p>
          <h1 className="max-w-4xl font-display text-4xl font-black uppercase leading-none text-[#f7f7f2] sm:text-6xl">
            Gundam Card Game deck builder guide
          </h1>
          <p className="max-w-3xl text-xl font-semibold leading-8 text-[#d9ecff]/84">
            Permet Link is built for players who want a fast way to search the
            Gundam Card Game card pool, assemble legal decks, choose alternate
            printings, and share a readable decklist URL.
          </p>
        </header>

        <section className="grid gap-5 md:grid-cols-2">
          {[
            [
              "Build decks quickly",
              "Search by card name, card number, rules text, color, type, set, and card data status. Add cards to the main deck or resource deck with quantity controls tuned for deck building.",
            ],
            [
              "Tune alternate printings",
              "Choose standard and parallel printings, upgrade or downgrade selected art, and keep those print choices with the decklist.",
            ],
            [
              "Track collection ownership",
              "Store owned print quantities locally in your browser so you can compare what a deck needs against the cards you already have.",
            ],
            [
              "Share compact URLs",
              "Generate a short backend-backed deck URL that other players can open, inspect, clone, and use as a starting point.",
            ],
          ].map(([heading, copy]) => (
            <article
              key={heading}
              className="rounded-sm border border-[#8bdcff]/18 bg-[#101720]/80 p-5 shadow-xl shadow-black/25"
            >
              <h2 className="font-display text-2xl font-black uppercase text-[#fff2bd]">
                {heading}
              </h2>
              <p className="mt-3 text-lg font-semibold leading-7 text-[#d9ecff]/78">
                {copy}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 border-t border-[#8bdcff]/20 pt-8">
          <h2 className="font-display text-3xl font-black uppercase text-[#f7f7f2]">
            Data and search visibility
          </h2>
          <p className="max-w-4xl text-lg font-semibold leading-8 text-[#d9ecff]/78">
            The app uses generated local data files for the official card pool,
            deck validation fields, alternate art variants, and TCGplayer print
            links. This keeps the builder fast on Vercel while giving search
            engines and AI tools stable crawlable references through this guide,
            the card library, the sitemap, and the AI index.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/cards"
              className="inline-flex h-11 items-center rounded-sm border border-[#8bdcff]/34 bg-[#1167d8]/16 px-4 font-display text-base font-black uppercase text-[#d9ecff] hover:bg-[#1167d8]/24"
            >
              Browse Card Library
            </Link>
            <Link
              href="/"
              className="inline-flex h-11 items-center rounded-sm border border-[#f6c542]/42 bg-[#f6c542]/14 px-4 font-display text-base font-black uppercase text-[#fff2bd] hover:bg-[#f6c542]/20"
            >
              Open Builder
            </Link>
          </div>
        </section>

        <section className="grid gap-4 border-t border-[#8bdcff]/20 pt-8">
          <h2 className="font-display text-3xl font-black uppercase text-[#f7f7f2]">
            Common questions
          </h2>
          <div className="grid gap-3">
            {faq.map((item) => (
              <article
                key={item.question}
                className="rounded-sm border border-[#a7b5c9]/18 bg-black/28 p-4"
              >
                <h3 className="font-display text-xl font-black uppercase text-[#fff2bd]">
                  {item.question}
                </h3>
                <p className="mt-2 text-base font-semibold leading-7 text-[#d9ecff]/76">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
