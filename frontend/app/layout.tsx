import type { Metadata, Viewport } from "next";
import { Inter, Outfit, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { AppProviders } from "./providers";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ML-Air Hub | MLOps Control Plane",
  description: "Enterprise MLOps Control Plane & Governance Surface",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="bg-background">
      <body
        className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <Script src="/mlair-runtime-config.js" strategy="beforeInteractive" />
        <AppProviders>
          {children}
          <Toaster />
        </AppProviders>
      </body>
    </html>
  );
}
