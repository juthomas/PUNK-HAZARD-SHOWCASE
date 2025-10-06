import type { Metadata } from "next";
import { Geist, Geist_Mono, Baloo_2 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["700", "800"],
});

export const metadata: Metadata = {
  title: "PUNKHAZARD — Ingénierie électronique, PCB, embarqué & robots",
  description:
    "Conception de PCB, programmation embarquée, électronique et robots. Du prototype à l’industrialisation.",
  keywords: [
    "PUNKHAZARD",
    "PCB",
    "électronique",
    "programmation embarquée",
    "robots",
    "ingénierie",
  ],
  openGraph: {
    title: "PUNKHAZARD",
    description:
      "Conception de PCB, programmation embarquée, électronique et robots.",
    url: "https://punkhazard.fr",
    siteName: "PUNKHAZARD",
    locale: "fr_FR",
  },
  metadataBase: new URL("https://punkhazard.fr"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link
          rel="preload"
          href="/fonts/balloon/BL______.TTF"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${baloo.variable}`}>
        {children}
      </body>
    </html>
  );
}
