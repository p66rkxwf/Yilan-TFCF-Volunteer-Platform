import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import { RootLayoutClient } from "@/components/layout/root-layout-client";

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "宜蘭TFCF志工平台",
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
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${publicSans.className} antialiased bg-[#f6f7f8] text-slate-900 min-h-screen flex flex-col`}
      >
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
