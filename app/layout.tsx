import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Work_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";

const workSans = Work_Sans({ variable: "--font-work-sans", subsets: ["latin"] });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["600", "800", "900"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Kivov Invoices",
  description: "Local invoicing: create an invoice and email it with e-Transfer instructions and a card payment link.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${workSans.variable} ${archivo.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
