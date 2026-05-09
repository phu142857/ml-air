import "./globals.css";
import { PropsWithChildren } from "react";
import Script from "next/script";
import { AppProviders } from "./providers";

export const metadata = {
  title: "MLAir Control Plane"
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <Script src="/mlair-runtime-config.js" strategy="beforeInteractive" />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
