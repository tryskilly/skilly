import "./globals.css";
import type { ReactNode } from "react";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { AnalyticsScripts } from "./AnalyticsScripts";

// Skilly v2 typography (spec §1): DM Sans for UI/body, JetBrains Mono for
// keys/code/tenant IDs. Wired through next/font so fonts are self-hosted,
// zero layout shift, and exposed as CSS vars consumed by @theme in globals.css.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata = {
  title: "Skilly — Web Dashboard",
  description: "Install, teach, and monitor your Skilly companion across web, mobile, and desktop.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-gray-950 text-gray-200 font-sans antialiased">
        {children}
        <AnalyticsScripts />
      </body>
    </html>
  );
}
