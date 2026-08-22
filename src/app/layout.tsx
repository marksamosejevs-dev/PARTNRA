import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const siteUrl = "https://partnra.ai";
const title = "PARTNRA — Your AI Affiliate Manager";
const description =
  "Find creators, publishers and affiliates already promoting your competitors. PARTNRA helps e-commerce brands discover, qualify and recruit their next partners.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  keywords: [
    "AI affiliate manager",
    "affiliate recruitment software",
    "find affiliates",
    "affiliate discovery",
    "competitor affiliates",
    "DTC affiliate marketing",
    "Shopify affiliate recruitment",
    "supplement affiliate marketing",
  ],
  openGraph: {
    title: "PARTNRA — AI Affiliate Recruitment",
    description:
      "Find the affiliates already selling your competitors. Then recruit them for your brand.",
    url: siteUrl,
    siteName: "PARTNRA",
    images: [{ url: "/brand/partnra-icon-1024x1024.png", width: 1024, height: 1024 }],
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PARTNRA — AI Affiliate Recruitment",
    description:
      "Find the affiliates already selling your competitors. Then recruit them for your brand.",
    images: ["/brand/partnra-icon-1024x1024.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/partnra-icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/partnra-icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/partnra-icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/partnra-icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/partnra-icon-180x180.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  applicationName: "PARTNRA",
  authors: [{ name: "PARTNRA" }],
};

export const viewport = {
  themeColor: "#f4f2ec",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
