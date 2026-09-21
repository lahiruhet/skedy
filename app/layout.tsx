import type { Metadata } from "next";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
