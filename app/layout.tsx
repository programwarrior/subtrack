import type { Metadata, Viewport } from "next";
import { basePath } from "@/lib/base-path";
import "./globals.css";

export const metadata: Metadata = {
  title: "SubTrack — subscriptions, simplified",
  description: "A calm place to track recurring payments and renewals.",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "SubTrack", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f7f7f4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
