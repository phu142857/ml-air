import "./globals.css";
import { PropsWithChildren } from "react";
import { AppProviders } from "./providers";

export const metadata = {
  title: "MLAir Control Plane"
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
