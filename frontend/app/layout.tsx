import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { PropsWithChildren } from "react";

export const metadata = {
  title: "ML-AIR Control Plane"
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
