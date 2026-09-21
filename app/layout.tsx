import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-display", display: "swap" });

// Vercel provides the production hostname at build and run time.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Skedy — Your watchlist",
  description: "Every Spurs game. Every lights-out. Your personal football, F1 and esports schedule, in Sri Lanka time.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Skedy — Your watchlist",
    description: "The games you care about. All in one place.",
    url: "/",
    type: "website",
    images: [{ url: "/og.png", width: 1734, height: 907, alt: "Skedy. Your watchlist. Football, Formula 1 and esports." }],
  },
  twitter: { card: "summary_large_image", title: "Skedy — Your watchlist", images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#f4efe6" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}
