import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CYBERPLAY - Game Portal | HTML5, Unity WebGL & Flash Games",
  description: "Play thousands of free online games. HTML5, Unity WebGL, and Flash games. No downloads required. Just play instantly.",
  keywords: ["games", "html5 games", "unity webgl", "flash games", "online games", "free games", "browser games"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#050508] text-[#e0e0e0]`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
