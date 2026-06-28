import type { Metadata } from "next";
import "./globals.css";
import { ReactScan } from "@/components/ReactScan";
`r`n
export const metadata: Metadata = {
  title: "シフト管理システム",
  description: "従業員と管理者のためのシフト管理アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <ReactScan />
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
