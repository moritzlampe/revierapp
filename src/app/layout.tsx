import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "RevierApp — Digitale Revierverwaltung",
  description:
    "Revierkarte, Streckenbuch, Jagderlaubnisse und Drückjagd-Planung für Jäger",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="h-full overflow-hidden font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
