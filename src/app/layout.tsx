import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RootLayoutClient } from "@/components/layout/root-layout-client";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "宜蘭TFCF志工平台",
  description: "宜蘭家扶基金會志工管理與報名平台",
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
      <body className={`${inter.className} font-sans antialiased bg-white text-gray-900`}>
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
