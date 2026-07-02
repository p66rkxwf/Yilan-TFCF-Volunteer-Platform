import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import { RootLayoutClient } from "@/components/layout/root-layout-client";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "宜蘭家扶中心志工平台",
  description: "宜蘭家扶中心志工管理與報名平台",
  icons: {
    icon: "/favicon.ico",
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
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
