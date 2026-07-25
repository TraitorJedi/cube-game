import "~/styles/globals.css";

import { Analytics } from "@vercel/analytics/next";
import { type Metadata, type Viewport } from "next";
import { Geist } from "next/font/google";

export const metadata: Metadata = {
  title: "Cubesque-Ape",
  description: "An isometric Rubik's Cube puzzle world.",
  icons: [{ rel: "icon", url: "data:," }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#090a0d",
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}