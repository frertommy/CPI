import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CPI Perp Oracle — Variant B",
  description: "Real-time composite inflation oracle blending BLS CPI data with Polymarket Fed decision probabilities",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body className="antialiased bg-[#0a0a0f] text-gray-200">
        {children}
      </body>
    </html>
  );
}
