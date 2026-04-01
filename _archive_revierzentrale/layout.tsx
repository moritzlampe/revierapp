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
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full overflow-hidden font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
