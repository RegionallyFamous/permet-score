import type {
  Metadata,
  Viewport,
} from "next";
import { Rajdhani } from "next/font/google";
import "./globals.css";

const rajdhani = Rajdhani({
  variable: "--font-gundam-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://permetlink.com"),
  applicationName: "Permet Link",
  title: "Permet Link",
  description: "A fast local-first Gundam Card Game deck builder and alt-art planner.",
  keywords: [
    "Gundam Card Game",
    "Gundam deck builder",
    "Gundam TCG",
    "deck list",
    "alt art",
    "TCGplayer",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Permet Link",
    description: "A fast local-first Gundam Card Game deck builder and alt-art planner.",
    url: "https://permetlink.com",
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
    title: "Permet Link",
    description: "A fast local-first Gundam Card Game deck builder and alt-art planner.",
    images: ["/permet-link-logo.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Permet Link",
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
        {children}
      </body>
    </html>
  );
}
