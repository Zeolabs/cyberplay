import type { Metadata } from "next";
import { Geist, Fira_Code } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-fira-code",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CYBERPLAY - Game Portal | HTML5, Unity WebGL & Flash Games",
  description: "Play thousands of free online games. HTML5, Unity WebGL, and Flash games. No downloads required. Just play instantly.",
  keywords: ["games", "html5 games", "unity webgl", "flash games", "online games", "free games", "browser games"],
  icons: {
    icon: "/dragon.svg",
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
        className={`${geistSans.variable} ${firaCode.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: 'var(--font-fira-code), monospace' }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
