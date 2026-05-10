import "./globals.css";
import { PropsWithChildren } from "react";
import Script from "next/script";
import { Inter } from "next/font/google";
import { AppProviders } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata = {
  title: "MLAir Control Plane"
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Script src="/mlair-runtime-config.js" strategy="beforeInteractive" />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
