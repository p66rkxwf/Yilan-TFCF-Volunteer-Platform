import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import { RootLayoutClient } from "@/components/layout/root-layout-client";
import { SkipLink } from "@/components/ui/skip-link";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "宜蘭家扶中心",
  description: "宜蘭家扶中心活動報名與管理平台",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <head>
        <link
          rel="preload"
          href="/fonts/material-symbols-outlined.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${publicSans.className} flex min-h-screen flex-col bg-background-light text-slate-900 antialiased`}
      >
        <SkipLink />
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
