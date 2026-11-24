import type { Metadata, Viewport } from "next";
import "./globals.css";
import { config } from "@/lib/config";
import { Toaster as Sonner } from "@/components/ui/sonner";

const base = config.basePath;

export const metadata: Metadata = {
  title: "Sapludu সাপলুডু — Snakes & Ladders online · Play. Climb. Win.",
  description:
    "Play Snakes & Ladders (সাপলুডু) online with 2–4 friends — real-time multiplayer, Google sign-in, leaderboards, and installable on your phone.",
  applicationName: "Sapludu",
  keywords: ["Sapludu", "সাপলুডু", "Snakes and Ladders", "multiplayer board game", "Bangladesh"],
  authors: [{ name: "Sapludu Team" }],
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${base}/icons/favicon-32.png`, sizes: "32x32", type: "image/png" },
      { url: `${base}/icons/icon.svg`, type: "image/svg+xml" },
    ],
    apple: [{ url: `${base}/icons/apple-touch-icon.png`, sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Sapludu", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Sapludu সাপলুডু",
    description: "Play. Climb. Win. — Snakes & Ladders online with friends.",
    type: "website",
  },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#059669",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground"
      >
        {children}
        <Sonner position="top-center" richColors closeButton offset={{ top: 96, left: 12, right: 12 }} mobileOffset={{ top: 96, left: 12, right: 12 }} />
      </body>
    </html>
  );
}
