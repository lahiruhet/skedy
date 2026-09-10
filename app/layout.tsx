import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://skedy-lahiru.lahiru-ops.chatgpt.site"),
  title: "Skedy — Your watchlist",
  description: "Every Spurs game. Every lights-out. Your personal football, F1 and esports schedule, in Sri Lanka time.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Skedy — Your watchlist",
    description: "The games you care about. All in one place.",
    url: "https://skedy-lahiru.lahiru-ops.chatgpt.site",
    type: "website",
    images: [{ url: "https://skedy-lahiru.lahiru-ops.chatgpt.site/og.png", width: 1734, height: 907, alt: "Skedy. Your watchlist. Football, Formula 1 and esports." }],
  },
  twitter: { card: "summary_large_image", title: "Skedy — Your watchlist", images: ["https://skedy-lahiru.lahiru-ops.chatgpt.site/og.png"] },
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
