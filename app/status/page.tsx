import type { Metadata } from "next";
import Link from "next/link";
import { CARD_POOL } from "../card-pool";
import {
  OFFICIAL_RULES_LAST_SYNC,
  OFFICIAL_RULES_SOURCE_URL,
} from "../official-rules-card-data";
import { TCGPLAYER_CARD_PRINTS } from "../tcgplayer-data";
import { TCGPLAYER_LAST_SYNC } from "../tcgplayer-meta";

const siteUrl = "https://permetlink.com";
const title = "Permet Link Status";
const description =
  "Card data, market sync, deployment, and launch-readiness status for Permet Link.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/status",
  },
  openGraph: {
    title,
    description,
    url: `${siteUrl}/status`,
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

const mainTypes = new Set(["UNIT", "PILOT", "COMMAND", "BASE"]);

function hasValue(value: string) {
  return Boolean(value && value.trim() !== "-");
}

function deckReadyCount() {
  return CARD_POOL.filter((card) => {
    if (card.type === "RESOURCE") return true;
    if (!mainTypes.has(card.type)) return false;
    return hasValue(card.color) && hasValue(card.level) && Number.isFinite(Number(card.cost));
  }).length;
}

function printCount() {
  return Object.values(TCGPLAYER_CARD_PRINTS).reduce(
    (sum, prints) => sum + prints.length,
    0,
  );
}

function cardsWithPrints() {
  return CARD_POOL.filter((card) => (TCGPLAYER_CARD_PRINTS[card.number] ?? []).length)
    .length;
}

function formatSyncDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(new Date(value));
}

function setCounts() {
  const groups = new Map<string, number>();
  CARD_POOL.forEach((card) => {
    const set = card.number.split("-")[0] ?? "Other";
    groups.set(set, (groups.get(set) ?? 0) + 1);
  });
  return [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

export default function StatusPage() {
  const deckReady = deckReadyCount();
  const marketPrints = printCount();
  const marketCards = cardsWithPrints();
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url: `${siteUrl}/status`,
    description,
    dateModified: TCGPLAYER_LAST_SYNC ?? OFFICIAL_RULES_LAST_SYNC,
  };

  return (
    <main className="min-h-screen bg-[#05060a] text-[#f7f7f2]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
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
            Launch Telemetry
          </p>
          <h1 className="font-display text-4xl font-black uppercase leading-none text-[#f7f7f2] sm:text-6xl">
            Permet Link status
          </h1>
          <p className="max-w-4xl text-xl font-semibold leading-8 text-[#d9ecff]/84">
            A quiet confidence page for card coverage, market sync freshness, and
            production deployment state.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusMetric label="Indexed Cards" value={`${CARD_POOL.length}`} tone="blue" />
          <StatusMetric label="Deck Ready" value={`${deckReady}`} tone="green" />
          <StatusMetric label="Market Prints" value={`${marketPrints}`} tone="gold" />
          <StatusMetric label="Build Commit" value={commit} tone="red" />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-sm border border-[#8bdcff]/18 bg-[#101720]/80 p-4">
            <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">
              Data Sync
            </h2>
            <dl className="mt-4 grid gap-3 text-base font-bold text-[#d9ecff]/76">
              <StatusRow label="Official rules" value={formatSyncDate(OFFICIAL_RULES_LAST_SYNC)} />
              <StatusRow label="TCGplayer bridge" value={formatSyncDate(TCGPLAYER_LAST_SYNC)} />
              <StatusRow label="Cards with market prints" value={`${marketCards}/${CARD_POOL.length}`} />
              <StatusRow label="Official source" value={OFFICIAL_RULES_SOURCE_URL} />
            </dl>
          </div>

          <div className="rounded-sm border border-[#8bdcff]/18 bg-[#101720]/80 p-4">
            <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">
              Automation
            </h2>
            <div className="mt-4 grid gap-3 text-base font-bold leading-7 text-[#d9ecff]/76">
              <p>Card data sync runs daily and can also be triggered manually.</p>
              <p>Generated data must pass strict audit, lint, and production build before it is committed.</p>
              <p>Production deploys are attached to GitHub main through Vercel.</p>
            </div>
          </div>
        </section>

        <section className="rounded-sm border border-[#8bdcff]/18 bg-[#080d13] p-4">
          <h2 className="font-display text-2xl font-black uppercase text-[#f7f7f2]">
            Set Coverage
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {setCounts().map(([set, count]) => (
              <Link
                key={set}
                href={`/cards/${set.toLowerCase()}`}
                className="rounded-sm border border-[#a7b5c9]/16 bg-black/24 p-3 hover:border-[#f6c542]/36"
              >
                <span className="font-display text-2xl font-black uppercase text-[#fff2bd]">
                  {set}
                </span>
                <span className="ml-2 text-sm font-black uppercase text-[#d9ecff]/62">
                  {count} cards
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "gold" | "red";
}) {
  const toneClass = {
    blue: "border-[#2e8cff]/35 bg-[#1167d8]/14 text-[#d9ecff]",
    green: "border-[#28d17c]/35 bg-[#28d17c]/12 text-[#d9ffe9]",
    gold: "border-[#f6c542]/35 bg-[#f6c542]/12 text-[#fff2bd]",
    red: "border-[#e31b23]/35 bg-[#e31b23]/12 text-[#ffe3e3]",
  }[tone];

  return (
    <div className={`rounded-sm border p-4 ${toneClass}`}>
      <div className="font-display text-sm font-black uppercase opacity-70">{label}</div>
      <div className="mt-2 font-display text-4xl font-black uppercase leading-none">
        {value}
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-sm border border-[#a7b5c9]/14 bg-black/24 p-3">
      <dt className="font-display text-sm font-black uppercase text-[#8bdcff]">
        {label}
      </dt>
      <dd className="break-words text-[#f7f7f2]/82">{value}</dd>
    </div>
  );
}
