import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Skilly — Web Dashboard",
  description: "Manage your Skilly web companion: keys, skill, and usage.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
