import type {
  Metadata,
  Viewport,
} from "next";
import { Rajdhani } from "next/font/google";
import "./globals.css";

const siteUrl = "https://permetlink.com";
const siteName = "Permet Link";
const siteDescription =
  "Build Gundam Card Game decks, tune alt-art printings, track collection ownership, draw opening hands, and share decklists.";
const socialImage = "/permet-link-logo.png";
const socialImageUrl = `${siteUrl}${socialImage}`;

const rajdhani = Rajdhani({
  variable: "--font-gundam-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: `${siteName} | Gundam Card Game Deck Builder`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [
    "Gundam Card Game",
    "Gundam deck builder",
    "Gundam TCG",
    "Gundam Card Game decklist",
    "deck list",
    "deck builder",
    "alt art",
    "opening hand simulator",
    "TCGplayer",
  ],
  category: "games",
  creator: siteName,
  publisher: siteName,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: `${siteName} | Gundam Card Game Deck Builder`,
    description: siteDescription,
    url: siteUrl,
    siteName,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: socialImage,
        width: 1983,
        height: 793,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | Gundam Card Game Deck Builder`,
    description: siteDescription,
    images: [socialImage],
  },
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ],
  },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteName,
    url: siteUrl,
    description: siteDescription,
    applicationCategory: "GameApplication",
    operatingSystem: "Any",
    inLanguage: "en-US",
    image: socialImageUrl,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Gundam Card Game deck building",
      "Alt-art print planning",
      "Collection ownership tracking",
      "Shareable decklist URLs",
      "Decklist image exports",
      "TCGplayer print links",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    description: siteDescription,
    inLanguage: "en-US",
    publisher: {
      "@type": "Organization",
      name: siteName,
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: socialImageUrl,
        width: 1983,
        height: 793,
      },
    },
  },
];

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#05060a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${rajdhani.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
