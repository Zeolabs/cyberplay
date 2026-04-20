import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const firaCode = localFont({
  src: [
    {
      path: "../../public/fonts/FiraCode-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/FiraCode-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/FiraCode-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/FiraCode-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-fira-code",
  display: "swap",
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
        className={`${geistSans.variable} ${firaCode.variable} antialiased bg-[#050508] text-[#e0e0e0]`}
        style={{ fontFamily: 'var(--font-fira-code), monospace' }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
